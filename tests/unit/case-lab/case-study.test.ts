import assert from "node:assert/strict";
import { describe, test } from "node:test";

const {
	buildCaseStudyFromBundle,
	evaluateCaseStudyRun,
	nextCaseStudyUserTurn,
} = (await import(
	new URL("../../../scripts/case-lab/case-study.ts", import.meta.url).href
)) as typeof import("../../../scripts/case-lab/case-study");

describe("case study replay model", () => {
	test("builds a mechanical amputation study with mechanical expectations, not HCN criteria", () => {
		const study = buildCaseStudyFromBundle(mechanicalBundle());

		assert.equal(study.version, 1);
		assert.equal(study.actualCase.classification.hazardCategoryCode, "MECHANICAL");
		assert.equal(study.actualCase.classification.eventType, "CUT_PUNCTURE");
		assert.equal(study.actualCase.classification.potentialSeverityCode, "B");
		assert.equal(
			study.actualCase.facts.some((fact) => fact.text.includes("Rettungsdienst")),
			true,
		);
		assert.equal(study.actualCase.facts[0]?.id, "user-opening");
		assert.match(study.actualCase.id, /spänen/);
		assert.match(study.actualCase.id, /fräser/);
		assert.equal("expected" in study, false);
		assert.equal("facts" in study, false);
		assert.equal("causeThemes" in study, false);
		assert.equal("actionThemes" in study, false);
		assert.equal(
			JSON.stringify(study).toLowerCase().includes("hcn"),
			false,
			"mechanical study must not inherit HCN-specific criteria",
		);
	});

	test("extracts an Actual Case as the canonical benchmark artifact", () => {
		const study = buildCaseStudyFromBundle(mechanicalBundle());
		const { actualCase } = study;

		assert.match(actualCase.narrative.summary, /Fräsmaschine/);
		assert.match(actualCase.narrative.summary, /Metallmassstab/);
		assert.equal(actualCase.classification.potentialSeverityCode, "B");
		assert.equal(actualCase.facts.some((fact) => fact.id === "case-field-location"), true);
		assert.equal(
			actualCase.facts.some((fact) => fact.text.includes("Mechanische Werkstatt")),
			true,
		);
		assert.equal(actualCase.facts.some((fact) => fact.source === "action"), false);
		assert.deepEqual(
			actualCase.causes.map((cause) => cause.statement),
			[
				"Der Metallmassstab war unmittelbar verfügbar und die Einzugsgefahr war nicht bewusst.",
			],
		);
		assert.deepEqual(
			actualCase.measures.map((measure) => measure.description),
			["Spänehaken an der Maschine bereitstellen und Nutzung instruieren."],
		);
	});

	test("infers fatal HCN potential as A even when the stored production code is wrong", () => {
		const study = buildCaseStudyFromBundle({
			case: {
				content_language: "en",
				hazard_category_code: "HAZARDOUS_SUBSTANCES",
				incident_type: "NEAR_MISS",
				potential_outcome_text: "Potential fatal toxic HCN exposure.",
				potential_severity_code: "E",
				title: "HCN alarm",
			},
			coachMessages: [],
		});

		assert.equal(study.actualCase.classification.potentialSeverityCode, "A");
	});

	test("infers fatal HCN potential from alarm exposure facts without literal fatal wording", () => {
		const study = buildCaseStudyFromBundle({
			case: {
				content_language: "en",
				hazard_category_code: "HAZARDOUS_SUBSTANCES",
				incident_type: "NEAR_MISS",
				potential_outcome_text:
					"HCN alarm readings in ppm with delayed evacuation and possible continued exposure.",
				potential_severity_code: "E",
				title: "HCN alarm",
			},
			coachMessages: [],
		});

		assert.equal(study.actualCase.classification.potentialSeverityCode, "A");
	});

	test("infers fatal Blausäure potential without removing diacritics", () => {
		const study = buildCaseStudyFromBundle({
			case: {
				content_language: "de",
				hazard_category_code: "HAZARDOUS_SUBSTANCES",
				incident_type: "NEAR_MISS",
				potential_outcome_text:
					"Blausäure-Alarm in ppm mit verzögerter Evakuation und möglicher weiterer Exposition.",
				potential_severity_code: "E",
				title: "Blausäure-Alarm",
			},
			coachMessages: [],
		});

		assert.equal(study.actualCase.classification.potentialSeverityCode, "A");
		assert.match(study.actualCase.id, /blausäure/);
	});

	test("fact capture tokenization handles accented words as real evidence", () => {
		const study = buildCaseStudyFromBundle({
			case: {
				content_language: "fr",
				incident_type: "NEAR_MISS",
				title: "Incident",
			},
			coachMessages: [{ content: "Îlot côté sûr.", role: "user" }],
		});
		const evaluation = evaluateCaseStudyRun({
			finalRecord: {
				causeActions: [],
				causeNodes: [],
				facts: [],
				incident: {
					incidentType: "NEAR_MISS",
					title: "Incident",
				},
				timelineEvents: [],
			},
			simulationTurns: [{ reason: "opening", revealedFactIds: ["user-opening"] }],
			study,
			transcript: [{ assistant: { content: "Que s'est-il passé ?", operations: [] } }],
		});

		assert.equal(
			evaluation.checks.find((check) => check.name === "revealed facts captured")?.status,
			"fail",
		);
	});

	test("uses a cold fallback opening without leaking the potential outcome", () => {
		const study = buildCaseStudyFromBundle({
			case: {
				content_language: "en",
				hazard_category_code: "HAZARDOUS_SUBSTANCES",
				incident_type: "NEAR_MISS",
				location: "Plating line",
				potential_outcome_text: "Potential fatal toxic HCN exposure.",
				potential_severity_code: "E",
				title: "HCN alarm",
				work_activity: "Tank inspection",
			},
			coachMessages: [],
		});
		const opening = nextCaseStudyUserTurn({
			state: { revealedFactIds: [] },
			study,
		});

		assert.equal(opening.reason, "opening");
		assert.match(opening.message, /HCN alarm/);
		assert.doesNotMatch(opening.message, /fatal|toxic|exposure/i);
		assert.doesNotMatch(study.actualCase.narrative.opening, /Potential fatal toxic HCN exposure/);
	});

	test("adaptive user reveals matching facts only when the coach asks into that topic", () => {
		const study = buildCaseStudyFromBundle(mechanicalBundle());
		const opening = nextCaseStudyUserTurn({
			state: { revealedFactIds: [] },
			study,
		});
		const injury = nextCaseStudyUserTurn({
			assistantText: "Welche Verletzung ist tatsächlich passiert?",
			state: { revealedFactIds: [] },
			study,
		});

		assert.equal(opening.reason, "opening");
		assert.deepEqual(opening.revealedFactIds, ["user-opening"]);
		assert.equal(injury.reason, "answered-question");
		assert.match(injury.message, /Finger|Rettungsdienst|Chirurgie/);
	});

	test("adaptive user can reveal Actual Case causes and measures when the coach investigates them", () => {
		const study = buildCaseStudyFromBundle(mechanicalBundle());
		const cause = nextCaseStudyUserTurn({
			assistantText: "Warum konnte der Metallmassstab in den Fräser geraten?",
			state: { revealedFactIds: ["user-opening"] },
			study,
		});
		const measure = nextCaseStudyUserTurn({
			assistantText: "Welche Massnahme wurde tatsächlich vereinbart?",
			state: { revealedFactIds: ["user-opening"] },
			study,
		});

		assert.equal(cause.reason, "answered-question");
		assert.deepEqual(cause.revealedFactIds, ["cause-1"]);
		assert.match(cause.message, /Einzugsgefahr/);
		assert.equal(measure.reason, "answered-question");
		assert.deepEqual(measure.revealedFactIds, ["action-1"]);
		assert.match(measure.message, /Spänehaken/);
	});

	test("adaptive user handles French and Italian investigation questions", () => {
		const study = buildCaseStudyFromBundle(mechanicalBundle());
		const cause = nextCaseStudyUserTurn({
			assistantText: "Pourquoi cette situation a-t-elle pu arriver ?",
			state: { revealedFactIds: ["user-opening"] },
			study,
		});
		const measure = nextCaseStudyUserTurn({
			assistantText: "Quale misura è stata concordata?",
			state: { revealedFactIds: ["user-opening"] },
			study,
		});

		assert.equal(cause.reason, "answered-question");
		assert.deepEqual(cause.revealedFactIds, ["cause-1"]);
		assert.equal(measure.reason, "answered-question");
		assert.deepEqual(measure.revealedFactIds, ["action-1"]);
	});

	test("measure matching is not triggered by incidental names or by-phrasing", () => {
		const study = buildCaseStudyFromBundle(mechanicalBundle());
		const response = nextCaseStudyUserTurn({
			assistantText: "Was Hans standing by the machine?",
			state: { revealedFactIds: ["user-opening", "user-1", "cause-1"] },
			study,
		});

		assert.notDeepEqual(response.revealedFactIds, ["action-1"]);
	});

	test("adaptive user tolerates three no-match turns before completing", () => {
		const study = buildCaseStudyFromBundle(mechanicalBundle());
		const state = {
			revealedFactIds: [
				...study.actualCase.facts
					.filter((fact) => fact.id !== "user-1")
					.map((fact) => fact.id),
				"cause-1",
				"action-1",
			],
		};
		const first = nextCaseStudyUserTurn({
			assistantText: "Wann genau war das?",
			state,
			study,
		});
		const second = nextCaseStudyUserTurn({
			assistantText: "Wann genau war das?",
			state: { ...state, noMatchCount: 1 },
			study,
		});
		const third = nextCaseStudyUserTurn({
			assistantText: "Wann genau war das?",
			state: { ...state, noMatchCount: 2 },
			study,
		});
		const fourth = nextCaseStudyUserTurn({
			assistantText: "Wann genau war das?",
			state: { ...state, noMatchCount: 3 },
			study,
		});

		assert.equal(first.reason, "no-matching-case-fact");
		assert.equal(second.reason, "no-matching-case-fact");
		assert.equal(third.reason, "no-matching-case-fact");
		assert.equal(fourth.reason, "complete");
		assert.equal(fourth.done, true);
	});

	test("case-study evaluator grades against the Actual Case classification", () => {
		const study = buildCaseStudyFromBundle(mechanicalBundle());
		const evaluation = evaluateCaseStudyRun({
			finalRecord: {
				causeActions: [],
				causeNodes: [
					{
						statement:
							"Der Metallmassstab war unmittelbar verfügbar und die Einzugsgefahr war nicht bewusst.",
					},
				],
				facts: [
					{
						text:
							"Der Unfall ereignete sich an einer konventionellen Fräsmaschine und der Metallmassstab wurde eingezogen.",
					},
					{ text: "Der Finger wurde teilweise verkürzt." },
					{ text: "Der Rettungsdienst behandelte vor Ort." },
				],
				incident: {
					actualInjuryOutcome: "IRREVERSIBLE_INJURY",
					eventType: "CUT_PUNCTURE",
					hazardCategoryCode: "MECHANICAL",
					incidentType: "ACCIDENT",
					potentialOutcomeText:
						"Schwere Schnittverletzung oder Amputation eines Fingers.",
					potentialSeverityCode: "B",
				},
				timelineEvents: [],
			},
			simulationTurns: [
				{ reason: "opening", revealedFactIds: ["user-opening"] },
				{ reason: "answered-question", revealedFactIds: ["user-1"] },
			],
			study,
			transcript: [{ assistant: { content: "Welche Verletzung ist passiert?" } }],
		});

		assert.notEqual(evaluation.summary.grade, "failing-critical");
		assert.equal(evaluation.summary.hardFailures.length, 0);
		assert.equal(
			evaluation.checks.find((check) => check.name === "hazardCategoryCode")?.status,
			"pass",
		);
	});

	test("case-chain evaluation rewards pragmatic linked measures", () => {
		const study = buildCaseStudyFromBundle(mechanicalBundle());
		const evaluation = evaluateCaseStudyRun({
			finalRecord: {
				causeActions: [
					{
						causeNodeId: "cause-final-1",
						description:
							"Spänehaken an der Maschine bereitstellen und Nutzung instruieren.",
						dueDate: "2026-07-01",
						ownerRole: "Werkstattleiter",
					},
				],
				causeNodes: [
					{
						id: "cause-final-1",
						statement:
							"Der Metallmassstab war unmittelbar verfügbar und die Einzugsgefahr war nicht bewusst.",
					},
				],
				facts: [
					{
						text:
							"Der Unfall ereignete sich an einer konventionellen Fräsmaschine und der Metallmassstab wurde eingezogen.",
					},
					{ text: "Der Finger wurde teilweise verkürzt." },
				],
				incident: {
					actualInjuryOutcome: "IRREVERSIBLE_INJURY",
					eventType: "CUT_PUNCTURE",
					hazardCategoryCode: "MECHANICAL",
					incidentType: "ACCIDENT",
					potentialSeverityCode: "B",
				},
				timelineEvents: [],
			},
			simulationTurns: [
				{ reason: "opening", revealedFactIds: ["user-opening"] },
				{ reason: "answered-question", revealedFactIds: ["user-1"] },
				{ reason: "answered-question", revealedFactIds: ["action-1"] },
			],
			study,
			transcript: [{ assistant: { content: "Welche Massnahme wurde vereinbart?", operations: [] } }],
		});
		const chainChecks = evaluation.checks.filter((check) => check.category === "case_chain");

		assert.deepEqual(
			chainChecks.map((check) => [check.name, check.status]),
			[
				["facts lead to causes", "pass"],
				["causes lead to linked measures", "pass"],
				["measures are implementable", "pass"],
			],
		);
	});

	test("case-chain evaluation rejects vague or unlinked measures", () => {
		const study = buildCaseStudyFromBundle(mechanicalBundle());
		const evaluation = evaluateCaseStudyRun({
			finalRecord: {
				causeActions: [{ description: "Besprechen." }],
				causeNodes: [
					{
						id: "cause-final-1",
						statement:
							"Der Metallmassstab war unmittelbar verfügbar und die Einzugsgefahr war nicht bewusst.",
					},
				],
				facts: [
					{
						text:
							"Der Unfall ereignete sich an einer konventionellen Fräsmaschine und der Metallmassstab wurde eingezogen.",
					},
				],
				incident: {
					actualInjuryOutcome: "IRREVERSIBLE_INJURY",
					eventType: "CUT_PUNCTURE",
					hazardCategoryCode: "MECHANICAL",
					incidentType: "ACCIDENT",
					potentialSeverityCode: "B",
				},
				timelineEvents: [],
			},
			simulationTurns: [
				{ reason: "opening", revealedFactIds: ["user-opening"] },
				{ reason: "answered-question", revealedFactIds: ["user-1"] },
				{ reason: "answered-question", revealedFactIds: ["action-1"] },
			],
			study,
			transcript: [{ assistant: { content: "Welche Massnahme wurde vereinbart?", operations: [] } }],
		});
		const linked = evaluation.checks.find(
			(check) => check.name === "causes lead to linked measures",
		);
		const implementable = evaluation.checks.find(
			(check) => check.name === "measures are implementable",
		);

		assert.equal(linked?.status, "fail");
		assert.equal(implementable?.status, "fail");
	});

	test("cause-graph and output-readiness evaluation rewards linked root-cause output", () => {
		const study = buildCaseStudyFromBundle(deepMechanicalBundle());
		const evaluation = evaluateCaseStudyRun({
			finalRecord: {
				causeActions: [
					{
						causeNodeId: "final-root",
						description:
							"Spänehaken an der Maschine bereitstellen und Nutzung beim Schichtstart instruieren.",
						dueDate: "2026-07-01",
						ownerRole: "Werkstattleiter",
					},
				],
				causeNodes: [
					{
						id: "final-surface",
						statement:
							"Späne wurden mit einem Metallmassstab nahe am rotierenden Fräser entfernt.",
					},
					{
						id: "final-root",
						isRootCause: true,
						parentId: "final-surface",
						statement:
							"Ein Spänehaken war an der Maschine nicht verfügbar und die Nutzung war nicht eingeübt.",
					},
				],
				facts: [
					{
						text:
							"Der Unfall ereignete sich an einer konventionellen Fräsmaschine. Als ich versucht habe die Späne mit dem Metallmassstab wegzunehmen, wurde der Massstab eingezogen.",
					},
				],
				incident: {
					actualInjuryOutcome: "IRREVERSIBLE_INJURY",
					eventType: "CUT_PUNCTURE",
					hazardCategoryCode: "MECHANICAL",
					incidentAt: "2026-06-13T09:00:00.000Z",
					incidentType: "ACCIDENT",
					location: "Mechanische Werkstatt",
					potentialSeverityCode: "B",
					title: "Finger geriet beim Entfernen von Spänen in rotierenden Fräser",
				},
				timelineEvents: [
					{
						text:
							"Der Mitarbeiter entfernte Späne an der Fräsmaschine mit einem Metallmassstab; der Massstab wurde eingezogen.",
					},
				],
			},
			simulationTurns: [
				{ reason: "opening", revealedFactIds: ["user-opening"] },
				{ reason: "answered-question", revealedFactIds: ["cause-1"] },
				{ reason: "answered-question", revealedFactIds: ["cause-2"] },
				{ reason: "answered-question", revealedFactIds: ["action-1"] },
			],
			study,
			transcript: [{ assistant: { content: "Welche Massnahme wurde vereinbart?", operations: [] } }],
		});

		assert.equal(
			evaluation.checks.find((check) => check.name === "actual cause links preserved")?.status,
			"pass",
		);
		assert.equal(
			evaluation.checks.find((check) => check.name === "root marks deepest actionable causes")
				?.status,
			"pass",
		);
		assert.equal(
			evaluation.checks.find((check) => check.name === "one-pager draft has all three sections")
				?.status,
			"pass",
		);
	});

	test("cause-graph and output-readiness evaluation rejects shallow blame-centered output", () => {
		const study = buildCaseStudyFromBundle(deepMechanicalBundle());
		const evaluation = evaluateCaseStudyRun({
			finalRecord: {
				causeActions: [
					{
						causeNodeId: "final-surface",
						description: "Besprechen.",
					},
				],
				causeNodes: [
					{
						id: "final-surface",
						isRootCause: true,
						statement: "Operator error: the worker was careless.",
					},
					{
						id: "final-deeper",
						parentId: "final-surface",
						statement:
							"Ein Spänehaken war an der Maschine nicht verfügbar und die Nutzung war nicht eingeübt.",
					},
				],
				facts: [
					{
						text:
							"Der Unfall ereignete sich an einer konventionellen Fräsmaschine.",
					},
				],
				incident: {
					actualInjuryOutcome: "IRREVERSIBLE_INJURY",
					eventType: "CUT_PUNCTURE",
					hazardCategoryCode: "MECHANICAL",
					incidentType: "ACCIDENT",
					potentialSeverityCode: "B",
					title: "Finger geriet beim Entfernen von Spänen in rotierenden Fräser",
				},
				timelineEvents: [],
			},
			simulationTurns: [
				{ reason: "opening", revealedFactIds: ["user-opening"] },
				{ reason: "answered-question", revealedFactIds: ["cause-1"] },
				{ reason: "answered-question", revealedFactIds: ["cause-2"] },
				{ reason: "answered-question", revealedFactIds: ["action-1"] },
			],
			study,
			transcript: [{ assistant: { content: "Welche Massnahme wurde vereinbart?", operations: [] } }],
		});

		assert.equal(
			evaluation.checks.find((check) => check.name === "root marks deepest actionable causes")
				?.status,
			"fail",
		);
		assert.equal(
			evaluation.checks.find((check) => check.name === "actions target terminal causes")?.status,
			"fail",
		);
		assert.equal(
			evaluation.checks.find((check) => check.name === "cause language is blame-free")?.status,
			"fail",
		);
		assert.equal(
			evaluation.checks.find((check) => check.name === "manager actions are follow-up ready")
				?.status,
			"fail",
		);
	});

	test("operation safety rejects measures stored as facts and fabricated metadata", () => {
		const study = buildCaseStudyFromBundle(mechanicalBundle());
		const evaluation = evaluateCaseStudyRun({
			finalRecord: {
				causeActions: [
					{
						causeNodeId: "cause-final-1",
						description:
							"Spänehaken an der Maschine bereitstellen und Nutzung instruieren.",
						dueDate: "2026-08-15",
						ownerRole: "Unbekannt",
					},
				],
				causeNodes: [
					{
						id: "cause-final-1",
						statement:
							"Der Metallmassstab war unmittelbar verfügbar und die Einzugsgefahr war nicht bewusst.",
					},
				],
				facts: [
					{
						text:
							"Spänehaken an der Maschine bereitstellen und Nutzung instruieren.",
					},
				],
				incident: {
					actualInjuryOutcome: "IRREVERSIBLE_INJURY",
					eventType: "CUT_PUNCTURE",
					hazardCategoryCode: "MECHANICAL",
					incidentType: "ACCIDENT",
					potentialSeverityCode: "B",
				},
				timelineEvents: [],
			},
			simulationTurns: [
				{ reason: "opening", revealedFactIds: ["user-opening"] },
				{ reason: "answered-question", revealedFactIds: ["user-1"] },
				{ reason: "answered-question", revealedFactIds: ["action-1"] },
			],
			study,
			transcript: [{ assistant: { content: "Welche Massnahme wurde vereinbart?", operations: [] } }],
		});
		const facts = evaluation.checks.find((check) => check.name === "measures kept out of facts");
		const metadata = evaluation.checks.find(
			(check) => check.name === "no fabricated owner or due date",
		);

		assert.equal(facts?.status, "fail");
		assert.equal(metadata?.status, "fail");
	});

	test("non-fatal severity mismatches are weighted failures, not critical hard failures", () => {
		const study = buildCaseStudyFromBundle(mechanicalBundle());
		const evaluation = evaluateCaseStudyRun({
			finalRecord: {
				causeActions: [],
				causeNodes: [],
				facts: [],
				incident: {
					actualInjuryOutcome: "IRREVERSIBLE_INJURY",
					eventType: "CUT_PUNCTURE",
					hazardCategoryCode: "MECHANICAL",
					incidentType: "ACCIDENT",
					potentialSeverityCode: "C",
				},
				timelineEvents: [],
			},
			simulationTurns: [{ reason: "opening", revealedFactIds: ["user-opening"] }],
			study,
			transcript: [{ assistant: { content: "Welche Verletzung ist passiert?", operations: [] } }],
		});
		const severityCheck = evaluation.checks.find(
			(check) => check.name === "potential severity",
		);

		assert.equal(severityCheck?.status, "fail");
		assert.equal(severityCheck?.hardFailure, false);
		assert.equal(evaluation.summary.hardFailures.length, 0);
		assert.notEqual(evaluation.summary.grade, "failing-critical");
	});

	test("fatal severity mismatches remain hard failures", () => {
		const study = hcnStudy();
		const evaluation = evaluateCaseStudyRun({
			finalRecord: {
				causeActions: [],
				causeNodes: [],
				facts: [],
				incident: {
					hazardCategoryCode: "HAZARDOUS_SUBSTANCES",
					incidentType: "NEAR_MISS",
					potentialSeverityCode: "D",
				},
				timelineEvents: [],
			},
			simulationTurns: [{ reason: "opening", revealedFactIds: ["user-opening"] }],
			study,
			transcript: [
				{
					assistant: {
						content: "I will record that as medical treatment potential.",
						operations: [
							{
								kind: "incident_field_update",
								payload: { field: "potentialSeverityCode", value: "D" },
							},
						],
					},
				},
			],
		});

		assert.equal(evaluation.summary.grade, "failing-critical");
		assert.equal(
			evaluation.summary.hardFailures.some((failure) => failure.name === "potential severity"),
			true,
		);
	});

	test("fatal severity guard rescues are visible as coach reasoning failures", () => {
		const study = hcnStudy();
		const evaluation = evaluateCaseStudyRun({
			finalRecord: {
				causeActions: [],
				causeNodes: [],
				facts: [],
				incident: {
					hazardCategoryCode: "HAZARDOUS_SUBSTANCES",
					incidentType: "NEAR_MISS",
					potentialSeverityCode: "A",
				},
				timelineEvents: [],
			},
			simulationTurns: [{ reason: "opening", revealedFactIds: ["user-opening"] }],
			study,
			transcript: [
				{
					assistant: {
						content: "I will record that as medical treatment potential.",
						operations: [
							{
								kind: "incident_field_update",
								payload: { field: "potentialSeverityCode", value: "D" },
							},
						],
					},
				},
			],
		});
		const reasoning = evaluation.checks.find(
			(check) => check.name === "fatal severity proposed by coach",
		);

		assert.equal(evaluation.summary.hardFailures.length, 0);
		assert.equal(reasoning?.status, "fail");
		assert.match(reasoning?.evidence ?? "", /"D"/);
	});
});

