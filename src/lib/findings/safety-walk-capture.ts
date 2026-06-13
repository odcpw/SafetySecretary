import { randomUUID } from "node:crypto";
import type { ActionCreatePayload } from "../actions/mutations";
import { createActionItem } from "../actions/mutations";
import type { ActionItemDetail } from "../actions/queries";
import { withTenantConnection } from "../db";
import { type Storage, type TenantStorage, tenantStorage } from "../storage";
import {
	type FindingOriginSeverity,
	FindingOriginValidationError,
	type FindingRecord,
	prepareFindingActionInput,
	prepareFindingForStorage,
} from "./finding-origin";

export const SAFETY_WALK_PHOTO_CONTENT_TYPES = new Map([
	["image/png", "png"],
	["image/jpeg", "jpg"],
]);

export type SafetyWalkCaptureFormData = {
	get(name: string): FormDataEntryValue | null;
};

export type SafetyWalkUploadedFile = {
	readonly name: string;
	readonly size: number;
	readonly type: string;
	arrayBuffer(): Promise<ArrayBuffer>;
};

export type SafetyWalkCapturePayload = {
	readonly actionDueDate: string | null;
	readonly actionOwnerText: string | null;
	readonly actionTitle: string | null;
	readonly createAction: boolean;
	readonly departmentText: string | null;
	readonly description: string;
	readonly goodCatch: boolean;
	readonly locationText: string | null;
	readonly photo: SafetyWalkUploadedFile | null;
	readonly severity: FindingOriginSeverity;
	readonly title: string;
	readonly workAsDoneContext: string | null;
};

export type SafetyWalkCaptureContext = {
	readonly actorUserId: string;
	readonly tenantId: string;
};

export type SafetyWalkCaptureResult = {
	readonly action: Pick<ActionItemDetail, "id" | "status" | "title"> | null;
	readonly finding: FindingRecord;
};

export type SafetyWalkCaptureDependencies = {
	readonly createAction?: typeof createActionItem;
	readonly env?: NodeJS.ProcessEnv;
	readonly insertFinding?: (finding: FindingRecord) => Promise<FindingRecord>;
	readonly linkFindingAction?: (
		finding: FindingRecord,
		actionItemId: string,
	) => Promise<FindingRecord>;
	readonly storage?: Storage;
};

type StoredSafetyWalkPhoto = {
	readonly relativeKey: string;
	readonly storage: TenantStorage;
	readonly storagePath: string;
};

const defaultMaxUploadBytes = 25 * 1024 * 1024;

export class SafetyWalkCaptureValidationError extends Error {
	readonly code: string;
	readonly status: number;

	constructor(
		message: string,
		options: { code?: string; status?: number } = {},
	) {
		super(message);
		this.name = new.target.name;
		this.code = options.code ?? "INVALID_SAFETY_WALK_CAPTURE";
		this.status = options.status ?? 400;
	}
}

export async function captureSafetyWalkFinding(
	formData: SafetyWalkCaptureFormData,
	context: SafetyWalkCaptureContext,
	dependencies: SafetyWalkCaptureDependencies = {},
): Promise<SafetyWalkCaptureResult> {
	const payload = parseSafetyWalkCaptureForm(formData);

	if (!payload) {
		throw new SafetyWalkCaptureValidationError(
			"Safety walk capture payload is invalid.",
		);
	}

	const findingId = randomUUID();
	const uploadedPhoto = payload.photo
		? await storeSafetyWalkPhoto({
				env: dependencies.env,
				file: payload.photo,
				findingId,
				storage: dependencies.storage,
				tenantId: context.tenantId,
			})
		: null;
	const finding = prepareSafetyWalkFindingRecord(payload, context, {
		findingId,
		photoStoragePath: uploadedPhoto?.storagePath ?? null,
	});
	const insertFinding = dependencies.insertFinding ?? insertSafetyWalkFinding;
	const linkFindingAction =
		dependencies.linkFindingAction ?? linkSafetyWalkFindingAction;
	const createAction = dependencies.createAction ?? createActionItem;
	let inserted = false;

	try {
		let savedFinding = await insertFinding(finding);
		inserted = true;
		let action: Pick<ActionItemDetail, "id" | "status" | "title"> | null = null;

		if (payload.createAction) {
			const createdAction = await createAction({
				action: prepareSafetyWalkActionCreatePayload(savedFinding, payload),
				actorUserId: context.actorUserId,
				tenantId: context.tenantId,
			});
			savedFinding = await linkFindingAction(savedFinding, createdAction.id);
			action = {
				id: createdAction.id,
				status: createdAction.status,
				title: createdAction.title,
			};
		}

		return { action, finding: savedFinding };
	} catch (error) {
		if (uploadedPhoto && !inserted) {
			await uploadedPhoto.storage
				.delete(uploadedPhoto.relativeKey)
				.catch(() => undefined);
		}
		throw error;
	}
}

