import { withTenantConnection } from "../db/tenancy";
import {
	type ActionItemEffectivenessResult,
	type ActionItemOriginType,
	type ActionItemPriority,
	type ActionItemStatus,
	type ActionItemVerificationStatus,
	isActionItemEffectivenessResult,
	isActionItemOriginType,
	isActionItemPriority,
	isActionItemStatus,
	isActionItemVerificationStatus,
} from "./action-item";
import {
	type ActionAttachmentRow,
	listActionAttachments,
	type SerializedActionAttachmentRow,
} from "./attachments";
import {
	type ActionItemDueFilter,
	actionBoardTodayKey,
	addDaysKey,
	isActionItemOverdue,
	normalizeActionItemStatusFilter,
	normalizeActionOriginTypeFilter,
	normalizeDueFilter,
} from "./filters";
import type { ActionBoardDueFilter } from "./fixtures";
import { linkUnlinkedIncidentActionsForTenant } from "../incident/action-bridge";

export type { ActionBoardDueFilter, ActionItemDueFilter };

export type ActionItemListFilters = {
	readonly status?: string | null;
	readonly due?: string | null;
	readonly originType?: string | null;
	readonly assignee?: string | null;
	readonly department?: string | null;
};

export type ActionItemListRow = {
	readonly id: string;
	readonly tenantId: string;
	readonly title: string;
	readonly description: string | null;
	readonly status: ActionItemStatus;
	readonly dueDate: Date | null;
	readonly assigneeUserId: string | null;
	readonly assigneeEmail: string | null;
	readonly assigneeLabel: string | null;
	readonly ownerText: string | null;
	readonly departmentText: string | null;
	readonly originType: ActionItemOriginType;
	readonly originId: string | null;
	readonly originLabel: string;
	readonly originCreatedAt: Date;
	readonly priority: ActionItemPriority;
	readonly isSafetyCritical: boolean;
	readonly verificationStatus: ActionItemVerificationStatus;
	readonly verificationNote: string | null;
	readonly verifiedAt: Date | null;
	readonly verifiedByUserId: string | null;
	readonly verifiedByEmail: string | null;
	readonly effectivenessResult: ActionItemEffectivenessResult;
	readonly completedAt: Date | null;
	readonly attachmentCount: number;
	readonly createdAt: Date;
	readonly updatedAt: Date;
};

export type ActionItemDetail = ActionItemListRow & {
	readonly attachments: readonly ActionAttachmentRow[];
};

export type SerializedActionItemListRow = Omit<
	ActionItemListRow,
	| "completedAt"
	| "createdAt"
	| "dueDate"
	| "originCreatedAt"
	| "updatedAt"
	| "verifiedAt"
> & {
	readonly completedAt: string | null;
	readonly createdAt: string;
	readonly dueDate: string | null;
	readonly originCreatedAt: string;
	readonly updatedAt: string;
	readonly verifiedAt: string | null;
};

export type SerializedActionItemDetail = SerializedActionItemListRow & {
	readonly attachments: readonly SerializedActionAttachmentRow[];
};

