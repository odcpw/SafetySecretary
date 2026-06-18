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

const { buildFlueActionPlanOperations } = (await import(
	moduleUrl("src/lib/incident/coach-flue-action-plan.ts")
)) as typeof import("../../../src/lib/incident/coach-flue-action-plan");
const { AgentOperationKind } = (await import(
	moduleUrl("src/lib/agent/types.ts")
)) as typeof import("../../../src/lib/agent/types");

test("flue action plan proposals link measures to existing causes", () => {
	const causeId = "11111111-1111-4111-8111-111111111111";
	const result = buildFlueActionPlanOperations({
		actions: [
			{
				dueDate: "2026-06-20",
				linkedCauseNodeId: causeId,
				owner: "Maintenance",
				purpose: "corrective",
				stopClass: "T",
				title: "Maintenance repairs the leaking pallet jack by 2026-06-20",
			},
		],
		existingCauseIds: [causeId],
	});

	assert.equal(result.ok, true);
	assert.deepEqual(result.operations, [
		{
			kind: AgentOperationKind.StopAction,
			payload: {
				dueDate: "2026-06-20",
				linkedCauseNodeId: causeId,
				owner: "Maintenance",
				purpose: "corrective",
				stopClass: "T",
				title: "Maintenance repairs the leaking pallet jack by 2026-06-20",
			},
		},
	]);
});

test("flue action plan proposals create a linked cause when needed", () => {
	const result = buildFlueActionPlanOperations({
		actions: [
			{
				linkedCauseStatement:
					"Supervisors had no immediate stop-work rule for active oil leaks",
				purpose: "preventive",
				stopClass: "O",
				title: "Luis briefs supervisors to block leaking equipment immediately",
			},
		],
	});

	assert.equal(result.ok, true);
	assert.deepEqual(result.operations, [
		{
			kind: AgentOperationKind.CauseNode,
			payload: {
				branchStatus: "OPEN",
				label:
					"Supervisors had no immediate stop-work rule for active oil leaks",
				method: "cause-tree",
			},
			ref: "action-cause-1",
		},
		{
			kind: AgentOperationKind.StopAction,
			payload: {
				linkedCauseNodeId: "action-cause-1",
				purpose: "preventive",
				stopClass: "O",
				title: "Luis briefs supervisors to block leaking equipment immediately",
			},
		},
	]);
});

test("flue action plan proposals reject unlinked measures", () => {
	const result = buildFlueActionPlanOperations({
		actions: [
			{
				purpose: "corrective",
				stopClass: "O",
				title: "Refill spill kits every shift",
			},
		],
	});

	assert.equal(result.ok, false);
	assert.deepEqual(result.operations, []);
	assert.match(result.errors.join("\n"), /must link to an existing cause/i);
});

test("flue action plan proposals reject unknown cause ids even when no causes exist yet", () => {
	const result = buildFlueActionPlanOperations({
		actions: [
			{
				linkedCauseNodeId: "11111111-1111-4111-8111-111111111111",
				purpose: "corrective",
				stopClass: "T",
				title: "Maintenance repairs the leaking pallet jack",
			},
		],
		existingCauseIds: [],
	});

	assert.equal(result.ok, false);
	assert.deepEqual(result.operations, []);
	assert.match(
		result.errors.join("\n"),
		/linkedCauseNodeId is not in the current incident cause list/i,
	);
});

test("flue action plan proposals reuse one same-response cause for repeated statements", () => {
	const result = buildFlueActionPlanOperations({
		actions: [
			{
				linkedCauseStatement:
					"Supervisors had no immediate stop-work rule for active oil leaks",
				purpose: "corrective",
				stopClass: "O",
				title: "Shift leads block leaking equipment immediately",
			},
			{
				linkedCauseStatement:
					"Supervisors had no immediate stop-work rule for active oil leaks",
				purpose: "preventive",
				stopClass: "O",
				title: "Production manager adds the stop-work rule to startup checks",
			},
		],
	});

	assert.equal(result.ok, true);
	assert.deepEqual(result.operations, [
		{
			kind: AgentOperationKind.CauseNode,
			payload: {
				branchStatus: "OPEN",
				label:
					"Supervisors had no immediate stop-work rule for active oil leaks",
				method: "cause-tree",
			},
			ref: "action-cause-1",
		},
		{
			kind: AgentOperationKind.StopAction,
			payload: {
				linkedCauseNodeId: "action-cause-1",
				purpose: "corrective",
				stopClass: "O",
				title: "Shift leads block leaking equipment immediately",
			},
		},
		{
			kind: AgentOperationKind.StopAction,
			payload: {
				linkedCauseNodeId: "action-cause-1",
				purpose: "preventive",
				stopClass: "O",
				title: "Production manager adds the stop-work rule to startup checks",
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
