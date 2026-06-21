import { type NextRequest, NextResponse } from "next/server";
import type { Language } from "@prisma/client";
import {
	authCookieSecurityContextFromRequest,
	setSessionCookie,
} from "../../../../../lib/auth/cookies";
import {
	appRedirectOrigin,
	hasTrustedAuthRequestOrigin,
} from "../../../../../lib/auth/base-url";
import { setCsrfCookie } from "../../../../../lib/auth/csrf";
import { pickInitialUiLocale } from "../../../../../lib/auth/locale";
import {
	consumeMagicLinkToken,
	MAGIC_LINK_INVALID_OR_USED_MESSAGE,
} from "../../../../../lib/auth/magic-link";
import {
	issueSession,
	SessionTenantMembershipError,
} from "../../../../../lib/auth/session";
import { hasActiveTenantMembership } from "../../../../../lib/auth/membership";
import {
	INVITATION_REQUIRED_CODE,
	INVITATION_REQUIRED_MESSAGE,
} from "../../../../../lib/auth/verified-email-signin";
import { resolveOrCreateWorkspaceForEmail } from "../../../../../lib/auth/workspace-resolution";
import { prisma } from "../../../../../lib/db";
import {
	notifyOperatorTenantAccess,
	scheduleOperatorNotification,
} from "../../../../../lib/operator/notifications";

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

	if (!hasTrustedAuthRequestOrigin(request)) {
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
				email: workspace.email,
				workspaceKind: workspace.workspaceKind,
				createdTenant: workspace.createdTenant,
				joinedTenant: workspace.joinedTenant,
			};
		},
	});

	if (!result.ok) {
		return NextResponse.json(
			{ message: result.message },
			{ status: result.reason === "expired" ? 410 : 400 },
		);
	}

	if (!(await hasActiveTenantMembership(result.tenantId, result.userId))) {
		return NextResponse.json(
			{
				code: INVITATION_REQUIRED_CODE,
				message: INVITATION_REQUIRED_MESSAGE,
			},
			{ status: 403 },
		);
	}

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

	await captureUiLocaleOnFirstSignIn(
		result.userId,
		result.tenantId,
		request.headers.get("accept-language"),
	);
	const response = wantsHtmlRedirect(request)
		? NextResponse.redirect(
				// Build the post-sign-in target from the public origin (APP_BASE_URL)
				// — request.url is the internal http://localhost:3000 behind the proxy.
				new URL("/incidents", appRedirectOrigin(request.nextUrl.origin)),
				303,
			)
		: NextResponse.json(
				{
					message: "Signed in.",
					userId: result.userId,
					tenantId: result.tenantId,
				},
				{ status: 200 },
			);

	const cookieSecurity = authCookieSecurityContextFromRequest(request);
	setSessionCookie(response, session, cookieSecurity);
	setCsrfCookie(response, session.cookieValue, cookieSecurity);
	queueTenantAccessNotification(result);

	return response;
}

function queueTenantAccessNotification(
	result: Extract<
		Awaited<ReturnType<typeof consumeMagicLinkToken>>,
		{ ok: true }
	>,
): void {
	if (!result.createdTenant && !result.joinedTenant) {
		return;
	}

	scheduleOperatorNotification("tenant access", () =>
		notifyOperatorTenantAccess({
			action: result.createdTenant ? "created" : "joined",
			tenantId: result.tenantId,
			userId: result.userId,
			userEmail: result.email,
			workspaceKind: result.workspaceKind,
		}),
	);
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

function confirmSignInHtml(token: string): string {
	// Standalone interstitial served directly from the API route (it never passes
	// through the App Router layout/Tailwind), so styling is inlined to keep it
	// branded instead of raw browser-default HTML.
	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign in to Safety Secretary</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      background: #f4f5f7;
      color: #1a1d23;
    }
    main {
      width: 100%;
      max-width: 24rem;
      background: #ffffff;
      border: 1px solid #e2e5ea;
      border-radius: 12px;
      padding: 32px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      text-align: center;
    }
    h1 { font-size: 1.25rem; margin: 0 0 8px; }
    p { margin: 0 0 24px; color: #5b6472; font-size: 0.95rem; }
    button {
      width: 100%;
      padding: 12px 16px;
      font-size: 1rem;
      font-weight: 600;
      color: #ffffff;
      background: #1f6feb;
      border: none;
      border-radius: 8px;
      cursor: pointer;
    }
    button:hover { background: #1a5fd0; }
    @media (prefers-color-scheme: dark) {
      body { background: #0f1115; color: #e6e8eb; }
      main { background: #171a21; border-color: #2a2f3a; }
      p { color: #9aa3b2; }
    }
  </style>
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
