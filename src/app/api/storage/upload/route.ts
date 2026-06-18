import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { verifyCsrfToken } from "../../../../lib/auth/csrf";
import { type Storage, tenantStorage } from "../../../../lib/storage";
import {
	requireTenantSession,
	type StorageSessionValidator,
	TenantSessionRequiredError,
} from "../../../../lib/storage/auth";

export const runtime = "nodejs";

const defaultMaxUploadBytes = 25 * 1024 * 1024;
const defaultAllowedContentTypes = new Map([
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

export type UploadedAttachmentRecord = {
	readonly attachmentId: string;
	readonly contentType: string;
	readonly filename: string;
	readonly sizeBytes: number;
	readonly storageKey: string;
	readonly uploadedBy: string;
};

export type AttachmentRowWriter = (
	input: UploadedAttachmentRecord,
) => Promise<UploadedAttachmentRecord>;

export type UploadRouteOptions = {
	readonly env?: NodeJS.ProcessEnv;
	readonly sessionValidator?: StorageSessionValidator;
	readonly storage?: Storage;
	readonly writeAttachment?: AttachmentRowWriter;
};

type UploadedFile = {
	readonly name: string;
	readonly size: number;
	readonly type: string;
	arrayBuffer(): Promise<ArrayBuffer>;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
	return handleStorageUpload(request);
}

export async function handleStorageUpload(
	request: Request,
	options: UploadRouteOptions = {},
): Promise<NextResponse> {
	const session = await requireTenantSession(request, {
		sessionValidator: options.sessionValidator,
	}).catch((error: unknown) => {
		if (error instanceof TenantSessionRequiredError) {
			return null;
		}
		throw error;
	});

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	if (!verifyCsrfToken(request.headers.get("x-ssfw-csrf"), session.id)) {
		return NextResponse.json({ code: "CSRF_REQUIRED" }, { status: 403 });
	}

	if (!isMultipartRequest(request)) {
		return NextResponse.json(
			{ code: "UNSUPPORTED_CONTENT_TYPE" },
			{ status: 415 },
		);
	}

	const formData = await request.formData().catch(() => null);
	const file = uploadedFileFromFormValue(formData?.get("file"));

	if (!file) {
		return NextResponse.json({ code: "INVALID_UPLOAD" }, { status: 400 });
	}

	const allowedTypes = allowedContentTypes(options.env);
	const extension = allowedTypes.get(file.type);

	if (!extension) {
		return NextResponse.json(
			{ code: "UNSUPPORTED_CONTENT_TYPE" },
			{ status: 415 },
		);
	}

	const maxUploadBytes = uploadMaxBytes(options.env);

	if (file.size > maxUploadBytes) {
		return NextResponse.json({ code: "UPLOAD_TOO_LARGE" }, { status: 413 });
	}

	const body = Buffer.from(await file.arrayBuffer());

	if (body.byteLength > maxUploadBytes) {
		return NextResponse.json({ code: "UPLOAD_TOO_LARGE" }, { status: 413 });
	}

	const attachmentId = randomUUID();
	const relativeKey = ["attachments", `${attachmentId}.${extension}`].join("/");
	const storage = tenantStorage(session.tenantId, {
		env: options.env,
		storage: options.storage,
	});
	const written = await storage.put(relativeKey, body, {
		contentType: file.type,
		customMetadata: {
			filename: file.name,
			uploadedBy: session.userId,
		},
		sizeBytes: body.byteLength,
	});
	const attachment = await (options.writeAttachment ?? writeAttachmentStub)({
		attachmentId,
		contentType: file.type,
		filename: file.name,
		sizeBytes: written.sizeBytes,
		storageKey: written.key,
		uploadedBy: session.userId,
	});

	return NextResponse.json({ attachment }, { status: 201 });
}

async function writeAttachmentStub(
	input: UploadedAttachmentRecord,
): Promise<UploadedAttachmentRecord> {
	return input;
}

function isMultipartRequest(request: Request): boolean {
	return (request.headers.get("content-type") ?? "")
		.toLowerCase()
		.includes("multipart/form-data");
}

function uploadedFileFromFormValue(
	value: FormDataEntryValue | null | undefined,
) {
	if (
		typeof value === "object" &&
		value !== null &&
		"arrayBuffer" in value &&
		"name" in value &&
		"size" in value &&
		"type" in value
	) {
		return value as UploadedFile;
	}

	return null;
}

function uploadMaxBytes(env: NodeJS.ProcessEnv = process.env): number {
	const parsed = Number.parseInt(env.STORAGE_UPLOAD_MAX_BYTES ?? "", 10);

	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}

	return defaultMaxUploadBytes;
}

function allowedContentTypes(
	env: NodeJS.ProcessEnv = process.env,
): ReadonlyMap<string, string> {
	const configured = env.STORAGE_ALLOWED_CONTENT_TYPES;

	if (!configured) {
		return defaultAllowedContentTypes;
	}

	const allowed = new Map<string, string>();

	for (const contentType of configured.split(",")) {
		const normalized = contentType.trim().toLowerCase();
		const extension = defaultAllowedContentTypes.get(normalized);

		if (extension) {
			allowed.set(normalized, extension);
		}
	}

	return allowed.size > 0 ? allowed : defaultAllowedContentTypes;
}
