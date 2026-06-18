import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (!context.parentURL || !isLocalImport(specifier)) {
			return nextResolve(specifier, context);
		}

		const candidates = [
			new URL(`${specifier}.ts`, context.parentURL),
			new URL(`${specifier}/index.ts`, context.parentURL),
		];
		const resolved = candidates.find((candidate) =>
			existsSync(fileURLToPath(candidate)),
		);

		if (resolved) {
			return {
				shortCircuit: true,
				url: resolved.href,
			};
		}

		return nextResolve(specifier, context);
	},
});

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}

const oauthModulePath = "../../../src/lib/auth/oauth.ts";
const {
	buildOAuthAuthorizationRequest,
	decodeOAuthStateCookie,
	exchangeOAuthCode,
	extractOAuthSubject,
	extractVerifiedOAuthEmail,
	fetchOAuthUserInfo,
	normalizeOAuthReturnTo,
	oauthRedirectUri,
	oauthStateCookieName,
	validateOAuthIdTokenClaims,
} = (await import(
	oauthModulePath
)) as typeof import("../../../src/lib/auth/oauth");

test("Microsoft OAuth authorization request uses common tenant, PKCE, state cookie, and safe returnTo", () => {
	const request = buildOAuthAuthorizationRequest({
		codeVerifier: "verifier-1",
		env: {
			APP_BASE_URL: "https://safetysecretary.com",
			MICROSOFT_OAUTH_CLIENT_ID: "microsoft-client",
			MICROSOFT_OAUTH_CLIENT_SECRET: "microsoft-secret",
			MICROSOFT_OAUTH_TENANT: "common",
		},
		provider: "microsoft",
		requestUrl: "https://safetysecretary.com/signin?returnTo=/workspace",
		returnTo: "/incidents",
		nonce: "nonce-1",
		state: "state-1",
	});

	assert.equal(
		request.authorizationUrl.origin,
		"https://login.microsoftonline.com",
	);
	assert.equal(
		request.authorizationUrl.pathname,
		"/common/oauth2/v2.0/authorize",
	);
	assert.equal(
		request.authorizationUrl.searchParams.get("client_id"),
		"microsoft-client",
	);
	assert.equal(request.authorizationUrl.searchParams.get("response_type"), "code");
	assert.equal(request.authorizationUrl.searchParams.get("state"), "state-1");
	assert.equal(request.authorizationUrl.searchParams.get("nonce"), "nonce-1");
	assert.equal(
		request.authorizationUrl.searchParams.get("redirect_uri"),
		"https://safetysecretary.com/api/auth/oauth/microsoft/callback",
	);
	assert.equal(
		request.authorizationUrl.searchParams.get("scope"),
		"openid email profile",
	);
	assert.equal(
		request.authorizationUrl.searchParams.get("code_challenge_method"),
		"S256",
	);
	assert.ok(request.authorizationUrl.searchParams.get("code_challenge"));

	assert.equal(request.cookie.name, oauthStateCookieName("microsoft"));
	assert.equal(request.cookie.maxAgeSeconds, 600);
	assert.deepEqual(decodeOAuthStateCookie(request.cookie.value), {
		codeVerifier: "verifier-1",
		nonce: "nonce-1",
		provider: "microsoft",
		returnTo: "/incidents",
		state: "state-1",
	});
});

test("Google OAuth authorization request supports explicit redirect URI and sanitizes returnTo", () => {
	const request = buildOAuthAuthorizationRequest({
		codeVerifier: "verifier-1",
		env: {
			GOOGLE_OAUTH_CLIENT_ID: "google-client",
			GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
			GOOGLE_OAUTH_REDIRECT_URI: "https://auth.example.test/google",
		},
		provider: "google",
		requestUrl: "https://safetysecretary.com/signin",
		returnTo: "https://evil.example.test/workspace",
		state: "state-1",
	});

	assert.equal(
		request.authorizationUrl.href.startsWith(
			"https://accounts.google.com/o/oauth2/v2/auth?",
		),
		true,
	);
	assert.equal(
		request.authorizationUrl.searchParams.get("redirect_uri"),
		"https://auth.example.test/google",
	);
	assert.equal(
		decodeOAuthStateCookie(request.cookie.value)?.returnTo,
		"/incidents",
	);
});

test("OAuth helpers reject missing provider credentials", () => {
	assert.throws(
		() =>
			buildOAuthAuthorizationRequest({
				env: {},
				provider: "google",
				requestUrl: "https://safetysecretary.com/signin",
			}),
		/google OAuth requires client id and client secret/,
	);
});

