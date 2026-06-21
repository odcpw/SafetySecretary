import { type NextRequest, NextResponse } from "next/server";
import { appRedirectOrigin } from "../../../../lib/auth/base-url";
import { readSessionCookie } from "../../../../lib/auth/cookies";
import { verifyCsrfRequest } from "../../../../lib/auth/csrf";
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
const deleteRequiresLastMemberCode = "COMPANY_DELETE_REQUIRES_LAST_MEMBER";

export async function DELETE(request: NextRequest): Promise<NextResponse> {
	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	if (!verifyCsrfRequest(request.headers, session.id)) {
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

	const result = await deleteCompanyWorkspace(session.tenantId, session.userId);

	if (result.status === "actor_not_member") {
		return NextResponse.json(
			{ code: "TENANT_MEMBERSHIP_REQUIRED" },
			{ status: 403 },
		);
	}

	if (result.status === "not_last_member") {
		return NextResponse.json(
			{ code: deleteRequiresLastMemberCode },
			{ status: 409 },
		);
	}

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
	userId: string,
): Promise<
	| DeleteCompanyResult
	| { status: "actor_not_member" }
	| { status: "not_last_member" }
> {
	const deleted = await prisma.$transaction(async (tx) => {
		const lockedMemberships = await tx.$queryRaw<{ userId: string }[]>`
			SELECT user_id::text AS "userId"
			FROM shared.tenant_memberships
			WHERE tenant_id = ${tenantId}::uuid
			FOR UPDATE
		`;
		const memberIds = new Set(
			lockedMemberships.map((membership) => membership.userId.toLowerCase()),
		);

		if (!memberIds.has(userId.toLowerCase())) {
			return { status: "actor_not_member" as const };
		}

		if (memberIds.size !== 1) {
			return { status: "not_last_member" as const };
		}

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
			status: "deleted" as const,
		};
	});

	if (deleted.status !== "deleted") {
		return deleted;
	}

	await dropTenantSchema(tenantId);

	return deleted;
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
