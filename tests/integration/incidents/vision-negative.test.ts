import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import type {
	Storage,
	StorageBody,
	StorageListOptions,
	StorageListResult,
	StorageObject,
	StorageObjectMetadata,
	StoragePutOptions,
} from "../../../src/lib/storage";
import type { LLMVisionRequest } from "../../../src/lib/llm/types";

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
			return {
				shortCircuit: true,
				url: resolved.href,
			};
		}

		return nextResolve(specifier, context);
	},
});

const databaseUrl = process.env.DATABASE_URL;
assert.ok(
	databaseUrl,
	"DATABASE_URL is required for II vision negative integration tests",
);

const csrfValue = "ii-vision-negative-csrf";
const syntheticPhotoBytes = readFileSync(
	"fixtures/photos/synthetic/placeholder-256.png",
);

const { NextRequest } = (await import("next/server.js")) as typeof import("next/server");
const { hashVisionPhotos, recordVisionCall } = (await import(
	moduleUrl("src/lib/llm/audit.ts")
)) as typeof import("../../../src/lib/llm/audit");
const { dispatch } = (await import(
	moduleUrl("src/lib/llm/dispatch.ts")
)) as typeof import("../../../src/lib/llm/dispatch");
const { KNOWN_VISION_PROMPT, MockProvider } = (await import(
	moduleUrl("src/lib/llm/mock.ts")
)) as typeof import("../../../src/lib/llm/mock");
const { CSRF_COOKIE_NAME } = (await import(
	moduleUrl("src/lib/auth/cookies.ts")
)) as typeof import("../../../src/lib/auth/cookies");
const { prisma, dropTenantSchema, withTenantConnection } = (await import(
	moduleUrl("src/lib/db/index.ts")
)) as typeof import("../../../src/lib/db");
const photoRoute = (await import(
	moduleUrl("src/app/api/incidents/[id]/timeline/[eventId]/photos/route.ts")
)) as typeof import("../../../src/app/api/incidents/[id]/timeline/[eventId]/photos/route");
const { StorageNotFoundError, tenantPrefix } = (await import(
	moduleUrl("src/lib/storage/index.ts")
)) as typeof import("../../../src/lib/storage");

test("II timeline-event photo vision blocks when company vision is off by default", async () => {
	ensureMigrated();
	const tenant = await seedTenant("company-off");
	const provider = new RecordingMockProvider();

	try {
		assert.equal(tenant.visionEnabled, false);
		const fixture = await seedTimelinePhotoFixture(tenant, "ASK");

		const result = await dispatch(visionRequest(tenant, fixture), {
			env: { NODE_ENV: "test" },
			mockProvider: provider,
			recordVisionCall: () => {
				throw new Error("company-off II vision must not write audit rows");
			},
			...failIfRealProviderConstructed(),
		});

		assert.equal(result.ok, false);
		if (result.ok) {
			assert.fail("company-off II vision unexpectedly reached a provider");
		}
		assert.equal(result.code, "vision_unavailable_company");
		assert.ok("error" in result);
		assert.equal(result.error.code, "vision_unavailable_company");
		assert.equal(provider.visionInvocationCount, 0);
		assert.equal(provider.visionRequests.length, 0);
		assert.equal(await auditRowCount(tenant.tenantId), 0);
		console.log(
			`DB inspection II vision negative company-off: vision_enabled=false; workflow_consent=ASK; mock_vision_calls=${provider.visionInvocationCount}; vision_call_audit_rows=0; timeline_event_id=${fixture.eventId}; attachment_id=${fixture.attachmentId}`,
		);
	} finally {
		await cleanupTenant(tenant);
	}
});

