import { randomUUID } from "node:crypto";
import { withTenantConnection } from "../db";

export type ProcessMapStatus = "DRAFT" | "APPROVED";
export type ProcessNodeKind = "PROCESS" | "SUBPROCESS" | "ACTIVITY";
export type ProcessFlowDirection = "IN" | "OUT";
export type ProcessFlowType = "MATERIAL" | "INFORMATION" | "MONEY";

export type ProcessMap = {
	id: string;
	title: string;
	scopeNote: string | null;
	status: ProcessMapStatus;
	contentLanguage: string;
	createdBy: string;
	createdAt: Date;
	updatedAt: Date;
	deletedAt: Date | null;
};

export type ProcessNode = {
	id: string;
	mapId: string;
	parentId: string | null;
	kind: ProcessNodeKind;
	orderIndex: number;
	name: string;
	description: string | null;
	createdAt: Date;
	updatedAt: Date;
};

export type ProcessFlow = {
	id: string;
	mapId: string;
	nodeId: string;
	direction: ProcessFlowDirection;
	flowType: ProcessFlowType;
	label: string;
	counterparty: string | null;
	orderIndex: number;
	createdAt: Date;
	updatedAt: Date;
};

export type CreateProcessMapInput = {
	title: string;
	scopeNote?: string | null;
	contentLanguage: string;
	createdBy: string;
};

export type AddProcessNodeInput = {
	parentId: string | null;
	kind: ProcessNodeKind;
	name: string;
	description?: string | null;
};

export type UpdateProcessNodeInput = {
	name?: string;
	description?: string | null;
	kind?: ProcessNodeKind;
};

export type AddProcessFlowInput = {
	nodeId: string;
	direction: ProcessFlowDirection;
	flowType: ProcessFlowType;
	label: string;
	counterparty?: string | null;
};

export type UpdateProcessFlowInput = {
	direction?: ProcessFlowDirection;
	flowType?: ProcessFlowType;
	label?: string;
	counterparty?: string | null;
};

type TenantTx = Parameters<Parameters<typeof withTenantConnection>[1]>[0];

class InvalidProcessMapReferenceError extends Error {
	readonly code:
		| "INVALID_PROCESS_PARENT"
		| "INVALID_PROCESS_BEFORE"
		| "INVALID_PROCESS_NODE";

	constructor(
		code:
			| "INVALID_PROCESS_PARENT"
			| "INVALID_PROCESS_BEFORE"
			| "INVALID_PROCESS_NODE",
	) {
		super(code);
		this.name = "InvalidProcessMapReferenceError";
		this.code = code;
	}
}

export async function createProcessMap(
	tenantId: string,
	input: CreateProcessMapInput,
): Promise<ProcessMap> {
	return withTenantConnection(tenantId, async (tx) => {
		const mapId = randomUUID();
		const rows = await tx.$queryRaw<ProcessMap[]>`
			INSERT INTO process_map (
				id,
				title,
				scope_note,
				content_language,
				created_by
			)
			VALUES (
				${mapId}::uuid,
				${input.title},
				${input.scopeNote ?? null},
				${input.contentLanguage},
				${input.createdBy}::uuid
			)
			RETURNING
				id::text AS id,
				title,
				scope_note AS "scopeNote",
				status,
				content_language AS "contentLanguage",
				created_by::text AS "createdBy",
				created_at AS "createdAt",
				updated_at AS "updatedAt",
				deleted_at AS "deletedAt"
		`;

		const map = rows[0];
		if (!map) {
			throw new Error("Failed to create process map.");
		}

		return map;
	});
}

export async function listProcessMaps(
	tenantId: string,
): Promise<ProcessMap[]> {
	return withTenantConnection(tenantId, async (tx) => {
		return tx.$queryRaw<ProcessMap[]>`
			SELECT
				id::text AS id,
				title,
				scope_note AS "scopeNote",
				status,
				content_language AS "contentLanguage",
				created_by::text AS "createdBy",
				created_at AS "createdAt",
				updated_at AS "updatedAt",
				deleted_at AS "deletedAt"
			FROM process_map
			WHERE deleted_at IS NULL
			ORDER BY created_at DESC, id ASC
		`;
	});
}

