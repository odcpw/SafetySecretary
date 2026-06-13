import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
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

if (!databaseUrl) {
	test("session security integration", {
		skip: "DATABASE_URL is required",
	}, () => {});
} else {
	const { NextRequest } = (await import(
		"next/server.js"
	)) as typeof import("next/server");
	const companyRoute = (await import(
		moduleUrl("src/app/api/auth/company/route.ts")
	)) as typeof import("../../../src/app/api/auth/company/route");
	const { CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } = (await import(
		moduleUrl("src/lib/auth/cookies.ts")
	)) as typeof import("../../../src/lib/auth/cookies");
	const { PrismaSessionStore, issueSession, validateSession } = (await import(
		moduleUrl("src/lib/auth/session.ts")
	)) as typeof import("../../../src/lib/auth/session");
	const { removeMember } = (await import(
		moduleUrl("src/lib/auth/membership.ts")
	)) as typeof import("../../../src/lib/auth/membership");
	const { dropTenantSchema, prisma, tenantDatabaseNames } = (await import(
		moduleUrl("src/lib/db/index.ts")
	)) as typeof import("../../../src/lib/db");
	const sessionStore = new PrismaSessionStore(prisma as PrismaClient);

	test("valid session cookies are rechecked against shared.sessions on every request", async () => {
		ensureMigrated();
		const tenant = await seedTenant("db-recheck", 1);
		const user = tenant.users[0];
		assert.ok(user);

		try {
			const firstRequest = await validateSession(user.sessionId, {
				now: new Date(Date.now() + 1_000),
				store: sessionStore,
			});
			assert.equal(firstRequest?.id, user.sessionId);
			assert.equal(firstRequest?.tenantId, tenant.tenantId);

			const deleted = await prisma.session.deleteMany({
				where: { id: user.sessionId },
			});
			assert.equal(deleted.count, 1);

			const secondRequest = await validateSession(user.sessionId, {
				now: new Date(Date.now() + 2_000),
				store: sessionStore,
			});
			assert.equal(secondRequest, null);

			const csrfToken = "ssfw-op1-recheck-csrf";
			const response = await companyRoute.DELETE(
				companyDeleteRequest(user.sessionId, csrfToken),
			);
			assert.equal(response.status, 401);
			assert.equal(await tenantCount(tenant.tenantId), 1);
			assert.equal(await sessionCount(tenant.tenantId), 0);
			console.log(
				`DB inspection session every-request validation: first_valid=${Boolean(
					firstRequest,
				)}; after_session_delete=${secondRequest}; route_status=${
					response.status
				}; sessions=${await sessionCount(tenant.tenantId)}`,
			);
		} finally {
			await cleanupTenant(tenant);
		}
	});

	test("member removal immediately invalidates the removed user's active session", async () => {
		ensureMigrated();
		const tenant = await seedTenant("member-removal", 2);
		const [actor, target] = tenant.users;
		assert.ok(actor);
		assert.ok(target);

		try {
			assert.equal(
				(
					await validateSession(target.sessionId, {
						now: new Date(Date.now() + 1_000),
						store: sessionStore,
					})
				)?.userId,
				target.id,
			);

			const result = await removeMember(tenant.tenantId, target.id, actor.id);
			assert.deepEqual(result, {
				deletedMemberships: 1,
				deletedSessions: 1,
				status: "removed",
			});
			assert.equal(await membershipCount(tenant.tenantId), 1);
			assert.equal(await sessionCountForUser(tenant.tenantId, target.id), 0);
			assert.equal(
				await validateSession(target.sessionId, {
					now: new Date(Date.now() + 2_000),
					store: sessionStore,
				}),
				null,
			);
			assert.equal(
				(
					await validateSession(actor.sessionId, {
						now: new Date(Date.now() + 2_000),
						store: sessionStore,
					})
				)?.userId,
				actor.id,
			);
			console.log(
				`DB inspection session invalidation on member removal: status=${
					result.status
				}; deleted_sessions=${result.deletedSessions}; target_sessions=${await sessionCountForUser(
					tenant.tenantId,
					target.id,
				)}; actor_sessions=${await sessionCountForUser(
					tenant.tenantId,
					actor.id,
				)}`,
			);
		} finally {
			await cleanupTenant(tenant);
		}
	});

	test("concurrent removals serialize at the last-user guard and preserve one live session", async () => {
		ensureMigrated();
		const tenant = await seedTenant("for-update-guard", 2);
		const [firstUser, secondUser] = tenant.users;
		assert.ok(firstUser);
		assert.ok(secondUser);

		try {
			let releaseLock = () => {};
			let resolveLocked = () => {};
			const locked = new Promise<void>((resolve) => {
				resolveLocked = resolve;
			});
			const release = new Promise<void>((resolve) => {
				releaseLock = resolve;
			});
			const lockHolder = prisma.$transaction(async (tx) => {
				await tx.$queryRaw`
					SELECT id
					FROM shared.tenant_memberships
					WHERE tenant_id = ${tenant.tenantId}::uuid
					FOR UPDATE
				`;
				resolveLocked();
				await release;
			});
			await locked;

			const pendingRemovals = Promise.all([
				removeMember(tenant.tenantId, secondUser.id, firstUser.id),
				removeMember(tenant.tenantId, firstUser.id, secondUser.id),
			]);

			await delay(50);
			releaseLock();
			const [results] = await Promise.all([pendingRemovals, lockHolder]);
			const statuses = results.map((result) => result.status).sort();
			const remainingMemberships = await prisma.tenantMembership.findMany({
				select: { userId: true },
				where: { tenantId: tenant.tenantId },
			});
			const survivor = tenant.users.find(
				(user) => user.id === remainingMemberships[0]?.userId,
			);
			const removedUser = tenant.users.find(
				(user) => user.id !== remainingMemberships[0]?.userId,
			);

			assert.deepEqual(statuses, ["last_member", "removed"]);
			assert.equal(remainingMemberships.length, 1);
			assert.equal(await sessionCount(tenant.tenantId), 1);
			assert.ok(survivor);
			assert.ok(removedUser);
			assert.equal(
				(
					await validateSession(survivor.sessionId, {
						now: new Date(Date.now() + 1_000),
						store: sessionStore,
					})
				)?.userId,
				survivor.id,
			);
			assert.equal(
				await validateSession(removedUser.sessionId, {
					now: new Date(Date.now() + 1_000),
					store: sessionStore,
				}),
				null,
			);
			console.log(
				`DB inspection last-user guard serialization: statuses=${statuses.join(
					",",
				)}; memberships=${remainingMemberships.length}; sessions=${await sessionCount(
					tenant.tenantId,
				)}; survivor=${survivor.id}`,
			);
		} finally {
			await cleanupTenant(tenant);
		}
	});

	test("sole-member removal is blocked until explicit company deletion removes session state", async () => {
		ensureMigrated();
		const tenant = await seedTenant("company-delete", 1);
		const user = tenant.users[0];
		assert.ok(user);
		await provisionEmptyTenantSchema(tenant.tenantId);

		try {
			assert.equal(await schemaExists(tenant.tenantId), true);

			const blocked = await removeMember(tenant.tenantId, user.id, user.id);
			assert.deepEqual(blocked, {
				deletedMemberships: 0,
				deletedSessions: 0,
				status: "last_member",
			});
			assert.ok(
				await validateSession(user.sessionId, {
					now: new Date(Date.now() + 1_000),
					store: sessionStore,
				}),
			);

			const csrfToken = "ssfw-op1-company-delete-csrf";
			const response = await companyRoute.DELETE(
				companyDeleteRequest(user.sessionId, csrfToken),
			);
			assert.equal(response.status, 200);
			assert.deepEqual(await response.json(), {
				deletedMemberships: 1,
				deletedSessions: 1,
				deletedTenants: 1,
				status: "deleted",
			});
			assert.equal(await schemaExists(tenant.tenantId), false);
			assert.equal(await membershipCount(tenant.tenantId), 0);
			assert.equal(await sessionCount(tenant.tenantId), 0);
			assert.equal(await tenantCount(tenant.tenantId), 0);
			assert.equal(
				await validateSession(user.sessionId, {
					now: new Date(Date.now() + 2_000),
					store: sessionStore,
				}),
				null,
			);
			console.log(
				`DB inspection company deletion session boundary: blocked_status=${
					blocked.status
				}; schema_exists=${await schemaExists(
					tenant.tenantId,
				)}; memberships=${await membershipCount(
					tenant.tenantId,
				)}; sessions=${await sessionCount(tenant.tenantId)}`,
			);
		} finally {
			await cleanupTenant(tenant);
		}
	});

	test.after(async () => {
		await prisma.$disconnect();
	});

	async function seedTenant(
		label: string,
		userCount: number,
	): Promise<SeededTenant> {
		const tenant = await prisma.tenant.create({
			data: {
				defaultLanguage: "en",
				name: `ssfw-op1-${label}-${randomUUID()}`,
			},
			select: { id: true },
		});
		const users = await Promise.all(
			Array.from({ length: userCount }, async (_, index) =>
				prisma.user.create({
					data: {
						email: `ssfw-op1-${label}-${index}-${randomUUID()}@example.invalid`,
						uiLocale: "en",
					},
					select: { id: true },
				}),
			),
		);

		await prisma.tenantMembership.createMany({
			data: users.map((user) => ({
				tenantId: tenant.id,
				userId: user.id,
			})),
		});

		const issuedSessions = await Promise.all(
			users.map((user) =>
				issueSession(user.id, tenant.id, "desktop", {
					now: new Date(),
					store: sessionStore,
				}),
			),
		);

		return {
			tenantId: tenant.id,
			users: users.map((user, index) => {
				const issued = issuedSessions[index];
				assert.ok(issued);
				return {
					id: user.id,
					sessionId: issued.cookieValue,
				};
			}),
		};
	}

	async function cleanupTenant(input: SeededTenant): Promise<void> {
		await dropTenantSchema(input.tenantId, prisma).catch(() => undefined);
		await prisma.session.deleteMany({ where: { tenantId: input.tenantId } });
		await prisma.tenantMembership.deleteMany({
			where: { tenantId: input.tenantId },
		});
		await prisma.tenant.deleteMany({ where: { id: input.tenantId } });
		await prisma.user.deleteMany({
			where: { id: { in: input.users.map((user) => user.id) } },
		});
	}

	function companyDeleteRequest(
		sessionId: string,
		csrfToken: string,
	): InstanceType<typeof NextRequest> {
		return new NextRequest("https://app.example.test/api/auth/company", {
			body: JSON.stringify({ confirmation: "DELETE" }),
			headers: {
				cookie: `${SESSION_COOKIE_NAME}=${sessionId}; ${CSRF_COOKIE_NAME}=${csrfToken}`,
				"content-type": "application/json",
				"x-ssfw-csrf": csrfToken,
			},
			method: "DELETE",
		});
	}

	async function provisionEmptyTenantSchema(tenantId: string): Promise<void> {
		const names = tenantDatabaseNames(tenantId);
		await prisma.$executeRawUnsafe(
			`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ${sqlString(
				names.roleName,
			)}) THEN EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION', ${sqlString(
				names.roleName,
			)}); END IF; END $$`,
		);
		await prisma.$executeRawUnsafe(
			`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(
				names.schemaName,
			)} AUTHORIZATION ${quoteIdent(names.roleName)}`,
		);
		await prisma.$executeRawUnsafe(
			`ALTER SCHEMA ${quoteIdent(names.schemaName)} OWNER TO ${quoteIdent(
				names.roleName,
			)}`,
		);
	}

	async function schemaExists(tenantId: string): Promise<boolean> {
		const names = tenantDatabaseNames(tenantId);
		const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
			SELECT EXISTS (
				SELECT 1
				FROM pg_catalog.pg_namespace
				WHERE nspname = ${names.schemaName}
			) AS "exists"
		`;

		return rows[0]?.exists ?? false;
	}

	async function membershipCount(tenantId: string): Promise<number> {
		return prisma.tenantMembership.count({ where: { tenantId } });
	}

	async function sessionCount(tenantId: string): Promise<number> {
		return prisma.session.count({ where: { tenantId } });
	}

	async function sessionCountForUser(
		tenantId: string,
		userId: string,
	): Promise<number> {
		return prisma.session.count({ where: { tenantId, userId } });
	}

	async function tenantCount(tenantId: string): Promise<number> {
		return prisma.tenant.count({ where: { id: tenantId } });
	}
}

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

type SeededTenant = {
	tenantId: string;
	users: Array<{
		id: string;
		sessionId: string;
	}>;
};

function moduleUrl(relativePath: string): string {
	return pathToFileURL(`${process.cwd()}/${relativePath}`).href;
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith(".") || specifier.startsWith("/");
}

function quoteIdent(value: string): string {
	return `"${String(value).replaceAll('"', '""')}"`;
}

function sqlString(value: string): string {
	return `'${String(value).replaceAll("'", "''")}'`;
}
