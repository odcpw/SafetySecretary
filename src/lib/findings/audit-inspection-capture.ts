import { randomUUID } from "node:crypto";
import type { ActionCreatePayload } from "../actions/mutations";
import { createActionItem } from "../actions/mutations";
import type { ActionItemDetail } from "../actions/queries";
import { withTenantConnection } from "../db";
import { type Storage, type TenantStorage, tenantStorage } from "../storage";
import {
	type FindingOriginSeverity,
	type FindingOriginType,
	FindingOriginValidationError,
	type FindingRecord,
	prepareFindingActionInput,
	prepareFindingForStorage,
} from "./finding-origin";

export const AUDIT_INSPECTION_PHOTO_CONTENT_TYPES = new Map([
	["image/png", "png"],
	["image/jpeg", "jpg"],
]);

export const AUDIT_INSPECTION_RESULTS = [
	"not_checked",
	"checked_ok",
	"non_conformance",
	"positive_observation",
] as const;

export type AuditInspectionCaptureFormData = {
	get(name: string): FormDataEntryValue | null;
};

export type AuditInspectionUploadedFile = {
	readonly name: string;
	readonly size: number;
	readonly type: string;
	arrayBuffer(): Promise<ArrayBuffer>;
};

export type AuditInspectionResult = (typeof AUDIT_INSPECTION_RESULTS)[number];
export type AuditInspectionFindingType = Extract<
	FindingOriginType,
	"audit" | "inspection"
>;

export type AuditInspectionChecklistItemPayload = {
	readonly actionDueDate: string | null;
	readonly actionOwnerText: string | null;
	readonly actionTitle: string | null;
	readonly createAction: boolean;
	readonly description: string | null;
	readonly index: number;
	readonly photo: AuditInspectionUploadedFile | null;
	readonly prompt: string;
	readonly result: AuditInspectionResult;
	readonly severity: FindingOriginSeverity;
	readonly workAsDoneContext: string | null;
};

export type AuditInspectionCapturePayload = {
	readonly checklistTitle: string | null;
	readonly contextText: string | null;
	readonly departmentText: string | null;
	readonly findingType: AuditInspectionFindingType;
	readonly items: readonly AuditInspectionChecklistItemPayload[];
	readonly locationText: string | null;
};

export type AuditInspectionCaptureContext = {
	readonly actorUserId: string;
	readonly tenantId: string;
};

export type AuditInspectionCaptureResultItem = {
	readonly action: Pick<ActionItemDetail, "id" | "status" | "title"> | null;
	readonly finding: FindingRecord;
	readonly itemIndex: number;
};

export type AuditInspectionCaptureResult = {
	readonly findings: readonly AuditInspectionCaptureResultItem[];
};

export type AuditInspectionCaptureDependencies = {
	readonly createAction?: typeof createActionItem;
	readonly deleteAction?: (
		tenantId: string,
		actionItemId: string,
	) => Promise<void>;
	readonly deleteFinding?: (finding: FindingRecord) => Promise<void>;
	readonly env?: NodeJS.ProcessEnv;
	readonly insertFinding?: (finding: FindingRecord) => Promise<FindingRecord>;
	readonly linkFindingAction?: (
		finding: FindingRecord,
		actionItemId: string,
	) => Promise<FindingRecord>;
	readonly storage?: Storage;
};

type StoredAuditInspectionPhoto = {
	readonly relativeKey: string;
	readonly storage: TenantStorage;
	readonly storagePath: string;
};

const defaultMaxUploadBytes = 25 * 1024 * 1024;
const maxChecklistItems = 30;

export class AuditInspectionCaptureValidationError extends Error {
	readonly code: string;
	readonly status: number;

	constructor(
		message: string,
		options: { code?: string; status?: number } = {},
	) {
		super(message);
		this.name = new.target.name;
		this.code = options.code ?? "INVALID_AUDIT_INSPECTION_CAPTURE";
		this.status = options.status ?? 400;
	}
}

