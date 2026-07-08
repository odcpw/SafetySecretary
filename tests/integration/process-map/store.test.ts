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
	addProcessEdge,
	addProcessFlow,
	addProcessNode,
	addProcessResource,
	createProcessMap,
	deleteProcessNode,
	listProcessMaps,
	loadProcessMap,
	moveProcessNode,
	removeProcessResource,
	removeProcessFlow,
	updateProcessNode,
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
			assert.deepEqual(loaded.edges, []);
			assert.deepEqual(loaded.resources, []);
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

	test("process edges allow spine, fork, rejoin, duplicates, and reject self-edge", async () => {
		const tenant = await seedTenant("edges");

		try {
			const map = await createProcessMap(tenant.tenantId, {
				contentLanguage: "en",
				createdBy: tenant.userId,
				title: "Dispatch process",
			});
			const a = await addProcessNode(tenant.tenantId, map.id, {
				description: null,
				kind: "ACTIVITY",
				name: "A",
				parentId: null,
			});
			const b = await addProcessNode(tenant.tenantId, map.id, {
				description: null,
				kind: "ACTIVITY",
				name: "B",
				parentId: null,
			});
			const c = await addProcessNode(tenant.tenantId, map.id, {
				description: null,
				kind: "ACTIVITY",
				name: "C",
				parentId: null,
			});
			const d = await addProcessNode(tenant.tenantId, map.id, {
				description: null,
				kind: "ACTIVITY",
				name: "D",
				parentId: null,
			});
			assert.ok(a);
			assert.ok(b);
			assert.ok(c);
			assert.ok(d);

			assert.ok(
				await addProcessEdge(tenant.tenantId, map.id, {
					fromNodeId: a.id,
					toNodeId: b.id,
				}),
			);
			assert.ok(
				await addProcessEdge(tenant.tenantId, map.id, {
					fromNodeId: b.id,
					toNodeId: c.id,
				}),
			);
			const fork = await addProcessEdge(tenant.tenantId, map.id, {
				fromNodeId: b.id,
				routingNote: "If extra QA is needed",
				toNodeId: d.id,
			});
			assert.ok(fork);
			assert.ok(
				await addProcessEdge(tenant.tenantId, map.id, {
					fromNodeId: d.id,
					toNodeId: c.id,
				}),
			);

			const loaded = await loadProcessMap(tenant.tenantId, map.id);
			assert.ok(loaded);
			assert.equal(loaded.edges.length, 4);

			const duplicate = await addProcessEdge(tenant.tenantId, map.id, {
				fromNodeId: b.id,
				toNodeId: d.id,
			});
			assert.ok(duplicate);
			assert.equal(duplicate.id, fork.id);

			const afterDuplicate = await loadProcessMap(tenant.tenantId, map.id);
			assert.ok(afterDuplicate);
			assert.equal(afterDuplicate.edges.length, 4);

			assert.equal(
				await addProcessEdge(tenant.tenantId, map.id, {
					fromNodeId: c.id,
					toNodeId: c.id,
				}),
				null,
			);
		} finally {
			await cleanupTenant(tenant);
		}
	});

	test("deleteProcessNode bridges incoming and outgoing edges before cascade", async () => {
		const tenant = await seedTenant("bridge-delete");

		try {
			const map = await createProcessMap(tenant.tenantId, {
				contentLanguage: "en",
				createdBy: tenant.userId,
				title: "Bridge process",
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
			assert.ok(
				await addProcessEdge(tenant.tenantId, map.id, {
					fromNodeId: a.id,
					toNodeId: b.id,
				}),
			);
			assert.ok(
				await addProcessEdge(tenant.tenantId, map.id, {
					fromNodeId: b.id,
					toNodeId: c.id,
				}),
			);

			const deleted = await deleteProcessNode(tenant.tenantId, map.id, b.id);
			assert.equal(deleted, true);

			const loaded = await loadProcessMap(tenant.tenantId, map.id);
			assert.ok(loaded);
			const promoted = loaded.nodes.find((node) => node.id === c.id);
			assert.ok(promoted, "C must survive deleting B");
			assert.equal(promoted.parentId, a.id);
			assert.equal(promoted.orderIndex, 0);
			assert.equal(loaded.edges.length, 1);
			assert.equal(loaded.edges[0]?.fromNodeId, a.id);
			assert.equal(loaded.edges[0]?.toNodeId, c.id);
			assert.equal(loaded.edges[0]?.routingNote, null);
			assert.equal(
				loaded.edges.some(
					(edge) => edge.fromNodeId === b.id || edge.toNodeId === b.id,
				),
				false,
			);
		} finally {
			await cleanupTenant(tenant);
		}
	});

	test("process resources add, load, and remove role and equipment resources", async () => {
		const tenant = await seedTenant("resources");

		try {
			const map = await createProcessMap(tenant.tenantId, {
				contentLanguage: "en",
				createdBy: tenant.userId,
				title: "Lift process",
			});
			const node = await addProcessNode(tenant.tenantId, map.id, {
				description: null,
				kind: "ACTIVITY",
				name: "Lift load",
				parentId: null,
			});
			assert.ok(node);

			const role = await addProcessResource(tenant.tenantId, map.id, {
				label: "Riggers",
				nodeId: node.id,
				quantityNote: "2 riggers",
				resourceType: "ROLE",
			});
			assert.ok(role);
			const equipment = await addProcessResource(tenant.tenantId, map.id, {
				label: "forklift",
				nodeId: node.id,
				resourceType: "EQUIPMENT",
			});
			assert.ok(equipment);

			const loaded = await loadProcessMap(tenant.tenantId, map.id);
			assert.ok(loaded);
			assert.deepEqual(
				loaded.resources.map((resource) => ({
					label: resource.label,
					quantityNote: resource.quantityNote,
					resourceType: resource.resourceType,
				})),
				[
					{
						label: "Riggers",
						quantityNote: "2 riggers",
						resourceType: "ROLE",
					},
					{
						label: "forklift",
						quantityNote: null,
						resourceType: "EQUIPMENT",
					},
				],
			);

			assert.equal(
				await removeProcessResource(tenant.tenantId, map.id, role.id),
				true,
			);
			const afterRemove = await loadProcessMap(tenant.tenantId, map.id);
			assert.ok(afterRemove);
			assert.deepEqual(
				afterRemove.resources.map((resource) => resource.id),
				[equipment.id],
			);
		} finally {
			await cleanupTenant(tenant);
		}
	});

	test("process node confidence and duration fields update and validate", async () => {
		const tenant = await seedTenant("node-confidence");

		try {
			const map = await createProcessMap(tenant.tenantId, {
				contentLanguage: "en",
				createdBy: tenant.userId,
				title: "Estimate process",
			});
			const node = await addProcessNode(tenant.tenantId, map.id, {
				description: null,
				kind: "ACTIVITY",
				name: "Unload",
				parentId: null,
			});
			assert.ok(node);

			const updated = await updateProcessNode(tenant.tenantId, map.id, node.id, {
				durationNote: "2-3h, estimate",
				sourceConfidence: "HEARSAY",
			});
			assert.ok(updated);
			assert.equal(updated.sourceConfidence, "HEARSAY");
			assert.equal(updated.durationNote, "2-3h, estimate");

			const loaded = await loadProcessMap(tenant.tenantId, map.id);
			assert.ok(loaded);
			assert.equal(loaded.nodes[0]?.sourceConfidence, "HEARSAY");
			assert.equal(loaded.nodes[0]?.durationNote, "2-3h, estimate");

			const rejected = await updateProcessNode(tenant.tenantId, map.id, node.id, {
				sourceConfidence: "MAYBE",
			} as unknown as Parameters<typeof updateProcessNode>[3]);
			assert.equal(rejected, null);
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
	await prisma.$executeRawUnsafe(
		`SELECT shared.apply_process_map_edges_schema(${sqlString(schema)}::name)`,
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
