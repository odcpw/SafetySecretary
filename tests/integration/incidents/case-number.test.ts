import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	test("incident case number uniqueness", {
		skip: "DATABASE_URL is required",
	}, () => {});
} else {
	const { dropTenantSchema, prisma, provisionTenantSchema } = (await import(
		moduleUrl("src/lib/db/index.ts")
	)) as typeof import("../../../src/lib/db");

	test.after(async () => {
		await prisma.$disconnect();
	});

	test("case numbers are unique within a tenant but reusable across tenants", async () => {
		ensureMigrated();
		const tenantA = await seedTenant("case-number-a");
		const tenantB = await seedTenant("case-number-b");

		try {
			await insertIncidentCase({
				caseNumber: "II-2026-001",
				caseId: randomUUID(),
				tenantId: tenantA.tenantId,
				userId: tenantA.userId,
			});

			await assert.rejects(
				() =>
					insertIncidentCase({
						caseNumber: "II-2026-001",
						caseId: randomUUID(),
						tenantId: tenantA.tenantId,
						userId: tenantA.userId,
					}),
				isUniqueViolation,
			);

			await insertIncidentCase({
				caseNumber: "II-2026-001",
				caseId: randomUUID(),
				tenantId: tenantB.tenantId,
				userId: tenantB.userId,
			});
		} finally {
			await cleanupTenant(tenantB);
			await cleanupTenant(tenantA);
		}
	});

	test("case number migration repairs old duplicates before adding the index", async () => {
		ensureMigrated();
		const tenant = await seedTenant("case-number-repair");
		const names = tenantNames(tenant.tenantId);
		const primaryId = randomUUID();
		const duplicateId = randomUUID();
		const maxId = randomUUID();

		try {
			await prisma.$executeRawUnsafe(
				`DROP INDEX IF EXISTS ${quoteIdent(names.schema)}.incident_case_case_number_key`,
			);
			await insertIncidentCase({
				caseNumber: "II-2026-007",
				caseId: primaryId,
				createdAt: "2026-01-01T00:00:00Z",
				tenantId: tenant.tenantId,
				userId: tenant.userId,
			});
			await insertIncidentCase({
				caseNumber: "II-2026-007",
				caseId: duplicateId,
				createdAt: "2026-01-02T00:00:00Z",
				tenantId: tenant.tenantId,
				userId: tenant.userId,
			});
			await insertIncidentCase({
				caseNumber: "II-2026-009",
				caseId: maxId,
				createdAt: "2026-01-03T00:00:00Z",
				tenantId: tenant.tenantId,
				userId: tenant.userId,
			});

			await prisma.$executeRawUnsafe(
				`SELECT shared.apply_incident_case_number_unique_schema(${sqlString(
					names.schema,
				)}::name)`,
			);

			const rows = await prisma.$queryRawUnsafe<
				Array<{ id: string; caseNumber: string }>
			>(
				`SELECT id::text AS id, case_number AS "caseNumber"
				 FROM ${quoteIdent(names.schema)}.incident_case
				 WHERE id IN (${[primaryId, duplicateId, maxId]
						.map((id) => `${sqlString(id)}::uuid`)
						.join(", ")})
				 ORDER BY created_at ASC`,
			);
			assert.deepEqual(rows, [
				{ caseNumber: "II-2026-007", id: primaryId },
				{ caseNumber: "II-2026-010", id: duplicateId },
				{ caseNumber: "II-2026-009", id: maxId },
			]);

			await assert.rejects(
				() =>
					insertIncidentCase({
						caseNumber: "II-2026-007",
						caseId: randomUUID(),
						tenantId: tenant.tenantId,
						userId: tenant.userId,
					}),
				isUniqueViolation,
			);
		} finally {
			await cleanupTenant(tenant);
		}
	});

	async function seedTenant(label: string): Promise<{
		tenantId: string;
		userId: string;
	}> {
		const tenant = await prisma.tenant.create({
			data: {
				defaultLanguage: "en",
				name: `ssfw-${label}-${randomUUID()}`,
			},
		});
		const user = await prisma.user.create({
			data: {
				email: `ssfw-${label}-${randomUUID()}@example.invalid`,
				uiLocale: "en",
			},
		});
		await prisma.tenantMembership.create({
			data: { tenantId: tenant.id, userId: user.id },
		});
		await provisionTenantSchema(tenant.id);
		return { tenantId: tenant.id, userId: user.id };
	}

	async function insertIncidentCase(input: {
		caseId: string;
		caseNumber: string;
		createdAt?: string;
		tenantId: string;
		userId: string;
	}): Promise<void> {
		const schema = quoteIdent(tenantNames(input.tenantId).schema);
		const createdAt = input.createdAt ?? "2026-01-01T00:00:00Z";

		await prisma.$executeRawUnsafe(
			`INSERT INTO ${schema}.incident_case (
				id,
				case_number,
				title,
				incident_at,
				incident_type,
				actual_injury_outcome,
				coordinator_role,
				content_language,
				created_by,
				created_at,
				updated_at
			) VALUES (
				${sqlString(input.caseId)}::uuid,
				${sqlString(input.caseNumber)},
				'II case number test',
				'2026-01-01T00:00:00Z'::timestamptz,
				'NEAR_MISS',
				'NO_INJURY',
				'Safety lead',
				'en',
				${sqlString(input.userId)}::uuid,
				${sqlString(createdAt)}::timestamptz,
				${sqlString(createdAt)}::timestamptz
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

function isUniqueViolation(error: unknown): boolean {
	const text =
		error && typeof error === "object"
			? `${String(error)} ${JSON.stringify(error)}`
			: String(error);
	return (
		text.includes("23505") &&
		(text.includes("incident_case_case_number_key") ||
			text.includes("case_number"))
	);
}

function tenantNames(tenantId: string): { schema: string } {
	const suffix = tenantId.toLowerCase().replaceAll("-", "_");
	return { schema: `tenant_${suffix}` };
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
