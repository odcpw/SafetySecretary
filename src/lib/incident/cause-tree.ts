/**
 * Deterministic digest of the incident cause tree for the coach prompt.
 * No LLM involved: it renders the parent/child structure, branch numbers,
 * full UUIDs (the model needs them for parentId/causeId), and per-branch
 * status so the coach can chain deeper whys instead of piling flat causes,
 * and stop digging branches that are parked or already at a root.
 */

export type CauseTreeDigestCause = {
	readonly id: string;
	readonly parentId?: string | null;
	readonly statement: string;
	readonly isRootCause?: boolean;
	readonly branchStatus?: string | null;
};

export type CauseTreeDigestAction = {
	readonly causeNodeId: string;
};

export type CauseTreeDigestInput = {
	readonly causes: readonly CauseTreeDigestCause[];
	readonly actions: readonly CauseTreeDigestAction[];
};

const statementMaxLength = 80;

export function buildCauseTreeDigest(input: CauseTreeDigestInput): string {
	const causes = input.causes ?? [];

	if (causes.length === 0) {
		return "No causes yet.";
	}

	const measureCounts = new Map<string, number>();

	for (const action of input.actions ?? []) {
		measureCounts.set(
			action.causeNodeId,
			(measureCounts.get(action.causeNodeId) ?? 0) + 1,
		);
	}

	const knownIds = new Set(causes.map((cause) => cause.id));
	const childrenByParent = new Map<string, CauseTreeDigestCause[]>();
	const roots: CauseTreeDigestCause[] = [];

	for (const cause of causes) {
		const parentId = cause.parentId ?? null;

		if (parentId && knownIds.has(parentId) && parentId !== cause.id) {
			const siblings = childrenByParent.get(parentId) ?? [];
			siblings.push(cause);
			childrenByParent.set(parentId, siblings);
		} else {
			roots.push(cause);
		}
	}

	const lines: string[] = [];
	const warnings: string[] = [];
	const visited = new Set<string>();
	let openCount = 0;
	let parkedCount = 0;
	let treatedCount = 0;
	let maxDepth = 0;

	const renderNode = (
		cause: CauseTreeDigestCause,
		branchNumber: string,
		depth: number,
	): void => {
		if (visited.has(cause.id)) {
			return;
		}

		visited.add(cause.id);
		maxDepth = Math.max(maxDepth, depth);

		const children = childrenByParent.get(cause.id) ?? [];
		const measures = measureCounts.get(cause.id) ?? 0;
		const markers: string[] = [];

		if (cause.branchStatus === "PARKED") {
			markers.push("[PARKED]");
			parkedCount += 1;
		}

		if (cause.isRootCause || cause.branchStatus === "ROOT_REACHED") {
			markers.push("[ROOT]");

			if (children.length > 0) {
				warnings.push(
					`Cause ${branchNumber} is marked root but has deeper whys below it — the root mark belongs on the deepest actionable cause (fix with cause_update).`,
				);
			}
		}

		if (measures > 0) {
			markers.push(
				`[TREATED: ${measures} measure${measures === 1 ? "" : "s"}]`,
			);
			treatedCount += 1;
		}

		if (markers.length === 0 && children.length === 0) {
			markers.push("[OPEN]");
			openCount += 1;
		}

		const indent = "  ".repeat(depth - 1);
		const suffix = markers.length > 0 ? ` ${markers.join(" ")}` : "";
		lines.push(
			`${indent}${branchNumber} ${truncateStatement(cause.statement)} [${cause.id}]${suffix}`,
		);

		for (const [index, child] of children.entries()) {
			renderNode(child, `${branchNumber}.${index + 1}`, depth + 1);
		}
	};

	for (const [index, root] of roots.entries()) {
		renderNode(root, `${index + 1}`, 1);
	}

	// Sweep nodes unreachable through the parent walk (cyclic legacy data) so
	// they still appear instead of silently vanishing from the digest.
	let strayNumber = roots.length;
	for (const cause of causes) {
		if (!visited.has(cause.id)) {
			strayNumber += 1;
			renderNode(cause, `${strayNumber}`, 1);
		}
	}

	const unchainedCount = roots.filter(
		(root) => (childrenByParent.get(root.id) ?? []).length === 0,
	).length;

	lines.push(
		`Summary: ${openCount} open branch(es), ${parkedCount} parked, ${treatedCount} treated, max depth ${maxDepth}.`,
	);

	if (unchainedCount > 2) {
		lines.push(
			`${unchainedCount} top-level causes have no deeper why yet. If some of them explain each other, propose a restructure (cause_update with parentId); for the rest, ask why and add the answers as child causes.`,
		);
	}

	lines.push(...warnings);

	return lines.join("\n");
}

