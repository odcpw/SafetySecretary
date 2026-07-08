import { withTenantConnection } from "../db";
import {
	addProcessEdge,
	addProcessFlow,
	addProcessNode,
	addProcessResource,
	moveProcessNode,
	removeProcessEdge,
	removeProcessFlow,
	removeProcessResource,
	updateProcessNode,
	type ProcessEdge,
	type ProcessFlow,
	type ProcessNode,
	type ProcessResource,
} from "./index";
import type { ProcessMapOperation } from "./operations";

export type ProcessMapCoachApplyResult =
	| {
			readonly ok: true;
			readonly appliedKind: ProcessMapOperation["kind"];
			readonly recordId: string | null;
	  }
	| {
			readonly ok: false;
			readonly code:
				| "ASK_ONLY_OPERATION"
				| "MAP_NOT_FOUND"
				| "UNRESOLVED_OPERATION_REFERENCE"
				| "NODE_NOT_FOUND"
				| "EDGE_NOT_FOUND"
				| "FLOW_NOT_FOUND"
				| "RESOURCE_NOT_FOUND";
	  };

export async function applyProcessMapOperation(input: {
	readonly tenantId: string;
	readonly mapId: string;
	readonly operation: ProcessMapOperation;
	readonly operationRecordMap?: Readonly<Record<string, string | null>>;
}): Promise<ProcessMapCoachApplyResult> {
	const guarded = await guardProcessMapForApply(input.tenantId, input.mapId);
	if (!guarded) {
		return { code: "MAP_NOT_FOUND", ok: false };
	}

	switch (input.operation.kind) {
		case "ask_question":
			return { code: "ASK_ONLY_OPERATION", ok: false };

		case "node_add": {
			const parentRef = resolveOperationReference(
				input.operation.payload.parentRef,
				input.operationRecordMap,
			);
			if (!parentRef.ok) {
				return { code: "UNRESOLVED_OPERATION_REFERENCE", ok: false };
			}
			const node = await addProcessNode(input.tenantId, input.mapId, {
				description: input.operation.payload.description ?? null,
				kind: input.operation.payload.kind,
				name: input.operation.payload.name,
				parentId: parentRef.value,
			});
			return resultForRecord(input.operation.kind, node, "NODE_NOT_FOUND");
		}

		case "node_update": {
			const nodeId = resolveExistingId(
				input.operation.payload.nodeId,
				input.operationRecordMap,
			);
			if (!nodeId.ok) {
				return { code: "UNRESOLVED_OPERATION_REFERENCE", ok: false };
			}
			const node = await updateProcessNode(input.tenantId, input.mapId, nodeId.value, {
				description: input.operation.payload.description,
				durationNote: input.operation.payload.durationNote,
				frequencyNote: input.operation.payload.frequencyNote,
				kind: input.operation.payload.kind,
				name: input.operation.payload.name,
				sourceConfidence: input.operation.payload.sourceConfidence,
			});
			return resultForRecord(input.operation.kind, node, "NODE_NOT_FOUND");
		}

		case "node_move": {
			const nodeId = resolveExistingId(
				input.operation.payload.nodeId,
				input.operationRecordMap,
			);
			const parentRef = resolveOperationReference(
				input.operation.payload.newParentRef,
				input.operationRecordMap,
			);
			if (!nodeId.ok || !parentRef.ok) {
				return { code: "UNRESOLVED_OPERATION_REFERENCE", ok: false };
			}
			const node = await moveProcessNode(
				input.tenantId,
				input.mapId,
				nodeId.value,
				parentRef.value,
			);
			return resultForRecord(input.operation.kind, node, "NODE_NOT_FOUND");
		}

		case "edge_add": {
			const fromRef = resolveExistingId(
				input.operation.payload.fromRef,
				input.operationRecordMap,
			);
			const toRef = resolveExistingId(
				input.operation.payload.toRef,
				input.operationRecordMap,
			);
			if (!fromRef.ok || !toRef.ok) {
				return { code: "UNRESOLVED_OPERATION_REFERENCE", ok: false };
			}
			const edge = await addProcessEdge(input.tenantId, input.mapId, {
				fromNodeId: fromRef.value,
				routingNote: input.operation.payload.routingNote ?? null,
				toNodeId: toRef.value,
			});
			return resultForRecord(input.operation.kind, edge, "EDGE_NOT_FOUND");
		}

		case "edge_remove": {
			const removed = await removeProcessEdge(
				input.tenantId,
				input.mapId,
				input.operation.payload.edgeId,
			);
			return removed
				? {
						appliedKind: input.operation.kind,
						ok: true,
						recordId: input.operation.payload.edgeId,
					}
				: { code: "EDGE_NOT_FOUND", ok: false };
		}

		case "flow_add": {
			const nodeRef = resolveExistingId(
				input.operation.payload.nodeRef,
				input.operationRecordMap,
			);
			if (!nodeRef.ok) {
				return { code: "UNRESOLVED_OPERATION_REFERENCE", ok: false };
			}
			const flow = await addProcessFlow(input.tenantId, input.mapId, {
				counterparty: input.operation.payload.counterparty ?? null,
				direction: input.operation.payload.direction,
				flowType: input.operation.payload.flowType,
				label: input.operation.payload.label,
				nodeId: nodeRef.value,
			});
			return resultForRecord(input.operation.kind, flow, "FLOW_NOT_FOUND");
		}

		case "flow_remove": {
			const removed = await removeProcessFlow(
				input.tenantId,
				input.mapId,
				input.operation.payload.flowId,
			);
			return removed
				? {
						appliedKind: input.operation.kind,
						ok: true,
						recordId: input.operation.payload.flowId,
					}
				: { code: "FLOW_NOT_FOUND", ok: false };
		}

		case "resource_add": {
			const nodeRef = resolveExistingId(
				input.operation.payload.nodeRef,
				input.operationRecordMap,
			);
			if (!nodeRef.ok) {
				return { code: "UNRESOLVED_OPERATION_REFERENCE", ok: false };
			}
			const resource = await addProcessResource(input.tenantId, input.mapId, {
				label: input.operation.payload.label,
				nodeId: nodeRef.value,
				quantityNote: input.operation.payload.quantityNote ?? null,
				resourceType: input.operation.payload.resourceType,
				returnable: input.operation.payload.returnable ?? false,
			});
			return resultForRecord(
				input.operation.kind,
				resource,
				"RESOURCE_NOT_FOUND",
			);
		}

		case "resource_remove": {
			const removed = await removeProcessResource(
				input.tenantId,
				input.mapId,
				input.operation.payload.resourceId,
			);
			return removed
				? {
						appliedKind: input.operation.kind,
						ok: true,
						recordId: input.operation.payload.resourceId,
					}
				: { code: "RESOURCE_NOT_FOUND", ok: false };
		}
	}
}

