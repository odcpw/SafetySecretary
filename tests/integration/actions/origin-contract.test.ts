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

const { ACTION_ORIGIN_TYPES } = await import(
	"../../../src/lib/actions/origin-contract"
);
type ActionOriginType =
	typeof import("../../../src/lib/actions/origin-contract")["ACTION_ORIGIN_TYPES"][number];

const dbModulePath = "../../../src/lib/db/tenancy.ts";

let migrated = false;

if (!process.env.DATABASE_URL) {
	test("action origin contract integration requires DATABASE_URL", () => {
		assert.fail(
			"DATABASE_URL is required for action origin contract integration.",
		);
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

	test("action origin contract provisions labels, reserved origins, and immutability", async () => {
		await ensureMigrated();

		const tenantId = randomUUID();
		const userId = randomUUID();
		const names = tenantDatabaseNames(tenantId);

		await prisma.user.create({
			data: {
				email: `action-origin-${userId}@example.test`,
				id: userId,
			},
		});
		await prisma.tenant.create({
			data: {
				defaultLanguage: "en",
				id: tenantId,
				memberships: { create: { userId } },
				name: `ssfw-8i7 ${tenantId}`,
			},
		});

		try {
			await provisionTenantSchema(tenantId, prisma);

			const columns = await prisma.$queryRaw<
				Array<{ column_name: string; is_nullable: string }>
			>`
				SELECT column_name, is_nullable
				FROM information_schema.columns
				WHERE table_schema = ${names.schemaName}
					AND table_name = 'action_item'
					AND column_name IN ('origin_label', 'origin_created_at')
				ORDER BY column_name
			`;
			assert.deepEqual(columns, [
				{ column_name: "origin_created_at", is_nullable: "NO" },
				{ column_name: "origin_label", is_nullable: "NO" },
			]);

			const originValues = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
				SELECT enum.enumlabel
				FROM pg_catalog.pg_type type
				JOIN pg_catalog.pg_namespace namespace
					ON namespace.oid = type.typnamespace
				JOIN pg_catalog.pg_enum enum
					ON enum.enumtypid = type.oid
				WHERE namespace.nspname = ${names.schemaName}
					AND type.typname = 'action_item_origin_type'
				ORDER BY enum.enumsortorder
			`;
			assert.deepEqual(
				originValues.map((row) => row.enumlabel),
				[...ACTION_ORIGIN_TYPES],
			);

			const triggers = await prisma.$queryRaw<Array<{ tgname: string }>>`
				SELECT trigger.tgname
				FROM pg_catalog.pg_trigger trigger
				WHERE trigger.tgrelid = (${names.schemaName} || '.action_item')::regclass
					AND NOT trigger.tgisinternal
				ORDER BY trigger.tgname
			`;
			assert.deepEqual(
				triggers.map((trigger) => trigger.tgname),
				["action_item_origin_immutability_trigger"],
			);

			for (const originType of ACTION_ORIGIN_TYPES) {
				await assertOriginImmutability(tenantId, originType);
			}
		} finally {
			await dropTenantSchema(tenantId).catch(() => undefined);
			await prisma.tenantMembership.deleteMany({ where: { tenantId } });
			await prisma.tenant.deleteMany({ where: { id: tenantId } });
			await prisma.user.deleteMany({ where: { id: userId } });
		}
	});

	async function assertOriginImmutability(
		tenantId: string,
		originType: ActionOriginType,
	): Promise<void> {
		const actionId = randomUUID();
		const originId = originType === "manual" ? null : randomUUID();
		const label = `${originType}: seed`;

		await withTenantConnection(tenantId, (tx) =>
			tx.$executeRawUnsafe(
				`INSERT INTO action_item (
					id,
					tenant_id,
					title,
					origin_type,
					origin_id,
					origin_label,
					origin_created_at,
					priority
				) VALUES (
					$1::uuid,
					$2::uuid,
					$3,
					$4::action_item_origin_type,
					$5::uuid,
					$6,
					CURRENT_TIMESTAMP,
					'medium'
				)`,
				actionId,
				tenantId,
				`Origin test ${originType}`,
				originType,
				originId,
				label,
			),
		);

		await assert.rejects(() =>
			withTenantConnection(tenantId, (tx) =>
				tx.$executeRawUnsafe(
					`UPDATE action_item SET origin_type = $2::action_item_origin_type WHERE id = $1::uuid`,
					actionId,
					originType === "manual" ? "ii" : "manual",
				),
			),
		);
		await assert.rejects(() =>
			withTenantConnection(tenantId, (tx) =>
				tx.$executeRawUnsafe(
					`UPDATE action_item SET origin_id = $2::uuid WHERE id = $1::uuid`,
					actionId,
					randomUUID(),
				),
			),
		);
		await assert.rejects(() =>
			withTenantConnection(tenantId, (tx) =>
				tx.$executeRawUnsafe(
					`UPDATE action_item SET origin_created_at = CURRENT_TIMESTAMP + interval '1 hour' WHERE id = $1::uuid`,
					actionId,
				),
			),
		);

		if (originType === "manual") {
			await withTenantConnection(tenantId, (tx) =>
				tx.$executeRawUnsafe(
					`UPDATE action_item SET origin_label = $2 WHERE id = $1::uuid`,
					actionId,
					"Manual: edited label",
				),
			);
			return;
		}

		await assert.rejects(() =>
			withTenantConnection(tenantId, (tx) =>
				tx.$executeRawUnsafe(
					`UPDATE action_item SET origin_label = $2 WHERE id = $1::uuid`,
					actionId,
					`${originType}: edited label`,
				),
			),
		);
	}
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
