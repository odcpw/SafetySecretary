import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import type { PrismaClient } from "@prisma/client";
import type {
	ArtifactRetentionStorage,
	ArtifactSnapshotLinkedError,
	deleteArtifact,
	listDeletableArtifacts,
} from "../../../src/lib/artifacts/retention";
import type { approve } from "../../../src/lib/snapshots/approve";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (
			specifier === "./types" &&
			context.parentURL?.endsWith("/src/lib/artifacts/retention.ts")
		) {
			return localModuleUrl("src/lib/artifacts/types.ts");
		}

		if (
			specifier === "../db/tenancy" &&
			(context.parentURL?.endsWith("/src/lib/artifacts/retention.ts") ||
				context.parentURL?.endsWith("/src/lib/snapshots/approve.ts") ||
				context.parentURL?.endsWith("/src/lib/snapshots/serialise.ts"))
		) {
			return localModuleUrl("src/lib/db/tenancy.ts");
		}

		if (
			specifier === "./serialise" &&
			context.parentURL?.endsWith("/src/lib/snapshots/approve.ts")
		) {
			return localModuleUrl("src/lib/snapshots/serialise.ts");
		}

		if (
			specifier === "./types" &&
			(context.parentURL?.endsWith("/src/lib/snapshots/approve.ts") ||
				context.parentURL?.endsWith("/src/lib/snapshots/serialise.ts"))
		) {
			return localModuleUrl("src/lib/snapshots/types.ts");
		}

		return nextResolve(specifier, context);
	},
});

const databaseUrl = process.env.DATABASE_URL;
const retentionModulePath = localModuleHref("src/lib/artifacts/retention.ts");
const approveModulePath = localModuleHref("src/lib/snapshots/approve.ts");
let migrationsApplied = false;

type RetentionModule = {
	ArtifactSnapshotLinkedError: typeof ArtifactSnapshotLinkedError;
	deleteArtifact: typeof deleteArtifact;
	listDeletableArtifacts: typeof listDeletableArtifacts;
};

type ApproveModule = {
	approve: typeof approve;
};

type ArtifactSeed = {
	id: string;
	storageKey: string;
};

type ArtifactInspectionRow = {
	id: string;
	storageKey: string;
	isSnapshotLinked: boolean;
	snapshotId: string | null;
};

type SnapshotInspectionRow = {
	artifactRefs: unknown;
};