test("OAuth returnTo and state cookie parsing are defensive", () => {
	assert.equal(normalizeOAuthReturnTo("/workspace/actions"), "/workspace/actions");
	assert.equal(normalizeOAuthReturnTo("//evil.example.test"), "/incidents");
	assert.equal(normalizeOAuthReturnTo("/\\evil.example.test"), "/incidents");
	assert.equal(normalizeOAuthReturnTo("/workspace\u0000/actions"), "/incidents");
	assert.equal(
		normalizeOAuthReturnTo("https://evil.example.test/workspace"),
		"/incidents",
	);
	assert.equal(decodeOAuthStateCookie("not-json"), null);
	assert.equal(
		decodeOAuthStateCookie(
			Buffer.from(
				JSON.stringify({
					codeVerifier: "verifier-1",
					provider: "google",
					returnTo: "/workspace",
					state: "state-1",
				}),
				"utf8",
			).toString("base64url"),
		),
		null,
	);
});

test("OAuth ID token claims require expected audience, issuer, nonce, and expiry", () => {
	const now = new Date("2026-06-16T12:00:00.000Z");
	const validGoogleClaims = {
		aud: "google-client",
		email: "alice@example.com",
		email_verified: true,
		exp: Math.floor(now.getTime() / 1000) + 300,
		iss: "https://accounts.google.com",
		nonce: "nonce-1",
		sub: "subject-1",
	};

	assert.deepEqual(
		validateOAuthIdTokenClaims({
			claims: validGoogleClaims,
			env: {
				GOOGLE_OAUTH_CLIENT_ID: "google-client",
				GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
			},
			expectedNonce: "nonce-1",
			now,
			provider: "google",
		}),
		validGoogleClaims,
	);
	assert.throws(
		() =>
			validateOAuthIdTokenClaims({
				claims: { ...validGoogleClaims, aud: "other-client" },
				env: {
					GOOGLE_OAUTH_CLIENT_ID: "google-client",
					GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
				},
				expectedNonce: "nonce-1",
				now,
				provider: "google",
			}),
		/OAuth ID token claims failed validation/,
	);
	assert.throws(
		() =>
			validateOAuthIdTokenClaims({
				claims: null,
				env: {
					GOOGLE_OAUTH_CLIENT_ID: "google-client",
					GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
				},
				expectedNonce: "nonce-1",
				now,
				provider: "google",
			}),
		/OAuth ID token claims failed validation/,
	);
	assert.throws(
		() =>
			validateOAuthIdTokenClaims({
				claims: { ...validGoogleClaims, iss: "https://accounts.google.evil" },
				env: {
					GOOGLE_OAUTH_CLIENT_ID: "google-client",
					GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
				},
				expectedNonce: "nonce-1",
				now,
				provider: "google",
			}),
		/OAuth ID token claims failed validation/,
	);
	assert.throws(
		() =>
			validateOAuthIdTokenClaims({
				claims: { ...validGoogleClaims, nonce: "other-nonce" },
				env: {
					GOOGLE_OAUTH_CLIENT_ID: "google-client",
					GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
				},
				expectedNonce: "nonce-1",
				now,
				provider: "google",
			}),
		/OAuth ID token claims failed validation/,
	);
	assert.throws(
		() =>
			validateOAuthIdTokenClaims({
				claims: {
					...validGoogleClaims,
					exp: Math.floor(now.getTime() / 1000) - 1,
				},
				env: {
					GOOGLE_OAUTH_CLIENT_ID: "google-client",
					GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
				},
				expectedNonce: "nonce-1",
				now,
				provider: "google",
			}),
		/OAuth ID token claims failed validation/,
	);

	assert.deepEqual(
		validateOAuthIdTokenClaims({
			claims: {
				aud: ["microsoft-client", "api://other"],
				email: "alice@example.com",
				exp: Math.floor(now.getTime() / 1000) + 300,
				iss: "https://login.microsoftonline.com/tenant-id/v2.0",
				nonce: "nonce-2",
				sub: "subject-2",
				xms_edov: true,
			},
			env: {
				MICROSOFT_OAUTH_CLIENT_ID: "microsoft-client",
				MICROSOFT_OAUTH_CLIENT_SECRET: "microsoft-secret",
			},
			expectedNonce: "nonce-2",
			now,
			provider: "microsoft",
		}).sub,
		"subject-2",
	);

	const tenantId = "11111111-1111-4111-8111-111111111111";
	assert.equal(
		validateOAuthIdTokenClaims({
			claims: {
				aud: "microsoft-client",
				email: "alice@example.com",
				exp: Math.floor(now.getTime() / 1000) + 300,
				iss: `https://login.microsoftonline.com/${tenantId}/v2.0`,
				nonce: "nonce-3",
				sub: "subject-3",
				tid: tenantId,
				xms_edov: true,
			},
			env: {
				MICROSOFT_OAUTH_CLIENT_ID: "microsoft-client",
				MICROSOFT_OAUTH_CLIENT_SECRET: "microsoft-secret",
				MICROSOFT_OAUTH_TENANT: tenantId,
			},
			expectedNonce: "nonce-3",
			now,
			provider: "microsoft",
		}).sub,
		"subject-3",
	);
	assert.throws(
		() =>
			validateOAuthIdTokenClaims({
				claims: {
					aud: "microsoft-client",
					email: "alice@example.com",
					exp: Math.floor(now.getTime() / 1000) + 300,
					iss: "https://login.microsoftonline.com/22222222-2222-4222-8222-222222222222/v2.0",
					nonce: "nonce-3",
					sub: "subject-3",
					tid: "22222222-2222-4222-8222-222222222222",
					xms_edov: true,
				},
				env: {
					MICROSOFT_OAUTH_CLIENT_ID: "microsoft-client",
					MICROSOFT_OAUTH_CLIENT_SECRET: "microsoft-secret",
					MICROSOFT_OAUTH_TENANT: tenantId,
				},
				expectedNonce: "nonce-3",
				now,
				provider: "microsoft",
			}),
		/OAuth ID token claims failed validation/,
	);
});

