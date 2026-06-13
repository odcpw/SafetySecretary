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

const { listChemicalRecapCards } = (await import(
	moduleUrl("src/lib/chemicals/recap-queries.ts")
)) as typeof import("../../../src/lib/chemicals/recap-queries");
const { dropTenantSchema, prisma, tenantDatabaseNames, withTenantConnection } =
	(await import(
		moduleUrl("src/lib/db/index.ts")
	)) as typeof import("../../../src/lib/db");

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	test("chemical recap query", { skip: "DATABASE_URL is required" }, () => {});
} else {
	test("chemical recap query returns approved worker controls and excludes pending/rejected controls", async () => {
		ensureMigrated();
		const tenantA = await seedTenant("a");
		const tenantB = await seedTenant("b");

		try {
			const activeProfileId = randomUUID();
			const archivedProfileId = randomUUID();

			await insertProfile({
				archived: false,
				profileId: activeProfileId,
				tenantId: tenantA.tenantId,
				userId: tenantA.userId,
			});
			await insertProfile({
				archived: true,
				profileId: archivedProfileId,
				tenantId: tenantA.tenantId,
				userId: tenantA.userId,
			});
			await insertControl({
				controlText: "Wear nitrile gloves EN 374",
				controlType: "glove_type",
				profileId: activeProfileId,
				reviewStatus: "approved",
				sourceFilename: "glove-example.png",
				sourceStoragePath: `tenants/${tenantA.tenantId}/attachments/glove-example.png`,
				tenantId: tenantA.tenantId,
				userId: tenantA.userId,
			});
			await insertControl({
				controlText: "Rinse with water for 15 minutes",
				controlType: "first_aid",
				profileId: activeProfileId,
				reviewStatus: "approved",
				sourceFilename: "fixture-sds.pdf",
				sourceStoragePath: `tenants/${tenantA.tenantId}/attachments/fixture-sds.pdf`,
				tenantId: tenantA.tenantId,
				userId: tenantA.userId,
			});
			await insertControl({
				controlText: "Use closed transfer pump",
				controlType: "handling",
				profileId: activeProfileId,
				reviewStatus: "approved",
				sourceFilename: "foreign-reviewer-sds.pdf",
				sourceStoragePath: `tenants/${tenantA.tenantId}/attachments/foreign-reviewer-sds.pdf`,
				tenantId: tenantA.tenantId,
				userId: tenantB.userId,
			});
			await insertControl({
				controlText: "Wear respirator for mist",
				controlType: "respiratory",
				profileId: activeProfileId,
				reviewStatus: "approved",
				sourceFilename: "invalid-photo.png",
				sourceStoragePath: `tenants/${tenantA.tenantId}/attachments/../invalid-photo.png`,
				tenantId: tenantA.tenantId,
				userId: tenantA.userId,
			});
			await insertControl({
				controlText: "Pending face shield",
				controlType: "ppe",
				profileId: activeProfileId,
				reviewStatus: "pending",
				sourceFilename: "pending-sds.pdf",
				sourceStoragePath: `tenants/${tenantA.tenantId}/attachments/pending-sds.pdf`,
				tenantId: tenantA.tenantId,
				userId: tenantA.userId,
			});
			await insertControl({
				controlText: "Rejected storage line",
				controlType: "storage",
				profileId: activeProfileId,
				reviewStatus: "rejected",
				sourceFilename: "rejected-sds.pdf",
				sourceStoragePath: `tenants/${tenantA.tenantId}/attachments/rejected-sds.pdf`,
				tenantId: tenantA.tenantId,
				userId: tenantA.userId,
			});
			await insertControl({
				controlText: "Archived control",
				controlType: "handling",
				profileId: archivedProfileId,
				reviewStatus: "approved",
				sourceFilename: "archived-sds.pdf",
				sourceStoragePath: `tenants/${tenantA.tenantId}/attachments/archived-sds.pdf`,
				tenantId: tenantA.tenantId,
				userId: tenantA.userId,
			});

			const cards = await listChemicalRecapCards(tenantA.tenantId);

			assert.equal(cards.length, 1);
			assert.equal(cards[0]?.productName, "Fixture solvent");
			assert.equal(cards[0]?.controls.length, 4);
			assert.deepEqual(
				cards[0]?.controls.map((control) => control.controlText),
				[
					"Rinse with water for 15 minutes",
					"Wear nitrile gloves EN 374",
					"Wear respirator for mist",
					"Use closed transfer pump",
				],
			);
			assert.equal(cards[0]?.sdsReviewedByUserEmail, tenantA.email);
			assert.equal(cards[0]?.controls[0]?.reviewedByUserEmail, tenantA.email);
			assert.equal(cards[0]?.controls[1]?.sourceStorageIsImage, true);
			assert.equal(cards[0]?.controls[1]?.sourceExcerpt, "Use suitable PPE.");
			assert.equal(cards[0]?.controls[2]?.sourceStoragePath, null);
			assert.equal(cards[0]?.controls[2]?.sourceStorageIsImage, false);
			assert.equal(cards[0]?.controls[3]?.reviewedByUserEmail, null);
			assert.deepEqual(await listChemicalRecapCards(tenantB.tenantId), []);
		} finally {
			await cleanupTenant(tenantA);
			await cleanupTenant(tenantB);
		}
	});

	test.after(async () => {
		await prisma.$disconnect();
	});
}

