import {
	type AgentCauseNodePayload,
	type AgentCauseUpdatePayload,
	type AgentFactPayload,
	type AgentHiraFollowupPayload,
	type AgentIncidentFieldUpdatePayload,
	AgentOperationKind,
	type AgentTimelineEventPayload,
	INCIDENT_COACH_UPDATABLE_FIELDS,
} from "../agent/types";
import {
	INCIDENT_ACTUAL_INJURY_OUTCOME_CODES,
	INCIDENT_TYPE_CODES,
	parseIncidentType,
} from "./classification";
import {
	EVENT_TYPE_CODES,
	HAZARD_CATEGORY_CODES,
	LIKELIHOOD_CODES,
	SEVERITY_CODES,
} from "../taxonomy/schema";

type FlueRawOperationPayloadByKind = {
	readonly [AgentOperationKind.IncidentFieldUpdate]: AgentIncidentFieldUpdatePayload;
	readonly [AgentOperationKind.Fact]: AgentFactPayload;
	readonly [AgentOperationKind.TimelineEvent]: AgentTimelineEventPayload;
	readonly [AgentOperationKind.CauseNode]: AgentCauseNodePayload;
	readonly [AgentOperationKind.CauseUpdate]: AgentCauseUpdatePayload;
	readonly [AgentOperationKind.HiraFollowupNote]: AgentHiraFollowupPayload;
};

type FlueRawOperationKind = keyof FlueRawOperationPayloadByKind;

type FlueRawOperationOf<Kind extends FlueRawOperationKind> = {
	readonly kind: Kind;
	readonly payload: FlueRawOperationPayloadByKind[Kind];
	readonly ref?: string;
};

export type FlueRawOperation = {
	readonly [Kind in FlueRawOperationKind]: FlueRawOperationOf<Kind>;
}[FlueRawOperationKind];

export type FlueProposalResult =
	| {
			readonly ok: true;
			readonly operations: readonly FlueRawOperation[];
	  }
	| {
			readonly errors: readonly string[];
			readonly ok: false;
			readonly operations: readonly FlueRawOperation[];
	  };

export type FlueIncidentFieldProposal = {
	readonly field: string;
	readonly value: string | number | null;
	readonly note?: string;
};

export type FlueFactProposal = {
	readonly text: string;
	readonly fieldPath?: string;
};

export type FlueTimelineEventProposal = {
	readonly title: string;
	readonly narrative?: string;
	readonly phase?: "before" | "event" | "after";
	readonly occurredAt?: string;
};

export type FlueCauseNodeProposal = {
	readonly ref?: string;
	readonly label: string;
	readonly parentId?: string;
	readonly method?: "5-whys" | "cause-tree";
	readonly isRootCause?: boolean;
	readonly branchStatus?: "OPEN" | "ROOT_REACHED" | "PARKED";
};

export type FlueCauseUpdateProposal = {
	readonly causeId: string;
	readonly statement?: string;
	readonly isRootCause?: boolean;
	readonly branchStatus?: "OPEN" | "ROOT_REACHED" | "PARKED";
	readonly parentId?: string | null;
};

type IndexedCauseNodeProposal = {
	readonly cause: FlueCauseNodeProposal;
	readonly index: number;
	readonly ref: string;
};

const updatableFieldSet = new Set<string>(INCIDENT_COACH_UPDATABLE_FIELDS);
const textFields = new Set<string>([
	"areaText",
	"bodyPart",
	"coordinatorName",
	"departmentText",
	"immediateCause",
	"incidentTimeNote",
	"injuryNature",
	"location",
	"potentialOutcomeText",
	"processInvolved",
	"shiftText",
	"workActivity",
]);
const workTypeCodes = [
	"MAINTENANCE",
	"OPERATIONS",
	"CLEANING",
	"LOGISTICS",
	"CONSTRUCTION",
	"OFFICE",
	"OTHER",
] as const;
const controlFailureCodes = [
	"MISSING",
	"INADEQUATE",
	"BYPASSED",
	"NOT_USED",
	"UNKNOWN",
] as const;

