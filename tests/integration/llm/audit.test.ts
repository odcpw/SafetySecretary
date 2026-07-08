import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import type { LLMProvider, LLMResponse, LLMVisionRequest } from "../../../src/lib/llm/types";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (context.parentURL && specifier.startsWith(".")) {
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

const auditModulePath = "../../../src/lib/llm/audit.ts";
const dispatchModulePath = "../../../src/lib/llm/dispatch.ts";
const { hashVisionPhotos, recordVisionCall } = (await import(
	auditModulePath
)) as typeof import("../../../src/lib/llm/audit");
const { dispatch } = (await import(
	dispatchModulePath
)) as typeof import("../../../src/lib/llm/dispatch");

const databaseUrl = process.env.DATABASE_URL;
const photoBytes = Buffer.from("audit-photo-bytes-never-store");

test("schema and SQL define tenant-local vision_call_audit without byte storage", () => {
	const schema = readFileSync("prisma/schema.prisma", "utf8");
	const sql = readFileSync("db/sql/00120_vision_call_audit.sql", "utf8");

	assert.match(schema, /model VisionCallAudit \{/);
	assert.match(schema, /@@map\("vision_call_audit"\)/);
	assert.match(schema, /@@schema\("tenant"\)/);
	assert.match(sql, /CREATE TABLE IF NOT EXISTS %I\.vision_call_audit/);
	assert.match(sql, /photo_hash text NOT NULL/);
	assert.doesNotMatch(sql, /photo_bytes/i);
	assert.doesNotMatch(sql, /bytea/i);
});

test("hashVisionPhotos hashes only the bytes supplied to the provider", () => {
	const hash = hashVisionPhotos([
		{
			mimeType: "application/octet-stream",
			data: photoBytes,
		},
	]);

	assert.equal(hash, sha256Hex(photoBytes));
	assert.equal(hash.includes("audit-photo-bytes-never-store"), false);
});

if (!databaseUrl) {
	test("vision_call_audit DB integration", {
		skip: "DATABASE_URL is required",
	}, () => {});
} else {
	const { dropTenantSchema, prisma, withTenantConnection } =
		(await import("../../../src/lib/db/index")) as typeof import("../../../src/lib/db");

	test("successful vision dispatch writes exactly one tenant audit row with hash only", async () => {
		ensureMigrated();
		const tenant = await seedTenant(prisma, true);
		const workflowId = randomUUID();
		const provider = new RecordingVisionProvider();
		const logLines: string[] = [];

		try {
			await insertIncidentCase(prisma, {
				tenantId: tenant.tenantId,
				userId: tenant.userId,
				workflowId,
				visionConsent: "ALWAYS",
			});

			const result = await dispatch(visionRequest(tenant, workflowId), {
				env: { NODE_ENV: "test" },
				mockProvider: provider,
				recordVisionCall: (input) =>
					recordVisionCall(input, {
						logger: (line) => logLines.push(line),
					}),
				now: () => new Date("2026-05-05T08:20:00.000Z"),
			});

			assert.equal(result.ok, true);
			assert.equal(provider.visionInvocations, 1);

			const rows = await auditRows(tenant.tenantId);
			assert.equal(rows.length, 1);
			assert.equal(rows[0].tenantId, tenant.tenantId);
			assert.equal(rows[0].workflowId, workflowId);
			assert.equal(rows[0].userId, tenant.userId);
			assert.equal(rows[0].photoHash, sha256Hex(photoBytes));
			assert.equal(rows[0].provider, "mock");
			assert.equal(rows[0].model, "mock-vision-model");
			assert.equal(rows[0].promptPurpose, "audit.dispatch");
			assert.equal(rows[0].latencyMs >= 0, true);
			assert.equal(Number(rows[0].tokenCostUsd), 0);

			const columns = await auditColumns(tenant.tenantId);
			assert.equal(columns.includes("photo_bytes"), false);
			assert.equal(JSON.stringify(rows).includes("audit-photo-bytes-never-store"), false);
			assert.equal(logLines.length, 1);
			assert.equal(logLines[0].includes(rows[0].photoHash), true);
			assert.equal(logLines[0].includes("audit-photo-bytes-never-store"), false);
			console.log(
				`DB inspection vision_call_audit happy: rows=${rows.length}; photo_hash=${rows[0].photoHash}; columns=${columns.join(",")}`,
			);
			console.log(`Audit log evidence: ${logLines[0]}`);
		} finally {
			await cleanupTenant(prisma, tenant);
		}
	});

	test("blocked company-off vision dispatch writes zero audit rows", async () => {
		ensureMigrated();
		const tenant = await seedTenant(prisma, false);
		const provider = new RecordingVisionProvider();

		try {
			const result = await dispatch(visionRequest(tenant, randomUUID()), {
				env: { NODE_ENV: "test" },
				mockProvider: provider,
				recordVisionCall: () => {
					throw new Error("blocked vision must not write audit rows");
				},
			});

			assert.equal(result.ok, false);
			assert.equal(result.ok ? "" : result.code, "vision_unavailable_company");
			assert.equal(provider.visionInvocations, 0);
			const rowCount = await auditRowCount(tenant.tenantId);
			assert.equal(rowCount, 0);
			console.log(
				`DB inspection vision_call_audit negative: company_vision=false; rows=${rowCount}`,
			);
		} finally {
			await cleanupTenant(prisma, tenant);
		}
	});

	test.after(async () => {
		await prisma.$disconnect();
	});

	async function seedTenant(
		prismaClient: PrismaClient,
		visionEnabled: boolean,
	): Promise<SeededTenant> {
		const suffix = randomUUID();
		const tenant = await prismaClient.tenant.create({
			data: {
				defaultLanguage: "en",
				name: `ssfw-ito-${suffix}`,
				visionEnabled,
			},
			select: { id: true },
		});
		const user = await prismaClient.user.create({
			data: {
				email: `ssfw-ito-${suffix}@example.invalid`,
				uiLocale: "en",
			},
			select: { id: true, email: true },
		});
		await prismaClient.tenantMembership.create({
			data: {
				tenantId: tenant.id,
				userId: user.id,
			},
		});
		await provisionAuditTenantSchema(prismaClient, tenant.id);

		return {
			tenantId: tenant.id,
			userEmail: user.email,
			userId: user.id,
		};
	}

	async function insertIncidentCase(
		prismaClient: PrismaClient,
		input: {
			tenantId: string;
			userId: string;
			workflowId: string;
			visionConsent: "ASK" | "ALWAYS" | "NEVER";
		},
	): Promise<void> {
		await withTenantConnection(input.tenantId, async (tx) => {
			await tx.$executeRaw`
				INSERT INTO incident_case (
					id,
					title,
					incident_at,
					incident_type,
					coordinator_role,
					content_language,
					created_by,
					vision_consent
				) VALUES (
					${input.workflowId}::uuid,
					'Vision audit test',
					'2026-05-05T08:00:00Z'::timestamptz,
					'NEAR_MISS',
					'Safety lead',
					'en',
					${input.userId}::uuid,
					${input.visionConsent}::incident_vision_consent
				)
			`;
		});

		void prismaClient;
	}

	async function provisionAuditTenantSchema(
		prismaClient: PrismaClient,
		tenantId: string,
	): Promise<void> {
		const { role, schema } = names(tenantId);
		await prismaClient.$executeRawUnsafe(
			`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ${sqlString(
				role,
			)}) THEN EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION', ${sqlString(
				role,
			)}); END IF; END $$`,
		);
		await prismaClient.$executeRawUnsafe(`GRANT ${quoteIdent(role)} TO CURRENT_USER`);
		await prismaClient.$executeRawUnsafe(
			`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)} AUTHORIZATION ${quoteIdent(
				role,
			)}`,
		);
		await prismaClient.$executeRawUnsafe(
			`ALTER SCHEMA ${quoteIdent(schema)} OWNER TO ${quoteIdent(role)}`,
		);
		await prismaClient.$executeRawUnsafe(
			`GRANT USAGE ON SCHEMA ${quoteIdent(schema)} TO ${quoteIdent(role)}`,
		);
		await prismaClient.$executeRawUnsafe(
			`GRANT USAGE ON SCHEMA "shared" TO ${quoteIdent(role)}`,
		);
		await prismaClient.$executeRawUnsafe(
			`SELECT shared.apply_incident_case_schema(${sqlString(schema)}::name)`,
		);
		await prismaClient.$executeRawUnsafe(
			`SELECT shared.apply_incident_soft_delete_schema(${sqlString(schema)}::name)`,
		);
		await prismaClient.$executeRawUnsafe(
			`SELECT shared.apply_vision_call_audit_schema(${sqlString(schema)}::name)`,
		);
	}

	async function auditRows(tenantId: string): Promise<AuditRow[]> {
		return withTenantConnection(tenantId, async (tx) =>
			tx.$queryRaw<AuditRow[]>`
				SELECT
					id::text AS id,
					tenant_id::text AS "tenantId",
					workflow_id::text AS "workflowId",
					user_id::text AS "userId",
					photo_hash AS "photoHash",
					provider,
					model,
					prompt_purpose AS "promptPurpose",
					called_at AS "calledAt",
					latency_ms AS "latencyMs",
					token_cost_usd AS "tokenCostUsd"
				FROM vision_call_audit
				ORDER BY called_at ASC
			`,
		);
	}

	async function auditColumns(tenantId: string): Promise<string[]> {
		const rows = await withTenantConnection(tenantId, async (tx) =>
			tx.$queryRaw<Array<{ columnName: string }>>`
				SELECT column_name AS "columnName"
				FROM information_schema.columns
				WHERE table_schema = current_schema()
					AND table_name = 'vision_call_audit'
				ORDER BY ordinal_position
			`,
		);
		return rows.map((row) => row.columnName);
	}

	async function auditRowCount(tenantId: string): Promise<number> {
		const rows = await withTenantConnection(tenantId, async (tx) =>
			tx.$queryRaw<Array<{ count: bigint }>>`
				SELECT count(*)::bigint AS count
				FROM vision_call_audit
			`,
		);
		return Number(rows[0]?.count ?? BigInt(0));
	}

	async function cleanupTenant(
		prismaClient: PrismaClient,
		tenant: SeededTenant,
	): Promise<void> {
		await dropTenantSchema(tenant.tenantId, prismaClient).catch(() => undefined);
		await prismaClient.tenantMembership.deleteMany({
			where: { tenantId: tenant.tenantId },
		});
		await prismaClient.session.deleteMany({
			where: { tenantId: tenant.tenantId },
		});
		await prismaClient.tenant.deleteMany({ where: { id: tenant.tenantId } });
		await prismaClient.user.deleteMany({ where: { id: tenant.userId } });
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

class RecordingVisionProvider implements LLMProvider {
	visionInvocations = 0;

	async text(): Promise<LLMResponse> {
		throw new Error("text should not be invoked by this audit test");
	}

	async vision(_req: LLMVisionRequest): Promise<LLMResponse> {
		this.visionInvocations += 1;
		return {
			text: "mock vision response",
			model: "mock-vision-model",
			provider: "mock",
		};
	}
}

type SeededTenant = {
	tenantId: string;
	userEmail: string;
	userId: string;
};

type AuditRow = {
	id: string;
	tenantId: string;
	workflowId: string;
	userId: string;
	photoHash: string;
	provider: string;
	model: string;
	promptPurpose: string;
	calledAt: Date;
	latencyMs: number;
	tokenCostUsd: unknown;
};

function visionRequest(tenant: SeededTenant, workflowId: string): LLMVisionRequest {
	return {
		prompt: "Describe this photo for audit.",
		photos: [{ mimeType: "application/octet-stream", data: photoBytes }],
		options: {
			tenantId: tenant.tenantId,
			userId: tenant.userId,
			workflowId,
			locale: "en",
			promptPurpose: "audit.dispatch",
			kind: "authoring",
			requiresVision: true,
		},
	};
}

function sha256Hex(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function names(tenantId: string): { role: string; schema: string } {
	const suffix = tenantId.toLowerCase().replaceAll("-", "_");
	return {
		role: `role_tenant_${suffix}`,
		schema: `tenant_${suffix}`,
	};
}

function quoteIdent(value: string): string {
	return `"${value.replaceAll('"', '""')}"`;
}

function sqlString(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}
