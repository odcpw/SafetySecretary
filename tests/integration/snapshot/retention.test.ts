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
import type { PrismaClient } from "@prisma/client";
import type { ArtifactSnapshotLinkedError } from "../../../src/lib/artifacts/retention";
import type { Storage } from "../../../src/lib/storage/types";

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

type SnapshotRow = {
	id: string;
	artifactRefs: unknown;
	attachmentRefs: unknown;
};

type ConstraintRow = {
	name: string;
	type: string;
	definition: string;
};

type TestContext = {
	tenantId: string;
	userId: string;
	caseId: string;
	eventId: string;
	attachmentId: string;
	originalPhotoKey: string;
	replacementPhotoKey: string;
	schema: string;
};

type ArtifactRef = {
	artifactId: string;
	outputType: string;
	storageKey: string;
	filename: string | null;
};

type AttachmentRef = {
	attachmentId: string;
	storageKey: string;
	filename: string | null;
	parentType: string;
	parentId: string;
};

const databaseUrl = process.env.DATABASE_URL;
let migrated = false;
let prismaClient: PrismaClient | null = null;
let createStorageFromEnvForTest:
	| typeof import("../../../src/lib/storage/tenant").createStorageFromEnv
	| null = null;
let dropTenantSchemaForTest:
	| typeof import("../../../src/lib/db/tenancy").dropTenantSchema
	| null = null;
let regenerate: typeof import("../../../src/lib/artifacts/regenerate").regenerate;
let regenerateFromSnapshot: typeof import("../../../src/lib/artifacts/from-snapshot").regenerateFromSnapshot;
let deleteArtifact: typeof import("../../../src/lib/artifacts/retention").deleteArtifact;
let listDeletableArtifacts: typeof import("../../../src/lib/artifacts/retention").listDeletableArtifacts;
let approve: typeof import("../../../src/lib/snapshots/approve").approve;

const moduleUrl = (relativePath: string): string =>
	pathToFileURL(path.resolve(relativePath)).href;

const quoteIdent = (identifier: string): string =>
	`"${identifier.replaceAll('"', '""')}"`;

const tenantSchema = (tenantId: string): string =>
	quoteIdent(`tenant_${tenantId.replaceAll("-", "_")}`);

const integrationTestOptions = databaseUrl
	? {}
	: { skip: "DATABASE_URL is required" };

test.before(async () => {
	if (!databaseUrl) {
		return;
	}

	const { PrismaClient } = await import("@prisma/client");
	({ regenerate } = (await import(
		moduleUrl("src/lib/artifacts/regenerate.ts")
	)) as typeof import("../../../src/lib/artifacts/regenerate"));
	({ regenerateFromSnapshot } = (await import(
		moduleUrl("src/lib/artifacts/from-snapshot.ts")
	)) as typeof import("../../../src/lib/artifacts/from-snapshot"));
	({ deleteArtifact, listDeletableArtifacts } = (await import(
		moduleUrl("src/lib/artifacts/retention.ts")
	)) as typeof import("../../../src/lib/artifacts/retention"));
	({ approve } = (await import(
		moduleUrl("src/lib/snapshots/approve.ts")
	)) as typeof import("../../../src/lib/snapshots/approve"));
	createStorageFromEnvForTest = (
		(await import(
			moduleUrl("src/lib/storage/tenant.ts")
		)) as typeof import("../../../src/lib/storage/tenant")
	).createStorageFromEnv;
	dropTenantSchemaForTest = (
		(await import(
			moduleUrl("src/lib/db/tenancy.ts")
		)) as typeof import("../../../src/lib/db/tenancy")
	).dropTenantSchema;
	const prisma = new PrismaClient();
	prismaClient = prisma;
});

