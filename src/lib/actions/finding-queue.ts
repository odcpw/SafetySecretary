import { withTenantConnection } from "../db/tenancy";
import {
	type FindingIntent,
	type FindingOriginSeverity,
	type FindingOriginStatus,
	type FindingOriginType,
	type FindingRecord,
	isFindingIntent,
	isFindingOriginSeverity,
	isFindingOriginStatus,
	isFindingOriginType,
	prepareFindingActionInput,
	prepareFindingForStorage,
} from "../findings/finding-origin";
import type { ActionItemOriginType, ActionItemPriority } from "./action-item";

export const FINDINGS_WITHOUT_ACTION_SOURCE_QUEUE =
	"findings_without_action" as const;

export type FindingActionQueueSeed = {
	readonly departmentText: string | null;
	readonly description: string;
	readonly findingId: string;
	readonly originCreatedAt: string;
	readonly originId: string;
	readonly originLabel: string;
	readonly originType: ActionItemOriginType;
	readonly priority: ActionItemPriority;
	readonly title: string;
};

export type FindingQueueRow = {
	readonly actionItemId: string | null;
	readonly createdAt: Date;
	readonly departmentText: string | null;
	readonly description: string;
	readonly findingType: FindingOriginType;
	readonly id: string;
	readonly intent: FindingIntent;
	readonly locationText: string | null;
	readonly photoStoragePath: string | null;
	readonly reportedAt: Date;
	readonly reportedByUserId: string;
	readonly severity: FindingOriginSeverity;
	readonly status: FindingOriginStatus;
	readonly tenantId: string;
	readonly title: string;
	readonly updatedAt: Date;
	readonly workAsDoneContext: string | null;
};

export async function loadNextUnlinkedFindingActionSeed(
	tenantId: string,
): Promise<FindingActionQueueSeed | null> {
	const rows = await withTenantConnection(
		tenantId,
		(tx) => tx.$queryRaw<FindingQueueRow[]>`
			SELECT
				id::text AS id,
				tenant_id::text AS "tenantId",
				finding_type::text AS "findingType",
				intent::text AS intent,
				title,
				description,
				severity::text AS severity,
				department_text AS "departmentText",
				location_text AS "locationText",
				work_as_done_context AS "workAsDoneContext",
				photo_storage_path AS "photoStoragePath",
				reported_by_user_id::text AS "reportedByUserId",
				reported_at AS "reportedAt",
				status::text AS status,
				action_item_id::text AS "actionItemId",
				created_at AS "createdAt",
				updated_at AS "updatedAt"
			FROM finding
			WHERE status = 'open'::finding_status
				AND action_item_id IS NULL
			ORDER BY reported_at ASC, created_at ASC, id ASC
			LIMIT 1
		`,
	);
	const finding = rows[0] ? findingRecordFromQueueRow(rows[0]) : null;

	return finding ? findingActionQueueSeed(finding) : null;
}

export function findingActionQueueSeed(
	finding: FindingRecord,
): FindingActionQueueSeed {
	const action = prepareFindingActionInput(finding);

	return {
		departmentText: action.departmentText ?? null,
		description: action.description ?? finding.description,
		findingId: finding.id,
		originCreatedAt: dateTimeString(action.originCreatedAt),
		originId: action.originId ?? finding.id,
		originLabel: action.originLabel ?? finding.title,
		originType: action.originType,
		priority: action.priority ?? "medium",
		title: action.title,
	};
}

export function findingRecordFromQueueRow(row: FindingQueueRow): FindingRecord {
	if (
		!isFindingOriginType(row.findingType) ||
		!isFindingIntent(row.intent) ||
		!isFindingOriginSeverity(row.severity) ||
		!isFindingOriginStatus(row.status)
	) {
		throw new Error("INVALID_FINDING_QUEUE_ROW");
	}

	return prepareFindingForStorage({
		actionItemId: row.actionItemId,
		createdAt: row.createdAt,
		departmentText: row.departmentText,
		description: row.description,
		findingType: row.findingType,
		id: row.id,
		intent: row.intent,
		locationText: row.locationText,
		photoStoragePath: row.photoStoragePath,
		reportedAt: row.reportedAt,
		reportedByUserId: row.reportedByUserId,
		severity: row.severity,
		status: row.status,
		tenantId: row.tenantId,
		title: row.title,
		updatedAt: row.updatedAt,
		workAsDoneContext: row.workAsDoneContext,
	});
}

function dateTimeString(value: Date | string | null | undefined): string {
	if (!value) {
		return "";
	}

	return value instanceof Date ? value.toISOString() : value;
}
