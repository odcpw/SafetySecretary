const {
	normalizePotentialSeverityForEvidence,
	parsePotentialSeverity,
} = (await import(
	new URL("../../src/lib/incident/potential-severity.ts", import.meta.url).href
)) as typeof import("../../src/lib/incident/potential-severity");

export type JsonRecord = Record<string, unknown>;

export type CaseBundle = {
	readonly case?: JsonRecord;
	readonly facts?: readonly JsonRecord[];
	readonly timelineEvents?: readonly JsonRecord[];
	readonly causeNodes?: readonly JsonRecord[];
	readonly causeActions?: readonly JsonRecord[];
	readonly persons?: readonly JsonRecord[];
	readonly coachMessages?: readonly JsonRecord[];
};

export type CaseStudyEvidenceRef = {
	readonly field?: string;
	readonly id?: string;
	readonly index?: number;
	readonly kind:
		| "case-field"
		| "coach-message"
		| "record-fact"
		| "timeline-event"
		| "cause-node"
		| "cause-action";
	readonly label?: string;
};

export type CaseStudyFact = {
	readonly evidence?: readonly CaseStudyEvidenceRef[];
	readonly id: string;
	readonly required: boolean;
	readonly source: "user" | "record" | "timeline" | "cause" | "action";
	readonly text: string;
	readonly topics: readonly string[];
};

export type ActualCaseClassification = {
	readonly actualInjuryOutcome?: string;
	readonly eventType?: string;
	readonly hazardCategoryCode?: string;
	readonly incidentType?: string;
	readonly potentialOutcomeText?: string;
	readonly potentialSeverityCode?: string;
};

export type ActualCaseCause = {
	readonly evidence?: readonly CaseStudyEvidenceRef[];
	readonly id: string;
	readonly isRootCause?: boolean;
	readonly parentId?: string;
	readonly question?: string;
	readonly statement: string;
	readonly topics: readonly string[];
};

export type ActualCaseMeasure = {
	readonly actionType?: string;
	readonly dueDate?: string;
	readonly evidence?: readonly CaseStudyEvidenceRef[];
	readonly id: string;
	readonly linkedCauseId?: string;
	readonly ownerRole?: string;
	readonly status?: string;
	readonly description: string;
	readonly topics: readonly string[];
};

export type ActualCase = {
	readonly classification: ActualCaseClassification;
	readonly causes: readonly ActualCaseCause[];
	readonly facts: readonly CaseStudyFact[];
	readonly id: string;
	readonly language: string;
	readonly measures: readonly ActualCaseMeasure[];
	readonly narrative: {
		readonly opening: string;
		readonly summary: string;
	};
	readonly source: {
		readonly caseId?: string;
		readonly caseNumber?: string;
		readonly title: string;
	};
	readonly title: string;
	readonly uncertainties: readonly string[];
};

export type CaseStudy = {
	readonly version: 1;
	readonly actualCase: ActualCase;
};

export type CaseStudyState = {
	readonly noMatchCount?: number;
	readonly revealedFactIds: readonly string[];
};

export type CaseStudyUserTurn = {
	readonly done?: boolean;
	readonly matchedTopics: readonly string[];
	readonly message: string;
	readonly reason: "opening" | "answered-question" | "no-matching-case-fact" | "complete";
	readonly revealedFactIds: readonly string[];
};

export type CaseStudyCheck = {
	readonly category: string;
	readonly evidence: string;
	readonly hardFailure?: boolean;
	readonly name: string;
	readonly status: "pass" | "warn" | "fail";
	readonly weight: number;
};

export type CaseStudyEvaluation = {
	readonly checks: readonly CaseStudyCheck[];
	readonly summary: {
		readonly byCategory: Record<string, { earned: number; total: number; score: number }>;
		readonly criteriaVersion: string;
		readonly earnedWeight: number;
		readonly grade: string;
		readonly hardFailures: readonly Pick<CaseStudyCheck, "category" | "evidence" | "name">[];
		readonly score: number;
		readonly totalWeight: number;
	};
};

export const CASE_STUDY_CRITERIA_VERSION = "case-study-criteria-v0.6.0";

export function buildCaseStudyFromBundle(bundle: CaseBundle): CaseStudy {
	const sourceCase = requireCase(bundle);
	const userMessages = (bundle.coachMessages ?? [])
		.filter((message) => message.role === "user")
		.map((message) => String(message.content ?? "").trim())
		.filter(Boolean)
		.filter((message) => !isMethodSwitchMessage(message));
	const title = String(sourceCase.title ?? "Untitled case");
	const openingMessage = userMessages[0] ?? fallbackOpening(sourceCase);
	const id = safeId(String(sourceCase.id ?? sourceCase.case_number ?? title));
	const classification = actualCaseClassification(sourceCase);
	const source = {
		caseId: stringOrUndefined(sourceCase.id),
		caseNumber: stringOrUndefined(sourceCase.case_number),
		title,
	};
	const actualFacts = dedupeFacts([
		fact("user-opening", openingMessage, "user", true, [
			{
				index: userMessages.length > 0 ? 0 : undefined,
				kind: userMessages.length > 0 ? "coach-message" : "case-field",
				label: "opening narrative",
			},
		]),
		...caseFieldFacts(sourceCase),
		...userMessages.slice(1).map((text, index) =>
			fact(`user-${index + 1}`, text, "user", true, [
				{ index: index + 1, kind: "coach-message", label: "user message" },
			]),
		),
		...(bundle.facts ?? []).map((row, index) =>
			fact(`record-fact-${index + 1}`, String(row.text ?? ""), "record", true, [
				{ id: stringOrUndefined(row.id), index: index + 1, kind: "record-fact" },
			]),
		),
		...(bundle.timelineEvents ?? []).map((row, index) =>
			fact(`timeline-${index + 1}`, String(row.text ?? row.narrative ?? ""), "timeline", false, [
				{ id: stringOrUndefined(row.id), index: index + 1, kind: "timeline-event" },
			]),
		),
	]).filter((item) => item.text.length > 0);
	const causes = buildActualCauses(bundle.causeNodes ?? []);
	const measures = buildActualMeasures(bundle.causeActions ?? []);
	const actualCase: ActualCase = {
		classification,
		causes,
		facts: actualFacts,
		id,
		language: String(sourceCase.content_language ?? guessLanguage(openingMessage)),
		measures,
		narrative: {
			opening: openingMessage,
			summary: actualCaseSummary(sourceCase, actualFacts, causes, measures),
		},
		source,
		title,
		uncertainties: actualCaseUncertainties(sourceCase, actualFacts, causes, measures),
	};
	return {
		actualCase,
		version: 1,
	};
}