export async function loadProcessMap(
	tenantId: string,
	mapId: string,
): Promise<{ map: ProcessMap; nodes: ProcessNode[]; flows: ProcessFlow[] } | null> {
	return withTenantConnection(tenantId, async (tx) => {
		const maps = await tx.$queryRaw<ProcessMap[]>`
			SELECT
				id::text AS id,
				title,
				scope_note AS "scopeNote",
				status,
				content_language AS "contentLanguage",
				created_by::text AS "createdBy",
				created_at AS "createdAt",
				updated_at AS "updatedAt",
				deleted_at AS "deletedAt"
			FROM process_map
			WHERE id = ${mapId}::uuid
				AND deleted_at IS NULL
			LIMIT 1
		`;
		const map = maps[0];

		if (!map) {
			return null;
		}

		const [nodes, flows] = await Promise.all([
			listProcessNodes(tx, mapId),
			listProcessFlows(tx, mapId),
		]);

		return { map, nodes, flows };
	});
}

export async function softDeleteProcessMap(
	tenantId: string,
	mapId: string,
): Promise<boolean> {
	return withTenantConnection(tenantId, async (tx) => {
		const rows = await tx.$queryRaw<Array<{ id: string }>>`
			UPDATE process_map
			SET deleted_at = CURRENT_TIMESTAMP,
				updated_at = CURRENT_TIMESTAMP
			WHERE id = ${mapId}::uuid
				AND deleted_at IS NULL
			RETURNING id::text AS id
		`;

		return Boolean(rows[0]);
	});
}

export async function addProcessNode(
	tenantId: string,
	mapId: string,
	input: AddProcessNodeInput,
): Promise<ProcessNode | null> {
	return withTenantConnection(tenantId, async (tx) => {
		await lockProcessMap(tx, mapId);

		if (input.parentId) {
			const parent = await processNodeExists(tx, mapId, input.parentId);
			if (!parent) {
				return null;
			}
		}

		const nodeId = randomUUID();
		const rows = await tx.$queryRaw<ProcessNode[]>`
			INSERT INTO process_node (
				id,
				map_id,
				parent_id,
				kind,
				order_index,
				name,
				description
			)
			SELECT
				${nodeId}::uuid,
				process_map.id,
				${input.parentId ?? null}::uuid,
				${input.kind},
				COALESCE(
					(
						SELECT MAX(order_index) + 1
						FROM process_node
						WHERE map_id = ${mapId}::uuid
							AND parent_id IS NOT DISTINCT FROM ${input.parentId ?? null}::uuid
					),
					0
				),
				${input.name},
				${input.description ?? null}
			FROM process_map
			WHERE process_map.id = ${mapId}::uuid
				AND process_map.deleted_at IS NULL
			RETURNING
				id::text AS id,
				map_id::text AS "mapId",
				parent_id::text AS "parentId",
				kind,
				order_index AS "orderIndex",
				name,
				description,
				created_at AS "createdAt",
				updated_at AS "updatedAt"
		`;

		return rows[0] ?? null;
	});
}

export async function updateProcessNode(
	tenantId: string,
	mapId: string,
	nodeId: string,
	input: UpdateProcessNodeInput,
): Promise<ProcessNode | null> {
	return withTenantConnection(tenantId, async (tx) => {
		const rows = await tx.$queryRaw<ProcessNode[]>`
			UPDATE process_node AS node
			SET
				name = COALESCE(${input.name ?? null}, node.name),
				description = CASE
					WHEN ${input.description !== undefined}
						THEN ${input.description ?? null}
					ELSE node.description
				END,
				kind = COALESCE(${input.kind ?? null}, node.kind),
				updated_at = CURRENT_TIMESTAMP
			FROM process_map AS map
			WHERE node.id = ${nodeId}::uuid
				AND node.map_id = ${mapId}::uuid
				AND map.id = node.map_id
				AND map.deleted_at IS NULL
			RETURNING
				node.id::text AS id,
				node.map_id::text AS "mapId",
				node.parent_id::text AS "parentId",
				node.kind,
				node.order_index AS "orderIndex",
				node.name,
				node.description,
				node.created_at AS "createdAt",
				node.updated_at AS "updatedAt"
		`;

		return rows[0] ?? null;
	});
}

