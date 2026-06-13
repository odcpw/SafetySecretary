import { randomUUID } from "node:crypto";
import { withSharedConnection, withTenantConnection } from "../db/tenancy";
import { prepareFindingActionInput } from "../findings/finding-origin";
import {
	type ActionItemEffectivenessResult,
	type ActionItemInput,
	type ActionItemOriginType,
	type ActionItemPriority,
	type ActionItemRecord,
	type ActionItemStatus,
	ActionItemValidationError,
	type ActionItemVerificationStatus,
	isActionItemEffectivenessResult,
	isActionItemOriginType,
	isActionItemPriority,
	isActionItemStatus,
	isActionItemVerificationStatus,
	prepareActionItemForStorage,
} from "./action-item";
import {
	type FindingQueueRow,
	findingRecordFromQueueRow,
} from "./finding-queue";
import type { ActionOriginContext } from "./origin-contract";
import { type ActionItemDetail, getActionItemDetail } from "./queries";

export const UI_CREATABLE_ACTION_ORIGIN_TYPES = [
	"manual",
	"meeting",
	"toolbox_talk",
] as const satisfies readonly ActionItemOriginType[];

export type UiCreatableActionOriginType =
	(typeof UI_CREATABLE_ACTION_ORIGIN_TYPES)[number];

export type ActionCreatePayload = {
	readonly title: string;
	readonly description?: string | null;
	readonly status?: ActionItemStatus | null;
	readonly dueDate?: string | null;
	readonly assigneeUserId?: string | null;
	readonly ownerText?: string | null;
	readonly departmentText?: string | null;
	readonly originType: ActionItemOriginType;
	readonly originId?: string | null;
	readonly originLabel?: string | null;
	readonly originCreatedAt?: string | null;
	readonly originContext?: ActionOriginContext | null;
	readonly priority?: ActionItemPriority | null;
	readonly isSafetyCritical?: boolean | null;
	readonly verificationStatus?: ActionItemVerificationStatus | null;
	readonly verificationNote?: string | null;
	readonly verifiedAt?: string | null;
	readonly verifiedByUserId?: string | null;
	readonly effectivenessResult?: ActionItemEffectivenessResult | null;
};

export type ActionUpdatePayload = {
	readonly status?: ActionItemStatus | null;
	readonly dueDate?: string | null;
	readonly assigneeUserId?: string | null;
	readonly ownerText?: string | null;
	readonly departmentText?: string | null;
	readonly priority?: ActionItemPriority | null;
	readonly description?: string | null;
	readonly isSafetyCritical?: boolean | null;
	readonly verificationStatus?: ActionItemVerificationStatus | null;
	readonly verificationNote?: string | null;
	readonly verifiedAt?: string | null;
	readonly verifiedByUserId?: string | null;
	readonly effectivenessResult?: ActionItemEffectivenessResult | null;
	readonly originLabel?: string | null;
	readonly originType?: string | null;
	readonly originId?: string | null;
	readonly originCreatedAt?: string | null;
};

export type CreateActionItemInput = {
	readonly action: ActionCreatePayload;
	readonly actorUserId?: string | null;
	readonly tenantId: string;
};

export type CreateActionFromFindingQueueInput = CreateActionItemInput & {
	readonly findingId: string;
};

export type UpdateActionItemInput = {
	readonly action: ActionUpdatePayload;
	readonly actionItemId: string;
	readonly actorUserId?: string | null;
	readonly tenantId: string;
};

export type SoftDeleteActionItemInput = {
	readonly actionItemId: string;
	readonly tenantId: string;
};

export class ActionMutationValidationError extends Error {
	readonly code = "invalid_action_mutation";

	constructor(message: string) {
		super(message);
		this.name = new.target.name;
	}
}