export function caseStudyMarkdown(study: CaseStudy): string {
	const { actualCase } = study;
	const lines = [
		`# ${actualCase.source.caseNumber ? `${actualCase.source.caseNumber}: ` : ""}${actualCase.title}`,
		"",
		`Language: ${actualCase.language}`,
		`Actual Case: ${actualCase.id}`,
		`Opening: ${actualCase.narrative.opening}`,
		"",
		"## Actual Case Narrative",
		"",
		actualCase.narrative.summary,
		"",
		"## Expected Classification",
		"",
		...Object.entries(actualCase.classification).map(
			([key, value]) => `- ${key}: ${value ?? "unknown"}`,
		),
		"",
		"## Actual Facts",
		"",
		...actualCase.facts.map((item) => `- ${item.id} [${item.topics.join(", ")}]: ${item.text}`),
		"",
		"## Actual Causes",
		"",
		...(actualCase.causes.length > 0
			? actualCase.causes.map((cause) => `- ${cause.id}: ${cause.statement}`)
			: ["- none"]),
		"",
		"## Actual Measures",
		"",
		...(actualCase.measures.length > 0
			? actualCase.measures.map((measure) => `- ${measure.id}: ${measure.description}`)
			: ["- none"]),
		"",
		"## Uncertainties",
		"",
		...(actualCase.uncertainties.length > 0
			? actualCase.uncertainties.map((text) => `- ${text}`)
			: ["- none"]),
		"",
	];
	return `${lines.join("\n")}\n`;
}

export function actualCaseMarkdown(actualCase: ActualCase): string {
	const lines = [
		`# Actual Case: ${actualCase.source.caseNumber ? `${actualCase.source.caseNumber}: ` : ""}${actualCase.title}`,
		"",
		`Language: ${actualCase.language}`,
		`Source case id: ${actualCase.source.caseId ?? "unknown"}`,
		"",
		"## Narrative",
		"",
		actualCase.narrative.summary,
		"",
		"## Classification",
		"",
		...Object.entries(actualCase.classification).map(
			([key, value]) => `- ${key}: ${value ?? "unknown"}`,
		),
		"",
		"## Facts",
		"",
		...actualCase.facts.map((item) => `- ${item.id} [${item.topics.join(", ")}]: ${item.text}`),
		"",
		"## Causes",
		"",
		...(actualCase.causes.length > 0
			? actualCase.causes.map((cause) => `- ${cause.id}: ${cause.statement}`)
			: ["- none"]),
		"",
		"## Measures",
		"",
		...(actualCase.measures.length > 0
			? actualCase.measures.map((measure) => `- ${measure.id}: ${measure.description}`)
			: ["- none"]),
		"",
		"## Uncertainties",
		"",
		...(actualCase.uncertainties.length > 0
			? actualCase.uncertainties.map((text) => `- ${text}`)
			: ["- none"]),
		"",
	];
	return `${lines.join("\n")}\n`;
}

export function nextCaseStudyUserTurn(input: {
	readonly assistantText?: string;
	readonly state: CaseStudyState;
	readonly study: CaseStudy;
}): CaseStudyUserTurn {
	const simulationFacts = simulationFactsForActualCase(input.study.actualCase);
	const revealed = new Set(input.state.revealedFactIds);
	if (revealed.size === 0 && !input.assistantText) {
		const openingFact = simulationFacts.find(
			(item) => item.text === input.study.actualCase.narrative.opening,
		);
		return {
			matchedTopics: ["opening"],
			message: input.study.actualCase.narrative.opening,
			reason: "opening",
			revealedFactIds: openingFact ? [openingFact.id] : [],
		};
	}

	const unrevealedRequired = simulationFacts.filter(
		(item) => item.required && !revealed.has(item.id),
	);
	if (unrevealedRequired.length === 0) {
		const optionalTurn = optionalMatchingTurn(
			input.study,
			revealed,
			input.assistantText ?? "",
		);
		if (optionalTurn) {
			return optionalTurn;
		}
		return {
			done: true,
			matchedTopics: [],
			message: "",
			reason: "complete",
			revealedFactIds: [],
		};
	}

	const questionTopics = assistantTopics(input.assistantText ?? "");
	const matching = unrevealedRequired.find((item) =>
		item.topics.some((topic) => questionTopics.includes(topic)),
	);
	if (matching) {
		return {
			matchedTopics: matching.topics.filter((topic) => questionTopics.includes(topic)),
			message: matching.text,
			reason: "answered-question",
			revealedFactIds: [matching.id],
		};
	}

	const optionalTurn = optionalMatchingTurn(
		input.study,
		revealed,
		input.assistantText ?? "",
	);
	if (optionalTurn) {
		return optionalTurn;
	}

	if ((input.state.noMatchCount ?? 0) >= 3) {
		return {
			done: true,
			matchedTopics: questionTopics,
			message: "",
			reason: "complete",
			revealedFactIds: [],
		};
	}

	return {
		matchedTopics: questionTopics,
		message: fallbackNoMatch(input.study.actualCase.language),
		reason: "no-matching-case-fact",
		revealedFactIds: [],
	};
}

function optionalMatchingTurn(
	study: CaseStudy,
	revealed: ReadonlySet<string>,
	assistantText: string,
): CaseStudyUserTurn | null {
	const questionTopics = assistantTopics(assistantText);
	const candidates = simulationFactsForActualCase(study.actualCase)
		.filter((item) => !item.required && !revealed.has(item.id))
		.filter((item) => item.source !== "action" || questionTopics.includes("measures"));
	const matching = [...candidates]
		.sort(
			(a, b) =>
				optionalAnswerPriority(a, questionTopics) -
				optionalAnswerPriority(b, questionTopics),
		)
		.find((item) => item.topics.some((topic) => questionTopics.includes(topic)));
	if (!matching) {
		return null;
	}

	return {
		matchedTopics: matching.topics.filter((topic) => questionTopics.includes(topic)),
		message: matching.text,
		reason: "answered-question",
		revealedFactIds: [matching.id],
	};
}

function optionalAnswerPriority(
	fact: CaseStudyFact,
	questionTopics: readonly string[],
): number {
	if (
		fact.source === "cause" &&
		(questionTopics.includes("work-context") || questionTopics.includes("training"))
	) {
		return 0;
	}
	if (fact.source === "action" && questionTopics.includes("measures")) {
		return 0;
	}
	return 1;
}

