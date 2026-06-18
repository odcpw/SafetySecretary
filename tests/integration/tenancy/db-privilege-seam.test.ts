import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

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

// F4-db-privilege-split: prove that the least-privilege application login role
// (db/sql/00440_tenant_db_roles.sql) cannot read across tenants — it may only
// reach tenant data by SET ROLE into a single tenant role, and never has direct
// DML on another tenant's schema. The test simulates the request-time role by
// SET ROLE into the app login role on the existing connection. Full enforcement
// in production additionally requires routing request traffic through that role
// and DDL through ADMIN_DATABASE_URL; see the fix notes.

const databaseUrl = process.env.DATABASE_URL;
// Default matches the role name created by db/sql/00440_tenant_db_roles.sql and
// the configuredAppLoginRole contract in src/lib/db/tenancy.ts.
const appLoginRole =
	process.env.SAFETY_SECRETARY_APP_LOGIN_ROLE?.trim() ||
	process.env.DATABASE_APP_LOGIN_ROLE?.trim() ||
	"safety_secretary_app";

if (!databaseUrl) {
	test("F4 db privilege seam requires DATABASE_URL", () => {
		assert.fail("DATABASE_URL is required for the F4 db-privilege seam test");
	});
} else {
	const {
		dropTenantSchema,
		prisma,
		provisionTenantSchema,
		tenantDatabaseNames,
		withTenantConnection,
	} = (await import(
		moduleUrl("src/lib/db/index.ts")
	)) as typeof import("../../../src/lib/db");

	test("F4: least-privilege app login role is denied cross-tenant reads", async (t) => {
		if (!(await appLoginRoleExists(prisma, appLoginRole))) {
			t.skip(
				`app login role "${appLoginRole}" is not provisioned in this DB; ` +
					"run db/sql/00440_tenant_db_roles.sql (and set " +
					"SAFETY_SECRETARY_APP_LOGIN_ROLE if you renamed it) to exercise " +
					"the least-privilege cross-tenant denial assertions.",
			);
			return;
		}

		const tenantA = await seedProvisionedTenant("f4-a");
		const tenantB = await seedProvisionedTenant("f4-b");

		try {
			const userB = tenantB.userId;
			const caseB = await insertIncidentCase(tenantB.tenantId, userB, "F4 B");

			const namesA = tenantDatabaseNames(tenantA.tenantId);
			const namesB = tenantDatabaseNames(tenantB.tenantId);

			// As the app login role, set role into tenant A then attempt to read
			// tenant B's schema directly — this must be denied.
			await assert.rejects(
				() =>
					readOtherTenantSchemaAsAppRole(
						appLoginRole,
						namesA,
						namesB.schemaName,
					),
				isPrivilegeError,
				"app role inside tenant A must not read tenant B's schema",
			);

			// As the app login role, attempting to read tenant B without first
			// entering tenant B's role must also be denied (no direct DML).
			await assert.rejects(
				() => readSchemaAsAppRoleWithoutTenantRole(appLoginRole, namesB),
				isPrivilegeError,
				"app role must not read a tenant schema without SET ROLE into it",
			);

			// Sanity: the legitimate scoped path still reads tenant B's own data.
			assert.equal(await readIncidentTitle(tenantB.tenantId, caseB), "F4 B");
		} finally {
			await cleanupTenant(tenantB);
			await cleanupTenant(tenantA);
		}
	});

	test.after(async () => {
		await prisma.$disconnect();
	});

	async function seedProvisionedTenant(
		label: string,
	): Promise<{ tenantId: string; userId: string; email: string }> {
		const suffix = randomUUID();
		const tenant = await prisma.tenant.create({
			data: {
				defaultLanguage: "en",
				name: `ssfw-f4-${label}-${suffix}`,
			},
			select: { id: true },
		});
		const user = await prisma.user.create({
			data: {
				email: `ssfw-f4-${label}-${suffix}@example.invalid`,
				uiLocale: "en",
			},
			select: { email: true, id: true },
		});
		await prisma.tenantMembership.create({
			data: { tenantId: tenant.id, userId: user.id },
		});
		// Provision with the app login role so the role is granted membership in
		// the tenant role (the only sanctioned way it reaches tenant data).
		await provisionTenantSchema(tenant.id, prisma, { appLoginRole });

		return { email: user.email, tenantId: tenant.id, userId: user.id };
	}

	async function cleanupTenant(input: {
		tenantId: string;
		userId: string;
		email: string;
	}): Promise<void> {
		await dropTenantSchema(input.tenantId, prisma).catch(() => undefined);
		await prisma.session.deleteMany({ where: { tenantId: input.tenantId } });
		await prisma.tenantMembership.deleteMany({
			where: { tenantId: input.tenantId },
		});
		await prisma.tenant.deleteMany({ where: { id: input.tenantId } });
		await prisma.user.deleteMany({ where: { id: input.userId } });
	}

	async function insertIncidentCase(
		tenantId: string,
		userId: string,
		title: string,
	): Promise<string> {
		const id = randomUUID();
		await withTenantConnection(tenantId, async (tx) => {
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
					${id}::uuid,
					${title},
					'2026-05-05T09:00:00Z'::timestamptz,
					'NEAR_MISS',
					'Safety lead',
					'en',
					${userId}::uuid
				)
			`;
		});
		return id;
	}

	async function readIncidentTitle(
		tenantId: string,
		caseId: string,
	): Promise<string | null> {
		return withTenantConnection(tenantId, async (tx) => {
			const rows = await tx.$queryRaw<Array<{ title: string }>>`
				SELECT title
				FROM incident_case
				WHERE id = ${caseId}::uuid
			`;
			return rows[0]?.title ?? null;
		});
	}

	async function readOtherTenantSchemaAsAppRole(
		appRole: string,
		tenantANames: { roleName: string; schemaName: string },
		otherSchemaName: string,
	): Promise<void> {
		await prisma.$transaction(async (tx) => {
			await tx.$executeRawUnsafe(`SET LOCAL ROLE ${quoteIdent(appRole)}`);
			await tx.$executeRawUnsafe(
				`SET LOCAL ROLE ${quoteIdent(tenantANames.roleName)}`,
			);
			await tx.$executeRawUnsafe(
				`SET LOCAL search_path = ${quoteIdent(tenantANames.schemaName)}, shared`,
			);
			await tx.$queryRawUnsafe(
				`SELECT title FROM ${quoteIdent(otherSchemaName)}.incident_case`,
			);
		});
	}

	async function readSchemaAsAppRoleWithoutTenantRole(
		appRole: string,
		names: { schemaName: string },
	): Promise<void> {
		await prisma.$transaction(async (tx) => {
			await tx.$executeRawUnsafe(`SET LOCAL ROLE ${quoteIdent(appRole)}`);
			await tx.$queryRawUnsafe(
				`SELECT title FROM ${quoteIdent(names.schemaName)}.incident_case`,
			);
		});
	}
}

async function appLoginRoleExists(
	prisma: import("@prisma/client").PrismaClient,
	roleName: string,
): Promise<boolean> {
	if (!/^[a-z_][a-z0-9_]{0,62}$/.test(roleName)) {
		return false;
	}
	const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
		SELECT EXISTS (
			SELECT 1
			FROM pg_catalog.pg_roles
			WHERE rolname = ${roleName}
		) AS "exists"
	`;
	return rows[0]?.exists ?? false;
}

function moduleUrl(relativePath: string): string {
	return pathToFileURL(`${process.cwd()}/${relativePath}`).href;
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith(".") || specifier.startsWith("/");
}

function quoteIdent(value: string): string {
	return `"${String(value).replaceAll('"', '""')}"`;
}

function isPrivilegeError(error: unknown): boolean {
	return (
		error instanceof Error && /(permission denied|42501)/i.test(error.message)
	);
}
