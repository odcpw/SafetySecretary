import { randomUUID } from "node:crypto";
import type {
	ActionItemInput,
	ActionItemOriginType,
	ActionItemPriority,
} from "../actions/action-item";
import { buildOriginLabel } from "../actions/origin-contract";

export const FINDING_ORIGIN_TYPES = [
	"safety_walk",
	"audit",
	"inspection",
	"meeting",
	"toolbox_talk",
] as const;

export const FINDING_INTENTS = [
	"hazard",
	"good_catch",
	"positive_observation",
] as const;

export const FINDING_ORIGIN_SEVERITIES = [
	"low",
	"medium",
	"high",
	"critical",
] as const;

export const FINDING_ORIGIN_STATUSES = [
	"open",
	"action_created",
	"resolved",
	"dismissed",
] as const;

export type FindingOriginType = (typeof FINDING_ORIGIN_TYPES)[number];
export type FindingIntent = (typeof FINDING_INTENTS)[number];
export type FindingOriginSeverity = (typeof FINDING_ORIGIN_SEVERITIES)[number];
export type FindingOriginStatus = (typeof FINDING_ORIGIN_STATUSES)[number];

export type FindingInput = {
	readonly actionItemId?: string | null;
	readonly createdAt?: Date | string | null;
	readonly departmentText?: string | null;
	readonly description: string;
	readonly findingType: FindingOriginType;
	readonly id?: string | null;
	readonly intent?: FindingIntent | null;
	readonly locationText?: string | null;
	readonly photoStoragePath?: string | null;
	readonly reportedAt?: Date | string | null;
	readonly reportedByUserId: string;
	readonly severity: FindingOriginSeverity;
	readonly status?: FindingOriginStatus | null;
	readonly tenantId: string;
	readonly title: string;
	readonly updatedAt?: Date | string | null;
	readonly workAsDoneContext?: string | null;
};

