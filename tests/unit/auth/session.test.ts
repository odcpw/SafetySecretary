import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import type { NextRequest as NextRequestType } from "next/server";
import type {
	CreateSessionInput,
	ExtendSessionInput,
	SessionRow,
	SessionStore,
} from "../../../src/lib/auth/session";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (
			context.parentURL?.includes("/src/app/api/auth/members/") &&
			context.parentURL.endsWith("/route.ts")
		) {
			if (specifier === "next/server") {
				return nextResolve("next/server.js", context);
			}

			if (specifier.endsWith("/lib/auth/cookies")) {
				return dataModuleUrl(`
					export const CSRF_COOKIE_NAME = "ssfw_csrf";
					export const SESSION_COOKIE_NAME = "ssfw_session";
				`);
			}

			if (specifier.endsWith("/lib/auth/session")) {
				return dataModuleUrl(`
					export async function validateSession() {
						return globalThis.__ssfwTestRouteSession ?? null;
					}
				`);
			}

			if (specifier.endsWith("/lib/auth/membership")) {
				return dataModuleUrl(`
					export const LAST_MEMBER_MESSAGE = "Cannot remove the last member. Delete the company workspace instead.";
					export async function removeMember(tenantId, targetUserId, actorUserId) {
						globalThis.__ssfwTestRemoveMemberCalls ??= [];
						globalThis.__ssfwTestRemoveMemberCalls.push({
							actorUserId,
							targetUserId,
							tenantId,
						});
						return globalThis.__ssfwTestRemoveMemberResult;
					}
				`);
			}
		}

		if (
			specifier === "./lib/auth/cookies" &&
			context.parentURL?.endsWith("/src/proxy.ts")
		) {
			return localModuleUrl("src/lib/auth/cookies.ts");
		}

		if (
			specifier === "./lib/auth/session" &&
			context.parentURL?.endsWith("/src/proxy.ts")
		) {
			return localModuleUrl("src/lib/auth/session.ts");
		}

		if (
			specifier === "./lib/legal/disclaimer" &&
			context.parentURL?.endsWith("/src/proxy.ts")
		) {
			return localModuleUrl("src/lib/legal/disclaimer.ts");
		}

		if (
			specifier === "./session" &&
			context.parentURL?.endsWith("/src/lib/auth/cookies.ts")
		) {
			return localModuleUrl("src/lib/auth/session.ts");
		}

		if (context.parentURL && specifier.startsWith(".")) {
			const candidates = [
				new URL(`${specifier}.ts`, context.parentURL),
				new URL(`${specifier}.tsx`, context.parentURL),
				new URL(`${specifier}.json`, context.parentURL),
				new URL(`${specifier}/index.ts`, context.parentURL),
			];
			const resolved = candidates.find((candidate) => existsSync(candidate));

			if (resolved) {
				return {
					shortCircuit: true,
					url: resolved.href,
				};
			}
		}

		return nextResolve(specifier, context);
	},
});

const cookiesModulePath = pathToFileURL(
	path.resolve("src/lib/auth/cookies.ts"),
).href;
const sessionModulePath = pathToFileURL(
	path.resolve("src/lib/auth/session.ts"),
).href;
const proxyModulePath = pathToFileURL(path.resolve("src/proxy.ts")).href;
const memberRouteModulePath = pathToFileURL(
	path.resolve("src/app/api/auth/members/[memberId]/route.ts"),
).href;
const { NextRequest } = (await import(
	"next/server.js"
)) as typeof import("next/server");
type NextRequestInit = ConstructorParameters<typeof NextRequest>[1];
const { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME, buildSessionCookieOptions } =
	(await import(
		cookiesModulePath
	)) as typeof import("../../../src/lib/auth/cookies");
const {
	DESKTOP_SESSION_TTL_SECONDS,
	MOBILE_SESSION_TTL_SECONDS,
	PrismaSessionStore,
	SessionTenantMembershipError,
	extendSession,
	issueSession,
	validateSession,
} = (await import(
	sessionModulePath
)) as typeof import("../../../src/lib/auth/session");
const { authorizeRequest, hasValidCsrfToken, isPublicPath } = (await import(
	proxyModulePath
)) as typeof import("../../../src/proxy");
const { DELETE: deleteMember } = (await import(
	memberRouteModulePath
)) as typeof import("../../../src/app/api/auth/members/[memberId]/route");

