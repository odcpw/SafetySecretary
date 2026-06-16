import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import type { PrismaClient } from "@prisma/client";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === "next/server") {
			return nextResolve("next/server.js", context);
		}

		if (!context.parentURL || !isLocalImport(specifier)) {
			return nextResolve(specifier, context);
		}

		const candidates = [
			new URL(`${specifier}.ts`, context.parentURL),
			new URL(`${specifier}.tsx`, context.parentURL),
			new URL(`${specifier}/index.ts`, context.parentURL),
		];
		const resolved = candidates.find((candidate) => existsSync(candidate));

		if (resolved) {
			return {
				shortCircuit: true,
				url: resolved.href,
			};
		}

		return nextResolve(specifier, context);
	},
});

const databaseUrl = process.env.DATABASE_URL;
const { NextRequest } = (await import(
	"next/server.js"
)) as typeof import("next/server");
const startRoute = (await import(
	moduleUrl("src/app/api/auth/oauth/[provider]/start/route.ts")
)) as typeof import("../../../src/app/api/auth/oauth/[provider]/start/route");
const callbackRoute = (await import(
	moduleUrl("src/app/api/auth/oauth/[provider]/callback/route.ts")
)) as typeof import("../../../src/app/api/auth/oauth/[provider]/callback/route");
const {
	buildOAuthAuthorizationRequest,
	decodeOAuthStateCookie,
	oauthStateCookieName,
} = (await import(
	moduleUrl("src/lib/auth/oauth.ts")
)) as typeof import("../../../src/lib/auth/oauth");
const { dropTenantSchema, prisma } = (await import(
	moduleUrl("src/lib/db/index.ts")
)) as typeof import("../../../src/lib/db");
const { resolveOrCreateWorkspaceForOAuthIdentity } = (await import(
	moduleUrl("src/lib/auth/oauth-identity.ts")
)) as typeof import("../../../src/lib/auth/oauth-identity");

test("OAuth start route stores sanitized returnTo in the state cookie", async () => {
	const restoreEnv = setEnv({
		APP_BASE_URL: "https://app.example.test",
		GOOGLE_OAUTH_CLIENT_ID: "google-client",
		GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
	});

	try {
		const response = await startRoute.GET(
			new NextRequest(
				"https://app.example.test/api/auth/oauth/google/start?returnTo=https://evil.example.test/workspace",
			),
			{ params: { provider: "google" } },
		);

		assert.equal(response.status, 303);
		const location = response.headers.get("location");
		assert.ok(location);
		const authorizationUrl = new URL(location);
		assert.equal(authorizationUrl.origin, "https://accounts.google.com");
		assert.equal(
			authorizationUrl.searchParams.get("redirect_uri"),
			"https://app.example.test/api/auth/oauth/google/callback",
		);

		const stateCookie = cookieValue(response, oauthStateCookieName("google"));
		assert.ok(stateCookie);
		assert.equal(
			decodeOAuthStateCookie(stateCookie)?.returnTo,
			"/workspace",
		);
	} finally {
		restoreEnv();
	}
});

test("OAuth callback rejects state mismatch and clears state cookie", async () => {
	const authorization = buildOAuthAuthorizationRequest({
		codeVerifier: "verifier-1",
		env: {
			APP_BASE_URL: "https://app.example.test",
			GOOGLE_OAUTH_CLIENT_ID: "google-client",
			GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
		},
		provider: "google",
		requestUrl: "https://app.example.test/signin",
		state: "state-real",
	});
	const response = await callbackRoute.GET(
		new NextRequest(
			"https://app.example.test/api/auth/oauth/google/callback?code=code-1&state=state-other",
			{
				headers: {
					cookie: `${authorization.cookie.name}=${authorization.cookie.value}`,
				},
			},
		),
		{ params: { provider: "google" } },
	);

	assert.equal(response.status, 303);
	assert.equal(
		response.headers.get("location"),
		"https://app.example.test/signin?oauth=oauth_state",
	);
	assert.equal(cookieValue(response, oauthStateCookieName("google")), "");
});