const enumFieldEntries: Array<readonly [string, readonly string[]]> = [
	["actualInjuryOutcome", INCIDENT_ACTUAL_INJURY_OUTCOME_CODES],
	["controlFailure", controlFailureCodes],
	["eventType", EVENT_TYPE_CODES],
	["hazardCategoryCode", HAZARD_CATEGORY_CODES],
	["potentialLikelihoodCode", LIKELIHOOD_CODES],
	["potentialSeverityCode", SEVERITY_CODES],
	["workType", workTypeCodes],
];
const enumFields: ReadonlyMap<string, readonly string[]> = new Map(
	enumFieldEntries,
);

const nullableEnumFields = new Set([
	"controlFailure",
	"eventType",
	"hazardCategoryCode",
	"workType",
]);

export function buildFlueIncidentFieldOperations(input: {
	readonly fields: readonly FlueIncidentFieldProposal[];
}): FlueProposalResult {
	const errors: string[] = [];
	const operations: FlueRawOperation[] = [];

	if (input.fields.length === 0) {
		return {
			errors: ["At least one field update is required."],
			ok: false,
			operations,
		};
	}

	for (const [index, field] of input.fields.entries()) {
		const result = normalizeIncidentField(field);

		if (!result.ok) {
			errors.push(`Field ${index + 1}: ${result.message}`);
			continue;
		}

		operations.push({
			kind: AgentOperationKind.IncidentFieldUpdate,
			payload: {
				field: result.payload.field,
				...(result.payload.note ? { note: result.payload.note } : {}),
				value: result.payload.value,
			},
		});
	}

	return proposalResult({ errors, operations });
}

export function buildFlueEvidenceOperations(input: {
	readonly existingFacts?: readonly string[];
	readonly facts?: readonly FlueFactProposal[];
	readonly timelineEvents?: readonly FlueTimelineEventProposal[];
}): FlueProposalResult {
	const errors: string[] = [];
	const operations: FlueRawOperation[] = [];
	const acceptedFactTexts = [...(input.existingFacts ?? [])];

	for (const [index, fact] of (input.facts ?? []).entries()) {
		const text = cleanText(fact.text);

		if (!text) {
			errors.push(`Fact ${index + 1} is missing text.`);
			continue;
		}

		if (looksLikeActionMeasureText(text)) {
			errors.push(
				`Fact ${index + 1} looks like a measure; use propose_action_plan.`,
			);
			continue;
		}

		const duplicate = findNearDuplicateText(text, acceptedFactTexts);
		if (duplicate) {
			errors.push(
				`Fact ${index + 1} duplicates an existing fact: "${truncateForMessage(
					duplicate,
				)}". Do not propose it again unless you are correcting it.`,
			);
			continue;
		}

		operations.push({
			kind: AgentOperationKind.Fact,
			payload: {
				...(cleanText(fact.fieldPath)
					? { fieldPath: cleanText(fact.fieldPath) }
					: {}),
				text,
			},
		});
		acceptedFactTexts.push(text);
	}

	for (const [index, event] of (input.timelineEvents ?? []).entries()) {
		const title = cleanText(event.title);

		if (!title) {
			errors.push(`Timeline event ${index + 1} is missing title.`);
			continue;
		}

		if (
			event.occurredAt &&
			isInvalidDateTime(event.occurredAt)
		) {
			errors.push(`Timeline event ${index + 1} occurredAt is invalid.`);
			continue;
		}

		operations.push({
			kind: AgentOperationKind.TimelineEvent,
			payload: {
				...(event.occurredAt ? { occurredAt: event.occurredAt } : {}),
				...(cleanText(event.narrative)
					? { narrative: cleanText(event.narrative) }
					: {}),
				...(event.phase ? { phase: event.phase } : {}),
				title,
			},
		});
	}

	if (operations.length === 0 && errors.length === 0) {
		errors.push("At least one fact or timeline event is required.");
	}

	return proposalResult({ errors, operations });
}

