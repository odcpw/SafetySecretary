import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (context.parentURL?.endsWith("/src/app/api/auth/company/route.ts")) {
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
						return globalThis.__ssfwCompanyDeleteSession ?? null;
					}
				`);
			}

			if (specifier.endsWith("/lib/auth/membership")) {
				return dataModuleUrl(`
					export async function hasActiveTenantMembership() {
						return globalThis.__ssfwCompanyHasMembership ?? true;
					}
				`);
			}

			if (specifier.endsWith("/lib/db")) {
				return dataModuleUrl(`
					export async function dropTenantSchema(tenantId, client) {
						globalThis.__ssfwCompanyDropCalls ??= [];
						globalThis.__ssfwCompanyOperationCalls ??= [];
						globalThis.__ssfwCompanyDropCalls.push([tenantId, client ? "transaction" : "standalone"]);
						globalThis.__ssfwCompanyOperationCalls.push(["drop", tenantId, client ? "transaction" : "standalone"]);
						return { tenantId };
					}
					export const prisma = {
						async $transaction(fn) {
							return fn({
								async $queryRaw() {
									return globalThis.__ssfwCompanyLockedMemberships ?? [
										{ userId: "33333333-3333-4333-8333-333333333333" },
										{ userId: "99999999-9999-4999-8999-999999999999" },
									];
								},
								session: {
									async deleteMany(args) {
										globalThis.__ssfwCompanyDeleteCalls ??= [];
										globalThis.__ssfwCompanyOperationCalls ??= [];
										globalThis.__ssfwCompanyDeleteCalls.push(["sessions", args]);
										globalThis.__ssfwCompanyOperationCalls.push(["sessions", args]);
										return { count: globalThis.__ssfwCompanyDeletedSessionsCount ?? 3 };
									},
								},
								tenantMembership: {
									async deleteMany(args) {
										globalThis.__ssfwCompanyDeleteCalls ??= [];
										globalThis.__ssfwCompanyOperationCalls ??= [];
										globalThis.__ssfwCompanyDeleteCalls.push(["memberships", args]);
										globalThis.__ssfwCompanyOperationCalls.push(["memberships", args]);
										return { count: globalThis.__ssfwCompanyDeletedMembershipsCount ?? 2 };
									},
								},
								tenant: {
									async deleteMany(args) {
										globalThis.__ssfwCompanyDeleteCalls ??= [];
										globalThis.__ssfwCompanyOperationCalls ??= [];
										globalThis.__ssfwCompanyDeleteCalls.push(["tenant", args]);
										globalThis.__ssfwCompanyOperationCalls.push(["tenant", args]);
										return { count: 1 };
									},
								},
							});
						},
					};
				`);
			}
		}

		if (context.parentURL && isLocalImport(specifier)) {
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
		}

		return nextResolve(specifier, context);
	},
});

const { NextRequest } = (await import(
	"next/server.js"
)) as typeof import("next/server");
const { mintCsrfToken } = (await import(
	pathToFileURL(`${process.cwd()}/src/lib/auth/csrf.ts`).href
)) as typeof import("../../../src/lib/auth/csrf");
const { DELETE: deleteCompany } = (await import(
	moduleUrl("src/app/api/auth/company/route.ts")
)) as typeof import("../../../src/app/api/auth/company/route");

const SESSION_ID = "44444444-4444-4444-8444-444444444444";

const csrfCookieName = "ssfw_csrf";
const testGlobalState = globalThis as typeof globalThis & {
	__ssfwCompanyDeleteCalls?: unknown[];
	__ssfwCompanyHasMembership?: boolean;
	__ssfwCompanyDeleteSession?: {
		id: string;
		tenantId: string;
		userId: string;
	} | null;
	__ssfwCompanyDropCalls?: unknown[];
	__ssfwCompanyLockedMemberships?: Array<{ userId: string }>;
	__ssfwCompanyDeletedMembershipsCount?: number;
	__ssfwCompanyDeletedSessionsCount?: number;
	__ssfwCompanyOperationCalls?: unknown[];
};

test("company DELETE requires explicit confirmation before tenant deletion", async () => {
	setCompanyDeleteState();
	const csrfValue = mintCsrfToken(SESSION_ID);

	const response = await deleteCompany(
		request("/api/auth/company", {
			body: { confirmation: "WRONG" },
			headers: {
				cookie: `${csrfCookieName}=${csrfValue}`,
				"x-ssfw-csrf": csrfValue,
			},
			method: "DELETE",
		}),
	);

	assert.equal(response.status, 400);
	assert.deepEqual(testGlobalState.__ssfwCompanyDropCalls, []);
	assert.deepEqual(testGlobalState.__ssfwCompanyDeleteCalls, []);
});

test("company DELETE requires the actor to remain a tenant member", async () => {
	setCompanyDeleteState();
	testGlobalState.__ssfwCompanyHasMembership = false;
	const csrfValue = mintCsrfToken(SESSION_ID);

	const response = await deleteCompany(
		request("/api/auth/company", {
			body: { confirmation: "DELETE" },
			headers: {
				cookie: `${csrfCookieName}=${csrfValue}`,
				"x-ssfw-csrf": csrfValue,
			},
			method: "DELETE",
		}),
	);

	assert.equal(response.status, 403);
	assert.deepEqual(await response.json(), {
		code: "TENANT_MEMBERSHIP_REQUIRED",
	});
	assert.deepEqual(testGlobalState.__ssfwCompanyDropCalls, []);
	assert.deepEqual(testGlobalState.__ssfwCompanyDeleteCalls, []);
});

test("company DELETE requires the actor to be the last tenant member", async () => {
	setCompanyDeleteState();
	const csrfValue = mintCsrfToken(SESSION_ID);

	const response = await deleteCompany(
		request("/api/auth/company", {
			body: { confirmation: "DELETE" },
			headers: {
				cookie: `${csrfCookieName}=${csrfValue}`,
				"x-ssfw-csrf": csrfValue,
			},
			method: "DELETE",
		}),
	);

	assert.equal(response.status, 409);
	assert.deepEqual(await response.json(), {
		code: "COMPANY_DELETE_REQUIRES_LAST_MEMBER",
	});
	assert.deepEqual(testGlobalState.__ssfwCompanyDropCalls, []);
	assert.deepEqual(testGlobalState.__ssfwCompanyDeleteCalls, []);
});

test("company DELETE drops tenant schema after deleting sole-member workspace rows", async () => {
	setCompanyDeleteState();
	testGlobalState.__ssfwCompanyLockedMemberships = [
		{ userId: "33333333-3333-4333-8333-333333333333" },
	];
	testGlobalState.__ssfwCompanyDeletedMembershipsCount = 1;
	testGlobalState.__ssfwCompanyDeletedSessionsCount = 1;
	const csrfValue = mintCsrfToken(SESSION_ID);

	const response = await deleteCompany(
		request("/api/auth/company", {
			body: { confirmation: "DELETE" },
			headers: {
				cookie: `${csrfCookieName}=${csrfValue}`,
				"x-ssfw-csrf": csrfValue,
			},
			method: "DELETE",
		}),
	);

	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), {
		deletedMemberships: 1,
		deletedSessions: 1,
		deletedTenants: 1,
		status: "deleted",
	});
	assert.deepEqual(testGlobalState.__ssfwCompanyDropCalls, [
		["22222222-2222-4222-8222-222222222222", "standalone"],
	]);
	assert.deepEqual(testGlobalState.__ssfwCompanyDeleteCalls, [
		[
			"sessions",
			{ where: { tenantId: "22222222-2222-4222-8222-222222222222" } },
		],
		[
			"memberships",
			{ where: { tenantId: "22222222-2222-4222-8222-222222222222" } },
		],
		["tenant", { where: { id: "22222222-2222-4222-8222-222222222222" } }],
	]);
	assert.deepEqual(testGlobalState.__ssfwCompanyOperationCalls, [
		[
			"sessions",
			{ where: { tenantId: "22222222-2222-4222-8222-222222222222" } },
		],
		[
			"memberships",
			{ where: { tenantId: "22222222-2222-4222-8222-222222222222" } },
		],
		["tenant", { where: { id: "22222222-2222-4222-8222-222222222222" } }],
		["drop", "22222222-2222-4222-8222-222222222222", "standalone"],
	]);
});

function setCompanyDeleteState(): void {
	testGlobalState.__ssfwCompanyDeleteCalls = [];
	testGlobalState.__ssfwCompanyDropCalls = [];
	testGlobalState.__ssfwCompanyLockedMemberships = undefined;
	testGlobalState.__ssfwCompanyDeletedMembershipsCount = undefined;
	testGlobalState.__ssfwCompanyDeletedSessionsCount = undefined;
	testGlobalState.__ssfwCompanyOperationCalls = [];
	testGlobalState.__ssfwCompanyHasMembership = true;
	testGlobalState.__ssfwCompanyDeleteSession = {
		id: SESSION_ID,
		tenantId: "22222222-2222-4222-8222-222222222222",
		userId: "33333333-3333-4333-8333-333333333333",
	};
}

function request(
	pathname: string,
	init: {
		body?: Record<string, unknown>;
		headers?: Record<string, string>;
		method?: string;
	} = {},
): InstanceType<typeof NextRequest> {
	return new NextRequest(`https://app.example.test${pathname}`, {
		body: init.body ? JSON.stringify(init.body) : undefined,
		headers: {
			"content-type": "application/json",
			...(init.headers ?? {}),
		},
		method: init.method ?? "GET",
	});
}

function dataModuleUrl(source: string) {
	return {
		shortCircuit: true,
		url: `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`,
	};
}

function moduleUrl(relativePath: string): string {
	return pathToFileURL(`${process.cwd()}/${relativePath}`).href;
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith(".") || specifier.startsWith("/");
}
