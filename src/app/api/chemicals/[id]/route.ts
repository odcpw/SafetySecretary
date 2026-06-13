import { type NextRequest, NextResponse } from "next/server";
import {
	CSRF_COOKIE_NAME,
	SESSION_COOKIE_NAME,
} from "../../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../lib/auth/session";
import { ChemicalProfileValidationError } from "../../../../lib/chemicals/chemical-profile";
import {
	archiveChemicalProfile,
	getChemicalProfileDetail,
	parseChemicalProfilePayload,
	serializeChemicalProfile,
	updateChemicalProfile,
} from "../../../../lib/chemicals/queries";

export const runtime = "nodejs";

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = {
	params: Promise<{ id: string }> | { id: string };
};

export async function GET(
	request: NextRequest,
	context: RouteContext,
): Promise<NextResponse> {
	const session = await resolveSession(request);
	const { id } = await Promise.resolve(context.params);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	if (!isUuid(id)) {
		return NextResponse.json(
			{ code: "INVALID_CHEMICAL_PROFILE_ID" },
			{ status: 400 },
		);
	}

	const profile = await getChemicalProfileDetail(session.tenantId, id);

	if (!profile) {
		return NextResponse.json(
			{ code: "CHEMICAL_PROFILE_NOT_FOUND" },
			{ status: 404 },
		);
	}

	return NextResponse.json({ profile: serializeChemicalProfile(profile) });
}

export async function PATCH(
	request: NextRequest,
	context: RouteContext,
): Promise<NextResponse> {
	const session = await resolveSession(request);
	const { id } = await Promise.resolve(context.params);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	if (!hasValidCsrfToken(request)) {
		return NextResponse.json({ code: "CSRF_REQUIRED" }, { status: 403 });
	}

	if (!isUuid(id)) {
		return NextResponse.json(
			{ code: "INVALID_CHEMICAL_PROFILE_ID" },
			{ status: 400 },
		);
	}

	const body = await readBody(request);
	if (body.has("storagePath")) {
		return NextResponse.json(
			{ code: "INVALID_CHEMICAL_PROFILE_PAYLOAD" },
			{ status: 400 },
		);
	}

	const payload = parseChemicalProfilePayload(body);

	if (!payload) {
		return NextResponse.json(
			{ code: "INVALID_CHEMICAL_PROFILE_PAYLOAD" },
			{ status: 400 },
		);
	}

	const profile = await updateChemicalProfile({
		profile: payload,
		profileId: id,
		tenantId: session.tenantId,
	}).catch((error: unknown) => {
		if (error instanceof ChemicalProfileValidationError) {
			return "invalid-payload" as const;
		}

		throw error;
	});

	if (profile === "invalid-payload") {
		return NextResponse.json(
			{ code: "INVALID_CHEMICAL_PROFILE_PAYLOAD" },
			{ status: 400 },
		);
	}

	if (!profile) {
		return NextResponse.json(
			{ code: "CHEMICAL_PROFILE_NOT_FOUND" },
			{ status: 404 },
		);
	}

	return NextResponse.json({ profile: serializeChemicalProfile(profile) });
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

	if (!hasValidCsrfToken(request)) {
		return NextResponse.json({ code: "CSRF_REQUIRED" }, { status: 403 });
	}

	if (!isUuid(id)) {
		return NextResponse.json(
			{ code: "INVALID_CHEMICAL_PROFILE_ID" },
			{ status: 400 },
		);
	}

	const profile = await archiveChemicalProfile({
		profileId: id,
		tenantId: session.tenantId,
	});

	if (!profile) {
		return NextResponse.json(
			{ code: "CHEMICAL_PROFILE_NOT_FOUND" },
			{ status: 404 },
		);
	}

	return NextResponse.json({ profile: serializeChemicalProfile(profile) });
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "tenantId" | "userId"> | null> {
	return validateSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
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

function hasValidCsrfToken(request: NextRequest): boolean {
	const csrfCookie = request.cookies.get(CSRF_COOKIE_NAME)?.value;
	const csrfHeader = request.headers.get("x-ssfw-csrf");

	return Boolean(csrfCookie && csrfHeader && csrfCookie === csrfHeader);
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}
