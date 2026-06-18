import { PrismaClient } from "@prisma/client";
import { type NextRequest, NextResponse } from "next/server.js";
import {
	authCookieSecurityContextFromRequest,
	CSRF_COOKIE_NAME,
	CSRF_HOST_COOKIE_NAME,
	LOCALE_COOKIE_NAME,
	SESSION_COOKIE_NAME,
	shouldUseSecureAuthCookies,
} from "./lib/auth/cookies";
import { setCsrfCookie, verifyCsrfToken } from "./lib/auth/csrf";
import { type ValidatedSession, validateSession } from "./lib/auth/session";
import { LOCALES, type Locale } from "./lib/i18n/types";
import { DISCLAIMER_VERSION } from "./lib/legal/disclaimer";

const PUBLIC_PATHS = new Set([
	"/",
	"/signin",
	"/signup",
	"/disclaimer",
	"/legal/llm-logging",
	"/manifest.webmanifest",
]);
const PUBLIC_AUTH_API_PATHS = new Set([
	"/api/auth/magic-link/request",
	"/api/auth/magic-link/verify",
	"/api/auth/signup",
	"/api/auth/dev-session",
]);
const ACKNOWLEDGEMENT_API_PATH = "/api/legal/acknowledgement";
const STATE_CHANGING_METHODS = new Set(["DELETE", "PATCH", "POST", "PUT"]);

type SessionValidator = (
	cookieValue: string | null | undefined,
) => Promise<ValidatedSession | null>;
type AcknowledgementValidator = (
	userId: string,
	disclaimerVersion: string,
) => Promise<boolean>;
type LocaleResolver = (userId: string) => Promise<Locale | null>;
type GlobalState = typeof globalThis & {
	__ssfwAcknowledgementPrisma?: PrismaClient;
};

const globalState = globalThis as GlobalState;

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};

export async function proxy(request: NextRequest): Promise<NextResponse> {
	return authorizeRequest(
		request,
		validateSession,
		hasCurrentAcknowledgement,
		persistedUserLocale,
	);
}

export async function authorizeRequest(
	request: NextRequest,
	validator: SessionValidator = validateSession,
	acknowledgementValidator: AcknowledgementValidator | null = null,
	localeResolver: LocaleResolver | null = null,
): Promise<NextResponse> {
	const headers = new Headers(request.headers);
	headers.delete("x-ssfw-user-id");
	headers.delete("x-ssfw-tenant-id");

	if (isPublicPath(request.nextUrl.pathname)) {
		return NextResponse.next({
			request: { headers },
		});
	}

	const session = await validator(
		request.cookies.get(SESSION_COOKIE_NAME)?.value,
	);

	if (!session) {
		return unauthenticatedResponse(request);
	}

	if (
		acknowledgementValidator &&
		request.nextUrl.pathname !== ACKNOWLEDGEMENT_API_PATH &&
		!(await acknowledgementValidator(session.userId, DISCLAIMER_VERSION))
	) {
		return unacknowledgedResponse(request, session, localeResolver);
	}

	if (
		isStateChangingMethod(request.method) &&
		!hasValidCsrfToken(request, session.id)
	) {
		return NextResponse.json(
			{ message: "CSRF token required." },
			{ status: 403 },
		);
	}

	headers.set("x-ssfw-user-id", session.userId);
	headers.set("x-ssfw-tenant-id", session.tenantId);

	const response = NextResponse.next({
		request: { headers },
	});
	ensureCsrfCookie(request, response, session.id);

	return response;
}

export function isPublicPath(pathname: string): boolean {
	if (PUBLIC_PATHS.has(pathname)) {
		return true;
	}

	return (
		PUBLIC_AUTH_API_PATHS.has(pathname) ||
		/^\/api\/auth\/oauth\/[^/]+\/(?:start|callback)$/.test(pathname) ||
		/^\/icons\/[^/]+$/.test(pathname) ||
		/^\/invite\/[^/]+$/.test(pathname)
	);
}

