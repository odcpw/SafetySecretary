import { randomUUID } from "node:crypto";
import {
	type ActionItemRecord,
	type ActionItemStatus,
	prepareActionItemForStorage,
} from "../actions/action-item";
import type { TenantConnectionClient } from "../db";

type IncidentActionStatus = "OPEN" | "IN_PROGRESS" | "COMPLETE";

type IncidentActionBridgeInput = {
	readonly actionId: string;
	readonly incidentId: string;
	readonly tenantId: string;
};

type IncidentActionDeleteInput = IncidentActionBridgeInput;

type IncidentActionCaseInput = {
	readonly incidentId: string;
	readonly tenantId: string;
};

type IncidentActionTenantInput = {
	readonly tenantId: string;
};

type IncidentActionBridgeRow = {
	actionCreatedAt: Date;
	actionId: string;
	actionItemId: string | null;
	causeCreatedAt: Date;
	causeNodeId: string;
	causeStatement: string;
	description: string;
	dueDate: Date | string | null;
	incidentAt: Date | null;
	incidentTitle: string;
	ownerRole: string | null;
	status: IncidentActionStatus;
};

type ExistingActionItemRow = {
	completedAt: Date | null;
	id: string;
};

export async function linkUnlinkedIncidentActionsForCase(
	tx: TenantConnectionClient,
	input: IncidentActionCaseInput,
): Promise<void> {
	const rows = await tx.$queryRaw<Array<{ actionId: string }>>`
		SELECT action.id::text AS "actionId"
		FROM incident_cause_action action
		JOIN incident_cause_node node ON node.id = action.cause_node_id
		WHERE node.case_id = ${input.incidentId}::uuid
			AND action.action_item_id IS NULL
		ORDER BY node.order_index ASC, node.created_at ASC, action.order_index ASC, action.created_at ASC, action.id ASC
	`;

	for (const row of rows) {
		await syncIncidentActionBridge(tx, {
			actionId: row.actionId,
			incidentId: input.incidentId,
			tenantId: input.tenantId,
		});
	}
}

export async function linkUnlinkedIncidentActionsForTenant(
	tx: TenantConnectionClient,
	input: IncidentActionTenantInput,
): Promise<void> {
	const rows = await tx.$queryRaw<
		Array<{
			actionId: string;
			incidentId: string;
		}>
	>`
		SELECT
			action.id::text AS "actionId",
			node.case_id::text AS "incidentId"
		FROM incident_cause_action action
		JOIN incident_cause_node node ON node.id = action.cause_node_id
		WHERE action.action_item_id IS NULL
		ORDER BY node.case_id ASC, node.order_index ASC, node.created_at ASC, action.order_index ASC, action.created_at ASC, action.id ASC
	`;

	for (const row of rows) {
		await syncIncidentActionBridge(tx, {
			actionId: row.actionId,
			incidentId: row.incidentId,
			tenantId: input.tenantId,
		});
	}
}

export async function syncIncidentActionBridge(
	tx: TenantConnectionClient,
	input: IncidentActionBridgeInput,
): Promise<string | null> {
	const action = await loadIncidentActionBridgeRow(tx, input);

	if (!action) {
		return null;
	}

	const existing = action.actionItemId
		? await loadExistingActionItem(tx, action.actionItemId)
		: null;

	if (existing) {
		await updateLinkedActionItem(tx, {
			action,
			actionItemId: existing.id,
			completedAt: existing.completedAt,
			tenantId: input.tenantId,
		});
		return existing.id;
	}

	const actionItemId = randomUUID();
	await insertLinkedActionItem(tx, {
		action,
		actionItemId,
		tenantId: input.tenantId,
	});
	await tx.$executeRaw`
		UPDATE incident_cause_action
		SET action_item_id = ${actionItemId}::uuid,
			updated_at = CURRENT_TIMESTAMP
		WHERE id = ${input.actionId}::uuid
	`;

	return actionItemId;
}

export async function deleteIncidentActionBridge(
	tx: TenantConnectionClient,
	input: IncidentActionDeleteInput,
): Promise<boolean> {
	const deleted = await tx.$queryRaw<Array<{ actionItemId: string | null }>>`
		DELETE FROM incident_cause_action AS action
		USING incident_cause_node AS node
		WHERE action.id = ${input.actionId}::uuid
			AND action.cause_node_id = node.id
			AND node.case_id = ${input.incidentId}::uuid
		RETURNING action.action_item_id::text AS "actionItemId"
	`;

	const actionItemId = deleted[0]?.actionItemId ?? null;
	if (actionItemId) {
		await tx.$executeRaw`
			DELETE FROM action_item
			WHERE id = ${actionItemId}::uuid
				AND origin_type = 'ii'::action_item_origin_type
				AND NOT EXISTS (
					SELECT 1
					FROM incident_cause_action
					WHERE action_item_id = ${actionItemId}::uuid
				)
		`;
	}

	return deleted.length > 0;
}

