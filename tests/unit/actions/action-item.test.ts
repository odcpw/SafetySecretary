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
	ACTION_ITEM_EFFECTIVENESS_RESULTS,
	ACTION_ITEM_ORIGIN_TYPES,
	ACTION_ITEM_PRIORITIES,
	ACTION_ITEM_STATUSES,
	ACTION_ITEM_VERIFICATION_STATUSES,
	ActionItemValidationError,
	prepareActionItemForStorage,
} = await import("../../../src/lib/actions/action-item");

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const originId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

test("action item constants cover v1 status, priority, origin, and verification contracts", () => {
	assert.deepEqual(ACTION_ITEM_STATUSES, [
		"open",
		"in_progress",
		"completed",
		"cancelled",
	]);
	assert.deepEqual(ACTION_ITEM_PRIORITIES, [
		"low",
		"medium",
		"high",
		"critical",
	]);
	assert.deepEqual(ACTION_ITEM_VERIFICATION_STATUSES, [
		"not_required",
		"needed",
		"verified",
		"needs_follow_up",
	]);
	assert.deepEqual(ACTION_ITEM_EFFECTIVENESS_RESULTS, [
		"unknown",
		"effective",
		"needs_follow_up",
	]);

	for (const origin of [
		"hira",
		"ii",
		"jha",
		"safety_walk",
		"audit_inspection",
		"toolbox_talk",
		"meeting",
		"manual",
		"safety_moment",
		"creative_artifact",
		"campaign",
		"roadmap",
		"safety_day",
	] as const) {
		assert.ok(ACTION_ITEM_ORIGIN_TYPES.includes(origin));
	}
});

test("prepareActionItemForStorage trims fields and applies core defaults", () => {
	const record = prepareActionItemForStorage({
		description: "  Replace damaged guard before restart  ",
		originId,
		originType: "ii",
		ownerText: "  Maintenance lead  ",
		tenantId: tenantId.toUpperCase(),
		title: "  Replace damaged guard  ",
	});

	assert.match(
		record.id,
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
	);
	assert.equal(record.tenantId, tenantId);
	assert.equal(record.title, "Replace damaged guard");
	assert.equal(record.description, "Replace damaged guard before restart");
	assert.equal(record.status, "open");
	assert.equal(record.priority, "medium");
	assert.equal(record.ownerText, "Maintenance lead");
	assert.equal(record.originType, "ii");
	assert.equal(record.originId, originId);
	assert.equal(record.originLabel, "II: Replace damaged guard");
	assert.equal(record.originCreatedAt.getTime(), record.createdAt.getTime());
	assert.equal(record.isSafetyCritical, false);
	assert.equal(record.verificationStatus, "not_required");
	assert.equal(record.effectivenessResult, "unknown");
	assert.ok(record.createdAt instanceof Date);
	assert.equal(record.updatedAt.getTime(), record.createdAt.getTime());
});

test("status-only completed safety-critical actions are rejected", () => {
	assert.throws(
		() =>
			prepareActionItemForStorage({
				completedAt: "2026-05-05T10:00:00.000Z",
				isSafetyCritical: true,
				originType: "manual",
				status: "completed",
				tenantId,
				title: "Repair emergency stop",
				verificationStatus: "needed",
			}),
		ActionItemValidationError,
	);

	const verified = prepareActionItemForStorage({
		completedAt: "2026-05-05T10:00:00.000Z",
		isSafetyCritical: true,
		originType: "manual",
		status: "completed",
		tenantId,
		title: "Repair emergency stop",
		verificationNote: "Photo and restart test checked.",
		verificationStatus: "verified",
		verifiedAt: "2026-05-05T11:00:00.000Z",
		verifiedByUserId: userId,
	});

	assert.equal(verified.verificationStatus, "verified");
	assert.equal(verified.verifiedByUserId, userId);

	const explicitlyNotRequired = prepareActionItemForStorage({
		completedAt: "2026-05-05T10:00:00.000Z",
		isSafetyCritical: true,
		originType: "manual",
		status: "completed",
		tenantId,
		title: "Update meeting minutes action",
		verificationNote: "Administrative action; no physical verification needed.",
		verificationStatus: "not_required",
	});

	assert.equal(explicitlyNotRequired.verificationStatus, "not_required");
});

test("verified pair and completed timestamp rules are enforced", () => {
	assert.throws(
		() =>
			prepareActionItemForStorage({
				originType: "manual",
				tenantId,
				title: "Missing verifier",
				verificationStatus: "verified",
				verifiedAt: "2026-05-05T10:00:00.000Z",
			}),
		ActionItemValidationError,
	);

	assert.throws(
		() =>
			prepareActionItemForStorage({
				completedAt: "2026-05-05T10:00:00.000Z",
				originType: "manual",
				status: "in_progress",
				tenantId,
				title: "Timestamp before completion",
			}),
		ActionItemValidationError,
	);
});