export function isStateChangingMethod(method: string): boolean {
	return STATE_CHANGING_METHODS.has(method.toUpperCase());
}

export function hasValidCsrfToken(
	request: NextRequest,
	sessionId: string,
): boolean {
	const csrfHeader = request.headers.get("x-ssfw-csrf");

	return verifyCsrfToken(csrfHeader, sessionId);
}

// Re-mint the session-bound CSRF cookie on authed requests so the client always
// has a valid token to echo, even after the cookie's own max-age lapses while
// the (extended) session lives on. The token is deterministic for a session, so
// re-setting it is idempotent.
function ensureCsrfCookie(
	request: NextRequest,
	response: NextResponse,
	sessionId: string,
): void {
	const cookieSecurity = authCookieSecurityContextFromRequest(request);
	const carrierName = shouldUseSecureAuthCookies(cookieSecurity)
		? CSRF_HOST_COOKIE_NAME
		: CSRF_COOKIE_NAME;

	if (request.cookies.get(carrierName)?.value) {
		return;
	}

	setCsrfCookie(response, sessionId, cookieSecurity);
}

function unauthenticatedResponse(request: NextRequest): NextResponse {
	if (request.nextUrl.pathname.startsWith("/api/")) {
		return NextResponse.json(
			{ message: "Authentication required." },
			{ status: 401 },
		);
	}

	const signInUrl = new URL("/signin", request.url);
	signInUrl.searchParams.set(
		"returnTo",
		`${request.nextUrl.pathname}${request.nextUrl.search}`,
	);
	return NextResponse.redirect(signInUrl);
}

async function unacknowledgedResponse(
	request: NextRequest,
	session: Pick<ValidatedSession, "userId">,
	localeResolver: LocaleResolver | null,
): Promise<NextResponse> {
	if (request.nextUrl.pathname.startsWith("/api/")) {
		return NextResponse.json(
			{ code: "ACKNOWLEDGEMENT_REQUIRED" },
			{ status: 403 },
		);
	}

	const disclaimerUrl = new URL("/disclaimer", request.url);
	const locale =
		localeFromRequest(request) ??
		(localeResolver ? await localeResolver(session.userId) : null);

	if (locale) {
		disclaimerUrl.searchParams.set("locale", locale);
	}

	disclaimerUrl.searchParams.set(
		"returnTo",
		`${request.nextUrl.pathname}${request.nextUrl.search}`,
	);
	return NextResponse.redirect(disclaimerUrl);
}

async function hasCurrentAcknowledgement(
	userId: string,
	disclaimerVersion: string,
): Promise<boolean> {
	const prisma = getAcknowledgementPrismaClient();
	const row = await prisma.userAcknowledgement.findUnique({
		where: {
			userId_disclaimerVersion: {
				userId,
				disclaimerVersion,
			},
		},
		select: { id: true },
	});

	return Boolean(row);
}

async function persistedUserLocale(userId: string): Promise<Locale | null> {
	const prisma = getAcknowledgementPrismaClient();
	const user = await prisma.user.findUnique({
		select: { uiLocale: true },
		where: { id: userId },
	});

	return user?.uiLocale ?? null;
}

function getAcknowledgementPrismaClient(): PrismaClient {
	if (!globalState.__ssfwAcknowledgementPrisma) {
		globalState.__ssfwAcknowledgementPrisma = new PrismaClient();
	}

	return globalState.__ssfwAcknowledgementPrisma;
}

function localeFromRequest(request: NextRequest): Locale | null {
	const explicitLocale = request.nextUrl.searchParams.get("locale");

	if (isLocale(explicitLocale)) {
		return explicitLocale;
	}

	const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value ?? null;

	if (isLocale(cookieLocale)) {
		return cookieLocale;
	}

	return null;
}

function isLocale(value: string | null): value is Locale {
	return (
		typeof value === "string" && (LOCALES as readonly string[]).includes(value)
	);
}
