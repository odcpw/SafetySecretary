import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (!context.parentURL || !specifier.startsWith(".")) {
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

const dbModulePath = "../../../src/lib/db/tenancy.ts";
const { createActionFromFindingQueue } = await import(
	"../../../src/lib/actions/mutations"
);
const { actionBoardTodayKey, addDaysKey } = await import(
	"../../../src/lib/actions/filters"
);
const { loadActionManagerMetrics } = await import(
	"../../../src/lib/actions/metrics"
);

let migrated = false;
let vectorShimInstalled = false;

if (!process.env.DATABASE_URL) {
	test("action manager metrics integration requires DATABASE_URL", () => {
		assert.fail("DATABASE_URL is required for action manager metrics.");
	});
} else {
	const {
		dropTenantSchema,
		prisma,
		provisionTenantSchema,
		withTenantConnection,
	} = (await import(
		dbModulePath
	)) as typeof import("../../../src/lib/db/tenancy");

	test.after(async () => {
		await restoreVectorExtensionFunctionIfShimmed(prisma);
	});

	test("action manager metrics aggregate weekly work without analytics warehouse", async () => {
		await ensureMigrated(prisma);

		const tenantId = randomUUID();
		const userId = randomUUID();
		const profileId = randomUUID();
		const findingId = randomUUID();
		const storagePath = `tenants/${tenantId}/sds/synthetic-fixture.txt`;
		const todayKey = actionBoardTodayKey();

		await prisma.user.create({
			data: {
				email: `action-metrics-${userId}@example.test`,
				id: userId,
			},
		});
		await prisma.tenant.create({
			data: {
				defaultLanguage: "en",
				id: tenantId,
				memberships: { create: { userId } },
				name: `ssfw-9o4 ${tenantId}`,
			},
		});

		try {
			await provisionTenantSchema(tenantId, prisma);

			await withTenantConnection(tenantId, async (tx) => {
				await insertAction(tx, {
					departmentText: "Production",
					dueDate: addDaysKey(todayKey, -6),
					originType: "ii",
					ownerText: "Maintenance lead",
					status: "open",
					tenantId,
					title: "Overdue incident action",
				});
				await insertAction(tx, {
					departmentText: "Production",
					dueDate: addDaysKey(todayKey, 2),
					effectivenessResult: "needs_follow_up",
					originType: "hira",
					ownerText: "Maintenance lead",
					status: "in_progress",
					tenantId,
					title: "Due soon HIRA action",
				});
				await insertAction(tx, {
					departmentText: "Logistics",
					dueDate: addDaysKey(todayKey, -7),
					originType: "safety_walk",
					ownerText: "Safety specialist",
					status: "completed",
					tenantId,
					title: "Closed but unverified finding action",
					verificationStatus: "needed",
				});

				await tx.$executeRaw`
					INSERT INTO chemical_profile (
						id,
						tenant_id,
						product_name,
						manufacturer,
						profile_status,
						extraction_status,
						storage_path
					) VALUES (
						${profileId}::uuid,
						${tenantId}::uuid,
						'Synthetic cleaner',
						'Example manufacturer',
						'active'::chemical_profile_status,
						'review_required'::chemical_profile_extraction_status,
						${storagePath}
					)
				`;
				await tx.$executeRaw`
					INSERT INTO chemical_control (
						id,
						chemical_profile_id,
						control_type,
						control_text,
						source_provenance,
						review_status,
						sds_section,
						source_excerpt,
						source_filename,
						source_storage_path,
						extraction_model_marker
					) VALUES (
						${randomUUID()}::uuid,
						${profileId}::uuid,
						'ppe'::chemical_control_type,
						'Wear synthetic gloves.',
						'sds_extraction'::chemical_control_source_provenance,
						'pending'::chemical_control_review_status,
						'Section 8',
						'Wear synthetic gloves.',
						'synthetic-fixture.txt',
						${storagePath},
						'mock:ssfw-9o4'
					)
				`;
				await tx.$executeRaw`
					INSERT INTO finding (
						id,
						tenant_id,
						finding_type,
						intent,
						title,
						description,
						severity,
						department_text,
						location_text,
						reported_by_user_id,
						reported_at,
						status
					) VALUES (
						${findingId}::uuid,
						${tenantId}::uuid,
						'safety_walk'::finding_type,
						'hazard'::finding_intent,
						'Blocked walkway',
						'Pallets were left in the walking route.',
						'medium'::finding_severity,
						'Logistics',
						'Warehouse',
						${userId}::uuid,
						'2026-05-05T08:00:00.000Z'::timestamptz,
						'open'::finding_status
					)
				`;
			});

			const metrics = await loadActionManagerMetrics(tenantId);

			assert.equal(metrics.statusCounts.open, 1);
			assert.equal(metrics.statusCounts.in_progress, 1);
			assert.equal(metrics.statusCounts.completed, 1);
			assert.equal(metrics.openActions, 2);
			assert.equal(metrics.overdueActions, 1);
			assert.equal(metrics.dueSoonActions, 1);
			assert.equal(metrics.needsFollowUpActions, 1);
			assert.equal(metrics.unverifiedClosedActions, 1);
			assert.equal(metrics.relatedCounts.pendingSdsReviews, 1);
			assert.equal(metrics.relatedCounts.findingsWithoutLinkedAction, 1);
			assert.deepEqual(metrics.byDepartment, [
				{ count: 2, label: "Production", value: "Production" },
				{ count: 1, label: "Logistics", value: "Logistics" },
			]);
			assert.deepEqual(metrics.byAssignee, [
				{ count: 2, label: "Maintenance lead", value: "Maintenance lead" },
				{ count: 1, label: "Safety specialist", value: "Safety specialist" },
			]);
			assert.deepEqual(
				metrics.byOriginType.map((bucket) => `${bucket.value}:${bucket.count}`),
				["hira:1", "ii:1", "safety_walk:1"],
			);

			const linkedAction = await createActionFromFindingQueue({
				action: {
					originId: findingId,
					originType: "safety_walk",
					title: "Clear blocked walkway",
				},
				actorUserId: userId,
				findingId,
				tenantId,
			});
			const linkedFindingRows = await withTenantConnection(
				tenantId,
				(tx) => tx.$queryRaw<
					Array<{ actionItemId: string | null; status: string }>
				>`
					SELECT
						action_item_id::text AS "actionItemId",
						status::text AS status
					FROM finding
					WHERE id = ${findingId}::uuid
				`,
			);
			const metricsAfterLink = await loadActionManagerMetrics(tenantId);

			assert.equal(linkedAction.originId, findingId);
			assert.equal(linkedFindingRows[0]?.actionItemId, linkedAction.id);
			assert.equal(linkedFindingRows[0]?.status, "action_created");
			assert.equal(
				metricsAfterLink.relatedCounts.findingsWithoutLinkedAction,
				0,
			);
		} finally {
			await dropTenantSchema(tenantId).catch(() => undefined);
			await prisma.tenantMembership.deleteMany({ where: { tenantId } });
			await prisma.tenant.deleteMany({ where: { id: tenantId } });
			await prisma.user.deleteMany({ where: { id: userId } });
		}
	});
}

async function ensureMigrated(prismaClient: PrismaClient): Promise<void> {
	if (migrated) {
		return;
	}

	const result = spawnSync("pnpm", ["db:migrate"], {
		cwd: process.cwd(),
		encoding: "utf8",
		env: process.env,
	});

	assert.equal(
		result.status,
		0,
		`pnpm db:migrate failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
	);

	await installVectorExtensionShimIfUnavailable(prismaClient);
	migrated = true;
}

async function installVectorExtensionShimIfUnavailable(
	prismaClient: PrismaClient,
): Promise<void> {
	const rows = await prismaClient.$queryRaw<Array<{ available: boolean }>>`
		SELECT EXISTS (
			SELECT 1
			FROM pg_available_extensions
			WHERE name = 'vector'
		) AS "available"
	`;
	if (rows[0]?.available) {
		return;
	}

	await prismaClient.$executeRawUnsafe(`
		CREATE OR REPLACE FUNCTION "shared"."ensure_vector_extension"()
		RETURNS name
		LANGUAGE plpgsql
		AS $$
		BEGIN
			PERFORM "shared"."apply_approval_snapshot_schema_to_all_tenants"();
			PERFORM "shared"."apply_generated_artifact_schema_to_all_tenants"();
			PERFORM "shared"."apply_vision_call_audit_schema_to_all_tenants"();
			PERFORM "shared"."apply_cost_ledger_schema_to_all_tenants"();
			RETURN 'shared'::name;
		END
		$$;
	`);
	vectorShimInstalled = true;
	console.log(
		"DB inspection test shim: pgvector extension is unavailable; installed no-op shared.ensure_vector_extension() for action manager metrics tests",
	);
}

async function restoreVectorExtensionFunctionIfShimmed(
	prismaClient: PrismaClient,
): Promise<void> {
	if (!vectorShimInstalled) {
		return;
	}

	const result = spawnSync("pnpm", ["db:migrate"], {
		cwd: process.cwd(),
		encoding: "utf8",
		env: process.env,
	});

	assert.equal(
		result.status,
		0,
		`pnpm db:migrate failed while restoring shared.ensure_vector_extension\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
	);
	await prismaClient.$disconnect();
	vectorShimInstalled = false;
}

async function insertAction(
	tx: {
		$executeRaw: (
			query: TemplateStringsArray,
			...values: unknown[]
		) => Promise<number>;
	},
	input: {
		departmentText: string;
		dueDate: string;
		effectivenessResult?: string;
		originType: string;
		ownerText: string;
		status: string;
		tenantId: string;
		title: string;
		verificationStatus?: string;
	},
): Promise<void> {
	await tx.$executeRaw`
		INSERT INTO action_item (
			id,
			tenant_id,
			title,
			status,
			due_date,
			owner_text,
			department_text,
			origin_type,
			origin_label,
			origin_created_at,
			verification_status,
			effectiveness_result,
			completed_at
		) VALUES (
			${randomUUID()}::uuid,
			${input.tenantId}::uuid,
			${input.title},
			${input.status}::action_item_status,
			${input.dueDate}::date,
			${input.ownerText},
			${input.departmentText},
			${input.originType}::action_item_origin_type,
			${input.title},
			'2026-05-05T08:00:00.000Z'::timestamptz,
			${input.verificationStatus ?? "not_required"}::action_item_verification_status,
			${input.effectivenessResult ?? "unknown"}::action_item_effectiveness_result,
			CASE
				WHEN ${input.status}::text = 'completed'
				THEN '2026-05-05T09:00:00.000Z'::timestamptz
				ELSE NULL
			END
		)
	`;
}