export type FindingRecord = {
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

export type FindingActionInput = {
	readonly assigneeUserId?: string | null;
	readonly dueDate?: Date | string | null;
	readonly ownerText?: string | null;
	readonly priority?: ActionItemPriority | null;
	readonly title?: string | null;
};

export class FindingOriginValidationError extends Error {
	readonly code = "invalid_finding_origin";

	constructor(message: string) {
		super(message);
		this.name = new.target.name;
	}
}

export function prepareFindingForStorage(input: FindingInput): FindingRecord {
	if (!isFindingOriginType(input.findingType)) {
		throw new FindingOriginValidationError(
			`Unsupported finding type: ${String(input.findingType)}`,
		);
	}

	const intent = input.intent ?? "hazard";
	if (!isFindingIntent(intent)) {
		throw new FindingOriginValidationError(
			`Unsupported finding intent: ${String(intent)}`,
		);
	}

	if (!isFindingOriginSeverity(input.severity)) {
		throw new FindingOriginValidationError(
			`Unsupported finding severity: ${String(input.severity)}`,
		);
	}

	const status = input.status ?? "open";
	if (!isFindingOriginStatus(status)) {
		throw new FindingOriginValidationError(
			`Unsupported finding status: ${String(status)}`,
		);
	}

	const actionItemId =
		optionalText(input.actionItemId, "actionItemId")?.toLowerCase() ?? null;
	const tenantId = requiredText(input.tenantId, "tenantId").toLowerCase();
	const photoStoragePath = optionalText(
		input.photoStoragePath,
		"photoStoragePath",
	);
	if (status === "action_created" && actionItemId === null) {
		throw new FindingOriginValidationError(
			"action_created findings require actionItemId.",
		);
	}
	if (
		photoStoragePath !== null &&
		!photoStoragePath.startsWith(`tenants/${tenantId}/`)
	) {
		throw new FindingOriginValidationError(
			"photoStoragePath must be scoped under the finding tenant.",
		);
	}

	const createdAt = optionalDate(input.createdAt, "createdAt") ?? new Date();

	return {
		actionItemId,
		createdAt,
		departmentText: optionalText(input.departmentText, "departmentText"),
		description: requiredText(input.description, "description"),
		findingType: input.findingType,
		id: optionalText(input.id, "id")?.toLowerCase() ?? randomUUID(),
		intent,
		locationText: optionalText(input.locationText, "locationText"),
		photoStoragePath,
		reportedAt:
			optionalDate(input.reportedAt, "reportedAt") ??
			optionalDate(input.createdAt, "createdAt") ??
			createdAt,
		reportedByUserId: requiredText(
			input.reportedByUserId,
			"reportedByUserId",
		).toLowerCase(),
		severity: input.severity,
		status,
		tenantId,
		title: requiredText(input.title, "title"),
		updatedAt: optionalDate(input.updatedAt, "updatedAt") ?? createdAt,
		workAsDoneContext: optionalText(
			input.workAsDoneContext,
			"workAsDoneContext",
		),
	};
}

export function actionOriginTypeForFinding(
	findingType: FindingOriginType,
): ActionItemOriginType {
	if (findingType === "audit" || findingType === "inspection") {
		return "audit_inspection";
	}
	return findingType;
}

export function buildFindingOriginLabel(finding: FindingRecord): string {
	return buildOriginLabel(
		actionOriginTypeForFinding(finding.findingType),
		finding.id,
		{
			date: finding.reportedAt,
			location: finding.locationText,
			sourceLabel: finding.title,
			title: finding.title,
		},
	);
}

export function prepareFindingActionInput(
	finding: FindingRecord,
	input: FindingActionInput = {},
): ActionItemInput {
	return {
		assigneeUserId: input.assigneeUserId,
		departmentText: finding.departmentText,
		description: finding.description,
		dueDate: input.dueDate,
		originCreatedAt: finding.reportedAt,
		originId: finding.id,
		originLabel: buildFindingOriginLabel(finding),
		originType: actionOriginTypeForFinding(finding.findingType),
		ownerText: input.ownerText,
		priority: input.priority ?? priorityForFindingSeverity(finding.severity),
		tenantId: finding.tenantId,
		title: input.title ?? finding.title,
	};
}

export function priorityForFindingSeverity(
	severity: FindingOriginSeverity,
): ActionItemPriority {
	if (severity === "critical") {
		return "critical";
	}
	if (severity === "high") {
		return "high";
	}
	if (severity === "medium") {
		return "medium";
	}
	return "low";
}

export function isFindingOriginType(
	value: unknown,
): value is FindingOriginType {
	return (
		typeof value === "string" &&
		(FINDING_ORIGIN_TYPES as readonly string[]).includes(value)
	);
}

export function isFindingIntent(value: unknown): value is FindingIntent {
	return (
		typeof value === "string" &&
		(FINDING_INTENTS as readonly string[]).includes(value)
	);
}

export function isFindingOriginSeverity(
	value: unknown,
): value is FindingOriginSeverity {
	return (
		typeof value === "string" &&
		(FINDING_ORIGIN_SEVERITIES as readonly string[]).includes(value)
	);
}

export function isFindingOriginStatus(
	value: unknown,
): value is FindingOriginStatus {
	return (
		typeof value === "string" &&
		(FINDING_ORIGIN_STATUSES as readonly string[]).includes(value)
	);
}

function requiredText(value: unknown, field: string): string {
	const text = optionalText(value, field);
	if (!text) {
		throw new FindingOriginValidationError(`${field} is required.`);
	}
	return text;
}

function optionalText(value: unknown, field: string): string | null {
	if (value === null || value === undefined) {
		return null;
	}
	if (typeof value !== "string") {
		throw new FindingOriginValidationError(`${field} must be a string.`);
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function optionalDate(value: unknown, field: string): Date | null {
	if (value === null || value === undefined) {
		return null;
	}
	if (value instanceof Date) {
		if (Number.isNaN(value.getTime())) {
			throw new FindingOriginValidationError(`${field} must be a valid date.`);
		}
		return value;
	}
	if (typeof value === "string") {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) {
			throw new FindingOriginValidationError(`${field} must be a valid date.`);
		}
		return date;
	}
	throw new FindingOriginValidationError(
		`${field} must be a Date or ISO string.`,
	);
}