type TestGlobalState = typeof globalThis & {
	__ssfwTestRemoveMemberCalls?: Array<{
		actorUserId: string;
		targetUserId: string;
		tenantId: string;
	}>;
	__ssfwTestRemoveMemberResult?: {
		deletedMemberships: number;
		deletedSessions: number;
		status:
			| "actor_not_member"
			| "last_member"
			| "removed"
			| "target_not_member";
	};
	__ssfwTestRouteSession?: {
		tenantId: string;
		userId: string;
	} | null;
};

const testGlobalState = globalThis as TestGlobalState;

function localModuleUrl(relativePath: string) {
	return {
		shortCircuit: true,
		url: pathToFileURL(path.resolve(relativePath)).href,
	};
}

function dataModuleUrl(source: string) {
	return {
		shortCircuit: true,
		url: `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`,
	};
}

class MemorySessionStore implements SessionStore {
	readonly rows = new Map<string, SessionRow>();
	readonly findCalls: string[] = [];
	readonly extendCalls: Array<{
		sessionId: string;
		input: ExtendSessionInput;
	}> = [];

	async createSession(input: CreateSessionInput): Promise<SessionRow> {
		const row = cloneSessionRow({
			id: randomUUID(),
			userId: input.userId,
			tenantId: input.tenantId,
			createdAt: input.lastSeenAt,
			expiresAt: input.expiresAt,
			lastSeenAt: input.lastSeenAt,
			deviceHint: input.deviceHint,
		});

		this.rows.set(row.id, row);
		return cloneSessionRow(row);
	}

	async findSessionById(sessionId: string): Promise<SessionRow | null> {
		this.findCalls.push(sessionId);
		const row = this.rows.get(sessionId);
		return row ? cloneSessionRow(row) : null;
	}

	async extendSession(
		sessionId: string,
		input: ExtendSessionInput,
	): Promise<SessionRow | null> {
		this.extendCalls.push({ sessionId, input });
		const row = this.rows.get(sessionId);
		if (!row) {
			return null;
		}

		const nextRow = cloneSessionRow({
			...row,
			expiresAt: input.expiresAt,
			lastSeenAt: input.lastSeenAt,
		});
		this.rows.set(sessionId, nextRow);
		return cloneSessionRow(nextRow);
	}

	deleteSession(sessionId: string): void {
		this.rows.delete(sessionId);
	}

	inspectRows(): Array<{
		id: string;
		userId: string;
		tenantId: string;
		expiresAt: string;
		lastSeenAt: string;
		deviceHint: string;
	}> {
		return [...this.rows.values()].map((row) => ({
			id: row.id,
			userId: row.userId,
			tenantId: row.tenantId,
			expiresAt: row.expiresAt.toISOString(),
			lastSeenAt: row.lastSeenAt.toISOString(),
			deviceHint: row.deviceHint,
		}));
	}
}

test("issueSession writes shared.sessions-shaped row and validateSession extends it", async () => {
	const store = new MemorySessionStore();
	const now = new Date("2026-04-30T08:00:00.000Z");
	const nextRequestAt = new Date(now.getTime() + 60_000);

	const issued = await issueSession("user-1", "tenant-a", "desktop", {
		store,
		now,
	});
	const inspectedRows = store.inspectRows();

	assert.equal(issued.cookieName, SESSION_COOKIE_NAME);
	assert.match(issued.cookieValue, /^[0-9a-f-]{36}$/);
	assert.equal(issued.maxAgeSeconds, DESKTOP_SESSION_TTL_SECONDS);
	assert.deepEqual(inspectedRows, [
		{
			id: issued.cookieValue,
			userId: "user-1",
			tenantId: "tenant-a",
			expiresAt: "2026-05-30T08:00:00.000Z",
			lastSeenAt: "2026-04-30T08:00:00.000Z",
			deviceHint: "desktop",
		},
	]);

	const validated = await validateSession(issued.cookieValue, {
		store,
		now: nextRequestAt,
	});

	assert.deepEqual(validated, {
		id: issued.cookieValue,
		userId: "user-1",
		tenantId: "tenant-a",
		expiresAt: new Date("2026-05-30T08:01:00.000Z"),
		lastSeenAt: nextRequestAt,
		deviceHint: "desktop",
	});
	assert.deepEqual(store.findCalls, [issued.cookieValue]);
	assert.equal(store.extendCalls.length, 1);
});

