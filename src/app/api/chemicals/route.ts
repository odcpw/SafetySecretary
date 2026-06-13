import { type NextRequest, NextResponse } from "next/server";
import {
	CSRF_COOKIE_NAME,
	SESSION_COOKIE_NAME,
} from "../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../lib/auth/session";
import { ChemicalProfileValidationError } from "../../../lib/chemicals/chemical-profile";
import {
	createChemicalProfile,
	listChemicalProfiles,
	parseChemicalProfilePayload,
	serializeChemicalProfile,
} from "../../../lib/chemicals/queries";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	const profiles = await listChemicalProfiles(session.tenantId, {
		profileStatus: request.nextUrl.searchParams.get("profileStatus"),
		search: request.nextUrl.searchParams.get("search"),
	});

	return NextResponse.json({
		profiles: profiles.map(serializeChemicalProfile),
	});
}

export async function POST(request: NextRequest): Promise<NextResponse> {
	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	if (!hasValidCsrfToken(request)) {
		return NextResponse.json({ code: "CSRF_REQUIRED" }, { status: 403 });
	}

	const payload = parseChemicalProfilePayload(await readBody(request));

	if (!payload) {
		return NextResponse.json(
			{ code: "INVALID_CHEMICAL_PROFILE_PAYLOAD" },
			{ status: 400 },
		);
	}

	const profile = await createChemicalProfile({
		profile: payload,
		tenantId: session.tenantId,
	}).catch((error: unknown) => {
		if (error instanceof ChemicalProfileValidationError) {
			return null;
		}

		throw error;
	});

	if (!profile) {
		return NextResponse.json(
			{ code: "INVALID_CHEMICAL_PROFILE_PAYLOAD" },
			{ status: 400 },
		);
	}

	return NextResponse.json(
		{ profile: serializeChemicalProfile(profile) },
		{ status: 201 },
	);
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
