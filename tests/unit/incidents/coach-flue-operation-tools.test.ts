import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (!context.parentURL || !isLocalImport(specifier)) {
			return nextResolve(specifier, context);
		}

		const candidates = [
			new URL(`${specifier}.ts`, context.parentURL),
			new URL(`${specifier}.tsx`, context.parentURL),
			new URL(`${specifier}.json`, context.parentURL),
			new URL(`${specifier}/index.ts`, context.parentURL),
		];
		const resolved = candidates.find((candidate) => existsSync(candidate));

		if (resolved) {
			return {
				shortCircuit: true,
				url: resolved.href,
			};
		}

		return nextResolve(specifier, context);
	},
});

const {
	buildFlueCauseTreeOperations,
	buildFlueEvidenceOperations,
	buildFlueHiraFollowupOperations,
	buildFlueIncidentFieldOperations,
	validateFlueRawIncidentOperations,
} = (await import(
	moduleUrl("src/lib/incident/coach-flue-operation-tools.ts")
)) as typeof import("../../../src/lib/incident/coach-flue-operation-tools");
const { AgentOperationKind } = (await import(
	moduleUrl("src/lib/agent/types.ts")
)) as typeof import("../../../src/lib/agent/types");

test("flue field proposals validate enum codes before app apply", () => {
	const result = buildFlueIncidentFieldOperations({
		fields: [
			{ field: "incidentType", value: "Accident" },
			{ field: "actualInjuryOutcome", value: "MEDICAL_TREATMENT" },
			{ field: "potentialSeverityCode", value: "B" },
		],
	});

	assert.equal(result.ok, false);
	assert.match(result.errors.join("\n"), /incidentType must be one of/i);
	assert.deepEqual(result.operations, [
		{
			kind: AgentOperationKind.IncidentFieldUpdate,
			payload: {
				field: "actualInjuryOutcome",
				value: "MEDICAL_TREATMENT",
			},
		},
		{
			kind: AgentOperationKind.IncidentFieldUpdate,
			payload: {
				field: "potentialSeverityCode",
				value: "B",
			},
		},
	]);
});

test("flue field proposals keep incidentAt ISO validation and operation order", () => {
	const result = buildFlueIncidentFieldOperations({
		fields: [
			{ field: "title", value: "Hydraulic oil slip in Line 2" },
			{ field: "incidentAt", value: "after lunch" },
			{ field: "actualInjuryOutcome", value: "MEDICAL_TREATMENT" },
		],
	});

	assert.equal(result.ok, false);
	assert.match(result.errors.join("\n"), /incidentAt must be an ISO date\/time/);
	assert.deepEqual(result.operations, [
		{
			kind: AgentOperationKind.IncidentFieldUpdate,
			payload: {
				field: "title",
				value: "Hydraulic oil slip in Line 2",
			},
		},
		{
			kind: AgentOperationKind.IncidentFieldUpdate,
			payload: {
				field: "actualInjuryOutcome",
				value: "MEDICAL_TREATMENT",
			},
		},
	]);
});

test("flue evidence proposals keep sequence out of facts and measures out of facts", () => {
	const result = buildFlueEvidenceOperations({
		facts: [
			{ text: "The spill kit was empty." },
			{ text: "Maintenance will repair the pallet jack today." },
		],
		timelineEvents: [
			{
				narrative: "Mara slipped while carrying label rolls.",
				phase: "event",
				title: "Mara slipped on hydraulic oil",
			},
		],
	});

	assert.equal(result.ok, false);
	assert.match(result.errors.join("\n"), /looks like a measure/i);
	assert.deepEqual(result.operations, [
		{
			kind: AgentOperationKind.Fact,
			payload: { text: "The spill kit was empty." },
		},
		{
			kind: AgentOperationKind.TimelineEvent,
			payload: {
				narrative: "Mara slipped while carrying label rolls.",
				phase: "event",
				title: "Mara slipped on hydraulic oil",
			},
		},
	]);
});

test("flue evidence proposals keep occurredAt validation and accepted operation order", () => {
	const result = buildFlueEvidenceOperations({
		facts: [{ text: "The spill kit was empty." }],
		timelineEvents: [
			{
				occurredAt: "after lunch",
				phase: "event",
				title: "Mara slipped on hydraulic oil",
			},
			{
				occurredAt: "2026-06-18T09:15:00.000Z",
				phase: "after",
				title: "Area was cordoned off",
			},
		],
	});

	assert.equal(result.ok, false);
	assert.match(result.errors.join("\n"), /Timeline event 1 occurredAt is invalid/);
	assert.deepEqual(result.operations, [
		{
			kind: AgentOperationKind.Fact,
			payload: { text: "The spill kit was empty." },
		},
		{
			kind: AgentOperationKind.TimelineEvent,
			payload: {
				occurredAt: "2026-06-18T09:15:00.000Z",
				phase: "after",
				title: "Area was cordoned off",
			},
		},
	]);
});