export function evaluateCaseStudyRun(input: {
	readonly finalRecord: {
		readonly causeActions?: readonly JsonRecord[];
		readonly causeNodes?: readonly JsonRecord[];
		readonly facts?: readonly JsonRecord[];
		readonly incident?: JsonRecord;
		readonly timelineEvents?: readonly JsonRecord[];
	};
	readonly simulationTurns: readonly JsonRecord[];
	readonly study: CaseStudy;
	readonly transcript: readonly JsonRecord[];
}): CaseStudyEvaluation {
	const { actualCase } = input.study;
	const simulationFacts = simulationFactsForActualCase(actualCase);
	const incident = input.finalRecord.incident ?? {};
	const recordText = normalize(JSON.stringify(input.finalRecord));
	const revealedFactIds = new Set(
		input.simulationTurns.flatMap((turn) =>
			Array.isArray(turn.revealedFactIds) ? turn.revealedFactIds.map(String) : [],
		),
	);
	const requiredFacts = simulationFacts.filter((item) => item.required);
	const revealedRequiredFacts = requiredFacts.filter((item) =>
		revealedFactIds.has(item.id),
	);
	const revealedActionFacts = simulationFacts.filter(
		(item) => item.source === "action" && revealedFactIds.has(item.id),
	);
	const revealedFactsCaptured = revealedRequiredFacts.filter((item) =>
		containsCaseText(recordText, item.text),
	);
	const checks: CaseStudyCheck[] = [
		expectedFieldCheck(actualCase, incident, "incidentType", "incidentType", 3),
		expectedFieldCheck(actualCase, incident, "actualInjuryOutcome", "actualInjuryOutcome", 3),
		expectedFieldCheck(actualCase, incident, "hazardCategoryCode", "hazardCategoryCode", 3),
		expectedFieldCheck(actualCase, incident, "eventType", "eventType", 3),
		expectedSeverityCheck(actualCase, incident),
		...severityProposalChecks(actualCase, incident, input.transcript),
		...factCauseMeasureChecks({
			actualCase,
			finalRecord: input.finalRecord,
			recordText,
			revealedActionFacts,
			revealedFactsCaptured,
		}),
		ratioCheck(
			"fact_capture",
			"revealed facts captured",
			12,
			revealedFactsCaptured.length,
			Math.max(revealedRequiredFacts.length, 1),
			`${revealedFactsCaptured.length}/${revealedRequiredFacts.length} revealed required Actual Case facts appear in final record`,
		),
		ratioCheck(
			"questioning",
			"required case facts surfaced",
			8,
			revealedRequiredFacts.length,
			Math.max(requiredFacts.length, 1),
			`${revealedRequiredFacts.length}/${requiredFacts.length} required Actual Case facts were surfaced by matching coach questions`,
		),
		ratioCheck(
			"investigation_logic",
			"actual causes captured",
			8,
			countThemes(
				recordText,
				actualCase.causes.map((cause) => cause.statement),
			),
			Math.max(actualCase.causes.length, 1),
			"Final record should reflect the Actual Case causes.",
		),
		...causeGraphChecks(actualCase, input.finalRecord),
		measuresCheck(actualCase, input.finalRecord, recordText, revealedActionFacts),
		...managerOutputChecks({
			actualCase,
			finalRecord: input.finalRecord,
			revealedActionFacts,
			revealedFactsCaptured,
		}),
		...operationSafetyChecks(actualCase, input.finalRecord, revealedActionFacts),
		weightedCheck(
			"runtime",
			"conversation progressed",
			3,
			input.transcript.length > 0 && input.simulationTurns.length > 0,
			`transcript=${input.transcript.length}, simulationTurns=${input.simulationTurns.length}`,
		),
	];
	const totalWeight = checks.reduce((sum, check) => sum + check.weight, 0);
	const earnedWeight = checks.reduce(
		(sum, check) =>
			sum + (check.status === "pass" ? check.weight : check.status === "warn" ? check.weight / 2 : 0),
		0,
	);
	const hardFailures = checks
		.filter((check) => check.status === "fail" && check.hardFailure === true)
		.map((check) => ({
			category: check.category,
			evidence: check.evidence,
			name: check.name,
		}));
	return {
		checks,
		summary: {
			byCategory: categoryScores(checks),
			criteriaVersion: CASE_STUDY_CRITERIA_VERSION,
			earnedWeight,
			grade: hardFailures.length > 0 ? "failing-critical" : grade(earnedWeight / totalWeight),
			hardFailures,
			score: Number((earnedWeight / totalWeight).toFixed(3)),
			totalWeight,
		},
	};
}

export function caseStudyEvaluationMarkdown(evaluation: CaseStudyEvaluation): string {
	const lines = [
		"# Case Study Evaluation",
		"",
		`Criteria: ${evaluation.summary.criteriaVersion}`,
		`Score: ${evaluation.summary.score} (${evaluation.summary.grade})`,
		"",
		"## Category Scores",
		"",
		...Object.entries(evaluation.summary.byCategory).map(
			([category, score]) => `- ${category}: ${score.score} (${score.earned}/${score.total})`,
		),
		"",
		"## Hard Failures",
		"",
		...(evaluation.summary.hardFailures.length > 0
			? evaluation.summary.hardFailures.map(
					(failure) => `- ${failure.category} / ${failure.name}: ${failure.evidence}`,
				)
			: ["- none"]),
		"",
		"## Checks",
		"",
		...evaluation.checks.map(
			(check) =>
				`- [${check.status}] ${check.category} / ${check.name} (${check.weight}): ${check.evidence}`,
		),
		"",
	];
	return `${lines.join("\n")}\n`;
}

function simulationFactsForActualCase(actualCase: ActualCase): readonly CaseStudyFact[] {
	return dedupeFacts([
		...actualCase.facts,
		...actualCase.causes.map((cause, index) =>
			fact(
				`cause-${index + 1}`,
				cause.statement,
				"cause",
				false,
				cause.evidence ?? [],
				["work-context"],
			),
		),
		...actualCase.measures.map((measure, index) =>
			fact(
				`action-${index + 1}`,
				measureSimulationText(measure),
				"action",
				false,
				measure.evidence ?? [],
				["measures"],
			),
		),
	]);
}

function actualCaseClassification(sourceCase: JsonRecord): ActualCaseClassification {
	return {
		actualInjuryOutcome: stringOrUndefined(sourceCase.actual_injury_outcome),
		eventType: stringOrUndefined(sourceCase.event_type),
		hazardCategoryCode: stringOrUndefined(sourceCase.hazard_category_code),
		incidentType: stringOrUndefined(sourceCase.incident_type),
		potentialOutcomeText: stringOrUndefined(sourceCase.potential_outcome_text),
		potentialSeverityCode: inferExpectedPotentialSeverity(sourceCase),
	};
}

function buildActualCauses(rows: readonly JsonRecord[]): readonly ActualCaseCause[] {
	const causes: ActualCaseCause[] = [];
	for (const [index, row] of rows.entries()) {
		const statement = String(row.statement ?? "").trim();
		if (!statement) {
			continue;
		}
		causes.push({
			evidence: [
				{ id: stringOrUndefined(row.id), index: index + 1, kind: "cause-node" },
			],
			id: stringOrUndefined(row.id) ?? `cause-${index + 1}`,
			isRootCause: typeof row.is_root_cause === "boolean" ? row.is_root_cause : undefined,
			parentId: stringOrUndefined(row.parent_id),
			question: stringOrUndefined(row.question),
			statement,
			topics: topicsForText(statement),
		});
	}
	return causes;
}

function buildActualMeasures(rows: readonly JsonRecord[]): readonly ActualCaseMeasure[] {
	const measures: ActualCaseMeasure[] = [];
	for (const [index, row] of rows.entries()) {
		const description = String(row.description ?? "").trim();
		if (!description) {
			continue;
		}
		measures.push({
			actionType: stringOrUndefined(row.action_type),
			dueDate: stringOrUndefined(row.due_date),
			evidence: [
				{ id: stringOrUndefined(row.id), index: index + 1, kind: "cause-action" },
			],
			id: stringOrUndefined(row.id) ?? `measure-${index + 1}`,
			linkedCauseId: stringOrUndefined(row.cause_node_id),
			ownerRole: stringOrUndefined(row.owner_role),
			status: stringOrUndefined(row.status),
			description,
			topics: topicsForText(description),
		});
	}
	return measures;
}