export async function captureAuditInspectionFindings(
	formData: AuditInspectionCaptureFormData,
	context: AuditInspectionCaptureContext,
	dependencies: AuditInspectionCaptureDependencies = {},
): Promise<AuditInspectionCaptureResult> {
	const payload = parseAuditInspectionCaptureForm(formData);

	if (!payload) {
		throw new AuditInspectionCaptureValidationError(
			"Audit inspection capture payload is invalid.",
		);
	}

	const insertFinding =
		dependencies.insertFinding ?? insertAuditInspectionFinding;
	const linkFindingAction =
		dependencies.linkFindingAction ?? linkAuditInspectionFindingAction;
	const createAction = dependencies.createAction ?? createActionItem;
	const deleteFinding =
		dependencies.deleteFinding ?? deleteAuditInspectionFinding;
	const deleteAction = dependencies.deleteAction ?? deleteAuditInspectionAction;
	const findings: AuditInspectionCaptureResultItem[] = [];
	const createdActionIds: string[] = [];
	const createdFindings: FindingRecord[] = [];
	const uploadedPhotos: StoredAuditInspectionPhoto[] = [];

	try {
		for (const item of reportableAuditInspectionItems(payload)) {
			const findingId = randomUUID();
			const uploadedPhoto = item.photo
				? await storeAuditInspectionPhoto({
						env: dependencies.env,
						file: item.photo,
						findingId,
						storage: dependencies.storage,
						tenantId: context.tenantId,
					})
				: null;
			if (uploadedPhoto) {
				uploadedPhotos.push(uploadedPhoto);
			}
			const finding = prepareAuditInspectionFindingRecord(
				payload,
				item,
				context,
				{
					findingId,
					photoStoragePath: uploadedPhoto?.storagePath ?? null,
				},
			);
			let savedFinding = await insertFinding(finding);
			createdFindings.push(savedFinding);
			let action: Pick<ActionItemDetail, "id" | "status" | "title"> | null =
				null;

			if (item.createAction) {
				const createdAction = await createAction({
					action: prepareAuditInspectionActionCreatePayload(savedFinding, item),
					actorUserId: context.actorUserId,
					tenantId: context.tenantId,
				});
				createdActionIds.push(createdAction.id);
				savedFinding = await linkFindingAction(savedFinding, createdAction.id);
				createdFindings[createdFindings.length - 1] = savedFinding;
				action = {
					id: createdAction.id,
					status: createdAction.status,
					title: createdAction.title,
				};
			}

			findings.push({ action, finding: savedFinding, itemIndex: item.index });
		}

		return { findings };
	} catch (error) {
		await cleanupAuditInspectionCapture({
			createdActionIds,
			createdFindings,
			deleteAction,
			deleteFinding,
			tenantId: context.tenantId,
			uploadedPhotos,
		});
		throw error;
	}
}

export function parseAuditInspectionCaptureForm(
	formData: AuditInspectionCaptureFormData,
): AuditInspectionCapturePayload | null {
	const findingType = stringValue(formData.get("findingType")) ?? "audit";
	if (!isAuditInspectionFindingType(findingType)) {
		return null;
	}

	const itemCount = integerValue(formData.get("itemCount"));
	if (itemCount === null || itemCount < 1 || itemCount > maxChecklistItems) {
		return null;
	}

	const items: AuditInspectionChecklistItemPayload[] = [];

	for (let index = 0; index < itemCount; index += 1) {
		const prompt = stringValue(formData.get(itemField(index, "prompt")));
		const result =
			stringValue(formData.get(itemField(index, "result"))) ?? "not_checked";
		const severity =
			stringValue(formData.get(itemField(index, "severity"))) ?? "medium";

		if (
			!prompt ||
			!isAuditInspectionResult(result) ||
			!isAuditInspectionSeverity(severity)
		) {
			return null;
		}

		items.push({
			actionDueDate: stringValue(
				formData.get(itemField(index, "actionDueDate")),
			),
			actionOwnerText: stringValue(
				formData.get(itemField(index, "actionOwnerText")),
			),
			actionTitle: stringValue(formData.get(itemField(index, "actionTitle"))),
			createAction: booleanValue(
				formData.get(itemField(index, "createAction")),
			),
			description: stringValue(formData.get(itemField(index, "description"))),
			index,
			photo: uploadedAuditInspectionPhotoFromFormValue(
				formData.get(itemField(index, "photo")),
			),
			prompt,
			result,
			severity,
			workAsDoneContext: stringValue(
				formData.get(itemField(index, "workAsDoneContext")),
			),
		});
	}

	return {
		checklistTitle: stringValue(formData.get("checklistTitle")),
		contextText: stringValue(formData.get("contextText")),
		departmentText: stringValue(formData.get("departmentText")),
		findingType,
		items,
		locationText: stringValue(formData.get("locationText")),
	};
}