test(
	"I1, I6, I8: approval links artifacts/photos and protects linked artifact files",
	integrationTestOptions,
	async () => {
		runMigrations();

		const fixture = await RetentionFixture.create("i1-i6-i8");

		try {
			await fixture.storage.put(
				fixture.context.originalPhotoKey,
				"original photo bytes",
				{ contentType: "image/jpeg" },
			);
			const generated = await regenerate(
				fixture.context.caseId,
				"safety-summary",
				"GENERATED",
				{
					tenantId: fixture.context.tenantId,
					generatedById: fixture.context.userId,
					storage: fixture.storage,
					now: new Date("2026-04-30T09:00:00.000Z"),
				},
			);
			const snapshot = await approve(
				fixture.context.caseId,
				"II",
				fixture.context.userId,
				{
					tenantId: fixture.context.tenantId,
					now: new Date("2026-04-30T09:05:00.000Z"),
				},
			);
			const persistedSnapshot = await snapshotRow(fixture.context, snapshot.id);
			const artifactRefs = artifactRefsFromSnapshot(persistedSnapshot);
			const attachmentRefs = attachmentRefsFromSnapshot(persistedSnapshot);
			const linkedRow = await artifactRow(fixture.context, generated.id);

			assert.deepEqual(
				artifactRefs.map((ref) => ({
					artifactId: ref.artifactId,
					outputType: ref.outputType,
					storageKey: ref.storageKey,
				})),
				[
					{
						artifactId: generated.id,
						outputType: "safety-summary",
						storageKey: generated.storageKey,
					},
				],
				"I1: snapshot artifact_refs point at the generated artifact row and storage key",
			);
			assert.equal(
				linkedRow.isSnapshotLinked,
				true,
				"I1/I8: approve marks referenced generated artifacts snapshot-linked",
			);
			assert.deepEqual(
				attachmentRefs.map((ref) => ({
					attachmentId: ref.attachmentId,
					storageKey: ref.storageKey,
					parentType: ref.parentType,
					parentId: ref.parentId,
				})),
				[
					{
						attachmentId: fixture.context.attachmentId,
						storageKey: fixture.context.originalPhotoKey,
						parentType: "incident_timeline_event",
						parentId: fixture.context.eventId,
					},
				],
				"I6: snapshot attachment_refs, not artifact_refs, retain photo keys",
			);

			await fixture.replaceDraftPhoto();
			await fixture.storage.put(
				fixture.context.replacementPhotoKey,
				"replacement photo bytes",
				{ contentType: "image/jpeg" },
			);

			assert.equal(
				(
					await fixture.storage.get(fixture.context.originalPhotoKey)
				).body.toString("utf8"),
				"original photo bytes",
				"I6: original photo storage key remains accessible after draft replacement",
			);
			assert.equal(
				(
					await fixture.storage.get(fixture.context.replacementPhotoKey)
				).body.toString("utf8"),
				"replacement photo bytes",
				"I6: replacement draft photo is also accessible",
			);
			assert.deepEqual(
				(
					await listDeletableArtifacts(fixture.context.caseId, {
						tenantId: fixture.context.tenantId,
					})
				).map((artifact) => artifact.id),
				[],
				"I8: snapshot-linked artifact is hidden from the deletable list",
			);
			await assert.rejects(
				() =>
					deleteArtifact(generated.id, {
						storage: fixture.storage,
						tenantId: fixture.context.tenantId,
					}),
				(error: unknown) => isLinkedArtifactError(error, generated.id),
				"I8: snapshot-linked artifact delete is rejected",
			);
			assert.equal(
				(await artifactRow(fixture.context, generated.id)).isSnapshotLinked,
				true,
				"I8: linked artifact row persists after rejected delete",
			);
			await fixture.storage.get(generated.storageKey);

			console.log(
				`DB inspection I1/I6/I8: snapshot=${snapshot.id}; linked_artifact=${generated.id}; photo_ref=${fixture.context.originalPhotoKey}`,
			);
		} finally {
			await fixture.cleanup();
		}
	},
);