export async function moveProcessNode(
	tenantId: string,
	mapId: string,
	nodeId: string,
	newParentId: string | null,
	beforeId: string | null = null,
): Promise<ProcessNode | null> {
	try {
		return await withTenantConnection(tenantId, async (tx) => {
			await lockProcessMap(tx, mapId);
			await assertValidProcessReparent(tx, mapId, nodeId, newParentId);

			const rows = await tx.$queryRaw<ProcessNode[]>`
				UPDATE process_node AS node
				SET parent_id = ${newParentId ?? null}::uuid,
					updated_at = CURRENT_TIMESTAMP
				FROM process_map AS map
				WHERE node.id = ${nodeId}::uuid
					AND node.map_id = ${mapId}::uuid
					AND map.id = node.map_id
					AND map.deleted_at IS NULL
				RETURNING
					node.id::text AS id,
					node.map_id::text AS "mapId",
					node.parent_id::text AS "parentId",
					node.kind,
					node.order_index AS "orderIndex",
					node.name,
					node.description,
					node.created_at AS "createdAt",
					node.updated_at AS "updatedAt"
			`;
			const node = rows[0] ?? null;

			if (!node) {
				return null;
			}

			const orderIndex = await repositionProcessNode(
				tx,
				mapId,
				node.id,
				node.parentId,
				beforeId,
			);

			return { ...node, orderIndex };
		});
	} catch (error) {
		if (error instanceof InvalidProcessMapReferenceError) {
			return null;
		}

		throw error;
	}
}

export async function deleteProcessNode(
	tenantId: string,
	mapId: string,
	nodeId: string,
): Promise<boolean> {
	return withTenantConnection(tenantId, async (tx) => {
		await lockProcessMap(tx, mapId);

		const target = await tx.$queryRaw<Array<{ parentId: string | null }>>`
			SELECT node.parent_id::text AS "parentId"
			FROM process_node AS node
			JOIN process_map AS map ON map.id = node.map_id
			WHERE node.id = ${nodeId}::uuid
				AND node.map_id = ${mapId}::uuid
				AND map.deleted_at IS NULL
			LIMIT 1
		`;
		const node = target[0];

		if (!node) {
			return false;
		}

		// Promote children before deleting. The self-parent FK and process_flow
		// node FK are both ON DELETE CASCADE, so a bare delete would erase the
		// entire subtree and every flow attached below the target.
		await tx.$executeRaw`
			UPDATE process_node
			SET parent_id = ${node.parentId}::uuid,
				updated_at = CURRENT_TIMESTAMP
			WHERE map_id = ${mapId}::uuid
				AND parent_id = ${nodeId}::uuid
		`;

		await tx.$executeRaw`
			WITH ordered AS (
				SELECT id,
					(ROW_NUMBER() OVER (
						ORDER BY order_index ASC, created_at ASC, id ASC
					) - 1) AS new_index
				FROM process_node
				WHERE map_id = ${mapId}::uuid
					AND parent_id IS NOT DISTINCT FROM ${node.parentId}::uuid
					AND id <> ${nodeId}::uuid
			)
			UPDATE process_node AS n
			SET order_index = ordered.new_index, updated_at = CURRENT_TIMESTAMP
			FROM ordered
			WHERE n.id = ordered.id
				AND n.order_index IS DISTINCT FROM ordered.new_index
		`;

		const rows = await tx.$queryRaw<Array<{ id: string }>>`
			DELETE FROM process_node
			WHERE id = ${nodeId}::uuid
				AND map_id = ${mapId}::uuid
			RETURNING id::text AS id
		`;

		return Boolean(rows[0]);
	});
}

