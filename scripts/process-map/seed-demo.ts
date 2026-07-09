/**
 * Seeds one viewer-ready process map in the dev workspace.
 *
 * Run: node --env-file=.env --experimental-strip-types --experimental-specifier-resolution=node scripts/process-map/seed-demo.ts
 */
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
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
			return { shortCircuit: true, url: resolved.href };
		}

		return nextResolve(specifier, context);
	},
});

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}

function moduleUrl(relativePath: string): string {
	return pathToFileURL(relativePath).href;
}

function readEnv(name: string, legacyName: string): string | undefined {
	const value = process.env[name]?.trim();
	if (value) {
		return value;
	}

	return process.env[legacyName]?.trim() || undefined;
}

const { prisma, provisionTenantSchema } = (await import(
	moduleUrl("src/lib/db/index.ts")
)) as typeof import("../../src/lib/db/index");
const { DISCLAIMER_VERSION } = (await import(
	moduleUrl("src/lib/legal/disclaimer.ts")
)) as typeof import("../../src/lib/legal/disclaimer");
const {
	addProcessEdge,
	addProcessFlow,
	addProcessNode,
	addProcessResource,
	createProcessMap,
	listProcessMaps,
	softDeleteProcessMap,
} = (await import(
	moduleUrl("src/lib/process-map/index.ts")
)) as typeof import("../../src/lib/process-map");

const devEmail = (
	readEnv("SAFETYSECRETARY_DEV_AUTH_EMAIL", "SSFW_DEV_AUTH_EMAIL") ??
	"tester@safetysecretary.local"
)
	.trim()
	.toLowerCase();
const companyName =
	readEnv(
		"SAFETYSECRETARY_DEV_AUTH_COMPANY_NAME",
		"SSFW_DEV_AUTH_COMPANY_NAME",
	) || "Safety Secretary Test Workspace";
const demoTitle = "Demo: plastics factory";

async function main(): Promise<void> {
	const workspace = await ensureDevWorkspace();
	const mapId = await recreateDemoMap(workspace.tenantId, workspace.userId);

	console.log("Process map demo ready.");
	console.log(`  user:   ${devEmail}`);
	console.log(`  tenant: ${workspace.tenantId}`);
	console.log(`  map:    ${mapId}`);
	console.log(`  url:    http://localhost:3100/process-maps/${mapId}`);
}

async function ensureDevWorkspace(): Promise<{
	tenantId: string;
	userId: string;
}> {
	return prisma.$transaction(
		async (tx) => {
			const user = await tx.user.upsert({
				create: { email: devEmail, uiLocale: "en" },
				update: {},
				where: { email: devEmail },
			});
			const existingMembership = await tx.tenantMembership.findFirst({
				orderBy: { createdAt: "asc" },
				where: { tenant: { deletedAt: null }, userId: user.id },
			});

			const tenantId = existingMembership
				? existingMembership.tenantId
				: await (async () => {
						const tenant = await tx.tenant.create({
							data: { defaultLanguage: "en", name: companyName },
						});
						await provisionTenantSchema(tenant.id, tx);
						await tx.tenantMembership.create({
							data: { tenantId: tenant.id, userId: user.id },
						});
						return tenant.id;
					})();

			await tx.userAcknowledgement.upsert({
				create: { disclaimerVersion: DISCLAIMER_VERSION, userId: user.id },
				update: { acknowledgedAt: new Date() },
				where: {
					userId_disclaimerVersion: {
						disclaimerVersion: DISCLAIMER_VERSION,
						userId: user.id,
					},
				},
			});

			return { tenantId, userId: user.id };
		},
		{ timeout: 20_000 },
	);
}

