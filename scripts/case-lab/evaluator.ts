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

export type CaseLabRecord = {
	readonly incident?: JsonRecord;
	readonly facts?: readonly JsonRecord[];
	readonly timelineEvents?: readonly JsonRecord[];
	readonly causeNodes?: readonly JsonRecord[];
	readonly causeActions?: readonly JsonRecord[];
	readonly persons?: readonly JsonRecord[];
};

export type CaseLabCheck = {
	readonly category: string;
	readonly evidence: string;
	readonly hardFailure?: boolean;
	readonly name: string;
	readonly status: "pass" | "warn" | "fail";
	readonly weight: number;
};

export type CaseLabEvaluation = {
	readonly checks: readonly CaseLabCheck[];
	readonly summary: {
		readonly byCategory: Record<string, { earned: number; total: number; score: number }>;
		readonly criteriaVersion: string;
		readonly earnedWeight: number;
		readonly grade: string;
		readonly hardFailures: readonly Pick<CaseLabCheck, "category" | "evidence" | "name">[];
		readonly score: number;
		readonly totalWeight: number;
	};
};

export const CASE_LAB_CRITERIA_VERSION = "case-lab-criteria-v0.1.0";

export function evaluateInvestigation(input: {
	readonly sourceBundle: CaseBundle;
	readonly finalRecord: CaseLabRecord;
	readonly transcript: readonly JsonRecord[];
}): CaseLabEvaluation {
	const sourceText = JSON.stringify(input.sourceBundle).toLowerCase();
	const recordText = JSON.stringify(input.finalRecord).toLowerCase();
	const sourceHasIncidentDate = mentionsJuneThirteenthEvent(sourceText);
	const assistantTurns = input.transcript
		.map((turn) => String(((turn.assistant as JsonRecord | undefined)?.content) ?? ""))
		.join("\n")
		.toLowerCase();
	const finalIncident = input.finalRecord.incident ?? {};
	const sourceCase = input.sourceBundle.case ?? {};
	const checks: CaseLabCheck[] = [
		weightedCheck(
			"fact_capture",
			"HCN context and location",
			4,
			/hcn/.test(recordText) && /annex|building 2|bldg/.test(recordText),
			"Captures HCN and Building 2/Annex context.",
		),
		weightedCheck(
			"fact_capture",
			"concentration range",
			3,
			/4\.1/.test(recordText) && /15\.1/.test(recordText),
			"Captures 4.1-15.1 ppm range.",
		),
		weightedCheck(
			"fact_capture",
			"alarm thresholds",
			3,
			/2\s*ppm|2ppm/.test(recordText) && /3\s*ppm|3ppm/.test(recordText),
			"Captures hi and hi-hi thresholds.",
		),
		weightedCheck(
			"fact_capture",
			"lone worker warning failure",
			4,
			/alone|lone/.test(recordText) && /radio/.test(recordText),
			"Captures lone operator missed radio warning.",
		),
		weightedCheck(
			"fact_capture",
			"noise barrier",
			3,
			/vacuum pump/.test(recordText),
			"Captures loud vacuum pump as warning barrier.",
		),
		weightedCheck(
			"fact_capture",
			"persistent monitor readings",
			4,
			/1\.1/.test(recordText) && /monitor/.test(recordText),
			"Captures persistent 1.1 ppm monitor readings.",
		),
		incidentDateCapturedCheck(finalIncident, sourceHasIncidentDate),
		weightedCheck(
			"classification",
			"incident type",
			3,
			finalIncident.incidentType === "NEAR_MISS",
			"Classifies as near miss.",
		),
		weightedCheck(
			"classification",
			"actual outcome",
			3,
			finalIncident.actualInjuryOutcome === "NO_INJURY",
			"Classifies no actual injury.",
		),
		weightedCheck(
			"classification",
			"hazard and event",
			4,
			finalIncident.hazardCategoryCode === "HAZARDOUS_SUBSTANCES" &&
				finalIncident.eventType === "HARMFUL_EXPOSURE",
			"Classifies hazardous substance harmful exposure.",
		),
		severityConsistencyCheck(finalIncident, sourceCase),
		weightedCheck(
			"investigation_logic",
			"conditions not blame",
			4,
			!/\b(operator|supervisor)\s+(failed|forgot|ignored|careless|negligent)\b/.test(recordText),
			"Avoids blame-worded cause framing.",
		),
		weightedCheck(
			"investigation_logic",
			"open branches not fake root causes",
			3,
			(input.finalRecord.causeNodes ?? []).every(
				(node) => node.branchStatus === "OPEN" && node.isRootCause === false,
			),
			"Leaves incomplete branches open.",
		),
		weightedCheck(
			"investigation_logic",
			"necessary branches",
			5,
			/source|exceed|threshold|hcn levels/.test(recordText) &&
				/audible|radio|warning|vacuum/.test(recordText) &&
				/monitor|1\.1|persistent/.test(recordText),
			"Tracks source/exposure, warning audibility, and monitoring escalation branches.",
		),
		weightedCheck(
			"next_question",
			"asks useful next question",
			4,
			/\?/.test(assistantTurns) &&
				/source|cause|why|what conditions|date|time|escalat|monitor/.test(assistantTurns),
			"Asks a case-progressing next question.",
		),
		weightedCheck(
			"operation_safety",
			"does not fabricate actions",
			4,
			(input.finalRecord.causeActions ?? []).length === 0 || /measure|action|owner|by/.test(sourceText),
			"Does not create corrective actions when the user gave none.",
		),
		weightedCheck(
			"operation_safety",
			"does not fabricate exact incident timestamp",
			3,
			finalIncident.incidentAt === null || sourceCase.incident_at !== null || sourceHasIncidentDate,
			"Does not invent exact incident timestamp.",
		),
		weightedCheck(
			"method_switch",
			"method turns are operation-free",
			3,
			input.transcript
				.slice(1)
				.every(
					(turn) =>
						(((turn.assistant as JsonRecord | undefined)?.operations as unknown[] | undefined)
							?.length ?? 0) === 0,
				),
			"Method switch acknowledgement turns do not mutate record.",
		),
		weightedCheck(
			"method_switch",
			"final method",
			2,
			finalIncident.causeMethod === "URSACHENBAUM",
			"Final cause method matches the last UI switch.",
		),
	];
	const totalWeight = checks.reduce((sum, check) => sum + check.weight, 0);
	const earnedWeight = checks.reduce(
		(sum, check) =>
			sum + (check.status === "pass" ? check.weight : check.status === "warn" ? check.weight / 2 : 0),
		0,
	);
	const byCategory = categoryScores(checks);
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
			byCategory,
			criteriaVersion: CASE_LAB_CRITERIA_VERSION,
			earnedWeight,
			grade: hardFailures.length > 0 ? "failing-critical" : grade(earnedWeight / totalWeight),
			hardFailures,
			score: Number((earnedWeight / totalWeight).toFixed(3)),
			totalWeight,
		},
	};
}

