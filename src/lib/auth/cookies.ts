import type { NextResponse } from "next/server";
import type { IssuedSession } from "./session";

export const SESSION_COOKIE_NAME = "ssfw_session";
export const CSRF_COOKIE_NAME = "ssfw_csrf";
// __Host- prefixed carrier used wherever Secure cookies are guaranteed. The
// prefix forbids a Domain attribute and requires Secure + Path=/, so a
// subdomain attacker cannot overwrite it. See lib/auth/csrf.ts.
export const CSRF_HOST_COOKIE_NAME = "__Host-ssfw_csrf";
export const LOCALE_COOKIE_NAME = "ssfw_locale";

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
	cookieWriter.set(
		SESSION_COOKIE_NAME,
		session.cookieValue,
		buildSessionCookieOptions(session.maxAgeSeconds, context),
	);
}
