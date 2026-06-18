import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../../../../lib/auth/cookies";
import { verifyCsrfToken } from "../../../../lib/auth/csrf";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../lib/auth/session";
import {
	captureSafetyWalkFinding,
	SafetyWalkCaptureValidationError,
} from "../../../../lib/findings/safety-walk-capture";

export const runtime = "nodejs";

type SafetyWalkCaptureFindingResult = Awaited<
	ReturnType<typeof captureSafetyWalkFinding>
>["finding"];

export async function POST(request: NextRequest): Promise<NextResponse> {
	const session = await resolveSession(request);

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

	if (!formData) {
		return NextResponse.json(
			{ code: "INVALID_SAFETY_WALK_CAPTURE" },
			{ status: 400 },
		);
	}

	const result = await captureSafetyWalkFinding(formData, {
		actorUserId: session.userId,
		tenantId: session.tenantId,
	}).catch((error: unknown) => {
		if (error instanceof SafetyWalkCaptureValidationError) {
			return error;
		}
		throw error;
	});

	if (result instanceof SafetyWalkCaptureValidationError) {
		return NextResponse.json({ code: result.code }, { status: result.status });
	}

	return NextResponse.json(
		{
			action: result.action,
			finding: serializeFinding(result.finding),
		},
		{ status: 201 },
	);
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "id" | "tenantId" | "userId"> | null> {
	return validateSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
}

function isMultipartRequest(request: NextRequest): boolean {
	return (request.headers.get("content-type") ?? "")
		.toLowerCase()
		.includes("multipart/form-data");
}

function serializeFinding(result: SafetyWalkCaptureFindingResult) {
	return {
		...result,
		createdAt: result.createdAt.toISOString(),
		reportedAt: result.reportedAt.toISOString(),
		updatedAt: result.updatedAt.toISOString(),
	};
}