function measureSimulationText(measure: ActualCaseMeasure): string {
	return [
		measure.description,
		measure.ownerRole ? `Owner: ${measure.ownerRole}` : "",
		measure.dueDate ? `Due date: ${measure.dueDate}` : "",
		measure.actionType ? `Action type: ${measure.actionType}` : "",
	]
		.filter(Boolean)
		.join(" ");
}

function caseFieldFacts(sourceCase: JsonRecord): readonly CaseStudyFact[] {
	const fields: readonly [string, string, unknown][] = [
		["incident_at", "Incident date/time", sourceCase.incident_at],
		["incident_time_note", "Incident time note", sourceCase.incident_time_note],
		["location", "Location", sourceCase.location],
		["department_text", "Department", sourceCase.department_text],
		["area_text", "Area", sourceCase.area_text],
		["shift_text", "Shift", sourceCase.shift_text],
		["work_activity", "Work activity", sourceCase.work_activity],
		["work_type", "Work type", sourceCase.work_type],
		["process_involved", "Process involved", sourceCase.process_involved],
		["injury_nature", "Injury nature", sourceCase.injury_nature],
		["body_part", "Body part", sourceCase.body_part],
		["lost_days", "Lost days", sourceCase.lost_days],
		["ppe_required", "PPE required", sourceCase.ppe_required],
		["ppe_worn", "PPE worn", sourceCase.ppe_worn],
		["control_failure", "Control failure", sourceCase.control_failure],
		["immediate_cause", "Immediate cause", sourceCase.immediate_cause],
		["contributing_causes", "Contributing causes", sourceCase.contributing_causes],
		["actual_severity_reason", "Actual severity reason", sourceCase.actual_severity_reason],
	];
	return fields
		.map(([fieldName, label, value]) => {
			const text = caseFieldText(label, value);
			if (!text) {
				return null;
			}
			return fact(`case-field-${safeId(fieldName)}`, text, "record", false, [
				{ field: fieldName, kind: "case-field", label },
			]);
		})
		.filter((item): item is CaseStudyFact => Boolean(item));
}

function caseFieldText(label: string, value: unknown): string | undefined {
	if (Array.isArray(value)) {
		const items = value.map((item) => String(item ?? "").trim()).filter(Boolean);
		return items.length > 0 ? `${label}: ${items.join("; ")}` : undefined;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return `${label}: ${String(value)}`;
	}
	if (typeof value !== "string" || !value.trim()) {
		return undefined;
	}
	return `${label}: ${value.trim()}`;
}

function actualCaseSummary(
	sourceCase: JsonRecord,
	facts: readonly CaseStudyFact[],
	causes: readonly ActualCaseCause[],
	measures: readonly ActualCaseMeasure[],
): string {
	const core = [
		stringOrUndefined(sourceCase.title),
		stringOrUndefined(sourceCase.location),
		stringOrUndefined(sourceCase.work_activity),
		stringOrUndefined(sourceCase.injury_nature),
		stringOrUndefined(sourceCase.potential_outcome_text),
	]
		.filter(Boolean)
		.join(". ");
	const factSummary = facts
		.filter((item) => item.required)
		.slice(0, 3)
		.map((item) => item.text)
		.join(" ");
	const causeSummary =
		causes.length > 0
			? `Actual causes: ${causes.map((cause) => cause.statement).join(" / ")}.`
			: "";
	const measureSummary =
		measures.length > 0
			? `Actual measures: ${measures.map((measure) => measure.description).join(" / ")}.`
			: "";
	return [core, factSummary, causeSummary, measureSummary]
		.filter((part) => part.trim().length > 0)
		.join(" ")
		.trim();
}

function actualCaseUncertainties(
	sourceCase: JsonRecord,
	facts: readonly CaseStudyFact[],
	causes: readonly ActualCaseCause[],
	measures: readonly ActualCaseMeasure[],
): readonly string[] {
	const uncertainties = [];
	if (!stringOrUndefined(sourceCase.potential_outcome_text)) {
		uncertainties.push("Potential outcome text is missing from the exported source case.");
	}
	if (!stringOrUndefined(sourceCase.potential_severity_code)) {
		uncertainties.push("Stored potential severity code is missing from the exported source case.");
	}
	if (facts.filter((item) => item.required).length === 0) {
		uncertainties.push("No required narrative or record facts were extracted.");
	}
	if (causes.length === 0) {
		uncertainties.push("No persisted cause nodes were exported.");
	}
	if (measures.length === 0) {
		uncertainties.push("No persisted corrective measures were exported.");
	}
	return uncertainties;
}

function requireCase(bundle: CaseBundle): JsonRecord {
	if (!bundle.case || typeof bundle.case !== "object") {
		throw new Error("case bundle does not contain a case object.");
	}
	return bundle.case;
}

function fact(
	id: string,
	text: string,
	source: CaseStudyFact["source"],
	required: boolean,
	evidence: readonly CaseStudyEvidenceRef[] = [],
	extraTopics: readonly string[] = [],
): CaseStudyFact {
	return {
		evidence,
		id,
		required,
		source,
		text,
		topics: uniqueText([...topicsForText(text), ...extraTopics]),
	};
}

function topicsForText(value: string): readonly string[] {
	const text = normalize(value);
	const topics = new Set<string>();
	if (/wann|dienstag|montag|mittwoch|donnerstag|freitag|samstag|sonntag|uhr|\btime\b|date|morning|yesterday|\b6\/13\b|quand|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|heure|quando|lunedi|lunedì|martedi|martedì|mercoledi|mercoledì|giovedi|giovedì|venerdi|venerdì|sabato|domenica|\bora\b/.test(text)) {
		topics.add("timing");
	}
	if (/finger|amput|teilamput|verkürzt|verkurzt|verkuerzt|chirurgie|rettungsdienst|hospital|spital|verletz|injur|fatal|death|poison|exposure|bless|ferit|infortun|morte|\bmort\b|décès|deces|esposizione|lesion|lésion|lesione|ferita/.test(text)) {
		topics.add("injury-outcome");
	}
	if (/warum|weil|damit|because|cause|grund|toleranz|oberfl|sicht|reflex|pourquoi|parce que|raison|perché|perche|poiché|poiche|motivo/.test(text)) {
		topics.add("work-context");
	}
	if (/massstab|maßstab|spänehaken|spaenehaken|druckluft|fräser|fraeser|fräs|maschine|tool|outil|utensile|macchina|radio|alarm|allarme|monitor|vacuum|pump|pompe|pompa|ppm|hcn/.test(text)) {
		topics.add("equipment");
	}
	if (/instruiert|instruktion|weisung|geschult|training|aware|bewusst|verbot|formation|formé|forme|istruz|addestr|consapevol|interdit|vietato/.test(text)) {
		topics.add("training");
	}
	if (/frist|massnahme|maßnahme|maßnahmen|massnahmen|measure|measures|action plan|corrective|owner|deadline|responsible|responsable|mesure|mesures|azione|azioni|misura|misure|scadenza|responsabile/.test(text)) {
		topics.add("measures");
	}
	if (/allein|alone|lone|supervisor|console|shift|seul|seule|solo|sola|superviseur|supervisore|turno|équipe|equipe/.test(text)) {
		topics.add("staffing");
	}
	if (topics.size === 0) {
		topics.add("narrative");
	}
	return [...topics];
}

