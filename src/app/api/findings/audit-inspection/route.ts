import { type NextRequest, NextResponse } from "next/server";
import { readSessionCookie } from "../../../../lib/auth/cookies";
import { verifyCsrfRequest } from "../../../../lib/auth/csrf";
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
): Promise<Pick<ValidatedSession, "id" | "tenantId" | "userId"> | null> {
	return validateSession(readSessionCookie(request.cookies));
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
