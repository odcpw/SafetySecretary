import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { readSessionCookie } from "../../../../../../../lib/auth/cookies";
import { verifyCsrfRequest } from "../../../../../../../lib/auth/csrf";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../../../../lib/auth/session";
import { withTenantConnection } from "../../../../../../../lib/db";
import { type Storage, tenantStorage } from "../../../../../../../lib/storage";

export const runtime = "nodejs";

type TimelinePhotoRouteContext = {
	params:
		| Promise<{ id: string; eventId: string }>
		| { id: string; eventId: string };
};

type TimelinePhotoUploadOptions = {
	readonly env?: NodeJS.ProcessEnv;
	readonly storage?: Storage;
};

type UploadedFile = {
	readonly name: string;
	readonly size: number;
	readonly type: string;
	arrayBuffer(): Promise<ArrayBuffer>;
};

type IncidentAttachmentRow = {
	id: string;
	eventId: string;
	storageKey: string;
	filename: string | null;
	mimeType: string | null;
	sizeBytes: bigint | number | null;
	createdAt: Date;
	createdById: string;
};

const defaultMaxUploadBytes = 25 * 1024 * 1024;
const allowedPhotoContentTypes = new Map([
	["image/png", "png"],
	["image/jpeg", "jpg"],
]);
const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
	request: NextRequest,
	context: TimelinePhotoRouteContext,
): Promise<NextResponse> {
	return handleTimelinePhotoUpload(request, context);
}

export async function handleTimelinePhotoUpload(
	request: NextRequest,
	context: TimelinePhotoRouteContext,
	options: TimelinePhotoUploadOptions = {},
): Promise<NextResponse> {
	const { id, eventId } = await Promise.resolve(context.params);

	if (!isUuid(id)) {
		return NextResponse.json({ code: "INVALID_INCIDENT_ID" }, { status: 400 });
	}

	if (!isUuid(eventId)) {
		return NextResponse.json(
			{ code: "INVALID_TIMELINE_EVENT_ID" },
			{ status: 400 },
		);
	}

	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	if (!verifyCsrfRequest(request.headers, session.id)) {
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
		return uploadErrorResponse(request, id, "INVALID_UPLOAD", 400);
	}

	const extension = allowedPhotoContentTypes.get(file.type);

	if (!extension) {
		return uploadErrorResponse(request, id, "UNSUPPORTED_CONTENT_TYPE", 415);
	}

	const maxUploadBytes = uploadMaxBytes(options.env);

	if (file.size > maxUploadBytes) {
		return uploadErrorResponse(request, id, "UPLOAD_TOO_LARGE", 413);
	}

	const body = Buffer.from(await file.arrayBuffer());

	if (body.byteLength > maxUploadBytes) {
		return uploadErrorResponse(request, id, "UPLOAD_TOO_LARGE", 413);
	}

	const eventExists = await timelineEventExists(session.tenantId, id, eventId);

	if (!eventExists) {
		return NextResponse.json(
			{ code: "TIMELINE_EVENT_NOT_FOUND" },
			{ status: 404 },
		);
	}

	const attachmentId = randomUUID();
	const relativeKey = ["attachments", [attachmentId, extension].join(".")].join(
		"/",
	);
	const storage = tenantStorage(session.tenantId, {
		env: options.env,
		storage: options.storage,
	});
	const written = await storage.put(relativeKey, body, {
		contentType: file.type,
		customMetadata: {
			filename: file.name,
			timelineEventId: eventId,
			uploadedBy: session.userId,
		},
		sizeBytes: body.byteLength,
	});
	const attachment = await insertIncidentAttachment(session.tenantId, {
		attachmentId,
		eventId,
		filename: file.name,
		incidentId: id,
		mimeType: file.type,
		sizeBytes: written.sizeBytes,
		storageKey: written.key,
		userId: session.userId,
	});

	if (!attachment) {
		return NextResponse.json(
			{ code: "TIMELINE_EVENT_NOT_FOUND" },
			{ status: 404 },
		);
	}

	if (wantsHtmlRedirect(request)) {
		return NextResponse.redirect(
			new URL(`/incidents/${id}/timeline`, request.url),
			303,
		);
	}

	return NextResponse.json(
		{ attachment: serializeAttachment(attachment) },
		{ status: 201 },
	);
}

async function timelineEventExists(
	tenantId: string,
	incidentId: string,
	eventId: string,
): Promise<boolean> {
	return withTenantConnection(tenantId, async (tx) => {
		const rows = await tx.$queryRaw<Array<{ id: string }>>`
			SELECT id::text AS id
			FROM incident_timeline_event
			WHERE id = ${eventId}::uuid
				AND case_id = ${incidentId}::uuid
			LIMIT 1
		`;

		return Boolean(rows[0]);
	});
}

async function insertIncidentAttachment(
	tenantId: string,
	input: {
		attachmentId: string;
		eventId: string;
		filename: string;
		incidentId: string;
		mimeType: string;
		sizeBytes: number;
		storageKey: string;
		userId: string;
	},
): Promise<IncidentAttachmentRow | null> {
	return withTenantConnection(tenantId, async (tx) => {
		const rows = await tx.$queryRaw<IncidentAttachmentRow[]>`
			INSERT INTO incident_attachment (
				id,
				event_id,
				storage_key,
				filename,
				mime_type,
				size_bytes,
				created_by
			)
			SELECT
				${input.attachmentId}::uuid,
				event.id,
				${input.storageKey},
				${input.filename},
				${input.mimeType},
				${input.sizeBytes}::bigint,
				${input.userId}::uuid
			FROM incident_timeline_event event
			WHERE event.id = ${input.eventId}::uuid
				AND event.case_id = ${input.incidentId}::uuid
			RETURNING
				id::text AS id,
				event_id::text AS "eventId",
				storage_key AS "storageKey",
				filename,
				mime_type AS "mimeType",
				size_bytes AS "sizeBytes",
				created_at AS "createdAt",
				created_by::text AS "createdById"
		`;

		return rows[0] ?? null;
	});
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "id" | "tenantId" | "userId"> | null> {
	return validateSession(readSessionCookie(request.cookies));
}

function uploadMaxBytes(env: NodeJS.ProcessEnv = process.env): number {
	const parsed = Number.parseInt(env.STORAGE_UPLOAD_MAX_BYTES ?? "", 10);

	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}

	return defaultMaxUploadBytes;
}

function isMultipartRequest(request: Request): boolean {
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

function uploadErrorResponse(
	request: NextRequest,
	incidentId: string,
	code: string,
	status: number,
): NextResponse {
	if (wantsHtmlRedirect(request)) {
		const url = new URL(`/incidents/${incidentId}/timeline`, request.url);
		url.searchParams.set("error", code);
		return NextResponse.redirect(url, 303);
	}

	return NextResponse.json({ code }, { status });
}

function serializeAttachment(attachment: IncidentAttachmentRow) {
	return {
		...attachment,
		createdAt: attachment.createdAt.toISOString(),
		sizeBytes:
			attachment.sizeBytes === null ? null : Number(attachment.sizeBytes),
	};
}

function wantsHtmlRedirect(request: NextRequest): boolean {
	const accept = request.headers.get("accept") ?? "";
	const contentType = request.headers.get("content-type") ?? "";

	if (accept.includes("application/json")) {
		return false;
	}

	return (
		accept.includes("text/html") ||
		contentType.includes("application/x-www-form-urlencoded")
	);
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}
