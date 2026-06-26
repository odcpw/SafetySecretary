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
	readonly lastNoMatch?: boolean;
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

export const CASE_STUDY_CRITERIA_VERSION = "case-study-criteria-v0.4.0";

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
		return {
			matchedTopics: ["opening"],
			message: input.study.actualCase.narrative.opening,
			reason: "opening",
			revealedFactIds: [],
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

	if (input.state.lastNoMatch) {
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
	const matching = simulationFactsForActualCase(study.actualCase)
		.filter((item) => !item.required && !revealed.has(item.id))
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
		measuresCheck(actualCase, input.finalRecord, recordText, revealedActionFacts),
		weightedCheck(
			"operation_safety",
			"no empty action fabrication",
			4,
			revealedActionFacts.length > 0 || (input.finalRecord.causeActions ?? []).length === 0,
			"No corrective actions should be invented before the study reveals agreed measures.",
		),
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
		...actualCase.measures.map((measure, index) =>
			fact(
				`action-${index + 1}`,
				measure.description,
				"action",
				false,
				measure.evidence ?? [],
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
): CaseStudyFact {
	return {
		evidence,
		id,
		required,
		source,
		text,
		topics: topicsForText(text),
	};
}

function topicsForText(value: string): readonly string[] {
	const text = normalize(value);
	const topics = new Set<string>();
	if (/wann|dienstag|montag|mittwoch|donnerstag|freitag|samstag|sonntag|uhr|\btime\b|date|morning|yesterday|\b6\/13\b/.test(text)) {
		topics.add("timing");
	}
	if (/finger|amput|verkürzt|verkurzt|verkuerzt|chirurgie|rettungsdienst|hospital|spital|verletz|injur|fatal|death|poison|exposure/.test(text)) {
		topics.add("injury-outcome");
	}
	if (/warum|weil|damit|because|cause|grund|toleranz|oberfl|sicht|reflex/.test(text)) {
		topics.add("work-context");
	}
	if (/massstab|maßstab|spänehaken|spaenehaken|druckluft|fräser|fraeser|fräs|maschine|tool|radio|alarm|monitor|vacuum|pump|ppm|hcn/.test(text)) {
		topics.add("equipment");
	}
	if (/instruiert|instruktion|weisung|geschult|training|aware|bewusst|verbot/.test(text)) {
		topics.add("training");
	}
	if (/leiter|hans|muster|morgen|frist|massnahme|maßnahme|action|owner|by /.test(text)) {
		topics.add("measures");
	}
	if (/allein|alone|lone|supervisor|console|shift/.test(text)) {
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
	if (/\?/.test(value) || /frage|klär|klar|confirm|tell me|what|wann|warum|wer|wie|gab es/.test(text)) {
		for (const topic of topicsForText(text)) {
			topics.add(topic);
		}
	}
	if (/what happened|was ist passiert|ablauf|sequence|nächste|next/.test(text)) {
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
	return {
		category: "classification",
		evidence: `expected=${JSON.stringify(expected)}, actual=${JSON.stringify(actual)}, outcome=${JSON.stringify(actualCase.classification.potentialOutcomeText)}`,
		hardFailure: status === "fail" && Boolean(expected),
		name: "potential severity",
		status,
		weight: 8,
	};
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
	const explicit = stringOrUndefined(sourceCase.potential_severity_code);
	const text = normalize(
		[
			sourceCase.potential_outcome_text,
			sourceCase.actual_injury_outcome,
			sourceCase.actual_severity_code,
			sourceCase.injury_nature,
		]
			.filter(Boolean)
			.join(" "),
	);
	if (
		/fatal|death|killed|lethal|tod|tödlich|toedlich/.test(text) ||
		hasCredibleFatalToxicExposure(text)
	) {
		return "A";
	}
	if (/amput|irreversible|bleibend|permanent|verkürzt|verkurzt|verkuerzt|funktionsbeeinträchtigung|funktionsbeeintrachtigung|invalid/.test(text)) {
		return "B";
	}
	if (/hospital|spital|chirurgie|luks|lost time|arbeitsausfall|ausfall/.test(text)) {
		return "C";
	}
	if (/doctor|arzt|rettungsdienst|medical/.test(text)) {
		return "D";
	}
	return explicit;
}

function hasCredibleFatalToxicExposure(text: string): boolean {
	const hasToxicAgent =
		/\b(hcn|hydrogen cyanide|cyanide|cyanwasserstoff|zyanwasserstoff|blausäure|blausaure|blausaeure)\b/.test(
			text,
		) || /\b(toxic|toxisch|poison|poisoning|vergiftung|gas)\b/.test(text);
	const hasExposurePath =
		/\b(exposure|exposed|inhale|inhalation|poisoning|respiratory|alarm|ppm|monitor|evacuat|delayed|missed|lone|alone|continued|weiter|verzögert|verzoegert|verzogert|alarmierung)\b/.test(
			text,
		);
	return hasToxicAgent && hasExposurePath;
}

function containsCaseText(recordText: string, factText: string): boolean {
	const tokens = meaningfulTokens(factText);
	if (tokens.length === 0) {
		return true;
	}
	const hits = tokens.filter((token) => recordText.includes(token)).length;
	return hits / tokens.length >= 0.35;
}

function countThemes(recordText: string, themes: readonly string[]): number {
	return themes.filter((theme) => containsCaseText(recordText, theme)).length;
}

function meaningfulTokens(value: string): string[] {
	return normalize(value)
		.split(/[^a-z0-9äöüßéèàç]+/i)
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
	return [sourceCase.title, sourceCase.immediate_cause, sourceCase.potential_outcome_text]
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
