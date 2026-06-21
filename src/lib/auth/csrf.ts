import { createHmac, timingSafeEqual } from "node:crypto";
import type { NextResponse } from "next/server";
import { resolveMasterEncryptionKey } from "../crypto/master-key";
import {
	type AuthCookieSecurityContext,
	CSRF_COOKIE_NAMES,
	CSRF_HOST_COOKIE_NAMES,
	shouldUseSecureAuthCookies,
} from "./cookies";
import { CSRF_HEADER_NAMES, readNamedHeader } from "./headers";

// Domain-separation label so the CSRF subkey can never collide with any other
// use of MASTER_ENCRYPTION_KEY (BYOK ciphertext etc.).
const CSRF_HMAC_CONTEXT = "ssfw-csrf:v1";
export const CSRF_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
// Stable fallback used only in non-production when MASTER_ENCRYPTION_KEY is not
// configured (the key is mandatory for BYOK, but auth/dev runs without it). It
// keeps CSRF deterministic across requests in dev/test. Production never reaches
// this branch — the managed key is required there.
const CSRF_DEV_FALLBACK_KEY = "ssfw-csrf-dev-fallback-key";

type CsrfCookieOptions = {
	httpOnly: false;
	maxAge: number;
	path: "/";
	sameSite: "lax";
	secure: boolean;
};

type CsrfCookieWriter = {
	set(name: string, value: string, options: CsrfCookieOptions): void;
};

// The CSRF token is a server-minted HMAC of the session id keyed by the managed
// MASTER_ENCRYPTION_KEY. It is therefore non-forgeable (an attacker cannot
// compute it without the secret) and bound to exactly one session, so a planted
// cookie/header pair can never satisfy verification for someone else's session.
export function mintCsrfToken(sessionId: string): string {
	return createHmac("sha256", resolveCsrfKey())
		.update(`${CSRF_HMAC_CONTEXT}:${sessionId}`, "utf8")
		.digest("base64url");
}

function resolveCsrfKey(): Buffer | string {
	try {
		return resolveMasterEncryptionKey();
	} catch (error) {
		if (process.env.NODE_ENV === "production") {
			throw error;
		}

		return CSRF_DEV_FALLBACK_KEY;
	}
}

export function verifyCsrfToken(
	submittedToken: string | null | undefined,
	sessionId: string,
): boolean {
	if (!submittedToken) {
		return false;
	}

	const expected = Buffer.from(mintCsrfToken(sessionId), "utf8");
	const submitted = Buffer.from(submittedToken, "utf8");

	return (
		expected.byteLength === submitted.byteLength &&
		timingSafeEqual(expected, submitted)
	);
}

export function verifyCsrfRequest(
	headers: Pick<Headers, "get">,
	sessionId: string,
): boolean {
	return verifyCsrfToken(
		readNamedHeader(headers, CSRF_HEADER_NAMES),
		sessionId,
	);
}

// Set the session-bound CSRF token cookie. In secure contexts the carrier is the
// __Host- prefixed cookie (forbids Domain, requires Secure + Path=/), which a
// subdomain attacker cannot overwrite. A non-prefixed copy is also written so
// the existing readers keep working and dev (plain http, no Secure) has a
// usable cookie. The proxy is the authoritative verifier and validates the
// submitted header against the session binding, so the readable copy is never
// trusted on its own.
export function setCsrfCookie(
	response: NextResponse,
	sessionId: string,
	context: AuthCookieSecurityContext = {},
): void {
	setCsrfCookieValue(response.cookies, sessionId, context);
}

export function setCsrfCookieValue(
	cookieWriter: CsrfCookieWriter,
	sessionId: string,
	context: AuthCookieSecurityContext = {},
): void {
	const secure = shouldUseSecureAuthCookies(context);
	const token = mintCsrfToken(sessionId);

	if (secure) {
		for (const cookieName of CSRF_HOST_COOKIE_NAMES) {
			cookieWriter.set(cookieName, token, {
				httpOnly: false,
				maxAge: CSRF_COOKIE_MAX_AGE_SECONDS,
				path: "/",
				sameSite: "lax",
				secure: true,
			});
		}
	}

	for (const cookieName of CSRF_COOKIE_NAMES) {
		cookieWriter.set(cookieName, token, {
			httpOnly: false,
			maxAge: CSRF_COOKIE_MAX_AGE_SECONDS,
			path: "/",
			sameSite: "lax",
			secure,
		});
	}
}