export async function createActionItem(
	input: CreateActionItemInput,
): Promise<ActionItemDetail> {
	const record = prepareActionItemCreateRecord(input);

	await assertTenantMember(input.tenantId, record.assigneeUserId, "assignee");
	await assertTenantMember(
		input.tenantId,
		record.verifiedByUserId,
		"verifiedByUserId",
	);

	await withTenantConnection(
		input.tenantId,
		(tx) =>
			tx.$executeRaw`
			INSERT INTO action_item (
				id,
				tenant_id,
				title,
				description,
				status,
				due_date,
				assignee_user_id,
				owner_text,
				department_text,
				origin_type,
				origin_id,
				origin_label,
				origin_created_at,
				priority,
				is_safety_critical,
				verification_status,
				verification_note,
				verified_at,
				verified_by_user_id,
				effectiveness_result,
				completed_at
			) VALUES (
				${record.id}::uuid,
				${record.tenantId}::uuid,
				${record.title},
				${record.description},
				${record.status}::action_item_status,
				${dateKey(record.dueDate)}::date,
				${record.assigneeUserId}::uuid,
				${record.ownerText},
				${record.departmentText},
				${record.originType}::action_item_origin_type,
				${record.originId}::uuid,
				${record.originLabel},
				${record.originCreatedAt}::timestamptz,
				${record.priority}::action_item_priority,
				${record.isSafetyCritical},
				${record.verificationStatus}::action_item_verification_status,
				${record.verificationNote},
				${record.verifiedAt}::timestamptz,
				${record.verifiedByUserId}::uuid,
				${record.effectivenessResult}::action_item_effectiveness_result,
				${record.completedAt}::timestamptz
			)
		`,
	);

	const created = await getActionItemDetail(input.tenantId, record.id);
	if (!created) {
		throw new Error("ACTION_ITEM_CREATE_FAILED");
	}

	return created;
}

export async function createActionFromFindingQueue(
	input: CreateActionFromFindingQueueInput,
): Promise<ActionItemDetail> {
	let actionItemId: string | null = null;

	await withTenantConnection(input.tenantId, async (tx) => {
		const rows = await tx.$queryRaw<FindingQueueRow[]>`
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
			WHERE id = ${input.findingId}::uuid
				AND status = 'open'::finding_status
				AND action_item_id IS NULL
			FOR UPDATE
		`;
		const finding = rows[0] ? findingRecordFromQueueRow(rows[0]) : null;

		if (!finding) {
			throw new ActionMutationValidationError(
				"Finding is no longer open for action creation.",
			);
		}

		const sourceAction = prepareFindingActionInput(finding, {
			assigneeUserId: input.action.assigneeUserId,
			dueDate: input.action.dueDate,
			ownerText: input.action.ownerText,
			priority: input.action.priority,
			title: input.action.title,
		});
		const record = prepareActionItemCreateRecord({
			action: {
				assigneeUserId: sourceAction.assigneeUserId,
				departmentText:
					input.action.departmentText ?? sourceAction.departmentText,
				description: input.action.description ?? sourceAction.description,
				dueDate: dateValue(sourceAction.dueDate),
				effectivenessResult: input.action.effectivenessResult,
				isSafetyCritical: input.action.isSafetyCritical,
				originCreatedAt: dateTimeValue(sourceAction.originCreatedAt),
				originId: sourceAction.originId,
				originLabel: sourceAction.originLabel,
				originType: sourceAction.originType,
				ownerText: sourceAction.ownerText,
				priority: sourceAction.priority,
				status: input.action.status,
				title: sourceAction.title,
				verificationNote: input.action.verificationNote,
				verificationStatus: input.action.verificationStatus,
				verifiedAt: input.action.verifiedAt,
				verifiedByUserId: input.action.verifiedByUserId,
			},
			actorUserId: input.actorUserId,
			tenantId: input.tenantId,
		});

		await assertTenantMember(input.tenantId, record.assigneeUserId, "assignee");
		await assertTenantMember(
			input.tenantId,
			record.verifiedByUserId,
			"verifiedByUserId",
		);
		await tx.$executeRaw`
			INSERT INTO action_item (
				id,
				tenant_id,
				title,
				description,
				status,
				due_date,
				assignee_user_id,
				owner_text,
				department_text,
				origin_type,
				origin_id,
				origin_label,
				origin_created_at,
				priority,
				is_safety_critical,
				verification_status,
				verification_note,
				verified_at,
				verified_by_user_id,
				effectiveness_result,
				completed_at
			) VALUES (
				${record.id}::uuid,
				${record.tenantId}::uuid,
				${record.title},
				${record.description},
				${record.status}::action_item_status,
				${dateKey(record.dueDate)}::date,
				${record.assigneeUserId}::uuid,
				${record.ownerText},
				${record.departmentText},
				${record.originType}::action_item_origin_type,
				${record.originId}::uuid,
				${record.originLabel},
				${record.originCreatedAt}::timestamptz,
				${record.priority}::action_item_priority,
				${record.isSafetyCritical},
				${record.verificationStatus}::action_item_verification_status,
				${record.verificationNote},
				${record.verifiedAt}::timestamptz,
				${record.verifiedByUserId}::uuid,
				${record.effectivenessResult}::action_item_effectiveness_result,
				${record.completedAt}::timestamptz
			)
		`;
		await tx.$executeRaw`
			UPDATE finding
			SET
				action_item_id = ${record.id}::uuid,
				status = 'action_created'::finding_status,
				updated_at = CURRENT_TIMESTAMP
			WHERE id = ${finding.id}::uuid
		`;
		actionItemId = record.id;
	});

	const created = actionItemId
		? await getActionItemDetail(input.tenantId, actionItemId)
		: null;
	if (!created) {
		throw new Error("ACTION_ITEM_CREATE_FAILED");
	}

	return created;
}

