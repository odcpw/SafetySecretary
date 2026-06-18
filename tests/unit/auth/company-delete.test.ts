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

			if (specifier.endsWith("/lib/db")) {
				return dataModuleUrl(`
					export async function dropTenantSchema(tenantId, client) {
						globalThis.__ssfwCompanyDropCalls ??= [];
						globalThis.__ssfwCompanyDropCalls.push([tenantId, client ? "transaction" : "standalone"]);
						return { tenantId };
					}
					export const prisma = {
						async $transaction(fn) {
							return fn({
								session: {
									async deleteMany(args) {
										globalThis.__ssfwCompanyDeleteCalls ??= [];
										globalThis.__ssfwCompanyDeleteCalls.push(["sessions", args]);
										return { count: 3 };
									},
								},
								tenantMembership: {
									async deleteMany(args) {
										globalThis.__ssfwCompanyDeleteCalls ??= [];
										globalThis.__ssfwCompanyDeleteCalls.push(["memberships", args]);
										return { count: 2 };
									},
								},
								tenant: {
									async deleteMany(args) {
										globalThis.__ssfwCompanyDeleteCalls ??= [];
										globalThis.__ssfwCompanyDeleteCalls.push(["tenant", args]);
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
	__ssfwCompanyDeleteSession?: {
		id: string;
		tenantId: string;
		userId: string;
	} | null;
	__ssfwCompanyDropCalls?: unknown[];
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

test("company DELETE drops tenant schema and deletes sessions, memberships, and tenant", async () => {
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

	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), {
		deletedMemberships: 2,
		deletedSessions: 3,
		deletedTenants: 1,
		status: "deleted",
	});
	assert.deepEqual(testGlobalState.__ssfwCompanyDropCalls, [
		["22222222-2222-4222-8222-222222222222", "transaction"],
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
});

function setCompanyDeleteState(): void {
	testGlobalState.__ssfwCompanyDeleteCalls = [];
	testGlobalState.__ssfwCompanyDropCalls = [];
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
