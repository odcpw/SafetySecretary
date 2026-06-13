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
	ActionMutationValidationError,
	parseActionCreatePayload,
	parsePublicActionCreatePayload,
	parseActionUpdatePayload,
	prepareActionItemCreateRecord,
	prepareActionItemUpdateRecord,
	UI_CREATABLE_ACTION_ORIGIN_TYPES,
} = await import("../../../src/lib/actions/mutations");
const { ACTION_ORIGIN_TYPES } = await import(
	"../../../src/lib/actions/origin-contract"
);

const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const actorUserId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const actionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const originId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const createdAt = new Date("2026-05-05T10:00:00.000Z");

test("internal create preparation accepts every action origin type", () => {
	for (const originType of ACTION_ORIGIN_TYPES) {
		const record = prepareActionItemCreateRecord({
			action: {
				originContext: {
					date: "2026-05-05",
					quarter: "2026-Q2",
					theme: "Stop before restart",
					title: "Origin source",
					topic: "Machine guarding",
				},
				originId: originType === "manual" ? null : originId,
				originType,
				title: "Follow up source",
			},
			actorUserId,
			tenantId,
		});

		assert.equal(record.originType, originType);
		assert.ok(record.originLabel.length > 0);
	}
});

test("public create payload accepts only UI no-source origins", () => {
	for (const originType of UI_CREATABLE_ACTION_ORIGIN_TYPES) {
		assert.equal(
			parsePublicActionCreatePayload({
				originType,
				title: "Talk follow-up",
			})?.originType,
			originType,
		);
	}

	assert.equal(
		parseActionCreatePayload({
			originContext: { processName: "Machine guarding" },
			originId,
			originType: "hira",
			title: "HIRA follow-up",
		})?.originType,
		"hira",
	);
	assert.equal(
		parsePublicActionCreatePayload({
			originContext: { processName: "Machine guarding" },
			originId,
			originType: "hira",
			title: "Forged source follow-up",
		}),
		null,
	);
	assert.equal(
		parsePublicActionCreatePayload({
			originContext: { theme: "Stop before restart" },
			originType: "safety_day",
			title: "Future origin follow-up",
		}),
		null,
	);
	assert.equal(
		parsePublicActionCreatePayload({
			originId,
			originType: "meeting",
			title: "Forged meeting source",
		}),
		null,
	);
	assert.equal(
		parsePublicActionCreatePayload({
			originLabel: "Toolbox talk: overridden",
			originType: "toolbox_talk",
			title: "Forged toolbox label",
		}),
		null,
	);
	assert.equal(parseActionCreatePayload({ originType: "incident" }), null);
});

test("update preparation rejects immutable origin updates for every origin type", () => {
	for (const originType of ACTION_ORIGIN_TYPES) {
		const current = currentAction(originType);

		assert.throws(
			() =>
				prepareActionItemUpdateRecord(
					{
						action: { originType: "manual" },
						actionItemId: actionId,
						actorUserId,
						tenantId,
					},
					current,
				),
			ActionMutationValidationError,
		);
		assert.throws(
			() =>
				prepareActionItemUpdateRecord(
					{
						action: { originId },
						actionItemId: actionId,
						actorUserId,
						tenantId,
					},
					current,
				),
			ActionMutationValidationError,
		);
		assert.throws(
			() =>
				prepareActionItemUpdateRecord(
					{
						action: { originCreatedAt: "2026-05-05T11:00:00.000Z" },
						actionItemId: actionId,
						actorUserId,
						tenantId,
					},
					current,
				),
			ActionMutationValidationError,
		);

		if (originType === "manual") {
			const updated = prepareActionItemUpdateRecord(
				{
					action: { originLabel: "Manual: edited label" },
					actionItemId: actionId,
					actorUserId,
					tenantId,
				},
				current,
			);
			assert.equal(updated.originLabel, "Manual: edited label");
			continue;
		}

		assert.throws(
			() =>
				prepareActionItemUpdateRecord(
					{
						action: { originLabel: `${originType}: edited` },
						actionItemId: actionId,
						actorUserId,
						tenantId,
					},
					current,
				),
			ActionMutationValidationError,
		);
	}
});

test("safety-critical completion requires verification note or not-required rationale", () => {
	assert.throws(
		() =>
			prepareActionItemUpdateRecord(
				{
					action: {
						isSafetyCritical: true,
						status: "completed",
						verificationStatus: "needed",
					},
					actionItemId: actionId,
					actorUserId,
					tenantId,
				},
				currentAction("manual"),
			),
		ActionMutationValidationError,
	);

	const verified = prepareActionItemUpdateRecord(
		{
			action: {
				isSafetyCritical: true,
				status: "completed",
				verificationNote: "Restart test and photo checked.",
				verificationStatus: "verified",
			},
			actionItemId: actionId,
			actorUserId,
			tenantId,
		},
		currentAction("manual"),
	);
	assert.equal(verified.status, "completed");
	assert.equal(verified.verifiedByUserId, actorUserId);
	assert.ok(verified.verifiedAt);

	const notRequired = prepareActionItemUpdateRecord(
		{
			action: {
				isSafetyCritical: true,
				status: "completed",
				verificationNote: "Administrative record update only.",
				verificationStatus: "not_required",
			},
			actionItemId: actionId,
			actorUserId,
			tenantId,
		},
		currentAction("manual"),
	);
	assert.equal(notRequired.verificationStatus, "not_required");
});

test("update payload parser preserves explicit clears and rejects invalid enums", () => {
	assert.deepEqual(
		parseActionUpdatePayload({
			description: "",
			dueDate: "",
			effectivenessResult: "needs_follow_up",
			status: "in_progress",
		}),
		{
			description: null,
			dueDate: null,
			effectivenessResult: "needs_follow_up",
			status: "in_progress",
		},
	);
	assert.equal(parseActionUpdatePayload({ priority: "urgent" }), null);
});

function currentAction(originType: (typeof ACTION_ORIGIN_TYPES)[number]) {
	return {
		assigneeEmail: null,
		assigneeLabel: null,
		assigneeUserId: null,
		attachmentCount: 0,
		attachments: [],
		completedAt: null,
		createdAt,
		departmentText: null,
		description: "Existing description",
		dueDate: null,
		effectivenessResult: "unknown",
		id: actionId,
		isSafetyCritical: false,
		originCreatedAt: createdAt,
		originId: originType === "manual" ? null : originId,
		originLabel: `${originType}: seed`,
		originType,
		ownerText: null,
		priority: "medium",
		status: "open",
		tenantId,
		title: "Existing action",
		updatedAt: createdAt,
		verificationNote: null,
		verificationStatus: "not_required",
		verifiedAt: null,
		verifiedByEmail: null,
		verifiedByUserId: null,
	} as const;
}