type ActionItemQueryRow = {
	id: string;
	tenantId: string;
	title: string;
	description: string | null;
	status: string;
	dueDate: Date | null;
	assigneeUserId: string | null;
	assigneeEmail: string | null;
	assigneeLabel: string | null;
	ownerText: string | null;
	departmentText: string | null;
	originType: string;
	originId: string | null;
	originLabel: string;
	originCreatedAt: Date;
	priority: string;
	isSafetyCritical: boolean;
	verificationStatus: string;
	verificationNote: string | null;
	verifiedAt: Date | null;
	verifiedByUserId: string | null;
	verifiedByEmail: string | null;
	effectivenessResult: string;
	completedAt: Date | null;
	attachmentCount: number | bigint;
	createdAt: Date;
	updatedAt: Date;
};

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listActionItems(
	tenantId: string,
	filters: ActionItemListFilters = {},
): Promise<ActionItemListRow[]> {
	const status = normalizeActionItemStatusFilter(filters.status);
	const due = normalizeDueFilter(filters.due);
	const originType = normalizeActionOriginTypeFilter(filters.originType);
	const assignee = normalizeTextFilter(filters.assignee);
	const assigneeUserId =
		assignee && UUID_PATTERN.test(assignee) ? assignee : null;
	const assigneeText = assigneeUserId ? null : assignee;
	const department = normalizeTextFilter(filters.department);
	const today = actionBoardTodayKey();
	const nextWeek = addDaysKey(today, 7);

	return withTenantConnection(tenantId, async (tx) => {
		await linkUnlinkedIncidentActionsForTenant(tx, { tenantId });

		const rows = await tx.$queryRaw<ActionItemQueryRow[]>`
			SELECT
				action.id::text AS id,
				action.tenant_id::text AS "tenantId",
				action.title,
				action.description,
				action.status::text AS status,
				action.due_date AS "dueDate",
				action.assignee_user_id::text AS "assigneeUserId",
				shared.action_tenant_user_email(${tenantId}::uuid, action.assignee_user_id) AS "assigneeEmail",
				COALESCE(
					action.owner_text,
					shared.action_tenant_user_email(${tenantId}::uuid, action.assignee_user_id)
				) AS "assigneeLabel",
				action.owner_text AS "ownerText",
				action.department_text AS "departmentText",
				action.origin_type::text AS "originType",
				action.origin_id::text AS "originId",
				action.origin_label AS "originLabel",
				action.origin_created_at AS "originCreatedAt",
				action.priority::text AS priority,
				action.is_safety_critical AS "isSafetyCritical",
				action.verification_status::text AS "verificationStatus",
				action.verification_note AS "verificationNote",
				action.verified_at AS "verifiedAt",
				action.verified_by_user_id::text AS "verifiedByUserId",
				shared.action_tenant_user_email(${tenantId}::uuid, action.verified_by_user_id) AS "verifiedByEmail",
				action.effectiveness_result::text AS "effectivenessResult",
				action.completed_at AS "completedAt",
				COALESCE(attachment_counts.attachment_count, 0)::integer AS "attachmentCount",
				action.created_at AS "createdAt",
				action.updated_at AS "updatedAt"
			FROM action_item action
			LEFT JOIN LATERAL (
				SELECT count(*)::integer AS attachment_count
				FROM action_attachment attachment
				WHERE attachment.action_item_id = action.id
			) attachment_counts ON true
			WHERE (${status}::action_item_status IS NULL OR action.status = ${status}::action_item_status)
				AND (${originType}::action_item_origin_type IS NULL OR action.origin_type = ${originType}::action_item_origin_type)
				AND (${assigneeUserId}::uuid IS NULL OR action.assignee_user_id = ${assigneeUserId}::uuid)
				AND (
					${assigneeText}::text IS NULL
					OR action.owner_text ILIKE '%' || ${assigneeText}::text || '%'
					OR shared.action_tenant_user_email(${tenantId}::uuid, action.assignee_user_id) ILIKE '%' || ${assigneeText}::text || '%'
				)
				AND (
					${department}::text IS NULL
					OR action.department_text ILIKE '%' || ${department}::text || '%'
				)
				AND (
					${due}::text = 'all'
					OR (${due}::text = 'no_due_date' AND action.due_date IS NULL)
					OR (${due}::text = 'due_today' AND action.due_date = ${today}::date)
					OR (${due}::text = 'due_this_week' AND action.due_date >= ${today}::date AND action.due_date < ${nextWeek}::date)
					OR (
						${due}::text = 'overdue'
						AND action.due_date < ${today}::date
						AND action.status NOT IN ('completed'::action_item_status, 'cancelled'::action_item_status)
					)
				)
			ORDER BY
				CASE
					WHEN action.status NOT IN ('completed'::action_item_status, 'cancelled'::action_item_status)
						AND action.due_date < ${today}::date THEN 0
					WHEN action.status = 'open' THEN 1
					WHEN action.status = 'in_progress' THEN 2
					WHEN action.status = 'completed' THEN 3
					ELSE 4
				END,
				action.due_date ASC NULLS LAST,
				action.updated_at DESC,
				action.title ASC
		`;

		return rows.map(mapActionItemQueryRow);
	});
}

