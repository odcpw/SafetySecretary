import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { CaseLabRecord } from "../../../scripts/case-lab/evaluator";

const { evaluateInvestigation, severityConsistencyCheck } = (await import(
	new URL("../../../scripts/case-lab/evaluator.ts", import.meta.url).href
)) as typeof import("../../../scripts/case-lab/evaluator");

describe("case lab evaluator", () => {
	test("hard-fails when source potential outcome says fatal and replay severity is not A", () => {
		const evaluation = evaluateInvestigation({
			finalRecord: finalRecord({
				potentialOutcomeText:
					"Potential toxic HCN inhalation exposure with delayed response.",
				potentialSeverityCode: "B",
			}),
			sourceBundle: {
				case: {
					potential_outcome_text:
						"Potential serious or fatal toxic HCN exposure including respiratory/systemic poisoning.",
				},
			},
			transcript: [],
		});

		const severityCheck = evaluation.checks.find(
			(check) => check.name === "potential severity consistency",
		);
		assert.equal(severityCheck?.status, "fail");
		assert.equal(severityCheck?.hardFailure, true);
		assert.equal(evaluation.summary.grade, "failing-critical");
		assert.equal(evaluation.summary.hardFailures.length, 1);
	});

	test("passes fatal potential only when replay severity is A", () => {
		const check = severityConsistencyCheck(
			{
				potentialOutcomeText: "Potential fatal toxic exposure.",
				potentialSeverityCode: "A",
			},
			{},
		);

		assert.equal(check.status, "pass");
		assert.equal(check.hardFailure, false);
	});

	test("allows A or B for serious irreversible harm without fatal wording", () => {
		const check = severityConsistencyCheck(
			{
				potentialOutcomeText:
					"Potential irreversible respiratory damage from toxic exposure.",
				potentialSeverityCode: "B",
			},
			{},
		);

		assert.equal(check.status, "pass");
		assert.equal(check.hardFailure, false);
	});
});

function finalRecord(incident: {
	readonly potentialOutcomeText: string;
	readonly potentialSeverityCode: string;
}): CaseLabRecord {
	return {
		causeActions: [],
		causeNodes: [],
		facts: [],
		incident: {
			actualInjuryOutcome: "NO_INJURY",
			causeMethod: "URSACHENBAUM",
			eventType: "HARMFUL_EXPOSURE",
			hazardCategoryCode: "HAZARDOUS_SUBSTANCES",
			incidentAt: null,
			incidentType: "NEAR_MISS",
			potentialOutcomeText: incident.potentialOutcomeText,
			potentialSeverityCode: incident.potentialSeverityCode,
		},
		persons: [],
		timelineEvents: [],
	};
}
