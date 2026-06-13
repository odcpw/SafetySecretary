import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (!context.parentURL || !specifier.startsWith(".")) {
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
	ACTION_ORIGIN_TYPES,
	RESERVED_ACTION_ORIGIN_TYPES,
	V1_ACTION_ORIGIN_TYPES,
	ActionOriginValidationError,
	buildOriginLabel,
	prepareActionOriginForStorage,
} = await import("../../../src/lib/actions/origin-contract");

test("origin contract enumerates v1 and reserved future origin slots", () => {
	assert.deepEqual(V1_ACTION_ORIGIN_TYPES, [
		"hira",
		"ii",
		"jha",
		"safety_walk",
		"audit_inspection",
		"toolbox_talk",
		"meeting",
		"manual",
	]);
	assert.deepEqual(RESERVED_ACTION_ORIGIN_TYPES, [
		"safety_moment",
		"creative_artifact",
		"campaign",
		"roadmap",
		"safety_day",
	]);
	assert.deepEqual(ACTION_ORIGIN_TYPES, [
		...V1_ACTION_ORIGIN_TYPES,
		...RESERVED_ACTION_ORIGIN_TYPES,
	]);
});

test("buildOriginLabel returns human-readable labels for every origin type", () => {
	const date = "2026-05-05";
	assert.equal(
		buildOriginLabel("hira", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", {
			processName: "Pallet handling",
			stepLabel: "Step 3",
		}),
		"HIRA: Pallet handling - Step 3",
	);
	assert.equal(
		buildOriginLabel("ii", null, { title: "Forklift near miss", date }),
		"II: Forklift near miss (2026-05-05)",
	);
	assert.equal(
		buildOriginLabel("jha", null, {
			activity: "Roof access",
			location: "Hall 2",
		}),
		"JHA: Roof access - Hall 2",
	);
	assert.equal(
		buildOriginLabel("safety_walk", null, { location: "Line 4", date }),
		"Safety walk: Line 4 (2026-05-05)",
	);
	assert.equal(
		buildOriginLabel("audit_inspection", null, {
			title: "Guard inspection",
			date,
		}),
		"Audit/inspection: Guard inspection (2026-05-05)",
	);
	assert.equal(
		buildOriginLabel("toolbox_talk", null, { title: "Hand safety" }),
		"Toolbox talk: Hand safety",
	);
	assert.equal(
		buildOriginLabel("meeting", null, { title: "Shift kickoff" }),
		"Meeting: Shift kickoff",
	);
	assert.equal(
		buildOriginLabel("manual", null, { title: "Ad hoc follow-up" }),
		"Manual: Ad hoc follow-up",
	);
	assert.equal(
		buildOriginLabel("safety_moment", null, { title: "Good catch", date }),
		"Safety moment: Good catch (2026-05-05)",
	);
	assert.equal(
		buildOriginLabel("creative_artifact", null, { title: "Poster draft" }),
		"Creative artifact: Poster draft",
	);
	assert.equal(
		buildOriginLabel("campaign", null, { title: "Winter slips" }),
		"Campaign: Winter slips",
	);
	assert.equal(
		buildOriginLabel("roadmap", null, {
			quarter: "2026-Q2",
			topic: "Machine guarding",
		}),
		"Roadmap focus: 2026-Q2 - Machine guarding",
	);
	assert.equal(
		buildOriginLabel("safety_day", null, {
			theme: "Stop before restart",
			date,
		}),
		"Safety day: Stop before restart (2026-05-05)",
	);
});

test("prepareActionOriginForStorage normalizes provenance and rejects bad values", () => {
	const createdAt = new Date("2026-05-05T10:00:00.000Z");
	const record = prepareActionOriginForStorage({
		createdAt,
		originId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
		originType: "hira",
		title: "Guarding action",
	});

	assert.equal(record.originId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
	assert.equal(
		record.originLabel,
		"HIRA: Guarding action (aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa)",
	);
	assert.equal(record.originCreatedAt.getTime(), createdAt.getTime());

	assert.throws(
		() =>
			prepareActionOriginForStorage({
				originCreatedAt: "not-a-date",
				originType: "manual",
			}),
		ActionOriginValidationError,
	);
	assert.throws(
		() =>
			prepareActionOriginForStorage({
				originType: "unsupported" as never,
			}),
		ActionOriginValidationError,
	);
});
