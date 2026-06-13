import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";

const dbModulePath = "../../../src/lib/db/tenancy.ts";

let migrated = false;

if (!process.env.DATABASE_URL) {
	test("action_item integration requires DATABASE_URL", () => {
		assert.fail("DATABASE_URL is required for action_item schema integration.");
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

	test("action_item schema provisions tenant-scoped action rows and constraints", async () => {
		await ensureMigrated();

		const tenantId = randomUUID();
		const otherTenantId = randomUUID();
		const userId = randomUUID();
		const otherUserId = randomUUID();
		const actionId = randomUUID();
		const otherTenantActionId = randomUUID();
		const verifiedActionId = randomUUID();
		const followUpActionId = randomUUID();
		const names = tenantDatabaseNames(tenantId);
		const otherNames = tenantDatabaseNames(otherTenantId);

		await prisma.user.createMany({
			data: [
				{
					email: `action-item-${userId}@example.test`,
					id: userId,
				},
				{
					email: `action-item-${otherUserId}@example.test`,
					id: otherUserId,
				},
			],
		});
		await prisma.tenant.create({
			data: {
				defaultLanguage: "en",
				id: tenantId,
				memberships: { create: { userId } },
				name: `ssfw-fh2 ${tenantId}`,
			},
		});
		await prisma.tenant.create({
			data: {
				defaultLanguage: "en",
				id: otherTenantId,
				memberships: { create: { userId: otherUserId } },
				name: `ssfw-fh2-other ${otherTenantId}`,
			},
		});

		try {
			await provisionTenantSchema(tenantId, prisma);
			await provisionTenantSchema(otherTenantId, prisma);

			const columns = await prisma.$queryRaw<
				Array<{ column_name: string; data_type: string; is_nullable: string }>
			>`
				SELECT column_name, data_type, is_nullable
				FROM information_schema.columns
				WHERE table_schema = ${names.schemaName}
					AND table_name = 'action_item'
				ORDER BY ordinal_position
			`;

			assert.deepEqual(
				columns.map((column) => column.column_name),
				[
					"id",
					"tenant_id",
					"title",
					"description",
					"status",
					"due_date",
					"assignee_user_id",
					"owner_text",
					"department_text",
					"origin_type",
					"origin_id",
					"priority",
					"is_safety_critical",
					"verification_status",
					"verification_note",
					"verified_at",
					"verified_by_user_id",
					"effectiveness_result",
					"assigned_at",
					"escalated_at",
					"notification_sent_at",
					"completed_at",
					"created_at",
					"updated_at",
					"origin_label",
					"origin_created_at",
				],
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
					AND type.typname LIKE 'action_item_%'
				ORDER BY type.typname, enum.enumsortorder
			`;

			assert.deepEqual(
				enumValues.map((row) => `${row.typname}:${row.enumlabel}`),
				[
					"action_item_effectiveness_result:unknown",
					"action_item_effectiveness_result:effective",
					"action_item_effectiveness_result:needs_follow_up",
					"action_item_origin_type:hira",
					"action_item_origin_type:ii",
					"action_item_origin_type:jha",
					"action_item_origin_type:safety_walk",
					"action_item_origin_type:audit_inspection",
					"action_item_origin_type:toolbox_talk",
					"action_item_origin_type:meeting",
					"action_item_origin_type:manual",
					"action_item_origin_type:safety_moment",
					"action_item_origin_type:creative_artifact",
					"action_item_origin_type:campaign",
					"action_item_origin_type:roadmap",
					"action_item_origin_type:safety_day",
					"action_item_priority:low",
					"action_item_priority:medium",
					"action_item_priority:high",
					"action_item_priority:critical",
					"action_item_status:open",
					"action_item_status:in_progress",
					"action_item_status:completed",
					"action_item_status:cancelled",
					"action_item_verification_status:not_required",
					"action_item_verification_status:needed",
					"action_item_verification_status:verified",
					"action_item_verification_status:needs_follow_up",
				],
			);

			const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`
				SELECT conname
				FROM pg_catalog.pg_constraint
				WHERE conrelid = (${names.schemaName} || '.action_item')::regclass
				ORDER BY conname
			`;

			assert.deepEqual(
				constraints.map((constraint) => constraint.conname),
				[
					"action_item_assignee_user_id_fkey",
					"action_item_completed_status_timestamp_check",
					"action_item_department_text_not_blank",
					"action_item_description_not_blank",
					"action_item_origin_label_not_blank",
					"action_item_owner_text_not_blank",
					"action_item_pkey",
					"action_item_safety_critical_completion_check",
					"action_item_tenant_id_fkey",
					"action_item_title_not_blank",
					"action_item_verification_note_not_blank",
					"action_item_verified_by_user_id_fkey",
					"action_item_verified_pair_check",
				],
			);

			await withTenantConnection(tenantId, (tx) =>
				tx.$executeRawUnsafe(
					`INSERT INTO action_item (
						id,
						tenant_id,
						title,
						description,
						status,
						due_date,
						assignee_user_id,
						owner_text,
						department_text,
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
						'in_progress',
						$5::date,
						$6::uuid,
						$7,
						$8,
						'ii',
						$9::uuid,
						$10,
						CURRENT_TIMESTAMP,
						'high'
					)`,
					actionId,
					tenantId,
					"Replace damaged guard",
					"Install replacement guard before restart.",
					"2026-05-12",
					userId,
					"Maintenance lead",
					"Production",
					randomUUID(),
					"II: Damaged guard",
				),
			);

			await withTenantConnection(otherTenantId, (tx) =>
				tx.$executeRawUnsafe(
					`INSERT INTO action_item (
						id,
						tenant_id,
						title,
						status,
						origin_type,
						origin_label,
						origin_created_at,
						priority
					) VALUES (
						$1::uuid,
						$2::uuid,
						$3,
						'in_progress',
						'ii',
						$4,
						CURRENT_TIMESTAMP,
						'medium'
					)`,
					otherTenantActionId,
					otherTenantId,
					"Other tenant action",
					"II: Other tenant action",
				),
			);

			const tenantRows = await withTenantConnection(
				tenantId,
				(tx) =>
					tx.$queryRaw<Array<{ count: bigint }>>`
					SELECT count(*)::bigint AS count
					FROM action_item
				`,
			);
			assert.equal(String(tenantRows[0]?.count), "1");

			await assert.rejects(
				() =>
					withTenantConnection(tenantId, (tx) =>
						tx.$queryRawUnsafe(
							`SELECT count(*)::bigint AS count FROM "${otherNames.schemaName}".action_item`,
						),
					),
				isPrivilegeError,
			);

			await assert.rejects(() =>
				withTenantConnection(tenantId, (tx) =>
					tx.$executeRawUnsafe(
						`INSERT INTO action_item (
							id,
							tenant_id,
							title,
							status,
							origin_type,
							origin_label,
							origin_created_at,
							priority,
							is_safety_critical,
							verification_status,
							completed_at
						) VALUES (
							$1::uuid,
							$2::uuid,
							$3,
							'completed',
							'manual',
							$4,
							CURRENT_TIMESTAMP,
							'critical',
							true,
							'needed',
							CURRENT_TIMESTAMP
						)`,
						randomUUID(),
						tenantId,
						"Status-only safety critical close",
						"Manual: Status-only safety critical close",
					),
				),
			);

			await withTenantConnection(tenantId, (tx) =>
				tx.$executeRawUnsafe(
					`INSERT INTO action_item (
						id,
						tenant_id,
						title,
						status,
						origin_type,
						origin_label,
						origin_created_at,
						priority,
						is_safety_critical,
						verification_status,
						verification_note
					) VALUES (
						$1::uuid,
						$2::uuid,
						$3,
						'in_progress',
						'manual',
						$4,
						CURRENT_TIMESTAMP,
						'high',
						true,
						'needs_follow_up',
						$5
					)`,
					followUpActionId,
					tenantId,
					"Follow up effectiveness check",
					"Manual: Follow up effectiveness check",
					"Guard replacement needs a restart observation.",
				),
			);

			await withTenantConnection(tenantId, (tx) =>
				tx.$executeRawUnsafe(
					`INSERT INTO action_item (
						id,
						tenant_id,
						title,
						status,
						origin_type,
						origin_label,
						origin_created_at,
						priority,
						is_safety_critical,
						verification_status,
						verification_note,
						verified_at,
						verified_by_user_id,
						effectiveness_result,
						completed_at
					) VALUES (
						$1::uuid,
						$2::uuid,
						$3,
						'completed',
						'manual',
						$4,
						CURRENT_TIMESTAMP,
						'critical',
						true,
						'verified',
						$5,
						CURRENT_TIMESTAMP,
						$6::uuid,
						'effective',
						CURRENT_TIMESTAMP
					)`,
					verifiedActionId,
					tenantId,
					"Verified safety critical close",
					"Manual: Verified safety critical close",
					"Guard photo and restart test checked.",
					userId,
				),
			);

			const followUpRows = await withTenantConnection(
				tenantId,
				(tx) =>
					tx.$queryRaw<Array<{ id: string; title: string }>>`
					SELECT id::text, title
					FROM action_item
					WHERE verification_status = 'needs_follow_up'
				`,
			);

			assert.deepEqual(followUpRows, [
				{
					id: followUpActionId,
					title: "Follow up effectiveness check",
				},
			]);

			const provisionHook = await prisma.$queryRaw<
				Array<{ has_action_hook: boolean; has_origin_hook: boolean }>
			>`
				SELECT
					pg_get_functiondef('shared.provision_tenant_schema(uuid, name)'::regprocedure)
						LIKE '%apply_action_item_schema%' AS has_action_hook,
					pg_get_functiondef('shared.provision_tenant_schema(uuid, name)'::regprocedure)
						LIKE '%apply_action_origin_contract_schema%' AS has_origin_hook
			`;

			assert.equal(provisionHook[0]?.has_action_hook, true);
			assert.equal(provisionHook[0]?.has_origin_hook, true);
		} finally {
			await dropTenantSchema(otherTenantId).catch(() => undefined);
			await dropTenantSchema(tenantId).catch(() => undefined);
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
	const message = error instanceof Error ? error.message : String(error);
	return /permission denied|42501/i.test(message);
}
