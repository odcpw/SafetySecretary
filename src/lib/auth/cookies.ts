import type { NextResponse } from "next/server";
import type { IssuedSession } from "./session";

export const SESSION_COOKIE_NAME = "safetysecretary_session";
export const LEGACY_SESSION_COOKIE_NAME = "ssfw_session";
export const SESSION_COOKIE_NAMES = [
	SESSION_COOKIE_NAME,
	LEGACY_SESSION_COOKIE_NAME,
] as const;

export const CSRF_COOKIE_NAME = "safetysecretary_csrf";
export const LEGACY_CSRF_COOKIE_NAME = "ssfw_csrf";
export const CSRF_COOKIE_NAMES = [
	CSRF_COOKIE_NAME,
	LEGACY_CSRF_COOKIE_NAME,
] as const;
// __Host- prefixed carrier used wherever Secure cookies are guaranteed. The
// prefix forbids a Domain attribute and requires Secure + Path=/, so a
// subdomain attacker cannot overwrite it. See lib/auth/csrf.ts.
export const CSRF_HOST_COOKIE_NAME = "__Host-safetysecretary_csrf";
export const LEGACY_CSRF_HOST_COOKIE_NAME = "__Host-ssfw_csrf";
export const CSRF_HOST_COOKIE_NAMES = [
	CSRF_HOST_COOKIE_NAME,
	LEGACY_CSRF_HOST_COOKIE_NAME,
] as const;

export const LOCALE_COOKIE_NAME = "safetysecretary_locale";
export const LEGACY_LOCALE_COOKIE_NAME = "ssfw_locale";
export const LOCALE_COOKIE_NAMES = [
	LOCALE_COOKIE_NAME,
	LEGACY_LOCALE_COOKIE_NAME,
] as const;

export type SessionCookieOptions = {
	httpOnly: true;
	maxAge: number;
	path: "/";
	sameSite: "lax";
	secure: boolean;
};

type SessionCookieWriter = {
	set(name: string, value: string, options: SessionCookieOptions): void;
};

export type CookieReader = {
	get(name: string): { readonly value?: string } | undefined;
};

type EnvLike = Pick<NodeJS.ProcessEnv, string>;

export type AuthCookieSecurityContext = {
	env?: EnvLike;
	forwardedProto?: string | null;
	requestUrl?: string | URL | null;
};

export function buildSessionCookieOptions(
	maxAgeSeconds: number,
	context: AuthCookieSecurityContext = {},
): SessionCookieOptions {
	return {
		httpOnly: true,
		maxAge: maxAgeSeconds,
		path: "/",
		sameSite: "lax",
		secure: shouldUseSecureAuthCookies(context),
	};
}

export function shouldUseSecureAuthCookies(
	context: AuthCookieSecurityContext = {},
): boolean {
	const env = context.env ?? process.env;
	if (env.NODE_ENV === "production") {
		return true;
	}

	const forwardedProto = context.forwardedProto?.split(",")[0]?.trim();
	if (forwardedProto === "https") {
		return true;
	}

	if (isHttpsUrl(context.requestUrl)) {
		return true;
	}

	const baseUrl = env.APP_BASE_URL?.trim();
	if (!baseUrl) {
		return false;
	}

	return isHttpsUrl(baseUrl);
}

export function authCookieSecurityContextFromRequest(request: {
	headers: Pick<Headers, "get">;
	url: string;
}): AuthCookieSecurityContext {
	return {
		...authCookieSecurityContextFromHeaders(request.headers),
		requestUrl: request.url,
	};
}

export function authCookieSecurityContextFromHeaders(
	requestHeaders: Pick<Headers, "get">,
): AuthCookieSecurityContext {
	const forwardedProto = requestHeaders.get("x-forwarded-proto");
	const host = requestHeaders.get("host");
	const protocol = forwardedProto?.split(",")[0]?.trim() || "http";

	return {
		forwardedProto,
		requestUrl: host ? `${protocol}://${host}` : null,
	};
}

function isHttpsUrl(value: string | URL | null | undefined): boolean {
	if (!value) {
		return false;
	}

	try {
		return new URL(value).protocol === "https:";
	} catch {
		return false;
	}
}

export function setSessionCookie(
	response: NextResponse,
	session: Pick<IssuedSession, "cookieValue" | "maxAgeSeconds">,
	context: AuthCookieSecurityContext = {},
): void {
	setSessionCookieValue(response.cookies, session, context);
}

export function setSessionCookieValue(
	cookieWriter: SessionCookieWriter,
	session: Pick<IssuedSession, "cookieValue" | "maxAgeSeconds">,
	context: AuthCookieSecurityContext = {},
): void {
	const options = buildSessionCookieOptions(session.maxAgeSeconds, context);

	for (const cookieName of SESSION_COOKIE_NAMES) {
		cookieWriter.set(cookieName, session.cookieValue, options);
	}
}

export function readNamedCookie(
	cookies: CookieReader,
	names: readonly string[],
): string | undefined {
	for (const name of names) {
		const value = cookies.get(name)?.value;
		if (value) {
			return value;
		}
	}

	return undefined;
}

export function readSessionCookie(cookies: CookieReader): string | undefined {
	return readNamedCookie(cookies, SESSION_COOKIE_NAMES);
}

export function readLocaleCookie(cookies: CookieReader): string | undefined {
	return readNamedCookie(cookies, LOCALE_COOKIE_NAMES);
}

export function readPlainCsrfCookie(cookies: CookieReader): string | undefined {
	return readNamedCookie(cookies, CSRF_COOKIE_NAMES);
}

export function readHostCsrfCookie(cookies: CookieReader): string | undefined {
	return readNamedCookie(cookies, CSRF_HOST_COOKIE_NAMES);
}

export function readCookieMapValue(
	cookies: ReadonlyMap<string, string>,
	names: readonly string[],
): string | undefined {
	for (const name of names) {
		const value = cookies.get(name);
		if (value) {
			return value;
		}
	}

	return undefined;
}