function truncateStatement(statement: string): string {
	const text = statement.replace(/\s+/g, " ").trim();

	if (text.length <= statementMaxLength) {
		return text;
	}

	return `${text.slice(0, statementMaxLength - 1).trimEnd()}…`;
}

export type PhaseSignalInput = {
	readonly factCount: number;
	readonly timelineCount: number;
	readonly causes: readonly CauseTreeDigestCause[];
	readonly actions: readonly CauseTreeDigestAction[];
	/** A–E worst-credible code; gates close-eligibility for serious (A/B) cases. */
	readonly potentialSeverity?: string | null;
};

type CauseTreeShape = {
	readonly causeCount: number;
	readonly openBranchCount: number;
	readonly rootReachedCount: number;
	readonly maxDepth: number;
};

/**
 * Derive the cause-tree shape (open leaves, reached roots, depth) without
 * touching buildCauseTreeDigest's rendered output, which a contract test pins
 * line-for-line. Shares the same parent/child walk so the two stay consistent.
 */
function analyseCauseTree(
	causes: readonly CauseTreeDigestCause[],
	actions: readonly CauseTreeDigestAction[],
): CauseTreeShape {
	if (causes.length === 0) {
		return {
			causeCount: 0,
			openBranchCount: 0,
			rootReachedCount: 0,
			maxDepth: 0,
		};
	}

	const measureCounts = new Map<string, number>();
	for (const action of actions ?? []) {
		measureCounts.set(
			action.causeNodeId,
			(measureCounts.get(action.causeNodeId) ?? 0) + 1,
		);
	}

	const knownIds = new Set(causes.map((cause) => cause.id));
	const childrenByParent = new Map<string, CauseTreeDigestCause[]>();
	const roots: CauseTreeDigestCause[] = [];

	for (const cause of causes) {
		const parentId = cause.parentId ?? null;

		if (parentId && knownIds.has(parentId) && parentId !== cause.id) {
			const siblings = childrenByParent.get(parentId) ?? [];
			siblings.push(cause);
			childrenByParent.set(parentId, siblings);
		} else {
			roots.push(cause);
		}
	}

	const visited = new Set<string>();
	let openBranchCount = 0;
	let rootReachedCount = 0;
	let maxDepth = 0;

	const walk = (cause: CauseTreeDigestCause, depth: number): void => {
		if (visited.has(cause.id)) {
			return;
		}

		visited.add(cause.id);
		maxDepth = Math.max(maxDepth, depth);

		const children = childrenByParent.get(cause.id) ?? [];
		const measures = measureCounts.get(cause.id) ?? 0;
		const isRoot =
			Boolean(cause.isRootCause) || cause.branchStatus === "ROOT_REACHED";
		const isParked = cause.branchStatus === "PARKED";

		if (isRoot) {
			rootReachedCount += 1;
		}

		// An [OPEN] leaf: a childless cause that is neither parked, rooted, nor
		// already treated. Matches the digest's [OPEN] marker rule.
		if (children.length === 0 && !isParked && !isRoot && measures === 0) {
			openBranchCount += 1;
		}

		for (const child of children) {
			walk(child, depth + 1);
		}
	};

	for (const root of roots) {
		walk(root, 1);
	}

	// Cyclic/orphaned legacy nodes the parent walk missed still count as causes.
	for (const cause of causes) {
		if (!visited.has(cause.id)) {
			walk(cause, 1);
		}
	}

	return {
		causeCount: causes.length,
		maxDepth,
		openBranchCount,
		rootReachedCount,
	};
}