test("OAuth callback exchanges code, creates a session, and clears state cookie", async (t) => {
	if (!databaseUrl) {
		t.skip("DATABASE_URL is required");
		return;
	}

	ensureMigrated();

	const suffix = randomUUID();
	const email = `alice@ssfw-oauth-route-${suffix}.example.invalid`;
	const subject = `google-route-subject-${suffix}`;
	const authorization = buildOAuthAuthorizationRequest({
		codeVerifier: "verifier-ok",
		env: {
			APP_BASE_URL: "https://app.example.test",
			GOOGLE_OAUTH_CLIENT_ID: "google-client",
			GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
		},
		provider: "google",
		requestUrl: "https://app.example.test/signin",
		returnTo: "/workspace",
		state: "state-ok",
	});
	const restoreEnv = setEnv({
		APP_BASE_URL: "https://app.example.test",
		GOOGLE_OAUTH_CLIENT_ID: "google-client",
		GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
	});
	const restoreFetch = mockOAuthFetch({
		email,
		emailVerified: true,
		subject,
	});
	let tenantId: string | undefined;
	let userId: string | undefined;

	try {
		const response = await callbackRoute.GET(
			new NextRequest(
				"https://app.example.test/api/auth/oauth/google/callback?code=code-ok&state=state-ok",
				{
					headers: {
						"accept-language": "de-CH",
						cookie: `${authorization.cookie.name}=${authorization.cookie.value}`,
						"user-agent": "desktop",
					},
				},
			),
			{ params: { provider: "google" } },
		);

		assert.equal(response.status, 303);
		assert.equal(response.headers.get("location"), "https://app.example.test/workspace");
		assert.equal(cookieValue(response, oauthStateCookieName("google")), "");
		assert.ok(cookieValue(response, "ssfw_session"));
		assert.ok(cookieValue(response, "ssfw_csrf"));

		const user = await prisma.user.findUniqueOrThrow({
			where: { email },
			select: { id: true, uiLocale: true },
		});
		userId = user.id;
		assert.equal(user.uiLocale, "de");

		const identity = await prisma.oAuthIdentity.findUniqueOrThrow({
			where: {
				provider_providerSubject: {
					provider: "google",
					providerSubject: subject,
				},
			},
			select: { userId: true },
		});
		assert.equal(identity.userId, user.id);

		const membership = await prisma.tenantMembership.findFirstOrThrow({
			where: { userId: user.id },
			select: { tenantId: true },
		});
		tenantId = membership.tenantId;
	} finally {
		restoreFetch();
		restoreEnv();
		await cleanupRows(prisma, email, tenantId, userId);
	}
});

test("OAuth callback reports provider identity conflicts distinctly", async (t) => {
	if (!databaseUrl) {
		t.skip("DATABASE_URL is required");
		return;
	}

	ensureMigrated();

	const suffix = randomUUID();
	const originalEmail = `alice@ssfw-oauth-route-conflict-${suffix}.example.invalid`;
	const attackerEmail = `bob@ssfw-oauth-route-conflict-${suffix}.example.invalid`;
	const subject = `google-route-conflict-${suffix}`;
	const existing = await resolveOrCreateWorkspaceForOAuthIdentity({
		defaultLanguage: "en",
		email: originalEmail,
		issuer: "https://accounts.google.com",
		provider: "google",
		subject,
	});
	const authorization = buildOAuthAuthorizationRequest({
		codeVerifier: "verifier-conflict",
		env: {
			APP_BASE_URL: "https://app.example.test",
			GOOGLE_OAUTH_CLIENT_ID: "google-client",
			GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
		},
		provider: "google",
		requestUrl: "https://app.example.test/signin",
		state: "state-conflict",
	});
	const restoreEnv = setEnv({
		APP_BASE_URL: "https://app.example.test",
		GOOGLE_OAUTH_CLIENT_ID: "google-client",
		GOOGLE_OAUTH_CLIENT_SECRET: "google-secret",
	});
	const restoreFetch = mockOAuthFetch({
		email: attackerEmail,
		emailVerified: true,
		subject,
	});

	try {
		const response = await callbackRoute.GET(
			new NextRequest(
				"https://app.example.test/api/auth/oauth/google/callback?code=code-conflict&state=state-conflict",
				{
					headers: {
						cookie: `${authorization.cookie.name}=${authorization.cookie.value}`,
					},
				},
			),
			{ params: { provider: "google" } },
		);

		assert.equal(response.status, 303);
		assert.equal(
			response.headers.get("location"),
			"https://app.example.test/signin?oauth=oauth_identity_conflict",
		);
		assert.equal(cookieValue(response, oauthStateCookieName("google")), "");
		const attackerUser = await prisma.user.findUnique({
			where: { email: attackerEmail },
		});
		assert.equal(attackerUser, null);
	} finally {
		restoreFetch();
		restoreEnv();
		await cleanupRows(
			prisma,
			originalEmail,
			existing.tenantId,
			existing.userId,
			[attackerEmail],
		);
	}
});

