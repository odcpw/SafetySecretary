import type {
	ProcessEdge,
	ProcessNode,
	ProcessResource,
} from "./index";

export type ProcessMapFogState = "clear" | "haze" | "fog";

export type ProcessMapReadinessCode =
	| "SPINE_GAP"
	| "FORK_UNEXPLAINED"
	| "LEAF_WITHOUT_ROLE"
	| "HEARSAY_UNCONFIRMED"
	| "EMPTY_BRANCH";

export type ProcessMapReadinessItem = {
	readonly code: ProcessMapReadinessCode;
	readonly label: string;
	readonly count?: number;
};

export type ProcessMapReadinessInput = {
	readonly nodes: readonly ProcessNode[];
	readonly edges: readonly ProcessEdge[];
	readonly resources: readonly ProcessResource[];
};

export type ProcessMapReadiness = {
	readonly ready: boolean;
	readonly items: readonly ProcessMapReadinessItem[];
	readonly questLog: ProcessMapQuestLog;
};

export type ProcessMapQuestLog = {
	readonly clearCount: number;
	readonly hazeCount: number;
	readonly fogCount: number;
	readonly quests: readonly ProcessMapQuest[];
};

export type ProcessMapQuest = {
	readonly nodeName: string;
	readonly whoWouldKnow: string;
};

export function computeProcessMapReadiness(
	input: ProcessMapReadinessInput,
): ProcessMapReadiness {
	const items: ProcessMapReadinessItem[] = [];
	const nodesById = new Map(input.nodes.map((node) => [node.id, node]));
	const childCountByParent = countBy(
		input.nodes
			.filter((node) => node.parentId)
			.map((node) => node.parentId as string),
	);
	const incomingByNode = countBy(input.edges.map((edge) => edge.toNodeId));
	const outgoingByNode = countBy(input.edges.map((edge) => edge.fromNodeId));
	const roleResourcesByNode = new Map<string, number>();

	for (const resource of input.resources) {
		if (resource.resourceType === "ROLE") {
			roleResourcesByNode.set(
				resource.nodeId,
				(roleResourcesByNode.get(resource.nodeId) ?? 0) + 1,
			);
		}
	}

	const spineGapCount = countSpineGaps({
		edges: input.edges,
		incomingByNode,
		nodes: input.nodes,
		outgoingByNode,
	});
	if (spineGapCount > 0) {
		items.push({
			code: "SPINE_GAP",
			count: spineGapCount,
			label: "Spine has gaps or isolated blocks.",
		});
	}

	const forkUnexplainedCount = input.edges.filter((edge) => {
		const outgoingCount = outgoingByNode.get(edge.fromNodeId) ?? 0;
		const isLoop = edge.fromNodeId === edge.toNodeId;
		return (outgoingCount > 1 || isLoop) && !edge.routingNote?.trim();
	}).length;
	if (forkUnexplainedCount > 0) {
		items.push({
			code: "FORK_UNEXPLAINED",
			count: forkUnexplainedCount,
			label: "Forks or loops need routing notes.",
		});
	}

	const leaves = input.nodes.filter(
		(node) => (childCountByParent.get(node.id) ?? 0) === 0,
	);
	const leavesWithoutRole = leaves.filter(
		(node) => (roleResourcesByNode.get(node.id) ?? 0) === 0,
	).length;
	if (leavesWithoutRole > 0) {
		items.push({
			code: "LEAF_WITHOUT_ROLE",
			count: leavesWithoutRole,
			label: "Working-level blocks need an owning role.",
		});
	}

	const hearsayCount = input.nodes.filter(
		(node) => node.sourceConfidence === "HEARSAY",
	).length;
	if (hearsayCount > 0) {
		items.push({
			code: "HEARSAY_UNCONFIRMED",
			count: hearsayCount,
			label: "Hearsay blocks need to be named for confirmation.",
		});
	}

	const emptyBranchCount = input.nodes.filter((node) => {
		if (node.kind === "ACTIVITY") {
			return false;
		}
		const childCount = childCountByParent.get(node.id) ?? 0;
		const hasAnyEdge =
			(incomingByNode.get(node.id) ?? 0) + (outgoingByNode.get(node.id) ?? 0) >
			0;
		return childCount === 0 && !hasAnyEdge && nodesById.has(node.id);
	}).length;
	if (emptyBranchCount > 0) {
		items.push({
			code: "EMPTY_BRANCH",
			count: emptyBranchCount,
			label: "Empty process branches should be filled or explicitly left open.",
		});
	}

	return {
		items,
		questLog: deriveProcessMapQuestLog(input),
		ready: items.length === 0,
	};
}

