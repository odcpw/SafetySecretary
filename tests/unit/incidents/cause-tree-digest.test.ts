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

const { buildCauseTreeDigest } = (await import(
	"../../../src/lib/incident/cause-tree"
)) as typeof import("../../../src/lib/incident/cause-tree");

const uuidA = "11111111-1111-4111-8111-111111111111";
const uuidB = "22222222-2222-4222-8222-222222222222";
const uuidC = "33333333-3333-4333-8333-333333333333";
const uuidD = "44444444-4444-4444-8444-444444444444";
const uuidE = "55555555-5555-4555-8555-555555555555";

test("cause tree digest handles an empty tree", () => {
	const digest = buildCauseTreeDigest({ actions: [], causes: [] });
	assert.equal(digest, "No causes yet.");
});

test("cause tree digest renders chained branches with parked, root, and treated markers", () => {
	const digest = buildCauseTreeDigest({
		actions: [{ causeNodeId: uuidB }],
		causes: [
			{
				id: uuidA,
				parentId: null,
				statement: "Cable crossed the walkway at dock 2",
			},
			{
				id: uuidB,
				parentId: uuidA,
				statement: "Charger has no fixed place",
			},
			{
				branchStatus: "ROOT_REACHED",
				id: uuidC,
				isRootCause: true,
				parentId: uuidB,
				statement: "No storage concept for mobile equipment",
			},
			{
				branchStatus: "PARKED",
				id: uuidD,
				parentId: null,
				statement: "Delivery had to leave before carrier cut-off",
			},
		],
	});
	const lines = digest.split("\n");

	assert.ok(
		lines.includes(`1 Cable crossed the walkway at dock 2 [${uuidA}]`),
		digest,
	);
	assert.ok(
		lines.includes(
			`  1.1 Charger has no fixed place [${uuidB}] [TREATED: 1 measure]`,
		),
		digest,
	);
	assert.ok(
		lines.includes(
			`    1.1.1 No storage concept for mobile equipment [${uuidC}] [ROOT]`,
		),
		digest,
	);
	assert.ok(
		lines.includes(
			`2 Delivery had to leave before carrier cut-off [${uuidD}] [PARKED]`,
		),
		digest,
	);
	assert.ok(
		lines.includes(
			"Summary: 0 open branch(es), 1 parked, 1 treated, max depth 3.",
		),
		digest,
	);
	assert.ok(!digest.includes("no deeper why yet"), digest);
});

test("cause tree digest nudges when more than two causes are unchained", () => {
	const digest = buildCauseTreeDigest({
		actions: [],
		causes: [
			{ id: uuidA, parentId: null, statement: "Floor was wet" },
			{ id: uuidB, parentId: null, statement: "No warning sign placed" },
			{ id: uuidC, parentId: null, statement: "Cleaning happens during shift" },
		],
	});
	const lines = digest.split("\n");

	assert.ok(lines.includes(`1 Floor was wet [${uuidA}] [OPEN]`), digest);
	assert.ok(
		lines.includes(`2 No warning sign placed [${uuidB}] [OPEN]`),
		digest,
	);
	assert.ok(
		lines.includes(`3 Cleaning happens during shift [${uuidC}] [OPEN]`),
		digest,
	);
	assert.ok(
		lines.includes(
			"Summary: 3 open branch(es), 0 parked, 0 treated, max depth 1.",
		),
		digest,
	);
	assert.ok(
		lines.includes(
			"3 top-level causes have no deeper why yet. If some of them explain each other, propose a restructure (cause_update with parentId); for the rest, ask why and add the answers as child causes.",
		),
		digest,
	);
});

test("cause tree digest truncates long statements and keeps the full UUID", () => {
	const longStatement = "x".repeat(120);
	const digest = buildCauseTreeDigest({
		actions: [],
		causes: [{ id: uuidA, parentId: null, statement: longStatement }],
	});

	assert.ok(digest.includes(`${"x".repeat(79)}… [${uuidA}] [OPEN]`), digest);
	assert.ok(!digest.includes("x".repeat(81)), digest);
});

test("cause tree digest treats orphaned parents as branch roots", () => {
	const digest = buildCauseTreeDigest({
		actions: [],
		causes: [
			{
				id: uuidA,
				parentId: uuidE,
				statement: "Parent cause is not in the record",
			},
		],
	});
	const lines = digest.split("\n");

	assert.ok(
		lines.includes(`1 Parent cause is not in the record [${uuidA}] [OPEN]`),
		digest,
	);
	assert.ok(
		lines.includes(
			"Summary: 1 open branch(es), 0 parked, 0 treated, max depth 1.",
		),
		digest,
	);
});

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith(".") || specifier.startsWith("/");
}
