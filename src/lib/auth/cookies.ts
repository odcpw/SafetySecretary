import type { NextResponse } from "next/server";
import type { IssuedSession } from "./session";

export const SESSION_COOKIE_NAME = "ssfw_session";
export const CSRF_COOKIE_NAME = "ssfw_csrf";
export const LOCALE_COOKIE_NAME = "ssfw_locale";

export type SessionCookieOptions = {
	httpOnly: true;
	maxAge: number;
	path: "/";
	sameSite: "lax";
	secure: boolean;
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
		forwardedProto: request.headers.get("x-forwarded-proto"),
		requestUrl: request.url,
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
	response.cookies.set(
		SESSION_COOKIE_NAME,
		session.cookieValue,
		buildSessionCookieOptions(session.maxAgeSeconds, context),
	);
}
