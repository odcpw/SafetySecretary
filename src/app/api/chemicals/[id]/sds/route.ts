import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../../../../../lib/auth/cookies";
import { verifyCsrfToken } from "../../../../../lib/auth/csrf";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../../lib/auth/session";
import {
	getChemicalProfileDetail,
	serializeChemicalProfile,
} from "../../../../../lib/chemicals/queries";
import {
	extractSdsControls,
	reviewSdsExtractedControl,
	type SdsExtractionDispatch,
	SdsExtractionError,
} from "../../../../../lib/chemicals/sds-extraction";
import {
	SdsUploadError,
	type SdsUploadFile,
	storeSdsUpload,
} from "../../../../../lib/chemicals/sds-upload";
import { prisma } from "../../../../../lib/db";
import { DEFAULT_LOCALE } from "../../../../../lib/i18n/types";
import type { Storage } from "../../../../../lib/storage/types";

export const runtime = "nodejs";

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = {
	params: Promise<{ id: string }> | { id: string };
};

export type ChemicalSdsRouteOptions = {
	readonly env?: NodeJS.ProcessEnv;
	readonly storage?: Storage;
	readonly sessionValidator?: (
		cookieValue: string | null | undefined,
	) => Promise<ValidatedSession | null>;
	readonly dispatchSdsExtraction?: SdsExtractionDispatch;
	readonly now?: Date;
};

export async function POST(
	request: NextRequest,
	context: RouteContext,
): Promise<NextResponse> {
	return handleSdsUploadAndExtraction(request, context);
}

export async function PATCH(
	request: NextRequest,
	context: RouteContext,
): Promise<NextResponse> {
	return handleSdsControlReview(request, context);
}

export async function handleSdsUploadAndExtraction(
	request: Request,
	context: RouteContext,
	options: ChemicalSdsRouteOptions = {},
): Promise<NextResponse> {
	const session = await resolveSession(request, options);
	const { id } = await Promise.resolve(context.params);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	if (!verifyCsrfToken(request.headers.get("x-ssfw-csrf"), session.id)) {
		return NextResponse.json({ code: "CSRF_REQUIRED" }, { status: 403 });
	}

	if (!isUuid(id)) {
		return NextResponse.json(
			{ code: "INVALID_CHEMICAL_PROFILE_ID" },
			{ status: 400 },
		);
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
		return NextResponse.json({ code: "INVALID_SDS_UPLOAD" }, { status: 400 });
	}

	if (!isPlainTextSdsFile(file)) {
		return NextResponse.json(
			{ code: "UNSUPPORTED_SDS_EXTRACTION_SOURCE" },
			{ status: 415 },
		);
	}

	const existingProfile = await getChemicalProfileDetail(session.tenantId, id);
	if (!existingProfile) {
		return NextResponse.json(
			{ code: "chemical_profile_not_found" },
			{ status: 404 },
		);
	}

	try {
		const upload = await storeSdsUpload({
			env: options.env,
			file,
			profileId: id,
			storage: options.storage,
			tenantId: session.tenantId,
			userId: session.userId,
		});
		const profile = await extractSdsControls({
			dispatchOptions: { env: options.env },
			dispatchSdsExtraction: options.dispatchSdsExtraction,
			locale: await loadUserLocale(session.userId),
			profileId: id,
			sdsText: upload.body.toString("utf8"),
			sourceFilename: upload.filename,
			sourceStoragePath: upload.storagePath,
			tenantId: session.tenantId,
			userId: session.userId,
		});

		return NextResponse.json(
			{ profile: serializeChemicalProfile(profile) },
			{ status: 201 },
		);
	} catch (error) {
		return sdsErrorResponse(error);
	}
}

export async function handleSdsControlReview(
	request: Request,
	context: RouteContext,
	options: ChemicalSdsRouteOptions = {},
): Promise<NextResponse> {
	const session = await resolveSession(request, options);
	const { id } = await Promise.resolve(context.params);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	if (!verifyCsrfToken(request.headers.get("x-ssfw-csrf"), session.id)) {
		return NextResponse.json({ code: "CSRF_REQUIRED" }, { status: 403 });
	}

	if (!isUuid(id)) {
		return NextResponse.json(
			{ code: "INVALID_CHEMICAL_PROFILE_ID" },
			{ status: 400 },
		);
	}

	const body = (await request.json().catch(() => null)) as Record<
		string,
		unknown
	> | null;
	const controlId = stringValue(body?.controlId);
	const decision = stringValue(body?.decision);

	if (!isUuid(controlId) || !["approved", "rejected"].includes(decision)) {
		return NextResponse.json(
			{ code: "INVALID_SDS_REVIEW_PAYLOAD" },
			{ status: 400 },
		);
	}

	try {
		const profile = await reviewSdsExtractedControl({
			controlId,
			decision: decision as "approved" | "rejected",
			now: options.now,
			profileId: id,
			tenantId: session.tenantId,
			userId: session.userId,
		});

		return NextResponse.json({ profile: serializeChemicalProfile(profile) });
	} catch (error) {
		return sdsErrorResponse(error);
	}
}

async function resolveSession(
	request: Request,
	options: ChemicalSdsRouteOptions,
): Promise<Pick<ValidatedSession, "id" | "tenantId" | "userId"> | null> {
	const sessionValidator = options.sessionValidator ?? validateSession;
	const session = await sessionValidator(readSessionCookie(request));

	if (!session) {
		return null;
	}

	return {
		id: session.id,
		tenantId: session.tenantId,
		userId: session.userId,
	};
}

async function loadUserLocale(userId: string): Promise<string> {
	const user = await prisma.user.findUnique({
		select: { uiLocale: true },
		where: { id: userId },
	});

	return user?.uiLocale ?? DEFAULT_LOCALE;
}

function sdsErrorResponse(error: unknown): NextResponse {
	if (error instanceof SdsUploadError) {
		const status =
			error.code === "unsupported_sds_content_type"
				? 415
				: error.code === "sds_upload_too_large"
					? 413
					: 400;
		return NextResponse.json({ code: error.code }, { status });
	}

	if (error instanceof SdsExtractionError) {
		const status = error.code.endsWith("_not_found") ? 404 : 400;
		return NextResponse.json({ code: error.code }, { status });
	}

	throw error;
}

function readSessionCookie(request: Request): string | null {
	return (
		parseCookieHeader(request.headers.get("cookie")).get(SESSION_COOKIE_NAME) ??
		null
	);
}

function parseCookieHeader(headerValue: string | null): Map<string, string> {
	const cookies = new Map<string, string>();

	if (!headerValue) {
		return cookies;
	}

	for (const segment of headerValue.split(";")) {
		const [rawName, ...rawValue] = segment.trim().split("=");
		const name = rawName?.trim();

		if (name) {
			cookies.set(name, rawValue.join("=").trim());
		}
	}

	return cookies;
}

function isMultipartRequest(request: Request): boolean {
	return (request.headers.get("content-type") ?? "")
		.toLowerCase()
		.includes("multipart/form-data");
}

function isPlainTextSdsFile(file: SdsUploadFile): boolean {
	return file.type.trim().toLowerCase() === "text/plain";
}

function uploadedFileFromFormValue(
	value: FormDataEntryValue | null | undefined,
): SdsUploadFile | null {
	if (
		typeof value === "object" &&
		value !== null &&
		"arrayBuffer" in value &&
		"name" in value &&
		"size" in value &&
		"type" in value
	) {
		return value as SdsUploadFile;
	}

	return null;
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}
