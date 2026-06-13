import {
	ACTION_ITEM_ORIGIN_TYPES,
	ACTION_ITEM_STATUSES,
	type ActionItemOriginType,
	type ActionItemStatus,
	isActionItemOriginType,
	isActionItemStatus,
} from "./action-item";
import {
	ACTION_BOARD_DUE_FILTERS,
	type ActionBoardDueFilter,
} from "./fixtures";
import type { SerializedActionItemListRow } from "./queries";

export type ActionBoardAttentionFilter =
	| "all"
	| "needs_follow_up"
	| "unverified_closed";

export type ActionBoardFilterInput = {
	readonly assignee: string;
	readonly attention: ActionBoardAttentionFilter;
	readonly department: string;
	readonly due: ActionItemDueFilter;
	readonly origin: ActionItemOriginType | "all";
	readonly status: ActionItemStatus | "all";
};

export type ActionItemDueFilter = ActionBoardDueFilter;

export type ActionItemOverdueState = {
	readonly dueDate: Date | string | null;
	readonly status: ActionItemStatus;
};

export function isActionItemOverdue(
	row: ActionItemOverdueState,
	today: Date = new Date(),
): boolean {
	if (
		!row.dueDate ||
		row.status === "completed" ||
		row.status === "cancelled"
	) {
		return false;
	}

	const dueDate =
		row.dueDate instanceof Date ? actionBoardDateKey(row.dueDate) : row.dueDate;
	return dueDate < actionBoardDateKey(today);
}

export function normalizeActionItemStatusFilter(
	value: string | null | undefined,
): ActionItemStatus | null {
	return isActionItemStatus(value) ? value : null;
}

export function normalizeActionOriginTypeFilter(
	value: string | null | undefined,
): ActionItemOriginType | null {
	return isActionItemOriginType(value) ? value : null;
}

export function normalizeDueFilter(
	value: string | null | undefined,
): ActionItemDueFilter {
	return typeof value === "string" &&
		(ACTION_BOARD_DUE_FILTERS as readonly string[]).includes(value)
		? (value as ActionItemDueFilter)
		: "all";
}

export function actionItemFilterOptions() {
	return {
		due: ACTION_BOARD_DUE_FILTERS,
		originTypes: ACTION_ITEM_ORIGIN_TYPES,
		statuses: ACTION_ITEM_STATUSES,
	};
}

export function filterActionItemsForBoard(
	actions: readonly SerializedActionItemListRow[],
	filters: ActionBoardFilterInput,
): SerializedActionItemListRow[] {
	return actions.filter((action) => {
		if (filters.status !== "all" && action.status !== filters.status) {
			return false;
		}
		if (filters.origin !== "all" && action.originType !== filters.origin) {
			return false;
		}
		if (!attentionFilterMatches(action, filters.attention)) {
			return false;
		}
		if (
			filters.assignee !== "all" &&
			!assigneeFilterMatchesExactly(action, filters.assignee)
		) {
			return false;
		}
		if (
			filters.department !== "all" &&
			!exactTextFilterMatches(action.departmentText, filters.department)
		) {
			return false;
		}

		return dueFilterMatches(action, filters.due);
	});
}

export function actionBoardTodayKey(today: Date = new Date()): string {
	return actionBoardDateKey(today);
}

export function addDaysKey(dateKey: string, days: number): string {
	const [year, month, day] = dateKey.split("-").map(Number);
	const date = new Date(year, month - 1, day);
	date.setDate(date.getDate() + days);
	return actionBoardDateKey(date);
}

function actionBoardDateKey(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function attentionFilterMatches(
	action: SerializedActionItemListRow,
	filter: ActionBoardAttentionFilter,
): boolean {
	if (filter === "all") {
		return true;
	}

	if (filter === "needs_follow_up") {
		return actionNeedsFollowUp(action);
	}

	return (
		action.status === "completed" &&
		(action.verificationStatus === "needed" ||
			action.verificationStatus === "needs_follow_up" ||
			action.effectivenessResult === "needs_follow_up")
	);
}

function actionNeedsFollowUp(action: SerializedActionItemListRow): boolean {
	return (
		action.verificationStatus === "needs_follow_up" ||
		action.effectivenessResult === "needs_follow_up"
	);
}

function assigneeFilterMatchesExactly(
	action: SerializedActionItemListRow,
	filter: string,
): boolean {
	const normalizedFilter = normalizeFilterText(filter);
	if (!normalizedFilter) {
		return true;
	}

	return [
		action.assigneeUserId,
		action.assigneeEmail,
		action.assigneeLabel,
		action.ownerText,
	].some((value) => exactTextFilterMatches(value, normalizedFilter));
}

function exactTextFilterMatches(value: string | null, filter: string): boolean {
	const normalizedValue = normalizeFilterText(value);
	const normalizedFilter = normalizeFilterText(filter);
	return Boolean(
		normalizedValue && normalizedFilter && normalizedValue === normalizedFilter,
	);
}

function normalizeFilterText(value: string | null): string {
	return value?.trim().toLowerCase() ?? "";
}

function dueFilterMatches(
	action: SerializedActionItemListRow,
	filter: ActionItemDueFilter,
): boolean {
	if (filter === "all") {
		return true;
	}
	if (filter === "no_due_date") {
		return action.dueDate === null;
	}
	if (filter === "overdue") {
		return isActionItemOverdue(action);
	}
	if (!action.dueDate) {
		return false;
	}

	const today = actionBoardTodayKey();
	if (filter === "due_today") {
		return action.dueDate === today;
	}

	return action.dueDate >= today && action.dueDate < addDaysKey(today, 7);
}
