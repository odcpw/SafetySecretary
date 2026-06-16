import type { AgentContextBundle } from "../agent/types";

const defaultTextLimit = 900;
const rawStatementTextLimit = 1600;
const collectionLimit = 80;

type JsonValue =
	| boolean
	| null
	| number
	| string
	| readonly JsonValue[]
	| { readonly [key: string]: JsonValue };

export type FlueRecordCollection = {
	readonly items: readonly Record<string, JsonValue>[];
	readonly total: number;
	readonly truncated: boolean;
};

export type FlueIncidentRecordView = {
	readonly accounts: FlueRecordCollection;
	readonly actions: FlueRecordCollection;
	readonly causes: FlueRecordCollection;
	readonly counts: Readonly<Record<string, number>>;
	readonly evidence: FlueRecordCollection;
	readonly facts: FlueRecordCollection;
	readonly hiraFollowup: Record<string, JsonValue>;
	readonly incident: Record<string, JsonValue>;
	readonly people: FlueRecordCollection;
	readonly timeline: FlueRecordCollection;
};

export function buildFlueIncidentRecordView(
	context: AgentContextBundle,
): FlueIncidentRecordView {
	const sections = asRecord(context.workflowSnapshot.sections);

	return {
		accounts: collection(sections.accounts, (row) =>
			pickRecord(row, ["id", "personId", "rawStatement"], rawStatementTextLimit),
		),
		actions: collection(sections.actions, (row) =>
			pickRecord(row, [
				"id",
				"causeNodeId",
				"description",
				"ownerRole",
				"dueDate",
				"actionType",
				"status",
			]),
		),
		causes: collection(sections.causes, (row) =>
			pickRecord(row, [
				"id",
				"parentId",
				"timelineEventId",
				"statement",
				"question",
				"isRootCause",
				"branchStatus",
			]),
		),
		counts: {
			accounts: arrayFrom(sections.accounts).length,
			actions: arrayFrom(sections.actions).length,
			causes: arrayFrom(sections.causes).length,
			evidence: arrayFrom(sections.evidence).length,
			facts: arrayFrom(sections.facts).length,
			people: arrayFrom(sections.people).length,
			timeline: arrayFrom(sections.timeline).length,
		},
		evidence: collection(sections.evidence, (row) =>
			pickRecord(row, [
				"id",
				"eventId",
				"filename",
				"mimeType",
				"caption",
				"sizeBytes",
			]),
		),
		facts: collection(sections.facts, (row) =>
			pickRecord(row, [
				"id",
				"accountId",
				"personId",
				"personRole",
				"personName",
				"text",
			]),
		),
		hiraFollowup: pickRecord(sections.hiraFollowup, ["needed", "text"]),
		incident: pickRecord(sections.incident, [
			"id",
			"caseNumber",
			"title",
			"incidentAt",
			"incidentTimeNote",
			"location",
			"incidentType",
			"actualOutcome",
			"actualSeverity",
			"actualSeverityReason",
			"potentialOutcome",
			"potentialSeverity",
			"hazardCategory",
			"department",
			"area",
			"shift",
			"workActivity",
			"workType",
			"eventType",
			"processInvolved",
			"injuryNature",
			"bodyPart",
			"lostDays",
			"immediateCause",
			"controlFailure",
			"coordinatorRole",
			"coordinatorName",
			"workflowStage",
			"causeMethod",
			"contentLanguage",
			"seriousPotential",
		]),
		people: collection(sections.people, (row) =>
			pickRecord(row, ["id", "role", "name", "otherInfo"]),
		),
		timeline: collection(sections.timeline, (row) =>
			pickRecord(row, [
				"id",
				"phase",
				"eventAt",
				"timeLabel",
				"text",
				"confidence",
				"attachmentCount",
			]),
		),
	};
}

function collection(
	value: unknown,
	mapper: (row: unknown) => Record<string, JsonValue>,
): FlueRecordCollection {
	const rows = arrayFrom(value);
	const items = rows.slice(0, collectionLimit).map(mapper);

	return {
		items,
		total: rows.length,
		truncated: rows.length > items.length,
	};
}

function pickRecord(
	value: unknown,
	keys: readonly string[],
	textLimit = defaultTextLimit,
): Record<string, JsonValue> {
	const source = asRecord(value);
	const picked: Record<string, JsonValue> = {};

	for (const key of keys) {
		const normalized = normalizeValue(source[key], textLimit);

		if (normalized !== undefined) {
			picked[key] = normalized;
		}
	}

	return picked;
}

function normalizeValue(
	value: unknown,
	textLimit: number,
): JsonValue | undefined {
	if (value === undefined) {
		return undefined;
	}

	if (value === null) {
		return null;
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	if (typeof value === "bigint") {
		return Number(value);
	}

	if (typeof value === "boolean" || typeof value === "number") {
		return value;
	}

	if (typeof value === "string") {
		return compactText(value, textLimit);
	}

	if (Array.isArray(value)) {
		return value
			.map((item) => normalizeValue(item, textLimit))
			.filter((item): item is JsonValue => item !== undefined);
	}

	return undefined;
}

function compactText(value: string, limit: number): string {
	const text = value.trim();

	if (text.length <= limit) {
		return text;
	}

	return `${text.slice(0, Math.max(0, limit - 3)).trimEnd()}...`;
}

function arrayFrom(value: unknown): readonly unknown[] {
	return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object"
		? (value as Record<string, unknown>)
		: {};
}
