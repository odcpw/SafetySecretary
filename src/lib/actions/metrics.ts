import { withTenantConnection } from "../db/tenancy";
import { linkUnlinkedIncidentActionsForTenant } from "../incident/action-bridge";
import {
	type ActionItemOriginType,
	type ActionItemStatus,
	isActionItemOriginType,
	isActionItemStatus,
} from "./action-item";
import { actionBoardTodayKey, addDaysKey } from "./filters";
import {
	type ActionManagerBucket,
	type ActionManagerMetrics,
	bucketSort,
	initialStatusCounts,
	numberValue,
} from "./metric-summary";

type CountRow = {
	count: number | bigint;
	value: string | null;
};

type AssigneeCountRow = CountRow & {
	label: string | null;
};

export async function loadActionManagerMetrics(
	tenantId: string,
): Promise<ActionManagerMetrics> {
	const today = actionBoardTodayKey();
	const nextWeek = addDaysKey(today, 7);
	const weekStart = addDaysKey(today, -7);

	return withTenantConnection(tenantId, async (tx) => {
		await linkUnlinkedIncidentActionsForTenant(tx, { tenantId });

		const [
			statusRows,
			originRows,
			departmentRows,
			assigneeRows,
			attentionRows,
			pendingSdsRows,
			findingsWithoutActionRows,
		] = await Promise.all([
			tx.$queryRaw<CountRow[]>`
				SELECT status::text AS value, count(*)::integer AS count
				FROM action_item
				GROUP BY status
			`,
			tx.$queryRaw<CountRow[]>`
				SELECT origin_type::text AS value, count(*)::integer AS count
				FROM action_item
				GROUP BY origin_type
			`,
			tx.$queryRaw<CountRow[]>`
				SELECT NULLIF(BTRIM(department_text), '') AS value, count(*)::integer AS count
				FROM action_item
				WHERE department_text IS NOT NULL
				GROUP BY NULLIF(BTRIM(department_text), '')
			`,
			tx.$queryRaw<AssigneeCountRow[]>`
				SELECT
					COALESCE(action.assignee_user_id::text, NULLIF(BTRIM(action.owner_text), '')) AS value,
					COALESCE(
						NULLIF(BTRIM(action.owner_text), ''),
						shared.action_tenant_user_email(${tenantId}::uuid, action.assignee_user_id)
					) AS label,
					count(*)::integer AS count
				FROM action_item action
				GROUP BY
					action.assignee_user_id,
					NULLIF(BTRIM(action.owner_text), ''),
					shared.action_tenant_user_email(${tenantId}::uuid, action.assignee_user_id)
			`,
			tx.$queryRaw<
				Array<{
					completedThisWeek: number | bigint;
					dueSoonActions: number | bigint;
					needsFollowUpActions: number | bigint;
					openActions: number | bigint;
					overdueActions: number | bigint;
					unverifiedClosedActions: number | bigint;
				}>
			>`
				SELECT
					count(*) FILTER (
						WHERE status IN ('open'::action_item_status, 'in_progress'::action_item_status)
					)::integer AS "openActions",
					count(*) FILTER (
						WHERE due_date < ${today}::date
							AND status NOT IN ('completed'::action_item_status, 'cancelled'::action_item_status)
					)::integer AS "overdueActions",
					count(*) FILTER (
						WHERE due_date >= ${today}::date
							AND due_date < ${nextWeek}::date
							AND status NOT IN ('completed'::action_item_status, 'cancelled'::action_item_status)
					)::integer AS "dueSoonActions",
					count(*) FILTER (
						WHERE verification_status = 'needs_follow_up'::action_item_verification_status
							OR effectiveness_result = 'needs_follow_up'::action_item_effectiveness_result
					)::integer AS "needsFollowUpActions",
					count(*) FILTER (
						WHERE status = 'completed'::action_item_status
							AND (
								verification_status IN (
									'needed'::action_item_verification_status,
									'needs_follow_up'::action_item_verification_status
								)
								OR effectiveness_result = 'needs_follow_up'::action_item_effectiveness_result
							)
					)::integer AS "unverifiedClosedActions",
					count(*) FILTER (
						WHERE status = 'completed'::action_item_status
							AND updated_at::date >= ${weekStart}::date
							AND updated_at::date <= ${today}::date
					)::integer AS "completedThisWeek"
				FROM action_item
			`,
			tx.$queryRaw<Array<{ count: number | bigint }>>`
				SELECT count(DISTINCT profile.id)::integer AS count
				FROM chemical_profile profile
				JOIN chemical_control control
					ON control.chemical_profile_id = profile.id
					AND control.source_provenance = 'sds_extraction'::chemical_control_source_provenance
					AND control.review_status = 'pending'::chemical_control_review_status
					AND control.source_storage_path = profile.storage_path
				WHERE profile.profile_status <> 'archived'::chemical_profile_status
			`,
			tx.$queryRaw<Array<{ count: number | bigint }>>`
				SELECT count(*)::integer AS count
				FROM finding
				WHERE action_item_id IS NULL
					AND status = 'open'::finding_status
			`,
		]);

		const attention = attentionRows[0];

		return {
			byAssignee: mapAssigneeRows(assigneeRows),
			byDepartment: mapTextRows(departmentRows),
			byOriginType: mapOriginRows(originRows),
			completedThisWeek: numberValue(attention?.completedThisWeek),
			dueSoonActions: numberValue(attention?.dueSoonActions),
			needsFollowUpActions: numberValue(attention?.needsFollowUpActions),
			openActions: numberValue(attention?.openActions),
			overdueActions: numberValue(attention?.overdueActions),
			relatedCounts: {
				findingsWithoutLinkedAction: numberValue(
					findingsWithoutActionRows[0]?.count,
				),
				pendingSdsReviews: numberValue(pendingSdsRows[0]?.count),
			},
			statusCounts: mapStatusCounts(statusRows),
			unverifiedClosedActions: numberValue(attention?.unverifiedClosedActions),
		};
	});
}

function mapStatusCounts(
	rows: readonly CountRow[],
): Record<ActionItemStatus, number> {
	const counts = initialStatusCounts();

	for (const row of rows) {
		if (isActionItemStatus(row.value)) {
			counts[row.value] = numberValue(row.count);
		}
	}

	return counts;
}

function mapOriginRows(
	rows: readonly CountRow[],
): readonly ActionManagerBucket[] {
	return rows
		.filter((row): row is CountRow & { value: ActionItemOriginType } =>
			isActionItemOriginType(row.value),
		)
		.map((row) => ({
			count: numberValue(row.count),
			label: row.value,
			value: row.value,
		}))
		.sort(bucketSort);
}

function mapTextRows(
	rows: readonly CountRow[],
): readonly ActionManagerBucket[] {
	return rows
		.filter((row): row is CountRow & { value: string } => Boolean(row.value))
		.map((row) => ({
			count: numberValue(row.count),
			label: row.value,
			value: row.value,
		}))
		.sort(bucketSort);
}

function mapAssigneeRows(
	rows: readonly AssigneeCountRow[],
): readonly ActionManagerBucket[] {
	return rows
		.map((row) => ({
			count: numberValue(row.count),
			label: row.label ?? row.value ?? "",
			value: row.value ?? "",
		}))
		.filter((row) => row.label)
		.sort(bucketSort);
}
