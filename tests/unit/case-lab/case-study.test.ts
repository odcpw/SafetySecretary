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

		assert.equal(study.expected.hazardCategoryCode, "MECHANICAL");
		assert.equal(study.expected.eventType, "CUT_PUNCTURE");
		assert.equal(study.expected.potentialSeverityCode, "B");
		assert.equal(study.facts.some((fact) => fact.text.includes("Rettungsdienst")), true);
		assert.equal(
			JSON.stringify(study).toLowerCase().includes("hcn"),
			false,
			"mechanical study must not inherit HCN-specific criteria",
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

		assert.equal(study.expected.potentialSeverityCode, "A");
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

		assert.equal(study.expected.potentialSeverityCode, "A");
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
		assert.equal(injury.reason, "answered-question");
		assert.match(injury.message, /Finger|Rettungsdienst|Chirurgie/);
	});

	test("case-study evaluator grades against the study's own expected classification", () => {
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
				{ reason: "opening", revealedFactIds: [] },
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
			potential_outcome_text:
				"Schwere Schnitt- oder Quetschverletzung am Finger bis hin zu bleibender Funktionsbeeinträchtigung oder Teilamputation.",
			potential_severity_code: "B",
			title: "Finger geriet beim Entfernen von Spänen in rotierenden Fräser",
		},
		causeNodes: [
			{
				statement:
					"Der Metallmassstab war unmittelbar verfügbar und die Einzugsgefahr war nicht bewusst.",
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