function assistantTopics(value: string): readonly string[] {
	const text = normalize(value);
	const topics = new Set<string>();
	if (
		/\?/.test(value) ||
		/frage|klär|klar|confirm|tell me|what|wann|warum|wer|wie|gab es|pourquoi|quand|qui|comment|quoi|que\b|confirmer|perché|perche|quando|chi|come|cosa|dimmi|racconta|confermare/.test(
			text,
		)
	) {
		for (const topic of topicsForText(text)) {
			topics.add(topic);
		}
	}
	if (/what happened|was ist passiert|ablauf|sequence|nächste|next|que s'est-il passé|cosa è successo|cosa e successo/.test(text)) {
		topics.add("narrative");
	}
	return [...topics];
}

function expectedFieldCheck(
	actualCase: ActualCase,
	incident: JsonRecord,
	expectedKey: keyof ActualCaseClassification,
	recordKey: string,
	weight: number,
): CaseStudyCheck {
	const expected = actualCase.classification[expectedKey];
	if (!expected) {
		return {
			category: "classification",
			evidence: `${String(expectedKey)} has no case-study expectation.`,
			name: String(expectedKey),
			status: "warn",
			weight,
		};
	}
	return weightedCheck(
		"classification",
		String(expectedKey),
		weight,
		incident[recordKey] === expected,
		`expected=${JSON.stringify(expected)}, actual=${JSON.stringify(incident[recordKey])}`,
	);
}

function expectedSeverityCheck(actualCase: ActualCase, incident: JsonRecord): CaseStudyCheck {
	const expected = actualCase.classification.potentialSeverityCode;
	const actual = incident.potentialSeverityCode;
	const status = expected ? (actual === expected ? "pass" : "fail") : actual ? "warn" : "fail";
	const isFatalityMismatch = expected === "A" && actual !== expected;
	return {
		category: "classification",
		evidence: `expected=${JSON.stringify(expected)}, actual=${JSON.stringify(actual)}, outcome=${JSON.stringify(actualCase.classification.potentialOutcomeText)}`,
		hardFailure: isFatalityMismatch,
		name: "potential severity",
		status,
		weight: 4,
	};
}

function factCauseMeasureChecks(input: {
	readonly actualCase: ActualCase;
	readonly finalRecord: {
		readonly causeActions?: readonly JsonRecord[];
		readonly causeNodes?: readonly JsonRecord[];
	};
	readonly recordText: string;
	readonly revealedActionFacts: readonly CaseStudyFact[];
	readonly revealedFactsCaptured: readonly CaseStudyFact[];
}): readonly CaseStudyCheck[] {
	const capturedCauseCount = countThemes(
		input.recordText,
		input.actualCase.causes.map((cause) => cause.statement),
	);
	const actions = input.finalRecord.causeActions ?? [];
	const linkedActionCount = actions.filter((action) =>
		Boolean(stringField(action, "causeNodeId", "cause_node_id")),
	).length;
	const implementableActionCount = actions.filter(isImplementableAction).length;
	const checks: CaseStudyCheck[] = [
		{
			category: "case_chain",
			evidence: `capturedFacts=${input.revealedFactsCaptured.length}, capturedActualCauses=${capturedCauseCount}/${input.actualCase.causes.length}`,
			name: "facts lead to causes",
			status:
				input.actualCase.causes.length === 0
					? "warn"
					: input.revealedFactsCaptured.length > 0 && capturedCauseCount > 0
						? "pass"
						: "fail",
			weight: 10,
		},
	];

	if (input.actualCase.measures.length === 0) {
		checks.push({
			category: "case_chain",
			evidence: "Actual Case contains no measures; cause-to-measure chain is not required.",
			name: "causes lead to linked measures",
			status: "warn",
			weight: 8,
		});
		return checks;
	}

	if (input.revealedActionFacts.length === 0) {
		checks.push({
			category: "case_chain",
			evidence:
				"Actual Case has measures, but the simulated user did not reveal them in this run.",
			name: "causes lead to linked measures",
			status: "warn",
			weight: 8,
		});
		checks.push({
			category: "case_chain",
			evidence:
				"Measure implementability was not scored because no Actual Case measures were revealed.",
			name: "measures are implementable",
			status: "warn",
			weight: 8,
		});
		return checks;
	}

	checks.push(
		ratioCheck(
			"case_chain",
			"causes lead to linked measures",
			8,
			linkedActionCount,
			Math.max(actions.length, input.revealedActionFacts.length, 1),
			`${linkedActionCount}/${actions.length} final actions are linked to a cause for ${input.revealedActionFacts.length} revealed measure facts.`,
		),
	);
	checks.push(
		ratioCheck(
			"case_chain",
			"measures are implementable",
			8,
			implementableActionCount,
			Math.max(actions.length, input.revealedActionFacts.length, 1),
			`${implementableActionCount}/${actions.length} final actions have a concrete description, owner, and due date.`,
		),
	);
	return checks;
}

function severityProposalChecks(
	actualCase: ActualCase,
	incident: JsonRecord,
	transcript: readonly JsonRecord[],
): readonly CaseStudyCheck[] {
	if (actualCase.classification.potentialSeverityCode !== "A") {
		return [];
	}

	const proposals = proposedPotentialSeverityCodes(transcript);
	if (proposals.length === 0) {
		return [
			{
				category: "agent_reasoning",
				evidence:
					"No potentialSeverityCode proposal was found in the transcript for a fatal-potential Actual Case.",
				name: "fatal severity proposed by coach",
				status: "warn",
				weight: 4,
			},
		];
	}

	const proposedA = proposals.includes("A");
	const rescued =
		incident.potentialSeverityCode === "A" && proposals.some((code) => code !== "A");
	return [
		{
			category: "agent_reasoning",
			evidence: `proposed=${JSON.stringify(proposals)}, final=${JSON.stringify(incident.potentialSeverityCode)}`,
			name: "fatal severity proposed by coach",
			status: proposedA && !rescued ? "pass" : "fail",
			weight: 4,
		},
	];
}

function proposedPotentialSeverityCodes(transcript: readonly JsonRecord[]): readonly string[] {
	const proposals: string[] = [];
	for (const turn of transcript) {
		const assistant = asRecord(turn.assistant);
		const operations = Array.isArray(assistant.operations) ? assistant.operations : [];
		for (const rawOperation of operations) {
			const operation = asRecord(rawOperation);
			if (operation.kind !== "incident_field_update") {
				continue;
			}
			const payload = asRecord(operation.payload);
			if (payload.field !== "potentialSeverityCode") {
				continue;
			}
			const severity = parsePotentialSeverity(payload.value);
			if (severity) {
				proposals.push(severity);
			}
		}
	}
	return proposals;
}

type FinalCauseNode = {
	readonly id?: string;
	readonly parentId?: string;
	readonly statement: string;
	readonly isRootCause: boolean;
	readonly branchStatus?: string;
};

type FinalAction = {
	readonly causeNodeId?: string;
	readonly description?: string;
	readonly dueDate?: string;
	readonly ownerRole?: string;
};