test("flue evidence proposals reject near-duplicate facts in the same proposal", () => {
	const result = buildFlueEvidenceOperations({
		facts: [
			{
				text: "Conflicting initial accounts: some people said Mara tripped; witness Sam saw a thin trail of hydraulic oil on the floor.",
			},
			{
				text: "Witness observation: Sam saw a thin trail of hydraulic oil on the floor near the pallet jack charging area.",
			},
		],
	});

	assert.equal(result.ok, false);
	assert.match(result.errors.join("\n"), /duplicates an existing fact/i);
	assert.deepEqual(result.operations, [
		{
			kind: AgentOperationKind.Fact,
			payload: {
				text: "Conflicting initial accounts: some people said Mara tripped; witness Sam saw a thin trail of hydraulic oil on the floor.",
			},
		},
	]);
});

test("flue evidence proposals reject near-duplicate facts from the existing record", () => {
	const result = buildFlueEvidenceOperations({
		existingFacts: [
			"Spill response readiness: the spill kit was empty at the time of the incident.",
		],
		facts: [
			{
				text: "The spill kit was empty at the time of the incident.",
			},
		],
	});

	assert.equal(result.ok, false);
	assert.match(result.errors.join("\n"), /duplicates an existing fact/i);
	assert.deepEqual(result.operations, []);
});

test("flue cause-tree proposals validate refs and parent dependencies", () => {
	const result = buildFlueCauseTreeOperations({
		causeNodes: [
			{
				label: "The pallet jack leaked hydraulic oil",
				ref: "c1",
			},
			{
				branchStatus: "ROOT_REACHED",
				isRootCause: true,
				label: "No escalation rule removed leaking equipment from production use",
				parentId: "c1",
				ref: "c2",
			},
			{
				label: "Unknown parent should be rejected",
				parentId: "missing",
				ref: "c3",
			},
		],
	});

	assert.equal(result.ok, false);
	assert.match(result.errors.join("\n"), /parentId is unknown/i);
	assert.deepEqual(
		result.operations.map((operation) => ({
			kind: operation.kind,
			ref: operation.ref,
		})),
		[
			{ kind: AgentOperationKind.CauseNode, ref: "c1" },
			{ kind: AgentOperationKind.CauseNode, ref: "c2" },
		],
	);
});

test("flue cause-tree proposals sort same-response parent refs before children", () => {
	const result = buildFlueCauseTreeOperations({
		causeNodes: [
			{
				label: "No escalation rule removed leaking equipment from production use",
				parentId: "parent",
				ref: "child",
			},
			{
				label: "The pallet jack leaked hydraulic oil",
				ref: "parent",
			},
		],
	});

	assert.equal(result.ok, true);
	assert.deepEqual(
		result.operations.map((operation) => operation.ref),
		["parent", "child"],
	);
});

test("flue raw validation accepts local cause refs and rejects unknown action links", () => {
	assert.deepEqual(
		validateFlueRawIncidentOperations({
			operations: [
				{
					kind: AgentOperationKind.CauseNode,
					payload: { label: "Spill response ownership was unclear" },
					ref: "c1",
				},
				{
					kind: AgentOperationKind.StopAction,
					payload: {
						linkedCauseNodeId: "c1",
						stopClass: "O",
						title: "Shift lead checks spill kit at shift start",
					},
				},
			],
		}),
		[],
	);

	const errors = validateFlueRawIncidentOperations({
		existingCauseIds: ["11111111-1111-4111-8111-111111111111"],
		operations: [
			{
				kind: AgentOperationKind.StopAction,
				payload: {
					linkedCauseNodeId: "missing",
					stopClass: "O",
					title: "Shift lead checks spill kit at shift start",
				},
			},
		],
	});
	assert.match(errors.map((error) => error.message).join("\n"), /unknown/i);
});

test("flue raw validation rejects bad timeline and action dates", () => {
	const errors = validateFlueRawIncidentOperations({
		existingCauseIds: ["11111111-1111-4111-8111-111111111111"],
		operations: [
			{
				kind: AgentOperationKind.TimelineEvent,
				payload: {
					occurredAt: "after lunch",
					title: "Mara slipped",
				},
			},
			{
				kind: AgentOperationKind.StopAction,
				payload: {
					dueDate: "tomorrow",
					linkedCauseNodeId: "11111111-1111-4111-8111-111111111111",
					stopClass: "O",
					title: "Shift lead checks spill kit",
				},
			},
		],
	});

	assert.match(
		errors.map((error) => error.message).join("\n"),
		/occurredAt must be an ISO date\/time/,
	);
	assert.match(
		errors.map((error) => error.message).join("\n"),
		/dueDate must be YYYY-MM-DD/,
	);
});

test("flue HIRA follow-up proposals match the single persisted note field", () => {
	const result = buildFlueHiraFollowupOperations({
		notes: [
			{
				note: "Check whether leaking pallet jacks are covered in equipment isolation rules.",
				targetProcess: "Pallet jack maintenance",
			},
			{
				note: "Check spill-kit ownership and shift checks.",
				targetProcess: "Line 2 housekeeping",
			},
		],
	});

	assert.equal(result.ok, true);
	assert.deepEqual(result.operations, [
		{
			kind: AgentOperationKind.HiraFollowupNote,
			payload: {
				note:
					"Pallet jack maintenance: Check whether leaking pallet jacks are covered in equipment isolation rules.\nLine 2 housekeeping: Check spill-kit ownership and shift checks.",
				targetProcess: "Pallet jack maintenance",
			},
		},
	]);
});

function moduleUrl(relativePath: string): string {
	return pathToFileURL(relativePath).href;
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}
