import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { spawnSync } from "node:child_process";
import type { PrismaClient } from "@prisma/client";
import test from "node:test";
import type { WorkflowVisionConsent } from "../../../src/lib/llm/consent";
import type { LLMVisionRequest } from "../../../src/lib/llm/types";

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

const databaseUrl = process.env.DATABASE_URL;
assert.ok(
	databaseUrl,
	"DATABASE_URL is required for privacy-negative DB audit tests",
);

const auditModulePath = "../../../src/lib/llm/audit.ts";
const dispatchModulePath = "../../../src/lib/llm/dispatch.ts";
const mockModulePath = "../../../src/lib/llm/mock.ts";
const { hashVisionPhotos, recordVisionCall } = (await import(
	auditModulePath
)) as typeof import("../../../src/lib/llm/audit");
const { dispatch } = (await import(
	dispatchModulePath
)) as typeof import("../../../src/lib/llm/dispatch");
const { KNOWN_VISION_PROMPT, MockProvider } = (await import(
	mockModulePath
)) as typeof import("../../../src/lib/llm/mock");
const { dropTenantSchema, prisma, withTenantConnection } = (await import(
	"../../../src/lib/db/index"
)) as typeof import("../../../src/lib/db");

const photoBytes = readFileSync(
	"fixtures/photos/synthetic/placeholder-256.png",
);

test("Step 5: default company-off vision blocks before mock, network, and audit", async () => {
	ensureMigrated();
	const tenant = await seedTenant(prisma);
	const workflowId = randomUUID();
	const provider = new MockProvider();
	const network = new NetworkEgressProbe();

	try {
		network.install();
		const result = await dispatch(visionRequest(tenant, workflowId), {
			env: { NODE_ENV: "test" },
			fetch: network.fetch,
			mockProvider: provider,
			recordVisionCall: () => {
				throw new Error("blocked company-off vision must not write audit rows");
			},
			...failIfRealProviderConstructed(),
		});

		assert.equal(result.ok, false);
		assert.equal(result.ok ? "" : result.code, "vision_unavailable_company");
		assert.equal(provider.visionInvocationCount, 0);
		assert.equal(network.nonLoopbackCalls.length, 0);
		const rowCount = await auditRowCount(tenant.tenantId);
		assert.equal(rowCount, 0);
		console.log(
			`DB inspection privacy step 5: vision_enabled=false; mock_vision_calls=${provider.visionInvocationCount}; external_network_calls=${network.nonLoopbackCalls.length}; vision_call_audit_rows=${rowCount}`,
		);
	} finally {
		network.restore();
		await cleanupTenant(prisma, tenant);
	}
});

test("Step 6: workflow NEVER consent blocks before mock, network, and audit", async () => {
	ensureMigrated();
	const tenant = await seedTenant(prisma, { visionEnabled: true });
	const workflowId = randomUUID();
	const provider = new MockProvider();
	const network = new NetworkEgressProbe();

	try {
		await insertIncidentCase(prisma, {
			tenantId: tenant.tenantId,
			userId: tenant.userId,
			visionConsent: "NEVER",
			workflowId,
		});

		network.install();
		const result = await dispatch(visionRequest(tenant, workflowId), {
			env: { NODE_ENV: "test" },
			fetch: network.fetch,
			mockProvider: provider,
			recordVisionCall: () => {
				throw new Error("blocked NEVER consent must not write audit rows");
			},
			...failIfRealProviderConstructed(),
		});

		assert.equal(result.ok, false);
		assert.equal(result.ok ? "" : result.code, "vision_unavailable_workflow");
		assert.equal(provider.visionInvocationCount, 0);
		assert.equal(network.nonLoopbackCalls.length, 0);
		const rowCount = await auditRowCount(tenant.tenantId);
		assert.equal(rowCount, 0);
		console.log(
			`DB inspection privacy step 6: vision_enabled=true; workflow_consent=NEVER; mock_vision_calls=${provider.visionInvocationCount}; external_network_calls=${network.nonLoopbackCalls.length}; vision_call_audit_rows=${rowCount}`,
		);
	} finally {
		network.restore();
		await cleanupTenant(prisma, tenant);
	}
});

test("Step 7: workflow ALWAYS consent reaches mock once and writes one audit row", async () => {
	ensureMigrated();
	const tenant = await seedTenant(prisma, { visionEnabled: true });
	const workflowId = randomUUID();
	const provider = new MockProvider();
	const network = new NetworkEgressProbe();

	try {
		await insertIncidentCase(prisma, {
			tenantId: tenant.tenantId,
			userId: tenant.userId,
			visionConsent: "ALWAYS",
			workflowId,
		});

		network.install();
		const result = await dispatch(visionRequest(tenant, workflowId), {
			env: { NODE_ENV: "test" },
			fetch: network.fetch,
			mockProvider: provider,
			recordVisionCall: (input) => recordVisionCall(input),
			now: () => new Date("2026-05-05T08:30:00.000Z"),
			...failIfRealProviderConstructed(),
		});

		assert.equal(result.ok, true);
		assert.equal(result.ok ? result.providerStep : "", "mock");
		assert.equal(result.ok ? result.response.text : "", "mock vision response");
		assert.equal(result.ok ? result.response.provider : "", "mock");
		assert.equal(provider.visionInvocationCount, 1);
		assert.equal(network.nonLoopbackCalls.length, 0);

		const rows = await auditRows(tenant.tenantId);
		assert.equal(rows.length, 1);
		assert.equal(rows[0].tenantId, tenant.tenantId);
		assert.equal(rows[0].workflowId, workflowId);
		assert.equal(rows[0].userId, tenant.userId);
		assert.equal(
			rows[0].photoHash,
			hashVisionPhotos(visionRequest(tenant, workflowId).photos),
		);
		assert.equal(rows[0].provider, "mock");
		assert.equal(rows[0].model, "mock-seed");
		assert.equal(rows[0].promptPurpose, "mock.known-vision");
		assert.equal(
			JSON.stringify(rows).includes(photoBytes.toString("base64")),
			false,
		);
		console.log(
			`DB inspection privacy step 7: vision_enabled=true; workflow_consent=ALWAYS; mock_vision_calls=${provider.visionInvocationCount}; external_network_calls=${network.nonLoopbackCalls.length}; vision_call_audit_rows=${rows.length}; photo_hash=${rows[0].photoHash}`,
		);
	} finally {
		network.restore();
		await cleanupTenant(prisma, tenant);
	}
});