export function deriveProcessMapQuestLog(
	input: ProcessMapReadinessInput,
): ProcessMapQuestLog {
	const childCountByParent = countBy(
		input.nodes
			.filter((node) => node.parentId)
			.map((node) => node.parentId as string),
	);
	const incomingByNode = countBy(input.edges.map((edge) => edge.toNodeId));
	const outgoingByNode = countBy(input.edges.map((edge) => edge.fromNodeId));
	const resourcesByNode = countBy(input.resources.map((resource) => resource.nodeId));
	const roleResourcesByNode = countBy(
		input.resources
			.filter((resource) => resource.resourceType === "ROLE")
			.map((resource) => resource.nodeId),
	);

	let clearCount = 0;
	let hazeCount = 0;
	let fogCount = 0;
	const quests: ProcessMapQuest[] = [];

	for (const node of input.nodes) {
		const state = deriveProcessMapFogState({
			childCount: childCountByParent.get(node.id) ?? 0,
			edgeCount:
				(incomingByNode.get(node.id) ?? 0) +
				(outgoingByNode.get(node.id) ?? 0),
			node,
			resourceCount: resourcesByNode.get(node.id) ?? 0,
			roleResourceCount: roleResourcesByNode.get(node.id) ?? 0,
		});

		if (state === "clear") {
			clearCount += 1;
		} else if (state === "haze") {
			hazeCount += 1;
		} else {
			fogCount += 1;
		}

		if (state !== "clear" && node.whoWouldKnow?.trim()) {
			quests.push({
				nodeName: node.name,
				whoWouldKnow: node.whoWouldKnow.trim(),
			});
		}
	}

	return { clearCount, fogCount, hazeCount, quests };
}

export function deriveProcessMapFogState(input: {
	readonly node: ProcessNode;
	readonly childCount: number;
	readonly edgeCount: number;
	readonly resourceCount: number;
	readonly roleResourceCount: number;
}): ProcessMapFogState {
	const description = input.node.description?.trim() ?? "";
	const hasDescription = description.length > 0;
	const hasSubstantiveDescription =
		hasDescription && description.toLowerCase() !== "unexplored";
	const isLeaf = input.childCount === 0;
	const leafIsOwned = !isLeaf || input.roleResourceCount > 0;

	if (
		input.node.sourceConfidence === "DIRECT" &&
		hasSubstantiveDescription &&
		leafIsOwned
	) {
		return "clear";
	}

	const isEmptyStub =
		!hasSubstantiveDescription ||
		(input.edgeCount === 0 && input.resourceCount === 0);
	if (input.node.sourceConfidence === "HEARSAY" && !isEmptyStub) {
		return "haze";
	}

	return "fog";
}

function countSpineGaps(input: {
	readonly nodes: readonly ProcessNode[];
	readonly edges: readonly ProcessEdge[];
	readonly incomingByNode: ReadonlyMap<string, number>;
	readonly outgoingByNode: ReadonlyMap<string, number>;
}): number {
	if (input.nodes.length < 2) {
		return 1;
	}

	if (input.edges.length === 0) {
		return input.nodes.length;
	}

	let count = 0;
	const siblingsByParent = new Map<string, ProcessNode[]>();
	for (const node of input.nodes) {
		const key = node.parentId ?? "__top__";
		const siblings = siblingsByParent.get(key) ?? [];
		siblings.push(node);
		siblingsByParent.set(key, siblings);
	}

	for (const siblings of siblingsByParent.values()) {
		if (siblings.length < 2) {
			continue;
		}

		const siblingIds = new Set(siblings.map((node) => node.id));
		const siblingEdges = input.edges.filter(
			(edge) =>
				siblingIds.has(edge.fromNodeId) || siblingIds.has(edge.toNodeId),
		);
		if (siblingEdges.length === 0) {
			count += siblings.length;
			continue;
		}

		for (const node of siblings) {
			const degree =
				(input.incomingByNode.get(node.id) ?? 0) +
				(input.outgoingByNode.get(node.id) ?? 0);
			if (degree === 0) {
				count += 1;
			}
		}
	}

	return count;
}

function countBy(values: readonly string[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const value of values) {
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}
	return counts;
}