export function buildFlueCauseTreeOperations(input: {
	readonly causeNodes?: readonly FlueCauseNodeProposal[];
	readonly causeUpdates?: readonly FlueCauseUpdateProposal[];
	readonly existingCauseIds?: readonly string[];
}): FlueProposalResult {
	const errors: string[] = [];
	const operations: FlueRawOperation[] = [];
	const existingCauseIds = idSet(input.existingCauseIds ?? []);
	const localRefs = new Set<string>();
	const causeNodes = (input.causeNodes ?? []).map((cause, index) => ({
		cause,
		index,
		ref: cleanText(cause.ref) || `cause-${index + 1}`,
	}));

	for (const cause of causeNodes) {
		if (localRefs.has(cause.ref) || existingCauseIds.has(cause.ref)) {
			errors.push(`Cause ${cause.index + 1} ref is not unique.`);
		}

		localRefs.add(cause.ref);
	}

	const sortedCauseNodes = sortCauseNodes(causeNodes);
	if (!sortedCauseNodes.ok) {
		errors.push(sortedCauseNodes.message);
	}

	for (const entry of sortedCauseNodes.ok ? sortedCauseNodes.nodes : []) {
		const { cause, index, ref } = entry;
		const label = cleanText(cause.label);
		const parentId = cleanText(cause.parentId);

		if (!label) {
			errors.push(`Cause ${index + 1} is missing label.`);
			continue;
		}

		if (parentId && parentId === ref) {
			errors.push(`Cause ${index + 1} cannot parent itself.`);
			continue;
		}

		if (parentId && !existingCauseIds.has(parentId) && !localRefs.has(parentId)) {
			errors.push(`Cause ${index + 1} parentId is unknown.`);
			continue;
		}

		operations.push({
			kind: AgentOperationKind.CauseNode,
			payload: {
				...(cause.branchStatus ? { branchStatus: cause.branchStatus } : {}),
				...(cause.isRootCause === undefined
					? {}
					: { isRootCause: cause.isRootCause }),
				label,
				...(cause.method ? { method: cause.method } : {}),
				...(parentId ? { parentId } : {}),
			},
			ref,
		});
	}

	for (const [index, update] of (input.causeUpdates ?? []).entries()) {
		const causeId = cleanText(update.causeId);
		const parentId =
			update.parentId === null ? null : cleanText(update.parentId ?? undefined);

		if (!causeId) {
			errors.push(`Cause update ${index + 1} is missing causeId.`);
			continue;
		}

		if (!existingCauseIds.has(causeId) && !localRefs.has(causeId)) {
			errors.push(`Cause update ${index + 1} causeId is unknown.`);
			continue;
		}

		if (
			parentId &&
			parentId !== causeId &&
			!existingCauseIds.has(parentId) &&
			!localRefs.has(parentId)
		) {
			errors.push(`Cause update ${index + 1} parentId is unknown.`);
			continue;
		}

		if (parentId === causeId) {
			errors.push(`Cause update ${index + 1} cannot parent a cause to itself.`);
			continue;
		}

		operations.push({
			kind: AgentOperationKind.CauseUpdate,
			payload: {
				...(update.branchStatus ? { branchStatus: update.branchStatus } : {}),
				causeId,
				...(update.isRootCause === undefined
					? {}
					: { isRootCause: update.isRootCause }),
				...(update.parentId === undefined ? {} : { parentId }),
				...(cleanText(update.statement)
					? { statement: cleanText(update.statement) }
					: {}),
			},
		});
	}

	if (operations.length === 0 && errors.length === 0) {
		errors.push("At least one cause node or cause update is required.");
	}

	return proposalResult({ errors, operations });
}

export function buildFlueHiraFollowupOperations(input: {
	readonly notes: readonly {
		readonly note: string;
		readonly targetProcess?: string;
	}[];
}): FlueProposalResult {
	const errors: string[] = [];
	const noteTexts: string[] = [];
	let targetProcess = "";

	for (const [index, note] of input.notes.entries()) {
		const text = cleanText(note.note);

		if (!text) {
			errors.push(`HIRA follow-up ${index + 1} is missing note.`);
			continue;
		}

		const process = cleanText(note.targetProcess);
		if (process && !targetProcess) {
			targetProcess = process;
		}
		noteTexts.push(process ? `${process}: ${text}` : text);
	}

	const operations: FlueRawOperation[] =
		noteTexts.length > 0
			? [
					{
						kind: AgentOperationKind.HiraFollowupNote,
						payload: {
							note: noteTexts.join("\n"),
							...(targetProcess ? { targetProcess } : {}),
						},
					},
				]
			: [];

	return proposalResult({ errors, operations });
}

