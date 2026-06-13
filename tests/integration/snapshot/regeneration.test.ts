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
	filename: string | null;
	source: string;
	isSnapshotLinked: boolean;
};

type TestContext = {
	tenantId: string;
	userId: string;
	caseId: string;
	schema: string;
};

const databaseUrl = process.env.DATABASE_URL;
let migrated = false;

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

const withTimeout = async <T>(
	promise: Promise<T>,
	ms: number,
	message: string,
): Promise<T> => {
	let timeout: NodeJS.Timeout | undefined;
	const timeoutPromise = new Promise<never>((_, reject) => {
		timeout = setTimeout(() => reject(new Error(message)), ms);
	});

	try {
		return await Promise.race([promise, timeoutPromise]);
	} finally {
		if (timeout) {
			clearTimeout(timeout);
		}
	}
};

if (!databaseUrl) {
	test("snapshot regeneration V9-V13", {
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

	test("V9 regeneration increments version_seq for the same output", async () => {
		runMigrations();

		const context = await createTenantCase("ssfw-jzz-v9");
		const tempDir = await mkdtemp(path.join(tmpdir(), "ssfw-jzz-v9-"));
		const storage = createStorageFromEnv(storageEnv(tempDir));

		try {
			const first = await regenerate(context.caseId, "v9-report", "GENERATED", {
				tenantId: context.tenantId,
				generatedById: context.userId,
				storage,
			});
			const second = await regenerate(
				context.caseId,
				"v9-report",
				"GENERATED",
				{
					tenantId: context.tenantId,
					generatedById: context.userId,
					storage,
				},
			);
			const rows = await artifactRows(context.schema, "v9-report");

			assert.equal(first.versionSeq, 1);
			assert.equal(second.versionSeq, 2);
			assert.deepEqual(
				rows.map((row) => row.versionSeq),
				[1, 2],
			);
			assert.notEqual(rows[0]?.id, rows[1]?.id);
			assert.notEqual(rows[0]?.storageKey, rows[1]?.storageKey);
			assert.match(
				(await storage.get(second.storageKey)).body.toString("utf8"),
				/"versionSeq": 2/,
			);
			console.log(
				`DB inspection V9: ${rows
					.map((row) => `${row.versionSeq}:${row.id}:${row.storageKey}`)
					.join(", ")}`,
			);
		} finally {
			await cleanupTenant(context);
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	test("V10 regeneration from a sealed snapshot creates a new snapshot-scoped artifact row", async () => {
		runMigrations();

		const context = await createTenantCase("ssfw-jzz-v10");
		const tempDir = await mkdtemp(path.join(tmpdir(), "ssfw-jzz-v10-"));
		const storage = createStorageFromEnv(storageEnv(tempDir));

		try {
			const draftArtifact = await regenerate(
				context.caseId,
				"v10-report",
				"GENERATED",
				{
					tenantId: context.tenantId,
					generatedById: context.userId,
					storage,
				},
			);
			const snapshot = await approve(context.caseId, "II", context.userId, {
				tenantId: context.tenantId,
			});
			await prisma.$executeRawUnsafe(
				`UPDATE ${context.schema}.incident_case
				 SET title = 'Current draft edited after sealed snapshot'
				 WHERE id = ${sqlString(context.caseId)}::uuid`,
			);

			const snapshotArtifact = await regenerateFromSnapshot(
				snapshot.id,
				"v10-report",
				{
					tenantId: context.tenantId,
					generatedById: context.userId,
					storage,
				},
			);
			const rows = await artifactRows(context.schema, "v10-report");
			const body = (
				await storage.get(snapshotArtifact.storageKey)
			).body.toString("utf8");

			assert.equal(rows.length, 2);
			assert.equal(snapshotArtifact.snapshotId, snapshot.id);
			assert.equal(snapshotArtifact.versionSeq, 2);
			assert.notEqual(snapshotArtifact.id, draftArtifact.id);
			assert.deepEqual(
				rows.map((row) => row.snapshotId),
				[null, snapshot.id],
			);
			assert.deepEqual(
				rows.map((row) => row.isSnapshotLinked),
				[true, false],
			);
			assert.match(body, /Original ssfw-jzz-v10 incident/);
			assert.doesNotMatch(body, /Current draft edited after sealed snapshot/);
			console.log(
				`DB inspection V10: snapshot=${snapshot.id}; artifacts=${rows
					.map((row) => `${row.versionSeq}:${row.snapshotId ?? "draft"}`)
					.join(", ")}`,
			);
		} finally {
			await cleanupTenant(context);
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	test("V11 version ordering is monotonic ascending and descending", async () => {
		runMigrations();

		const context = await createTenantCase("ssfw-jzz-v11");
		const tempDir = await mkdtemp(path.join(tmpdir(), "ssfw-jzz-v11-"));
		const storage = createStorageFromEnv(storageEnv(tempDir));

		try {
			for (let index = 0; index < 5; index += 1) {
				await regenerate(context.caseId, "v11-report", "GENERATED", {
					tenantId: context.tenantId,
					generatedById: context.userId,
					storage,
					content: `v11 payload ${index}\n`,
				});
			}

			const ascendingRows = await artifactRows(context.schema, "v11-report");
			const descendingRows = await artifactRows(context.schema, "v11-report", {
				order: "desc",
			});

			assert.deepEqual(
				ascendingRows.map((row) => row.versionSeq),
				[1, 2, 3, 4, 5],
			);
			assert.deepEqual(
				descendingRows.map((row) => row.versionSeq),
				[5, 4, 3, 2, 1],
			);
			assert.deepEqual(
				ascendingRows.map((row) => row.filename),
				[
					"v11-report-v01.json",
					"v11-report-v02.json",
					"v11-report-v03.json",
					"v11-report-v04.json",
					"v11-report-v05.json",
				],
			);
			assert.equal(new Set(ascendingRows.map((row) => row.versionSeq)).size, 5);
			console.log(
				`DB inspection V11 ascending=${ascendingRows
					.map((row) => row.versionSeq)
					.join(",")} descending=${descendingRows
					.map((row) => row.versionSeq)
					.join(",")}`,
			);
		} finally {
			await cleanupTenant(context);
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	test("V12 concurrent regeneration is serialized by the FOR UPDATE guard", async () => {
		runMigrations();

		const context = await createTenantCase("ssfw-jzz-v12");
		const tempDir = await mkdtemp(path.join(tmpdir(), "ssfw-jzz-v12-"));
		const storage = new FirstPutGateStorage(
			createStorageFromEnv(storageEnv(tempDir)),
		);
		const pendingRegenerations: Promise<unknown>[] = [];

		try {
			const first = regenerate(context.caseId, "v12-report", "GENERATED", {
				tenantId: context.tenantId,
				generatedById: context.userId,
				storage,
				content: "v12 first payload\n",
				transactionOptions: { timeout: 30_000 },
			});
			pendingRegenerations.push(first);
			await withTimeout(
				storage.waitForFirstPut(),
				5_000,
				"first regeneration did not reach storage.put",
			);

			const second = regenerate(context.caseId, "v12-report", "GENERATED", {
				tenantId: context.tenantId,
				generatedById: context.userId,
				storage,
				content: "v12 second payload\n",
				transactionOptions: { timeout: 30_000 },
			});
			pendingRegenerations.push(second);
			await sleep(250);

			assert.equal(
				storage.putStarts.length,
				1,
				"second regeneration should be blocked before storage.put while the first transaction holds the case row FOR UPDATE lock",
			);

			storage.releaseFirstPut();
			const artifacts = await Promise.all([first, second]);
			const rows = await artifactRows(context.schema, "v12-report");

			assert.deepEqual(
				artifacts.map((artifact) => artifact.versionSeq),
				[1, 2],
			);
			assert.deepEqual(
				rows.map((row) => row.versionSeq),
				[1, 2],
			);
			assert.equal(new Set(rows.map((row) => row.storageKey)).size, 2);
			console.log(
				`DB inspection V12: blocked_puts_before_release=1; rows=${rows
					.map((row) => `${row.versionSeq}:${row.id}`)
					.join(", ")}`,
			);
		} finally {
			storage.releaseFirstPut();
			await Promise.allSettled(pendingRegenerations);
			await cleanupTenant(context);
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	test("V13 clean-slate regeneration from an empty artifact state works", async () => {
		runMigrations();

		const context = await createTenantCase("ssfw-jzz-v13");
		const tempDir = await mkdtemp(path.join(tmpdir(), "ssfw-jzz-v13-"));
		const storage = createStorageFromEnv(storageEnv(tempDir));

		try {
			assert.deepEqual(await artifactRows(context.schema, "v13-report"), []);

			const artifact = await regenerate(
				context.caseId,
				"v13-report",
				"GENERATED",
				{
					tenantId: context.tenantId,
					generatedById: context.userId,
					storage,
				},
			);
			const rows = await artifactRows(context.schema, "v13-report");
			const body = (await storage.get(artifact.storageKey)).body.toString(
				"utf8",
			);

			assert.equal(artifact.versionSeq, 1);
			assert.equal(artifact.snapshotId, null);
			assert.equal(rows.length, 1);
			assert.equal(rows[0]?.versionSeq, 1);
			assert.equal(rows[0]?.source, "GENERATED");
			assert.equal(rows[0]?.isSnapshotLinked, false);
			assert.match(body, /Original ssfw-jzz-v13 incident/);
			console.log(
				`DB inspection V13: artifact=${artifact.id}; version_seq=${artifact.versionSeq}; storage_key=${artifact.storageKey}`,
			);
		} finally {
			await cleanupTenant(context);
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	test.after(async () => {
		await prisma.$disconnect();
	});

	const createTenantCase = async (label: string): Promise<TestContext> => {
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
				${sqlString(`Original ${label} incident`)},
				'NEAR_MISS',
				'Safety coordinator',
				'en',
				${sqlString(userId)}::uuid
			)`,
		);

		return { tenantId, userId, caseId, schema };
	};

	const cleanupTenant = async (context: TestContext): Promise<void> => {
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
		options: { order?: "asc" | "desc" } = {},
	): Promise<ArtifactRow[]> => {
		const direction = options.order === "desc" ? "DESC" : "ASC";
		return prisma.$queryRawUnsafe<ArtifactRow[]>(
			`SELECT
				id::text AS id,
				output_type AS "outputType",
				version_seq AS "versionSeq",
				snapshot_id::text AS "snapshotId",
				storage_key AS "storageKey",
				filename,
				source::text AS source,
				is_snapshot_linked AS "isSnapshotLinked"
			FROM ${schema}.generated_artifact
			WHERE output_type = $1
			ORDER BY version_seq ${direction}, id ASC`,
			outputType,
		);
	};
}

class FirstPutGateStorage implements Storage {
	readonly putStarts: string[] = [];
	private firstPutResolver: (() => void) | undefined;
	private readonly firstPutStarted: Promise<void>;
	private readonly inner: Storage;
	private releaseFirstPutResolver: (() => void) | undefined;
	private firstPutRelease: Promise<void>;

	constructor(inner: Storage) {
		this.inner = inner;
		this.firstPutStarted = new Promise((resolve) => {
			this.firstPutResolver = resolve;
		});
		this.firstPutRelease = new Promise((resolve) => {
			this.releaseFirstPutResolver = resolve;
		});
	}

	async put(
		key: string,
		body: StorageBody,
		options?: StoragePutOptions,
	): Promise<StorageObjectMetadata> {
		this.putStarts.push(key);

		if (this.putStarts.length === 1) {
			this.firstPutResolver?.();
			await this.firstPutRelease;
		}

		return this.inner.put(key, body, options);
	}

	waitForFirstPut(): Promise<void> {
		return this.firstPutStarted;
	}

	releaseFirstPut(): void {
		this.releaseFirstPutResolver?.();
		this.firstPutRelease = Promise.resolve();
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

function runMigrations(): void {
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
}