if (!databaseUrl) {
	test("artifact retention integration", {
		skip: "DATABASE_URL is required",
	}, () => {});
} else {
	test("V12 snapshot-linked artifact is not deletable and file is preserved", async () => {
		await runMigrationsOnce();
		const { ArtifactSnapshotLinkedError, deleteArtifact } = (await import(
			retentionModulePath
		)) as RetentionModule;
		const { approve } = (await import(approveModulePath)) as ApproveModule;
		const { PrismaClient } = await import("@prisma/client");
		const prisma = new PrismaClient();
		const fixture = await RetentionFixture.create(prisma, "v12");

		try {
			const artifact = await fixture.insertArtifact({
				outputType: "summary_docx",
				versionSeq: 1,
			});
			fixture.storage.put(artifact.storageKey);

			const snapshot = await approve(fixture.caseId, "II", fixture.userId, {
				tenantId: fixture.tenantId,
				now: new Date("2026-04-30T12:00:00.000Z"),
			});

			await assert.rejects(
				() =>
					deleteArtifact(artifact.id, {
						storage: fixture.storage,
						tenantId: fixture.tenantId,
					}),
				(error: unknown) =>
					error instanceof ArtifactSnapshotLinkedError &&
					error.code === "artifact_snapshot_linked" &&
					error.artifactId === artifact.id,
			);

			const row = await fixture.findArtifact(artifact.id);
			assert.equal(row?.isSnapshotLinked, true, "artifact row should persist");
			assert.equal(row?.storageKey, artifact.storageKey);
			assert.equal(
				fixture.storage.has(artifact.storageKey),
				true,
				"snapshot-linked file should remain",
			);

			const artifactRefs = await fixture.snapshotArtifactRefs(snapshot.id);
			assert.deepEqual(artifactRefs, [
				{
					artifactId: artifact.id,
					outputType: "summary_docx",
					storageKey: artifact.storageKey,
					filename: "summary_docx-v01.txt",
				},
			]);
			assert.equal(
				await fixture.artifactRefResolves(artifactRefs[0].artifactId),
				true,
				"snapshot artifact_ref should still resolve to the generated_artifact row",
			);
		} finally {
			await fixture.cleanup();
			await prisma.$disconnect();
		}
	});

	test("V13 draft-only artifact is deletable and file is removed", async () => {
		await runMigrationsOnce();
		const { deleteArtifact } = (await import(
			retentionModulePath
		)) as RetentionModule;
		const { PrismaClient } = await import("@prisma/client");
		const prisma = new PrismaClient();
		const fixture = await RetentionFixture.create(prisma, "v13");

		try {
			const artifact = await fixture.insertArtifact({
				outputType: "draft_pdf",
				versionSeq: 1,
			});
			fixture.storage.put(artifact.storageKey);

			const result = await deleteArtifact(artifact.id, {
				storage: fixture.storage,
				tenantId: fixture.tenantId,
			});

			assert.deepEqual(
				{
					artifactId: result.artifactId,
					deleted: result.deleted,
					storageKey: result.storageKey,
				},
				{
					artifactId: artifact.id,
					deleted: true,
					storageKey: artifact.storageKey,
				},
			);
			assert.equal(await fixture.findArtifact(artifact.id), null);
			assert.equal(
				fixture.storage.has(artifact.storageKey),
				false,
				"draft-only file should be removed",
			);
		} finally {
			await fixture.cleanup();
			await prisma.$disconnect();
		}
	});

	test("listDeletableArtifacts returns only draft artifacts for a mixed case", async () => {
		await runMigrationsOnce();
		const { listDeletableArtifacts } = (await import(
			retentionModulePath
		)) as RetentionModule;
		const { approve } = (await import(approveModulePath)) as ApproveModule;
		const { PrismaClient } = await import("@prisma/client");
		const prisma = new PrismaClient();
		const fixture = await RetentionFixture.create(prisma, "list");

		try {
			const linked = await fixture.insertArtifact({
				outputType: "linked_summary",
				versionSeq: 1,
			});
			await approve(fixture.caseId, "II", fixture.userId, {
				tenantId: fixture.tenantId,
				now: new Date("2026-04-30T12:15:00.000Z"),
			});
			const draft = await fixture.insertArtifact({
				outputType: "draft_summary",
				versionSeq: 2,
			});

			const deletable = await listDeletableArtifacts(fixture.caseId, {
				tenantId: fixture.tenantId,
			});

			assert.deepEqual(
				deletable.map((artifact) => ({
					id: artifact.id,
					isSnapshotLinked: artifact.isSnapshotLinked,
					storageKey: artifact.storageKey,
				})),
				[
					{
						id: draft.id,
						isSnapshotLinked: false,
						storageKey: draft.storageKey,
					},
				],
			);
			assert.equal(
				(await fixture.findArtifact(linked.id))?.isSnapshotLinked,
				true,
				"linked artifact remains hidden from deletable list",
			);
		} finally {
			await fixture.cleanup();
			await prisma.$disconnect();
		}
	});
}

class MemoryArtifactStorage implements ArtifactRetentionStorage {
	readonly keys = new Set<string>();
	readonly deletedKeys: string[] = [];

	put(storageKey: string): void {
		this.keys.add(storageKey);
	}

	has(storageKey: string): boolean {
		return this.keys.has(storageKey);
	}

	async delete(storageKey: string): Promise<void> {
		this.deletedKeys.push(storageKey);
		this.keys.delete(storageKey);
	}
}

class RetentionFixture {
	readonly storage = new MemoryArtifactStorage();
	readonly tenantId: string;
	readonly userId: string;
	readonly caseId: string;
	private readonly prisma: PrismaClient;
	private readonly tenantSchema: string;

	private constructor(
		prisma: PrismaClient,
		tenantId: string,
		userId: string,
		caseId: string,
		tenantSchema: string,
	) {
		this.prisma = prisma;
		this.tenantId = tenantId;
		this.userId = userId;
		this.caseId = caseId;
		this.tenantSchema = tenantSchema;
	}

	static async create(
		prisma: PrismaClient,
		label: string,
	): Promise<RetentionFixture> {
		const tenantId = randomUUID();
		const userId = randomUUID();
		const caseId = randomUUID();
		const tenantSchema = `tenant_${tenantId.replaceAll("-", "_")}`;
		const fixture = new RetentionFixture(
			prisma,
			tenantId,
			userId,
			caseId,
			tenantSchema,
		);

		await prisma.$executeRawUnsafe(
			`INSERT INTO shared.users (id, email, ui_locale) VALUES (${sqlString(
				userId,
			)}::uuid, ${sqlString(`ssfw-28e-${label}-${userId}@example.invalid`)}::citext, 'en')`,
		);
		await prisma.$executeRawUnsafe(
			`INSERT INTO shared.tenants (id, name, default_language) VALUES (${sqlString(
				tenantId,
			)}::uuid, ${sqlString(`ssfw-28e ${label}`)}, 'en')`,
		);
		await prisma.$executeRawUnsafe(
			`SELECT shared.provision_tenant_schema(${sqlString(tenantId)}::uuid)`,
		);
		await fixture.insertIncidentCase();

		return fixture;
	}