test("OAuth email extraction requires verified Google email and Microsoft domain-owner verified email", () => {
	assert.equal(
		extractVerifiedOAuthEmail("google", {
			email: "Alice@Example.com",
			email_verified: true,
		}),
		"alice@example.com",
	);
	assert.equal(
		extractVerifiedOAuthEmail("google", {
			email: "alice@example.com",
			email_verified: false,
		}),
		null,
	);
	assert.equal(
		extractVerifiedOAuthEmail("microsoft", {
			email: "Bob@Example.com",
			xms_edov: true,
		}),
		"bob@example.com",
	);
	assert.equal(
		extractVerifiedOAuthEmail("microsoft", {
			email: "bob@example.com",
		}),
		null,
	);
});

test("OAuth subject extraction prefers OIDC sub and falls back to Microsoft oid/tid", () => {
	assert.equal(
		extractOAuthSubject("google", { sub: "google-subject" }),
		"google-subject",
	);
	assert.equal(
		extractOAuthSubject("microsoft", {
			oid: "object-id",
			tid: "tenant-id",
		}),
		"tenant-id:object-id",
	);
	assert.equal(extractOAuthSubject("google", {}), null);
});

test("OAuth token exchange and userinfo calls use server-side endpoints", async () => {
	const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
	const fetchImpl: typeof fetch = async (input, init) => {
		calls.push({ input, init });
		return new Response(
			JSON.stringify({
				access_token: "access-1",
				id_token: jwtWithPayload({
					email: "alice@example.com",
					email_verified: true,
					sub: "subject-1",
				}),
			}),
			{ status: 200 },
		);
	};

	const token = await exchangeOAuthCode({
		code: "code-1",
		codeVerifier: "verifier-1",
		env: {
			APP_BASE_URL: "https://safetysecretary.com",
			GOOGLE_OAUTH_CLIENT_ID: "google-client",
			GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
		},
		fetchImpl,
		provider: "google",
		requestUrl: "https://safetysecretary.com/api/auth/oauth/google/callback",
	});

	assert.deepEqual(token, {
		accessToken: "access-1",
		idTokenClaims: {
			email: "alice@example.com",
			email_verified: true,
			sub: "subject-1",
		},
	});
	assert.equal(calls.length, 1);
	assert.equal(calls[0]?.input, "https://oauth2.googleapis.com/token");
	assert.equal(calls[0]?.init?.method, "POST");
	assert.ok(calls[0]?.init?.body instanceof URLSearchParams);
	const body = calls[0]?.init?.body as URLSearchParams;
	assert.equal(body.get("grant_type"), "authorization_code");
	assert.equal(body.get("code"), "code-1");
	assert.equal(body.get("code_verifier"), "verifier-1");
	assert.equal(body.get("client_secret"), "google-secret");

	const userInfo = await fetchOAuthUserInfo({
		accessToken: "access-1",
		fetchImpl: async (input, init) => {
			calls.push({ input, init });
			return new Response(
				JSON.stringify({
					email: "alice@example.com",
					email_verified: true,
					sub: "subject-1",
				}),
				{ status: 200 },
			);
		},
		provider: "google",
	});

	assert.equal(calls[1]?.input, "https://openidconnect.googleapis.com/v1/userinfo");
	assert.deepEqual(userInfo, {
		email: "alice@example.com",
		email_verified: true,
		sub: "subject-1",
	});
});

test("OAuth redirect URI defaults to APP_BASE_URL callback route", () => {
	assert.equal(
		oauthRedirectUri("google", "https://localhost:3000/signin", {
			APP_BASE_URL: "https://safetysecretary.com",
		}),
		"https://safetysecretary.com/api/auth/oauth/google/callback",
	);
});

function jwtWithPayload(payload: Record<string, unknown>): string {
	return [
		Buffer.from(JSON.stringify({ alg: "none" }), "utf8").toString("base64url"),
		Buffer.from(JSON.stringify(payload), "utf8").toString("base64url"),
		"",
	].join(".");
}