export async function updateActionItem(
	input: UpdateActionItemInput,
): Promise<ActionItemDetail | null> {
	const current = await getActionItemDetail(input.tenantId, input.actionItemId);

	if (!current) {
		return null;
	}

	const record = prepareActionItemUpdateRecord(input, current);

	await assertTenantMember(input.tenantId, record.assigneeUserId, "assignee");
	await assertTenantMember(
		input.tenantId,
		record.verifiedByUserId,
		"verifiedByUserId",
	);

	await withTenantConnection(
		input.tenantId,
		(tx) =>
			tx.$executeRaw`
			UPDATE action_item
			SET
				description = ${record.description},
				status = ${record.status}::action_item_status,
				due_date = ${dateKey(record.dueDate)}::date,
				assignee_user_id = ${record.assigneeUserId}::uuid,
				owner_text = ${record.ownerText},
				department_text = ${record.departmentText},
				origin_label = ${record.originLabel},
				priority = ${record.priority}::action_item_priority,
				is_safety_critical = ${record.isSafetyCritical},
				verification_status = ${record.verificationStatus}::action_item_verification_status,
				verification_note = ${record.verificationNote},
				verified_at = ${record.verifiedAt}::timestamptz,
				verified_by_user_id = ${record.verifiedByUserId}::uuid,
				effectiveness_result = ${record.effectivenessResult}::action_item_effectiveness_result,
				completed_at = ${record.completedAt}::timestamptz,
				updated_at = CURRENT_TIMESTAMP
			WHERE id = ${input.actionItemId}::uuid
		`,
	);

	return getActionItemDetail(input.tenantId, input.actionItemId);
}

export async function softDeleteActionItem(
	input: SoftDeleteActionItemInput,
): Promise<ActionItemDetail | null> {
	return updateActionItem({
		action: { status: "cancelled" },
		actionItemId: input.actionItemId,
		tenantId: input.tenantId,
	});
}

export function prepareActionItemCreateRecord(
	input: CreateActionItemInput,
): ActionItemRecord {
	const now = new Date();
	const normalized = normalizeClosureDefaults(
		{
			...input.action,
			id: randomUUID(),
			tenantId: input.tenantId,
		},
		input.actorUserId,
		now,
	);

	return wrapActionItemValidation(() =>
		prepareActionItemForStorage({
			...normalized,
			createdAt: now,
			updatedAt: now,
		}),
	);
}

