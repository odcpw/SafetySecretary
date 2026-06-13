import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const dbModulePath = "../../../src/lib/db/tenancy.ts";
const { prisma, tenantDatabaseNames } = (await import(
	dbModulePath
)) as typeof import("../../../src/lib/db/tenancy");

test("chemical_control schema enforces provenance, review gating, and tenant SDS paths", async (t) => {
	if (!process.env.DATABASE_URL) {
		t.skip(
			"DATABASE_URL is required for chemical_control schema introspection.",
		);
		return;
	}

	const tenantId = randomUUID();
	const userId = randomUUID();
	const profileId = randomUUID();
	const manualControlId = randomUUID();
	const extractedControlId = randomUUID();
	const names = tenantDatabaseNames(tenantId);

	await prisma.user.create({
		data: {
			email: `chemical-control-${userId}@example.test`,
			id: userId,
		},
	});
	await prisma.tenant.create({
		data: {
			defaultLanguage: "en",
			id: tenantId,
			memberships: { create: { userId } },
			name: `ssfw-enj3 ${tenantId}`,
		},
	});

	try {
		await prisma.$executeRawUnsafe(`CREATE SCHEMA "${names.schemaName}"`);
		await prisma.$executeRaw`SELECT "shared"."apply_chemical_profile_schema"(${names.schemaName}::name)`;
		await prisma.$executeRaw`SELECT "shared"."apply_chemical_control_schema"(${names.schemaName}::name)`;

		const columns = await prisma.$queryRaw<
			Array<{ column_name: string; data_type: string; is_nullable: string }>
		>`
			SELECT column_name, data_type, is_nullable
			FROM information_schema.columns
			WHERE table_schema = ${names.schemaName}
				AND table_name = 'chemical_control'
			ORDER BY ordinal_position
		`;

		assert.deepEqual(
			columns.map((column) => column.column_name),
			[
				"id",
				"chemical_profile_id",
				"control_type",
				"control_text",
				"source_provenance",
				"review_status",
				"reviewed_by_user_id",
				"reviewed_at",
				"sort_order",
				"sds_section",
				"source_excerpt",
				"page_line_ref",
				"source_filename",
				"source_storage_path",
				"extraction_model_marker",
				"extraction_confidence",
				"created_at",
				"updated_at",
			],
		);

		const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`
			SELECT conname
			FROM pg_catalog.pg_constraint
			WHERE conrelid = (${names.schemaName} || '.chemical_control')::regclass
			ORDER BY conname
		`;

		assert.deepEqual(
			constraints.map((constraint) => constraint.conname),
			[
				"chemical_control_extraction_confidence_check",
				"chemical_control_extraction_model_marker_not_blank",
				"chemical_control_page_line_ref_not_blank",
				"chemical_control_pkey",
				"chemical_control_profile_id_fkey",
				"chemical_control_review_pair_check",
				"chemical_control_reviewed_by_user_id_fkey",
				"chemical_control_sds_extraction_provenance_check",
				"chemical_control_sds_section_not_blank",
				"chemical_control_sort_order_non_negative",
				"chemical_control_source_excerpt_not_blank",
				"chemical_control_source_filename_not_blank",
				"chemical_control_source_storage_path_not_blank",
				"chemical_control_text_not_blank",
			],
		);

		const triggers = await prisma.$queryRaw<Array<{ tgname: string }>>`
			SELECT trigger.tgname
			FROM pg_catalog.pg_trigger trigger
			WHERE trigger.tgrelid = (${names.schemaName} || '.chemical_control')::regclass
				AND NOT trigger.tgisinternal
			ORDER BY trigger.tgname
		`;

		assert.deepEqual(
			triggers.map((trigger) => trigger.tgname),
			["chemical_control_storage_path_tenant_trigger"],
		);

		await prisma.$executeRawUnsafe(
			`INSERT INTO "${names.schemaName}".chemical_profile (id, tenant_id, product_name, manufacturer)
			 VALUES ($1::uuid, $2::uuid, $3, $4)`,
			profileId,
			tenantId,
			"Fixture solvent",
			"Example Supplier",
		);

		await prisma.$executeRawUnsafe(
			`INSERT INTO "${names.schemaName}".chemical_control (id, chemical_profile_id, control_type, control_text)
			 VALUES ($1::uuid, $2::uuid, 'ppe', $3)`,
			manualControlId,
			profileId,
			"Wear splash goggles",
		);

		await assert.rejects(() =>
			prisma.$executeRawUnsafe(
				`INSERT INTO "${names.schemaName}".chemical_control (
					id,
					chemical_profile_id,
					control_type,
					control_text,
					source_provenance
				) VALUES ($1::uuid, $2::uuid, 'use_control', $3, 'sds_extraction')`,
				randomUUID(),
				profileId,
				"Use local exhaust ventilation",
			),
		);

		await assert.rejects(() =>
			prisma.$executeRawUnsafe(
				`INSERT INTO "${names.schemaName}".chemical_control (
					id,
					chemical_profile_id,
					control_type,
					control_text,
					source_provenance,
					sds_section,
					source_excerpt,
					source_filename,
					source_storage_path,
					extraction_model_marker
				) VALUES (
					$1::uuid,
					$2::uuid,
					'use_control',
					$3,
					'sds_extraction',
					$4,
					$5,
					$6,
					$7,
					$8
				)`,
				randomUUID(),
				profileId,
				"Use local exhaust ventilation",
				"Section 8 - Exposure Controls",
				"Use local exhaust ventilation.",
				"fixture-sds.pdf",
				`tenants/${randomUUID()}/attachments/fixture-sds.pdf`,
				"mock-llm-fixture",
			),
		);

		await assert.rejects(() =>
			prisma.$executeRawUnsafe(
				`INSERT INTO "${names.schemaName}".chemical_control (
					id,
					chemical_profile_id,
					control_type,
					control_text,
					source_provenance,
					sds_section,
					source_excerpt,
					source_filename,
					source_storage_path,
					extraction_model_marker
				) VALUES (
					$1::uuid,
					$2::uuid,
					'use_control',
					$3,
					'sds_extraction',
					$4,
					$5,
					$6,
					$7,
					$8
				)`,
				randomUUID(),
				profileId,
				"Use local exhaust ventilation",
				"Section 8 - Exposure Controls",
				"Use local exhaust ventilation.",
				"fixture-sds.pdf",
				`tenants/${tenantId}/`,
				"mock-llm-fixture",
			),
		);

		await prisma.$executeRawUnsafe(
			`INSERT INTO "${names.schemaName}".chemical_control (
				id,
				chemical_profile_id,
				control_type,
				control_text,
				source_provenance,
				sds_section,
				source_excerpt,
				source_filename,
				source_storage_path,
				extraction_model_marker,
				extraction_confidence
			) VALUES (
				$1::uuid,
				$2::uuid,
				'use_control',
				$3,
				'sds_extraction',
				$4,
				$5,
				$6,
				$7,
				$8,
				$9
			)`,
			extractedControlId,
			profileId,
			"Use local exhaust ventilation",
			"Section 8 - Exposure Controls",
			"Use local exhaust ventilation.",
			"fixture-sds.pdf",
			`tenants/${tenantId}/attachments/fixture-sds.pdf`,
			"mock-llm-fixture",
			0.72,
		);

		const rows = await prisma.$queryRawUnsafe<
			Array<{ source_provenance: string; review_status: string }>
		>(
			`SELECT source_provenance::text, review_status::text
			 FROM "${names.schemaName}".chemical_control
			 ORDER BY created_at, id`,
		);

		assert.deepEqual(rows, [
			{ review_status: "pending", source_provenance: "manual" },
			{ review_status: "pending", source_provenance: "sds_extraction" },
		]);

		const provisioningHook = await prisma.$queryRaw<
			Array<{ has_hook: boolean }>
		>`
			SELECT pg_get_functiondef('shared.provision_tenant_schema(uuid,name)'::regprocedure)
				LIKE '%apply_chemical_control_schema%' AS has_hook
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