test("II timeline-event photo vision blocks when workflow consent is NEVER", async () => {
	ensureMigrated();
	const tenant = await seedTenant("workflow-never", { visionEnabled: true });
	const provider = new RecordingMockProvider();

	try {
		const fixture = await seedTimelinePhotoFixture(tenant, "NEVER");

		const result = await dispatch(visionRequest(tenant, fixture), {
			env: { NODE_ENV: "test" },
			mockProvider: provider,
			recordVisionCall: () => {
				throw new Error("NEVER II vision consent must not write audit rows");
			},
			...failIfRealProviderConstructed(),
		});

		assert.equal(result.ok, false);
		if (result.ok) {
			assert.fail("NEVER II vision consent unexpectedly reached a provider");
		}
		assert.equal(result.code, "vision_unavailable_workflow");
		assert.ok("error" in result);
		assert.equal(result.error.code, "vision_unavailable_workflow");
		assert.equal(provider.visionInvocationCount, 0);
		assert.equal(provider.visionRequests.length, 0);
		assert.equal(await auditRowCount(tenant.tenantId), 0);
		console.log(
			`DB inspection II vision negative workflow-never: vision_enabled=true; workflow_consent=NEVER; mock_vision_calls=${provider.visionInvocationCount}; vision_call_audit_rows=0; timeline_event_id=${fixture.eventId}; attachment_id=${fixture.attachmentId}`,
		);
	} finally {
		await cleanupTenant(tenant);
	}
});

