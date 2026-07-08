import assert from "node:assert/strict";
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

const databaseUrl = process.env.DATABASE_URL;

const {
	addProcessFlow,
	addProcessNode,
	createProcessMap,
	deleteProcessNode,
	listProcessMaps,
	loadProcessMap,
	moveProcessNode,
	removeProcessFlow,
	updateProcessFlow,
} = (await import(
	moduleUrl("src/lib/process-map/index.ts")
)) as typeof import("../../../src/lib/process-map");
const { prisma, dropTenantSchema, withTenantConnection } = (await import(
	moduleUrl("src/lib/db/index.ts")
)) as typeof import("../../../src/lib/db");

test.after(async () => {
	await prisma.$disconnect();
});

if (!databaseUrl) {
	test("process map integration", {
		skip: "DATABASE_URL is required",
	}, () => {});
} else {
	test("create + list + load round-trips a process map", async () => {
		const tenant = await seedTenant("round-trip");

		try {
			const map = await createProcessMap(tenant.tenantId, {
				contentLanguage: "en",
				createdBy: tenant.userId,
				scopeNote: "Packing line only",
				title: "Packing process",
			});

			assert.equal(map.title, "Packing process");
			assert.equal(map.scopeNote, "Packing line only");
			assert.equal(map.status, "DRAFT");
			assert.equal(map.contentLanguage, "en");
			assert.equal(map.createdBy, tenant.userId);
			assert.ok(map.createdAt instanceof Date);

			const listed = await listProcessMaps(tenant.tenantId);
			assert.equal(listed.length, 1);
			assert.equal(listed[0]?.id, map.id);

			const loaded = await loadProcessMap(tenant.tenantId, map.id);
			assert.ok(loaded);
			assert.equal(loaded.map.id, map.id);
			assert.deepEqual(loaded.nodes, []);
			assert.deepEqual(loaded.flows, []);
		} finally {
			await cleanupTenant(tenant);
		}
	});

	test("deleting an intermediate process node promotes its child instead of cascading", async () => {
		const tenant = await seedTenant("delete-reparent");

		try {
			const map = await createProcessMap(tenant.tenantId, {
				contentLanguage: "en",
				createdBy: tenant.userId,
				title: "Production process",
			});

			const a = await addProcessNode(tenant.tenantId, map.id, {
				description: null,
				kind: "PROCESS",
				name: "A",
				parentId: null,
			});
			assert.ok(a);
			const b = await addProcessNode(tenant.tenantId, map.id, {
				description: null,
				kind: "SUBPROCESS",
				name: "B",
				parentId: a.id,
			});
			assert.ok(b);
			const c = await addProcessNode(tenant.tenantId, map.id, {
				description: null,
				kind: "ACTIVITY",
				name: "C",
				parentId: b.id,
			});
			assert.ok(c);

			const deleted = await deleteProcessNode(tenant.tenantId, map.id, b.id);
			assert.equal(deleted, true);

			const loaded = await loadProcessMap(tenant.tenantId, map.id);
			assert.ok(loaded);
			assert.equal(loaded.nodes.length, 2);

			const promoted = loaded.nodes.find((node) => node.id === c.id);
			assert.ok(promoted, "C must survive deleting B");
			assert.equal(promoted.parentId, a.id);
			assert.equal(promoted.orderIndex, 0);
			assert.deepEqual(
				loaded.nodes.map((node) => node.id).sort(),
				[a.id, c.id].sort(),
			);
		} finally {
			await cleanupTenant(tenant);
		}
	});

	test("add, update, load, and remove process flows", async () => {
		const tenant = await seedTenant("flows");

		try {
			const map = await createProcessMap(tenant.tenantId, {
				contentLanguage: "en",
				createdBy: tenant.userId,
				title: "Goods receipt",
			});
			const node = await addProcessNode(tenant.tenantId, map.id, {
				description: null,
				kind: "ACTIVITY",
				name: "Check incoming pallets",
				parentId: null,
			});
			assert.ok(node);

			const material = await addProcessFlow(tenant.tenantId, map.id, {
				counterparty: "Supplier",
				direction: "IN",
				flowType: "MATERIAL",
				label: "Pallets",
				nodeId: node.id,
			});
			assert.ok(material);
			const information = await addProcessFlow(tenant.tenantId, map.id, {
				counterparty: "ERP",
				direction: "OUT",
				flowType: "INFORMATION",
				label: "Receipt confirmation",
				nodeId: node.id,
			});
			assert.ok(information);

			const updated = await updateProcessFlow(
				tenant.tenantId,
				map.id,
				information.id,
				{ counterparty: "Warehouse system", label: "Posted receipt" },
			);
			assert.ok(updated);
			assert.equal(updated.label, "Posted receipt");
			assert.equal(updated.counterparty, "Warehouse system");

			const loaded = await loadProcessMap(tenant.tenantId, map.id);
			assert.ok(loaded);
			assert.deepEqual(
				loaded.flows.map((flow) => flow.id),
				[material.id, information.id],
			);
			assert.equal(loaded.flows[1]?.label, "Posted receipt");

			assert.equal(
				await removeProcessFlow(tenant.tenantId, map.id, material.id),
				true,
			);
			const afterRemove = await loadProcessMap(tenant.tenantId, map.id);
			assert.ok(afterRemove);
			assert.deepEqual(
				afterRemove.flows.map((flow) => flow.id),
				[information.id],
			);
		} finally {
			await cleanupTenant(tenant);
		}
	});

	test("moveProcessNode rejects moving a node under its own descendant", async () => {
		const tenant = await seedTenant("cycle");

		try {
			const map = await createProcessMap(tenant.tenantId, {
				contentLanguage: "en",
				createdBy: tenant.userId,
				title: "Cycle guard process",
			});
			const a = await addProcessNode(tenant.tenantId, map.id, {
				description: null,
				kind: "PROCESS",
				name: "A",
				parentId: null,
			});
			assert.ok(a);
			const b = await addProcessNode(tenant.tenantId, map.id, {
				description: null,
				kind: "SUBPROCESS",
				name: "B",
				parentId: a.id,
			});
			assert.ok(b);
			const c = await addProcessNode(tenant.tenantId, map.id, {
				description: null,
				kind: "ACTIVITY",
				name: "C",
				parentId: b.id,
			});
			assert.ok(c);

			const rejected = await moveProcessNode(
				tenant.tenantId,
				map.id,
				a.id,
				c.id,
			);
			assert.equal(rejected, null);

			const positions = await nodePositions(tenant.tenantId, map.id);
			assert.deepEqual(positions, {
				[a.id]: { orderIndex: 0, parentId: null },
				[b.id]: { orderIndex: 0, parentId: a.id },
				[c.id]: { orderIndex: 0, parentId: b.id },
			});
		} finally {
			await cleanupTenant(tenant);
		}
	});
}

