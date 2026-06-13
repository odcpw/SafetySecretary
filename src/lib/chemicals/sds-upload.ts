import { randomUUID } from "node:crypto";
import { tenantStorage } from "../storage/tenant";
import type { Storage } from "../storage/types";

const defaultMaxSdsUploadBytes = 25 * 1024 * 1024;
const allowedSdsContentTypes = new Map([
	["application/pdf", "pdf"],
	[
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"docx",
	],
	["text/plain", "txt"],
]);

export type SdsUploadFile = {
	readonly name: string;
	readonly size: number;
	readonly type: string;
	arrayBuffer(): Promise<ArrayBuffer>;
};

export type StoreSdsUploadInput = {
	readonly tenantId: string;
	readonly profileId: string;
	readonly userId: string;
	readonly file: SdsUploadFile;
	readonly env?: NodeJS.ProcessEnv;
	readonly storage?: Storage;
};

export type StoredSdsUpload = {
	readonly body: Buffer;
	readonly contentType: string;
	readonly filename: string;
	readonly sizeBytes: number;
	readonly storagePath: string;
};

export class SdsUploadError extends Error {
	readonly code:
		| "invalid_sds_upload"
		| "unsupported_sds_content_type"
		| "sds_upload_too_large";

	constructor(
		code:
			| "invalid_sds_upload"
			| "unsupported_sds_content_type"
			| "sds_upload_too_large",
		message: string,
	) {
		super(message);
		this.code = code;
		this.name = new.target.name;
	}
}

export async function storeSdsUpload(
	input: StoreSdsUploadInput,
): Promise<StoredSdsUpload> {
	const filename = normalizeFilename(input.file.name);
	const contentType = normalizeContentType(input.file.type);
	const extension = allowedSdsContentTypes.get(contentType);

	if (!extension) {
		throw new SdsUploadError(
			"unsupported_sds_content_type",
			"SDS upload must be a PDF, DOCX, or plain-text fixture.",
		);
	}

	const maxBytes = maxSdsUploadBytes(input.env);
	if (input.file.size > maxBytes) {
		throw new SdsUploadError(
			"sds_upload_too_large",
			"SDS upload exceeds the configured maximum size.",
		);
	}

	const body = Buffer.from(await input.file.arrayBuffer());
	if (body.byteLength === 0) {
		throw new SdsUploadError("invalid_sds_upload", "SDS upload is empty.");
	}

	if (body.byteLength > maxBytes) {
		throw new SdsUploadError(
			"sds_upload_too_large",
			"SDS upload exceeds the configured maximum size.",
		);
	}

	const uploadId = randomUUID();
	const relativeKey = `sds/${input.profileId.toLowerCase()}/${uploadId}.${extension}`;
	const written = await tenantStorage(input.tenantId, {
		env: input.env,
		storage: input.storage,
	}).put(relativeKey, body, {
		contentType,
		customMetadata: {
			chemicalProfileId: input.profileId,
			filename,
			uploadedBy: input.userId,
		},
		sizeBytes: body.byteLength,
	});

	return {
		body,
		contentType,
		filename,
		sizeBytes: written.sizeBytes,
		storagePath: written.key,
	};
}

function normalizeFilename(value: string): string {
	const filename = value.trim().split(/[\\/]/).pop()?.trim();

	if (!filename) {
		throw new SdsUploadError(
			"invalid_sds_upload",
			"SDS upload filename is required.",
		);
	}

	return filename;
}

function normalizeContentType(value: string): string {
	return value.trim().toLowerCase();
}

function maxSdsUploadBytes(env: NodeJS.ProcessEnv = process.env): number {
	const parsed = Number.parseInt(env.SDS_UPLOAD_MAX_BYTES ?? "", 10);

	return Number.isFinite(parsed) && parsed > 0
		? parsed
		: defaultMaxSdsUploadBytes;
}