export async function addProcessFlow(
	tenantId: string,
	mapId: string,
	input: AddProcessFlowInput,
): Promise<ProcessFlow | null> {
	return withTenantConnection(tenantId, async (tx) => {
		await lockProcessMap(tx, mapId);

		const flowId = randomUUID();
		const rows = await tx.$queryRaw<ProcessFlow[]>`
			INSERT INTO process_flow (
				id,
				map_id,
				node_id,
				direction,
				flow_type,
				label,
				counterparty,
				order_index
			)
			SELECT
				${flowId}::uuid,
				node.map_id,
				node.id,
				${input.direction},
				${input.flowType},
				${input.label},
				${input.counterparty ?? null},
				COALESCE(
					(
						SELECT MAX(order_index) + 1
						FROM process_flow
						WHERE map_id = ${mapId}::uuid
							AND node_id = ${input.nodeId}::uuid
					),
					0
				)
			FROM process_node AS node
			JOIN process_map AS map ON map.id = node.map_id
			WHERE node.id = ${input.nodeId}::uuid
				AND node.map_id = ${mapId}::uuid
				AND map.deleted_at IS NULL
			RETURNING
				id::text AS id,
				map_id::text AS "mapId",
				node_id::text AS "nodeId",
				direction,
				flow_type AS "flowType",
				label,
				counterparty,
				order_index AS "orderIndex",
				created_at AS "createdAt",
				updated_at AS "updatedAt"
		`;

		return rows[0] ?? null;
	});
}

export async function updateProcessFlow(
	tenantId: string,
	mapId: string,
	flowId: string,
	input: UpdateProcessFlowInput,
): Promise<ProcessFlow | null> {
	return withTenantConnection(tenantId, async (tx) => {
		const rows = await tx.$queryRaw<ProcessFlow[]>`
			UPDATE process_flow AS flow
			SET
				direction = COALESCE(${input.direction ?? null}, flow.direction),
				flow_type = COALESCE(${input.flowType ?? null}, flow.flow_type),
				label = COALESCE(${input.label ?? null}, flow.label),
				counterparty = CASE
					WHEN ${input.counterparty !== undefined}
						THEN ${input.counterparty ?? null}
					ELSE flow.counterparty
				END,
				updated_at = CURRENT_TIMESTAMP
			FROM process_map AS map
			WHERE flow.id = ${flowId}::uuid
				AND flow.map_id = ${mapId}::uuid
				AND map.id = flow.map_id
				AND map.deleted_at IS NULL
			RETURNING
				flow.id::text AS id,
				flow.map_id::text AS "mapId",
				flow.node_id::text AS "nodeId",
				flow.direction,
				flow.flow_type AS "flowType",
				flow.label,
				flow.counterparty,
				flow.order_index AS "orderIndex",
				flow.created_at AS "createdAt",
				flow.updated_at AS "updatedAt"
		`;

		return rows[0] ?? null;
	});
}

export async function removeProcessFlow(
	tenantId: string,
	mapId: string,
	flowId: string,
): Promise<boolean> {
	return withTenantConnection(tenantId, async (tx) => {
		const rows = await tx.$queryRaw<Array<{ id: string }>>`
			DELETE FROM process_flow AS flow
			USING process_map AS map
			WHERE flow.id = ${flowId}::uuid
				AND flow.map_id = ${mapId}::uuid
				AND map.id = flow.map_id
				AND map.deleted_at IS NULL
			RETURNING flow.id::text AS id
		`;

		return Boolean(rows[0]);
	});
}

async function lockProcessMap(tx: TenantTx, mapId: string): Promise<void> {
	await tx.$queryRaw`
		SELECT pg_advisory_xact_lock(hashtextextended(${mapId}, 0))::text
	`;
}

async function processNodeExists(
	tx: TenantTx,
	mapId: string,
	nodeId: string,
): Promise<boolean> {
	const rows = await tx.$queryRaw<Array<{ id: string }>>`
		SELECT id::text AS id
		FROM process_node
		WHERE id = ${nodeId}::uuid
			AND map_id = ${mapId}::uuid
		LIMIT 1
	`;

	return Boolean(rows[0]);
}