export function prepareActionItemUpdateRecord(
	input: UpdateActionItemInput,
	current: ActionItemDetail,
): ActionItemRecord {
	assertNoImmutableOriginUpdate(input.action, current.originType);

	const now = new Date();
	const nextStatus = input.action.status ?? current.status;
	const base: ActionItemInput = {
		assigneeUserId:
			input.action.assigneeUserId !== undefined
				? input.action.assigneeUserId
				: current.assigneeUserId,
		completedAt: completedAtForStatus(
			nextStatus,
			input.action.status === undefined ? current.completedAt : null,
			now,
		),
		createdAt: current.createdAt,
		departmentText:
			input.action.departmentText !== undefined
				? input.action.departmentText
				: current.departmentText,
		description:
			input.action.description !== undefined
				? input.action.description
				: current.description,
		dueDate:
			input.action.dueDate !== undefined
				? input.action.dueDate
				: current.dueDate,
		effectivenessResult:
			input.action.effectivenessResult ?? current.effectivenessResult,
		id: current.id,
		isSafetyCritical: input.action.isSafetyCritical ?? current.isSafetyCritical,
		originCreatedAt: current.originCreatedAt,
		originId: current.originId,
		originLabel: input.action.originLabel ?? current.originLabel,
		originType: current.originType,
		ownerText:
			input.action.ownerText !== undefined
				? input.action.ownerText
				: current.ownerText,
		priority: input.action.priority ?? current.priority,
		status: nextStatus,
		tenantId: current.tenantId,
		title: current.title,
		updatedAt: now,
		verificationNote:
			input.action.verificationNote !== undefined
				? input.action.verificationNote
				: current.verificationNote,
		verificationStatus:
			input.action.verificationStatus ?? current.verificationStatus,
		verifiedAt:
			input.action.verifiedAt !== undefined
				? input.action.verifiedAt
				: current.verifiedAt,
		verifiedByUserId:
			input.action.verifiedByUserId !== undefined
				? input.action.verifiedByUserId
				: current.verifiedByUserId,
	};

	return wrapActionItemValidation(() =>
		prepareActionItemForStorage(
			normalizeClosureDefaults(base, input.actorUserId, now),
		),
	);
}

export function parseActionCreatePayload(
	body: Map<string, unknown> | Record<string, unknown>,
): ActionCreatePayload | null {
	const get = getter(body);
	const title = stringValue(get("title"));
	const originType = stringValue(get("originType"));

	if (!title || !isActionItemOriginType(originType)) {
		return null;
	}

	const status = enumValue(get("status"), isActionItemStatus);
	const priority = enumValue(get("priority"), isActionItemPriority);
	const verificationStatus = enumValue(
		get("verificationStatus"),
		isActionItemVerificationStatus,
	);
	const effectivenessResult = enumValue(
		get("effectivenessResult"),
		isActionItemEffectivenessResult,
	);

	if (
		status === false ||
		priority === false ||
		verificationStatus === false ||
		effectivenessResult === false
	) {
		return null;
	}

	return {
		assigneeUserId: nullableStringValue(get("assigneeUserId")),
		departmentText: nullableStringValue(get("departmentText")),
		description: nullableStringValue(get("description")),
		dueDate: nullableStringValue(get("dueDate")),
		effectivenessResult,
		isSafetyCritical: booleanValue(get("isSafetyCritical")),
		originContext: originContextValue(get("originContext")),
		originCreatedAt: nullableStringValue(get("originCreatedAt")),
		originId: nullableStringValue(get("originId")),
		originLabel: nullableStringValue(get("originLabel")),
		originType,
		ownerText: nullableStringValue(get("ownerText")),
		priority,
		status,
		title,
		verificationNote: nullableStringValue(get("verificationNote")),
		verificationStatus,
		verifiedAt: nullableStringValue(get("verifiedAt")),
		verifiedByUserId: nullableStringValue(get("verifiedByUserId")),
	};
}

