export class AuthBaseUrlConfigurationError extends Error {
	readonly code = "AUTH_BASE_URL_REQUIRED";

	constructor() {
		super("APP_BASE_URL is required for emailed auth links.");
		this.name = "AuthBaseUrlConfigurationError";
	}
}

export function authBaseUrlForRequest(): string {
	const configured = process.env.APP_BASE_URL?.trim();

	if (configured) {
		return configured;
	}

	throw new AuthBaseUrlConfigurationError();
}

/**
 * Origin to build post-auth redirect targets from. Behind a TLS-terminating
 * reverse proxy (e.g. Caddy) request.url / request.nextUrl.origin is the internal
 * http://localhost:3000, so a redirect built from it sends the browser to
 * localhost. Prefer the configured APP_BASE_URL; fall back to the request's own
 * origin for local/dev where APP_BASE_URL is unset.
 */
export function appRedirectOrigin(requestOrigin: string): string {
	return process.env.APP_BASE_URL?.trim() || requestOrigin;
}

/**
 * Same-origin gate for credential/session-minting POSTs. Behind a TLS-terminating
 * reverse proxy (e.g. Caddy) the app process sees an internal request URL
 * (http://localhost:3000), so request.nextUrl.origin does NOT equal the public
 * browser origin. Trust the configured APP_BASE_URL origin as well, falling back
 * to the request's own origin for local/dev where APP_BASE_URL is unset.
 */
export function isTrustedAuthOrigin(
	candidateOrigin: string,
	requestOrigin: string,
): boolean {
	if (candidateOrigin === requestOrigin) {
		return true;
	}

	const configured = process.env.APP_BASE_URL?.trim();
	if (!configured) {
		return false;
	}

	try {
		return candidateOrigin === new URL(configured).origin;
	} catch {
		return false;
	}
}

export function hasTrustedAuthRequestOrigin(request: {
	headers: Pick<Headers, "get">;
	nextUrl: { origin: string };
}): boolean {
	const origin = request.headers.get("origin");
	if (origin) {
		return isTrustedAuthOrigin(origin, request.nextUrl.origin);
	}

	const referer = request.headers.get("referer");
	if (!referer) {
		return false;
	}

	try {
		return isTrustedAuthOrigin(new URL(referer).origin, request.nextUrl.origin);
	} catch {
		return false;
	}
}