test(
	"I4, I5, I7: regeneration appends distinct versions without workflow backflow",
	integrationTestOptions,
	async () => {
		runMigrations();

		const fixture = await RetentionFixture.create("i4-i5-i7");

		try {
			await regenerate(fixture.context.caseId, "toolbox-talk", "GENERATED", {
				tenantId: fixture.context.tenantId,
				generatedById: fixture.context.userId,
				storage: fixture.storage,
				content: "generated version one\n",
				now: new Date("2026-04-30T10:00:00.000Z"),
			});
			await regenerate(fixture.context.caseId, "toolbox-talk", "HAND_TUNED", {
				tenantId: fixture.context.tenantId,
				generatedById: fixture.context.userId,
				storage: fixture.storage,
				content: "hand tuned artifact text that must not edit workflow\n",
				now: new Date("2026-04-30T10:01:00.000Z"),
			});
			await Promise.all(
				Array.from({ length: 4 }, (_, index) =>
					regenerate(fixture.context.caseId, "toolbox-talk", "GENERATED", {
						tenantId: fixture.context.tenantId,
						generatedById: fixture.context.userId,
						storage: fixture.storage,
						content: `concurrent regenerated body ${index}\n`,
						transactionOptions: { timeout: 30_000 },
					}),
				),
			);
			const rows = await artifactRows(fixture.context, "toolbox-talk");

			assert.deepEqual(
				rows.map((row) => row.versionSeq),
				[1, 2, 3, 4, 5, 6],
				"I4/I7: every regeneration appends a distinct version_seq",
			);
			assert.deepEqual(
				rows.map((row) => row.source),
				[
					"GENERATED",
					"HAND_TUNED",
					"GENERATED",
					"GENERATED",
					"GENERATED",
					"GENERATED",
				],
				"I4: hand-tuned artifact interleaves in the same append-only sequence",
			);
			assert.equal(
				new Set(rows.map((row) => row.storageKey)).size,
				rows.length,
				"I4: each version has a distinct storage object",
			);
			await Promise.all(rows.map((row) => fixture.storage.get(row.storageKey)));
			assert.equal(
				await fixture.caseTitle(),
				"Retention integration case i4-i5-i7",
				"I5: artifact edits do not parse back into workflow entities",
			);

			console.log(
				`DB inspection I4/I5/I7: ${rows
					.map((row) => `${row.source}:${row.versionSeq}:${row.id}`)
					.join(", ")}`,
			);
		} finally {
			await fixture.cleanup();
		}
	},
);

test(
	"I4, I8: snapshot delete is restricted by FK, then orphan linked artifacts stay protected",
	integrationTestOptions,
	async () => {
		runMigrations();

		const fixture = await RetentionFixture.create("snapshot-delete");

		try {
			const linked = await regenerate(
				fixture.context.caseId,
				"snapshot-input",
				"GENERATED",
				{
					tenantId: fixture.context.tenantId,
					generatedById: fixture.context.userId,
					storage: fixture.storage,
					content: "artifact captured by snapshot refs\n",
					now: new Date("2026-04-30T11:00:00.000Z"),
				},
			);
			const snapshot = await approve(
				fixture.context.caseId,
				"II",
				fixture.context.userId,
				{
					tenantId: fixture.context.tenantId,
					now: new Date("2026-04-30T11:05:00.000Z"),
				},
			);
			const derived = await regenerateFromSnapshot(
				snapshot.id,
				"snapshot-derived",
				{
					tenantId: fixture.context.tenantId,
					generatedById: fixture.context.userId,
					storage: fixture.storage,
					now: new Date("2026-04-30T11:10:00.000Z"),
				},
			);
			assert.equal(
				(await artifactRow(fixture.context, derived.id)).snapshotId,
				snapshot.id,
				"I4: snapshot-derived artifact row records the source snapshot_id",
			);

			await assert.rejects(
				() => deleteSnapshotRow(fixture.context, snapshot.id),
				/generated_artifact_snapshot_id_fkey|foreign key|23503/i,
				"I4/I8: snapshot delete does not cascade over snapshot-derived artifacts",
			);

			const deletedDerived = await deleteArtifact(derived.id, {
				storage: fixture.storage,
				tenantId: fixture.context.tenantId,
			});
			assert.equal(
				deletedDerived.deleted,
				true,
				"I4: draft-only snapshot-derived artifact can be cleaned up explicitly",
			);
			assert.equal(
				await maybeArtifactRow(fixture.context, derived.id),
				null,
				"I4: explicit cleanup removes the orphan-prone derived row",
			);
			await deleteSnapshotRow(fixture.context, snapshot.id);

			assert.equal(
				(await artifactRow(fixture.context, linked.id)).isSnapshotLinked,
				true,
				"I8: is_snapshot_linked remains append-only after test-only snapshot row removal",
			);
			await assert.rejects(
				() =>
					deleteArtifact(linked.id, {
						storage: fixture.storage,
						tenantId: fixture.context.tenantId,
					}),
				(error: unknown) => isLinkedArtifactError(error, linked.id),
				"I8: orphaned linked artifact remains protected from user deletion",
			);
			await fixture.storage.get(linked.storageKey);

			console.log(
				`DB inspection snapshot-delete: snapshot=${snapshot.id}; linked_artifact=${linked.id}; derived_deleted=${derived.id}`,
			);
		} finally {
			await fixture.cleanup();
		}
	},
);