export function parsePublicActionCreatePayload(
	body: Map<string, unknown> | Record<string, unknown>,
): ActionCreatePayload | null {
	const payload = parseActionCreatePayload(body);

	if (!payload || !isUiCreatableActionOriginType(payload.originType)) {
		return null;
	}

	if (
		payload.originId ||
		payload.originCreatedAt ||
		hasOriginContextValue(payload.originContext)
	) {
		return null;
	}

	if (payload.originType !== "manual" && payload.originLabel) {
		return null;
	}

	return {
		...payload,
		originContext: null,
		originCreatedAt: null,
		originId: null,
		originLabel: payload.originType === "manual" ? payload.originLabel : null,
	};
}

export function parseActionUpdatePayload(
	body: Map<string, unknown> | Record<string, unknown>,
): ActionUpdatePayload | null {
	const get = getter(body);
	const has = hasGetter(body);
	const status = enumValue(get("status"), isActionItemStatus);
	const priority = enumValue(get("priority"), isActionItemPriority);
	const verificationStatus = enumValue(
		get("verificationStatus"),
		isActionItemVerificationStatus,
	);
	const effectivenessResult = enumValue(
		get("effectivenessResult"),
		isActionItemEffectivenessResult,
	);

	if (
		status === false ||
		priority === false ||
		verificationStatus === false ||
		effectivenessResult === false
	) {
		return null;
	}

	return {
		...(has("assigneeUserId")
			? { assigneeUserId: nullableStringValue(get("assigneeUserId")) }
			: {}),
		...(has("departmentText")
			? { departmentText: nullableStringValue(get("departmentText")) }
			: {}),
		...(has("description")
			? { description: nullableStringValue(get("description")) }
			: {}),
		...(has("dueDate") ? { dueDate: nullableStringValue(get("dueDate")) } : {}),
		...(effectivenessResult !== undefined ? { effectivenessResult } : {}),
		...(has("isSafetyCritical")
			? { isSafetyCritical: booleanValue(get("isSafetyCritical")) }
			: {}),
		...(has("originCreatedAt")
			? { originCreatedAt: nullableStringValue(get("originCreatedAt")) }
			: {}),
		...(has("originId")
			? { originId: nullableStringValue(get("originId")) }
			: {}),
		...(has("originLabel")
			? { originLabel: nullableStringValue(get("originLabel")) }
			: {}),
		...(has("originType")
			? { originType: nullableStringValue(get("originType")) }
			: {}),
		...(has("ownerText")
			? { ownerText: nullableStringValue(get("ownerText")) }
			: {}),
		...(priority !== undefined ? { priority } : {}),
		...(status !== undefined ? { status } : {}),
		...(has("verificationNote")
			? { verificationNote: nullableStringValue(get("verificationNote")) }
			: {}),
		...(verificationStatus !== undefined ? { verificationStatus } : {}),
		...(has("verifiedAt")
			? { verifiedAt: nullableStringValue(get("verifiedAt")) }
			: {}),
		...(has("verifiedByUserId")
			? { verifiedByUserId: nullableStringValue(get("verifiedByUserId")) }
			: {}),
	};
}

function normalizeClosureDefaults(
	input: ActionItemInput,
	actorUserId: string | null | undefined,
	now: Date,
): ActionItemInput {
	const verificationStatus = input.verificationStatus ?? "not_required";
	const status = input.status ?? "open";
	const verifiedAt =
		verificationStatus === "verified" ? (input.verifiedAt ?? now) : null;
	const verifiedByUserId =
		verificationStatus === "verified"
			? (input.verifiedByUserId ?? actorUserId ?? null)
			: null;

	return {
		...input,
		completedAt: completedAtForStatus(status, input.completedAt, now),
		verificationStatus,
		verifiedAt,
		verifiedByUserId,
	};
}

function completedAtForStatus(
	status: ActionItemStatus | null | undefined,
	current: Date | string | null | undefined,
	now: Date,
): Date | string | null {
	return status === "completed" ? (current ?? now) : null;
}