type CauseGraphAnalysis = {
	readonly childrenById: ReadonlyMap<string, readonly FinalCauseNode[]>;
	readonly cycles: number;
	readonly maxDepth: number;
	readonly nodesMissingId: number;
	readonly rootNodes: readonly FinalCauseNode[];
	readonly rootWithChildren: readonly FinalCauseNode[];
	readonly unknownParentCount: number;
};

function causeGraphChecks(
	actualCase: ActualCase,
	finalRecord: {
		readonly causeActions?: readonly JsonRecord[];
		readonly causeNodes?: readonly JsonRecord[];
	},
): readonly CaseStudyCheck[] {
	const finalNodes = normalizeFinalCauseNodes(finalRecord.causeNodes ?? []);
	const finalActions = normalizeFinalActions(finalRecord.causeActions ?? []);
	const graph = analyseFinalCauseGraph(finalNodes);
	const expectedLinkCount = actualCase.causes.filter((cause) =>
		Boolean(cause.parentId && actualCase.causes.some((parent) => parent.id === cause.parentId)),
	).length;
	const preservedLinkCount = countPreservedCauseLinks(actualCase.causes, finalNodes);
	const actualGraph = analyseFinalCauseGraph(
		actualCase.causes.map((cause) => ({
			id: cause.id,
			isRootCause: cause.isRootCause === true,
			parentId: cause.parentId,
			statement: cause.statement,
		})),
	);
	const expectedRoots = actualCase.causes.filter((cause) => cause.isRootCause === true);
	const actionLinksToNonLeaf = finalActions.filter((action) => {
		if (!action.causeNodeId) {
			return false;
		}
		return (graph.childrenById.get(action.causeNodeId) ?? []).length > 0;
	}).length;
	const blameStatements = finalNodes
		.map((node) => node.statement)
		.filter(looksBlameCentred);

	return [
		{
			category: "cause_graph",
			evidence:
				expectedLinkCount === 0
					? "Actual Case has no persisted parent/child cause links to compare."
					: `${preservedLinkCount}/${expectedLinkCount} Actual Case parent-child cause links are preserved in the final graph.`,
			name: "actual cause links preserved",
			status:
				expectedLinkCount === 0
					? "warn"
					: preservedLinkCount >= expectedLinkCount
						? "pass"
						: preservedLinkCount > 0
							? "warn"
							: "fail",
			weight: 6,
		},
		{
			category: "cause_graph",
			evidence: `actualMaxDepth=${actualGraph.maxDepth}, finalMaxDepth=${graph.maxDepth}, finalNodes=${finalNodes.length}`,
			name: "cause graph has linked depth",
			status:
				actualGraph.maxDepth <= 1
					? finalNodes.length > 0
						? "pass"
						: "fail"
					: graph.maxDepth >= Math.min(actualGraph.maxDepth, 2)
						? "pass"
						: "fail",
			weight: 5,
		},
		{
			category: "cause_graph",
			evidence:
				expectedRoots.length > 0
					? `expectedRoots=${expectedRoots.length}, finalRoots=${graph.rootNodes.length}, rootsWithChildren=${graph.rootWithChildren.length}`
					: `finalRoots=${graph.rootNodes.length}, rootsWithChildren=${graph.rootWithChildren.length}`,
			name: "root marks deepest actionable causes",
			status:
				expectedRoots.length > 0
					? graph.rootNodes.length > 0 && graph.rootWithChildren.length === 0
						? "pass"
						: "fail"
					: graph.rootWithChildren.length === 0
						? graph.rootNodes.length > 0 || finalNodes.length <= 1
							? "pass"
							: "warn"
						: "fail",
			weight: 5,
		},
		{
			category: "cause_graph",
			evidence: `${actionLinksToNonLeaf}/${finalActions.length} final actions are linked to causes that still have child causes below them.`,
			name: "actions target terminal causes",
			status:
				finalActions.length === 0
					? actualCase.measures.length === 0
						? "pass"
						: "warn"
					: actionLinksToNonLeaf === 0
						? "pass"
						: "fail",
			weight: 4,
		},
		{
			category: "cause_graph",
			evidence:
				blameStatements.length > 0
					? blameStatements.map((statement) => `"${statement}"`).join("; ")
					: "No blame-centred cause wording detected.",
			name: "cause language is blame-free",
			status: blameStatements.length === 0 ? "pass" : "fail",
			weight: 4,
		},
	];
}

function managerOutputChecks(input: {
	readonly actualCase: ActualCase;
	readonly finalRecord: {
		readonly causeActions?: readonly JsonRecord[];
		readonly causeNodes?: readonly JsonRecord[];
		readonly facts?: readonly JsonRecord[];
		readonly incident?: JsonRecord;
		readonly timelineEvents?: readonly JsonRecord[];
	};
	readonly revealedActionFacts: readonly CaseStudyFact[];
	readonly revealedFactsCaptured: readonly CaseStudyFact[];
}): readonly CaseStudyCheck[] {
	const incident = input.finalRecord.incident ?? {};
	const finalNodes = normalizeFinalCauseNodes(input.finalRecord.causeNodes ?? []);
	const finalActions = normalizeFinalActions(input.finalRecord.causeActions ?? []);
	const timelineCount = (input.finalRecord.timelineEvents ?? []).filter((event) =>
		Boolean(stringField(event, "text", "narrative", "title")),
	).length;
	const factCount = (input.finalRecord.facts ?? []).filter((factRow) =>
		Boolean(stringField(factRow, "text")),
	).length;
	const hasTitle = Boolean(stringField(incident, "title"));
	const hasWhereOrWhen = Boolean(
		stringField(incident, "location") ??
			stringField(incident, "incidentAt", "incident_at", "incidentTimeNote"),
	);
	const graph = analyseFinalCauseGraph(finalNodes);
	const graphRenderable =
		finalNodes.length > 0 &&
		graph.nodesMissingId === 0 &&
		graph.unknownParentCount === 0 &&
		graph.cycles === 0;
	const linkedActions = finalActions.filter((action) => Boolean(action.causeNodeId));
	const implementableActions = finalActions.filter(isImplementableFinalAction);

	return [
		{
			category: "output_readiness",
			evidence: `title=${hasTitle}, whereOrWhen=${hasWhereOrWhen}, timelineEvents=${timelineCount}, facts=${factCount}, capturedFacts=${input.revealedFactsCaptured.length}`,
			name: "manager one-pager has event story",
			status:
				hasTitle &&
				hasWhereOrWhen &&
				timelineCount > 0 &&
				input.revealedFactsCaptured.length > 0
					? "pass"
					: hasTitle && (timelineCount > 0 || factCount > 0)
						? "warn"
						: "fail",
			weight: 5,
		},
		{
			category: "output_readiness",
			evidence: `${finalNodes.length} cause nodes, renderable=${graphRenderable}, unknownParents=${graph.unknownParentCount}, cycles=${graph.cycles}`,
			name: "one-pager cause tree can render",
			status:
				finalNodes.length === 0
					? input.actualCase.causes.length === 0
						? "warn"
						: "fail"
					: graphRenderable
						? "pass"
						: "fail",
			weight: 5,
		},
		{
			category: "output_readiness",
			evidence: `${linkedActions.length}/${finalActions.length} actions linked; ${implementableActions.length}/${finalActions.length} actions have description, owner, and due date.`,
			name: "manager actions are follow-up ready",
			status:
				input.revealedActionFacts.length === 0
					? input.actualCase.measures.length === 0
						? "pass"
						: "warn"
					: finalActions.length > 0 &&
						  linkedActions.length === finalActions.length &&
						  implementableActions.length === finalActions.length
						? "pass"
						: "fail",
			weight: 5,
		},
		{
			category: "output_readiness",
			evidence: `causes=${finalNodes.length}, actions=${finalActions.length}, timelineEvents=${timelineCount}`,
			name: "one-pager draft has all three sections",
			status:
				timelineCount > 0 && finalNodes.length > 0 && finalActions.length > 0
					? "pass"
					: timelineCount > 0 && (finalNodes.length > 0 || finalActions.length > 0)
						? "warn"
						: "fail",
			weight: 4,
		},
	];
}

