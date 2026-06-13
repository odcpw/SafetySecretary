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
const statusRoute = (await import(
	moduleUrl("src/app/api/incidents/[id]/status/route.ts")
)) as typeof import("../../../src/app/api/incidents/[id]/status/route");
const { prisma, dropTenantSchema, withTenantConnection } = (await import(
	moduleUrl("src/lib/db/index.ts")
)) as typeof import("../../../src/lib/db");

test.after(async () => {
	await prisma.$disconnect();
});

if (!databaseUrl) {
	test("II status integration", { skip: "DATABASE_URL is required" }, () => {});
} else {
	test("status route drives the capture→investigating→paused→closed lifecycle, tenant-scoped", async () => {
		const tenantA = await seedTenant("status-a");
		const tenantB = await seedTenant("status-b");
		const caseId = randomUUID();

		try {
			await insertIncidentCase({
				caseId,
				tenantId: tenantA.tenantId,
				userId: tenantA.userId,
			});

			// Freshly captured cases start in CAPTURE.
			assert.equal(await stageOf(tenantA.tenantId, caseId), "CAPTURE");

			const started = await postAction(tenantA, caseId, "start");
			await assertStatus(started, 200);
			assert.equal(
				record(record(await started.json()).incident).workflowStage,
				"INVESTIGATING",
			);
			assert.equal(await stageOf(tenantA.tenantId, caseId), "INVESTIGATING");

			const paused = await postAction(tenantA, caseId, "pause");
			await assertStatus(paused, 200);
			assert.equal(await stageOf(tenantA.tenantId, caseId), "PAUSED");

			const resumed = await postAction(tenantA, caseId, "resume");
			await assertStatus(resumed, 200);
			assert.equal(await stageOf(tenantA.tenantId, caseId), "INVESTIGATING");

			const closed = await postAction(tenantA, caseId, "close");
			await assertStatus(closed, 200);
			const closedBody = record(record(await closed.json()).incident);
			assert.equal(closedBody.workflowStage, "CLOSED");
			assert.equal(typeof closedBody.closedAt, "string");
			assert.equal(await stageOf(tenantA.tenantId, caseId), "CLOSED");

			// A closed case can be reopened back into the investigation.
			const reopened = await postAction(tenantA, caseId, "reopen");
			await assertStatus(reopened, 200);
			assert.equal(await stageOf(tenantA.tenantId, caseId), "INVESTIGATING");
			assert.equal(
				record(record(await reopened.json()).incident).closedAt,
				null,
				"reopening must clear closed_at",
			);

			// Invalid transition: cannot resume an active investigation.
			const invalid = await postAction(tenantA, caseId, "resume");
			await assertStatus(invalid, 409);
			assert.equal(
				record(await invalid.json()).code,
				"INVALID_WORKFLOW_TRANSITION",
			);
			assert.equal(
				await stageOf(tenantA.tenantId, caseId),
				"INVESTIGATING",
				"a rejected transition must leave the stage untouched",
			);

			// Unknown action is rejected before touching the DB.
			const unknown = await postAction(tenantA, caseId, "obliterate");
			await assertStatus(unknown, 400);
			assert.equal(
				record(await unknown.json()).code,
				"INVALID_WORKFLOW_ACTION",
			);

			// Cross-tenant access cannot see or mutate the case.
			const crossTenant = await postAction(tenantB, caseId, "pause");
			await assertStatus(crossTenant, 404);
			assert.equal(await stageOf(tenantA.tenantId, caseId), "INVESTIGATING");
		} finally {
			await cleanupTenant(tenantB);
			await cleanupTenant(tenantA);
		}
	});

	async function postAction(
		tenant: { tenantId: string; userId: string },
		caseId: string,
		action: string,
	): Promise<Response> {
		return statusRoute.POST(
			new NextRequest(
				`https://app.example.test/api/incidents/${caseId}/status`,
				{
					body: JSON.stringify({ action }),
					headers: {
						accept: "application/json",
						"content-type": "application/json",
						"x-ssfw-tenant-id": tenant.tenantId,
						"x-ssfw-user-id": tenant.userId,
					},
					method: "POST",
				},
			),
			{ params: { id: caseId } },
		);
	}

	async function stageOf(tenantId: string, caseId: string): Promise<string> {
		return withTenantConnection(tenantId, async (tx) => {
			const rows = await tx.$queryRaw<Array<{ workflowStage: string }>>`
				SELECT workflow_stage::text AS "workflowStage"
				FROM incident_case
				WHERE id = ${caseId}::uuid
				LIMIT 1
			`;
			assert.ok(rows[0], "case must exist");
			return rows[0].workflowStage;
		});
	}

	async function seedTenant(label: string): Promise<{
		tenantId: string;
		userId: string;
	}> {
		const tenant = await prisma.tenant.create({
			data: {
				defaultLanguage: "en",
				name: `ssfw-status-${label}-${randomUUID()}`,
			},
		});
		const user = await prisma.user.create({
			data: {
				email: `ssfw-status-${label}-${randomUUID()}@example.invalid`,
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
				'II status test',
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
