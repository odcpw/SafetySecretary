import { type NextRequest, NextResponse } from "next/server";
import { appRedirectOrigin } from "../../../../lib/auth/base-url";
import { SESSION_COOKIE_NAME } from "../../../../lib/auth/cookies";
import { verifyCsrfToken } from "../../../../lib/auth/csrf";
import { hasActiveTenantMembership } from "../../../../lib/auth/membership";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../lib/auth/session";
import { dropTenantSchema, prisma } from "../../../../lib/db";

export const runtime = "nodejs";

type DeleteCompanyResult = {
	deletedMemberships: number;
	deletedSessions: number;
	deletedTenants: number;
	status: "deleted";
};

const confirmationValue = "DELETE";

export async function DELETE(request: NextRequest): Promise<NextResponse> {
	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	if (!verifyCsrfToken(request.headers.get("x-ssfw-csrf"), session.id)) {
		return NextResponse.json({ code: "CSRF_REQUIRED" }, { status: 403 });
	}

	if (!(await hasActiveTenantMembership(session.tenantId, session.userId))) {
		return NextResponse.json(
			{ code: "TENANT_MEMBERSHIP_REQUIRED" },
			{ status: 403 },
		);
	}

	const body = await readBody(request);
	const confirmation = stringValue(body.get("confirmation"));

	if (confirmation !== confirmationValue) {
		return NextResponse.json(
			{ code: "CONFIRMATION_REQUIRED" },
			{ status: 400 },
		);
	}

	const result = await deleteCompanyWorkspace(session.tenantId);

	return NextResponse.json(result);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
	const response = await DELETE(request);

	if (wantsHtmlRedirect(request) && response.ok) {
		return NextResponse.redirect(
			new URL("/signin", appRedirectOrigin(request.nextUrl.origin)),
			303,
		);
	}

	return response;
}

async function deleteCompanyWorkspace(
	tenantId: string,
): Promise<DeleteCompanyResult> {
	const deleted = await prisma.$transaction(async (tx) => {
		await dropTenantSchema(tenantId, tx);

		const deletedSessions = await tx.session.deleteMany({
			where: { tenantId },
		});
		const deletedMemberships = await tx.tenantMembership.deleteMany({
			where: { tenantId },
		});
		const deletedTenants = await tx.tenant.deleteMany({
			where: { id: tenantId },
		});

		return {
			deletedMemberships: deletedMemberships.count,
			deletedSessions: deletedSessions.count,
			deletedTenants: deletedTenants.count,
		};
	});

	return { ...deleted, status: "deleted" };
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "id" | "tenantId" | "userId"> | null> {
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

function wantsHtmlRedirect(request: NextRequest): boolean {
	const accept = request.headers.get("accept") ?? "";
	const contentType = request.headers.get("content-type") ?? "";

	return (
		accept.includes("text/html") ||
		contentType.includes("form-urlencoded") ||
		contentType.includes("multipart/form-data")
	);
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}