function mechanicalBundle() {
	return {
		case: {
			actual_injury_outcome: "IRREVERSIBLE_INJURY",
			content_language: "de",
			event_type: "CUT_PUNCTURE",
			hazard_category_code: "MECHANICAL",
			incident_type: "ACCIDENT",
			injury_nature: "Finger teilweise verkürzt",
			location: "Mechanische Werkstatt",
			potential_outcome_text:
				"Schwere Schnitt- oder Quetschverletzung am Finger bis hin zu bleibender Funktionsbeeinträchtigung oder Teilamputation.",
			potential_severity_code: "B",
			work_activity: "Späne an der Fräsmaschine entfernen",
			title: "Finger geriet beim Entfernen von Spänen in rotierenden Fräser",
		},
		causeNodes: [
			{
				id: "cause-1",
				statement:
					"Der Metallmassstab war unmittelbar verfügbar und die Einzugsgefahr war nicht bewusst.",
			},
		],
		causeActions: [
			{
				cause_node_id: "cause-1",
				description: "Spänehaken an der Maschine bereitstellen und Nutzung instruieren.",
				due_date: "2026-07-01",
				id: "measure-1",
				owner_role: "Werkstattleiter",
			},
		],
		coachMessages: [
			{
				content:
					"Der Unfall ereignete sich an einer konventionellen Fräsmaschine. Als ich versucht habe die Späne mit dem Metallmassstab wegzunehmen, wurde der Massstab eingezogen.",
				role: "user",
			},
			{ content: "Danke.", role: "assistant" },
			{
				content:
					"Finger teilweise verkürzt und ich wurde vom Rettungsdienst vor Ort behandelt und anschliessend in die Chirurgie im LUKS überführt",
				role: "user",
			},
		],
	};
}

function hcnStudy() {
	return buildCaseStudyFromBundle({
		case: {
			content_language: "en",
			hazard_category_code: "HAZARDOUS_SUBSTANCES",
			incident_type: "NEAR_MISS",
			potential_outcome_text:
				"HCN alarm readings in ppm with delayed evacuation and possible continued exposure.",
			potential_severity_code: "E",
			title: "HCN alarm",
		},
		coachMessages: [],
	});
}

function deepMechanicalBundle() {
	return {
		...mechanicalBundle(),
		causeNodes: [
			{
				id: "cause-surface",
				statement:
					"Späne wurden mit einem Metallmassstab nahe am rotierenden Fräser entfernt.",
			},
			{
				id: "cause-root",
				is_root_cause: true,
				parent_id: "cause-surface",
				statement:
					"Ein Spänehaken war an der Maschine nicht verfügbar und die Nutzung war nicht eingeübt.",
			},
		],
		causeActions: [
			{
				cause_node_id: "cause-root",
				description:
					"Spänehaken an der Maschine bereitstellen und Nutzung beim Schichtstart instruieren.",
				due_date: "2026-07-01",
				id: "measure-root",
				owner_role: "Werkstattleiter",
			},
		],
	};
}
