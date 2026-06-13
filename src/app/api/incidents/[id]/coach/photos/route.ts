import { type NextRequest, NextResponse } from "next/server";
import {
	CSRF_COOKIE_NAME,
	SESSION_COOKIE_NAME,
} from "../../../../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../../../lib/auth/session";
import {
	type CoachPhotoStorageOptions,
	listCoachPhotos,
	saveCoachPhoto,
} from "../../../../../../lib/incident/coach-photos";

export const runtime = "nodejs";

type CoachPhotosRouteContext = {
	params: Promise<{ id: string }> | { id: string };
};

type UploadedFile = {
	readonly name: string;
	readonly size: number;
	readonly type: string;
	arrayBuffer(): Promise<ArrayBuffer>;
};

const defaultMaxUploadBytes = 25 * 1024 * 1024;
const allowedPhotoContentTypes = new Map([
	["image/png", "png"],
	["image/jpeg", "jpg"],
]);
const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
	request: NextRequest,
	context: CoachPhotosRouteContext,
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);

	if (!isUuid(id)) {
		return NextResponse.json({ code: "INVALID_INCIDENT_ID" }, { status: 400 });
	}

	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	const photos = await listCoachPhotos(session.tenantId, id);

	if (!photos) {
		return NextResponse.json({ code: "INCIDENT_NOT_FOUND" }, { status: 404 });
	}

	return NextResponse.json({ photos });
}

export async function POST(
	request: NextRequest,
	context: CoachPhotosRouteContext,
): Promise<NextResponse> {
	return handleCoachPhotoUpload(request, context);
}

export async function handleCoachPhotoUpload(
	request: NextRequest,
	context: CoachPhotosRouteContext,
	options: CoachPhotoStorageOptions = {},
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);

	if (!isUuid(id)) {
		return NextResponse.json({ code: "INVALID_INCIDENT_ID" }, { status: 400 });
	}

	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	if (!hasValidCsrfToken(request)) {
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

	const extension = allowedPhotoContentTypes.get(file.type);

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

	const photo = await saveCoachPhoto({
		body,
		extension,
		filename: file.name,
		incidentId: id,
		mimeType: file.type,
		storageOptions: options,
		tenantId: session.tenantId,
		userId: session.userId,
	});

	if (!photo) {
		return NextResponse.json({ code: "INCIDENT_NOT_FOUND" }, { status: 404 });
	}

	return NextResponse.json({ photo }, { status: 201 });
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "tenantId" | "userId"> | null> {
	return validateSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
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

function hasValidCsrfToken(request: NextRequest): boolean {
	const csrfCookie = request.cookies.get(CSRF_COOKIE_NAME)?.value;
	const csrfHeader = request.headers.get("x-ssfw-csrf");

	return Boolean(csrfCookie && csrfHeader && csrfCookie === csrfHeader);
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}
