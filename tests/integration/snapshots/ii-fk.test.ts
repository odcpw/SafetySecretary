import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

type ConstraintRow = {
	table_name: string;
	conname: string;
	contype: string;
	definition: string;
};

const testFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(testFile), "../../..");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	test("II snapshot/artifact FK integration", {
		skip: "DATABASE_URL is required",
	}, () => {});
} else {
	test("II snapshot/artifact FKs and interim checks are enforced", async () => {
		runMigrations();

		const { PrismaClient } = await import("@prisma/client");
		const prisma = new PrismaClient();
		const tenantId = randomUUID();
		const userId = randomUUID();
		const caseId = randomUUID();
		const missingCaseId = randomUUID();
		const tenantSchema = `tenant_${tenantId.replaceAll("-", "_")}`;
		const schema = quoteIdent(tenantSchema);

		try {
			await prisma.$executeRawUnsafe(
				`INSERT INTO shared.users (id, email, ui_locale) VALUES (${sqlString(userId)}::uuid, ${sqlString(
					`ssfw-8hk-${userId}@example.invalid`,
				)}::citext, 'en')`,
			);
			await prisma.$executeRawUnsafe(
				`INSERT INTO shared.tenants (id, name, default_language) VALUES (${sqlString(
					tenantId,
				)}::uuid, 'ssfw-8hk integration tenant', 'en')`,
			);
			await prisma.$executeRawUnsafe(
				`SELECT shared.provision_tenant_schema(${sqlString(tenantId)}::uuid)`,
			);

			await assertIiConstraints(prisma, tenantSchema);

			await prisma.$executeRawUnsafe(
				`INSERT INTO ${schema}.incident_case (
          id,
          title,
          incident_type,
          coordinator_role,
          content_language,
          created_by
        ) VALUES (
          ${sqlString(caseId)}::uuid,
          'II case',
          'NEAR_MISS',
          'Safety coordinator',
          'en',
          ${sqlString(userId)}::uuid
        )`,
			);

			await prisma.$executeRawUnsafe(
				`INSERT INTO ${schema}.approval_snapshot (
          id,
          workflow_type,
          ii_case_id,
          version_label,
          approved_by,
          approved_at,
          workflow_data
        ) VALUES (
          ${sqlString(randomUUID())}::uuid,
          'II',
          ${sqlString(caseId)}::uuid,
          'v01',
          ${sqlString(userId)}::uuid,
          CURRENT_TIMESTAMP,
          '{}'::jsonb
        )`,
			);
			await prisma.$executeRawUnsafe(
				`INSERT INTO ${schema}.generated_artifact (
          id,
          workflow_type,
          ii_case_id,
          output_type,
          version_seq,
          storage_key,
          generated_by,
          source
        ) VALUES (
          ${sqlString(randomUUID())}::uuid,
          'II',
          ${sqlString(caseId)}::uuid,
          'summary',
          1,
          'tenants/test/artifacts/summary.pdf',
          ${sqlString(userId)}::uuid,
          'GENERATED'
        )`,
			);

			await assertRejectsDb(
				() =>
					prisma.$executeRawUnsafe(
						`INSERT INTO ${schema}.approval_snapshot (
              id,
              workflow_type,
              version_label,
              approved_by,
              approved_at,
              workflow_data
            ) VALUES (
              ${sqlString(randomUUID())}::uuid,
              'II',
              'v02',
              ${sqlString(userId)}::uuid,
              CURRENT_TIMESTAMP,
              '{}'::jsonb
            )`,
					),
				/approval_snapshot_interim_ii_case_check|23514|check constraint/i,
			);
			await assertRejectsDb(
				() =>
					prisma.$executeRawUnsafe(
						`INSERT INTO ${schema}.approval_snapshot (
              id,
              workflow_type,
              ii_case_id,
              version_label,
              approved_by,
              approved_at,
              workflow_data
            ) VALUES (
              ${sqlString(randomUUID())}::uuid,
              'II',
              ${sqlString(missingCaseId)}::uuid,
              'v03',
              ${sqlString(userId)}::uuid,
              CURRENT_TIMESTAMP,
              '{}'::jsonb
            )`,
					),
				/approval_snapshot_ii_case_id_fkey|23503|foreign key/i,
			);
			await assertRejectsDb(
				() =>
					prisma.$executeRawUnsafe(
						`INSERT INTO ${schema}.approval_snapshot (
              id,
              workflow_type,
              hira_case_id,
              version_label,
              approved_by,
              approved_at,
              workflow_data
            ) VALUES (
              ${sqlString(randomUUID())}::uuid,
              'HIRA',
              ${sqlString(randomUUID())}::uuid,
              'v04',
              ${sqlString(userId)}::uuid,
              CURRENT_TIMESTAMP,
              '{}'::jsonb
            )`,
					),
				/approval_snapshot_interim_ii_case_check|23514|check constraint/i,
			);
			await assertRejectsDb(
				() =>
					prisma.$executeRawUnsafe(
						`INSERT INTO ${schema}.generated_artifact (
              id,
              workflow_type,
              output_type,
              version_seq,
              storage_key,
              generated_by,
              source
            ) VALUES (
              ${sqlString(randomUUID())}::uuid,
              'II',
              'summary',
              2,
              'tenants/test/artifacts/null-case.pdf',
              ${sqlString(userId)}::uuid,
              'GENERATED'
            )`,
					),
				/generated_artifact_interim_ii_case_check|23514|check constraint/i,
			);
			await assertRejectsDb(
				() =>
					prisma.$executeRawUnsafe(
						`INSERT INTO ${schema}.generated_artifact (
              id,
              workflow_type,
              ii_case_id,
              output_type,
              version_seq,
              storage_key,
              generated_by,
              source
            ) VALUES (
              ${sqlString(randomUUID())}::uuid,
              'II',
              ${sqlString(missingCaseId)}::uuid,
              'summary',
              3,
              'tenants/test/artifacts/missing-case.pdf',
              ${sqlString(userId)}::uuid,
              'GENERATED'
            )`,
					),
				/generated_artifact_ii_case_id_fkey|23503|foreign key/i,
			);
			await assertRejectsDb(
				() =>
					prisma.$executeRawUnsafe(
						`INSERT INTO ${schema}.generated_artifact (
              id,
              workflow_type,
              jha_case_id,
              output_type,
              version_seq,
              storage_key,
              generated_by,
              source
            ) VALUES (
              ${sqlString(randomUUID())}::uuid,
              'JHA',
              ${sqlString(randomUUID())}::uuid,
              'summary',
              4,
              'tenants/test/artifacts/jha.pdf',
              ${sqlString(userId)}::uuid,
              'GENERATED'
            )`,
					),
				/generated_artifact_interim_ii_case_check|23514|check constraint/i,
			);
		} finally {
			await cleanupTenant(prisma, tenantId, userId);
			await prisma.$disconnect();
		}
	});
}

