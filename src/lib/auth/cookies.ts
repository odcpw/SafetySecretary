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

export function buildSessionCookieOptions(
	maxAgeSeconds: number,
): SessionCookieOptions {
	return {
		httpOnly: true,
		maxAge: maxAgeSeconds,
		path: "/",
		sameSite: "lax",
		secure: process.env.NODE_ENV === "production",
	};
}

export function setSessionCookie(
	response: NextResponse,
	session: Pick<IssuedSession, "cookieValue" | "maxAgeSeconds">,
): void {
	response.cookies.set(
		SESSION_COOKIE_NAME,
		session.cookieValue,
		buildSessionCookieOptions(session.maxAgeSeconds),
	);
}
