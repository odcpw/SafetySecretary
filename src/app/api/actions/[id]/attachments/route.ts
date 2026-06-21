import { type NextRequest, NextResponse } from "next/server";
import {
	ACTION_ATTACHMENT_ALLOWED_CONTENT_TYPES,
	ActionAttachmentNotFoundError,
	type ActionAttachmentRow,
	ActionAttachmentValidationError,
	actionAttachmentUploadMaxBytes,
	createActionAttachment,
	deleteActionAttachment,
	listActionAttachments,
} from "../../../../../lib/actions/attachments";
import { readSessionCookie } from "../../../../../lib/auth/cookies";
import { verifyCsrfRequest } from "../../../../../lib/auth/csrf";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../../lib/auth/session";

export const runtime = "nodejs";

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = {
	params: Promise<{ id: string }> | { id: string };
};

type UploadedFile = {
	readonly name: string;
	readonly size: number;
	readonly type: string;
	arrayBuffer(): Promise<ArrayBuffer>;
};

export async function POST(
	request: NextRequest,
	context: RouteContext,
): Promise<NextResponse> {
	const session = await resolveSession(request);
	const { id } = await Promise.resolve(context.params);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	if (!verifyCsrfRequest(request.headers, session.id)) {
		return NextResponse.json({ code: "CSRF_REQUIRED" }, { status: 403 });
	}

	if (!isUuid(id)) {
		return NextResponse.json({ code: "INVALID_ACTION_ID" }, { status: 400 });
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
		return NextResponse.json(
			{ code: "INVALID_ACTION_ATTACHMENT" },
			{ status: 400 },
		);
	}

	if (!ACTION_ATTACHMENT_ALLOWED_CONTENT_TYPES.has(file.type)) {
		return NextResponse.json(
			{ code: "UNSUPPORTED_CONTENT_TYPE" },
			{ status: 415 },
		);
	}

	const maxUploadBytes = actionAttachmentUploadMaxBytes();

	if (file.size > maxUploadBytes) {
		return NextResponse.json({ code: "UPLOAD_TOO_LARGE" }, { status: 413 });
	}

	const body = Buffer.from(await file.arrayBuffer());

	if (body.byteLength > maxUploadBytes) {
		return NextResponse.json({ code: "UPLOAD_TOO_LARGE" }, { status: 413 });
	}

	const attachment = await createActionAttachment({
		actionItemId: id,
		body,
		description: stringValue(formData?.get("description")),
		filename: file.name,
		mimeType: file.type,
		tenantId: session.tenantId,
		uploadedByUserId: session.userId,
	}).catch((error: unknown) => {
		if (error instanceof ActionAttachmentValidationError) {
			return "invalid-attachment" as const;
		}
		if (error instanceof ActionAttachmentNotFoundError) {
			return null;
		}
		throw error;
	});

	if (attachment === "invalid-attachment") {
		return NextResponse.json(
			{ code: "INVALID_ACTION_ATTACHMENT" },
			{ status: 400 },
		);
	}

	if (!attachment) {
		return NextResponse.json({ code: "ACTION_NOT_FOUND" }, { status: 404 });
	}

	return NextResponse.json(
		{ attachment: serializeActionAttachment(attachment) },
		{ status: 201 },
	);
}

export async function DELETE(
	request: NextRequest,
	context: RouteContext,
): Promise<NextResponse> {
	const session = await resolveSession(request);
	const { id } = await Promise.resolve(context.params);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	if (!verifyCsrfRequest(request.headers, session.id)) {
		return NextResponse.json({ code: "CSRF_REQUIRED" }, { status: 403 });
	}

	if (!isUuid(id)) {
		return NextResponse.json({ code: "INVALID_ACTION_ID" }, { status: 400 });
	}

	const body = await readBody(request);
	const attachmentId = stringValue(body.get("attachmentId"));

	if (!isUuid(attachmentId)) {
		return NextResponse.json(
			{ code: "INVALID_ACTION_ATTACHMENT" },
			{ status: 400 },
		);
	}

	const current = await listActionAttachments(session.tenantId, id);
	if (!current.some((attachment) => attachment.id === attachmentId)) {
		return NextResponse.json(
			{ code: "ACTION_ATTACHMENT_NOT_FOUND" },
			{ status: 404 },
		);
	}

	const deleted = await deleteActionAttachment(session.tenantId, attachmentId);

	return NextResponse.json({
		attachment: deleted ? serializeActionAttachment(deleted) : null,
	});
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "id" | "tenantId" | "userId"> | null> {
	return validateSession(readSessionCookie(request.cookies));
}

async function readBody(request: NextRequest): Promise<Map<string, unknown>> {
	const contentType = request.headers.get("content-type") ?? "";

	if (contentType.includes("application/json")) {
		const body = (await request.json().catch(() => null)) as Record<
			string,
			unknown
		> | null;
		return new Map(Object.entries(body ?? {}));
	}

	const formData = await request.formData().catch(() => null);
	return new Map(formData?.entries() ?? []);
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}

function isMultipartRequest(request: NextRequest): boolean {
	return (request.headers.get("content-type") ?? "")
		.toLowerCase()
		.includes("multipart/form-data");
}

function uploadedFileFromFormValue(
	value: FormDataEntryValue | null | undefined,
): UploadedFile | null {
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

function stringValue(value: unknown): string | null {
	return typeof value === "string" && value.trim() ? value.trim() : null;
}

function serializeActionAttachment(row: ActionAttachmentRow) {
	return {
		...row,
		uploadedAt: row.uploadedAt.toISOString(),
	};
}