export function validateFlueRawIncidentOperations(input: {
	readonly existingCauseIds?: readonly string[];
	readonly operations: readonly unknown[];
	readonly requiresActionPlan?: boolean;
}): Array<{ readonly index: number; readonly message: string }> {
	const errors: Array<{ index: number; message: string }> = [];
	const existingCauseIds = idSet(input.existingCauseIds ?? []);
	const localRefs = new Set<string>();
	let hasStopAction = false;
	const actionishFactIndexes: number[] = [];

	for (const raw of input.operations) {
		const record = asRecord(raw);
		if (record.kind === AgentOperationKind.CauseNode) {
			const ref = cleanText(
				typeof record.ref === "string" ? record.ref : undefined,
			);
			if (ref) {
				localRefs.add(ref);
			}
		}
	}

	for (const [index, raw] of input.operations.entries()) {
		const record = asRecord(raw);
		const kind = typeof record.kind === "string" ? record.kind : "";
		const payload = asRecord(record.payload);

		if (kind === AgentOperationKind.IncidentFieldUpdate) {
			const result = normalizeIncidentField({
				field: typeof payload.field === "string" ? payload.field : "",
				note: typeof payload.note === "string" ? payload.note : undefined,
				value: normalizeUnknownFieldValue(payload.value),
			});

			if (!result.ok) {
				errors.push({ index, message: result.message });
			}
		}

			if (
				kind === AgentOperationKind.Fact &&
				typeof payload.text === "string" &&
				looksLikeActionMeasureText(payload.text)
			) {
				actionishFactIndexes.push(index);
			}

			if (kind === AgentOperationKind.TimelineEvent) {
				const occurredAt =
					typeof payload.occurredAt === "string" ? payload.occurredAt : "";
				if (occurredAt && isInvalidDateTime(occurredAt)) {
					errors.push({
						index,
						message: "timeline_event occurredAt must be an ISO date/time.",
					});
				}
			}

			if (kind === AgentOperationKind.StopAction) {
				hasStopAction = true;
				const linkedCauseNodeId = cleanText(
					typeof payload.linkedCauseNodeId === "string"
						? payload.linkedCauseNodeId
						: undefined,
				);
				if (!linkedCauseNodeId) {
					errors.push({
						index,
					message:
						"stop_action must link to a cause with linkedCauseNodeId.",
				});
			} else if (
				!existingCauseIds.has(linkedCauseNodeId) &&
				!localRefs.has(linkedCauseNodeId)
			) {
					errors.push({
						index,
						message: "stop_action linkedCauseNodeId is unknown.",
					});
				}
				const dueDate =
					typeof payload.dueDate === "string" ? payload.dueDate.trim() : "";
				if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
					errors.push({
						index,
						message: "stop_action dueDate must be YYYY-MM-DD.",
					});
				}
			}
		}

	if (input.requiresActionPlan && !hasStopAction) {
		errors.push({
			index: -1,
			message:
				"Action-plan turn requires stop_action operations from propose_action_plan.",
		});
	}

	if (actionishFactIndexes.length > 0 && !hasStopAction) {
		for (const index of actionishFactIndexes) {
			errors.push({
				index,
				message:
					"Agreed measures/actions/fixes must be stop_action operations linked to a cause, not fact operations.",
			});
		}
	}

	return errors;
}

