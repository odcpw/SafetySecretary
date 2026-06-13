import { randomUUID } from "node:crypto";
import {
	ACTION_ORIGIN_TYPES,
	type ActionOriginContext,
	type ActionOriginType,
	prepareActionOriginForStorage,
} from "./origin-contract";

export const ACTION_ITEM_STATUSES = [
	"open",
	"in_progress",
	"completed",
	"cancelled",
] as const;

export const ACTION_ITEM_ORIGIN_TYPES = ACTION_ORIGIN_TYPES;

export const ACTION_ITEM_PRIORITIES = [
	"low",
	"medium",
	"high",
	"critical",
] as const;

export const ACTION_ITEM_VERIFICATION_STATUSES = [
	"not_required",
	"needed",
	"verified",
	"needs_follow_up",
] as const;

export const ACTION_ITEM_EFFECTIVENESS_RESULTS = [
	"unknown",
	"effective",
	"needs_follow_up",
] as const;

export type ActionItemStatus = (typeof ACTION_ITEM_STATUSES)[number];
export type ActionItemOriginType = ActionOriginType;
export type ActionItemPriority = (typeof ACTION_ITEM_PRIORITIES)[number];
export type ActionItemVerificationStatus =
	(typeof ACTION_ITEM_VERIFICATION_STATUSES)[number];
export type ActionItemEffectivenessResult =
	(typeof ACTION_ITEM_EFFECTIVENESS_RESULTS)[number];

export type ActionItemInput = {
	readonly id?: string | null;
	readonly tenantId: string;
	readonly title: string;
	readonly description?: string | null;
	readonly status?: ActionItemStatus | null;
	readonly dueDate?: Date | string | null;
	readonly assigneeUserId?: string | null;
	readonly ownerText?: string | null;
	readonly departmentText?: string | null;
	readonly originType: ActionItemOriginType;
	readonly originId?: string | null;
	readonly originLabel?: string | null;
	readonly originCreatedAt?: Date | string | null;
	readonly originContext?: ActionOriginContext | null;
	readonly priority?: ActionItemPriority | null;
	readonly isSafetyCritical?: boolean | null;
	readonly verificationStatus?: ActionItemVerificationStatus | null;
	readonly verificationNote?: string | null;
	readonly verifiedAt?: Date | string | null;
	readonly verifiedByUserId?: string | null;
	readonly effectivenessResult?: ActionItemEffectivenessResult | null;
	readonly assignedAt?: Date | string | null;
	readonly escalatedAt?: Date | string | null;
	readonly notificationSentAt?: Date | string | null;
	readonly completedAt?: Date | string | null;
	readonly createdAt?: Date | string | null;
	readonly updatedAt?: Date | string | null;
};

export type ActionItemRecord = {
	readonly id: string;
	readonly tenantId: string;
	readonly title: string;
	readonly description: string | null;
	readonly status: ActionItemStatus;
	readonly dueDate: Date | null;
	readonly assigneeUserId: string | null;
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
	readonly effectivenessResult: ActionItemEffectivenessResult;
	readonly assignedAt: Date | null;
	readonly escalatedAt: Date | null;
	readonly notificationSentAt: Date | null;
	readonly completedAt: Date | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
};

export class ActionItemValidationError extends Error {
	readonly code = "invalid_action_item";

	constructor(message: string) {
		super(message);
		this.name = new.target.name;
	}
}

export function prepareActionItemForStorage(
	input: ActionItemInput,
): ActionItemRecord {
	const status = input.status ?? "open";
	if (!isActionItemStatus(status)) {
		throw new ActionItemValidationError(
			`Unsupported action item status: ${String(status)}`,
		);
	}

	const originType = input.originType;
	if (!isActionItemOriginType(originType)) {
		throw new ActionItemValidationError(
			`Unsupported action item origin type: ${String(originType)}`,
		);
	}

	const priority = input.priority ?? "medium";
	if (!isActionItemPriority(priority)) {
		throw new ActionItemValidationError(
			`Unsupported action item priority: ${String(priority)}`,
		);
	}

	const verificationStatus = input.verificationStatus ?? "not_required";
	if (!isActionItemVerificationStatus(verificationStatus)) {
		throw new ActionItemValidationError(
			`Unsupported action item verification status: ${String(
				verificationStatus,
			)}`,
		);
	}

	const effectivenessResult = input.effectivenessResult ?? "unknown";
	if (!isActionItemEffectivenessResult(effectivenessResult)) {
		throw new ActionItemValidationError(
			`Unsupported action item effectiveness result: ${String(
				effectivenessResult,
			)}`,
		);
	}

	const createdAt = optionalDate(input.createdAt, "createdAt") ?? new Date();
	const origin = prepareActionOriginForStorage({
		createdAt,
		originContext: input.originContext,
		originCreatedAt: input.originCreatedAt,
		originId: input.originId,
		originLabel: input.originLabel,
		originType,
		title: input.title,
	});

	const record: ActionItemRecord = {
		assignedAt: optionalDate(input.assignedAt, "assignedAt"),
		assigneeUserId:
			optionalText(input.assigneeUserId, "assigneeUserId")?.toLowerCase() ??
			null,
		completedAt: optionalDate(input.completedAt, "completedAt"),
		createdAt,
		departmentText: optionalText(input.departmentText, "departmentText"),
		description: optionalText(input.description, "description"),
		dueDate: optionalDate(input.dueDate, "dueDate"),
		effectivenessResult,
		escalatedAt: optionalDate(input.escalatedAt, "escalatedAt"),
		id: optionalText(input.id, "id")?.toLowerCase() ?? randomUUID(),
		isSafetyCritical: input.isSafetyCritical ?? false,
		notificationSentAt: optionalDate(
			input.notificationSentAt,
			"notificationSentAt",
		),
		originCreatedAt: origin.originCreatedAt,
		originId: origin.originId,
		originLabel: origin.originLabel,
		originType: origin.originType,
		ownerText: optionalText(input.ownerText, "ownerText"),
		priority,
		status,
		tenantId: requiredText(input.tenantId, "tenantId").toLowerCase(),
		title: requiredText(input.title, "title"),
		updatedAt: optionalDate(input.updatedAt, "updatedAt") ?? createdAt,
		verificationNote: optionalText(input.verificationNote, "verificationNote"),
		verificationStatus,
		verifiedAt: optionalDate(input.verifiedAt, "verifiedAt"),
		verifiedByUserId:
			optionalText(input.verifiedByUserId, "verifiedByUserId")?.toLowerCase() ??
			null,
	};

	assertCompletionTimestamp(record);
	assertVerificationPair(record);
	assertSafetyCriticalCompletion(record);

	return record;
}