	async insertArtifact(input: {
		outputType: string;
		versionSeq: number;
	}): Promise<ArtifactSeed> {
		const artifactId = randomUUID();
		const storageKey = `tenants/${this.tenantId}/artifacts/${artifactId}.txt`;

		await this.prisma.$executeRawUnsafe(
			`INSERT INTO ${this.quotedSchema()}.generated_artifact (
				id,
				workflow_type,
				ii_case_id,
				output_type,
				version_seq,
				storage_key,
				filename,
				mime_type,
				size_bytes,
				generated_by,
				source
			) VALUES (
				${sqlString(artifactId)}::uuid,
				'II',
				${sqlString(this.caseId)}::uuid,
				${sqlString(input.outputType)},
				${input.versionSeq},
				${sqlString(storageKey)},
				${sqlString(`${input.outputType}-v${String(input.versionSeq).padStart(2, "0")}.txt`)},
				'text/plain',
				42,
				${sqlString(this.userId)}::uuid,
				'GENERATED'
			)`,
		);

		return { id: artifactId, storageKey };
	}

	async findArtifact(
		artifactId: string,
	): Promise<ArtifactInspectionRow | null> {
		const rows = await this.prisma.$queryRawUnsafe<ArtifactInspectionRow[]>(
			`SELECT
				id::text AS id,
				storage_key AS "storageKey",
				is_snapshot_linked AS "isSnapshotLinked",
				snapshot_id::text AS "snapshotId"
			FROM ${this.quotedSchema()}.generated_artifact
			WHERE id = ${sqlString(artifactId)}::uuid`,
		);

		return rows[0] ?? null;
	}

	async snapshotArtifactRefs(snapshotId: string): Promise<
		Array<{
			artifactId: string;
			outputType: string;
			storageKey: string;
			filename: string | null;
		}>
	> {
		const rows = await this.prisma.$queryRawUnsafe<SnapshotInspectionRow[]>(
			`SELECT artifact_refs AS "artifactRefs"
			FROM ${this.quotedSchema()}.approval_snapshot
			WHERE id = ${sqlString(snapshotId)}::uuid`,
		);
		const refs = rows[0]?.artifactRefs;
		assert.ok(Array.isArray(refs), "artifact_refs should be a JSON array");

		return refs as Array<{
			artifactId: string;
			outputType: string;
			storageKey: string;
			filename: string | null;
		}>;
	}

	async artifactRefResolves(artifactId: string): Promise<boolean> {
		return (await this.findArtifact(artifactId)) !== null;
	}

	async cleanup(): Promise<void> {
		await this.prisma.$executeRawUnsafe(
			`SELECT shared.drop_tenant_schema(${sqlString(this.tenantId)}::uuid)`,
		);
		await this.prisma.$executeRawUnsafe(
			`DELETE FROM shared.tenants WHERE id = ${sqlString(this.tenantId)}::uuid`,
		);
		await this.prisma.$executeRawUnsafe(
			`DELETE FROM shared.users WHERE id = ${sqlString(this.userId)}::uuid`,
		);
	}

	private async insertIncidentCase(): Promise<void> {
		await this.prisma.$executeRawUnsafe(
			`INSERT INTO ${this.quotedSchema()}.incident_case (
				id,
				title,
				incident_type,
				coordinator_role,
				content_language,
				created_by
			) VALUES (
				${sqlString(this.caseId)}::uuid,
				'Retention integration case',
				'NEAR_MISS',
				'Safety coordinator',
				'en',
				${sqlString(this.userId)}::uuid
			)`,
		);
	}

	private quotedSchema(): string {
		return quoteIdent(this.tenantSchema);
	}
}

async function runMigrationsOnce(): Promise<void> {
	if (migrationsApplied || process.env.SSFW_28E_SKIP_MIGRATE === "1") {
		return;
	}

	const result = spawnSync("pnpm", ["db:migrate"], {
		cwd: path.resolve("."),
		env: { ...process.env, DATABASE_URL: databaseUrl },
		encoding: "utf8",
	});

	assert.equal(
		result.status,
		0,
		`pnpm db:migrate failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
	);
	migrationsApplied = true;
}

function quoteIdent(identifier: string): string {
	return `"${identifier.replaceAll('"', '""')}"`;
}

function sqlString(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}

function localModuleHref(relativePath: string): string {
	return pathToFileURL(path.resolve(relativePath)).href;
}

function localModuleUrl(relativePath: string) {
	return {
		shortCircuit: true,
		url: localModuleHref(relativePath),
	};
}