function assertNoImmutableOriginUpdate(
	payload: ActionUpdatePayload,
	currentOriginType: ActionItemOriginType,
): void {
	if (payload.originType !== undefined) {
		throw new ActionMutationValidationError("origin_type is immutable.");
	}
	if (payload.originId !== undefined) {
		throw new ActionMutationValidationError("origin_id is immutable.");
	}
	if (payload.originCreatedAt !== undefined) {
		throw new ActionMutationValidationError("origin_created_at is immutable.");
	}
	if (payload.originLabel !== undefined && currentOriginType !== "manual") {
		throw new ActionMutationValidationError(
			"origin_label is mutable only for manual actions.",
		);
	}
}

function isUiCreatableActionOriginType(
	value: ActionItemOriginType,
): value is UiCreatableActionOriginType {
	return (UI_CREATABLE_ACTION_ORIGIN_TYPES as readonly string[]).includes(
		value,
	);
}

function hasOriginContextValue(
	context: ActionOriginContext | null | undefined,
): boolean {
	if (!context) {
		return false;
	}

	return Object.values(context).some((value) => value !== null);
}

async function assertTenantMember(
	tenantId: string,
	userId: string | null,
	field: string,
): Promise<void> {
	if (!userId) {
		return;
	}

	const rows = await withSharedConnection(
		(tx) =>
			tx.$queryRaw<Array<{ exists: boolean }>>`
			SELECT EXISTS (
				SELECT 1
				FROM tenant_memberships membership
				WHERE membership.tenant_id = ${tenantId}::uuid
					AND membership.user_id = ${userId}::uuid
			) AS exists
		`,
	);

	if (!rows[0]?.exists) {
		throw new ActionMutationValidationError(
			`${field} must belong to the action tenant.`,
		);
	}
}

function wrapActionItemValidation<T>(work: () => T): T {
	try {
		return work();
	} catch (error) {
		if (error instanceof ActionItemValidationError) {
			throw new ActionMutationValidationError(error.message);
		}
		throw error;
	}
}

function dateKey(value: Date | null): string | null {
	return value?.toISOString().slice(0, 10) ?? null;
}

function dateValue(value: Date | string | null | undefined): string | null {
	if (!value) {
		return null;
	}

	return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function dateTimeValue(value: Date | string | null | undefined): string | null {
	if (!value) {
		return null;
	}

	return value instanceof Date ? value.toISOString() : value;
}

function getter(body: Map<string, unknown> | Record<string, unknown>) {
	return (key: string): unknown =>
		body instanceof Map ? body.get(key) : body[key];
}

function hasGetter(body: Map<string, unknown> | Record<string, unknown>) {
	return (key: string): boolean =>
		body instanceof Map ? body.has(key) : Object.hasOwn(body, key);
}

function enumValue<T extends string>(
	value: unknown,
	guard: (value: unknown) => value is T,
): T | undefined | false {
	const text = stringValue(value);
	if (!text) {
		return undefined;
	}

	return guard(text) ? text : false;
}

function booleanValue(value: unknown): boolean | null {
	if (value === null || value === undefined || value === "") {
		return null;
	}
	if (typeof value === "boolean") {
		return value;
	}
	if (typeof value === "string") {
		if (["1", "true", "on", "yes"].includes(value.toLowerCase())) {
			return true;
		}
		if (["0", "false", "off", "no"].includes(value.toLowerCase())) {
			return false;
		}
	}

	return null;
}

function originContextValue(value: unknown): ActionOriginContext | null {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}

	const source = value as Record<string, unknown>;
	return {
		activity: nullableStringValue(source.activity),
		date: nullableStringValue(source.date),
		location: nullableStringValue(source.location),
		processName: nullableStringValue(source.processName),
		quarter: nullableStringValue(source.quarter),
		sourceLabel: nullableStringValue(source.sourceLabel),
		stepLabel: nullableStringValue(source.stepLabel),
		theme: nullableStringValue(source.theme),
		title: nullableStringValue(source.title),
		topic: nullableStringValue(source.topic),
	};
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function nullableStringValue(value: unknown): string | null {
	const text = stringValue(value);
	return text ? text : null;
}
