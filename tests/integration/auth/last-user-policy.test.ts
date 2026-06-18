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
	test("last-user policy integration", {
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
	const { LAST_MEMBER_MESSAGE, removeMember } = (await import(
		moduleUrl("src/lib/auth/membership.ts")
	)) as typeof import("../../../src/lib/auth/membership");
	const { prisma, dropTenantSchema, tenantDatabaseNames } = (await import(
		moduleUrl("src/lib/db/index.ts")
	)) as typeof import("../../../src/lib/db");
	const { mintCsrfToken } = (await import(
		moduleUrl("src/lib/auth/csrf.ts")
	)) as typeof import("../../../src/lib/auth/csrf");

	test("sole-member removal is blocked and keeps the tenant membership", async () => {
		ensureMigrated();
		const tenant = await seedTenant("sole", 1);

		try {
			const result = await removeMember(
				tenant.tenantId,
				tenant.users[0].id,
				tenant.users[0].id,
			);

			assert.deepEqual(result, {
				deletedMemberships: 0,
				deletedSessions: 0,
				status: "last_member",
			});
			assert.equal(await membershipCount(tenant.tenantId), 1);
			assert.equal(await sessionCount(tenant.tenantId), 1);
			assert.equal(
				LAST_MEMBER_MESSAGE,
				"Cannot remove the last member. Delete the company workspace instead.",
			);
			console.log(
				`DB inspection last-user sole-member: memberships=${await membershipCount(
					tenant.tenantId,
				)}; sessions=${await sessionCount(tenant.tenantId)}`,
			);
		} finally {
			await cleanupTenant(tenant);
		}
	});

	test("concurrent two-member removals serialize to one removed and one last-member result", async () => {
		ensureMigrated();
		const tenant = await seedTenant("concurrent", 2);
		const [firstUser, secondUser] = tenant.users;

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

			assert.deepEqual(statuses, ["last_member", "removed"]);
			assert.equal(await membershipCount(tenant.tenantId), 1);
			assert.equal(await sessionCount(tenant.tenantId), 1);
			console.log(
				`DB inspection last-user concurrent: statuses=${statuses.join(
					",",
				)}; memberships=${await membershipCount(
					tenant.tenantId,
				)}; sessions=${await sessionCount(tenant.tenantId)}`,
			);
		} finally {
			await cleanupTenant(tenant);
		}
	});

	test("company deletion drops tenant schema and deletes shared sessions and memberships", async () => {
		ensureMigrated();
		const tenant = await seedTenant("delete", 2);
		await provisionEmptyTenantSchema(tenant.tenantId);
		const requestSession = tenant.sessions[0].id;
		const csrfToken = mintCsrfToken(requestSession);

		try {
			assert.equal(await schemaExists(tenant.tenantId), true);

			const response = await companyRoute.DELETE(
				new NextRequest("https://app.example.test/api/auth/company", {
					body: JSON.stringify({ confirmation: "DELETE" }),
					headers: {
						cookie: `${SESSION_COOKIE_NAME}=${requestSession}; ${CSRF_COOKIE_NAME}=${csrfToken}`,
						"content-type": "application/json",
						"x-ssfw-csrf": csrfToken,
					},
					method: "DELETE",
				}),
			);

			assert.equal(response.status, 200);
			assert.deepEqual(await response.json(), {
				deletedMemberships: 2,
				deletedSessions: 2,
				deletedTenants: 1,
				status: "deleted",
			});
			assert.equal(await schemaExists(tenant.tenantId), false);
			assert.equal(await membershipCount(tenant.tenantId), 0);
			assert.equal(await sessionCount(tenant.tenantId), 0);
			assert.equal(await tenantCount(tenant.tenantId), 0);
			console.log(
				`DB inspection company deletion: schema_exists=${await schemaExists(
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
				name: `ssfw-9lf-${label}-${randomUUID()}`,
			},
		});
		const users = await Promise.all(
			Array.from({ length: userCount }, async (_, index) =>
				prisma.user.create({
					data: {
						email: `ssfw-9lf-${label}-${index}-${randomUUID()}@example.invalid`,
						uiLocale: "en",
					},
				}),
			),
		);

		await prisma.tenantMembership.createMany({
			data: users.map((user) => ({
				tenantId: tenant.id,
				userId: user.id,
			})),
		});
		const sessions = await Promise.all(
			users.map((user) =>
				prisma.session.create({
					data: {
						deviceHint: "desktop",
						expiresAt: new Date(Date.now() + 60 * 60 * 1000),
						lastSeenAt: new Date(),
						tenantId: tenant.id,
						userId: user.id,
					},
				}),
			),
		);

		return {
			sessions: sessions.map((session) => ({ id: session.id })),
			tenantId: tenant.id,
			users: users.map((user) => ({ id: user.id })),
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

	async function membershipCount(tenantId: string): Promise<number> {
		return prisma.tenantMembership.count({ where: { tenantId } });
	}

	async function sessionCount(tenantId: string): Promise<number> {
		return prisma.session.count({ where: { tenantId } });
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
	sessions: Array<{ id: string }>;
	tenantId: string;
	users: Array<{ id: string }>;
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