export function reportableAuditInspectionItems(
	payload: Pick<AuditInspectionCapturePayload, "items">,
): AuditInspectionChecklistItemPayload[] {
	return payload.items.filter(
		(item) =>
			item.result === "non_conformance" ||
			item.result === "positive_observation",
	);
}

export function prepareAuditInspectionFindingRecord(
	payload: AuditInspectionCapturePayload,
	item: AuditInspectionChecklistItemPayload,
	context: AuditInspectionCaptureContext,
	options: {
		readonly findingId?: string | null;
		readonly photoStoragePath?: string | null;
	} = {},
): FindingRecord {
	return wrapFindingValidation(() =>
		prepareFindingForStorage({
			departmentText: payload.departmentText,
			description: item.description ?? item.prompt,
			findingType: payload.findingType,
			id: options.findingId,
			intent:
				item.result === "positive_observation"
					? "positive_observation"
					: "hazard",
			locationText: payload.locationText,
			photoStoragePath: options.photoStoragePath,
			reportedByUserId: context.actorUserId,
			severity: item.severity,
			tenantId: context.tenantId,
			title: item.description ? deriveTitle(item.description) : item.prompt,
			workAsDoneContext: joinedText([
				item.workAsDoneContext,
				payload.contextText,
				payload.checklistTitle,
			]),
		}),
	);
}

