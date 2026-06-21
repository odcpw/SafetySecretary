"use client";

import { CSRF_COOKIE_NAMES, CSRF_HOST_COOKIE_NAMES } from "./cookies";

// The CSRF token is now server-minted and session-bound (an HMAC of the session
// id, see lib/auth/csrf.ts) and set as a cookie at sign-in and re-issued by the
// proxy on every authed request. The client no longer mints anything; it only
// reads the current token and echoes it in the CSRF header. Prefer the __Host-
// prefixed carrier (present whenever cookies are Secure) and fall back to the
// plain name in dev.

export function ensureCsrfToken(name: string): string {
	const token =
		firstCookieValue(CSRF_HOST_COOKIE_NAMES) ??
		cookieValue(name) ??
		firstCookieValue(CSRF_COOKIE_NAMES);
	if (!token) {
		throw new Error("CSRF_COOKIE_MISSING");
	}

	return token;
}

function firstCookieValue(names: readonly string[]): string | null {
	for (const name of names) {
		const value = cookieValue(name);
		if (value) {
			return value;
		}
	}

	return null;
}

function cookieValue(name: string): string | null {
	const prefix = `${name}=`;
	const match = document.cookie
		.split(";")
		.map((part) => part.trim())
		.find((part) => part.startsWith(prefix));

	return match ? decodeURIComponent(match.slice(prefix.length)) : null;
}
