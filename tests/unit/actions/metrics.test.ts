import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import type { SerializedActionItemListRow } from "../../../src/lib/actions/queries";

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

const { summarizeActionManagerMetrics } = await import(
	"../../../src/lib/actions/metric-summary"
);
const { filterActionItemsForBoard } = await import(
	"../../../src/lib/actions/filters"
);

test("summarizes weekly action rhythm metrics from filtered action rows", () => {
	const metrics = summarizeActionManagerMetrics(
		[
			action({
				assigneeLabel: "Maintenance lead",
				departmentText: "Production",
				dueDate: "2026-05-04",
				originType: "ii",
				status: "open",
				title: "Overdue II action",
			}),
			action({
				assigneeLabel: "Maintenance lead",
				departmentText: "Production",
				dueDate: "2026-05-07",
				effectivenessResult: "needs_follow_up",
				originType: "hira",
				status: "in_progress",
				title: "Due soon follow-up",
			}),
			action({
				assigneeLabel: "Safety specialist",
				departmentText: "Logistics",
				dueDate: "2026-05-09",
				originType: "safety_walk",
				status: "completed",
				title: "Completed but verification open",
				updatedAt: "2026-05-05T09:00:00.000Z",
				verificationStatus: "needed",
			}),
			action({
				assigneeLabel: "Safety specialist",
				departmentText: "Logistics",
				dueDate: null,
				originType: "manual",
				status: "cancelled",
				title: "Cancelled manual action",
			}),
		],
		{ findingsWithoutLinkedAction: 1, pendingSdsReviews: 2 },
		new Date("2026-05-05T12:00:00.000Z"),
	);

	assert.equal(metrics.openActions, 2);
	assert.equal(metrics.overdueActions, 1);
	assert.equal(metrics.dueSoonActions, 1);
	assert.equal(metrics.needsFollowUpActions, 1);
	assert.equal(metrics.unverifiedClosedActions, 1);
	assert.equal(metrics.completedThisWeek, 1);
	assert.equal(metrics.statusCounts.open, 1);
	assert.equal(metrics.statusCounts.in_progress, 1);
	assert.equal(metrics.statusCounts.completed, 1);
	assert.equal(metrics.statusCounts.cancelled, 1);
	assert.deepEqual(metrics.relatedCounts, {
		findingsWithoutLinkedAction: 1,
		pendingSdsReviews: 2,
	});
	assert.deepEqual(metrics.byDepartment, [
		{ count: 2, label: "Logistics", value: "Logistics" },
		{ count: 2, label: "Production", value: "Production" },
	]);
	assert.deepEqual(metrics.byAssignee, [
		{ count: 2, label: "Maintenance lead", value: "Maintenance lead" },
		{ count: 2, label: "Safety specialist", value: "Safety specialist" },
	]);
	assert.deepEqual(
		metrics.byOriginType.map((bucket) => bucket.value),
		["hira", "ii", "manual", "safety_walk"],
	);
});

test("board drill-down filters match department and assignee buckets exactly", () => {
	const rows = [
		action({
			assigneeEmail: "ann@example.test",
			assigneeLabel: "Ann",
			departmentText: "Production",
			originType: "ii",
			status: "open",
			title: "Production action",
		}),
		action({
			assigneeEmail: "joanne@example.test",
			assigneeLabel: "Joanne",
			departmentText: "Production QA",
			originType: "hira",
			status: "open",
			title: "Production QA action",
		}),
		action({
			assigneeLabel: "Ann",
			departmentText: "Production",
			effectivenessResult: "needs_follow_up",
			originType: "manual",
			status: "completed",
			title: "Follow-up action",
		}),
	];

	const productionRows = filterActionItemsForBoard(rows, {
		assignee: "all",
		attention: "all",
		department: "Production",
		due: "all",
		origin: "all",
		status: "all",
	});
	assert.deepEqual(
		productionRows.map((row) => row.title),
		["Production action", "Follow-up action"],
	);

	const annRows = filterActionItemsForBoard(rows, {
		assignee: "Ann",
		attention: "all",
		department: "all",
		due: "all",
		origin: "all",
		status: "all",
	});
	assert.deepEqual(
		annRows.map((row) => row.title),
		["Production action", "Follow-up action"],
	);

	const followUpRows = filterActionItemsForBoard(rows, {
		assignee: "all",
		attention: "needs_follow_up",
		department: "all",
		due: "all",
		origin: "all",
		status: "all",
	});
	assert.deepEqual(
		followUpRows.map((row) => row.title),
		["Follow-up action"],
	);

	assert.deepEqual(
		summarizeActionManagerMetrics(productionRows).relatedCounts,
		{
			findingsWithoutLinkedAction: 0,
			pendingSdsReviews: 0,
		},
	);
});

function action(
	input: Partial<SerializedActionItemListRow> & {
		originType: SerializedActionItemListRow["originType"];
		status: SerializedActionItemListRow["status"];
		title: string;
	},
): SerializedActionItemListRow {
	return {
		assigneeEmail: input.assigneeEmail ?? null,
		assigneeLabel: input.assigneeLabel ?? null,
		assigneeUserId: input.assigneeUserId ?? null,
		attachmentCount: 0,
		completedAt: null,
		createdAt: "2026-05-01T08:00:00.000Z",
		departmentText: input.departmentText ?? null,
		description: null,
		dueDate: input.dueDate ?? null,
		effectivenessResult: input.effectivenessResult ?? "unknown",
		id: input.id ?? `action-${input.title.toLowerCase().replaceAll(" ", "-")}`,
		isSafetyCritical: false,
		originCreatedAt: "2026-05-01T08:00:00.000Z",
		originId: null,
		originLabel: input.originLabel ?? input.title,
		originType: input.originType,
		ownerText: input.ownerText ?? null,
		priority: input.priority ?? "medium",
		status: input.status,
		tenantId: "11111111-1111-4111-8111-111111111111",
		title: input.title,
		updatedAt: input.updatedAt ?? "2026-05-01T08:00:00.000Z",
		verificationNote: null,
		verificationStatus: input.verificationStatus ?? "not_required",
		verifiedAt: null,
		verifiedByEmail: null,
		verifiedByUserId: null,
	};
}