function measuresCheck(
	actualCase: ActualCase,
	finalRecord: { readonly causeActions?: readonly JsonRecord[] },
	recordText: string,
	revealedActionFacts: readonly CaseStudyFact[],
): CaseStudyCheck {
	if (actualCase.measures.length === 0) {
		return weightedCheck(
			"measures",
			"actual measures captured",
			5,
			true,
			"Actual Case contains no measures; measures are not required for this run.",
		);
	}

	if (revealedActionFacts.length === 0) {
		return {
			category: "measures",
			evidence:
				"Actual Case has measures, but no measure facts were revealed by the simulated user in this run.",
			name: "actual measures captured",
			status: "warn",
			weight: 5,
		};
	}

	return ratioCheck(
		"measures",
		"actual measures captured",
		5,
		countThemes(
			recordText,
			revealedActionFacts.map((fact) => fact.text),
		),
		revealedActionFacts.length,
		`${finalRecord.causeActions?.length ?? 0} final actions for ${revealedActionFacts.length} revealed action facts.`,
	);
}

function operationSafetyChecks(
	actualCase: ActualCase,
	finalRecord: {
		readonly causeActions?: readonly JsonRecord[];
		readonly facts?: readonly JsonRecord[];
	},
	revealedActionFacts: readonly CaseStudyFact[],
): readonly CaseStudyCheck[] {
	const actions = finalRecord.causeActions ?? [];
	const factText = normalize(JSON.stringify(finalRecord.facts ?? []));
	const revealedActionText = normalize(revealedActionFacts.map((fact) => fact.text).join(" "));
	const measuresStoredAsFacts = countThemes(
		factText,
		actualCase.measures.map((measure) => measure.description),
	);
	const fabricatedOwnerOrDue = actions.filter((action) => {
		const owner = stringField(action, "ownerRole", "owner_role");
		const dueDate = stringField(action, "dueDate", "due_date");
		return (
			(owner && !revealedActionText.includes(normalize(owner))) ||
			(dueDate && !revealedActionText.includes(normalize(dueDate)))
		);
	}).length;

	return [
		weightedCheck(
			"operation_safety",
			"no action fabrication before measures",
			3,
			revealedActionFacts.length > 0 || actions.length === 0,
			"No corrective actions should be persisted before the study reveals agreed measures.",
		),
		weightedCheck(
			"operation_safety",
			"measures kept out of facts",
			4,
			measuresStoredAsFacts === 0,
			`${measuresStoredAsFacts} Actual Case measure descriptions appear in facts instead of actions.`,
		),
		{
			category: "operation_safety",
			evidence:
				revealedActionFacts.length === 0
					? "No measure facts were revealed; owner/date fabrication cannot be scored."
					: `${fabricatedOwnerOrDue}/${actions.length} actions contain owner or due-date values not revealed by the Actual Case measure facts.`,
			name: "no fabricated owner or due date",
			status:
				revealedActionFacts.length === 0
					? "warn"
					: fabricatedOwnerOrDue === 0
						? "pass"
						: "fail",
			weight: 4,
		},
	];
}

function normalizeFinalCauseNodes(rows: readonly JsonRecord[]): readonly FinalCauseNode[] {
	return rows
		.map((row, index) => {
			const statement =
				stringField(row, "statement", "label", "text") ??
				stringField(row, "question") ??
				"";
			return {
				id: stringField(row, "id"),
				isRootCause:
					booleanField(row, "isRootCause", "is_root_cause") ||
					stringField(row, "branchStatus", "branch_status") === "ROOT_REACHED",
				parentId: stringField(row, "parentId", "parent_id"),
				statement,
				...(stringField(row, "branchStatus", "branch_status")
					? { branchStatus: stringField(row, "branchStatus", "branch_status") }
					: {}),
			};
		})
		.filter((node) => node.statement.trim().length > 0);
}

function normalizeFinalActions(rows: readonly JsonRecord[]): readonly FinalAction[] {
	return rows.map((row) => ({
		causeNodeId: stringField(row, "causeNodeId", "cause_node_id", "linkedCauseNodeId"),
		description: stringField(row, "description", "title"),
		dueDate: stringField(row, "dueDate", "due_date"),
		ownerRole: stringField(row, "ownerRole", "owner_role", "owner"),
	}));
}

function analyseFinalCauseGraph(nodes: readonly FinalCauseNode[]): CauseGraphAnalysis {
	const byId = new Map<string, FinalCauseNode>();
	let nodesMissingId = 0;

	for (const [index, node] of nodes.entries()) {
		const id = node.id ?? `__cause_${index + 1}`;
		if (!node.id) {
			nodesMissingId += 1;
		}
		byId.set(id, { ...node, id });
	}

	const childrenById = new Map<string, FinalCauseNode[]>();
	let unknownParentCount = 0;
	const roots: FinalCauseNode[] = [];

	for (const node of byId.values()) {
		const parentId = node.parentId;
		if (parentId && parentId !== node.id && byId.has(parentId)) {
			const siblings = childrenById.get(parentId) ?? [];
			siblings.push(node);
			childrenById.set(parentId, siblings);
		} else {
			if (parentId && parentId !== node.id) {
				unknownParentCount += 1;
			}
			roots.push(node);
		}
	}

	let cycles = 0;
	let maxDepth = 0;
	const visited = new Set<string>();
	const active = new Set<string>();

	const walk = (node: FinalCauseNode, depth: number): void => {
		const id = node.id;
		if (!id) {
			return;
		}
		if (active.has(id)) {
			cycles += 1;
			return;
		}
		if (visited.has(id)) {
			return;
		}

		active.add(id);
		visited.add(id);
		maxDepth = Math.max(maxDepth, depth);

		for (const child of childrenById.get(id) ?? []) {
			walk(child, depth + 1);
		}

		active.delete(id);
	};

	for (const root of roots) {
		walk(root, 1);
	}

	for (const node of byId.values()) {
		if (node.id && !visited.has(node.id)) {
			walk(node, 1);
		}
	}

	const rootNodes = [...byId.values()].filter((node) => node.isRootCause);
	const rootWithChildren = rootNodes.filter((node) =>
		Boolean(node.id && (childrenById.get(node.id) ?? []).length > 0),
	);

	return {
		childrenById,
		cycles,
		maxDepth,
		nodesMissingId,
		rootNodes,
		rootWithChildren,
		unknownParentCount,
	};
}