test("II timeline-event photo vision reaches MockProvider once and audits hash only with ALWAYS consent", async () => {
	ensureMigrated();
	const tenant = await seedTenant("workflow-always", { visionEnabled: true });
	const provider = new RecordingMockProvider();

	try {
		const fixture = await seedTimelinePhotoFixture(tenant, "ALWAYS");
		const request = visionRequest(tenant, fixture);
		const result = await dispatch(request, {
			env: { NODE_ENV: "test" },
			mockProvider: provider,
			recordVisionCall: (input) => recordVisionCall(input),
			now: () => new Date("2026-05-05T09:00:00.000Z"),
			...failIfRealProviderConstructed(),
		});

		assert.equal(result.ok, true);
		assert.equal(result.ok ? result.providerStep : "", "mock");
		assert.equal(result.ok ? result.response.text : "", "mock vision response");
		assert.equal(result.ok ? result.response.provider : "", "mock");
		assert.equal(provider.visionInvocationCount, 1);
		assert.equal(provider.visionRequests.length, 1);
		assert.equal(provider.visionRequests[0].options.workflowId, fixture.caseId);
		assert.equal(provider.visionRequests[0].photos.length, 1);
		assert.equal(provider.visionRequests[0].photos[0].mimeType, "image/png");
		assert.deepEqual(provider.visionRequests[0].photos[0].data, syntheticPhotoBytes);

		const rows = await auditRows(tenant.tenantId);
		assert.equal(rows.length, 1);
		assert.equal(rows[0].tenantId, tenant.tenantId);
		assert.equal(rows[0].workflowId, fixture.caseId);
		assert.equal(rows[0].userId, tenant.userId);
		assert.equal(rows[0].photoHash, sha256Hex(syntheticPhotoBytes));
		assert.equal(rows[0].photoHash, hashVisionPhotos(request.photos));
		assert.equal(rows[0].provider, "mock");
		assert.equal(rows[0].model, "mock-seed");
		assert.equal(rows[0].promptPurpose, "mock.known-vision");

		const columns = await auditColumns(tenant.tenantId);
		assert.equal(columns.includes("photo_bytes"), false);
		assert.equal(columns.some((column) => /byte/i.test(column)), false);
		assert.equal(
			JSON.stringify(rows).includes(syntheticPhotoBytes.toString("base64")),
			false,
		);
		console.log(
			`DB inspection II vision negative always: vision_enabled=true; workflow_consent=ALWAYS; mock_vision_calls=${provider.visionInvocationCount}; vision_call_audit_rows=${rows.length}; photo_hash=${rows[0].photoHash}; audit_columns=${columns.join(",")}; timeline_event_id=${fixture.eventId}; attachment_id=${fixture.attachmentId}`,
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
	options: { visionEnabled?: boolean } = {},
): Promise<SeededTenant> {
	const suffix = randomUUID();
	const tenant = await prisma.tenant.create({
		data: {
			defaultLanguage: "en",
			name: `ssfw-jiw-${label}-${suffix}`,
			...(options.visionEnabled === undefined
				? {}
				: { visionEnabled: options.visionEnabled }),
		},
		select: { id: true, visionEnabled: true },
	});
	const user = await prisma.user.create({
		data: {
			email: `ssfw-jiw-${label}-${suffix}@example.invalid`,
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
	await provisionTenantSchema(prisma, tenant.id);

	return {
		tenantId: tenant.id,
		userId: user.id,
		visionEnabled: tenant.visionEnabled,
	};
}

async function seedTimelinePhotoFixture(
	tenant: SeededTenant,
	visionConsent: "ASK" | "ALWAYS" | "NEVER",
): Promise<TimelinePhotoFixture> {
	const caseId = randomUUID();
	const eventId = randomUUID();
	const storage = new MemoryStorage(StorageNotFoundError);

	await withTenantConnection(tenant.tenantId, async (tx) => {
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
				${caseId}::uuid,
				'II synthetic timeline photo vision test',
				'2026-05-05T08:00:00Z'::timestamptz,
				'NEAR_MISS',
				'Safety lead',
				'en',
				${tenant.userId}::uuid,
				${visionConsent}::incident_vision_consent
			)
		`;
		await tx.$executeRaw`
			INSERT INTO incident_timeline_event (
				id,
				case_id,
				event_at,
				time_label,
				text,
				confidence
			) VALUES (
				${eventId}::uuid,
				${caseId}::uuid,
				'2026-05-05T08:05:00Z'::timestamptz,
				'Initial account',
				'Synthetic II timeline event with an attached placeholder photo.',
				'LIKELY'
			)
		`;
	});

	const upload = await photoRoute.handleTimelinePhotoUpload(
		photoUploadRequest({
			file: new File([syntheticPhotoBytes], "ii-synthetic-placeholder.png", {
				type: "image/png",
			}),
			tenantId: tenant.tenantId,
			url: `https://app.example.test/api/incidents/${caseId}/timeline/${eventId}/photos`,
			userId: tenant.userId,
		}),
		{ params: { eventId, id: caseId } },
		{ storage },
	);
	assert.equal(upload.status, 201, await responseText(upload));
	const attachment = record(record(await upload.json()).attachment);
	const attachmentId = stringField(attachment.id, "attachment.id");
	const storageKey = stringField(attachment.storageKey, "attachment.storageKey");
	assert.equal(attachment.eventId, eventId);
	assert.match(
		storageKey,
		new RegExp(`^${tenantPrefix(tenant.tenantId)}/attachments/[0-9a-f-]+\\.png$`),
	);
	const stored = await storage.get(storageKey);
	assert.deepEqual(normalizeBody(stored.body), syntheticPhotoBytes);

	return {
		attachmentId,
		caseId,
		eventId,
		photoBytes: normalizeBody(stored.body),
		storageKey,
	};
}

function visionRequest(
	tenant: SeededTenant,
	fixture: TimelinePhotoFixture,
): LLMVisionRequest {
	return {
		prompt: KNOWN_VISION_PROMPT,
		photos: [{ mimeType: "image/png", data: fixture.photoBytes }],
		options: {
			tenantId: tenant.tenantId,
			userId: tenant.userId,
			workflowId: fixture.caseId,
			locale: "en",
			promptPurpose: "mock.known-vision",
			kind: "authoring",
			requiresVision: true,
		},
	};
}

class RecordingMockProvider extends MockProvider {
	readonly visionRequests: LLMVisionRequest[] = [];

	async vision(req: LLMVisionRequest) {
		this.visionRequests.push(req);
		return super.vision(req);
	}
}

function failIfRealProviderConstructed() {
	return {
		createByokProvider: async () => {
			throw new Error("II vision negative tests must not construct BYOK providers");
		},
		createHostedSaaSProvider: () => {
			throw new Error("II vision negative tests must not construct hosted providers");
		},
		createLocalOverrideProvider: () => {
			throw new Error("II vision negative tests must not construct local providers");
		},
		createSelfHostedProvider: () => {
			throw new Error(
				"II vision negative tests must not construct self-hosted providers",
			);
		},
	};
}

async function provisionTenantSchema(
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

async function auditColumns(tenantId: string): Promise<string[]> {
	const { schema } = names(tenantId);
	const rows = await prisma.$queryRaw<Array<{ columnName: string }>>`
		SELECT column_name AS "columnName"
		FROM information_schema.columns
		WHERE table_schema = ${schema}
			AND table_name = 'vision_call_audit'
		ORDER BY ordinal_position ASC
	`;
	return rows.map((row) => row.columnName);
}

async function cleanupTenant(input: SeededTenant): Promise<void> {
	await dropTenantSchema(input.tenantId).catch(() => undefined);
	await prisma.tenantMembership.deleteMany({
		where: { tenantId: input.tenantId },
	});
	await prisma.session.deleteMany({ where: { tenantId: input.tenantId } });
	await prisma.tenant.deleteMany({ where: { id: input.tenantId } });
	await prisma.user.deleteMany({ where: { id: input.userId } });
}

function photoUploadRequest(input: {
	file: File;
	tenantId: string;
	url: string;
	userId: string;
}) {
	const formData = new FormData();
	formData.set("file", input.file);

	return new NextRequest(input.url, {
		body: formData,
		headers: {
			cookie: `${CSRF_COOKIE_NAME}=${csrfValue}`,
			accept: "application/json",
			"x-ssfw-csrf": csrfValue,
			"x-ssfw-tenant-id": input.tenantId,
			"x-ssfw-user-id": input.userId,
		},
		method: "POST",
	});
}

async function responseText(response: Response): Promise<string> {
	return response.clone().text();
}

function record(value: unknown): Record<string, unknown> {
	assert.ok(value && typeof value === "object" && !Array.isArray(value));
	return value as Record<string, unknown>;
}

function stringField(value: unknown, field: string): string {
	assert.equal(typeof value, "string", `${field} must be a string`);
	return value as string;
}

function sha256Hex(bytes: Buffer): string {
	return createHash("sha256").update(bytes).digest("hex");
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

class MemoryStorage implements Storage {
	readonly objects = new Map<string, StorageObject>();
	private readonly notFoundError: new (key: string) => Error;

	constructor(notFoundError: new (key: string) => Error) {
		this.notFoundError = notFoundError;
	}

	async put(
		key: string,
		body: StorageBody,
		options: StoragePutOptions = {},
	): Promise<StorageObjectMetadata> {
		const bodyBuffer = normalizeBody(body);
		const metadata = {
			key,
			contentType: options.contentType,
			customMetadata: options.customMetadata,
			sizeBytes: bodyBuffer.byteLength,
			updatedAt: new Date("2026-05-05T00:00:00.000Z"),
		};
		this.objects.set(key, { body: bodyBuffer, metadata });
		return metadata;
	}

	async get(key: string): Promise<StorageObject> {
		const object = this.objects.get(key);

		if (!object) {
			throw new this.notFoundError(key);
		}

		return object;
	}

	async head(key: string): Promise<StorageObjectMetadata> {
		return (await this.get(key)).metadata;
	}

	async delete(key: string): Promise<void> {
		this.objects.delete(key);
	}

	async list(
		prefix: string,
		options: StorageListOptions = {},
	): Promise<StorageListResult> {
		const limit = options.limit ?? Number.POSITIVE_INFINITY;
		const items = [...this.objects.values()]
			.map((object) => object.metadata)
			.filter((metadata) => metadata.key.startsWith(prefix));

		return {
			items: items.slice(0, limit),
			truncated: items.length > limit,
		};
	}
}

function normalizeBody(body: StorageBody): Buffer {
	if (Buffer.isBuffer(body)) {
		return body;
	}

	if (typeof body === "string") {
		return Buffer.from(body);
	}

	if (body instanceof ArrayBuffer) {
		return Buffer.from(body);
	}

	return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
}

function names(tenantId: string): {
	role: string;
	schema: string;
} {
	const suffix = tenantId.toLowerCase().replaceAll("-", "_");
	return {
		role: `role_tenant_${suffix}`,
		schema: `tenant_${suffix}`,
	};
}

function quoteIdent(value: string): string {
	return `"${String(value).replaceAll('"', '""')}"`;
}

function sqlString(value: string): string {
	return `'${String(value).replaceAll("'", "''")}'`;
}

function moduleUrl(relativePath: string): string {
	return pathToFileURL(`${process.cwd()}/${relativePath}`).href;
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith(".") || specifier.startsWith("/");
}

type SeededTenant = {
	tenantId: string;
	userId: string;
	visionEnabled: boolean;
};

type TimelinePhotoFixture = {
	attachmentId: string;
	caseId: string;
	eventId: string;
	photoBytes: Buffer;
	storageKey: string;
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