/**
 * Emit a single internal PHASE line for the coach turn prompt. This is a
 * derived signal, never stored and never shown in the UI: facts → causes →
 * measures, inferred fresh each turn from the record's counts so the coach
 * knows where it is and what the natural next move is. Keep it to one line.
 */
export function buildPhaseSignal(input: PhaseSignalInput): string {
	const factCount = Math.max(0, input.factCount | 0);
	const timelineCount = Math.max(0, input.timelineCount | 0);
	const shape = analyseCauseTree(input.causes ?? [], input.actions ?? []);
	const measureCount = (input.actions ?? []).length;

	const storyEvents = factCount + timelineCount;
	const factsThin = storyEvents < 2;
	const hasCauses = shape.causeCount > 0;
	const severity = (input.potentialSeverity ?? "").trim().toUpperCase();
	const seriousPotential = severity === "A" || severity === "B";
	const hasRoot = shape.rootReachedCount > 0;
	const allBranchesResolved = hasCauses && shape.openBranchCount === 0;

	// A single action does NOT make a case "measures-ready". The investigation
	// only earns the measures phase once the cause work has actually landed:
	// at least one controllable root reached, or every live branch resolved
	// (rooted / parked / treated). Otherwise an action on a still-shallow branch
	// would flip the whole case to measures and (wrongly) signal "do not
	// re-open facts" while real causes are still open.
	const measuresReady =
		measureCount > 0 && hasCauses && (hasRoot || allBranchesResolved);

	let phase: "facts" | "causes" | "measures";
	if (measuresReady) {
		phase = "measures";
	} else if (hasCauses) {
		phase = "causes";
	} else if (!factsThin) {
		// Facts captured, no causes yet: ready to turn to why.
		phase = "causes";
	} else {
		phase = "facts";
	}

	const factsPart = factsThin
		? `facts/timeline still thin (${storyEvents} event${storyEvents === 1 ? "" : "s"})`
		: `facts captured (${storyEvents} timeline event${storyEvents === 1 ? "" : "s"})`;

	const treePart = !hasCauses
		? "no cause nodes yet"
		: `cause tree has ${shape.openBranchCount} open branch${shape.openBranchCount === 1 ? "" : "es"}, ${
				shape.rootReachedCount > 0
					? `${shape.rootReachedCount} root${shape.rootReachedCount === 1 ? "" : "s"} reached`
					: "no root cause reached yet"
			}`;

	const measuresPart = `${measureCount} measure${measureCount === 1 ? "" : "s"}`;

	let nextHint: string;
	if (phase === "facts") {
		nextHint =
			"build the story (what happened, where, when, who, potential severity) before asking why";
	} else if (phase === "causes") {
		nextHint =
			shape.openBranchCount > 0
				? `dig one level deeper on an open branch (${shape.openBranchCount} still open) — only offer to move to measures once every live branch has reached a controllable root`
				: "offer to move to measures, or dig further if a branch is still shallow";
	} else if (shape.openBranchCount > 0) {
		// Measures phase but branches still open: keep treating/digging, do not close.
		nextHint = `give each rooted cause a measure with an owner and a due date; ${shape.openBranchCount} cause branch${shape.openBranchCount === 1 ? "" : "es"} still open — dig or treat those before closing, do NOT offer to close yet`;
	} else {
		nextHint =
			"make sure each important cause has a measure with an owner and a due date, then offer to close and export — do not re-open facts";
	}

	// Serious potential (A/B) with any open branch: close is off the table until
	// the open branches are resolved, overriding balance-of-satisfaction.
	if (seriousPotential && shape.openBranchCount > 0 && phase !== "facts") {
		nextHint += ` — serious potential (severity ${severity}) with open branches: do NOT offer to close until they are resolved`;
	}

	return `PHASE: ${phase} — ${factsPart}; ${treePart}; ${measuresPart}. Likely next: ${nextHint}.`;
}