export function parseSafetyWalkCaptureForm(
	formData: SafetyWalkCaptureFormData,
): SafetyWalkCapturePayload | null {
	const description = stringValue(formData.get("description"));
	if (!description) {
		return null;
	}

	const severity = stringValue(formData.get("severity")) ?? "medium";
	if (!isSafetyWalkSeverity(severity)) {
		return null;
	}

	return {
		actionDueDate: stringValue(formData.get("actionDueDate")),
		actionOwnerText: stringValue(formData.get("actionOwnerText")),
		actionTitle: stringValue(formData.get("actionTitle")),
		createAction: booleanValue(formData.get("createAction")),
		departmentText: stringValue(formData.get("departmentText")),
		description,
		goodCatch: booleanValue(formData.get("goodCatch")),
		locationText: stringValue(formData.get("locationText")),
		photo: uploadedSafetyWalkPhotoFromFormValue(formData.get("photo")),
		severity,
		title: stringValue(formData.get("title")) ?? deriveTitle(description),
		workAsDoneContext: stringValue(formData.get("workAsDoneContext")),
	};
}

export function prepareSafetyWalkFindingRecord(
	payload: SafetyWalkCapturePayload,
	context: SafetyWalkCaptureContext,
	options: {
		readonly findingId?: string | null;
		readonly photoStoragePath?: string | null;
	} = {},
): FindingRecord {
	return wrapFindingValidation(() =>
		prepareFindingForStorage({
			departmentText: payload.departmentText,
			description: payload.description,
			findingType: "safety_walk",
			id: options.findingId,
			intent: payload.goodCatch ? "good_catch" : "hazard",
			locationText: payload.locationText,
			photoStoragePath: options.photoStoragePath,
			reportedByUserId: context.actorUserId,
			severity: payload.severity,
			tenantId: context.tenantId,
			title: payload.title,
			workAsDoneContext: payload.workAsDoneContext,
		}),
	);
}

export function prepareSafetyWalkActionCreatePayload(
	finding: FindingRecord,
	payload: Pick<
		SafetyWalkCapturePayload,
		"actionDueDate" | "actionOwnerText" | "actionTitle"
	>,
): ActionCreatePayload {
	const action = prepareFindingActionInput(finding, {
		dueDate: payload.actionDueDate,
		ownerText: payload.actionOwnerText,
		title: payload.actionTitle,
	});

	return {
		departmentText: action.departmentText,
		description: action.description,
		dueDate: dateString(action.dueDate),
		originCreatedAt: dateTimeString(action.originCreatedAt),
		originId: action.originId,
		originLabel: action.originLabel,
		originType: action.originType,
		ownerText: action.ownerText,
		priority: action.priority,
		title: action.title,
	};
}

export async function storeSafetyWalkPhoto(input: {
	readonly env?: NodeJS.ProcessEnv;
	readonly file: SafetyWalkUploadedFile;
	readonly findingId: string;
	readonly storage?: Storage;
	readonly tenantId: string;
}): Promise<StoredSafetyWalkPhoto> {
	const extension = SAFETY_WALK_PHOTO_CONTENT_TYPES.get(input.file.type);

	if (!extension) {
		throw new SafetyWalkCaptureValidationError(
			"Safety walk photo type is not supported.",
			{ code: "UNSUPPORTED_CONTENT_TYPE", status: 415 },
		);
	}

	const maxUploadBytes = safetyWalkPhotoUploadMaxBytes(input.env);

	if (input.file.size > maxUploadBytes) {
		throw new SafetyWalkCaptureValidationError(
			"Safety walk photo is too large.",
			{
				code: "UPLOAD_TOO_LARGE",
				status: 413,
			},
		);
	}

	const body = Buffer.from(await input.file.arrayBuffer());

	if (body.byteLength > maxUploadBytes) {
		throw new SafetyWalkCaptureValidationError(
			"Safety walk photo is too large.",
			{
				code: "UPLOAD_TOO_LARGE",
				status: 413,
			},
		);
	}

	const storage = tenantStorage(input.tenantId, {
		env: input.env,
		storage: input.storage,
	});
	const photoId = randomUUID();
	const relativeKey = [
		"findings",
		"safety-walk",
		input.findingId,
		`${photoId}.${extension}`,
	].join("/");
	const written = await storage.put(relativeKey, body, {
		contentType: input.file.type,
		customMetadata: {
			filename: input.file.name,
			findingId: input.findingId,
		},
		sizeBytes: body.byteLength,
	});

	return {
		relativeKey,
		storage,
		storagePath: written.key,
	};
}

