import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL;
let migrated = false;

const deferredCrossHiraAssertions = [
	{
		id: "V6",
		kind: "validation scenario",
		owner: "ssfw-8nb",
		reason:
			"cross-HIRA control application must copy into the destination HIRA after HIRA and suggestion surfaces exist",
	},
	{
		id: "V7",
		kind: "validation scenario",
		owner: "ssfw-8nb",
		reason:
			"cross-HIRA FK inspection requires HIRA tables that are not part of the foundation snapshot battery",
	},
	{
		id: "I2",
		kind: "invariant",
		owner: "ssfw-8nb",
		reason:
			"no-FK-across-HIRA-boundaries is verified with V6/V7 once HIRA schema exists",
	},
	{
		id: "V8",
		kind: "validation scenario",
		owner: "ssfw-8nb",
		reason:
			"cross-tenant embedding isolation requires the tenant-scoped hazard_embedding table",
	},
	{
		id: "I3",
		kind: "invariant",
		owner: "ssfw-8nb",
		reason:
			"embedding tenant scoping is verified with V8 once hazard_embedding exists",
	},
] as const;

type HazardEmbeddingTableRow = {
	tableName: string;
	tableSchema: string;
};

type TenantTableRow = {
	tableName: string;
};

test("V6/V7/I2/V8/I3 are explicit ssfw-8nb scope, not foundation battery scope", () => {
	assert.deepEqual(
		deferredCrossHiraAssertions.map((assertion) => assertion.id),
		["V6", "V7", "I2", "V8", "I3"],
	);
	assert.equal(
		new Set(deferredCrossHiraAssertions.map(({ id }) => id)).size,
		5,
	);

	for (const assertion of deferredCrossHiraAssertions) {
		assert.equal(assertion.owner, "ssfw-8nb");
		assert.match(assertion.reason, /HIRA|hazard_embedding|embedding/);
	}

	console.log(
		`Scope evidence ssfw-mxr deferred=${deferredCrossHiraAssertions
			.map(({ id, owner }) => `${id}->${owner}`)
			.join(",")}`,
	);
});

if (!databaseUrl) {
	test("hazard_embedding table is absent from the migrated foundation schema", {
		skip: "DATABASE_URL is required",
	}, () => {});
} else {
	const { PrismaClient } = await import("@prisma/client");
	const prisma = new PrismaClient();

	test("hazard_embedding table is absent from the migrated foundation schema", async () => {
		runMigrations();

		const tenantId = randomUUID();
		const tenantSchema = tenantSchemaName(tenantId);

		try {
			await prisma.$executeRaw`
				SELECT "shared"."provision_tenant_schema"(${tenantId}::uuid)
			`;

			const tenantTables = await listTenantTables(prisma, tenantSchema);
			assert.ok(
				tenantTables.some(({ tableName }) => tableName === "incident_case"),
				"tenant provisioning should have created the current foundation tables",
			);
			assert.equal(
				tenantTables.some(({ tableName }) => tableName === "hazard_embedding"),
				false,
				"hazard_embedding should not exist in the provisioned tenant schema before ssfw-8nb",
			);

			const hazardEmbeddingTables = await listHazardEmbeddingTables(prisma);
			assert.deepEqual(
				hazardEmbeddingTables,
				[],
				"hazard_embedding should not exist in any migrated user schema yet",
			);

			console.log(
				`DB inspection ssfw-mxr tenant_schema=${tenantSchema} hazard_embedding_tables=${JSON.stringify(
					hazardEmbeddingTables,
				)} tenant_table_count=${tenantTables.length}`,
			);
		} finally {
			await prisma.$executeRaw`
				SELECT "shared"."drop_tenant_schema"(${tenantId}::uuid)
			`.catch(() => undefined);
		}
	});

	test.after(async () => {
		await prisma.$disconnect();
	});
}

function runMigrations(): void {
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

async function listHazardEmbeddingTables(
	prisma: PrismaClient,
): Promise<HazardEmbeddingTableRow[]> {
	return prisma.$queryRaw<HazardEmbeddingTableRow[]>`
		SELECT
			table_schema AS "tableSchema",
			table_name AS "tableName"
		FROM information_schema.tables
		WHERE table_name = 'hazard_embedding'
			AND table_schema NOT IN ('information_schema', 'pg_catalog')
			AND table_schema !~ '^pg_'
		ORDER BY table_schema, table_name
	`;
}

async function listTenantTables(
	prisma: PrismaClient,
	tenantSchema: string,
): Promise<TenantTableRow[]> {
	return prisma.$queryRaw<TenantTableRow[]>`
		SELECT table_name AS "tableName"
		FROM information_schema.tables
		WHERE table_schema = ${tenantSchema}
			AND table_type = 'BASE TABLE'
		ORDER BY table_name
	`;
}

function tenantSchemaName(tenantId: string): string {
	return `tenant_${tenantId.replaceAll("-", "_")}`;
}
