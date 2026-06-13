import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

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

const {
	FINDING_INTENTS,
	FINDING_ORIGIN_SEVERITIES,
	FINDING_ORIGIN_STATUSES,
	FINDING_ORIGIN_TYPES,
	prepareFindingActionInput,
	prepareFindingForStorage,
} = await import("../../../src/lib/findings/finding-origin");
const { prepareActionItemForStorage } = await import(
	"../../../src/lib/actions/action-item"
);

const dbModulePath = "../../../src/lib/db/tenancy.ts";

let migrated = false;

if (!process.env.DATABASE_URL) {
	test("finding origin integration requires DATABASE_URL", () => {
		assert.fail("DATABASE_URL is required for finding origin integration.");
	});
} else {
	const {
		dropTenantSchema,
		prisma,
		provisionTenantSchema,
		tenantDatabaseNames,
		withTenantConnection,
	} = (await import(
		dbModulePath
	)) as typeof import("../../../src/lib/db/tenancy");

	test("finding schema provisions tenant findings and action origin bridge", async () => {
		await ensureMigrated();

		const tenantId = randomUUID();
		const otherTenantId = randomUUID();
		const userId = randomUUID();
		const otherUserId = randomUUID();
		const names = tenantDatabaseNames(tenantId);
		const otherNames = tenantDatabaseNames(otherTenantId);

		await prisma.user.createMany({
			data: [
				{ email: `finding-${userId}@example.test`, id: userId },
				{ email: `finding-${otherUserId}@example.test`, id: otherUserId },
			],
		});
		await prisma.tenant.create({
			data: {
				defaultLanguage: "en",
				id: tenantId,
				memberships: { create: { userId } },
				name: `ssfw-evsi ${tenantId}`,
			},
		});
		await prisma.tenant.create({
			data: {
				defaultLanguage: "en",
				id: otherTenantId,
				memberships: { create: { userId: otherUserId } },
				name: `ssfw-evsi other ${otherTenantId}`,
			},
		});

		try {
			await provisionTenantSchema(tenantId, prisma);
			await provisionTenantSchema(otherTenantId, prisma);

			const columns = await prisma.$queryRaw<
				Array<{ column_name: string; is_nullable: string }>
			>`
				SELECT column_name, is_nullable
				FROM information_schema.columns
				WHERE table_schema = ${names.schemaName}
					AND table_name = 'finding'
				ORDER BY ordinal_position
			`;
			assert.deepEqual(
				columns.map((column) => column.column_name),
				[
					"id",
					"tenant_id",
					"finding_type",
					"intent",
					"title",
					"description",
					"severity",
					"department_text",
					"location_text",
					"work_as_done_context",
					"reported_by_user_id",
					"reported_at",
					"status",
					"photo_storage_path",
					"action_item_id",
					"created_at",
					"updated_at",
				],
			);
			assert.equal(
				columns.find((column) => column.column_name === "reported_by_user_id")
					?.is_nullable,
				"NO",
			);

			const enumValues = await prisma.$queryRaw<
				Array<{ typname: string; enumlabel: string }>
			>`
				SELECT type.typname, enum.enumlabel
				FROM pg_catalog.pg_type type
				JOIN pg_catalog.pg_namespace namespace
					ON namespace.oid = type.typnamespace
				JOIN pg_catalog.pg_enum enum
					ON enum.enumtypid = type.oid
				WHERE namespace.nspname = ${names.schemaName}
					AND type.typname LIKE 'finding_%'
				ORDER BY type.typname, enum.enumsortorder
			`;
			assert.deepEqual(
				enumValues.map((row) => `${row.typname}:${row.enumlabel}`),
				[
					...FINDING_INTENTS.map((value) => `finding_intent:${value}`),
					...FINDING_ORIGIN_SEVERITIES.map(
						(value) => `finding_severity:${value}`,
					),
					...FINDING_ORIGIN_STATUSES.map((value) => `finding_status:${value}`),
					...FINDING_ORIGIN_TYPES.map((value) => `finding_type:${value}`),
				],
			);

			const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`
				SELECT conname
				FROM pg_catalog.pg_constraint
				WHERE conrelid = (${names.schemaName} || '.finding')::regclass
				ORDER BY conname
			`;
			assert.deepEqual(
				constraints.map((constraint) => constraint.conname),
				[
					"finding_action_created_link_check",
					"finding_action_item_id_fkey",
					"finding_action_item_id_key",
					"finding_department_text_not_blank",
					"finding_description_not_blank",
					"finding_location_text_not_blank",
					"finding_photo_storage_path_not_blank",
					"finding_photo_storage_path_tenant_check",
					"finding_pkey",
					"finding_reported_by_user_id_fkey",
					"finding_tenant_id_fkey",
					"finding_tenant_schema_check",
					"finding_title_not_blank",
					"finding_work_as_done_context_not_blank",
				],
			);
			const actionFkRules = await prisma.$queryRaw<
				Array<{ confdeltype: string }>
			>`
				SELECT confdeltype
				FROM pg_catalog.pg_constraint
				WHERE conrelid = (${names.schemaName} || '.finding')::regclass
					AND conname = 'finding_action_item_id_fkey'
			`;
			assert.deepEqual(actionFkRules, [{ confdeltype: "r" }]);

			const finding = prepareFindingForStorage({
				departmentText: "Production",
				description: "Operator stopped and asked before restart.",
				findingType: "safety_walk",
				id: randomUUID(),
				intent: "good_catch",
				locationText: "Line 2",
				photoStoragePath: `tenants/${tenantId}/findings/photo.jpg`,
				reportedAt: "2026-05-05T08:30:00.000Z",
				reportedByUserId: userId,
				severity: "medium",
				tenantId,
				title: "Guard open during setup",
				workAsDoneContext: "Changeover was under time pressure.",
			});
			const action = prepareActionItemForStorage(
				prepareFindingActionInput(finding),
			);

			await withTenantConnection(tenantId, async (tx) => {
				await tx.$executeRawUnsafe(
					`INSERT INTO action_item (
						id,
						tenant_id,
						title,
						description,
						origin_type,
						origin_id,
						origin_label,
						origin_created_at,
						priority
					) VALUES (
						$1::uuid,
						$2::uuid,
						$3,
						$4,
						$5::action_item_origin_type,
						$6::uuid,
						$7,
						$8::timestamptz,
						$9::action_item_priority
					)`,
					action.id,
					action.tenantId,
					action.title,
					action.description,
					action.originType,
					action.originId,
					action.originLabel,
					action.originCreatedAt,
					action.priority,
				);
				await tx.$executeRawUnsafe(
					`INSERT INTO finding (
						id,
						tenant_id,
						finding_type,
						intent,
						title,
						description,
						severity,
						department_text,
						location_text,
						work_as_done_context,
						reported_by_user_id,
						reported_at,
						status,
						photo_storage_path,
						action_item_id
					) VALUES (
						$1::uuid,
						$2::uuid,
						$3::finding_type,
						$4::finding_intent,
						$5,
						$6,
						$7::finding_severity,
						$8,
						$9,
						$10,
						$11::uuid,
						$12::timestamptz,
						'action_created',
						$13,
						$14::uuid
					)`,
					finding.id,
					finding.tenantId,
					finding.findingType,
					finding.intent,
					finding.title,
					finding.description,
					finding.severity,
					finding.departmentText,
					finding.locationText,
					finding.workAsDoneContext,
					finding.reportedByUserId,
					finding.reportedAt,
					finding.photoStoragePath,
					action.id,
				);
			});

			const bridgeRows = await withTenantConnection(
				tenantId,
				(tx) =>
					tx.$queryRaw<
						Array<{
							action_origin_id: string;
							action_origin_label: string;
							action_origin_type: string;
							intent: string;
							status: string;
						}>
					>`
						SELECT
							finding.intent,
							finding.status,
							action_item.origin_id::text AS action_origin_id,
							action_item.origin_label AS action_origin_label,
							action_item.origin_type::text AS action_origin_type
						FROM finding
						JOIN action_item ON action_item.id = finding.action_item_id
						WHERE finding.id = ${finding.id}::uuid
					`,
			);
			assert.deepEqual(bridgeRows, [
				{
					action_origin_id: finding.id,
					action_origin_label: "Safety walk: Line 2 (2026-05-05)",
					action_origin_type: "safety_walk",
					intent: "good_catch",
					status: "action_created",
				},
			]);

			await assert.rejects(() =>
				withTenantConnection(tenantId, (tx) =>
					tx.$executeRawUnsafe(
						`DELETE FROM action_item WHERE id = $1::uuid`,
						action.id,
					),
				),
			);

			const openLinkedFinding = prepareFindingForStorage({
				description: "Open finding with linked action.",
				findingType: "meeting",
				id: randomUUID(),
				locationText: "Maintenance room",
				reportedAt: "2026-05-05T08:45:00.000Z",
				reportedByUserId: userId,
				severity: "medium",
				tenantId,
				title: "Open linked finding",
			});
			const openLinkedAction = prepareActionItemForStorage(
				prepareFindingActionInput(openLinkedFinding),
			);
			await withTenantConnection(tenantId, async (tx) => {
				await tx.$executeRawUnsafe(
					`INSERT INTO action_item (
						id,
						tenant_id,
						title,
						description,
						origin_type,
						origin_id,
						origin_label,
						origin_created_at,
						priority
					) VALUES (
						$1::uuid,
						$2::uuid,
						$3,
						$4,
						$5::action_item_origin_type,
						$6::uuid,
						$7,
						$8::timestamptz,
						$9::action_item_priority
					)`,
					openLinkedAction.id,
					openLinkedAction.tenantId,
					openLinkedAction.title,
					openLinkedAction.description,
					openLinkedAction.originType,
					openLinkedAction.originId,
					openLinkedAction.originLabel,
					openLinkedAction.originCreatedAt,
					openLinkedAction.priority,
				);
				await tx.$executeRawUnsafe(
					`INSERT INTO finding (
						id,
						tenant_id,
						finding_type,
						intent,
						title,
						description,
						severity,
						location_text,
						reported_by_user_id,
						reported_at,
						action_item_id
					) VALUES (
						$1::uuid,
						$2::uuid,
						'meeting',
						'hazard',
						$3,
						$4,
						$5::finding_severity,
						$6,
						$7::uuid,
						$8::timestamptz,
						$9::uuid
					)`,
					openLinkedFinding.id,
					openLinkedFinding.tenantId,
					openLinkedFinding.title,
					openLinkedFinding.description,
					openLinkedFinding.severity,
					openLinkedFinding.locationText,
					openLinkedFinding.reportedByUserId,
					openLinkedFinding.reportedAt,
					openLinkedAction.id,
				);
			});
			await assert.rejects(() =>
				withTenantConnection(tenantId, (tx) =>
					tx.$executeRawUnsafe(
						`DELETE FROM action_item WHERE id = $1::uuid`,
						openLinkedAction.id,
					),
				),
			);
			await assert.rejects(() =>
				withTenantConnection(tenantId, (tx) =>
					tx.$executeRawUnsafe(
						`UPDATE finding SET title = $1 WHERE id = $2::uuid`,
						"Changed linked title",
						openLinkedFinding.id,
					),
				),
			);

			const unrelatedAction = prepareActionItemForStorage({
				description: "Unrelated manual action.",
				originType: "manual",
				tenantId,
				title: "Unrelated action",
			});
			await withTenantConnection(tenantId, (tx) =>
				tx.$executeRawUnsafe(
					`INSERT INTO action_item (
						id,
						tenant_id,
						title,
						description,
						origin_type,
						origin_id,
						origin_label,
						origin_created_at,
						priority
					) VALUES (
						$1::uuid,
						$2::uuid,
						$3,
						$4,
						$5::action_item_origin_type,
						$6::uuid,
						$7,
						$8::timestamptz,
						$9::action_item_priority
					)`,
					unrelatedAction.id,
					unrelatedAction.tenantId,
					unrelatedAction.title,
					unrelatedAction.description,
					unrelatedAction.originType,
					unrelatedAction.originId,
					unrelatedAction.originLabel,
					unrelatedAction.originCreatedAt,
					unrelatedAction.priority,
				),
			);

			await assert.rejects(() =>
				withTenantConnection(tenantId, (tx) =>
					tx.$executeRawUnsafe(
						`INSERT INTO finding (
							id,
							tenant_id,
							finding_type,
							intent,
							title,
							description,
							severity,
							reported_by_user_id,
							reported_at,
							status,
							action_item_id
						) VALUES (
							$1::uuid,
							$2::uuid,
							'meeting',
							'hazard',
							$3,
							$4,
							'high',
							$5::uuid,
							$6::timestamptz,
							'action_created',
							$7::uuid
						)`,
						randomUUID(),
						tenantId,
						"Mismatched action",
						"Should fail.",
						userId,
						"2026-05-05T09:00:00.000Z",
						unrelatedAction.id,
					),
				),
			);

			const badLabelFindingId = randomUUID();
			const badLabelReportedAt = new Date("2026-05-05T10:00:00.000Z");
			const badLabelAction = prepareActionItemForStorage({
				description: "Matching origin fields with a wrong label.",
				originCreatedAt: badLabelReportedAt,
				originId: badLabelFindingId,
				originType: "safety_walk",
				tenantId,
				title: "Bad label action",
			});
			await withTenantConnection(tenantId, (tx) =>
				tx.$executeRawUnsafe(
					`INSERT INTO action_item (
						id,
						tenant_id,
						title,
						description,
						origin_type,
						origin_id,
						origin_label,
						origin_created_at,
						priority
					) VALUES (
						$1::uuid,
						$2::uuid,
						$3,
						$4,
						$5::action_item_origin_type,
						$6::uuid,
						$7,
						$8::timestamptz,
						$9::action_item_priority
					)`,
					badLabelAction.id,
					badLabelAction.tenantId,
					badLabelAction.title,
					badLabelAction.description,
					badLabelAction.originType,
					badLabelAction.originId,
					"Wrong origin label",
					badLabelAction.originCreatedAt,
					badLabelAction.priority,
				),
			);

			await assert.rejects(() =>
				withTenantConnection(tenantId, (tx) =>
					tx.$executeRawUnsafe(
						`INSERT INTO finding (
							id,
							tenant_id,
							finding_type,
							intent,
							title,
							description,
							severity,
							location_text,
							reported_by_user_id,
							reported_at,
							status,
							action_item_id
						) VALUES (
							$1::uuid,
							$2::uuid,
							'safety_walk',
							'hazard',
							$3,
							$4,
							'high',
							$5,
							$6::uuid,
							$7::timestamptz,
							'action_created',
							$8::uuid
						)`,
						badLabelFindingId,
						tenantId,
						"Bad label source",
						"Should fail.",
						"Line 8",
						userId,
						badLabelReportedAt,
						badLabelAction.id,
					),
				),
			);

			const nullOriginFindingId = randomUUID();
			const nullOriginReportedAt = new Date("2026-05-05T10:30:00.000Z");
			const nullOriginAction = prepareActionItemForStorage({
				description: "Null origin id should not bridge.",
				originCreatedAt: nullOriginReportedAt,
				originId: null,
				originLabel: "Safety walk: Line 9 (2026-05-05)",
				originType: "safety_walk",
				tenantId,
				title: "Null origin action",
			});
			await withTenantConnection(tenantId, (tx) =>
				tx.$executeRawUnsafe(
					`INSERT INTO action_item (
						id,
						tenant_id,
						title,
						description,
						origin_type,
						origin_id,
						origin_label,
						origin_created_at,
						priority
					) VALUES (
						$1::uuid,
						$2::uuid,
						$3,
						$4,
						$5::action_item_origin_type,
						$6::uuid,
						$7,
						$8::timestamptz,
						$9::action_item_priority
					)`,
					nullOriginAction.id,
					nullOriginAction.tenantId,
					nullOriginAction.title,
					nullOriginAction.description,
					nullOriginAction.originType,
					nullOriginAction.originId,
					nullOriginAction.originLabel,
					nullOriginAction.originCreatedAt,
					nullOriginAction.priority,
				),
			);
			await assert.rejects(() =>
				withTenantConnection(tenantId, (tx) =>
					tx.$executeRawUnsafe(
						`INSERT INTO finding (
							id,
							tenant_id,
							finding_type,
							intent,
							title,
							description,
							severity,
							location_text,
							reported_by_user_id,
							reported_at,
							status,
							action_item_id
						) VALUES (
							$1::uuid,
							$2::uuid,
							'safety_walk',
							'hazard',
							$3,
							$4,
							'high',
							$5,
							$6::uuid,
							$7::timestamptz,
							'action_created',
							$8::uuid
						)`,
						nullOriginFindingId,
						tenantId,
						"Null origin source",
						"Should fail.",
						"Line 9",
						userId,
						nullOriginReportedAt,
						nullOriginAction.id,
					),
				),
			);

			await assert.rejects(() =>
				withTenantConnection(tenantId, (tx) =>
					tx.$executeRawUnsafe(
						`INSERT INTO finding (
							id,
							tenant_id,
							finding_type,
							intent,
							title,
							description,
							severity,
							reported_by_user_id,
							status
						) VALUES (
							$1::uuid,
							$2::uuid,
							'audit',
							'hazard',
							$3,
							$4,
							'high',
							$5::uuid,
							'action_created'
						)`,
						randomUUID(),
						tenantId,
						"Missing action link",
						"Should fail.",
						userId,
					),
				),
			);

			await assert.rejects(() =>
				withTenantConnection(tenantId, (tx) =>
					tx.$executeRawUnsafe(
						`INSERT INTO finding (
							id,
							tenant_id,
							finding_type,
							intent,
							title,
							description,
							severity,
							reported_by_user_id
						) VALUES (
							$1::uuid,
							$2::uuid,
							'inspection',
							'hazard',
							$3,
							$4,
							'high',
							$5::uuid
						)`,
						randomUUID(),
						otherTenantId,
						"Spoofed tenant id",
						"Should fail.",
						userId,
					),
				),
			);

			await assert.rejects(() =>
				withTenantConnection(tenantId, (tx) =>
					tx.$executeRawUnsafe(
						`INSERT INTO finding (
							id,
							tenant_id,
							finding_type,
							intent,
							title,
							description,
							severity,
							reported_by_user_id
						) VALUES (
							$1::uuid,
							$2::uuid,
							'inspection',
							'hazard',
							$3,
							$4,
							'high',
							$5::uuid
						)`,
						randomUUID(),
						tenantId,
						"Wrong reporter",
						"Should fail.",
						otherUserId,
					),
				),
			);

			await assert.rejects(() =>
				withTenantConnection(tenantId, (tx) =>
					tx.$executeRawUnsafe(
						`INSERT INTO finding (
							id,
							tenant_id,
							finding_type,
							intent,
							title,
							description,
							severity,
							reported_by_user_id,
							photo_storage_path
						) VALUES (
							$1::uuid,
							$2::uuid,
							'inspection',
							'positive_observation',
							$3,
							$4,
							'low',
							$5::uuid,
							$6
						)`,
						randomUUID(),
						tenantId,
						"Wrong path",
						"Should fail.",
						userId,
						`tenants/${otherTenantId}/findings/photo.jpg`,
					),
				),
			);

			await withTenantConnection(otherTenantId, (tx) =>
				tx.$executeRawUnsafe(
					`INSERT INTO finding (
						id,
						tenant_id,
						finding_type,
						intent,
						title,
						description,
						severity,
						reported_by_user_id
					) VALUES (
						$1::uuid,
						$2::uuid,
						'meeting',
						'positive_observation',
						$3,
						$4,
						'low',
						$5::uuid
					)`,
					randomUUID(),
					otherTenantId,
					"Team raised a good practice",
					"Positive signal capture stays tenant-scoped.",
					otherUserId,
				),
			);

			await assert.rejects(
				() =>
					withTenantConnection(tenantId, (tx) =>
						tx.$queryRawUnsafe(
							`SELECT count(*)::bigint AS count FROM "${otherNames.schemaName}".finding`,
						),
					),
				isPrivilegeError,
			);
		} finally {
			await dropTenantSchema(tenantId).catch(() => undefined);
			await dropTenantSchema(otherTenantId).catch(() => undefined);
			await prisma.tenantMembership.deleteMany({
				where: { tenantId: { in: [tenantId, otherTenantId] } },
			});
			await prisma.tenant.deleteMany({
				where: { id: { in: [tenantId, otherTenantId] } },
			});
			await prisma.user.deleteMany({
				where: { id: { in: [userId, otherUserId] } },
			});
		}
	});
}

function ensureMigrated(): Promise<void> {
	if (migrated) {
		return Promise.resolve();
	}

	const result = spawnSync("pnpm", ["db:migrate"], {
		cwd: process.cwd(),
		env: process.env,
		encoding: "utf8",
	});

	assert.equal(
		result.status,
		0,
		`pnpm db:migrate failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
	);

	migrated = true;
	return Promise.resolve();
}

function isPrivilegeError(error: unknown): boolean {
	return (
		error instanceof Error &&
		/(permission denied|does not exist|insufficient privilege)/i.test(
			error.message,
		)
	);
}