export function safetyWalkPhotoUploadMaxBytes(
	env: NodeJS.ProcessEnv = process.env,
): number {
	const parsed = Number.parseInt(env.STORAGE_UPLOAD_MAX_BYTES ?? "", 10);

	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}

	return defaultMaxUploadBytes;
}

export function uploadedSafetyWalkPhotoFromFormValue(
	value: FormDataEntryValue | null | undefined,
): SafetyWalkUploadedFile | null {
	if (
		typeof value === "object" &&
		value !== null &&
		"arrayBuffer" in value &&
		"name" in value &&
		"size" in value &&
		"type" in value
	) {
		const file = value as SafetyWalkUploadedFile;
		if (file.size === 0 && file.name === "") {
			return null;
		}
		return file;
	}

	return null;
}

async function insertSafetyWalkFinding(
	finding: FindingRecord,
): Promise<FindingRecord> {
	await withTenantConnection(
		finding.tenantId,
		(tx) =>
			tx.$executeRaw`
			INSERT INTO finding (
				id,
				tenant_id,
				finding_type,
				intent,
				title,
				description,
				severity,
				department_text,
				location_text,
				work_as_done_context,
				reported_by_user_id,
				reported_at,
				status,
				photo_storage_path,
				action_item_id,
				created_at,
				updated_at
			) VALUES (
				${finding.id}::uuid,
				${finding.tenantId}::uuid,
				${finding.findingType}::finding_type,
				${finding.intent}::finding_intent,
				${finding.title},
				${finding.description},
				${finding.severity}::finding_severity,
				${finding.departmentText},
				${finding.locationText},
				${finding.workAsDoneContext},
				${finding.reportedByUserId}::uuid,
				${finding.reportedAt}::timestamptz,
				${finding.status}::finding_status,
				${finding.photoStoragePath},
				${finding.actionItemId}::uuid,
				${finding.createdAt}::timestamptz,
				${finding.updatedAt}::timestamptz
			)
		`,
	);

	return finding;
}

async function linkSafetyWalkFindingAction(
	finding: FindingRecord,
	actionItemId: string,
): Promise<FindingRecord> {
	const rows = await withTenantConnection(
		finding.tenantId,
		(tx) =>
			tx.$queryRaw<Array<{ updatedAt: Date }>>`
			UPDATE finding
			SET
				action_item_id = ${actionItemId}::uuid,
				status = 'action_created'::finding_status,
				updated_at = CURRENT_TIMESTAMP
			WHERE id = ${finding.id}::uuid
			RETURNING updated_at AS "updatedAt"
		`,
	);
	const row = rows[0];

	if (!row) {
		throw new Error("SAFETY_WALK_FINDING_LINK_FAILED");
	}

	return {
		...finding,
		actionItemId,
		status: "action_created",
		updatedAt: row.updatedAt,
	};
}

function wrapFindingValidation<T>(work: () => T): T {
	try {
		return work();
	} catch (error) {
		if (error instanceof FindingOriginValidationError) {
			throw new SafetyWalkCaptureValidationError(error.message);
		}
		throw error;
	}
}

function isSafetyWalkSeverity(value: string): value is FindingOriginSeverity {
	return ["low", "medium", "high", "critical"].includes(value);
}

function booleanValue(value: FormDataEntryValue | null): boolean {
	return typeof value === "string"
		? ["1", "true", "on", "yes"].includes(value.toLowerCase())
		: false;
}

function stringValue(value: FormDataEntryValue | null): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function deriveTitle(description: string): string {
	const normalized = description.replace(/\s+/g, " ").trim();
	const firstLine = normalized.split(/[.!?\n]/)[0]?.trim() || normalized;
	return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
}

function dateString(value: Date | string | null | undefined): string | null {
	if (!value) {
		return null;
	}
	return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function dateTimeString(
	value: Date | string | null | undefined,
): string | null {
	if (!value) {
		return null;
	}
	return value instanceof Date ? value.toISOString() : value;
}