test.after(async () => {
	await prisma.$disconnect();
});

let migrated = false;

function ensureMigrated(): void {
	if (migrated) {
		return;
	}

	const result = spawnSync("pnpm", ["db:migrate"], {
		cwd: process.cwd(),
		encoding: "utf8",
		env: { ...process.env, DATABASE_URL: databaseUrl },
	});

	assert.equal(
		result.status,
		0,
		`pnpm db:migrate failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
	);
	migrated = true;
}

async function cleanupRows(
	prismaClient: PrismaClient,
	email: string,
	tenantId: string | undefined,
	userId: string | undefined,
	extraEmails: string[] = [],
): Promise<void> {
	const emails = [email, ...extraEmails];
	await prismaClient.oAuthIdentity.deleteMany({ where: { email: { in: emails } } });

	if (tenantId) {
		await dropTenantSchema(tenantId, prismaClient).catch(() => undefined);
		await prismaClient.session.deleteMany({ where: { tenantId } });
		await prismaClient.tenantMembership.deleteMany({ where: { tenantId } });
		await prismaClient.tenant.deleteMany({ where: { id: tenantId } });
	}

	if (userId) {
		await prismaClient.user.deleteMany({ where: { id: userId } });
	}
	await prismaClient.user.deleteMany({ where: { email: { in: emails } } });
}

function mockOAuthFetch(input: {
	email: string;
	emailVerified: boolean;
	subject: string;
}): () => void {
	const previousFetch = globalThis.fetch;

	globalThis.fetch = (async (url) => {
		const target = String(url);
		if (target === "https://oauth2.googleapis.com/token") {
			return new Response(
				JSON.stringify({
					access_token: "access-token",
					id_token: jwtWithPayload({
						email: input.email,
						email_verified: input.emailVerified,
						iss: "https://accounts.google.com",
						sub: input.subject,
					}),
				}),
				{ status: 200 },
			);
		}

		if (target === "https://openidconnect.googleapis.com/v1/userinfo") {
			return new Response(
				JSON.stringify({
					email: input.email,
					email_verified: input.emailVerified,
					sub: input.subject,
				}),
				{ status: 200 },
			);
		}

		return new Response("not found", { status: 404 });
	}) as typeof fetch;

	return () => {
		globalThis.fetch = previousFetch;
	};
}

function cookieValue(response: Response, name: string): string | null {
	const setCookie = response.headers.get("set-cookie") ?? "";
	const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const match = setCookie.match(new RegExp(`(?:^|,\\s*)${escaped}=([^;]*)`));
	return match?.[1] ?? null;
}

function setEnv(values: Record<string, string>): () => void {
	const previous = new Map<string, string | undefined>();
	for (const [name, value] of Object.entries(values)) {
		previous.set(name, process.env[name]);
		process.env[name] = value;
	}

	return () => {
		for (const [name, value] of previous) {
			if (value === undefined) {
				delete process.env[name];
			} else {
				process.env[name] = value;
			}
		}
	};
}

function jwtWithPayload(payload: Record<string, unknown>): string {
	return [
		Buffer.from(JSON.stringify({ alg: "none" }), "utf8").toString("base64url"),
		Buffer.from(JSON.stringify(payload), "utf8").toString("base64url"),
		"",
	].join(".");
}

function moduleUrl(relativePath: string): string {
	return pathToFileURL(`${process.cwd()}/${relativePath}`).href;
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}
