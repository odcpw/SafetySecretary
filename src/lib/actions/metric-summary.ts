import {
	ACTION_ITEM_STATUSES,
	type ActionItemOriginType,
	type ActionItemStatus,
} from "./action-item";
import {
	actionBoardTodayKey,
	addDaysKey,
	isActionItemOverdue,
} from "./filters";
import type { SerializedActionItemListRow } from "./queries";

export type ActionManagerBucket = {
	readonly count: number;
	readonly label: string;
	readonly value: string;
};

export type ActionManagerRelatedCounts = {
	readonly findingsWithoutLinkedAction: number;
	readonly pendingSdsReviews: number;
};

export type ActionManagerMetrics = {
	readonly byAssignee: readonly ActionManagerBucket[];
	readonly byDepartment: readonly ActionManagerBucket[];
	readonly byOriginType: readonly ActionManagerBucket[];
	readonly completedThisWeek: number;
	readonly dueSoonActions: number;
	readonly needsFollowUpActions: number;
	readonly openActions: number;
	readonly overdueActions: number;
	readonly relatedCounts: ActionManagerRelatedCounts;
	readonly statusCounts: Record<ActionItemStatus, number>;
	readonly unverifiedClosedActions: number;
};

const emptyRelatedCounts: ActionManagerRelatedCounts = {
	findingsWithoutLinkedAction: 0,
	pendingSdsReviews: 0,
};

export function summarizeActionManagerMetrics(
	actions: readonly SerializedActionItemListRow[],
	relatedCounts: ActionManagerRelatedCounts = emptyRelatedCounts,
	today: Date = new Date(),
): ActionManagerMetrics {
	const statusCounts = initialStatusCounts();
	const todayKey = actionBoardTodayKey(today);
	const nextWeek = addDaysKey(todayKey, 7);
	const weekStart = addDaysKey(todayKey, -7);
	const originCounts = new Map<ActionItemOriginType, number>();
	const departmentCounts = new Map<string, number>();
	const assigneeCounts = new Map<string, number>();

	let completedThisWeek = 0;
	let dueSoonActions = 0;
	let needsFollowUpActions = 0;
	let openActions = 0;
	let overdueActions = 0;
	let unverifiedClosedActions = 0;

	for (const action of actions) {
		statusCounts[action.status] += 1;
		increment(originCounts, action.originType);

		if (action.departmentText) {
			increment(departmentCounts, action.departmentText);
		}
		if (action.assigneeLabel) {
			increment(assigneeCounts, action.assigneeLabel);
		}

		if (action.status === "open" || action.status === "in_progress") {
			openActions += 1;
		}
		if (isActionItemOverdue(action, today)) {
			overdueActions += 1;
		}
		if (
			action.dueDate &&
			action.dueDate >= todayKey &&
			action.dueDate < nextWeek &&
			action.status !== "completed" &&
			action.status !== "cancelled"
		) {
			dueSoonActions += 1;
		}
		if (
			action.verificationStatus === "needs_follow_up" ||
			action.effectivenessResult === "needs_follow_up"
		) {
			needsFollowUpActions += 1;
		}
		if (
			action.status === "completed" &&
			(action.verificationStatus === "needed" ||
				action.verificationStatus === "needs_follow_up" ||
				action.effectivenessResult === "needs_follow_up")
		) {
			unverifiedClosedActions += 1;
		}
		if (
			action.status === "completed" &&
			action.updatedAt.slice(0, 10) >= weekStart &&
			action.updatedAt.slice(0, 10) <= todayKey
		) {
			completedThisWeek += 1;
		}
	}

	return {
		byAssignee: mapMap(assigneeCounts),
		byDepartment: mapMap(departmentCounts),
		byOriginType: mapMap(originCounts),
		completedThisWeek,
		dueSoonActions,
		needsFollowUpActions,
		openActions,
		overdueActions,
		relatedCounts,
		statusCounts,
		unverifiedClosedActions,
	};
}

export function initialStatusCounts(): Record<ActionItemStatus, number> {
	return Object.fromEntries(
		ACTION_ITEM_STATUSES.map((status) => [status, 0]),
	) as Record<ActionItemStatus, number>;
}

export function numberValue(value: number | bigint | undefined): number {
	return typeof value === "bigint" ? Number(value) : (value ?? 0);
}

export function bucketSort(
	left: ActionManagerBucket,
	right: ActionManagerBucket,
): number {
	return (
		right.count - left.count ||
		left.label.localeCompare(right.label, "en", { sensitivity: "base" })
	);
}

function mapMap<K extends string>(
	counts: ReadonlyMap<K, number>,
): readonly ActionManagerBucket[] {
	return [...counts.entries()]
		.map(([value, count]) => ({ count, label: value, value }))
		.sort(bucketSort);
}

function increment<K>(counts: Map<K, number>, key: K): void {
	counts.set(key, (counts.get(key) ?? 0) + 1);
}