test(
	"I9: snapshot and artifact polymorphic CHECK constraints reject invalid parent shapes",
	integrationTestOptions,
	async () => {
		runMigrations();

		const fixture = await RetentionFixture.create("i9");

		try {
			const constraints = await snapshotArtifactConstraints(fixture.context);

			assertConstraintContains(
				constraints,
				"approval_snapshot_interim_ii_case_check",
				["workflow_type = 'II'", "ii_case_id IS NOT NULL"],
				"I9: approval_snapshot enforces the interim II-only parent shape",
			);
			assertConstraintContains(
				constraints,
				"generated_artifact_interim_ii_case_check",
				["workflow_type = 'II'", "ii_case_id IS NOT NULL"],
				"I9: generated_artifact enforces the interim II-only parent shape",
			);
			await assert.rejects(
				() => insertInvalidSnapshotWithoutIiCase(fixture.context),
				/approval_snapshot_interim_ii_case_check|check constraint|23514/i,
				"I9: snapshot without ii_case_id is rejected",
			);
			await assert.rejects(
				() => insertInvalidArtifactWithJhaParent(fixture.context),
				/generated_artifact_interim_ii_case_check|check constraint|23514/i,
				"I9: artifact with a second workflow parent is rejected",
			);

			console.log(
				`DB inspection I9 constraints: ${constraints
					.map((row) => `${row.name}:${row.type}`)
					.join(", ")}`,
			);
		} finally {
			await fixture.cleanup();
		}
	},
);

test.after(async () => {
	await prismaClient?.$disconnect();
	prismaClient = null;
});

class RetentionFixture {
	readonly context: TestContext;
	readonly storage: Storage;
	private readonly tempDir: string;

	private constructor(context: TestContext, storage: Storage, tempDir: string) {
		this.context = context;
		this.storage = storage;
		this.tempDir = tempDir;
	}

