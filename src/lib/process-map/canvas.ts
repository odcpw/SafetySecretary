import type {
	ProcessMapFogState,
	ProcessMapQuestLog,
} from "./readiness";
import type { ProcessNode, ProcessResource } from "./index";

export type ProcessMapCanvasNode = Pick<
	ProcessNode,
	"id" | "parentId" | "name" | "orderIndex"
>;

export type ProcessMapCanvasResource = Pick<
	ProcessResource,
	"nodeId" | "resourceType"
>;

export type ProcessMapNodeAggregate = {
	childBlockCount: number;
	fogShare: number;
	peopleCount: number;
};

export type ProcessMapAltitudeView = {
	aggregatesByNodeId: ReadonlyMap<string, ProcessMapNodeAggregate>;
	collapsedNodeIds: ReadonlySet<string>;
	depthByNodeId: ReadonlyMap<string, number>;
	maxDepth: number;
	visibleNodeIds: ReadonlySet<string>;
};

export function computeProcessMapAltitudeView(input: {
	altitude: number;
	fogStates: ReadonlyMap<string, ProcessMapFogState>;
	nodes: readonly ProcessMapCanvasNode[];
	resources: readonly ProcessMapCanvasResource[];
}): ProcessMapAltitudeView {
	const altitude = Math.max(1, Math.floor(input.altitude));
	const childrenByParent = groupChildrenByParent(input.nodes);
	const depthByNodeId = computeDepths(input.nodes, childrenByParent);
	const visibleNodeIds = new Set<string>();
	const collapsedNodeIds = new Set<string>();
	let maxDepth = 1;

	for (const node of input.nodes) {
		const depth = depthByNodeId.get(node.id) ?? 1;
		maxDepth = Math.max(maxDepth, depth);
		if (depth <= altitude) {
			visibleNodeIds.add(node.id);
		}

		if (depth === altitude && hasDescendants(node.id, childrenByParent)) {
			collapsedNodeIds.add(node.id);
		}
	}

	return {
		aggregatesByNodeId: computeCollapsedAggregates({
			collapsedNodeIds,
			childrenByParent,
			fogStates: input.fogStates,
			resources: input.resources,
		}),
		collapsedNodeIds,
		depthByNodeId,
		maxDepth,
		visibleNodeIds,
	};
}

export function exploredPercent(questLog: ProcessMapQuestLog): number {
	const total = questLog.clearCount + questLog.hazeCount + questLog.fogCount;

	if (total === 0) {
		return 0;
	}

	return Math.round((questLog.clearCount / total) * 100);
}

function groupChildrenByParent(
	nodes: readonly ProcessMapCanvasNode[],
): ReadonlyMap<string, readonly ProcessMapCanvasNode[]> {
	const childrenByParent = new Map<string, ProcessMapCanvasNode[]>();

	for (const node of nodes) {
		if (!node.parentId) {
			continue;
		}

		const children = childrenByParent.get(node.parentId) ?? [];
		children.push(node);
		childrenByParent.set(node.parentId, children);
	}

	for (const children of childrenByParent.values()) {
		children.sort((left, right) => {
			const orderDelta = left.orderIndex - right.orderIndex;
			return orderDelta === 0 ? left.name.localeCompare(right.name) : orderDelta;
		});
	}

	return childrenByParent;
}

function computeDepths(
	nodes: readonly ProcessMapCanvasNode[],
	childrenByParent: ReadonlyMap<string, readonly ProcessMapCanvasNode[]>,
): ReadonlyMap<string, number> {
	const depthByNodeId = new Map<string, number>();
	const topLevel = nodes
		.filter((node) => !node.parentId)
		.toSorted((left, right) => {
			const orderDelta = left.orderIndex - right.orderIndex;
			return orderDelta === 0 ? left.name.localeCompare(right.name) : orderDelta;
		});

	const visit = (node: ProcessMapCanvasNode, depth: number) => {
		if (depthByNodeId.has(node.id)) {
			return;
		}

		depthByNodeId.set(node.id, depth);
		for (const child of childrenByParent.get(node.id) ?? []) {
			visit(child, depth + 1);
		}
	};

	for (const node of topLevel) {
		visit(node, 1);
	}

	for (const node of nodes) {
		if (!depthByNodeId.has(node.id)) {
			visit(node, 1);
		}
	}

	return depthByNodeId;
}

function hasDescendants(
	nodeId: string,
	childrenByParent: ReadonlyMap<string, readonly ProcessMapCanvasNode[]>,
): boolean {
	const children = childrenByParent.get(nodeId) ?? [];

	if (children.length > 0) {
		return true;
	}

	return false;
}

function computeCollapsedAggregates(input: {
	collapsedNodeIds: ReadonlySet<string>;
	childrenByParent: ReadonlyMap<string, readonly ProcessMapCanvasNode[]>;
	fogStates: ReadonlyMap<string, ProcessMapFogState>;
	resources: readonly ProcessMapCanvasResource[];
}): ReadonlyMap<string, ProcessMapNodeAggregate> {
	const roleCountByNode = new Map<string, number>();
	for (const resource of input.resources) {
		if (resource.resourceType !== "ROLE") {
			continue;
		}

		roleCountByNode.set(
			resource.nodeId,
			(roleCountByNode.get(resource.nodeId) ?? 0) + 1,
		);
	}

	const aggregates = new Map<string, ProcessMapNodeAggregate>();
	for (const nodeId of input.collapsedNodeIds) {
		const descendants = collectDescendants(nodeId, input.childrenByParent);
		const fogCount = descendants.filter(
			(descendant) => input.fogStates.get(descendant.id) === "fog",
		).length;
		const peopleCount = descendants.reduce(
			(total, descendant) => total + (roleCountByNode.get(descendant.id) ?? 0),
			0,
		);

		aggregates.set(nodeId, {
			childBlockCount: descendants.length,
			fogShare: descendants.length === 0 ? 0 : fogCount / descendants.length,
			peopleCount,
		});
	}

	return aggregates;
}

function collectDescendants(
	nodeId: string,
	childrenByParent: ReadonlyMap<string, readonly ProcessMapCanvasNode[]>,
): ProcessMapCanvasNode[] {
	const descendants: ProcessMapCanvasNode[] = [];
	const stack = [...(childrenByParent.get(nodeId) ?? [])];

	while (stack.length > 0) {
		const node = stack.shift();
		if (!node) {
			continue;
		}

		descendants.push(node);
		stack.unshift(...(childrenByParent.get(node.id) ?? []));
	}

	return descendants;
}
