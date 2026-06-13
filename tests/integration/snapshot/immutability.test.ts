import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

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

type SnapshotRow = {
	id: string;
	versionLabel: string;
	workflowData: unknown;
};

type TenantCaseContext = {
	tenantId: string;
	userId: string;
	caseId: string;
	keptFactId: string;
	deletedFactId: string;
	schema: string;
};

type IntegrityCheck = {
	ok: boolean;
	expectedDigest: string;
	actualDigest: string;
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

const tenantSchema = (tenantId: string): string =>
	quoteIdent(`tenant_${tenantId.replaceAll("-", "_")}`);

if (!databaseUrl) {
	test("snapshot immutability and versioning integration", {
		skip: "DATABASE_URL is required",
	}, () => {});
} else {
	const { PrismaClient } = await import("@prisma/client");
	const { approve } = (await import(
		moduleUrl("src/lib/snapshots/approve.ts")
	)) as typeof import("../../../src/lib/snapshots/approve");
	const guardModule = (await import(
		moduleUrl("src/lib/snapshots/guard.ts")
	)) as typeof import("../../../src/lib/snapshots/guard");
	const { dropTenantSchema } = (await import(
		moduleUrl("src/lib/db/tenancy.ts")
	)) as typeof import("../../../src/lib/db/tenancy");
	const prisma = new PrismaClient();

	test("V1-V5 approval snapshots are versioned, immutable after seal, and tamper detectable", async () => {
		runMigrations();

		const context = await createTenantCase("ssfw-pwu-v1-v5");

		try {
			const v01 = await approve(context.caseId, "II", context.userId, {
				tenantId: context.tenantId,
			});
			const rowsAfterV01 = await snapshotRows(context);

			assert.equal(rowsAfterV01.length, 1, "V1 creates one sealed snapshot");
			const persistedV01 = rowsAfterV01[0];
			assert.ok(persistedV01);
			assert.equal(v01.versionLabel, "v01", "V1 starts at version label v01");
			assert.equal(persistedV01.id, v01.id);
			assert.equal(
				snapshotTitle(persistedV01.workflowData),
				"Original ssfw-pwu-v1-v5 incident",
			);
			assert.deepEqual(snapshotFacts(persistedV01.workflowData), [
				"Original kept fact",
				"Original deleted fact",
			]);

			const v01Digest = digestJson(persistedV01.workflowData);
			assert.throws(
				() => guardModule.guardSnapshotMutation("update", v01.id),
				(error: unknown) =>
					error instanceof guardModule.SnapshotImmutableError &&
					error.code === "snapshot_immutable" &&
					error.action === "update" &&
					error.snapshotId === v01.id,
				"V2 rejects application-level sealed snapshot updates",
			);
			assert.throws(
				() => guardModule.guardSnapshotMutation("delete", v01.id),
				(error: unknown) =>
					error instanceof guardModule.SnapshotImmutableError &&
					error.code === "snapshot_immutable" &&
					error.action === "delete" &&
					error.snapshotId === v01.id,
				"V5 rejects application-level write-after-seal deletes",
			);

			await editDraftWorkflow(context);
			const v01AfterDraftEdit = await snapshotRowById(context, v01.id);
			assert.equal(
				snapshotTitle(v01AfterDraftEdit.workflowData),
				"Original ssfw-pwu-v1-v5 incident",
				"V4 reads sealed case state after draft title edit",
			);
			assert.deepEqual(
				snapshotFacts(v01AfterDraftEdit.workflowData),
				["Original kept fact", "Original deleted fact"],
				"V4 reads sealed child rows after draft child edit/delete",
			);
			assert.equal(
				digestJson(v01AfterDraftEdit.workflowData),
				v01Digest,
				"V2 keeps the sealed v01 workflow_data byte-stable",
			);

			const v02 = await approve(context.caseId, "II", context.userId, {
				tenantId: context.tenantId,
			});
			const rowsAfterV02 = await snapshotRows(context);

			assert.equal(v02.versionLabel, "v02", "second approval creates v02");
			assert.deepEqual(
				rowsAfterV02.map((row) => row.versionLabel),
				["v01", "v02"],
				"V2 keeps v01 and appends v02 instead of modifying v01",
			);
			const sealedV01 = rowsAfterV02[0];
			const sealedV02 = rowsAfterV02[1];
			assert.ok(sealedV01);
			assert.ok(sealedV02);
			assert.equal(
				snapshotTitle(sealedV02.workflowData),
				"Edited ssfw-pwu-v1-v5 incident",
			);
			assert.deepEqual(snapshotFacts(sealedV02.workflowData), [
				"Edited kept fact",
			]);

			const beforeTamper = verifySnapshotIntegrity(
				sealedV01.workflowData,
				v01Digest,
			);
			assert.equal(beforeTamper.ok, true, "V3 baseline digest matches v01");

			await tamperSealedSnapshotTitle(
				context,
				v01.id,
				"Tampered sealed snapshot title",
			);
			const tamperedV01 = await snapshotRowById(context, v01.id);
			const afterTamper = verifySnapshotIntegrity(
				tamperedV01.workflowData,
				v01Digest,
			);

			assert.equal(
				afterTamper.ok,
				false,
				"V3 detects out-of-band workflow_data tampering",
			);
			assert.notEqual(afterTamper.actualDigest, afterTamper.expectedDigest);

			console.log(
				`DB inspection ssfw-pwu snapshots: ${rowsAfterV02
					.map((row) => `${row.versionLabel}:${row.id}`)
					.join(", ")}`,
			);
			console.log(
				`DB inspection ssfw-pwu integrity: before=${beforeTamper.actualDigest.slice(
					0,
					16,
				)} after=${afterTamper.actualDigest.slice(0, 16)} detected=${!afterTamper.ok}`,
			);
		} finally {
			await cleanupTenant(context);
		}
	});

	test.after(async () => {
		await prisma.$disconnect();
	});

	const createTenantCase = async (
		label: string,
	): Promise<TenantCaseContext> => {
		const tenantId = randomUUID();
		const userId = randomUUID();
		const caseId = randomUUID();
		const personId = randomUUID();
		const accountId = randomUUID();
		const keptFactId = randomUUID();
		const deletedFactId = randomUUID();
		const schema = tenantSchema(tenantId);

		await prisma.$executeRawUnsafe(
			"INSERT INTO shared.users (id, email, ui_locale) VALUES ($1::uuid, $2::citext, 'en')",
			userId,
			`${label}-${userId}@example.invalid`,
		);
		await prisma.$executeRawUnsafe(
			"INSERT INTO shared.tenants (id, name, default_language) VALUES ($1::uuid, $2, 'en')",
			tenantId,
			label,
		);
		await prisma.$executeRawUnsafe(
			"SELECT shared.provision_tenant_schema($1::uuid)",
			tenantId,
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
				$1::uuid,
				$2,
				'NEAR_MISS',
				'Safety coordinator',
				'en',
				$3::uuid
			)`,
			caseId,
			`Original ${label} incident`,
			userId,
		);
		await prisma.$executeRawUnsafe(
			`INSERT INTO ${schema}.incident_person (
				id,
				case_id,
				role,
				name
			) VALUES (
				$1::uuid,
				$2::uuid,
				'witness',
				'Initial Witness'
			)`,
			personId,
			caseId,
		);
		await prisma.$executeRawUnsafe(
			`INSERT INTO ${schema}.incident_account (
				id,
				case_id,
				person_id,
				raw_statement
			) VALUES (
				$1::uuid,
				$2::uuid,
				$3::uuid,
				'Initial statement'
			)`,
			accountId,
			caseId,
			personId,
		);
		await prisma.$executeRawUnsafe(
			`INSERT INTO ${schema}.incident_fact (
				id,
				account_id,
				order_index,
				text
			) VALUES
				($1::uuid, $2::uuid, 1, 'Original kept fact'),
				($3::uuid, $2::uuid, 2, 'Original deleted fact')`,
			keptFactId,
			accountId,
			deletedFactId,
		);

		return {
			tenantId,
			userId,
			caseId,
			keptFactId,
			deletedFactId,
			schema,
		};
	};

	const editDraftWorkflow = async (
		context: TenantCaseContext,
	): Promise<void> => {
		await prisma.$executeRawUnsafe(
			`UPDATE ${context.schema}.incident_case
			SET title = 'Edited ssfw-pwu-v1-v5 incident'
			WHERE id = $1::uuid`,
			context.caseId,
		);
		await prisma.$executeRawUnsafe(
			`UPDATE ${context.schema}.incident_fact
			SET text = 'Edited kept fact'
			WHERE id = $1::uuid`,
			context.keptFactId,
		);
		await prisma.$executeRawUnsafe(
			`DELETE FROM ${context.schema}.incident_fact
			WHERE id = $1::uuid`,
			context.deletedFactId,
		);
	};

	const snapshotRows = async (
		context: TenantCaseContext,
	): Promise<SnapshotRow[]> => {
		return prisma.$queryRawUnsafe<SnapshotRow[]>(
			`SELECT
				id::text AS id,
				version_label AS "versionLabel",
				workflow_data AS "workflowData"
			FROM ${context.schema}.approval_snapshot
			WHERE ii_case_id = $1::uuid
			ORDER BY version_label ASC`,
			context.caseId,
		);
	};

	const snapshotRowById = async (
		context: TenantCaseContext,
		snapshotId: string,
	): Promise<SnapshotRow> => {
		const rows = await prisma.$queryRawUnsafe<SnapshotRow[]>(
			`SELECT
				id::text AS id,
				version_label AS "versionLabel",
				workflow_data AS "workflowData"
			FROM ${context.schema}.approval_snapshot
			WHERE id = $1::uuid
			LIMIT 1`,
			snapshotId,
		);
		const row = rows[0];

		assert.ok(row, `Expected approval snapshot ${snapshotId} to exist.`);
		return row;
	};

	const tamperSealedSnapshotTitle = async (
		context: TenantCaseContext,
		snapshotId: string,
		title: string,
	): Promise<void> => {
		await prisma.$executeRawUnsafe(
			`UPDATE ${context.schema}.${quoteIdent("approval_snapshot")}
			SET workflow_data = jsonb_set(
				workflow_data,
				'{case,title}',
				to_jsonb($1::text),
				false
			)
			WHERE id = $2::uuid`,
			title,
			snapshotId,
		);
	};

	const cleanupTenant = async (context: TenantCaseContext): Promise<void> => {
		await dropTenantSchema(context.tenantId, prisma).catch(() => undefined);
		await prisma.$executeRawUnsafe(
			"DELETE FROM shared.tenants WHERE id = $1::uuid",
			context.tenantId,
		);
		await prisma.$executeRawUnsafe(
			"DELETE FROM shared.users WHERE id = $1::uuid",
			context.userId,
		);
	};
}

const snapshotTitle = (workflowData: unknown): string =>
	stringField(
		record(record(workflowData).case).title,
		"workflow_data.case.title",
	);

const snapshotFacts = (workflowData: unknown): string[] =>
	recordArray(recordArray(record(workflowData).accounts)[0]?.facts).map(
		(fact) =>
			stringField(record(fact).text, "workflow_data.accounts.facts.text"),
	);

const verifySnapshotIntegrity = (
	workflowData: unknown,
	expectedDigest: string,
): IntegrityCheck => {
	const actualDigest = digestJson(workflowData);

	return {
		ok: actualDigest === expectedDigest,
		expectedDigest,
		actualDigest,
	};
};

const digestJson = (value: unknown): string =>
	createHash("sha256").update(stableJson(value)).digest("hex");

const stableJson = (value: unknown): string => {
	if (Array.isArray(value)) {
		return `[${value.map(stableJson).join(",")}]`;
	}

	if (value instanceof Date) {
		return JSON.stringify(value.toISOString());
	}

	if (value && typeof value === "object") {
		return `{${Object.entries(value)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`)
			.join(",")}}`;
	}

	return JSON.stringify(value) ?? "undefined";
};

const record = (value: unknown): Record<string, unknown> => {
	assert.ok(value && typeof value === "object" && !Array.isArray(value));
	return value as Record<string, unknown>;
};

const recordArray = (value: unknown): Record<string, unknown>[] => {
	assert.ok(Array.isArray(value));
	return value.map(record);
};

const stringField = (value: unknown, fieldName: string): string => {
	if (typeof value !== "string") {
		assert.fail(`${fieldName} should be a string`);
	}

	return value;
};