export function evaluationMarkdown(evaluation: CaseLabEvaluation): string {
	const lines = [
		"# Case Lab Evaluation",
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

function incidentDateCapturedCheck(
	incident: JsonRecord,
	sourceHasIncidentDate: boolean,
): CaseLabCheck {
	if (!sourceHasIncidentDate) {
		return {
			category: "timeline_quality",
			evidence: "Source text did not expose the known 6/13 event-date fixture.",
			name: "incident date captured",
			status: "warn",
			weight: 4,
		};
	}

	const incidentAt = incident.incidentAt;
	const iso =
		incidentAt instanceof Date
			? incidentAt.toISOString()
			: typeof incidentAt === "string"
				? incidentAt
				: "";
	return weightedCheck(
		"timeline_quality",
		"incident date captured",
		4,
		Boolean(iso) && /-06-13(?:t|T)/.test(iso),
		`source mentions 6/13 event, incidentAt=${JSON.stringify(incidentAt)}`,
	);
}

function weightedCheck(
	category: string,
	name: string,
	weight: number,
	pass: boolean,
	evidence: string,
): CaseLabCheck {
	return {
		category,
		evidence,
		name,
		status: pass ? "pass" : "fail",
		weight,
	};
}

export function severityConsistencyCheck(incident: JsonRecord, sourceCase: JsonRecord): CaseLabCheck {
	const finalText = String(incident.potentialOutcomeText ?? "");
	const sourceText = String(sourceCase.potential_outcome_text ?? sourceCase.potentialOutcomeText ?? "");
	const text = `${sourceText}\n${finalText}`.toLowerCase();
	const code = incident.potentialSeverityCode;
	const fatalText = /fatal|death|kill|killed|lethal/.test(text);
	const seriousText = /serious|irreversible|poison|toxic|respiratory/.test(text);
	const status = !fatalText && !seriousText
		? code
			? "warn"
			: "fail"
		: fatalText
			? code === "A"
				? "pass"
				: "fail"
			: code === "A" || code === "B"
				? "pass"
				: "fail";
	return {
		category: "classification",
		evidence: `sourcePotentialOutcomeText=${JSON.stringify(sourceText)}, replayPotentialOutcomeText=${JSON.stringify(finalText)}, replayPotentialSeverityCode=${JSON.stringify(code)}`,
		hardFailure: status === "fail",
		name: "potential severity consistency",
		status,
		weight: 8,
	};
}

function mentionsJuneThirteenthEvent(text: string): boolean {
	return /\b6\s*[/-]\s*13\b/.test(text) || /\b13\s*[./-]\s*6\b/.test(text);
}

function categoryScores(checks: readonly CaseLabCheck[]) {
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
