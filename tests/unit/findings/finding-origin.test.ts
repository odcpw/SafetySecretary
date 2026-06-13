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
	FINDING_INTENTS,
	FINDING_ORIGIN_SEVERITIES,
	FINDING_ORIGIN_STATUSES,
	FINDING_ORIGIN_TYPES,
	actionOriginTypeForFinding,
	buildFindingOriginLabel,
	prepareFindingActionInput,
	prepareFindingForStorage,
	priorityForFindingSeverity,
} = await import("../../../src/lib/findings/finding-origin");

const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const findingId = "33333333-3333-4333-8333-333333333333";
const reportedAt = new Date("2026-05-05T08:30:00.000Z");

test("finding origin constants match the contract", () => {
	assert.deepEqual(
		[...FINDING_ORIGIN_TYPES],
		["safety_walk", "audit", "inspection", "meeting", "toolbox_talk"],
	);
	assert.deepEqual(
		[...FINDING_INTENTS],
		["hazard", "good_catch", "positive_observation"],
	);
	assert.deepEqual(
		[...FINDING_ORIGIN_SEVERITIES],
		["low", "medium", "high", "critical"],
	);
	assert.deepEqual(
		[...FINDING_ORIGIN_STATUSES],
		["open", "action_created", "resolved", "dismissed"],
	);
});

test("finding types map to action origin types", () => {
	assert.equal(actionOriginTypeForFinding("safety_walk"), "safety_walk");
	assert.equal(actionOriginTypeForFinding("audit"), "audit_inspection");
	assert.equal(actionOriginTypeForFinding("inspection"), "audit_inspection");
	assert.equal(actionOriginTypeForFinding("meeting"), "meeting");
	assert.equal(actionOriginTypeForFinding("toolbox_talk"), "toolbox_talk");
});

test("prepareFindingForStorage normalizes records and keeps positive intent", () => {
	const finding = prepareFindingForStorage({
		departmentText: " Production ",
		description: " Operator stopped and asked before restart. ",
		findingType: "safety_walk",
		id: findingId.toUpperCase(),
		intent: "good_catch",
		locationText: " Line 2 ",
		photoStoragePath: ` tenants/${tenantId}/findings/photo.jpg `,
		reportedAt,
		reportedByUserId: userId.toUpperCase(),
		severity: "medium",
		tenantId: tenantId.toUpperCase(),
		title: " Guard open during setup ",
		workAsDoneContext: "Changeover was under time pressure.",
	});

	assert.equal(finding.departmentText, "Production");
	assert.equal(
		finding.description,
		"Operator stopped and asked before restart.",
	);
	assert.equal(finding.id, findingId);
	assert.equal(finding.intent, "good_catch");
	assert.equal(finding.locationText, "Line 2");
	assert.equal(
		finding.photoStoragePath,
		`tenants/${tenantId}/findings/photo.jpg`,
	);
	assert.equal(finding.reportedByUserId, userId);
	assert.equal(finding.status, "open");
	assert.equal(finding.tenantId, tenantId);
	assert.equal(finding.title, "Guard open during setup");
});

test("prepareFindingForStorage rejects bad action-created and enum values", () => {
	assert.throws(
		() =>
			prepareFindingForStorage({
				description: "Needs follow-up.",
				findingType: "audit",
				reportedByUserId: userId,
				severity: "high",
				status: "action_created",
				tenantId,
				title: "Blocked route",
			}),
		/action_created findings require actionItemId/,
	);

	assert.throws(
		() =>
			prepareFindingForStorage({
				description: "Needs follow-up.",
				findingType: "unexpected" as never,
				reportedByUserId: userId,
				severity: "high",
				tenantId,
				title: "Blocked route",
			}),
		/Unsupported finding type/,
	);

	assert.throws(
		() =>
			prepareFindingForStorage({
				description: "Needs follow-up.",
				findingType: "safety_walk",
				photoStoragePath:
					"tenants/99999999-9999-4999-8999-999999999999/findings/photo.jpg",
				reportedByUserId: userId,
				severity: "medium",
				tenantId,
				title: "Wrong tenant path",
			}),
		/photoStoragePath must be scoped/,
	);
});

test("finding action input uses ssfw-8i7 origin contract", () => {
	const finding = prepareFindingForStorage({
		departmentText: "Warehouse",
		description: "Marked pedestrian route blocked by pallets.",
		findingType: "inspection",
		id: findingId,
		intent: "hazard",
		locationText: "Goods-in aisle",
		reportedAt,
		reportedByUserId: userId,
		severity: "critical",
		tenantId,
		title: "Pedestrian route blocked",
	});

	assert.equal(
		buildFindingOriginLabel(finding),
		"Audit/inspection: Pedestrian route blocked (2026-05-05)",
	);

	const action = prepareFindingActionInput(finding, {
		dueDate: "2026-05-12",
		ownerText: "Warehouse supervisor",
	});

	assert.equal(action.tenantId, tenantId);
	assert.equal(action.title, "Pedestrian route blocked");
	assert.equal(
		action.description,
		"Marked pedestrian route blocked by pallets.",
	);
	assert.equal(action.originType, "audit_inspection");
	assert.equal(action.originId, findingId);
	assert.equal(
		action.originLabel,
		"Audit/inspection: Pedestrian route blocked (2026-05-05)",
	);
	assert.equal(action.originCreatedAt, reportedAt);
	assert.equal(action.priority, "critical");
});

test("finding severity maps to action priority", () => {
	assert.equal(priorityForFindingSeverity("low"), "low");
	assert.equal(priorityForFindingSeverity("medium"), "medium");
	assert.equal(priorityForFindingSeverity("high"), "high");
	assert.equal(priorityForFindingSeverity("critical"), "critical");
});