test.after(async () => {
	await prisma.$disconnect();
});

function failIfRealProviderConstructed() {
	return {
		createByokProvider: async () => {
			throw new Error("default privacy CI must not construct BYOK providers");
		},
		createHostedSaaSProvider: () => {
			throw new Error("default privacy CI must not construct hosted providers");
		},
		createLocalOverrideProvider: () => {
			throw new Error("default privacy CI must not construct local providers");
		},
		createSelfHostedProvider: () => {
			throw new Error(
				"default privacy CI must not construct self-hosted providers",
			);
		},
	};
}

async function seedTenant(
	prismaClient: PrismaClient,
	options: { visionEnabled?: boolean } = {},
): Promise<SeededTenant> {
	const suffix = randomUUID();
	const tenant = await prismaClient.tenant.create({
		data: {
			defaultLanguage: "en",
			name: `ssfw-miz-${suffix}`,
			...(options.visionEnabled === undefined
				? {}
				: { visionEnabled: options.visionEnabled }),
		},
		select: { id: true, visionEnabled: true },
	});
	const user = await prismaClient.user.create({
		data: {
			email: `ssfw-miz-${suffix}@example.invalid`,
			uiLocale: "en",
		},
		select: { id: true },
	});
	await prismaClient.tenantMembership.create({
		data: {
			tenantId: tenant.id,
			userId: user.id,
		},
	});
	await provisionTenantSchema(prismaClient, tenant.id);

	if (options.visionEnabled === undefined) {
		assert.equal(tenant.visionEnabled, false);
	}

	return {
		tenantId: tenant.id,
		userId: user.id,
	};
}

async function insertIncidentCase(
	prismaClient: PrismaClient,
	input: {
		tenantId: string;
		userId: string;
		workflowId: string;
		visionConsent: WorkflowVisionConsent;
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
				'Privacy negative test',
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

async function provisionTenantSchema(
	prismaClient: PrismaClient,
	tenantId: string,
): Promise<void> {
	const { role, schema } = tenantNames(tenantId);
	await prismaClient.$executeRawUnsafe(
		`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ${sqlString(
			role,
		)}) THEN EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION', ${sqlString(
			role,
		)}); END IF; END $$`,
	);
	await prismaClient.$executeRawUnsafe(
		`GRANT ${quoteIdent(role)} TO CURRENT_USER`,
	);
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
		`SELECT shared.apply_vision_call_audit_schema(${sqlString(schema)}::name)`,
	);
}

async function auditRows(tenantId: string): Promise<AuditRow[]> {
	return withTenantConnection(
		tenantId,
		async (tx) =>
			tx.$queryRaw<AuditRow[]>`
			SELECT
				id::text AS id,
				tenant_id::text AS "tenantId",
				workflow_id::text AS "workflowId",
				user_id::text AS "userId",
				photo_hash AS "photoHash",
				provider,
				model,
				prompt_purpose AS "promptPurpose"
			FROM vision_call_audit
			ORDER BY called_at ASC
		`,
	);
}

async function auditRowCount(tenantId: string): Promise<number> {
	const rows = await withTenantConnection(
		tenantId,
		async (tx) =>
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

function visionRequest(
	tenant: SeededTenant,
	workflowId: string,
): LLMVisionRequest {
	return {
		prompt: KNOWN_VISION_PROMPT,
		photos: [{ mimeType: "image/png", data: photoBytes }],
		options: {
			tenantId: tenant.tenantId,
			userId: tenant.userId,
			workflowId,
			locale: "en",
			promptPurpose: "mock.known-vision",
			kind: "authoring",
			requiresVision: true,
		},
	};
}

class NetworkEgressProbe {
	readonly nonLoopbackCalls: string[] = [];
	private readonly originalFetch = globalThis.fetch;

	readonly fetch: typeof fetch = async (input, init) => {
		const url = requestUrl(input);
		if (!isLoopback(url)) {
			this.nonLoopbackCalls.push(url.href);
			throw new Error(`Unexpected non-mock network request: ${url.href}`);
		}
		return this.originalFetch(input, init);
	};

	install(): void {
		globalThis.fetch = this.fetch;
	}

	restore(): void {
		globalThis.fetch = this.originalFetch;
	}
}

function requestUrl(input: Parameters<typeof fetch>[0]): URL {
	if (typeof input === "string" || input instanceof URL) {
		return new URL(input);
	}
	return new URL(input.url);
}

function isLoopback(url: URL): boolean {
	return (
		url.hostname === "localhost" ||
		url.hostname === "127.0.0.1" ||
		url.hostname === "::1" ||
		url.hostname.endsWith(".localhost")
	);
}

type SeededTenant = {
	tenantId: string;
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
};

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

function tenantNames(tenantId: string): { role: string; schema: string } {
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
