import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

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
			new URL(`${specifier}.json`, context.parentURL),
			new URL(`${specifier}/index.ts`, context.parentURL),
		];
		const resolved = candidates.find((candidate) => existsSync(candidate));

		if (resolved) {
			return { shortCircuit: true, url: resolved.href };
		}

		return nextResolve(specifier, context);
	},
});

const databaseUrl = process.env.DATABASE_URL;

const { NextRequest } = (await import(
	"next/server.js"
)) as typeof import("next/server");
const incidentRoute = (await import(
	moduleUrl("src/app/api/incidents/[id]/route.ts")
)) as typeof import("../../../src/app/api/incidents/[id]/route");
const { prisma, dropTenantSchema, withTenantConnection } = (await import(
	moduleUrl("src/lib/db/index.ts")
)) as typeof import("../../../src/lib/db");

const csrfToken = randomUUID();

test.after(async () => {
	await prisma.$disconnect();
});

if (!databaseUrl) {
	test("II delete integration", { skip: "DATABASE_URL is required" }, () => {});
} else {
	test("DELETE soft-deletes a case, hides it from the register, tenant-scoped", async () => {
		const tenantA = await seedTenant("delete-a");
		const tenantB = await seedTenant("delete-b");
		const caseId = randomUUID();

		try {
			await insertIncidentCase({
				caseId,
				tenantId: tenantA.tenantId,
				userId: tenantA.userId,
			});

			// The case starts visible in the register and not soft-deleted.
			assert.equal(await deletedAtOf(tenantA.tenantId, caseId), null);
			assert.equal(await appearsInRegister(tenantA.tenantId, caseId), true);

			// Missing CSRF header is rejected before any write.
			const noCsrf = await deleteCase(tenantA, caseId, { csrf: false });
			await assertStatus(noCsrf, 403);
			assert.equal(await deletedAtOf(tenantA.tenantId, caseId), null);

			// Cross-tenant delete cannot see or mutate the case.
			const crossTenant = await deleteCase(tenantB, caseId, { csrf: true });
			await assertStatus(crossTenant, 404);
			assert.equal(await deletedAtOf(tenantA.tenantId, caseId), null);

			// (a) the route returns ok.
			const deleted = await deleteCase(tenantA, caseId, { csrf: true });
			await assertStatus(deleted, 200);
			assert.equal(record(await deleted.json()).ok, true);

			// (b) deleted_at is set.
			const deletedAt = await deletedAtOf(tenantA.tenantId, caseId);
			assert.ok(deletedAt, "deleted_at must be stamped");

			// (c) it no longer appears in the register list query.
			assert.equal(await appearsInRegister(tenantA.tenantId, caseId), false);

			// Deleting an already-deleted case is a no-op 404.
			const again = await deleteCase(tenantA, caseId, { csrf: true });
			await assertStatus(again, 404);
		} finally {
			await cleanupTenant(tenantB);
			await cleanupTenant(tenantA);
		}
	});

	async function deleteCase(
		tenant: { tenantId: string; userId: string },
		caseId: string,
		options: { csrf: boolean },
	): Promise<Response> {
		const headers: Record<string, string> = {
			accept: "application/json",
			"x-ssfw-tenant-id": tenant.tenantId,
			"x-ssfw-user-id": tenant.userId,
		};

		if (options.csrf) {
			headers["x-ssfw-csrf"] = csrfToken;
		}

		const request = new NextRequest(
			`https://app.example.test/api/incidents/${caseId}`,
			{ headers, method: "DELETE" },
		);

		if (options.csrf) {
			request.cookies.set("ssfw_csrf", csrfToken);
		}

		return incidentRoute.DELETE(request, { params: { id: caseId } });
	}

	async function deletedAtOf(
		tenantId: string,
		caseId: string,
	): Promise<Date | null> {
		return withTenantConnection(tenantId, async (tx) => {
			const rows = await tx.$queryRaw<Array<{ deletedAt: Date | null }>>`
				SELECT deleted_at AS "deletedAt"
				FROM incident_case
				WHERE id = ${caseId}::uuid
				LIMIT 1
			`;
			assert.ok(rows[0], "case row must still exist after soft delete");
			return rows[0].deletedAt;
		});
	}

	async function appearsInRegister(
		tenantId: string,
		caseId: string,
	): Promise<boolean> {
		return withTenantConnection(tenantId, async (tx) => {
			// Mirrors the register list query: WHERE deleted_at IS NULL.
			const rows = await tx.$queryRaw<Array<{ id: string }>>`
				SELECT id::text AS id
				FROM incident_case
				WHERE deleted_at IS NULL
				ORDER BY updated_at DESC, created_at DESC, title ASC
			`;
			return rows.some((row) => row.id === caseId);
		});
	}

	async function seedTenant(label: string): Promise<{
		tenantId: string;
		userId: string;
	}> {
		const tenant = await prisma.tenant.create({
			data: {
				defaultLanguage: "en",
				name: `ssfw-delete-${label}-${randomUUID()}`,
			},
		});
		const user = await prisma.user.create({
			data: {
				email: `ssfw-delete-${label}-${randomUUID()}@example.invalid`,
				uiLocale: "en",
			},
		});
		await prisma.tenantMembership.create({
			data: { tenantId: tenant.id, userId: user.id },
		});
		await provisionIncidentSchema(tenant.id);
		return { tenantId: tenant.id, userId: user.id };
	}

	async function provisionIncidentSchema(tenantId: string): Promise<void> {
		const { role, schema } = names(tenantId);
		await prisma.$executeRawUnsafe(
			`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ${sqlString(
				role,
			)}) THEN EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION', ${sqlString(
				role,
			)}); END IF; END $$`,
		);
		await prisma.$executeRawUnsafe(`GRANT ${quoteIdent(role)} TO CURRENT_USER`);
		await prisma.$executeRawUnsafe(
			`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)} AUTHORIZATION ${quoteIdent(
				role,
			)}`,
		);
		await prisma.$executeRawUnsafe(
			`ALTER SCHEMA ${quoteIdent(schema)} OWNER TO ${quoteIdent(role)}`,
		);
		await prisma.$executeRawUnsafe(
			`GRANT USAGE ON SCHEMA ${quoteIdent(schema)} TO ${quoteIdent(role)}`,
		);
		await prisma.$executeRawUnsafe(
			`GRANT USAGE ON SCHEMA "shared" TO ${quoteIdent(role)}`,
		);
		await prisma.$executeRawUnsafe(
			`SELECT shared.apply_incident_case_schema(${sqlString(schema)}::name)`,
		);
		await prisma.$executeRawUnsafe(
			`SELECT shared.apply_incident_workflow_stage_schema(${sqlString(
				schema,
			)}::name)`,
		);
		await prisma.$executeRawUnsafe(
			`SELECT shared.apply_incident_soft_delete_schema(${sqlString(schema)}::name)`,
		);
	}

	async function insertIncidentCase(input: {
		caseId: string;
		tenantId: string;
		userId: string;
	}): Promise<void> {
		const schema = quoteIdent(names(input.tenantId).schema);

		await prisma.$executeRawUnsafe(
			`INSERT INTO ${schema}.incident_case (
				id,
				title,
				incident_at,
				incident_type,
				coordinator_role,
				content_language,
				workflow_stage,
				created_by
			) VALUES (
				${sqlString(input.caseId)}::uuid,
				'II delete test',
				'2026-05-05T06:45:00Z'::timestamptz,
				'NEAR_MISS',
				'Safety lead',
				'en',
				'CAPTURE',
				${sqlString(input.userId)}::uuid
			)`,
		);
	}

	async function cleanupTenant(input: {
		tenantId: string;
		userId: string;
	}): Promise<void> {
		await dropTenantSchema(input.tenantId).catch(() => undefined);
		await prisma.tenantMembership.deleteMany({
			where: { tenantId: input.tenantId },
		});
		await prisma.session.deleteMany({ where: { tenantId: input.tenantId } });
		await prisma.tenant.deleteMany({ where: { id: input.tenantId } });
		await prisma.user.deleteMany({ where: { id: input.userId } });
	}
}

function record(value: unknown): Record<string, unknown> {
	assert.ok(value && typeof value === "object" && !Array.isArray(value));
	return value as Record<string, unknown>;
}

async function assertStatus(
	response: Response,
	expected: number,
): Promise<void> {
	if (response.status !== expected) {
		assert.equal(response.status, expected, await response.text());
	}
}

function names(tenantId: string): { role: string; schema: string } {
	const suffix = tenantId.toLowerCase().replaceAll("-", "_");
	return { role: `role_tenant_${suffix}`, schema: `tenant_${suffix}` };
}

function quoteIdent(value: string): string {
	return `"${String(value).replaceAll('"', '""')}"`;
}

function sqlString(value: string): string {
	return `'${String(value).replaceAll("'", "''")}'`;
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith(".") || specifier.startsWith("/");
}

function moduleUrl(relativePath: string): string {
	return pathToFileURL(`${process.cwd()}/${relativePath}`).href;
}