	static async create(label: string): Promise<RetentionFixture> {
		const tenantId = randomUUID();
		const userId = randomUUID();
		const caseId = randomUUID();
		const eventId = randomUUID();
		const attachmentId = randomUUID();
		const schema = tenantSchema(tenantId);
		const tempDir = await mkdtemp(path.join(tmpdir(), "ssfw-otr-storage-"));
		const storage = activeCreateStorageFromEnv()({
			...process.env,
			STORAGE_LOCAL_ROOT: tempDir,
		});
		const context: TestContext = {
			tenantId,
			userId,
			caseId,
			eventId,
			attachmentId,
			originalPhotoKey: `tenants/${tenantId}/attachments/${attachmentId}-original.jpg`,
			replacementPhotoKey: `tenants/${tenantId}/attachments/${attachmentId}-replacement.jpg`,
			schema,
		};

		await prismaExecute(
			"INSERT INTO shared.users (id, email, ui_locale) VALUES ($1::uuid, $2::citext, 'en')",
			userId,
			`ssfw-otr-${label}-${userId}@example.invalid`,
		);
		await prismaExecute(
			"INSERT INTO shared.tenants (id, name, default_language) VALUES ($1::uuid, $2, 'en')",
			tenantId,
			`ssfw-otr ${label}`,
		);
		await prismaExecute(
			"SELECT shared.provision_tenant_schema($1::uuid)",
			tenantId,
		);
		await insertIncidentCase(context, label);
		await insertTimelineEvent(context);
		await insertAttachment(context, context.originalPhotoKey);

		return new RetentionFixture(context, storage, tempDir);
	}

	async replaceDraftPhoto(): Promise<void> {
		await prismaExecute(
			`UPDATE ${this.context.schema}.incident_attachment
			SET storage_key = $1
			WHERE id = $2::uuid`,
			this.context.replacementPhotoKey,
			this.context.attachmentId,
		);
	}

	async caseTitle(): Promise<string> {
		const rows = await prismaQuery<{ title: string }>(
			`SELECT title
			FROM ${this.context.schema}.incident_case
			WHERE id = $1::uuid`,
			this.context.caseId,
		);

		return stringField(rows[0]?.title, "incident_case.title");
	}

