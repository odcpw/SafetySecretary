import { randomUUID } from "node:crypto";
import { withSharedConnection, withTenantConnection } from "../db/tenancy";
import {
	type Storage,
	type StorageBody,
	tenantPrefix,
	tenantStorage,
} from "../storage";

export const ACTION_ATTACHMENT_ALLOWED_CONTENT_TYPES = new Map([
	["image/png", "png"],
	["image/jpeg", "jpg"],
	["application/pdf", "pdf"],
	[
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"docx",
	],
	["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
	[
		"application/vnd.openxmlformats-officedocument.presentationml.presentation",
		"pptx",
	],
]);

export type ActionAttachmentUploadInput = {
	readonly actionItemId: string;
	readonly body: StorageBody;
	readonly description?: string | null;
	readonly env?: NodeJS.ProcessEnv;
	readonly filename: string;
	readonly mimeType: string;
	readonly storage?: Storage;
	readonly tenantId: string;
	readonly uploadedByUserId: string;
};

export type ActionAttachmentRow = {
	readonly id: string;
	readonly actionItemId: string;
	readonly storagePath: string;
	readonly filename: string;
	readonly mimeType: string;
	readonly uploadedByUserId: string;
	readonly uploadedAt: Date;
	readonly description: string | null;
};

export type SerializedActionAttachmentRow = Omit<
	ActionAttachmentRow,
	"uploadedAt"
> & {
	readonly uploadedAt: string;
};

type ActionAttachmentQueryRow = {
	id: string;
	actionItemId: string;
	storagePath: string;
	filename: string;
	mimeType: string;
	uploadedByUserId: string;
	uploadedAt: Date;
	description: string | null;
};

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const defaultMaxUploadBytes = 25 * 1024 * 1024;

export class ActionAttachmentValidationError extends Error {
	readonly code = "invalid_action_attachment";

	constructor(message: string) {
		super(message);
		this.name = new.target.name;
	}
}

export class ActionAttachmentNotFoundError extends Error {
	readonly code = "action_attachment_not_found";

	constructor(message = "Action attachment was not found for this tenant.") {
		super(message);
		this.name = new.target.name;
	}
}

export async function createActionAttachment(
	input: ActionAttachmentUploadInput,
): Promise<ActionAttachmentRow> {
	const tenantId = normalizeUuid(input.tenantId, "tenantId");
	const actionItemId = normalizeUuid(input.actionItemId, "actionItemId");
	const uploadedByUserId = normalizeUuid(
		input.uploadedByUserId,
		"uploadedByUserId",
	);
	const filename = requiredText(input.filename, "filename");
	const mimeType = normalizeMimeType(input.mimeType);
	const extension = extensionForActionAttachmentMimeType(mimeType);
	const description = optionalText(input.description, "description");
	const body = normalizeStorageBody(input.body);
	const maxUploadBytes = actionAttachmentUploadMaxBytes(input.env);

	if (body.byteLength > maxUploadBytes) {
		throw new ActionAttachmentValidationError(
			"Action attachment is too large.",
		);
	}

	if (!(await userBelongsToTenant(tenantId, uploadedByUserId))) {
		throw new ActionAttachmentNotFoundError(
			"Uploader is not a member of this tenant.",
		);
	}

	const attachmentId = randomUUID();
	const relativeKey = actionAttachmentRelativeKey(attachmentId, extension);
	const storage = tenantStorage(tenantId, {
		env: input.env,
		storage: input.storage,
	});
	let storageWritten = false;

	try {
		const written = await storage.put(relativeKey, body, {
			contentType: mimeType,
			customMetadata: {
				actionItemId,
				filename,
				uploadedBy: uploadedByUserId,
			},
			sizeBytes: body.byteLength,
		});
		storageWritten = true;

		const rows = await withTenantConnection(
			tenantId,
			(tx) =>
				tx.$queryRaw<ActionAttachmentQueryRow[]>`
				INSERT INTO action_attachment (
					id,
					action_item_id,
					storage_path,
					filename,
					mime_type,
					uploaded_by_user_id,
					description
				)
				SELECT
					${attachmentId}::uuid,
					action.id,
					${written.key},
					${filename},
					${mimeType},
					${uploadedByUserId}::uuid,
					${description}
				FROM action_item action
				WHERE action.id = ${actionItemId}::uuid
				RETURNING
					id::text AS id,
					action_item_id::text AS "actionItemId",
					storage_path AS "storagePath",
					filename,
					mime_type AS "mimeType",
					uploaded_by_user_id::text AS "uploadedByUserId",
					uploaded_at AS "uploadedAt",
					description
			`,
		);

		const attachment = rows[0];
		if (!attachment) {
			throw new ActionAttachmentNotFoundError(
				"Action item was not found for this tenant.",
			);
		}

		return attachment;
	} catch (error) {
		if (storageWritten) {
			await storage.delete(relativeKey).catch(() => undefined);
		}
		throw error;
	}
}

async function userBelongsToTenant(
	tenantId: string,
	userId: string,
): Promise<boolean> {
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

	return Boolean(rows[0]?.exists);
}

export async function listActionAttachments(
	tenantId: string,
	actionItemId: string,
): Promise<ActionAttachmentRow[]> {
	const normalizedTenantId = normalizeUuid(tenantId, "tenantId");
	const normalizedActionItemId = normalizeUuid(actionItemId, "actionItemId");

	return withTenantConnection(
		normalizedTenantId,
		(tx) =>
			tx.$queryRaw<ActionAttachmentQueryRow[]>`
			SELECT
				attachment.id::text AS id,
				attachment.action_item_id::text AS "actionItemId",
				attachment.storage_path AS "storagePath",
				attachment.filename,
				attachment.mime_type AS "mimeType",
				attachment.uploaded_by_user_id::text AS "uploadedByUserId",
				attachment.uploaded_at AS "uploadedAt",
				attachment.description
			FROM action_attachment attachment
			WHERE attachment.action_item_id = ${normalizedActionItemId}::uuid
			ORDER BY attachment.uploaded_at ASC, attachment.id ASC
		`,
	);
}

export async function deleteActionAttachment(
	tenantId: string,
	attachmentId: string,
): Promise<ActionAttachmentRow | null> {
	const normalizedTenantId = normalizeUuid(tenantId, "tenantId");
	const normalizedAttachmentId = normalizeUuid(attachmentId, "attachmentId");

	const rows = await withTenantConnection(
		normalizedTenantId,
		(tx) =>
			tx.$queryRaw<ActionAttachmentQueryRow[]>`
			DELETE FROM action_attachment
			WHERE id = ${normalizedAttachmentId}::uuid
			RETURNING
				id::text AS id,
				action_item_id::text AS "actionItemId",
				storage_path AS "storagePath",
				filename,
				mime_type AS "mimeType",
				uploaded_by_user_id::text AS "uploadedByUserId",
				uploaded_at AS "uploadedAt",
				description
		`,
	);

	return rows[0] ?? null;
}

export function serializeActionAttachmentRow(
	row: ActionAttachmentRow,
): SerializedActionAttachmentRow {
	return {
		...row,
		uploadedAt: row.uploadedAt.toISOString(),
	};
}

export function extensionForActionAttachmentMimeType(mimeType: string): string {
	const extension = ACTION_ATTACHMENT_ALLOWED_CONTENT_TYPES.get(
		normalizeMimeType(mimeType),
	);

	if (!extension) {
		throw new ActionAttachmentValidationError(
			`Unsupported action attachment content type: ${mimeType}`,
		);
	}

	return extension;
}

export function actionAttachmentRelativeKey(
	attachmentId: string,
	extension: string,
): string {
	return `attachments/${normalizeUuid(attachmentId, "attachmentId")}.${normalizeExtension(extension)}`;
}

export function actionAttachmentRelativeKeyFromStoragePath(
	tenantId: string,
	storagePath: string,
): string {
	const prefix = `${tenantPrefix(tenantId)}/`;
	if (!storagePath.startsWith(prefix) || storagePath.length <= prefix.length) {
		throw new ActionAttachmentValidationError(
			"Action attachment storagePath must belong to the active tenant.",
		);
	}

	return storagePath.slice(prefix.length);
}

export function actionAttachmentUploadMaxBytes(
	env: NodeJS.ProcessEnv = process.env,
): number {
	const parsed = Number.parseInt(env.STORAGE_UPLOAD_MAX_BYTES ?? "", 10);

	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}

	return defaultMaxUploadBytes;
}