test("deleted session row is rejected immediately without a positive auth cache", async () => {
	const store = new MemorySessionStore();
	const now = new Date("2026-04-30T09:00:00.000Z");
	const issued = await issueSession("user-1", "tenant-a", "desktop", {
		store,
		now,
	});

	assert.ok(
		await validateSession(issued.cookieValue, {
			store,
			now: new Date(now.getTime() + 1),
		}),
	);

	store.deleteSession(issued.cookieValue);

	const revoked = await validateSession(issued.cookieValue, {
		store,
		now: new Date(now.getTime() + 50),
	});

	assert.equal(revoked, null);
	assert.deepEqual(store.findCalls, [issued.cookieValue, issued.cookieValue]);
});

test("expired sessions are rejected and never extended", async () => {
	const store = new MemorySessionStore();
	const issued = await issueSession("user-1", "tenant-a", "desktop", {
		store,
		now: new Date("2026-04-30T10:00:00.000Z"),
	});
	const row = store.rows.get(issued.cookieValue);
	assert.ok(row);
	store.rows.set(issued.cookieValue, {
		...row,
		expiresAt: new Date("2026-04-30T10:00:01.000Z"),
	});

	const result = await validateSession(issued.cookieValue, {
		store,
		now: new Date("2026-04-30T10:00:02.000Z"),
	});

	assert.equal(result, null);
	assert.equal(store.extendCalls.length, 0);
});

test("mobile and desktop TTLs are distinct and mobile lasts 90 days", async () => {
	const store = new MemorySessionStore();
	const now = new Date("2026-04-30T11:00:00.000Z");

	const desktop = await issueSession("user-1", "tenant-a", "desktop", {
		store,
		now,
	});
	const mobile = await issueSession("user-1", "tenant-a", "iPhone Mobile", {
		store,
		now,
	});

	assert.equal(desktop.maxAgeSeconds, 30 * 24 * 60 * 60);
	assert.equal(mobile.maxAgeSeconds, MOBILE_SESSION_TTL_SECONDS);
	assert.equal(mobile.expiresAt.toISOString(), "2026-07-29T11:00:00.000Z");
});

test("extendSession updates last_seen_at and expires_at without changing tenant_id", async () => {
	const store = new MemorySessionStore();
	const issued = await issueSession("user-1", "tenant-a", "desktop", {
		store,
		now: new Date("2026-04-30T12:00:00.000Z"),
	});

	const extended = await extendSession(issued.cookieValue, "mobile", {
		store,
		now: new Date("2026-05-01T12:00:00.000Z"),
	});
	const inspectedRows = store.inspectRows();

	assert.equal(extended?.tenantId, "tenant-a");
	assert.equal(inspectedRows[0].tenantId, "tenant-a");
	assert.equal(inspectedRows[0].expiresAt, "2026-07-30T12:00:00.000Z");
});

test("cookie options are HttpOnly Secure SameSite=Lax in production", () => {
	const originalNodeEnv = process.env.NODE_ENV;
	setOptionalEnv("NODE_ENV", "production");

	try {
		assert.deepEqual(buildSessionCookieOptions(60), {
			httpOnly: true,
			maxAge: 60,
			path: "/",
			sameSite: "lax",
			secure: true,
		});
	} finally {
		setOptionalEnv("NODE_ENV", originalNodeEnv);
	}
});

test("cookie options disable Secure in local non-production envs", () => {
	const originalNodeEnv = process.env.NODE_ENV;

	try {
		setOptionalEnv("NODE_ENV", "development");
		assert.equal(buildSessionCookieOptions(60).secure, false);

		setOptionalEnv("NODE_ENV", "test");
		assert.equal(buildSessionCookieOptions(60).secure, false);
	} finally {
		setOptionalEnv("NODE_ENV", originalNodeEnv);
	}
});

test("multi-tenant memberships create distinct sessions per tenant", async () => {
	const store = new MemorySessionStore();
	const now = new Date("2026-04-30T13:00:00.000Z");

	const tenantA = await issueSession("user-1", "tenant-a", "desktop", {
		store,
		now,
	});
	const tenantB = await issueSession("user-1", "tenant-b", "desktop", {
		store,
		now,
	});

	assert.notEqual(tenantA.cookieValue, tenantB.cookieValue);
	assert.equal(store.rows.size, 2);
	assert.equal(
		(
			await validateSession(tenantA.cookieValue, {
				store,
				now: new Date("2026-04-30T13:00:01.000Z"),
			})
		)?.tenantId,
		"tenant-a",
	);
	assert.equal(
		(
			await validateSession(tenantB.cookieValue, {
				store,
				now: new Date("2026-04-30T13:00:01.000Z"),
			})
		)?.tenantId,
		"tenant-b",
	);
});