async function seedTenant(label: string): Promise<{
	tenantId: string;
	userId: string;
}> {
	const tenant = await prisma.tenant.create({
		data: {
			defaultLanguage: "en",
			name: `ssfw-process-map-${label}-${randomUUID()}`,
		},
	});
	const user = await prisma.user.create({
		data: {
			email: `ssfw-process-map-${label}-${randomUUID()}@example.invalid`,
			uiLocale: "en",
		},
	});
	await prisma.tenantMembership.create({
		data: {
			tenantId: tenant.id,
			userId: user.id,
		},
	});
	await provisionProcessMapSchema(tenant.id);

	return {
		tenantId: tenant.id,
		userId: user.id,
	};
}

async function provisionProcessMapSchema(tenantId: string): Promise<void> {
	const { role, schema } = names(tenantId);
	await prisma.$executeRawUnsafe(
		`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ${sqlString(
			role,
		)}) THEN EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION', ${sqlString(
			role,
		)}); END IF; END $$`,
	);
	await prisma.$executeRawUnsafe(`GRANT ${quoteIdent(role)} TO CURRENT_USER`);
	await prisma.$executeRawUnsafe(
		`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)} AUTHORIZATION ${quoteIdent(
			role,
		)}`,
	);
	await prisma.$executeRawUnsafe(
		`ALTER SCHEMA ${quoteIdent(schema)} OWNER TO ${quoteIdent(role)}`,
	);
	await prisma.$executeRawUnsafe(
		`GRANT USAGE ON SCHEMA ${quoteIdent(schema)} TO ${quoteIdent(role)}`,
	);
	await prisma.$executeRawUnsafe(
		`GRANT USAGE ON SCHEMA "shared" TO ${quoteIdent(role)}`,
	);
	await prisma.$executeRawUnsafe(
		`SELECT shared.apply_process_map_schema(${sqlString(schema)}::name)`,
	);
}

async function nodePositions(
	tenantId: string,
	mapId: string,
): Promise<Record<string, { orderIndex: number; parentId: string | null }>> {
	return withTenantConnection(tenantId, async (tx) => {
		const rows = await tx.$queryRaw<
			Array<{ id: string; orderIndex: number; parentId: string | null }>
		>`
			SELECT
				id::text AS id,
				order_index AS "orderIndex",
				parent_id::text AS "parentId"
			FROM process_node
			WHERE map_id = ${mapId}::uuid
		`;

		return Object.fromEntries(
			rows.map((row) => [
				row.id,
				{ orderIndex: row.orderIndex, parentId: row.parentId },
			]),
		);
	});
}

async function cleanupTenant(input: {
	tenantId: string;
	userId: string;
}): Promise<void> {
	await dropTenantSchema(input.tenantId).catch(() => undefined);
	await prisma.session.deleteMany({ where: { tenantId: input.tenantId } });
	await prisma.tenantMembership.deleteMany({
		where: { tenantId: input.tenantId },
	});
	await prisma.tenant.deleteMany({ where: { id: input.tenantId } });
	await prisma.user.deleteMany({ where: { id: input.userId } });
}

function names(tenantId: string): {
	role: string;
	schema: string;
} {
	const suffix = tenantId.toLowerCase().replaceAll("-", "_");
	return {
		role: `role_tenant_${suffix}`,
		schema: `tenant_${suffix}`,
	};
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