async function recreateDemoMap(
	tenantId: string,
	userId: string,
): Promise<string> {
	const existingMaps = await listProcessMaps(tenantId);
	for (const map of existingMaps.filter((candidate) => candidate.title === demoTitle)) {
		await softDeleteProcessMap(tenantId, map.id);
	}

	const map = await createProcessMap(tenantId, {
		contentLanguage: "en",
		createdBy: userId,
		scopeNote:
			"Demo process map for a small plastics factory, showing intake, production, dispatch and billing knowledge gaps.",
		title: demoTitle,
	});

	const intake = await requireNode(
		addProcessNode(tenantId, map.id, {
			description: "Raw granules and job tickets arrive from suppliers and sales.",
			kind: "PROCESS",
			name: "Intake",
			parentId: null,
		}),
	);
	const receiveGranules = await requireNode(
		addProcessNode(tenantId, map.id, {
			description: "Warehouse receives sacks of plastic granules and checks the delivery note.",
			kind: "ACTIVITY",
			name: "Receive granules",
			parentId: intake.id,
		}),
	);
	const checkTicket = await requireNode(
		addProcessNode(tenantId, map.id, {
			description: "Planner checks the customer job ticket and required material grade.",
			kind: "ACTIVITY",
			name: "Check job ticket",
			parentId: intake.id,
		}),
	);

	const production = await requireNode(
		addProcessNode(tenantId, map.id, {
			description: "Production turns prepared granules into inspected plastic parts.",
			kind: "PROCESS",
			name: "Production",
			parentId: null,
		}),
	);
	const blend = await requireNode(
		addProcessNode(tenantId, map.id, {
			description: "Material handler dries granules and blends virgin material with approved regrind.",
			kind: "ACTIVITY",
			name: "Dry and blend material",
			parentId: production.id,
		}),
	);
	const mould = await requireNode(
		addProcessNode(tenantId, map.id, {
			description: "Operator runs the injection moulding machine and records the batch.",
			kind: "ACTIVITY",
			name: "Mould parts",
			parentId: production.id,
		}),
	);
	const qc = await requireNode(
		addProcessNode(tenantId, map.id, {
			description: "Operator trims parts, checks defects, and separates good parts from scrap.",
			kind: "ACTIVITY",
			name: "Trim and QC",
			parentId: production.id,
		}),
	);
	const scrap = await requireNode(
		addProcessNode(tenantId, map.id, {
			description: "Rejected sprues and defective parts are placed in a marked scrap bin.",
			kind: "ACTIVITY",
			name: "Scrap segregation",
			parentId: production.id,
		}),
	);
	const regrind = await requireNode(
		addProcessNode(tenantId, map.id, {
			description: "Scrap is ground and returned to the approved regrind bin when quality allows.",
			kind: "ACTIVITY",
			name: "Regrind scrap",
			parentId: production.id,
			sourceConfidence: "HEARSAY",
			whoWouldKnow: "machine operator",
		}),
	);

	const dispatch = await requireNode(
		addProcessNode(tenantId, map.id, {
			description: "Dispatch and billing are known only as a frontier from the production interview.",
			kind: "PROCESS",
			name: "Dispatch & Billing",
			parentId: null,
			whoWouldKnow: "office",
		}),
	);
	const packDispatch = await requireNode(
		addProcessNode(tenantId, map.id, {
			description: "unexplored",
			kind: "ACTIVITY",
			name: "Pack and dispatch",
			parentId: dispatch.id,
			whoWouldKnow: "office",
		}),
	);
	const invoice = await requireNode(
		addProcessNode(tenantId, map.id, {
			description: "unexplored",
			kind: "ACTIVITY",
			name: "Invoice customer",
			parentId: dispatch.id,
			whoWouldKnow: "office",
		}),
	);

	await Promise.all([
		addRole(tenantId, map.id, receiveGranules.id, "Warehouse worker", "1 person"),
		addRole(tenantId, map.id, checkTicket.id, "Production planner", "1 person"),
		addRole(tenantId, map.id, blend.id, "Material handler", "1 person"),
		addRole(tenantId, map.id, mould.id, "Machine operator", "1 operator"),
		addRole(tenantId, map.id, qc.id, "Machine operator", "1 operator"),
		addRole(tenantId, map.id, scrap.id, "Machine operator", "1 operator"),
		addEquipment(tenantId, map.id, blend.id, "Dryer and mixer"),
		addEquipment(tenantId, map.id, mould.id, "Injection moulding machine"),
		addEquipment(tenantId, map.id, qc.id, "Trimming tools and gauge"),
		addEquipment(tenantId, map.id, regrind.id, "Granulator"),
	]);

	await Promise.all([
		addFlow(tenantId, map.id, receiveGranules.id, "IN", "MATERIAL", "Plastic granules", "Supplier"),
		addFlow(tenantId, map.id, checkTicket.id, "IN", "INFORMATION", "Customer job ticket", "Sales"),
		addFlow(tenantId, map.id, blend.id, "IN", "MATERIAL", "Virgin granules", "Warehouse"),
		addFlow(tenantId, map.id, blend.id, "IN", "MATERIAL", "Approved regrind", "Regrind bin"),
		addFlow(tenantId, map.id, qc.id, "OUT", "MATERIAL", "Good parts", "Dispatch"),
		addFlow(tenantId, map.id, qc.id, "OUT", "MATERIAL", "Scrap parts", "Scrap bin"),
	]);

	await requireEdge(addProcessEdge(tenantId, map.id, { fromNodeId: receiveGranules.id, toNodeId: checkTicket.id }));
	await requireEdge(addProcessEdge(tenantId, map.id, { fromNodeId: checkTicket.id, toNodeId: blend.id }));
	await requireEdge(addProcessEdge(tenantId, map.id, { fromNodeId: blend.id, toNodeId: mould.id }));
	await requireEdge(addProcessEdge(tenantId, map.id, { fromNodeId: mould.id, toNodeId: qc.id }));
	await requireEdge(
		addProcessEdge(tenantId, map.id, {
			fromNodeId: qc.id,
			routingNote: "Good parts go to dispatch",
			toNodeId: packDispatch.id,
		}),
	);
	await requireEdge(
		addProcessEdge(tenantId, map.id, {
			fromNodeId: qc.id,
			routingNote: "Scrap or rejects",
			toNodeId: scrap.id,
		}),
	);
	await requireEdge(
		addProcessEdge(tenantId, map.id, {
			fromNodeId: scrap.id,
			routingNote: "Reusable scrap",
			toNodeId: regrind.id,
		}),
	);
	await requireEdge(
		addProcessEdge(tenantId, map.id, {
			fromNodeId: regrind.id,
			routingNote: "Ground scrap returns to blend",
			toNodeId: blend.id,
		}),
	);
	await requireEdge(addProcessEdge(tenantId, map.id, { fromNodeId: packDispatch.id, toNodeId: invoice.id }));

	return map.id;
}