function normalizeStorageBody(body: StorageBody): Buffer {
	if (Buffer.isBuffer(body)) {
		return body;
	}

	if (typeof body === "string") {
		return Buffer.from(body);
	}

	if (body instanceof ArrayBuffer) {
		return Buffer.from(body);
	}

	return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
}

function normalizeMimeType(value: string): string {
	return requiredText(value, "mimeType").toLowerCase();
}

function normalizeExtension(value: string): string {
	const normalized = requiredText(value, "extension")
		.replace(/^\./, "")
		.toLowerCase();

	if (!/^[a-z0-9]+$/.test(normalized)) {
		throw new ActionAttachmentValidationError(
			"Action attachment extension must contain only lowercase letters and digits.",
		);
	}

	return normalized;
}

function normalizeUuid(value: string, field: string): string {
	const normalized = requiredText(value, field).toLowerCase();

	if (!uuidPattern.test(normalized)) {
		throw new ActionAttachmentValidationError(`${field} must be a UUID.`);
	}

	return normalized;
}

function requiredText(value: string, field: string): string {
	if (typeof value !== "string") {
		throw new ActionAttachmentValidationError(`${field} is required.`);
	}

	const trimmed = value.trim();
	if (!trimmed) {
		throw new ActionAttachmentValidationError(`${field} is required.`);
	}

	return trimmed;
}

function optionalText(
	value: string | null | undefined,
	field: string,
): string | null {
	if (value === null || value === undefined) {
		return null;
	}

	const trimmed = value.trim();
	if (!trimmed) {
		throw new ActionAttachmentValidationError(
			`${field} cannot be blank when provided.`,
		);
	}

	return trimmed;
}
