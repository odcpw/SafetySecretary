import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import type {
	Storage,
	StorageBody,
	StorageListOptions,
	StorageListResult,
	StorageObject,
	StorageObjectMetadata,
	StoragePutOptions,
} from "../../../src/lib/storage/types";

const isLocalImport = (specifier: string): boolean =>
	specifier.startsWith("./") || specifier.startsWith("../");

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (!context.parentURL || !isLocalImport(specifier)) {
			return nextResolve(specifier, context);
		}

		const candidates = [
			new URL(`${specifier}.ts`, context.parentURL),
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

type ArtifactRow = {
	id: string;
	outputType: string;
	versionSeq: number;
	snapshotId: string | null;
	storageKey: string;
	source: string;
	isSnapshotLinked: boolean;
};

const databaseUrl = process.env.DATABASE_URL;
let migrated = false;

const runMigrations = (): void => {
	if (migrated) {
		return;
	}

	const result = spawnSync("pnpm", ["db:migrate"], {
		cwd: process.cwd(),
		env: { ...process.env, DATABASE_URL: databaseUrl },
		encoding: "utf8",
	});

	assert.equal(
		result.status,
		0,
		`pnpm db:migrate failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
	);
	migrated = true;
};

const moduleUrl = (relativePath: string): string =>
	pathToFileURL(path.resolve(relativePath)).href;

const quoteIdent = (identifier: string): string =>
	`"${identifier.replaceAll('"', '""')}"`;

const sqlString = (value: string): string => `'${value.replaceAll("'", "''")}'`;

const storageEnv = (rootDir: string): NodeJS.ProcessEnv => ({
	...process.env,
	STORAGE_LOCAL_ROOT: rootDir,
});

const sleep = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));

if (!databaseUrl) {
	test("artifact regeneration integration", {
		skip: "DATABASE_URL is required",
	}, () => {});
} else {
	const { PrismaClient } = await import("@prisma/client");
	const { regenerate } = (await import(
		moduleUrl("src/lib/artifacts/regenerate.ts")
	)) as typeof import("../../../src/lib/artifacts/regenerate");
	const { regenerateFromSnapshot } = (await import(
		moduleUrl("src/lib/artifacts/from-snapshot.ts")
	)) as typeof import("../../../src/lib/artifacts/from-snapshot");
	const { approve } = (await import(
		moduleUrl("src/lib/snapshots/approve.ts")
	)) as typeof import("../../../src/lib/snapshots/approve");
	const { createStorageFromEnv } = (await import(
		moduleUrl("src/lib/storage/tenant.ts")
	)) as typeof import("../../../src/lib/storage/tenant");
	const { dropTenantSchema } = (await import(
		moduleUrl("src/lib/db/tenancy.ts")
	)) as typeof import("../../../src/lib/db/tenancy");
	const prisma = new PrismaClient();

	test("regeneration appends GENERATED and HAND_TUNED artifacts without overwriting storage", async () => {
		runMigrations();

		const context = await createTenantCase("ssfw-6s9-v4");
		const tempDir = await mkdtemp(path.join(tmpdir(), "ssfw-6s9-v4-"));
		const storage = createStorageFromEnv(storageEnv(tempDir));

		try {
			await regenerate(context.caseId, "toolbox-talk", "GENERATED", {
				tenantId: context.tenantId,
				generatedById: context.userId,
				storage,
			});
			await regenerate(context.caseId, "toolbox-talk", "HAND_TUNED", {
				tenantId: context.tenantId,
				generatedById: context.userId,
				storage,
				content: "operator hand tuned content\n",
			});
			await regenerate(context.caseId, "toolbox-talk", "GENERATED", {
				tenantId: context.tenantId,
				generatedById: context.userId,
				storage,
			});

			const rows = await artifactRows(context.schema, "toolbox-talk");
			assert.deepEqual(
				rows.map((row) => row.versionSeq),
				[1, 2, 3],
			);
			assert.deepEqual(
				rows.map((row) => row.source),
				["GENERATED", "HAND_TUNED", "GENERATED"],
			);
			assert.equal(new Set(rows.map((row) => row.storageKey)).size, 3);

			const bodies = await Promise.all(
				rows.map(async (row) =>
					(await storage.get(row.storageKey)).body.toString("utf8"),
				),
			);
			assert.match(bodies[0], /"versionSeq": 1/);
			assert.match(bodies[1], /operator hand tuned content/);
			assert.match(bodies[2], /"versionSeq": 3/);

			console.log(
				`DB inspection V4: ${rows
					.map((row) => `${row.source}:${row.versionSeq}:${row.storageKey}`)
					.join(", ")}`,
			);
		} finally {
			await cleanupTenant(context);
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	test("concurrent regenerations serialize on a real Postgres FOR UPDATE case-row lock", async () => {
		runMigrations();

		const context = await createTenantCase("ssfw-6s9-concurrent");
		const tempDir = await mkdtemp(path.join(tmpdir(), "ssfw-6s9-concurrent-"));
		const storage = new FirstPutDelayStorage(
			createStorageFromEnv(storageEnv(tempDir)),
			150,
		);

		try {
			await Promise.all(
				Array.from({ length: 8 }, (_, index) =>
					regenerate(context.caseId, "incident-report", "GENERATED", {
						tenantId: context.tenantId,
						generatedById: context.userId,
						storage,
						content: `concurrent payload ${index}\n`,
						transactionOptions: { timeout: 30_000 },
					}),
				),
			);

			const rows = await artifactRows(context.schema, "incident-report");
			assert.equal(rows.length, 8);
			assert.deepEqual(
				rows.map((row) => row.versionSeq),
				[1, 2, 3, 4, 5, 6, 7, 8],
			);
			assert.equal(new Set(rows.map((row) => row.versionSeq)).size, 8);
			assert.equal(new Set(rows.map((row) => row.storageKey)).size, 8);

			await Promise.all(rows.map((row) => storage.get(row.storageKey)));

			console.log(
				`DB inspection concurrent: ${rows
					.map((row) => `${row.versionSeq}:${row.id}`)
					.join(", ")}`,
			);
		} finally {
			await cleanupTenant(context);
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	test("regenerateFromSnapshot renders snapshot workflow_data, not the current draft", async () => {
		runMigrations();

		const context = await createTenantCase("ssfw-6s9-snapshot");
		const tempDir = await mkdtemp(path.join(tmpdir(), "ssfw-6s9-snapshot-"));
		const storage = createStorageFromEnv(storageEnv(tempDir));

		try {
			const snapshot = await approve(context.caseId, "II", context.userId, {
				tenantId: context.tenantId,
			});
			await prisma.$executeRawUnsafe(
				`UPDATE ${context.schema}.incident_case SET title = 'Current draft hazard changed after approval' WHERE id = ${sqlString(
					context.caseId,
				)}::uuid`,
			);

			const artifact = await regenerateFromSnapshot(
				snapshot.id,
				"snapshot-report",
				{
					tenantId: context.tenantId,
					storage,
				},
			);
			const body = (await storage.get(artifact.storageKey)).body.toString(
				"utf8",
			);
			const rows = await artifactRows(context.schema, "snapshot-report");

			assert.equal(artifact.snapshotId, snapshot.id);
			assert.equal(rows.length, 1);
			assert.equal(rows[0]?.snapshotId, snapshot.id);
			assert.match(body, /Original ssfw-6s9-snapshot hazard/);
			assert.doesNotMatch(body, /Current draft hazard changed after approval/);

			console.log(
				`DB inspection snapshot: snapshot_id=${rows[0]?.snapshotId}; version_seq=${rows[0]?.versionSeq}; storage_key=${rows[0]?.storageKey}`,
			);
		} finally {
			await cleanupTenant(context);
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	test.after(async () => {
		await prisma.$disconnect();
	});

	const createTenantCase = async (
		label: string,
	): Promise<{
		tenantId: string;
		userId: string;
		caseId: string;
		schema: string;
	}> => {
		const tenantId = randomUUID();
		const userId = randomUUID();
		const caseId = randomUUID();
		const schema = quoteIdent(`tenant_${tenantId.replaceAll("-", "_")}`);

		await prisma.$executeRawUnsafe(
			`INSERT INTO shared.users (id, email, ui_locale) VALUES (${sqlString(
				userId,
			)}::uuid, ${sqlString(`${label}-${userId}@example.invalid`)}::citext, 'en')`,
		);
		await prisma.$executeRawUnsafe(
			`INSERT INTO shared.tenants (id, name, default_language) VALUES (${sqlString(
				tenantId,
			)}::uuid, ${sqlString(label)}, 'en')`,
		);
		await prisma.$executeRawUnsafe(
			`SELECT shared.provision_tenant_schema(${sqlString(tenantId)}::uuid)`,
		);
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
				${sqlString(`Original ${label} hazard`)},
				'NEAR_MISS',
				'Safety coordinator',
				'en',
				${sqlString(userId)}::uuid
			)`,
		);

		return { tenantId, userId, caseId, schema };
	};

	const cleanupTenant = async (context: {
		tenantId: string;
		userId: string;
	}): Promise<void> => {
		await dropTenantSchema(context.tenantId, prisma).catch(() => undefined);
		await prisma.$executeRawUnsafe(
			`DELETE FROM shared.tenants WHERE id = ${sqlString(context.tenantId)}::uuid`,
		);
		await prisma.$executeRawUnsafe(
			`DELETE FROM shared.users WHERE id = ${sqlString(context.userId)}::uuid`,
		);
	};

	const artifactRows = async (
		schema: string,
		outputType: string,
	): Promise<ArtifactRow[]> => {
		return prisma.$queryRawUnsafe<ArtifactRow[]>(
			`SELECT
				id::text AS id,
				output_type AS "outputType",
				version_seq AS "versionSeq",
				snapshot_id::text AS "snapshotId",
				storage_key AS "storageKey",
				source::text AS source,
				is_snapshot_linked AS "isSnapshotLinked"
			FROM ${schema}.generated_artifact
			WHERE output_type = $1
			ORDER BY version_seq ASC`,
			outputType,
		);
	};
}

class FirstPutDelayStorage implements Storage {
	private readonly inner: Storage;
	private readonly delayMs: number;
	private delayed = false;

	constructor(inner: Storage, delayMs: number) {
		this.inner = inner;
		this.delayMs = delayMs;
	}

	async put(
		key: string,
		body: StorageBody,
		options?: StoragePutOptions,
	): Promise<StorageObjectMetadata> {
		if (!this.delayed) {
			this.delayed = true;
			await sleep(this.delayMs);
		}

		return this.inner.put(key, body, options);
	}

	get(key: string): Promise<StorageObject> {
		return this.inner.get(key);
	}

	head(key: string): Promise<StorageObjectMetadata> {
		return this.inner.head(key);
	}

	delete(key: string): Promise<void> {
		return this.inner.delete(key);
	}

	list(
		prefix: string,
		options?: StorageListOptions,
	): Promise<StorageListResult> {
		return this.inner.list(prefix, options);
	}
}
