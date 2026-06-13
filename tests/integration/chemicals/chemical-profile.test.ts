import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const dbModulePath = "../../../src/lib/db/tenancy.ts";
const { prisma, tenantDatabaseNames } = (await import(
	dbModulePath
)) as typeof import("../../../src/lib/db/tenancy");

test("chemical_profile schema is provisioned per tenant with accepted columns and constraints", async (t) => {
	if (!process.env.DATABASE_URL) {
		t.skip(
			"DATABASE_URL is required for chemical_profile schema introspection.",
		);
		return;
	}

	const tenantId = randomUUID();
	const userId = randomUUID();
	const names = tenantDatabaseNames(tenantId);

	await prisma.user.create({
		data: {
			email: `chemical-profile-${userId}@example.test`,
			id: userId,
		},
	});
	await prisma.tenant.create({
		data: {
			defaultLanguage: "en",
			id: tenantId,
			memberships: { create: { userId } },
			name: `ssfw-6jor ${tenantId}`,
		},
	});

	try {
		await prisma.$executeRawUnsafe(`CREATE SCHEMA "${names.schemaName}"`);
		await prisma.$executeRaw`SELECT "shared"."apply_chemical_profile_schema"(${names.schemaName}::name)`;

		const columns = await prisma.$queryRaw<
			Array<{ column_name: string; data_type: string; is_nullable: string }>
		>`
			SELECT column_name, data_type, is_nullable
			FROM information_schema.columns
			WHERE table_schema = ${names.schemaName}
				AND table_name = 'chemical_profile'
			ORDER BY ordinal_position
		`;

		assert.deepEqual(
			columns.map((column) => column.column_name),
			[
				"id",
				"tenant_id",
				"product_name",
				"manufacturer",
				"cas_number",
				"un_number",
				"profile_status",
				"sds_reviewed",
				"sds_reviewed_by_user_id",
				"sds_reviewed_at",
				"extraction_status",
				"storage_path",
				"created_at",
				"updated_at",
			],
		);

		const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`
			SELECT conname
			FROM pg_catalog.pg_constraint
			WHERE conrelid = (${names.schemaName} || '.chemical_profile')::regclass
			ORDER BY conname
		`;

		assert.deepEqual(
			constraints.map((constraint) => constraint.conname),
			[
				"chemical_profile_cas_number_not_blank",
				"chemical_profile_manufacturer_not_blank",
				"chemical_profile_pkey",
				"chemical_profile_product_name_not_blank",
				"chemical_profile_sds_review_pair_check",
				"chemical_profile_sds_reviewed_by_user_id_fkey",
				"chemical_profile_storage_path_tenant_check",
				"chemical_profile_tenant_id_fkey",
				"chemical_profile_un_number_not_blank",
			],
		);

		const provisioningHook = await prisma.$queryRaw<
			Array<{ has_hook: boolean }>
		>`
			SELECT pg_get_functiondef('shared.provision_tenant_schema(uuid,name)'::regprocedure)
				LIKE '%apply_chemical_profile_schema%' AS has_hook
		`;

		assert.equal(provisioningHook[0]?.has_hook, true);
	} finally {
		await prisma.$executeRawUnsafe(
			`DROP SCHEMA IF EXISTS "${names.schemaName}" CASCADE`,
		);
		await prisma.tenant.deleteMany({ where: { id: tenantId } });
		await prisma.user.deleteMany({ where: { id: userId } });
	}
});
