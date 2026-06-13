import { type NextRequest, NextResponse } from "next/server";
import {
	CSRF_COOKIE_NAME,
	SESSION_COOKIE_NAME,
} from "../../../../lib/auth/cookies";
import {
	INVITATION_CREATED_MESSAGE,
	InvitationAuthorizationError,
	InvitationValidationError,
	createInvitation,
	createInvitationEmailTransport,
	listInvitations,
} from "../../../../lib/auth/invitations";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../lib/auth/session";

export const runtime = "nodejs";

type InvitationRequestBody = {
	recipientEmail?: unknown;
	recipient_email?: unknown;
};

export async function GET(request: NextRequest): Promise<NextResponse> {
	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	try {
		const invitations = await listInvitations({
			tenantId: session.tenantId,
			actorUserId: session.userId,
		});

		return NextResponse.json({ invitations });
	} catch (error) {
		if (error instanceof InvitationAuthorizationError) {
			return NextResponse.json(
				{ code: error.code, message: error.message },
				{ status: error.status },
			);
		}

		return NextResponse.json(
			{ message: "Invitations could not be loaded." },
			{ status: 500 },
		);
	}
}

export async function POST(request: NextRequest): Promise<NextResponse> {
	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	if (!hasValidCsrfToken(request)) {
		return NextResponse.json({ code: "CSRF_REQUIRED" }, { status: 403 });
	}

	const recipientEmail = await readRecipientEmail(request);

	try {
		const result = await createInvitation({
			tenantId: session.tenantId,
			actorUserId: session.userId,
			recipientEmail,
			transport: createInvitationEmailTransport(),
			baseUrl: process.env.APP_BASE_URL ?? request.nextUrl.origin,
			from: process.env.EMAIL_FROM ?? "no-reply@safetysecretary.local",
		});

		return NextResponse.json(
			{
				message: INVITATION_CREATED_MESSAGE,
				invitation: result.invitation,
				inviteUrl: result.inviteUrl,
				token: result.token,
			},
			{ status: 201 },
		);
	} catch (error) {
		if (
			error instanceof InvitationValidationError ||
			error instanceof InvitationAuthorizationError
		) {
			return NextResponse.json(
				{ code: error.code, message: error.message },
				{ status: error.status },
			);
		}

		return NextResponse.json(
			{ message: "Invitation could not be created." },
			{ status: 500 },
		);
	}
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

async function readRecipientEmail(request: NextRequest): Promise<string> {
	const contentType = request.headers.get("content-type") ?? "";

	if (contentType.includes("application/json")) {
		const body = (await request
			.json()
			.catch(() => null)) as InvitationRequestBody | null;
		return stringValue(body?.recipientEmail ?? body?.recipient_email);
	}

	const formData = await request.formData().catch(() => null);
	return stringValue(
		formData?.get("recipientEmail") ?? formData?.get("recipient_email"),
	);
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value : "";
}