export async function getActionItemDetail(
	tenantId: string,
	actionItemId: string,
): Promise<ActionItemDetail | null> {
	const rows = await withTenantConnection(
		tenantId,
		(tx) =>
			tx.$queryRaw<ActionItemQueryRow[]>`
			SELECT
				action.id::text AS id,
				action.tenant_id::text AS "tenantId",
				action.title,
				action.description,
				action.status::text AS status,
				action.due_date AS "dueDate",
				action.assignee_user_id::text AS "assigneeUserId",
				shared.action_tenant_user_email(${tenantId}::uuid, action.assignee_user_id) AS "assigneeEmail",
				COALESCE(
					action.owner_text,
					shared.action_tenant_user_email(${tenantId}::uuid, action.assignee_user_id)
				) AS "assigneeLabel",
				action.owner_text AS "ownerText",
				action.department_text AS "departmentText",
				action.origin_type::text AS "originType",
				action.origin_id::text AS "originId",
				action.origin_label AS "originLabel",
				action.origin_created_at AS "originCreatedAt",
				action.priority::text AS priority,
				action.is_safety_critical AS "isSafetyCritical",
				action.verification_status::text AS "verificationStatus",
				action.verification_note AS "verificationNote",
				action.verified_at AS "verifiedAt",
				action.verified_by_user_id::text AS "verifiedByUserId",
				shared.action_tenant_user_email(${tenantId}::uuid, action.verified_by_user_id) AS "verifiedByEmail",
				action.effectiveness_result::text AS "effectivenessResult",
				action.completed_at AS "completedAt",
				COALESCE(attachment_counts.attachment_count, 0)::integer AS "attachmentCount",
				action.created_at AS "createdAt",
				action.updated_at AS "updatedAt"
			FROM action_item action
			LEFT JOIN LATERAL (
				SELECT count(*)::integer AS attachment_count
				FROM action_attachment attachment
				WHERE attachment.action_item_id = action.id
			) attachment_counts ON true
			WHERE action.id = ${actionItemId}::uuid
			LIMIT 1
		`,
	);
	const row = rows[0];

	if (!row) {
		return null;
	}

	return {
		...mapActionItemQueryRow(row),
		attachments: await listActionAttachments(tenantId, actionItemId),
	};
}

export function serializeActionItemListRow(
	row: ActionItemListRow,
): SerializedActionItemListRow {
	return {
		...row,
		completedAt: row.completedAt?.toISOString() ?? null,
		createdAt: row.createdAt.toISOString(),
		dueDate: row.dueDate ? formatDate(row.dueDate) : null,
		originCreatedAt: row.originCreatedAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		verifiedAt: row.verifiedAt?.toISOString() ?? null,
	};
}

export function serializeActionItemDetail(
	row: ActionItemDetail,
): SerializedActionItemDetail {
	return {
		...serializeActionItemListRow(row),
		attachments: row.attachments.map(serializeActionAttachmentRow),
	};
}

export {
	isActionItemOverdue,
	normalizeActionItemStatusFilter,
	normalizeActionOriginTypeFilter,
	normalizeDueFilter,
};

function mapActionItemQueryRow(row: ActionItemQueryRow): ActionItemListRow {
	if (!isActionItemStatus(row.status)) {
		throw new Error(`INVALID_ACTION_ITEM_STATUS:${row.status}`);
	}
	if (!isActionItemOriginType(row.originType)) {
		throw new Error(`INVALID_ACTION_ITEM_ORIGIN_TYPE:${row.originType}`);
	}
	if (!isActionItemPriority(row.priority)) {
		throw new Error(`INVALID_ACTION_ITEM_PRIORITY:${row.priority}`);
	}
	if (!isActionItemVerificationStatus(row.verificationStatus)) {
		throw new Error(
			`INVALID_ACTION_ITEM_VERIFICATION_STATUS:${row.verificationStatus}`,
		);
	}
	if (!isActionItemEffectivenessResult(row.effectivenessResult)) {
		throw new Error(
			`INVALID_ACTION_ITEM_EFFECTIVENESS_RESULT:${row.effectivenessResult}`,
		);
	}

	return {
		...row,
		attachmentCount: Number(row.attachmentCount),
		effectivenessResult: row.effectivenessResult,
		originType: row.originType,
		priority: row.priority,
		status: row.status,
		verificationStatus: row.verificationStatus,
	};
}

function serializeActionAttachmentRow(
	row: ActionAttachmentRow,
): SerializedActionAttachmentRow {
	return {
		...row,
		uploadedAt: row.uploadedAt.toISOString(),
	};
}

function normalizeTextFilter(value: string | null | undefined): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 && trimmed !== "all" ? trimmed : null;
}

function formatDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}
