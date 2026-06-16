import { randomUUID } from "node:crypto";
import type { Language } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "../db";
import {
	authCookieSecurityContextFromRequest,
	CSRF_COOKIE_NAME,
	setSessionCookie,
	shouldUseSecureAuthCookies,
} from "./cookies";
import { pickInitialUiLocale } from "./locale";
import { normalizeLocalReturnTo } from "./return-to";
import {
	issueSession,
	SessionTenantMembershipError,
} from "./session";
import {
	type ResolvedWorkspace,
	resolveOrCreateWorkspaceForEmail,
} from "./workspace-resolution";

export type VerifiedEmailSignInResult =
	| {
			ok: true;
			response: NextResponse;
			tenantId: string;
			userId: string;
	  }
	| {
			ok: false;
			response: NextResponse;
	  };

type WorkspaceResolver = (input: {
	defaultLanguage: Language;
	email: string;
}) => Promise<ResolvedWorkspace>;

const csrfCookieMaxAgeSeconds = 30 * 24 * 60 * 60;

export async function signInVerifiedEmail(input: {
	email: string;
	request: NextRequest;
	returnTo?: string;
	workspaceResolver?: WorkspaceResolver;
}): Promise<VerifiedEmailSignInResult> {
	const defaultLanguage = pickInitialUiLocale(
		input.request.headers.get("accept-language"),
		"en",
	) as Language;
	const workspaceResolver =
		input.workspaceResolver ?? resolveOrCreateWorkspaceForEmail;
	const workspace = await workspaceResolver({
		defaultLanguage,
		email: input.email,
	});

	await captureUiLocaleOnFirstSignIn(
		workspace.userId,
		workspace.tenantId,
		input.request.headers.get("accept-language"),
	);

	let session: Awaited<ReturnType<typeof issueSession>>;

	try {
		session = await issueSession(
			workspace.userId,
			workspace.tenantId,
			input.request.headers.get("user-agent"),
		);
	} catch (error) {
		if (error instanceof SessionTenantMembershipError) {
			return {
				ok: false,
				response: NextResponse.json(
					{ message: "Sign-in could not be completed." },
					{ status: 400 },
				),
			};
		}

		throw error;
	}

	const redirectTo = normalizeLocalReturnTo(input.returnTo);
	const response = NextResponse.redirect(new URL(redirectTo, input.request.url), 303);
	const cookieSecurity = authCookieSecurityContextFromRequest(input.request);
	setSessionCookie(response, session, cookieSecurity);
	setCsrfCookie(response, cookieSecurity);

	return {
		ok: true,
		response,
		tenantId: workspace.tenantId,
		userId: workspace.userId,
	};
}

function setCsrfCookie(
	response: NextResponse,
	cookieSecurity: ReturnType<typeof authCookieSecurityContextFromRequest>,
): void {
	response.cookies.set(CSRF_COOKIE_NAME, randomUUID(), {
		httpOnly: false,
		maxAge: csrfCookieMaxAgeSeconds,
		path: "/",
		sameSite: "lax",
		secure: shouldUseSecureAuthCookies(cookieSecurity),
	});
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
			) as Language,
		},
	});
}
