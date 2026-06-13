import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (!context.parentURL || !isLocalImport(specifier)) {
			return nextResolve(specifier, context);
		}

		const candidates = [
			new URL(`${specifier}.ts`, context.parentURL),
			new URL(`${specifier}.tsx`, context.parentURL),
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

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}

const { assessIncidentReadiness, readinessCopy } = (await import(
	"../../../src/lib/incident/readiness"
)) as typeof import("../../../src/lib/incident/readiness");

const rootId = "11111111-1111-4111-8111-111111111111";
const childId = "22222222-2222-4222-8222-222222222222";

test("a fresh draft surfaces the obvious gaps", () => {
	const result = assessIncidentReadiness({
		actions: [],
		causes: [],
		incidentAt: null,
		potentialSeverity: null,
	});
	assert.equal(result.ready, false);
	const keys = result.gaps.map((gap) => gap.key);
	assert.deepEqual(keys, ["incidentTime", "potentialSeverity", "noCauses"]);
});

test("a complete record is ready", () => {
	const result = assessIncidentReadiness({
		actions: [
			{ causeNodeId: rootId, dueDate: "2026-07-01", ownerRole: "Shift lead" },
		],
		causes: [
			{
				branchStatus: "ROOT_REACHED",
				id: rootId,
				isRootCause: true,
				parentId: null,
			},
		],
		hiraFollowupNeeded: false,
		incidentAt: "2026-06-10T07:30:00.000Z",
		potentialSeverity: "C",
	});
	assert.equal(result.ready, true);
	assert.equal(result.gaps.length, 0);
});

test("an open leaf branch and unrooted tree are flagged", () => {
	const result = assessIncidentReadiness({
		actions: [],
		causes: [
			{ id: rootId, parentId: null },
			{ id: childId, parentId: rootId },
		],
		incidentAt: "2026-06-10T07:30:00.000Z",
		potentialSeverity: "B",
	});
	const keys = result.gaps.map((gap) => gap.key);
	assert.ok(keys.includes("noRoot"));
	assert.ok(keys.includes("noMeasures"));
	const openGap = result.gaps.find((gap) => gap.key === "openBranches");
	// Only the childless leaf counts as open (the parent has a child).
	assert.equal(openGap?.count, 1);
});

test("an action missing an owner or due date is flagged", () => {
	const result = assessIncidentReadiness({
		actions: [{ causeNodeId: rootId, dueDate: null, ownerRole: "Shift lead" }],
		causes: [{ id: rootId, isRootCause: true, parentId: null }],
		incidentAt: "2026-06-10T07:30:00.000Z",
		potentialSeverity: "C",
	});
	const actionGap = result.gaps.find((gap) => gap.key === "actionsIncomplete");
	assert.equal(actionGap?.count, 1);
});

test("a flagged-but-undescribed HIRA follow-up is a gap", () => {
	const result = assessIncidentReadiness({
		actions: [
			{ causeNodeId: rootId, dueDate: "2026-07-01", ownerRole: "Lead" },
		],
		causes: [{ id: rootId, isRootCause: true, parentId: null }],
		hiraFollowupNeeded: true,
		hiraFollowupText: "  ",
		incidentAt: "2026-06-10T07:30:00.000Z",
		potentialSeverity: "C",
	});
	assert.ok(result.gaps.some((gap) => gap.key === "hiraUndescribed"));
});

test("every locale resolves readiness copy with all gap keys", () => {
	for (const locale of ["en", "de", "fr", "it", "rm"]) {
		const copy = readinessCopy(locale);
		assert.ok(copy.title.length > 0);
		for (const key of [
			"incidentTime",
			"potentialSeverity",
			"noCauses",
			"noRoot",
			"openBranches",
			"noMeasures",
			"actionsIncomplete",
			"hiraUndescribed",
		] as const) {
			assert.ok(copy.gaps[key]?.length > 0, `${locale} missing ${key}`);
		}
	}
});
