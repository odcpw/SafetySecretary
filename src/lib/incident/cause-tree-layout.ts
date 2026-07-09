import {
	CONTROL_HIERARCHY_LETTERS,
	type ControlHierarchyCode,
} from "../taxonomy/schema";

// Canonical tidy-tree layout for the cause tree, shared by the on-screen graph
// (CauseGraph.tsx) and the export SVG renderer (exports/ii/cause-tree-svg.ts)
// so the two never diverge. This module is pure (no React, no DOM): it returns
// positioned nodes + a semantic status per node; each renderer maps status to
// its own palette (dark UI vs print).

export const NODE_W = 248;
export const NODE_H = 86;
const COL_GAP = 76;
const ROW_GAP = 18;
export const COL_W = NODE_W + COL_GAP;
export const ROW_H = NODE_H + ROW_GAP;
export const PAD = 24;

export type LaidNodeKind = "event" | "cause" | "measure";
export type LaidNodeStatus = "event" | "open" | "root" | "parked" | "treated";

export type LaidNode = {
	id: string;
	kind: LaidNodeKind;
	label: string;
	parentId: string | null;
	status: LaidNodeStatus;
	stopClass: string | null;
	meta: string | null;
	depth: number;
	x: number;
	y: number;
};

export type LayoutCause = {
	readonly id: string;
	readonly parentId: string | null;
	readonly statement: string;
	readonly isRootCause?: boolean;
	readonly branchStatus?: string | null;
};

export type LayoutAction = {
	readonly id: string;
	readonly causeNodeId: string;
	readonly description: string;
	readonly actionType?: string | null;
	readonly ownerRole?: string | null;
	readonly dueDate?: string | null;
};

export type LayoutInput = {
	readonly eventTitle: string;
	readonly causes: readonly LayoutCause[];
	readonly actions: readonly LayoutAction[];
	readonly collapsed?: ReadonlySet<string>;
};

export type CauseTreeLayout = {
	readonly nodes: LaidNode[];
	readonly width: number;
	readonly height: number;
	readonly childCount: Map<string, number>;
};

export const EVENT_NODE_ID = "__event__";

function actionTypeToLetter(
	actionType: string | null | undefined,
): string | null {
	if (!actionType) {
		return null;
	}
	const code = actionType as ControlHierarchyCode;
	return CONTROL_HIERARCHY_LETTERS[code] ?? null;
}

function causeStatus(cause: LayoutCause, measureCount: number): LaidNodeStatus {
	if (cause.branchStatus === "PARKED") {
		return "parked";
	}
	if (cause.isRootCause || cause.branchStatus === "ROOT_REACHED") {
		return "root";
	}
	if (measureCount > 0) {
		return "treated";
	}
	return "open";
}

function buildNodes(input: LayoutInput): LaidNode[] {
	const collapsed = input.collapsed ?? new Set<string>();
	const causes = input.causes ?? [];
	const actions = input.actions ?? [];
	const knownCauseIds = new Set(causes.map((c) => c.id));
	const measuresByCause = new Map<string, LayoutAction[]>();
	for (const action of actions) {
		const list = measuresByCause.get(action.causeNodeId) ?? [];
		list.push(action);
		measuresByCause.set(action.causeNodeId, list);
	}

	const nodes: LaidNode[] = [
		{
			id: EVENT_NODE_ID,
			kind: "event",
			label: input.eventTitle,
			parentId: null,
			status: "event",
			stopClass: null,
			meta: null,
			depth: 0,
			x: 0,
			y: 0,
		},
	];

	for (const cause of causes) {
		const parentId =
			cause.parentId && knownCauseIds.has(cause.parentId)
				? cause.parentId
				: EVENT_NODE_ID;
		const measures = measuresByCause.get(cause.id) ?? [];
		nodes.push({
			id: cause.id,
			kind: "cause",
			label: cause.statement,
			parentId,
			status: causeStatus(cause, measures.length),
			stopClass: null,
			meta: null,
			depth: 0,
			x: 0,
			y: 0,
		});
		for (const measure of measures) {
			const owner = measure.ownerRole ? measure.ownerRole : null;
			const due = formatLayoutDueDate(measure.dueDate);
			const meta = [owner, due].filter(Boolean).join(" · ") || null;
			nodes.push({
				id: `m-${measure.id}`,
				kind: "measure",
				label: measure.description,
				parentId: cause.id,
				status: "treated",
				stopClass: actionTypeToLetter(measure.actionType),
				meta,
				depth: 0,
				x: 0,
				y: 0,
			});
		}
	}

	const byId = new Map(nodes.map((n) => [n.id, n]));
	const isHidden = (n: LaidNode): boolean => {
		let p = n.parentId;
		const seen = new Set<string>();
		while (p && !seen.has(p)) {
			seen.add(p);
			if (collapsed.has(p)) {
				return true;
			}
			p = byId.get(p)?.parentId ?? null;
		}
		return false;
	};
	return nodes.filter((n) => !isHidden(n));
}

function formatLayoutDueDate(value: LayoutAction["dueDate"]): string | null {
	const raw = value as unknown;
	if (typeof raw === "string") {
		return raw.slice(0, 10);
	}
	if (raw instanceof Date) {
		return raw.toISOString().slice(0, 10);
	}
	return null;
}

/** Tidy left-to-right layout: x by depth, y by leaf-row, parents centred. */
export function layoutCauseTree(input: LayoutInput): CauseTreeLayout {
	const nodes = buildNodes(input);
	const byId = new Map(nodes.map((n) => [n.id, n]));
	const children = new Map<string, LaidNode[]>();
	const childCount = new Map<string, number>();
	for (const n of nodes) {
		if (n.parentId && byId.has(n.parentId)) {
			const list = children.get(n.parentId) ?? [];
			list.push(n);
			children.set(n.parentId, list);
			childCount.set(n.parentId, (childCount.get(n.parentId) ?? 0) + 1);
		}
	}
	const roots = nodes.filter((n) => !n.parentId || !byId.has(n.parentId));

	let nextRow = 0;
	let maxDepth = 0;
	const visited = new Set<string>();
	const place = (node: LaidNode, depth: number): number => {
		if (visited.has(node.id)) {
			return node.y;
		}
		visited.add(node.id);
		node.depth = depth;
		maxDepth = Math.max(maxDepth, depth);
		const kids = children.get(node.id) ?? [];
		if (kids.length === 0) {
			node.y = PAD + nextRow * ROW_H;
			nextRow += 1;
		} else {
			const ys = kids.map((k) => place(k, depth + 1));
			node.y = (Math.min(...ys) + Math.max(...ys)) / 2;
		}
		node.x = PAD + depth * COL_W;
		return node.y;
	};
	for (const r of roots) {
		place(r, 0);
	}
	for (const n of nodes) {
		if (!visited.has(n.id)) {
			place(n, 0);
		}
	}
	const width = PAD * 2 + (maxDepth + 1) * COL_W;
	const height = PAD * 2 + Math.max(1, nextRow) * ROW_H;
	return { nodes, width, height, childCount };
}