export function isActionItemStatus(value: unknown): value is ActionItemStatus {
	return (
		typeof value === "string" &&
		(ACTION_ITEM_STATUSES as readonly string[]).includes(value)
	);
}

export function isActionItemOriginType(
	value: unknown,
): value is ActionItemOriginType {
	return (
		typeof value === "string" &&
		(ACTION_ITEM_ORIGIN_TYPES as readonly string[]).includes(value)
	);
}

export function isActionItemPriority(
	value: unknown,
): value is ActionItemPriority {
	return (
		typeof value === "string" &&
		(ACTION_ITEM_PRIORITIES as readonly string[]).includes(value)
	);
}

export function isActionItemVerificationStatus(
	value: unknown,
): value is ActionItemVerificationStatus {
	return (
		typeof value === "string" &&
		(ACTION_ITEM_VERIFICATION_STATUSES as readonly string[]).includes(value)
	);
}

export function isActionItemEffectivenessResult(
	value: unknown,
): value is ActionItemEffectivenessResult {
	return (
		typeof value === "string" &&
		(ACTION_ITEM_EFFECTIVENESS_RESULTS as readonly string[]).includes(value)
	);
}

function assertCompletionTimestamp(record: ActionItemRecord): void {
	if (record.status === "completed" && record.completedAt === null) {
		throw new ActionItemValidationError(
			"Completed action items require completedAt.",
		);
	}

	if (record.status !== "completed" && record.completedAt !== null) {
		throw new ActionItemValidationError(
			"Only completed action items may carry completedAt.",
		);
	}
}

function assertVerificationPair(record: ActionItemRecord): void {
	const hasVerifier = record.verifiedByUserId !== null;
	const hasVerifiedAt = record.verifiedAt !== null;

	if (
		record.verificationStatus === "verified" &&
		(!hasVerifier || !hasVerifiedAt)
	) {
		throw new ActionItemValidationError(
			"Verified action items require verifiedByUserId and verifiedAt.",
		);
	}

	if (
		record.verificationStatus !== "verified" &&
		(hasVerifier || hasVerifiedAt)
	) {
		throw new ActionItemValidationError(
			"Only verified action items may carry verifiedByUserId or verifiedAt.",
		);
	}
}

function assertSafetyCriticalCompletion(record: ActionItemRecord): void {
	if (!record.isSafetyCritical || record.status !== "completed") {
		return;
	}

	if (
		record.verificationStatus === "verified" &&
		record.verificationNote !== null &&
		record.verifiedAt !== null &&
		record.verifiedByUserId !== null
	) {
		return;
	}

	if (
		record.verificationStatus === "not_required" &&
		record.verificationNote !== null
	) {
		return;
	}

	throw new ActionItemValidationError(
		"Completed safety-critical action items require verified evidence or a not-required rationale.",
	);
}

function requiredText(value: unknown, label: string): string {
	if (typeof value !== "string" || value.trim() === "") {
		throw new ActionItemValidationError(`${label} must not be blank.`);
	}

	return value.trim();
}

function optionalText(value: unknown, label: string): string | null {
	if (value === null || value === undefined) {
		return null;
	}

	if (typeof value !== "string") {
		throw new ActionItemValidationError(`${label} must be a string.`);
	}

	const trimmed = value.trim();
	if (trimmed === "") {
		throw new ActionItemValidationError(`${label} must not be blank.`);
	}

	return trimmed;
}

function optionalDate(value: unknown, label: string): Date | null {
	if (value === null || value === undefined) {
		return null;
	}

	const date = value instanceof Date ? value : new Date(String(value));
	if (Number.isNaN(date.getTime())) {
		throw new ActionItemValidationError(`${label} must be a valid date.`);
	}

	return date;
}