export function looksLikeActionMeasureText(text: string): boolean {
	const normalized = text.toLowerCase().normalize("NFC");
	const actionNoun =
		/\b(action|measure|fix|corrective|preventive|stop action|owner|due|deadline|massnahme|massnahmen|maßnahme|maßnahmen|aktion|frist|verantwortlich|zuständig|zustaendig|mesure|mesures|responsable|échéance|echeance|azione|azioni|misura|misure|scadenza|responsabile)\b/u.test(
			normalized,
		);
	const deadline = /\b(?:by|bis|avant|entro)\s+\d{4}-\d{2}-\d{2}\b/u.test(
		normalized,
	);
	const commitment =
		/\b(will|shall|must|should|needs to|agreed|assigned|wird|werden|soll|muss|vereinbart|attribué|attribue|doit|devra|convenu|deve|dovrà|dovra|concordato)\b/u.test(
			normalized,
		);
	const actionVerb =
		/\b(repair|replace|refill|replenish|brief|train|block|barrier|cone|isolate|install|provide|remove from service|stop using|escalat|reparieren|ersetzen|auffüllen|auffuellen|bereitstellen|instruieren|schulen|absperren|blockieren|isolieren|entfernen|réparer|reparer|remplacer|remplir|former|instruire|bloquer|isoler|installer|fournir|ritirare|riparare|sostituire|rifornire|formare|istruire|bloccare|isolare|installare|fornire)\b/u.test(
			normalized,
		);

	return actionNoun || deadline || (commitment && actionVerb);
}

function findNearDuplicateText(
	text: string,
	candidates: readonly string[],
): string | null {
	const normalizedText = normalizeComparableText(text);
	const textTokens = comparableTokens(normalizedText);

	if (!normalizedText || textTokens.length < 4) {
		return null;
	}

	for (const candidate of candidates) {
		const normalizedCandidate = normalizeComparableText(candidate);
		if (!normalizedCandidate) {
			continue;
		}

		if (
			normalizedCandidate === normalizedText ||
			normalizedCandidate.includes(normalizedText) ||
			normalizedText.includes(normalizedCandidate)
		) {
			return candidate;
		}

		const candidateTokens = comparableTokens(normalizedCandidate);
		if (candidateTokens.length < 4) {
			continue;
		}

		const overlap = tokenOverlapRatio(textTokens, candidateTokens);
		if (overlap >= 0.55) {
			return candidate;
		}
	}

	return null;
}

function normalizeComparableText(text: string): string {
	return text
		.toLowerCase()
		.normalize("NFC")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim();
}

function comparableTokens(text: string): string[] {
	const stopWords = new Set([
		"and",
		"are",
		"but",
		"for",
		"from",
		"had",
		"has",
		"into",
		"near",
		"that",
		"the",
		"then",
		"there",
		"this",
		"was",
		"were",
		"with",
	]);

	return text
		.split(/\s+/)
		.filter((token) => token.length >= 3 && !stopWords.has(token));
}

function tokenOverlapRatio(
	left: readonly string[],
	right: readonly string[],
): number {
	const leftSet = new Set(left);
	const rightSet = new Set(right);
	let common = 0;

	for (const token of leftSet) {
		if (rightSet.has(token)) {
			common += 1;
		}
	}

	return common / Math.min(leftSet.size, rightSet.size);
}

function truncateForMessage(text: string): string {
	const normalized = text.trim();
	return normalized.length > 120
		? `${normalized.slice(0, 117).trimEnd()}...`
		: normalized;
}

