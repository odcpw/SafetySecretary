import { type NextRequest, NextResponse } from "next/server";
import type { Language } from "@prisma/client";
import { setSessionCookie } from "../../../../../lib/auth/cookies";
import { pickInitialUiLocale } from "../../../../../lib/auth/locale";
import {
	consumeMagicLinkToken,
	MAGIC_LINK_INVALID_OR_USED_MESSAGE,
} from "../../../../../lib/auth/magic-link";
import {
	issueSession,
	SessionTenantMembershipError,
} from "../../../../../lib/auth/session";
import { resolveOrCreateWorkspaceForEmail } from "../../../../../lib/auth/workspace-resolution";
import { prisma } from "../../../../../lib/db";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
	const token = request.nextUrl.searchParams.get("token") ?? "";

	if (!token) {
		return NextResponse.json(
			{ message: MAGIC_LINK_INVALID_OR_USED_MESSAGE },
			{ status: 400 },
		);
	}

	return new NextResponse(confirmSignInHtml(token), {
		headers: {
			"cache-control": "no-store",
			"content-type": "text/html; charset=utf-8",
		},
		status: 200,
	});
}

export async function POST(request: NextRequest): Promise<NextResponse> {
	const token = await readToken(request);

	if (!token) {
		return NextResponse.json(
			{ message: MAGIC_LINK_INVALID_OR_USED_MESSAGE },
			{ status: 400 },
		);
	}

	if (!hasAllowedVerificationOrigin(request)) {
		return NextResponse.json(
			{ message: MAGIC_LINK_INVALID_OR_USED_MESSAGE },
			{ status: 403 },
		);
	}

	return verifyMagicLink(request, token);
}

async function verifyMagicLink(
	request: NextRequest,
	token: string,
): Promise<NextResponse> {
	const defaultLanguage = pickInitialUiLocale(
		request.headers.get("accept-language"),
		"en",
	) as Language;

	const result = await consumeMagicLinkToken(token, {
		workspaceResolver: async ({ email }) => {
			const workspace = await resolveOrCreateWorkspaceForEmail({
				email,
				defaultLanguage,
			});
			return {
				userId: workspace.userId,
				tenantId: workspace.tenantId,
			};
		},
	});

	if (!result.ok) {
		return NextResponse.json(
			{ message: result.message },
			{ status: result.reason === "expired" ? 410 : 400 },
		);
	}

	await captureUiLocaleOnFirstSignIn(
		result.userId,
		result.tenantId,
		request.headers.get("accept-language"),
	);

	let session: Awaited<ReturnType<typeof issueSession>>;

	try {
		session = await issueSession(
			result.userId,
			result.tenantId,
			request.headers.get("user-agent"),
		);
	} catch (error) {
		if (error instanceof SessionTenantMembershipError) {
			return NextResponse.json(
				{ message: MAGIC_LINK_INVALID_OR_USED_MESSAGE },
				{ status: 400 },
			);
		}

		throw error;
	}
	const response = wantsHtmlRedirect(request)
		? NextResponse.redirect(new URL("/workspace", request.url), 303)
		: NextResponse.json(
				{
					message: "Signed in.",
					userId: result.userId,
					tenantId: result.tenantId,
				},
				{ status: 200 },
			);

	setSessionCookie(response, session);

	return response;
}

async function readToken(request: NextRequest): Promise<string> {
	const queryToken = request.nextUrl.searchParams.get("token");
	if (queryToken) {
		return queryToken;
	}

	const contentType = request.headers.get("content-type") ?? "";

	if (contentType.includes("application/json")) {
		const body = (await request.json().catch(() => null)) as {
			token?: unknown;
		} | null;
		return typeof body?.token === "string" ? body.token : "";
	}

	const formData = await request.formData().catch(() => null);
	const token = formData?.get("token");
	return typeof token === "string" ? token : "";
}

function wantsHtmlRedirect(request: NextRequest): boolean {
	const contentType = request.headers.get("content-type") ?? "";
	const accept = request.headers.get("accept") ?? "";
	return (
		contentType.includes("application/x-www-form-urlencoded") ||
		contentType.includes("multipart/form-data") ||
		accept.includes("text/html")
	);
}

function hasAllowedVerificationOrigin(request: NextRequest): boolean {
	const origin = request.headers.get("origin");
	if (origin) {
		return origin === request.nextUrl.origin;
	}

	const referer = request.headers.get("referer");
	if (!referer) {
		return true;
	}

	try {
		return new URL(referer).origin === request.nextUrl.origin;
	} catch {
		return false;
	}
}

function confirmSignInHtml(token: string): string {
	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign in to Safety Secretary</title>
</head>
<body>
  <main>
    <h1>Sign in to Safety Secretary</h1>
    <p>Confirm this browser should be signed in.</p>
    <form method="post" action="/api/auth/magic-link/verify">
      <input type="hidden" name="token" value="${escapeHtml(token)}" />
      <button type="submit">Sign in</button>
    </form>
  </main>
</body>
</html>`;
}

function escapeHtml(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

async function captureUiLocaleOnFirstSignIn(
	userId: string,
	tenantId: string,
	acceptLanguageHeader: string | null,
): Promise<void> {
	const tenant = await prisma.tenant.findUniqueOrThrow({
		where: { id: tenantId },
		select: { defaultLanguage: true },
	});

	await prisma.user.updateMany({
		where: {
			id: userId,
			uiLocale: null,
		},
		data: {
			uiLocale: pickInitialUiLocale(
				acceptLanguageHeader,
				tenant.defaultLanguage,
			),
		},
	});
}