async function seedTenant(label: string): Promise<{
	email: string;
	tenantId: string;
	userId: string;
}> {
	const tenant = await prisma.tenant.create({
		data: {
			defaultLanguage: "en",
			name: `ssfw-32br-${label}-${randomUUID()}`,
		},
	});
	const email = `ssfw-32br-${label}-${randomUUID()}@example.invalid`;
	const user = await prisma.user.create({
		data: {
			email,
			uiLocale: "en",
		},
	});
	await prisma.tenantMembership.create({
		data: {
			tenantId: tenant.id,
			userId: user.id,
		},
	});
	await provisionChemicalSchemas(tenant.id);
	return { email, tenantId: tenant.id, userId: user.id };
}

async function provisionChemicalSchemas(tenantId: string): Promise<void> {
	const names = tenantDatabaseNames(tenantId);

	await prisma.$executeRawUnsafe(
		`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ${sqlString(
			names.roleName,
		)}) THEN EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION', ${sqlString(
			names.roleName,
		)}); END IF; END $$`,
	);
	await prisma.$executeRawUnsafe(
		`GRANT ${quoteIdent(names.roleName)} TO CURRENT_USER`,
	);
	await prisma.$executeRawUnsafe(
		`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(names.schemaName)} AUTHORIZATION ${quoteIdent(
			names.roleName,
		)}`,
	);
	await prisma.$executeRawUnsafe(
		`ALTER SCHEMA ${quoteIdent(names.schemaName)} OWNER TO ${quoteIdent(
			names.roleName,
		)}`,
	);
	await prisma.$executeRawUnsafe(
		`GRANT USAGE ON SCHEMA ${quoteIdent(names.schemaName)} TO ${quoteIdent(
			names.roleName,
		)}`,
	);
	await prisma.$executeRawUnsafe(
		`GRANT USAGE ON SCHEMA "shared" TO ${quoteIdent(names.roleName)}`,
	);
	await prisma.$executeRawUnsafe(
		`SELECT shared.apply_chemical_profile_schema(${sqlString(
			names.schemaName,
		)}::name)`,
	);
	await prisma.$executeRawUnsafe(
		`SELECT shared.apply_chemical_control_schema(${sqlString(
			names.schemaName,
		)}::name)`,
	);
}

async function insertProfile(input: {
	archived: boolean;
	profileId: string;
	tenantId: string;
	userId: string;
}): Promise<void> {
	await withTenantConnection(input.tenantId, async (tx) => {
		await tx.$executeRaw`
			INSERT INTO chemical_profile (
				id,
				tenant_id,
				product_name,
				manufacturer,
				cas_number,
				un_number,
				profile_status,
				sds_reviewed,
				sds_reviewed_by_user_id,
				sds_reviewed_at,
				storage_path
			) VALUES (
				${input.profileId}::uuid,
				${input.tenantId}::uuid,
				'Fixture solvent',
				'Example Supplier',
				'64-17-5',
				'1170',
				${input.archived ? "archived" : "active"}::chemical_profile_status,
				true,
				${input.userId}::uuid,
				'2026-05-05T06:00:00Z'::timestamptz,
				${`tenants/${input.tenantId}/attachments/fixture-sds.pdf`}
			)
		`;
	});
}

async function insertControl(input: {
	controlText: string;
	controlType: string;
	profileId: string;
	reviewStatus: "approved" | "pending" | "rejected";
	sourceFilename: string;
	sourceStoragePath: string;
	tenantId: string;
	userId: string;
}): Promise<void> {
	const reviewed = input.reviewStatus === "pending" ? null : input.userId;
	const reviewedAt =
		input.reviewStatus === "pending" ? null : new Date("2026-05-05T07:00:00Z");

	await withTenantConnection(input.tenantId, async (tx) => {
		await tx.$executeRaw`
			INSERT INTO chemical_control (
				id,
				chemical_profile_id,
				control_type,
				control_text,
				source_provenance,
				review_status,
				reviewed_by_user_id,
				reviewed_at,
				sort_order,
				sds_section,
				source_excerpt,
				page_line_ref,
				source_filename,
				source_storage_path,
				extraction_model_marker,
				extraction_confidence
			) VALUES (
				${randomUUID()}::uuid,
				${input.profileId}::uuid,
				${input.controlType}::chemical_control_type,
				${input.controlText},
				'sds_extraction'::chemical_control_source_provenance,
				${input.reviewStatus}::chemical_control_review_status,
				${reviewed}::uuid,
				${reviewedAt}::timestamptz,
				0,
				'Section 8',
				'Use suitable PPE.',
				'p. 4',
				${input.sourceFilename},
				${input.sourceStoragePath},
				'mock-sds-fixture',
				0.91
			)
		`;
	});
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