function normalizeIncidentField(
	input: FlueIncidentFieldProposal,
):
	| {
			readonly ok: true;
			readonly payload: AgentIncidentFieldUpdatePayload;
	  }
	| { readonly ok: false; readonly message: string } {
	const field = cleanText(input.field);
	const note = cleanText(input.note);

	if (!updatableFieldSet.has(field)) {
		return { message: `Unsupported incident field: ${field}`, ok: false };
	}

	if (field === "incidentType") {
		const text = cleanText(stringFieldValue(input.value));
		const incidentType = parseIncidentType(text);
		if (!incidentType) {
			return {
				message: `incidentType must be one of ${INCIDENT_TYPE_CODES.join(", ")}`,
				ok: false,
			};
		}
		return fieldPayload({ field, note, value: incidentType });
	}

	const enumValues = enumFields.get(field);
	if (enumValues) {
		if (input.value === null && nullableEnumFields.has(field)) {
			return fieldPayload({ field, note, value: null });
		}

		const text = cleanText(stringFieldValue(input.value));
		if (!enumValues.includes(text)) {
			return {
				message: `${field} must be one of ${enumValues.join(", ")}`,
				ok: false,
			};
		}

		return fieldPayload({ field, note, value: text });
	}

	if (field === "title" || field === "incidentAt") {
		const text = cleanText(stringFieldValue(input.value));
		if (!text) {
			return { message: `${field} must not be empty`, ok: false };
		}
		if (field === "incidentAt" && isInvalidDateTime(text)) {
			return { message: "incidentAt must be an ISO date/time", ok: false };
		}
		return fieldPayload({
			field,
			note,
			value: field === "incidentAt" ? new Date(text).toISOString() : text,
		});
	}

	if (field === "lostDays") {
		if (input.value === null || cleanText(stringFieldValue(input.value)) === "") {
			return fieldPayload({ field, note, value: null });
		}

		const value = Number(input.value);
		if (!Number.isInteger(value) || value < 0) {
			return { message: "lostDays must be a non-negative integer", ok: false };
		}

		return fieldPayload({ field, note, value });
	}

	if (textFields.has(field)) {
		return fieldPayload({
			field,
			note,
			value:
				input.value === null ? null : cleanText(stringFieldValue(input.value)),
		});
	}

	return { message: `Unsupported incident field: ${field}`, ok: false };
}

function fieldPayload(input: {
	readonly field: string;
	readonly note: string;
	readonly value: string | number | null;
}): { readonly ok: true; readonly payload: AgentIncidentFieldUpdatePayload } {
	return {
		ok: true,
		payload: {
			field: input.field as AgentIncidentFieldUpdatePayload["field"],
			...(input.note ? { note: input.note } : {}),
			value: input.value,
		},
	};
}

function proposalResult(input: {
	readonly errors: readonly string[];
	readonly operations: readonly FlueRawOperation[];
}): FlueProposalResult {
	return input.errors.length > 0
		? { errors: input.errors, ok: false, operations: input.operations }
		: { ok: true, operations: input.operations };
}

function idSet(values: readonly string[]): Set<string> {
	return new Set(values.map((value) => value.trim()).filter(Boolean));
}

function sortCauseNodes(
	nodes: readonly IndexedCauseNodeProposal[],
):
	| { readonly ok: true; readonly nodes: readonly IndexedCauseNodeProposal[] }
	| { readonly message: string; readonly ok: false } {
	const byRef = new Map(nodes.map((node) => [node.ref, node]));
	const output: IndexedCauseNodeProposal[] = [];
	const state = new Map<string, "visiting" | "visited">();

	const visit = (
		node: IndexedCauseNodeProposal,
	): { readonly ok: true } | { readonly message: string; readonly ok: false } => {
		const status = state.get(node.ref);

		if (status === "visited") {
			return { ok: true };
		}

		if (status === "visiting") {
			return {
				message: `Cause ${node.index + 1} participates in a parent cycle.`,
				ok: false,
			};
		}

		state.set(node.ref, "visiting");
		const parent = byRef.get(cleanText(node.cause.parentId));

		if (parent) {
			const result = visit(parent);
			if (!result.ok) {
				return result;
			}
		}

		state.set(node.ref, "visited");
		output.push(node);
		return { ok: true };
	};

	for (const node of nodes) {
		const result = visit(node);
		if (!result.ok) {
			return result;
		}
	}

	return { nodes: output, ok: true };
}

function cleanText(value: string | undefined): string {
	return value?.trim().replace(/\s+/g, " ") ?? "";
}

function isInvalidDateTime(value: string): boolean {
	return Number.isNaN(new Date(value).getTime());
}

function stringFieldValue(value: string | number | null): string {
	return typeof value === "string"
		? value
		: typeof value === "number"
			? String(value)
			: "";
}

function normalizeUnknownFieldValue(value: unknown): string | number | null {
	return typeof value === "string" || typeof value === "number" || value === null
		? value
		: "";
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object"
		? (value as Record<string, unknown>)
		: {};
}