async function addRole(
	tenantId: string,
	mapId: string,
	nodeId: string,
	label: string,
	quantityNote: string,
) {
	return addProcessResource(tenantId, mapId, {
		label,
		nodeId,
		quantityNote,
		resourceType: "ROLE",
	});
}

async function addEquipment(
	tenantId: string,
	mapId: string,
	nodeId: string,
	label: string,
) {
	return addProcessResource(tenantId, mapId, {
		label,
		nodeId,
		resourceType: "EQUIPMENT",
	});
}

async function addFlow(
	tenantId: string,
	mapId: string,
	nodeId: string,
	direction: "IN" | "OUT",
	flowType: "MATERIAL" | "INFORMATION",
	label: string,
	counterparty: string,
) {
	return addProcessFlow(tenantId, mapId, {
		counterparty,
		direction,
		flowType,
		label,
		nodeId,
	});
}

async function requireNode(
	promise: ReturnType<typeof addProcessNode>,
): Promise<NonNullable<Awaited<ReturnType<typeof addProcessNode>>>> {
	const node = await promise;
	if (!node) {
		throw new Error("Failed to create demo process node.");
	}

	return node;
}

async function requireEdge(
	promise: ReturnType<typeof addProcessEdge>,
): Promise<NonNullable<Awaited<ReturnType<typeof addProcessEdge>>>> {
	const edge = await promise;
	if (!edge) {
		throw new Error("Failed to create demo process edge.");
	}

	return edge;
}

main()
	.catch((error) => {
		console.error(error);
		process.exitCode = 1;
	})
	.finally(() => prisma.$disconnect());