async function loadIncidentActionBridgeRow(
	tx: TenantConnectionClient,
	input: IncidentActionBridgeInput,
): Promise<IncidentActionBridgeRow | null> {
	const rows = await tx.$queryRaw<IncidentActionBridgeRow[]>`
		SELECT
			action.id::text AS "actionId",
			action.action_item_id::text AS "actionItemId",
			action.cause_node_id::text AS "causeNodeId",
			node.statement AS "causeStatement",
			node.created_at AS "causeCreatedAt",
			incident.title AS "incidentTitle",
			incident.incident_at AS "incidentAt",
			action.description,
			action.owner_role AS "ownerRole",
			action.due_date AS "dueDate",
			action.status::text AS status,
			action.created_at AS "actionCreatedAt"
		FROM incident_cause_action action
		JOIN incident_cause_node node ON node.id = action.cause_node_id
		JOIN incident_case incident ON incident.id = node.case_id
		WHERE action.id = ${input.actionId}::uuid
			AND node.case_id = ${input.incidentId}::uuid
		LIMIT 1
		FOR UPDATE OF action
	`;

	return rows[0] ?? null;
}

async function loadExistingActionItem(
	tx: TenantConnectionClient,
	actionItemId: string,
): Promise<ExistingActionItemRow | null> {
	const rows = await tx.$queryRaw<ExistingActionItemRow[]>`
		SELECT id::text AS id, completed_at AS "completedAt"
		FROM action_item
		WHERE id = ${actionItemId}::uuid
		LIMIT 1
	`;

	return rows[0] ?? null;
}

async function insertLinkedActionItem(
	tx: TenantConnectionClient,
	input: {
		readonly action: IncidentActionBridgeRow;
		readonly actionItemId: string;
		readonly tenantId: string;
	},
): Promise<void> {
	const record = prepareBridgeActionItemRecord({
		action: input.action,
		actionItemId: input.actionItemId,
		completedAt: null,
		tenantId: input.tenantId,
	});

	await tx.$executeRaw`
		INSERT INTO action_item (
			id,
			tenant_id,
			title,
			description,
			status,
			due_date,
			owner_text,
			origin_type,
			origin_id,
			origin_label,
			origin_created_at,
			priority,
			is_safety_critical,
			verification_status,
			effectiveness_result,
			completed_at,
			created_at,
			updated_at
		) VALUES (
			${record.id}::uuid,
			${record.tenantId}::uuid,
			${record.title},
			${record.description},
			${record.status}::action_item_status,
			${dateKey(record.dueDate)}::date,
			${record.ownerText},
			${record.originType}::action_item_origin_type,
			${record.originId}::uuid,
			${record.originLabel},
			${record.originCreatedAt}::timestamptz,
			${record.priority}::action_item_priority,
			${record.isSafetyCritical},
			${record.verificationStatus}::action_item_verification_status,
			${record.effectivenessResult}::action_item_effectiveness_result,
			${record.completedAt}::timestamptz,
			${record.createdAt}::timestamptz,
			${record.updatedAt}::timestamptz
		)
	`;
}

async function updateLinkedActionItem(
	tx: TenantConnectionClient,
	input: {
		readonly action: IncidentActionBridgeRow;
		readonly actionItemId: string;
		readonly completedAt: Date | null;
		readonly tenantId: string;
	},
): Promise<void> {
	const record = prepareBridgeActionItemRecord({
		action: input.action,
		actionItemId: input.actionItemId,
		completedAt: input.completedAt,
		tenantId: input.tenantId,
	});

	await tx.$executeRaw`
		UPDATE action_item
		SET
			title = ${record.title},
			description = ${record.description},
			status = ${record.status}::action_item_status,
			due_date = ${dateKey(record.dueDate)}::date,
			owner_text = ${record.ownerText},
			completed_at = ${record.completedAt}::timestamptz,
			updated_at = CURRENT_TIMESTAMP
		WHERE id = ${input.actionItemId}::uuid
	`;
}

function prepareBridgeActionItemRecord(input: {
	readonly action: IncidentActionBridgeRow;
	readonly actionItemId: string;
	readonly completedAt: Date | null;
	readonly tenantId: string;
}): ActionItemRecord {
	const status = toActionItemStatus(input.action.status);
	const now = new Date();
	const completedAt =
		status === "completed" ? (input.completedAt ?? now) : null;

	return prepareActionItemForStorage({
		completedAt,
		createdAt: input.action.actionCreatedAt,
		description: input.action.description,
		dueDate: input.action.dueDate,
		id: input.actionItemId,
		originContext: {
			date: input.action.incidentAt ?? input.action.actionCreatedAt,
			sourceLabel: input.action.incidentTitle,
			title: input.action.incidentTitle,
		},
		originCreatedAt: input.action.causeCreatedAt,
		originId: input.action.causeNodeId,
		originType: "ii",
		ownerText: input.action.ownerRole,
		status,
		tenantId: input.tenantId,
		title: actionItemTitle(input.action.description),
		updatedAt: now,
	});
}

function toActionItemStatus(status: IncidentActionStatus): ActionItemStatus {
	if (status === "IN_PROGRESS") {
		return "in_progress";
	}
	if (status === "COMPLETE") {
		return "completed";
	}
	return "open";
}

function actionItemTitle(description: string): string {
	const normalized = description.trim().replace(/\s+/g, " ");
	return normalized.length > 120
		? `${normalized.slice(0, 117).trimEnd()}...`
		: normalized;
}

function dateKey(value: Date | null): string | null {
	return value?.toISOString().slice(0, 10) ?? null;
}