test("PrismaSessionStore locks tenant membership before creating a session", async () => {
	const prisma = new MembershipLockPrisma([
		{ tenantId: "tenant-a", userId: "user-1" },
	]);
	const store = new PrismaSessionStore(prisma as never);

	const row = await store.createSession({
		userId: "user-1",
		tenantId: "tenant-a",
		expiresAt: new Date("2026-05-30T13:00:00.000Z"),
		lastSeenAt: new Date("2026-04-30T13:00:00.000Z"),
		deviceHint: "desktop",
	});

	assert.match(prisma.lockQuery, /FOR KEY SHARE/);
	assert.equal(prisma.createdSessions.length, 1);
	assert.equal(row.userId, "user-1");
	assert.equal(row.tenantId, "tenant-a");
});

test("PrismaSessionStore refuses session creation after membership removal", async () => {
	const prisma = new MembershipLockPrisma([]);
	const store = new PrismaSessionStore(prisma as never);

	await assert.rejects(
		() =>
			store.createSession({
				userId: "user-1",
				tenantId: "tenant-a",
				expiresAt: new Date("2026-05-30T13:00:00.000Z"),
				lastSeenAt: new Date("2026-04-30T13:00:00.000Z"),
				deviceHint: "desktop",
			}),
		SessionTenantMembershipError,
	);
	assert.match(prisma.lockQuery, /FOR KEY SHARE/);
	assert.equal(prisma.createdSessions.length, 0);
});

test("proxy exempts public paths before session validation", async () => {
	let validationCalls = 0;
	const response = await authorizeRequest(request("/signin"), async () => {
		validationCalls += 1;
		return null;
	});

	assert.equal(response.status, 200);
	assert.equal(validationCalls, 0);
	assert.equal(isPublicPath("/manifest.webmanifest"), true);
	assert.equal(isPublicPath("/icons/icon-192.png"), true);
});

test("proxy strips forged identity headers from public paths", async () => {
	let validationCalls = 0;
	const response = await authorizeRequest(
		request("/signin", {
			headers: {
				accept: "text/html",
				"x-ssfw-tenant-id": "22222222-2222-4222-8222-222222222222",
				"x-ssfw-user-id": "33333333-3333-4333-8333-333333333333",
			},
		}),
		async () => {
			validationCalls += 1;
			return null;
		},
	);

	assert.equal(response.status, 200);
	assert.equal(validationCalls, 0);
	assert.equal(response.headers.get("x-middleware-override-headers"), "accept");
	assert.equal(
		response.headers.get("x-middleware-request-accept"),
		"text/html",
	);
	assert.equal(
		response.headers.get("x-middleware-request-x-ssfw-user-id"),
		null,
	);
	assert.equal(
		response.headers.get("x-middleware-request-x-ssfw-tenant-id"),
		null,
	);
});

test("member-removal API is protected even though other auth APIs are public", async () => {
	const memberId = "11111111-1111-4111-8111-111111111111";

	assert.equal(isPublicPath("/api/auth/magic-link/request"), true);
	assert.equal(isPublicPath("/api/auth/oauth/microsoft/start"), true);
	assert.equal(isPublicPath("/api/auth/oauth/microsoft/callback"), true);
	assert.equal(isPublicPath("/api/auth/oauth/google/start"), true);
	assert.equal(isPublicPath("/api/auth/oauth/google/callback"), true);
	assert.equal(isPublicPath("/api/auth/oauth/google/profile"), false);
	assert.equal(isPublicPath(`/api/auth/members/${memberId}`), false);
});

test("proxy rejects forged-header member removal without a valid session", async () => {
	const memberId = "11111111-1111-4111-8111-111111111111";
	let validationCalls = 0;
	const response = await authorizeRequest(
		request(`/api/auth/members/${memberId}`, {
			method: "DELETE",
			headers: {
				"x-ssfw-tenant-id": "22222222-2222-4222-8222-222222222222",
				"x-ssfw-user-id": "33333333-3333-4333-8333-333333333333",
			},
		}),
		async () => {
			validationCalls += 1;
			return null;
		},
	);

	assert.equal(response.status, 401);
	assert.equal(validationCalls, 1);
});