export function prepareAuditInspectionActionCreatePayload(
	finding: FindingRecord,
	item: Pick<
		AuditInspectionChecklistItemPayload,
		"actionDueDate" | "actionOwnerText" | "actionTitle"
	>,
): ActionCreatePayload {
	const action = prepareFindingActionInput(finding, {
		dueDate: item.actionDueDate,
		ownerText: item.actionOwnerText,
		title: item.actionTitle,
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

export async function storeAuditInspectionPhoto(input: {
	readonly env?: NodeJS.ProcessEnv;
	readonly file: AuditInspectionUploadedFile;
	readonly findingId: string;
	readonly storage?: Storage;
	readonly tenantId: string;
}): Promise<StoredAuditInspectionPhoto> {
	const extension = AUDIT_INSPECTION_PHOTO_CONTENT_TYPES.get(input.file.type);

	if (!extension) {
		throw new AuditInspectionCaptureValidationError(
			"Audit inspection photo type is not supported.",
			{ code: "UNSUPPORTED_CONTENT_TYPE", status: 415 },
		);
	}

	const maxUploadBytes = auditInspectionPhotoUploadMaxBytes(input.env);

	if (input.file.size > maxUploadBytes) {
		throw new AuditInspectionCaptureValidationError(
			"Audit inspection photo is too large.",
			{
				code: "UPLOAD_TOO_LARGE",
				status: 413,
			},
		);
	}

	const body = Buffer.from(await input.file.arrayBuffer());

	if (body.byteLength > maxUploadBytes) {
		throw new AuditInspectionCaptureValidationError(
			"Audit inspection photo is too large.",
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
		"audit-inspection",
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

export function auditInspectionPhotoUploadMaxBytes(
	env: NodeJS.ProcessEnv = process.env,
): number {
	const parsed = Number.parseInt(env.STORAGE_UPLOAD_MAX_BYTES ?? "", 10);

	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}

	return defaultMaxUploadBytes;
}

export function uploadedAuditInspectionPhotoFromFormValue(
	value: FormDataEntryValue | null | undefined,
): AuditInspectionUploadedFile | null {
	if (
		typeof value === "object" &&
		value !== null &&
		"arrayBuffer" in value &&
		"name" in value &&
		"size" in value &&
		"type" in value
	) {
		const file = value as AuditInspectionUploadedFile;
		if (file.size === 0 && file.name === "") {
			return null;
		}
		return file;
	}

	return null;
}

async function insertAuditInspectionFinding(
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

async function linkAuditInspectionFindingAction(
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
		throw new Error("AUDIT_INSPECTION_FINDING_LINK_FAILED");
	}

	return {
		...finding,
		actionItemId,
		status: "action_created",
		updatedAt: row.updatedAt,
	};
}

async function deleteAuditInspectionFinding(
	finding: FindingRecord,
): Promise<void> {
	await withTenantConnection(
		finding.tenantId,
		(tx) =>
			tx.$executeRaw`
			DELETE FROM finding
			WHERE id = ${finding.id}::uuid
		`,
	);
}

async function deleteAuditInspectionAction(
	tenantId: string,
	actionItemId: string,
): Promise<void> {
	await withTenantConnection(
		tenantId,
		(tx) =>
			tx.$executeRaw`
			DELETE FROM action_item
			WHERE id = ${actionItemId}::uuid
		`,
	);
}

async function cleanupAuditInspectionCapture(input: {
	readonly createdActionIds: readonly string[];
	readonly createdFindings: readonly FindingRecord[];
	readonly deleteAction: (
		tenantId: string,
		actionItemId: string,
	) => Promise<void>;
	readonly deleteFinding: (finding: FindingRecord) => Promise<void>;
	readonly tenantId: string;
	readonly uploadedPhotos: readonly StoredAuditInspectionPhoto[];
}): Promise<void> {
	for (const finding of [...input.createdFindings].reverse()) {
		await input.deleteFinding(finding).catch(() => undefined);
	}

	for (const actionItemId of [...input.createdActionIds].reverse()) {
		await input
			.deleteAction(input.tenantId, actionItemId)
			.catch(() => undefined);
	}

	for (const photo of [...input.uploadedPhotos].reverse()) {
		await photo.storage.delete(photo.relativeKey).catch(() => undefined);
	}
}

function itemField(index: number, field: string): string {
	return `items.${index}.${field}`;
}

function wrapFindingValidation<T>(work: () => T): T {
	try {
		return work();
	} catch (error) {
		if (error instanceof FindingOriginValidationError) {
			throw new AuditInspectionCaptureValidationError(error.message);
		}
		throw error;
	}
}

function isAuditInspectionFindingType(
	value: string,
): value is AuditInspectionFindingType {
	return value === "audit" || value === "inspection";
}

function isAuditInspectionResult(
	value: string,
): value is AuditInspectionResult {
	return (AUDIT_INSPECTION_RESULTS as readonly string[]).includes(value);
}

function isAuditInspectionSeverity(
	value: string,
): value is FindingOriginSeverity {
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

function integerValue(value: FormDataEntryValue | null): number | null {
	if (typeof value !== "string" || !/^\d+$/.test(value.trim())) {
		return null;
	}

	return Number.parseInt(value, 10);
}

function deriveTitle(description: string): string {
	const normalized = description.replace(/\s+/g, " ").trim();
	const firstLine = normalized.split(/[.!?\n]/)[0]?.trim() || normalized;
	return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
}

function joinedText(
	values: readonly (string | null | undefined)[],
): string | null {
	const text = values
		.filter((value): value is string => Boolean(value))
		.join("\n\n");
	return text.length > 0 ? text : null;
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
