import {
	CONTROL_HIERARCHY_LETTERS,
	type ControlHierarchyCode,
} from "../taxonomy/schema";
import {
	EVENT_NODE_ID,
	type LaidNodeStatus,
	type LayoutAction,
	type LayoutCause,
	type LayoutInput,
} from "./cause-tree-layout";

// Pure (no React, no DOM) Ishikawa / fishbone geometry for the on-screen graph.
// Takes the SAME LayoutInput shape as cause-tree-layout.ts and returns positioned
// primitives: a horizontal central spine ending at the EVENT/effect head on the
// RIGHT, one diagonal bone per first-level cause (alternating above/below the
// spine), twigs for sub-causes along each bone, and small measure leaves on the
// cause they treat. Status semantics (root/parked/open/treated) are reused from
// the tree layout so both views agree. The FishboneGraph renderer owns the
// dark-theme palette; this module owns only the math.

export const FB_HEAD_W = 220;
export const FB_HEAD_H = 96;
// Vertical half-height of the diagram band on either side of the spine.
const FB_BAND_H = 200;
// Horizontal gap before the first bone and after the last bone meets the head.
// Generous on the left so leftward twigs + their labels stay on-canvas.
const FB_LEFT_PAD = 150;
const FB_RIGHT_PAD = 32;
// Horizontal slot consumed by one bone along the spine.
const FB_BONE_SLOT = 200;
// How far a bone's tip rises/falls from the spine.
const FB_BONE_RISE = FB_BAND_H - 24;
// Vertical spacing between successive twigs measured along the bone.
const FB_TWIG_GAP = 34;
// First twig offset from the spine end of the bone (leave room near the spine).
const FB_TWIG_START = 46;
export const FB_PAD = 24;

export type FishboneStatus = LaidNodeStatus;

/** A measure leaf hanging off a cause (category or sub-cause). */
export type FishboneMeasure = {
	readonly id: string;
	readonly label: string;
	readonly stopClass: string | null;
	readonly meta: string | null;
	readonly x: number;
	readonly y: number;
};

/** A sub-cause twig branching off a category bone. */
export type FishboneTwig = {
	readonly id: string;
	readonly label: string;
	readonly status: FishboneStatus;
	// Point on the bone where the twig attaches.
	readonly x1: number;
	readonly y1: number;
	// Outer end of the twig (where the label sits).
	readonly x2: number;
	readonly y2: number;
	readonly labelX: number;
	readonly labelY: number;
	// Text anchor for the label so it never overlaps the bone.
	readonly anchor: "start" | "end";
	readonly measures: readonly FishboneMeasure[];
};

/** A first-level cause rendered as a diagonal bone off the spine. */
export type FishboneBone = {
	readonly id: string;
	readonly label: string;
	readonly status: FishboneStatus;
	readonly above: boolean;
	// Spine attachment point (start of the bone).
	readonly x1: number;
	readonly y1: number;
	// Tip of the bone (label box anchor).
	readonly x2: number;
	readonly y2: number;
	readonly twigs: readonly FishboneTwig[];
	// Measures attached directly to the category cause itself.
	readonly measures: readonly FishboneMeasure[];
};

export type FishboneSpine = {
	readonly x1: number;
	readonly y1: number;
	readonly x2: number;
	readonly y2: number;
};

export type FishboneHead = {
	readonly label: string;
	readonly x: number;
	readonly y: number;
	readonly w: number;
	readonly h: number;
};

export type FishboneLayout = {
	readonly spine: FishboneSpine;
	readonly head: FishboneHead;
	readonly bones: readonly FishboneBone[];
	readonly width: number;
	readonly height: number;
	// True when there are no first-level causes to draw bones for.
	readonly empty: boolean;
};

function actionTypeToLetter(
	actionType: string | null | undefined,
): string | null {
	if (!actionType) {
		return null;
	}
	const code = actionType as ControlHierarchyCode;
	return CONTROL_HIERARCHY_LETTERS[code] ?? null;
}