test("proxy requires CSRF for authenticated member removal", async () => {
	const memberId = "11111111-1111-4111-8111-111111111111";
	const response = await authorizeRequest(
		request(`/api/auth/members/${memberId}`, {
			method: "DELETE",
			headers: { cookie: `${SESSION_COOKIE_NAME}=${randomUUID()}` },
		}),
		async () => validSession(),
	);

	assert.equal(response.status, 403);
});

test("member DELETE route rejects forged proxy headers without a real session", async () => {
	const memberId = "11111111-1111-4111-8111-111111111111";
	setMemberRouteTestState({ routeSession: null });

	const response = await deleteMember(
		request(`/api/auth/members/${memberId}`, {
			method: "DELETE",
			headers: {
				"x-ssfw-tenant-id": "22222222-2222-4222-8222-222222222222",
				"x-ssfw-user-id": "33333333-3333-4333-8333-333333333333",
			},
		}),
		{ params: { memberId } },
	);

	assert.equal(response.status, 401);
	assert.deepEqual(testGlobalState.__ssfwTestRemoveMemberCalls, []);
});

test("member DELETE route requires CSRF before removing an authenticated member", async () => {
	const memberId = "11111111-1111-4111-8111-111111111111";
	setMemberRouteTestState({ routeSession: validRouteSession() });

	const response = await deleteMember(
		request(`/api/auth/members/${memberId}`, { method: "DELETE" }),
		{ params: { memberId } },
	);

	assert.equal(response.status, 403);
	assert.deepEqual(testGlobalState.__ssfwTestRemoveMemberCalls, []);
});

test("member DELETE route maps successful removal and passes tenant-scoped ids", async () => {
	const memberId = "11111111-1111-4111-8111-AAAAAAAAAAAA";
	const csrfValue = "route-csrf-token";
	setMemberRouteTestState({
		removeMemberResult: {
			deletedMemberships: 1,
			deletedSessions: 2,
			status: "removed",
		},
		routeSession: validRouteSession(),
	});

	const response = await deleteMember(
		request(`/api/auth/members/${memberId}`, {
			method: "DELETE",
			headers: {
				cookie: `${CSRF_COOKIE_NAME}=${csrfValue}`,
				"x-ssfw-csrf": csrfValue,
			},
		}),
		{ params: { memberId } },
	);

	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), {
		deletedMemberships: 1,
		deletedSessions: 2,
		status: "removed",
	});
	assert.deepEqual(testGlobalState.__ssfwTestRemoveMemberCalls, [
		{
			actorUserId: "33333333-3333-4333-8333-333333333333",
			targetUserId: memberId.toLowerCase(),
			tenantId: "22222222-2222-4222-8222-222222222222",
		},
	]);
});

test("member DELETE route maps last-member removal to stable conflict code", async () => {
	const memberId = "11111111-1111-4111-8111-AAAAAAAAAAAA";
	const csrfValue = "route-csrf-token";
	setMemberRouteTestState({
		removeMemberResult: {
			deletedMemberships: 0,
			deletedSessions: 0,
			status: "last_member",
		},
		routeSession: validRouteSession(),
	});

	const response = await deleteMember(
		request(`/api/auth/members/${memberId}`, {
			method: "DELETE",
			headers: {
				cookie: `${CSRF_COOKIE_NAME}=${csrfValue}`,
				"x-ssfw-csrf": csrfValue,
			},
		}),
		{ params: { memberId } },
	);

	assert.equal(response.status, 409);
	assert.deepEqual(await response.json(), {
		code: "LAST_MEMBER",
		message:
			"Cannot remove the last member. Delete the company workspace instead.",
	});
});

test("proxy rejects authenticated state-changing requests without CSRF token", async () => {
	const response = await authorizeRequest(
		request("/workspace/actions", {
			method: "POST",
			headers: { cookie: `${SESSION_COOKIE_NAME}=${randomUUID()}` },
		}),
		async () => validSession(),
	);

	assert.equal(response.status, 403);
});

test("proxy accepts matching double-submit CSRF token for state-changing requests", async () => {
	const csrfValue = ["csrf", "value", "one"].join("-");
	const requestWithToken = request("/workspace/actions", {
		method: "POST",
		headers: {
			cookie: `${SESSION_COOKIE_NAME}=${randomUUID()}; ${CSRF_COOKIE_NAME}=${csrfValue}`,
			"x-ssfw-csrf": csrfValue,
		},
	});
	const response = await authorizeRequest(requestWithToken, async () =>
		validSession(),
	);

	assert.equal(hasValidCsrfToken(requestWithToken), true);
	assert.equal(response.status, 200);
});

