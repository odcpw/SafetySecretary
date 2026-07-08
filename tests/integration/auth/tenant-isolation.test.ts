import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import type { Prisma, PrismaClient } from "@prisma/client";

registerHooks({
	resolve(specifier, context, nextResolve) {
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
	test("tenant isolation integration", {
		skip: "DATABASE_URL is required",
	}, () => {});
} else {
	const { dropTenantSchema, prisma, tenantDatabaseNames, withTenantConnection } =
		(await import(
			moduleUrl("src/lib/db/index.ts")
		)) as typeof import("../../../src/lib/db");

	test("tenant schemas and scoped query paths enforce SET ROLE and search_path", async () => {
		ensureMigrated();
		const tenantA = await seedTenant("a");
		const tenantB = await seedTenant("b");
		const scopeLog: ScopeSnapshot[] = [];

		try {
			const namesA = tenantDatabaseNames(tenantA.tenantId);
			const namesB = tenantDatabaseNames(tenantB.tenantId);
			assert.notEqual(namesA.schemaName, namesB.schemaName);
			assert.notEqual(namesA.roleName, namesB.roleName);
			assert.equal(await schemaExists(tenantA.tenantId), true);
			assert.equal(await schemaExists(tenantB.tenantId), true);
			assert.equal(await tenantTableExists(tenantA.tenantId, "incident_case"), true);
			assert.equal(await tenantTableExists(tenantB.tenantId, "incident_case"), true);

			await insertIncidentCaseScoped(tenantA, {
				caseId: tenantA.caseId,
				scopeLog,
				title: "Tenant A incident",
			});
			await insertIncidentCaseScoped(tenantB, {
				caseId: tenantB.caseId,
				scopeLog,
				title: "Tenant B incident",
			});

			assert.deepEqual(await readIncidentTitlesScoped(tenantA.tenantId, scopeLog), [
				"Tenant A incident",
			]);
			assert.deepEqual(await readIncidentTitlesScoped(tenantB.tenantId, scopeLog), [
				"Tenant B incident",
			]);
			assert.equal(
				await readIncidentTitleScoped(tenantA.tenantId, tenantB.caseId, scopeLog),
				null,
			);
			assert.equal(
				await readIncidentTitleScoped(tenantB.tenantId, tenantA.caseId, scopeLog),
				null,
			);

			assert.ok(scopeLog.length >= 6);
			for (const scope of scopeLog) {
				const names = tenantDatabaseNames(scope.tenantId);
				assert.equal(scope.currentUser, names.roleName);
				assert.equal(scope.currentSchema, names.schemaName);
				assert.match(scope.searchPath, new RegExp(`\\b${names.schemaName}\\b`));
			}
			console.log(
				`DB inspection tenant isolation schemas: tenant_a_schema=${namesA.schemaName}; tenant_b_schema=${namesB.schemaName}; scoped_query_checks=${scopeLog.length}`,
			);
		} finally {
			await cleanupTenant(tenantB);
			await cleanupTenant(tenantA);
		}
	});

	test("tenant A cannot read or write tenant B data through scoped paths", async () => {
		ensureMigrated();
		const tenantA = await seedTenant("scoped-a");
		const tenantB = await seedTenant("scoped-b");
		const scopeLog: ScopeSnapshot[] = [];

		try {
			await insertIncidentCaseScoped(tenantA, {
				caseId: tenantA.caseId,
				scopeLog,
				title: "Original A",
			});
			await insertIncidentCaseScoped(tenantB, {
				caseId: tenantB.caseId,
				scopeLog,
				title: "Original B",
			});

			const crossTenantUpdateCount = await updateIncidentTitleScoped(
				tenantA.tenantId,
				tenantB.caseId,
				"Attempted cross-tenant update",
				scopeLog,
			);
			assert.equal(crossTenantUpdateCount, 0);
			assert.equal(
				await readIncidentTitleScoped(tenantB.tenantId, tenantB.caseId, scopeLog),
				"Original B",
			);

			const ownTenantUpdateCount = await updateIncidentTitleScoped(
				tenantA.tenantId,
				tenantA.caseId,
				"Updated A",
				scopeLog,
			);
			assert.equal(ownTenantUpdateCount, 1);
			assert.equal(
				await readIncidentTitleScoped(tenantA.tenantId, tenantA.caseId, scopeLog),
				"Updated A",
			);

			await assert.rejects(
				() => insertIntoOtherTenantSchemaAsRole(tenantA, tenantB),
				isPrivilegeError,
			);
			assert.equal(
				await readIncidentTitleScoped(tenantB.tenantId, tenantB.caseId, scopeLog),
				"Original B",
			);
			console.log(
				`DB inspection tenant isolation scoped paths: cross_update_rows=${crossTenantUpdateCount}; own_update_rows=${ownTenantUpdateCount}; tenant_b_title=${await readIncidentTitleScoped(
					tenantB.tenantId,
					tenantB.caseId,
					scopeLog,
				)}`,
			);
		} finally {
			await cleanupTenant(tenantB);
			await cleanupTenant(tenantA);
		}
	});

	test("tenant role cannot use or inspect another tenant schema", async () => {
		ensureMigrated();
		const tenantA = await seedTenant("role-a");
		const tenantB = await seedTenant("role-b");
		const scopeLog: ScopeSnapshot[] = [];

		try {
			await insertIncidentCaseScoped(tenantA, {
				caseId: tenantA.caseId,
				scopeLog,
				title: "Role A case",
			});
			await insertIncidentCaseScoped(tenantB, {
				caseId: tenantB.caseId,
				scopeLog,
				title: "Role B case",
			});

			const privileges = await roleVisibilitySnapshot(tenantA, tenantB);
			assert.equal(privileges.currentUser, tenantDatabaseNames(tenantA.tenantId).roleName);
			assert.equal(privileges.currentSchema, tenantDatabaseNames(tenantA.tenantId).schemaName);
			assert.equal(privileges.canUseOwnSchema, true);
			assert.equal(privileges.canUseOtherSchema, false);
			assert.equal(privileges.canSelectOtherTable, false);

			await assert.rejects(
				() => readOtherTenantSchemaAsRole(tenantA, tenantB),
				isPrivilegeError,
			);
			await assert.rejects(
				() => updateOtherTenantSchemaAsRole(tenantA, tenantB),
				isPrivilegeError,
			);
			assert.equal(
				await readIncidentTitleScoped(tenantB.tenantId, tenantB.caseId, scopeLog),
				"Role B case",
			);
			console.log(
				`DB inspection tenant role boundary: current_user=${privileges.currentUser}; own_schema=${privileges.currentSchema}; can_use_other_schema=${privileges.canUseOtherSchema}; can_select_other_table=${privileges.canSelectOtherTable}`,
			);
		} finally {
			await cleanupTenant(tenantB);
			await cleanupTenant(tenantA);
		}
	});

	test.after(async () => {
		await prisma.$disconnect();
	});

	async function seedTenant(label: string): Promise<SeededTenant> {
		const suffix = randomUUID();
		const tenant = await prisma.tenant.create({
			data: {
				defaultLanguage: "en",
				name: `ssfw-v6l-${label}-${suffix}`,
			},
			select: { id: true },
		});
		const user = await prisma.user.create({
			data: {
				email: `ssfw-v6l-${label}-${suffix}@example.invalid`,
				uiLocale: "en",
			},
			select: { id: true },
		});
		await prisma.tenantMembership.create({
			data: {
				tenantId: tenant.id,
				userId: user.id,
			},
		});
		await provisionIncidentSchema(tenant.id);

		return {
			caseId: randomUUID(),
			tenantId: tenant.id,
			userId: user.id,
		};
	}

	async function provisionIncidentSchema(tenantId: string): Promise<void> {
		const names = tenantDatabaseNames(tenantId);
		await prisma.$executeRawUnsafe(
			`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ${sqlString(
				names.roleName,
			)}) THEN EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION', ${sqlString(
				names.roleName,
			)}); END IF; END $$`,
		);
		await prisma.$executeRawUnsafe(
			`GRANT ${quoteIdent(names.roleName)} TO CURRENT_USER`,
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
		await prisma.$executeRawUnsafe(
			`GRANT USAGE ON SCHEMA ${quoteIdent(names.schemaName)} TO ${quoteIdent(
				names.roleName,
			)}`,
		);
		await prisma.$executeRawUnsafe(
			`GRANT USAGE ON SCHEMA "shared" TO ${quoteIdent(names.roleName)}`,
		);
		await prisma.$executeRawUnsafe(
			`SELECT shared.apply_incident_case_schema(${sqlString(
				names.schemaName,
			)}::name)`,
		);
		await prisma.$executeRawUnsafe(
			`SELECT shared.apply_incident_soft_delete_schema(${sqlString(
				names.schemaName,
			)}::name)`,
		);
	}

	async function cleanupTenant(input: SeededTenant): Promise<void> {
		await dropTenantSchema(input.tenantId, prisma).catch(() => undefined);
		await prisma.tenantMembership.deleteMany({
			where: { tenantId: input.tenantId },
		});
		await prisma.session.deleteMany({ where: { tenantId: input.tenantId } });
		await prisma.tenant.deleteMany({ where: { id: input.tenantId } });
		await prisma.user.deleteMany({ where: { id: input.userId } });
	}

	async function insertIncidentCaseScoped(
		tenant: SeededTenant,
		input: {
			caseId: string;
			scopeLog: ScopeSnapshot[];
			title: string;
		},
	): Promise<void> {
		await withVerifiedTenantConnection(tenant.tenantId, input.scopeLog, async (tx) => {
			await tx.$executeRaw`
				INSERT INTO incident_case (
					id,
					title,
					incident_at,
					incident_type,
					coordinator_role,
					content_language,
					created_by
				) VALUES (
					${input.caseId}::uuid,
					${input.title},
					'2026-05-05T09:00:00Z'::timestamptz,
					'NEAR_MISS',
					'Safety lead',
					'en',
					${tenant.userId}::uuid
				)
			`;
		});
	}

	async function readIncidentTitlesScoped(
		tenantId: string,
		scopeLog: ScopeSnapshot[],
	): Promise<string[]> {
		return withVerifiedTenantConnection(tenantId, scopeLog, async (tx) => {
			const rows = await tx.$queryRaw<Array<{ title: string }>>`
				SELECT title
				FROM incident_case
				ORDER BY title ASC
			`;
			return rows.map((row) => row.title);
		});
	}

	async function readIncidentTitleScoped(
		tenantId: string,
		caseId: string,
		scopeLog: ScopeSnapshot[],
	): Promise<string | null> {
		return withVerifiedTenantConnection(tenantId, scopeLog, async (tx) => {
			const rows = await tx.$queryRaw<Array<{ title: string }>>`
				SELECT title
				FROM incident_case
				WHERE id = ${caseId}::uuid
			`;
			return rows[0]?.title ?? null;
		});
	}

	async function updateIncidentTitleScoped(
		tenantId: string,
		caseId: string,
		title: string,
		scopeLog: ScopeSnapshot[],
	): Promise<number> {
		return withVerifiedTenantConnection(tenantId, scopeLog, async (tx) => {
			const rows = await tx.$queryRaw<Array<{ id: string }>>`
				UPDATE incident_case
				SET title = ${title}, updated_at = CURRENT_TIMESTAMP
				WHERE id = ${caseId}::uuid
				RETURNING id::text AS id
			`;
			return rows.length;
		});
	}

	async function withVerifiedTenantConnection<T>(
		tenantId: string,
		scopeLog: ScopeSnapshot[],
		fn: (tx: Prisma.TransactionClient) => Promise<T>,
	): Promise<T> {
		return withTenantConnection(tenantId, async (tx) => {
			const names = tenantDatabaseNames(tenantId);
			const [scope] = await tx.$queryRaw<ScopeSnapshot[]>`
				SELECT
					${tenantId}::text AS "tenantId",
					current_user::text AS "currentUser",
					current_schema()::text AS "currentSchema",
					current_setting('search_path')::text AS "searchPath"
			`;
			assert.ok(scope);
			assert.equal(scope.currentUser, names.roleName);
			assert.equal(scope.currentSchema, names.schemaName);
			assert.match(scope.searchPath, new RegExp(`\\b${names.schemaName}\\b`));
			scopeLog.push(scope);
			return fn(tx);
		});
	}

	async function roleVisibilitySnapshot(
		actor: SeededTenant,
		other: SeededTenant,
	): Promise<RoleVisibilitySnapshot> {
		const actorNames = tenantDatabaseNames(actor.tenantId);
		const otherNames = tenantDatabaseNames(other.tenantId);

		return prisma.$transaction(async (tx) => {
			await tx.$executeRawUnsafe(`SET LOCAL ROLE ${quoteIdent(actorNames.roleName)}`);
			await tx.$executeRawUnsafe(
				`SET LOCAL search_path = ${quoteIdent(actorNames.schemaName)}, shared`,
			);
			const [snapshot] = await tx.$queryRaw<RoleVisibilitySnapshot[]>`
				SELECT
					current_user::text AS "currentUser",
					current_schema()::text AS "currentSchema",
					has_schema_privilege(current_user, ${actorNames.schemaName}, 'USAGE') AS "canUseOwnSchema",
					has_schema_privilege(current_user, ${otherNames.schemaName}, 'USAGE') AS "canUseOtherSchema",
					CASE
						WHEN has_schema_privilege(current_user, ${otherNames.schemaName}, 'USAGE')
						THEN has_table_privilege(current_user, ${`${otherNames.schemaName}.incident_case`}, 'SELECT')
						ELSE false
					END AS "canSelectOtherTable"
			`;
			assert.ok(snapshot);
			return snapshot;
		});
	}

	async function readOtherTenantSchemaAsRole(
		actor: SeededTenant,
		other: SeededTenant,
	): Promise<void> {
		const actorNames = tenantDatabaseNames(actor.tenantId);
		const otherNames = tenantDatabaseNames(other.tenantId);

		await prisma.$transaction(async (tx) => {
			await tx.$executeRawUnsafe(`SET LOCAL ROLE ${quoteIdent(actorNames.roleName)}`);
			await tx.$executeRawUnsafe(
				`SET LOCAL search_path = ${quoteIdent(actorNames.schemaName)}, shared`,
			);
			await tx.$queryRawUnsafe(
				`SELECT title FROM ${quoteIdent(otherNames.schemaName)}.incident_case`,
			);
		});
	}

	async function updateOtherTenantSchemaAsRole(
		actor: SeededTenant,
		other: SeededTenant,
	): Promise<void> {
		const actorNames = tenantDatabaseNames(actor.tenantId);
		const otherNames = tenantDatabaseNames(other.tenantId);

		await prisma.$transaction(async (tx) => {
			await tx.$executeRawUnsafe(`SET LOCAL ROLE ${quoteIdent(actorNames.roleName)}`);
			await tx.$executeRawUnsafe(
				`SET LOCAL search_path = ${quoteIdent(actorNames.schemaName)}, shared`,
			);
			await tx.$executeRawUnsafe(
				`UPDATE ${quoteIdent(
					otherNames.schemaName,
				)}.incident_case SET title = 'Forbidden update'`,
			);
		});
	}

	async function insertIntoOtherTenantSchemaAsRole(
		actor: SeededTenant,
		other: SeededTenant,
	): Promise<void> {
		const actorNames = tenantDatabaseNames(actor.tenantId);
		const otherNames = tenantDatabaseNames(other.tenantId);

		await prisma.$transaction(async (tx) => {
			await tx.$executeRawUnsafe(`SET LOCAL ROLE ${quoteIdent(actorNames.roleName)}`);
			await tx.$executeRawUnsafe(
				`SET LOCAL search_path = ${quoteIdent(actorNames.schemaName)}, shared`,
			);
			await tx.$executeRawUnsafe(
				`INSERT INTO ${quoteIdent(otherNames.schemaName)}.incident_case (
					id,
					title,
					incident_at,
					incident_type,
					coordinator_role,
					content_language,
					created_by
				) VALUES (
					${sqlString(randomUUID())}::uuid,
					'Forbidden insert',
					'2026-05-05T09:30:00Z'::timestamptz,
					'NEAR_MISS',
					'Safety lead',
					'en',
					${sqlString(actor.userId)}::uuid
				)`,
			);
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

	async function tenantTableExists(
		tenantId: string,
		tableName: string,
	): Promise<boolean> {
		const names = tenantDatabaseNames(tenantId);
		const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
			SELECT EXISTS (
				SELECT 1
				FROM pg_catalog.pg_class class
				JOIN pg_catalog.pg_namespace namespace
					ON namespace.oid = class.relnamespace
				WHERE namespace.nspname = ${names.schemaName}
					AND class.relname = ${tableName}
					AND class.relkind = 'r'
			) AS "exists"
		`;
		return rows[0]?.exists ?? false;
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
	caseId: string;
	tenantId: string;
	userId: string;
};

type ScopeSnapshot = {
	tenantId: string;
	currentUser: string;
	currentSchema: string;
	searchPath: string;
};

type RoleVisibilitySnapshot = {
	currentUser: string;
	currentSchema: string;
	canUseOwnSchema: boolean;
	canUseOtherSchema: boolean;
	canSelectOtherTable: boolean;
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

function isPrivilegeError(error: unknown): boolean {
	return (
		error instanceof Error &&
		/(permission denied|must be owner|does not exist|42501|3F000)/i.test(
			error.message,
		)
	);
}