function resultForRecord(
	kind: ProcessMapOperation["kind"],
	record: ProcessNode | ProcessEdge | ProcessFlow | ProcessResource | null,
	notFoundCode:
		| "NODE_NOT_FOUND"
		| "EDGE_NOT_FOUND"
		| "FLOW_NOT_FOUND"
		| "RESOURCE_NOT_FOUND",
): ProcessMapCoachApplyResult {
	return record
		? { appliedKind: kind, ok: true, recordId: record.id }
		: { code: notFoundCode, ok: false };
}

async function guardProcessMapForApply(
	tenantId: string,
	mapId: string,
): Promise<boolean> {
	return withTenantConnection(tenantId, async (tx) => {
		const rows = await tx.$queryRaw<Array<{ id: string }>>`
			SELECT id::text AS id
			FROM process_map
			WHERE id = ${mapId}::uuid
				AND deleted_at IS NULL
			LIMIT 1
		`;

		if (!rows[0]) {
			return false;
		}

		await tx.$queryRaw`
			SELECT pg_advisory_xact_lock(hashtextextended(${mapId}, 0))::text
		`;
		return true;
	});
}

function resolveExistingId(
	value: string,
	operationRecordMap: Readonly<Record<string, string | null>> | undefined,
): { readonly ok: true; readonly value: string } | { readonly ok: false } {
	const resolved = resolveOperationReference(value, operationRecordMap);
	return resolved.ok && resolved.value
		? { ok: true, value: resolved.value }
		: { ok: false };
}

function resolveOperationReference(
	value: string | null | undefined,
	operationRecordMap: Readonly<Record<string, string | null>> | undefined,
): { readonly ok: true; readonly value: string | null } | { readonly ok: false } {
	if (value === null || value === undefined || value === "") {
		return { ok: true, value: null };
	}

	if (operationRecordMap && Object.hasOwn(operationRecordMap, value)) {
		const resolved = operationRecordMap[value];
		return resolved ? { ok: true, value: resolved } : { ok: false };
	}

	return { ok: true, value };
}