function causeStatus(cause: LayoutCause, measureCount: number): FishboneStatus {
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

function measureMeta(action: LayoutAction): string | null {
	const owner = action.ownerRole ? action.ownerRole : null;
	// dueDate may arrive as a full ISO timestamp; show the date only.
	const due = action.dueDate ? action.dueDate.slice(0, 10) : null;
	return [owner, due].filter(Boolean).join(" · ") || null;
}

export function layoutFishbone(input: LayoutInput): FishboneLayout {
	const causes = input.causes ?? [];
	const actions = input.actions ?? [];
	const knownCauseIds = new Set(causes.map((c) => c.id));

	const measuresByCause = new Map<string, LayoutAction[]>();
	for (const action of actions) {
		const list = measuresByCause.get(action.causeNodeId) ?? [];
		list.push(action);
		measuresByCause.set(action.causeNodeId, list);
	}

	// Resolve each cause's effective parent the same way the tree does: an
	// unknown/missing parent re-roots the cause onto the event.
	const effectiveParent = (cause: LayoutCause): string =>
		cause.parentId && knownCauseIds.has(cause.parentId)
			? cause.parentId
			: EVENT_NODE_ID;

	// First-level causes (children of the event) become the category bones.
	const categories = causes.filter((c) => effectiveParent(c) === EVENT_NODE_ID);

	const childrenOf = new Map<string, LayoutCause[]>();
	for (const cause of causes) {
		const parent = effectiveParent(cause);
		if (parent === EVENT_NODE_ID) {
			continue;
		}
		const list = childrenOf.get(parent) ?? [];
		list.push(cause);
		childrenOf.set(parent, list);
	}

	const buildMeasures = (
		causeId: string,
		baseX: number,
		baseY: number,
		above: boolean,
	): FishboneMeasure[] => {
		const list = measuresByCause.get(causeId) ?? [];
		return list.map((action, i) => ({
			id: `m-${action.id}`,
			label: action.description,
			stopClass: actionTypeToLetter(action.actionType),
			meta: measureMeta(action),
			x: baseX,
			y: baseY + (above ? -1 : 1) * (16 + i * 16),
		}));
	};

	const bones: FishboneBone[] = [];

	// Spine y is the vertical centre of the band.
	const spineY = FB_PAD + FB_BAND_H;

	// Spine length grows with the number of categories; split them as evenly as
	// possible above and below so the spine width is driven by the busier side.
	const aboveCount = Math.ceil(categories.length / 2);
	const belowCount = Math.floor(categories.length / 2);
	const sideMax = Math.max(aboveCount, belowCount, 1);
	const spineSpan = sideMax * FB_BONE_SLOT;
	const spineStartX = FB_PAD + FB_LEFT_PAD;
	const spineEndX = spineStartX + spineSpan;

	let aboveIdx = 0;
	let belowIdx = 0;
	for (const category of categories) {
		const measures = measuresByCause.get(category.id) ?? [];
		const above = bones.length % 2 === 0;
		const slot = above ? aboveIdx++ : belowIdx++;
		// Bones attach left-to-right; the rightmost bone sits nearest the head.
		// We anchor each bone on the spine and slope its tip away toward the left
		// so the classic fishbone "ribs feeding into the head" shape emerges.
		const boneX1 = spineStartX + (slot + 1) * FB_BONE_SLOT;
		const boneY1 = spineY;
		const boneX2 = boneX1 - FB_BONE_SLOT * 0.7;
		const boneY2 = above ? spineY - FB_BONE_RISE : spineY + FB_BONE_RISE;

		const dx = boneX2 - boneX1;
		const dy = boneY2 - boneY1;
		const boneLen = Math.hypot(dx, dy) || 1;

		// Twigs run as short HORIZONTAL segments off the bone toward the tail
		// (left), so sub-cause text stays horizontal and readable regardless of
		// whether the bone is above or below the spine. Each twig attaches at an
		// evenly spaced point measured along the bone from its spine end.
		const subs = childrenOf.get(category.id) ?? [];
		const twigLen = 60;
		const twigs: FishboneTwig[] = subs.map((sub, i) => {
			const along = FB_TWIG_START + i * FB_TWIG_GAP;
			const t = Math.min(along, boneLen - 8) / boneLen;
			const ax = boneX1 + dx * t;
			const ay = boneY1 + dy * t;
			const ex = ax - twigLen;
			const ey = ay;
			const subMeasures = measuresByCause.get(sub.id) ?? [];
			return {
				id: sub.id,
				label: sub.statement,
				status: causeStatus(sub, subMeasures.length),
				x1: ax,
				y1: ay,
				x2: ex,
				y2: ey,
				labelX: ex - 6,
				labelY: ey,
				anchor: "end",
				measures: buildMeasures(sub.id, ex - 6, ey, above),
			};
		});

		bones.push({
			id: category.id,
			label: category.statement,
			status: causeStatus(category, measures.length),
			above,
			x1: boneX1,
			y1: boneY1,
			x2: boneX2,
			y2: boneY2,
			twigs,
			measures: buildMeasures(
				category.id,
				boneX2,
				boneY2 + (above ? -14 : 14),
				above,
			),
		});
	}

	const headLeft = spineEndX;
	const head: FishboneHead = {
		label: input.eventTitle,
		x: headLeft,
		y: spineY - FB_HEAD_H / 2,
		w: FB_HEAD_W,
		h: FB_HEAD_H,
	};

	const spine: FishboneSpine = {
		x1: spineStartX,
		y1: spineY,
		x2: spineEndX,
		y2: spineY,
	};

	const width = headLeft + FB_HEAD_W + FB_RIGHT_PAD;
	const height = FB_PAD * 2 + FB_BAND_H * 2;

	return {
		spine,
		head,
		bones,
		width,
		height,
		empty: categories.length === 0,
	};
}
