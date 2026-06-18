import { type NextRequest, NextResponse } from "next/server";
import {
	authCookieSecurityContextFromRequest,
	SESSION_COOKIE_NAME,
	setSessionCookie,
} from "../../../../../lib/auth/cookies";
import {
	setCsrfCookie,
	verifyCsrfToken,
} from "../../../../../lib/auth/csrf";
import { redeemInvitationToken } from "../../../../../lib/auth/invitations";
import {
	issueSession,
	SessionTenantMembershipError,
	type ValidatedSession,
	validateSession,
} from "../../../../../lib/auth/session";

export const runtime = "nodejs";

type RedeemRequestBody = {
	token?: unknown;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	if (!verifyCsrfToken(request.headers.get("x-ssfw-csrf"), session.id)) {
		return NextResponse.json({ code: "CSRF_REQUIRED" }, { status: 403 });
	}

	const token = await readToken(request);
	const result = await redeemInvitationToken({
		token,
		userId: session.userId,
	});

	if (!result.ok) {
		return NextResponse.json(
			{ message: result.message, reason: result.reason },
			{ status: statusForRejection(result.reason) },
		);
	}

	let inviteSession: Awaited<ReturnType<typeof issueSession>>;

	try {
		inviteSession = await issueSession(
			result.userId,
			result.tenantId,
			request.headers.get("user-agent"),
		);
	} catch (error) {
		if (error instanceof SessionTenantMembershipError) {
			return NextResponse.json({ code: error.code }, { status: 400 });
		}

		throw error;
	}

	const response = NextResponse.json(
		{
			message: result.message,
			tenantId: result.tenantId,
			userId: result.userId,
		},
		{ status: 200 },
	);
	const cookieSecurity = authCookieSecurityContextFromRequest(request);
	setSessionCookie(response, inviteSession, cookieSecurity);
	setCsrfCookie(response, inviteSession.cookieValue, cookieSecurity);

	return response;
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "id" | "tenantId" | "userId"> | null> {
	return validateSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
}

async function readToken(request: NextRequest): Promise<string> {
	const contentType = request.headers.get("content-type") ?? "";

	if (contentType.includes("application/json")) {
		const body = (await request.json().catch(() => null)) as RedeemRequestBody | null;
		return typeof body?.token === "string" ? body.token : "";
	}

	const formData = await request.formData().catch(() => null);
	const token = formData?.get("token");
	return typeof token === "string" ? token : "";
}

function statusForRejection(
	reason: "invalid" | "expired" | "used" | "mismatch",
): number {
	if (reason === "expired") {
		return 410;
	}

	if (reason === "used") {
		return 409;
	}

	return 400;
}