function countPreservedCauseLinks(
	actualCauses: readonly ActualCaseCause[],
	finalNodes: readonly FinalCauseNode[],
): number {
	let preserved = 0;

	for (const actualCause of actualCauses) {
		if (!actualCause.parentId) {
			continue;
		}
		const actualParent = actualCauses.find((candidate) => candidate.id === actualCause.parentId);
		if (!actualParent) {
			continue;
		}
		const finalChild = findFinalCauseByStatement(finalNodes, actualCause.statement);
		const finalParent = findFinalCauseByStatement(finalNodes, actualParent.statement);

		if (
			finalChild?.parentId &&
			finalParent?.id &&
			finalChild.parentId === finalParent.id
		) {
			preserved += 1;
		}
	}

	return preserved;
}

function findFinalCauseByStatement(
	finalNodes: readonly FinalCauseNode[],
	statement: string,
): FinalCauseNode | undefined {
	return finalNodes.find((node) => containsCaseText(normalize(node.statement), statement));
}

function looksBlameCentred(value: string): boolean {
	return /\b(careless|negligent|operator error|human error|not paying attention|should have been more careful|schuld|selber schuld|fahrlässig|fahrlaessig|nachlässig|nachlaessig|unaufmerksam)\b/i.test(
		value,
	);
}

function isImplementableFinalAction(action: FinalAction): boolean {
	return Boolean(
		action.description &&
			action.description.length >= 12 &&
			action.ownerRole &&
			action.dueDate,
	);
}

function booleanField(record: JsonRecord, ...keys: readonly string[]): boolean {
	for (const key of keys) {
		if (typeof record[key] === "boolean") {
			return record[key] === true;
		}
	}
	return false;
}

function ratioCheck(
	category: string,
	name: string,
	weight: number,
	count: number,
	total: number,
	evidence: string,
): CaseStudyCheck {
	const ratio = total > 0 ? count / total : 1;
	return {
		category,
		evidence,
		name,
		status: ratio >= 0.75 ? "pass" : ratio >= 0.4 ? "warn" : "fail",
		weight,
	};
}

function weightedCheck(
	category: string,
	name: string,
	weight: number,
	pass: boolean,
	evidence: string,
): CaseStudyCheck {
	return {
		category,
		evidence,
		name,
		status: pass ? "pass" : "fail",
		weight,
	};
}

function inferExpectedPotentialSeverity(sourceCase: JsonRecord): string | undefined {
	const explicit = parsePotentialSeverity(sourceCase.potential_severity_code);
	const evidenceText = [
		sourceCase.potential_outcome_text,
		sourceCase.actual_injury_outcome,
		sourceCase.actual_severity_code,
		sourceCase.actual_severity_reason,
		sourceCase.injury_nature,
		sourceCase.body_part,
		sourceCase.lost_days,
	]
		.filter(Boolean)
		.join(" ");
	const normalizedSeverity = normalizePotentialSeverityForEvidence(
		explicit ?? "E",
		evidenceText,
	);
	if (!explicit && normalizedSeverity === "E") {
		return undefined;
	}
	return normalizedSeverity;
}

function containsCaseText(recordText: string, factText: string): boolean {
	const tokens = meaningfulTokens(factText);
	if (tokens.length === 0) {
		return true;
	}
	const hits = tokens.filter((token) => recordText.includes(token)).length;
	return hits / tokens.length >= 0.35;
}

function asRecord(value: unknown): JsonRecord {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as JsonRecord)
		: {};
}

function isImplementableAction(action: JsonRecord): boolean {
	const description = stringField(action, "description");
	const owner = stringField(action, "ownerRole", "owner_role");
	const dueDate = stringField(action, "dueDate", "due_date");
	return Boolean(description && description.length >= 12 && owner && dueDate);
}

function stringField(record: JsonRecord, ...keys: readonly string[]): string | undefined {
	for (const key of keys) {
		const value = record[key];
		if (typeof value === "string" && value.trim()) {
			return value.trim();
		}
		if (value instanceof Date) {
			return value.toISOString();
		}
	}
	return undefined;
}

function countThemes(recordText: string, themes: readonly string[]): number {
	return themes.filter((theme) => containsCaseText(recordText, theme)).length;
}

function meaningfulTokens(value: string): string[] {
	return normalize(value)
		.split(/[^\p{L}\p{N}]+/u)
		.map((token) => token.trim())
		.filter((token) => token.length >= 4)
		.filter(
			(token) =>
				![
					"aber",
					"auch",
					"beim",
					"dass",
					"eine",
					"einer",
					"einen",
					"oder",
					"then",
					"there",
					"this",
					"with",
					"wurde",
					"wurden",
				].includes(token),
		)
		.slice(0, 16);
}

function categoryScores(checks: readonly CaseStudyCheck[]) {
	const categories: Record<string, { earned: number; total: number; score: number }> = {};
	for (const check of checks) {
		const category = categories[check.category] ?? { earned: 0, score: 0, total: 0 };
		category.total += check.weight;
		category.earned +=
			check.status === "pass" ? check.weight : check.status === "warn" ? check.weight / 2 : 0;
		category.score = Number((category.earned / category.total).toFixed(3));
		categories[check.category] = category;
	}
	return categories;
}

function grade(score: number): string {
	if (score >= 0.9) return "strong";
	if (score >= 0.75) return "usable-with-issues";
	if (score >= 0.6) return "weak";
	return "failing";
}

function dedupeFacts(facts: readonly CaseStudyFact[]): readonly CaseStudyFact[] {
	const seen = new Set<string>();
	const result: CaseStudyFact[] = [];
	for (const item of facts) {
		const key = normalize(item.text);
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		result.push(item);
	}
	return result;
}

function fallbackOpening(sourceCase: JsonRecord): string {
	return [sourceCase.title, sourceCase.location, sourceCase.work_activity]
		.filter(Boolean)
		.join(". ");
}

function fallbackNoMatch(language: string): string {
	return language === "de"
		? "Das kann ich aus dem Fall so nicht sicher beantworten. Was möchtest du genauer wissen?"
		: "I cannot answer that from this case with confidence. What do you want to clarify?";
}

function isMethodSwitchMessage(value: string): boolean {
	const text = normalize(value);
	return text.includes("switched the cause method") || text.includes("cause method to");
}

function guessLanguage(value: string): string {
	return /der |die |das |und |nicht |fräs|späne|unfall/i.test(value) ? "de" : "en";
}

function uniqueText(values: readonly string[]): readonly string[] {
	const seen = new Set<string>();
	const result = [];
	for (const value of values) {
		const text = value.trim();
		const key = normalize(text);
		if (!text || seen.has(key)) {
			continue;
		}
		seen.add(key);
		result.push(text);
	}
	return result;
}

function normalize(value: unknown): string {
	return String(value ?? "").toLowerCase().normalize("NFC");
}

function safeId(value: string): string {
	return value
		.toLowerCase()
		.normalize("NFC")
		.replace(/[^\p{L}\p{N}]+/gu, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

function stringOrUndefined(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value : undefined;
}