test("proxy replaces forged identity headers with the validated session", async () => {
	const response = await authorizeRequest(
		request("/workspace", {
			headers: {
				cookie: `${SESSION_COOKIE_NAME}=${randomUUID()}`,
				"x-ssfw-tenant-id": "22222222-2222-4222-8222-222222222222",
				"x-ssfw-user-id": "33333333-3333-4333-8333-333333333333",
			},
		}),
		async () => validSession(),
	);

	assert.equal(response.status, 200);
	assert.equal(
		response.headers.get("x-middleware-request-x-ssfw-user-id"),
		"user-1",
	);
	assert.equal(
		response.headers.get("x-middleware-request-x-ssfw-tenant-id"),
		"tenant-a",
	);
});

test("proxy validates authenticated routes on every request", async () => {
	let validationCalls = 0;
	const validator = async () => {
		validationCalls += 1;
		return validSession();
	};

	await authorizeRequest(
		request("/workspace", {
			headers: { cookie: `${SESSION_COOKIE_NAME}=${randomUUID()}` },
		}),
		validator,
	);
	await authorizeRequest(
		request("/workspace", {
			headers: { cookie: `${SESSION_COOKIE_NAME}=${randomUUID()}` },
		}),
		validator,
	);

	assert.equal(validationCalls, 2);
});

test("proxy returns 401 for unauthenticated API requests", async () => {
	const response = await authorizeRequest(request("/api/workspace/actions"));

	assert.equal(response.status, 401);
});

function cloneSessionRow(row: SessionRow): SessionRow {
	return {
		...row,
		createdAt: new Date(row.createdAt),
		expiresAt: new Date(row.expiresAt),
		lastSeenAt: new Date(row.lastSeenAt),
	};
}

function request(
	pathname: string,
	init: NextRequestInit = {},
): NextRequestType {
	return new NextRequest(`https://app.example.test${pathname}`, init);
}

function validSession() {
	return {
		id: randomUUID(),
		userId: "user-1",
		tenantId: "tenant-a",
		expiresAt: new Date("2026-05-30T00:00:00.000Z"),
		lastSeenAt: new Date("2026-04-30T00:00:00.000Z"),
		deviceHint: "desktop" as const,
	};
}

function validRouteSession() {
	return {
		tenantId: "22222222-2222-4222-8222-222222222222",
		userId: "33333333-3333-4333-8333-333333333333",
	};
}

function setMemberRouteTestState(input: {
	removeMemberResult?: TestGlobalState["__ssfwTestRemoveMemberResult"];
	routeSession?: TestGlobalState["__ssfwTestRouteSession"];
}): void {
	testGlobalState.__ssfwTestRemoveMemberCalls = [];
	testGlobalState.__ssfwTestRemoveMemberResult = input.removeMemberResult ?? {
		deletedMemberships: 1,
		deletedSessions: 1,
		status: "removed",
	};
	testGlobalState.__ssfwTestRouteSession = input.routeSession ?? null;
}

class MembershipLockPrisma {
	private readonly memberships: Array<{ tenantId: string; userId: string }>;
	readonly createdSessions: Array<{
		data: {
			userId: string;
			tenantId: string;
			expiresAt: Date;
			lastSeenAt: Date;
			deviceHint: string;
		};
	}> = [];
	lockQuery = "";

	constructor(memberships: Array<{ tenantId: string; userId: string }>) {
		this.memberships = memberships;
	}

	async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
		return fn({
			$queryRaw: async (
				query: TemplateStringsArray,
				tenantId: string,
				userId: string,
			) => {
				this.lockQuery = query.join("?");
				return this.memberships
					.filter(
						(membership) =>
							membership.tenantId === tenantId && membership.userId === userId,
					)
					.map((_membership, index) => ({ id: `membership-${index + 1}` }));
			},
			session: {
				create: async ({
					data,
				}: {
					data: {
						userId: string;
						tenantId: string;
						expiresAt: Date;
						lastSeenAt: Date;
						deviceHint: string;
					};
				}) => {
					this.createdSessions.push({ data });
					return {
						id: `session-${this.createdSessions.length}`,
						userId: data.userId,
						tenantId: data.tenantId,
						createdAt: data.lastSeenAt,
						expiresAt: data.expiresAt,
						lastSeenAt: data.lastSeenAt,
						deviceHint: data.deviceHint,
					};
				},
			},
		});
	}
}

function setOptionalEnv(name: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[name];
	} else {
		process.env[name] = value;
	}
}