function runMigrations(): void {
	if (process.env.SSFW_8HK_SKIP_MIGRATE === "1") {
		return;
	}

	const result = spawnSync("pnpm", ["db:migrate"], {
		cwd: repoRoot,
		env: { ...process.env, DATABASE_URL: databaseUrl },
		encoding: "utf8",
	});

	assert.equal(
		result.status,
		0,
		`pnpm db:migrate failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
	);
}

async function assertIiConstraints(
	prisma: {
		$queryRawUnsafe<T = unknown>(query: string): Promise<T>;
	},
	tenantSchema: string,
): Promise<void> {
	const constraints = await prisma.$queryRawUnsafe<ConstraintRow[]>(
		`SELECT
       rel.relname AS table_name,
       con.conname,
       con.contype,
       pg_catalog.pg_get_constraintdef(con.oid) AS definition
     FROM pg_catalog.pg_constraint con
     JOIN pg_catalog.pg_class rel
       ON rel.oid = con.conrelid
     JOIN pg_catalog.pg_namespace namespace
       ON namespace.oid = rel.relnamespace
     WHERE namespace.nspname = ${sqlString(tenantSchema)}
       AND rel.relname IN ('approval_snapshot', 'generated_artifact')
       AND con.conname IN (
         'approval_snapshot_ii_case_id_fkey',
         'approval_snapshot_interim_ii_case_check',
         'generated_artifact_ii_case_id_fkey',
         'generated_artifact_interim_ii_case_check'
       )
     ORDER BY rel.relname, con.conname`,
	);
	const byName = new Map(constraints.map((row) => [row.conname, row]));

	assertConstraint(byName, "approval_snapshot_ii_case_id_fkey", "f", [
		/FOREIGN KEY \(ii_case_id\)/i,
		/REFERENCES .*incident_case\(id\)/i,
	]);
	assertConstraint(byName, "generated_artifact_ii_case_id_fkey", "f", [
		/FOREIGN KEY \(ii_case_id\)/i,
		/REFERENCES .*incident_case\(id\)/i,
	]);
	assertConstraint(byName, "approval_snapshot_interim_ii_case_check", "c", [
		/workflow_type/i,
		/'II'/,
		/ii_case_id IS NOT NULL/i,
		/hira_case_id IS NULL/i,
		/jha_case_id IS NULL/i,
	]);
	assertConstraint(byName, "generated_artifact_interim_ii_case_check", "c", [
		/workflow_type/i,
		/'II'/,
		/ii_case_id IS NOT NULL/i,
		/hira_case_id IS NULL/i,
		/jha_case_id IS NULL/i,
	]);
}

function assertConstraint(
	byName: Map<string, ConstraintRow>,
	name: string,
	type: string,
	definitionPatterns: RegExp[],
): void {
	const constraint = byName.get(name);
	assert.ok(constraint, `${name} should exist`);
	assert.equal(
		constraint.contype,
		type,
		`${name} should have constraint type ${type}`,
	);

	for (const pattern of definitionPatterns) {
		assert.match(
			constraint.definition,
			pattern,
			`${name} definition should match ${pattern}`,
		);
	}
}

async function assertRejectsDb(
	operation: () => Promise<unknown>,
	expected: RegExp,
): Promise<void> {
	let thrown: unknown;

	try {
		await operation();
	} catch (error) {
		thrown = error;
	}

	assert.ok(thrown, "database operation should reject");
	assert.match(formatError(thrown), expected);
}

async function cleanupTenant(
	prisma: {
		$executeRawUnsafe(query: string): Promise<number>;
	},
	tenantId: string,
	userId: string,
): Promise<void> {
	await prisma.$executeRawUnsafe(
		`SELECT shared.drop_tenant_schema(${sqlString(tenantId)}::uuid)`,
	);
	await prisma.$executeRawUnsafe(
		`DELETE FROM shared.tenants WHERE id = ${sqlString(tenantId)}::uuid`,
	);
	await prisma.$executeRawUnsafe(
		`DELETE FROM shared.users WHERE id = ${sqlString(userId)}::uuid`,
	);
}

function quoteIdent(identifier: string): string {
	return `"${identifier.replaceAll('"', '""')}"`;
}

function sqlString(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}

function formatError(error: unknown): string {
	if (error instanceof Error) {
		const maybeCode = "code" in error ? ` code=${String(error.code)}` : "";
		const maybeMeta =
			"meta" in error ? ` meta=${JSON.stringify(error.meta)}` : "";
		return `${error.name}${maybeCode}${maybeMeta}: ${error.message}`;
	}

	return String(error);
}