async function assertValidProcessReparent(
	tx: TenantTx,
	mapId: string,
	nodeId: string,
	parentId: string | null,
): Promise<void> {
	const nodeExists = await processNodeExists(tx, mapId, nodeId);
	if (!nodeExists) {
		throw new InvalidProcessMapReferenceError("INVALID_PROCESS_NODE");
	}

	if (parentId === null) {
		return;
	}

	const movedId = nodeId.toLowerCase();

	if (parentId.toLowerCase() === movedId) {
		throw new InvalidProcessMapReferenceError("INVALID_PROCESS_PARENT");
	}

	// The target parent plus all of its ancestors; the moved node must not be
	// among them. UNION terminates even if existing data already cycles.
	const ancestors = await tx.$queryRaw<Array<{ id: string }>>`
		WITH RECURSIVE ancestor AS (
			SELECT id, parent_id
			FROM process_node
			WHERE id = ${parentId}::uuid
				AND map_id = ${mapId}::uuid
			UNION
			SELECT node.id, node.parent_id
			FROM process_node node
			JOIN ancestor ON node.id = ancestor.parent_id
			WHERE node.map_id = ${mapId}::uuid
		)
		SELECT id::text AS id
		FROM ancestor
	`;

	if (ancestors.length === 0) {
		throw new InvalidProcessMapReferenceError("INVALID_PROCESS_PARENT");
	}

	if (ancestors.some((ancestor) => ancestor.id.toLowerCase() === movedId)) {
		throw new InvalidProcessMapReferenceError("INVALID_PROCESS_PARENT");
	}
}

async function repositionProcessNode(
	tx: TenantTx,
	mapId: string,
	nodeId: string,
	parentId: string | null,
	beforeId: string | null,
): Promise<number> {
	const siblings = await tx.$queryRaw<Array<{ id: string }>>`
		SELECT id::text AS id
		FROM process_node
		WHERE map_id = ${mapId}::uuid
			AND parent_id IS NOT DISTINCT FROM ${parentId}::uuid
			AND id <> ${nodeId}::uuid
		ORDER BY order_index ASC, created_at ASC, id ASC
	`;
	const ordered = siblings.map((sibling) => sibling.id);
	let movedIndex = ordered.length;

	if (beforeId !== null) {
		const target = beforeId.toLowerCase();
		movedIndex = ordered.findIndex((id) => id.toLowerCase() === target);

		if (movedIndex === -1) {
			throw new InvalidProcessMapReferenceError("INVALID_PROCESS_BEFORE");
		}
	}

	ordered.splice(movedIndex, 0, nodeId);

	for (const [index, id] of ordered.entries()) {
		await tx.$executeRaw`
			UPDATE process_node
			SET order_index = ${index}, updated_at = CURRENT_TIMESTAMP
			WHERE id = ${id}::uuid
				AND map_id = ${mapId}::uuid
				AND order_index IS DISTINCT FROM ${index}
		`;
	}

	return movedIndex;
}

async function listProcessNodes(
	tx: TenantTx,
	mapId: string,
): Promise<ProcessNode[]> {
	return tx.$queryRaw<ProcessNode[]>`
		SELECT
			id::text AS id,
			map_id::text AS "mapId",
			parent_id::text AS "parentId",
			kind,
			order_index AS "orderIndex",
			name,
			description,
			created_at AS "createdAt",
			updated_at AS "updatedAt"
		FROM process_node
		WHERE map_id = ${mapId}::uuid
		ORDER BY order_index ASC, created_at ASC, id ASC
	`;
}

async function listProcessFlows(
	tx: TenantTx,
	mapId: string,
): Promise<ProcessFlow[]> {
	return tx.$queryRaw<ProcessFlow[]>`
		SELECT
			id::text AS id,
			map_id::text AS "mapId",
			node_id::text AS "nodeId",
			direction,
			flow_type AS "flowType",
			label,
			counterparty,
			order_index AS "orderIndex",
			created_at AS "createdAt",
			updated_at AS "updatedAt"
		FROM process_flow
		WHERE map_id = ${mapId}::uuid
		ORDER BY order_index ASC, created_at ASC, id ASC
	`;
}