	async cleanup(): Promise<void> {
		await activeDropTenantSchema()(this.context.tenantId, activePrisma()).catch(
			() => undefined,
		);
		await prismaExecute(
			"DELETE FROM shared.tenants WHERE id = $1::uuid",
			this.context.tenantId,
		);
		await prismaExecute(
			"DELETE FROM shared.users WHERE id = $1::uuid",
			this.context.userId,
		);
		await rm(this.tempDir, { recursive: true, force: true });
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

async function insertIncidentCase(
	context: TestContext,
	label: string,
): Promise<void> {
	await prismaExecute(
		`INSERT INTO ${context.schema}.incident_case (
			id,
			title,
			incident_type,
			coordinator_role,
			content_language,
			created_by
		) VALUES (
			$1::uuid,
			$2,
			'NEAR_MISS',
			'Safety coordinator',
			'en',
			$3::uuid
		)`,
		context.caseId,
		`Retention integration case ${label}`,
		context.userId,
	);
}

async function insertTimelineEvent(context: TestContext): Promise<void> {
	await prismaExecute(
		`INSERT INTO ${context.schema}.incident_timeline_event (
			id,
			case_id,
			order_index,
			text,
			confidence
		) VALUES (
			$1::uuid,
			$2::uuid,
			1,
			'Photo evidence captured before approval',
			'LIKELY'
		)`,
		context.eventId,
		context.caseId,
	);
}

async function insertAttachment(
	context: TestContext,
	storageKey: string,
): Promise<void> {
	await prismaExecute(
		`INSERT INTO ${context.schema}.incident_attachment (
			id,
			event_id,
			storage_key,
			filename,
			mime_type,
			size_bytes,
			created_by
		) VALUES (
			$1::uuid,
			$2::uuid,
			$3,
			'photo-original.jpg',
			'image/jpeg',
			20,
			$4::uuid
		)`,
		context.attachmentId,
		context.eventId,
		storageKey,
		context.userId,
	);
}

const artifactRows = async (
	context: TestContext,
	outputType: string,
): Promise<ArtifactRow[]> => {
	return prismaQuery<ArtifactRow>(
		`SELECT
			id::text AS id,
			output_type AS "outputType",
			version_seq AS "versionSeq",
			snapshot_id::text AS "snapshotId",
			storage_key AS "storageKey",
			source::text AS source,
			is_snapshot_linked AS "isSnapshotLinked"
		FROM ${context.schema}.generated_artifact
		WHERE output_type = $1
		ORDER BY version_seq ASC`,
		outputType,
	);
};

const artifactRow = async (
	context: TestContext,
	artifactId: string,
): Promise<ArtifactRow> => {
	const row = await maybeArtifactRow(context, artifactId);

	assert.ok(row, `Expected generated artifact ${artifactId} to exist.`);
	return row;
};

const maybeArtifactRow = async (
	context: TestContext,
	artifactId: string,
): Promise<ArtifactRow | null> => {
	const rows = await prismaQuery<ArtifactRow>(
		`SELECT
			id::text AS id,
			output_type AS "outputType",
			version_seq AS "versionSeq",
			snapshot_id::text AS "snapshotId",
			storage_key AS "storageKey",
			source::text AS source,
			is_snapshot_linked AS "isSnapshotLinked"
		FROM ${context.schema}.generated_artifact
		WHERE id = $1::uuid`,
		artifactId,
	);

	return rows[0] ?? null;
};

async function snapshotRow(
	context: TestContext,
	snapshotId: string,
): Promise<SnapshotRow> {
	const rows = await prismaQuery<SnapshotRow>(
		`SELECT
			id::text AS id,
			artifact_refs AS "artifactRefs",
			attachment_refs AS "attachmentRefs"
		FROM ${context.schema}.approval_snapshot
		WHERE id = $1::uuid`,
		snapshotId,
	);
	const row = rows[0];

	assert.ok(row, `Expected approval snapshot ${snapshotId} to exist.`);
	return row;
}

async function deleteSnapshotRow(
	context: TestContext,
	snapshotId: string,
): Promise<void> {
	await prismaExecute(
		`DELETE FROM ${context.schema}.approval_snapshot WHERE id = $1::uuid`,
		snapshotId,
	);
}

const snapshotArtifactConstraints = async (
	context: TestContext,
): Promise<ConstraintRow[]> => {
	return prismaQuery<ConstraintRow>(
		`SELECT
			con.conname AS name,
			con.contype AS type,
			pg_get_constraintdef(con.oid) AS definition
		FROM pg_catalog.pg_constraint con
		JOIN pg_catalog.pg_class class
			ON class.oid = con.conrelid
		JOIN pg_catalog.pg_namespace namespace
			ON namespace.oid = class.relnamespace
		WHERE namespace.nspname = $1
			AND class.relname IN ('approval_snapshot', 'generated_artifact')
			AND con.conname IN (
				'approval_snapshot_interim_ii_case_check',
				'generated_artifact_interim_ii_case_check'
			)
		ORDER BY con.conname ASC`,
		unquoteIdent(context.schema),
	);
};

async function insertInvalidSnapshotWithoutIiCase(
	context: TestContext,
): Promise<void> {
	await prismaExecute(
		`INSERT INTO ${context.schema}.approval_snapshot (
			id,
			workflow_type,
			hira_case_id,
			jha_case_id,
			ii_case_id,
			version_label,
			approved_by,
			approved_at,
			schema_version,
			workflow_data,
			artifact_refs,
			attachment_refs
		) VALUES (
			$1::uuid,
			'II',
			NULL::uuid,
			NULL::uuid,
			NULL::uuid,
			'v99',
			$2::uuid,
			CURRENT_TIMESTAMP,
			1,
			'{}'::jsonb,
			'[]'::jsonb,
			'[]'::jsonb
		)`,
		randomUUID(),
		context.userId,
	);
}

const insertInvalidArtifactWithJhaParent = async (
	context: TestContext,
): Promise<void> => {
	await prismaExecute(
		`INSERT INTO ${context.schema}.generated_artifact (
			id,
			workflow_type,
			hira_case_id,
			jha_case_id,
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
			$1::uuid,
			'II',
			NULL::uuid,
			$2::uuid,
			$3::uuid,
			'invalid-parent-shape',
			1,
			$4,
			'invalid.json',
			'application/json',
			2,
			$5::uuid,
			'GENERATED'
		)`,
		randomUUID(),
		randomUUID(),
		context.caseId,
		`tenants/${context.tenantId}/artifacts/invalid.json`,
		context.userId,
	);
};

const artifactRefsFromSnapshot = (snapshot: SnapshotRow): ArtifactRef[] => {
	assert.ok(Array.isArray(snapshot.artifactRefs), "artifact_refs is an array");
	return snapshot.artifactRefs.map((ref) => {
		const record = jsonRecord(ref);

		return {
			artifactId: stringField(record.artifactId, "artifactRef.artifactId"),
			outputType: stringField(record.outputType, "artifactRef.outputType"),
			storageKey: stringField(record.storageKey, "artifactRef.storageKey"),
			filename:
				record.filename === null
					? null
					: stringField(record.filename, "artifactRef.filename"),
		};
	});
};

function attachmentRefsFromSnapshot(snapshot: SnapshotRow): AttachmentRef[] {
	assert.ok(
		Array.isArray(snapshot.attachmentRefs),
		"attachment_refs is an array",
	);
	return snapshot.attachmentRefs.map((ref) => {
		const record = jsonRecord(ref);

		return {
			attachmentId: stringField(
				record.attachmentId,
				"attachmentRef.attachmentId",
			),
			storageKey: stringField(record.storageKey, "attachmentRef.storageKey"),
			filename:
				record.filename === null
					? null
					: stringField(record.filename, "attachmentRef.filename"),
			parentType: stringField(record.parentType, "attachmentRef.parentType"),
			parentId: stringField(record.parentId, "attachmentRef.parentId"),
		};
	});
}

function assertConstraintContains(
	constraints: readonly ConstraintRow[],
	name: string,
	fragments: readonly string[],
	message: string,
): void {
	const constraint = constraints.find((row) => row.name === name);

	assert.ok(constraint, `${message}: missing ${name}`);
	assert.equal(constraint.type, "c", `${message}: ${name} must be a CHECK`);

	for (const fragment of fragments) {
		assert.ok(
			constraint.definition.includes(fragment),
			`${message}: ${name} definition should include ${fragment}; got ${constraint.definition}`,
		);
	}
}

const isLinkedArtifactError = (error: unknown, artifactId: string): boolean => {
	const maybeError = error as Partial<ArtifactSnapshotLinkedError>;

	return (
		error instanceof Error &&
		maybeError.code === "artifact_snapshot_linked" &&
		maybeError.artifactId === artifactId
	);
};

function jsonRecord(value: unknown): Record<string, unknown> {
	assert.ok(value && typeof value === "object" && !Array.isArray(value));
	return value as Record<string, unknown>;
}

function stringField(value: unknown, fieldName: string): string {
	if (typeof value !== "string") {
		assert.fail(`${fieldName} should be a string`);
	}

	return value;
}

function unquoteIdent(value: string): string {
	assert.ok(value.startsWith('"') && value.endsWith('"'));
	return value.slice(1, -1).replaceAll('""', '"');
}

async function prismaExecute(
	sql: string,
	...values: unknown[]
): Promise<number> {
	return activePrisma().$executeRawUnsafe(sql, ...values);
}

async function prismaQuery<T>(sql: string, ...values: unknown[]): Promise<T[]> {
	return activePrisma().$queryRawUnsafe<T[]>(sql, ...values);
}

function activePrisma(): PrismaClient {
	if (!prismaClient) {
		throw new Error("Prisma client is not initialized.");
	}

	return prismaClient;
}

function activeCreateStorageFromEnv(): NonNullable<
	typeof createStorageFromEnvForTest
> {
	if (!createStorageFromEnvForTest) {
		throw new Error("createStorageFromEnv is not initialized.");
	}

	return createStorageFromEnvForTest;
}

function activeDropTenantSchema(): NonNullable<typeof dropTenantSchemaForTest> {
	if (!dropTenantSchemaForTest) {
		throw new Error("dropTenantSchema is not initialized.");
	}

	return dropTenantSchemaForTest;
}
