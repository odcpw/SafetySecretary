import { type NextRequest, NextResponse } from "next/server";
import {
	CSRF_COOKIE_NAME,
	SESSION_COOKIE_NAME,
} from "../../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../lib/auth/session";
import {
	AuditInspectionCaptureValidationError,
	captureAuditInspectionFindings,
} from "../../../../lib/findings/audit-inspection-capture";

export const runtime = "nodejs";

type AuditInspectionCaptureFindingResult = Awaited<
	ReturnType<typeof captureAuditInspectionFindings>
>["findings"][number]["finding"];

export async function POST(request: NextRequest): Promise<NextResponse> {
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

	if (!formData) {
		return NextResponse.json(
			{ code: "INVALID_AUDIT_INSPECTION_CAPTURE" },
			{ status: 400 },
		);
	}

	const result = await captureAuditInspectionFindings(formData, {
		actorUserId: session.userId,
		tenantId: session.tenantId,
	}).catch((error: unknown) => {
		if (error instanceof AuditInspectionCaptureValidationError) {
			return error;
		}
		throw error;
	});

	if (result instanceof AuditInspectionCaptureValidationError) {
		return NextResponse.json({ code: result.code }, { status: result.status });
	}

	return NextResponse.json(
		{
			findings: result.findings.map((item) => ({
				action: item.action,
				finding: serializeFinding(item.finding),
				itemIndex: item.itemIndex,
			})),
		},
		{ status: 201 },
	);
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "tenantId" | "userId"> | null> {
	return validateSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
}

function hasValidCsrfToken(request: NextRequest): boolean {
	const csrfCookie = request.cookies.get(CSRF_COOKIE_NAME)?.value;
	const csrfHeader = request.headers.get("x-ssfw-csrf");

	return Boolean(csrfCookie && csrfHeader && csrfCookie === csrfHeader);
}

function isMultipartRequest(request: NextRequest): boolean {
	return (request.headers.get("content-type") ?? "")
		.toLowerCase()
		.includes("multipart/form-data");
}

function serializeFinding(result: AuditInspectionCaptureFindingResult) {
	return {
		...result,
		createdAt: result.createdAt.toISOString(),
		reportedAt: result.reportedAt.toISOString(),
		updatedAt: result.updatedAt.toISOString(),
	};
}
