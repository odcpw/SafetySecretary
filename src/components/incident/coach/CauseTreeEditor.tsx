"use client";

import {
	Fragment,
	type PointerEvent as ReactPointerEvent,
	useEffect,
	useRef,
	useState,
} from "react";
import { CSRF_COOKIE_NAME } from "../../../lib/auth/cookies";
import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
import Badge from "../../ui/Badge";
import type { CoachCopy } from "./copy";
import type {
	RecordAction,
	RecordCauseBranchStatus,
	RecordCauseNode,
} from "./types";

type CauseTreeEditorProps = {
	readonly incidentId: string;
	readonly causes: RecordCauseNode[];
	readonly actions: RecordAction[];
	readonly copy: CoachCopy;
	readonly onRecordChange?: () => void;
};

type TreeNode = {
	cause: RecordCauseNode;
	number: string;
	depth: number;
	/** Parent in the rendered tree (null for top-level rows, incl. orphans). */
	parentId: string | null;
	/** The sibling rendered directly after this node, if any. */
	nextSiblingId: string | null;
	children: TreeNode[];
};

type DropIndicator =
	| { kind: "child"; nodeId: string }
	| { kind: "sibling"; nodeId: string; edge: "before" | "after" }
	| { kind: "top" };

type DragSession = {
	pointerId: number;
	nodeId: string;
	startX: number;
	startY: number;
	lastX: number;
	lastY: number;
	/** True once the pointer travelled past the drag threshold. */
	active: boolean;
	/** The dragged node and its descendants — never valid drop targets. */
	blocked: Set<string>;
	/** Row rects cached at drag start; invalidated on scroll and re-render. */
	rects: Map<string, DOMRect> | null;
};

const TOP_LEVEL_DROP = "__top__";
const INDENT_PER_DEPTH = 16;
const DRAG_THRESHOLD_PX = 4;
/** Top/bottom band of a row that means "insert as sibling" instead of "nest". */
const SIBLING_BAND_RATIO = 0.25;

const primaryButton =
	"inline-flex items-center justify-center rounded-md bg-[var(--color-accent)] px-2 py-1 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton =
	"inline-flex items-center justify-center rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-[var(--color-text)] transition hover:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60";
const dangerButton =
	"inline-flex items-center justify-center rounded-md border border-[var(--color-danger)] px-2 py-1 text-xs font-medium text-[var(--color-danger)] transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60";
const textareaClassName =
	"min-h-16 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]";
const selectClassName =
	"rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]";

export default function CauseTreeEditor({
	incidentId,
	causes,
	actions,
	copy,
	onRecordChange,
}: CauseTreeEditorProps) {
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [editing, setEditing] = useState<{
		nodeId: string;
		text: string;
	} | null>(null);
	const [adding, setAdding] = useState<{
		parentId: string | null;
		text: string;
	} | null>(null);
	const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
		null,
	);
	const [markingId, setMarkingId] = useState<string | null>(null);
	const [movingId, setMovingId] = useState<string | null>(null);
	const [dragging, setDragging] = useState<{
		nodeId: string;
		label: string;
	} | null>(null);
	const [dropIndicator, setDropIndicator] = useState<DropIndicator | null>(
		null,
	);

	const rowRefs = useRef(new Map<string, HTMLElement>());
	const topZoneRef = useRef<HTMLDivElement | null>(null);
	const floatingLabelRef = useRef<HTMLDivElement | null>(null);
	const dragSessionRef = useRef<DragSession | null>(null);
	const teardownRef = useRef<(() => void) | null>(null);

	const flat = flattenTree(buildTree(causes));
	const nodeById = new Map(flat.map((node) => [node.cause.id, node]));
	const measureCounts = new Map<string, number>();

	for (const action of actions) {
		measureCounts.set(
			action.causeNodeId,
			(measureCounts.get(action.causeNodeId) ?? 0) + 1,
		);
	}

	// If the component unmounts mid-drag, restore the body cursor and drop
	// the document/window listeners installed by beginDrag.
	useEffect(() => {
		return () => {
			teardownRef.current?.();
			teardownRef.current = null;
		};
	}, []);

	// The top-level drop zone mounts on the render after the drag activates,
	// so cached row rects are re-measured once it is in the document.
	useEffect(() => {
		const session = dragSessionRef.current;

		if (dragging && session) {
			session.rects = null;
		}
	}, [dragging]);

	async function mutate(
		body: Record<string, unknown>,
		method: "POST" | "PATCH",
	): Promise<boolean> {
		setBusy(true);
		setError(null);

		try {
			const response = await fetch(
				`/api/incidents/${encodeURIComponent(incidentId)}/causes`,
				{
					body: JSON.stringify(body),
					credentials: "same-origin",
					headers: {
						accept: "application/json",
						"content-type": "application/json",
						"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
					},
					method,
				},
			);

			if (!response.ok) {
				const payload = (await response.json().catch(() => ({}))) as {
					code?: string;
				};
				throw new Error(payload.code ?? `CAUSE_SAVE_FAILED_${response.status}`);
			}

			onRecordChange?.();
			return true;
		} catch (caught) {
			setError(userSafeError(caught, copy));

			if (
				caught instanceof Error &&
				(caught.message === "CAUSE_NODE_NOT_FOUND" ||
					caught.message === "INVALID_CAUSE_BEFORE")
			) {
				onRecordChange?.();
			}

			return false;
		} finally {
			setBusy(false);
		}
	}

	async function saveStatement(cause: RecordCauseNode, text: string) {
		const statement = text.trim();

		if (!statement) {
			setError(copy.causes.textRequired);
			return;
		}

		if (await mutate(updateBody(cause, { statement }), "PATCH")) {
			setEditing(null);
		}
	}

	async function addCause(parentId: string | null, text: string) {
		const statement = text.trim();

		if (!statement) {
			setError(copy.causes.textRequired);
			return;
		}

		if (await mutate({ parentId, statement }, "POST")) {
			setAdding(null);
		}
	}

	async function removeCause(nodeId: string) {
		if (await mutate({ _action: "delete", nodeId }, "POST")) {
			setConfirmingDeleteId(null);
		}
	}

	async function markCause(
		cause: RecordCauseNode,
		branchStatus: RecordCauseBranchStatus,
	) {
		const marked = await mutate(
			updateBody(cause, {
				branchStatus,
				isRootCause: branchStatus === "ROOT_REACHED",
			}),
			"PATCH",
		);

		if (marked) {
			setMarkingId(null);
		}
	}

	async function moveCause(cause: RecordCauseNode, parentId: string | null) {
		if (
			parentId === cause.id ||
			parentId === cause.parentId ||
			(parentId !== null && descendantIds(causes, cause.id).has(parentId))
		) {
			setMovingId(null);
			return;
		}

		if (await mutate(updateBody(cause, { parentId }), "PATCH")) {
			setMovingId(null);
		}
	}

	function handleGripPointerDown(
		event: ReactPointerEvent<HTMLSpanElement>,
		node: TreeNode,
	) {
		if (busy || dragSessionRef.current) {
			return;
		}

		if (event.pointerType === "mouse" && event.button !== 0) {
			return;
		}

		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		dragSessionRef.current = {
			active: false,
			blocked: new Set([
				node.cause.id,
				...descendantIds(causes, node.cause.id),
			]),
			lastX: event.clientX,
			lastY: event.clientY,
			nodeId: node.cause.id,
			pointerId: event.pointerId,
			rects: null,
			startX: event.clientX,
			startY: event.clientY,
		};
	}

	function handleGripPointerMove(
		event: ReactPointerEvent<HTMLSpanElement>,
		node: TreeNode,
	) {
		const session = dragSessionRef.current;

		if (
			!session ||
			session.pointerId !== event.pointerId ||
			session.nodeId !== node.cause.id
		) {
			return;
		}

		session.lastX = event.clientX;
		session.lastY = event.clientY;

		if (!session.active) {
			const travelled = Math.hypot(
				event.clientX - session.startX,
				event.clientY - session.startY,
			);

			if (travelled < DRAG_THRESHOLD_PX) {
				return;
			}

			beginDrag(session, node);
		}

		positionFloatingLabel(event.clientX, event.clientY);
		const next = resolveDropIndicator(session, event.clientY);
		setDropIndicator((current) =>
			sameIndicator(current, next) ? current : next,
		);
	}

	function handleGripPointerUp(
		event: ReactPointerEvent<HTMLSpanElement>,
		node: TreeNode,
	) {
		const session = dragSessionRef.current;

		if (!session || session.pointerId !== event.pointerId) {
			return;
		}

		const indicator = session.active
			? resolveDropIndicator(session, event.clientY)
			: null;
		endDrag();

		if (indicator) {
			commitDrop(node, indicator);
		}
	}

	function handleGripPointerCancel(event: ReactPointerEvent<HTMLSpanElement>) {
		const session = dragSessionRef.current;

		if (session && session.pointerId === event.pointerId) {
			endDrag();
		}
	}

	function beginDrag(session: DragSession, node: TreeNode) {
		session.active = true;
		setDragging({
			label: `${node.number} · ${truncate(node.cause.statement, 48)}`,
			nodeId: node.cause.id,
		});

		const onKeyDown = (keyEvent: KeyboardEvent) => {
			if (keyEvent.key === "Escape") {
				keyEvent.preventDefault();
				endDrag();
			}
		};
		const onScroll = () => {
			const current = dragSessionRef.current;

			if (current) {
				current.rects = null;
			}
		};

		document.addEventListener("keydown", onKeyDown, true);
		window.addEventListener("scroll", onScroll, true);
		document.body.style.cursor = "grabbing";
		teardownRef.current = () => {
			document.removeEventListener("keydown", onKeyDown, true);
			window.removeEventListener("scroll", onScroll, true);
			document.body.style.cursor = "";
		};
	}

	function endDrag() {
		teardownRef.current?.();
		teardownRef.current = null;
		dragSessionRef.current = null;
		setDragging(null);
		setDropIndicator(null);
	}

	function positionFloatingLabel(x: number, y: number) {
		const label = floatingLabelRef.current;

		if (label) {
			label.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
		}
	}

	function measureDropRects(): Map<string, DOMRect> {
		const rects = new Map<string, DOMRect>();

		for (const [nodeId, element] of rowRefs.current) {
			rects.set(nodeId, element.getBoundingClientRect());
		}

		if (topZoneRef.current) {
			rects.set(TOP_LEVEL_DROP, topZoneRef.current.getBoundingClientRect());
		}

		return rects;
	}

	function resolveDropIndicator(
		session: DragSession,
		y: number,
	): DropIndicator | null {
		if (!session.rects) {
			session.rects = measureDropRects();
		}

		const topRect = session.rects.get(TOP_LEVEL_DROP);

		if (topRect && y >= topRect.top && y <= topRect.bottom) {
			return { kind: "top" };
		}

		for (const node of flat) {
			if (session.blocked.has(node.cause.id)) {
				continue;
			}

			const rect = session.rects.get(node.cause.id);

			if (!rect || y < rect.top || y > rect.bottom) {
				continue;
			}

			const band = (y - rect.top) / Math.max(rect.height, 1);

			if (band < SIBLING_BAND_RATIO) {
				return { edge: "before", kind: "sibling", nodeId: node.cause.id };
			}

			if (band > 1 - SIBLING_BAND_RATIO) {
				return { edge: "after", kind: "sibling", nodeId: node.cause.id };
			}

			return { kind: "child", nodeId: node.cause.id };
		}

		return null;
	}

	function commitDrop(dragged: TreeNode, indicator: DropIndicator) {
		if (indicator.kind === "top") {
			void moveCause(dragged.cause, null);
			return;
		}

		if (indicator.kind === "child") {
			void moveCause(dragged.cause, indicator.nodeId);
			return;
		}

		const target = nodeById.get(indicator.nodeId);

		if (!target) {
			return;
		}

		const parentId = target.parentId;
		const beforeId =
			indicator.edge === "before" ? target.cause.id : target.nextSiblingId;
		const unchanged =
			parentId === dragged.parentId &&
			(beforeId === dragged.cause.id || beforeId === dragged.nextSiblingId);

		if (unchanged) {
			return;
		}

		void mutate(updateBody(dragged.cause, { beforeId, parentId }), "PATCH");
	}

	function renderAddForm(parentId: string | null, depth: number) {
		if (adding?.parentId !== parentId) {
			return null;
		}

		return (
			<div
				className="grid gap-2 rounded-md border border-dashed border-[var(--color-border)] px-3 py-2"
				style={{ marginLeft: depth * INDENT_PER_DEPTH }}
			>
				<textarea
					className={textareaClassName}
					onChange={(event) => {
						const text = event.currentTarget.value;
						setAdding((current) => (current ? { ...current, text } : current));
					}}
					placeholder={
						parentId
							? copy.causes.whyPlaceholderChild
							: copy.causes.whyPlaceholderRoot
					}
					rows={2}
					value={adding.text}
				/>
				<div className="flex gap-2">
					<button
						className={primaryButton}
						disabled={busy || !adding.text.trim()}
						onClick={() => void addCause(parentId, adding.text)}
						type="button"
					>
						{copy.causes.add}
					</button>
					<button
						className={secondaryButton}
						disabled={busy}
						onClick={() => setAdding(null)}
						type="button"
					>
						{copy.causes.cancel}
					</button>
				</div>
			</div>
		);
	}

	function renderMoveControls(node: TreeNode) {
		const blocked = new Set([
			node.cause.id,
			...descendantIds(causes, node.cause.id),
		]);
		const targets = flat.filter(
			(candidate) =>
				!blocked.has(candidate.cause.id) &&
				candidate.cause.id !== node.cause.parentId,
		);

		return (
			<>
				<label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
					{copy.causes.moveUnder}
					<select
						className={selectClassName}
						defaultValue=""
						disabled={busy}
						onChange={(event) => {
							const value = event.currentTarget.value;

							if (value === TOP_LEVEL_DROP) {
								void moveCause(node.cause, null);
							} else if (value) {
								void moveCause(node.cause, value);
							}
						}}
					>
						<option disabled value="">
							{copy.causes.chooseNewParent}
						</option>
						{node.cause.parentId ? (
							<option value={TOP_LEVEL_DROP}>{copy.causes.topLevel}</option>
						) : null}
						{targets.map((target) => (
							<option key={target.cause.id} value={target.cause.id}>
								{target.number} · {truncate(target.cause.statement, 60)}
							</option>
						))}
					</select>
				</label>
				<button
					className={secondaryButton}
					disabled={busy}
					onClick={() => setMovingId(null)}
					type="button"
				>
					{copy.causes.cancel}
				</button>
			</>
		);
	}

	function renderNodeActions(node: TreeNode) {
		if (confirmingDeleteId === node.cause.id) {
			return (
				<>
					<span className="text-xs text-[var(--color-muted)]">
						{copy.causes.deletePrompt}
					</span>
					<button
						className={dangerButton}
						disabled={busy}
						onClick={() => void removeCause(node.cause.id)}
						type="button"
					>
						{copy.causes.delete}
					</button>
					<button
						className={secondaryButton}
						disabled={busy}
						onClick={() => setConfirmingDeleteId(null)}
						type="button"
					>
						{copy.causes.cancel}
					</button>
				</>
			);
		}

		if (markingId === node.cause.id) {
			const isParked = node.cause.branchStatus === "PARKED";
			const isOpen = !isParked && !isRootMarked(node.cause);

			return (
				<>
					{isRootMarked(node.cause) ? null : (
						<button
							className={secondaryButton}
							disabled={busy}
							onClick={() => void markCause(node.cause, "ROOT_REACHED")}
							type="button"
						>
							{copy.causes.rootReached}
						</button>
					)}
					{isParked ? null : (
						<button
							className={secondaryButton}
							disabled={busy}
							onClick={() => void markCause(node.cause, "PARKED")}
							type="button"
						>
							{copy.causes.park}
						</button>
					)}
					{isOpen ? null : (
						<button
							className={secondaryButton}
							disabled={busy}
							onClick={() => void markCause(node.cause, "OPEN")}
							type="button"
						>
							{copy.causes.reopen}
						</button>
					)}
					<button
						className={secondaryButton}
						disabled={busy}
						onClick={() => setMarkingId(null)}
						type="button"
					>
						{copy.causes.cancel}
					</button>
				</>
			);
		}

		if (movingId === node.cause.id) {
			return renderMoveControls(node);
		}

		return (
			<>
				<button
					className={secondaryButton}
					disabled={busy}
					onClick={() =>
						setEditing({ nodeId: node.cause.id, text: node.cause.statement })
					}
					type="button"
				>
					{copy.causes.edit}
				</button>
				<button
					className={secondaryButton}
					disabled={busy}
					onClick={() => setAdding({ parentId: node.cause.id, text: "" })}
					type="button"
				>
					{copy.causes.addWhy}
				</button>
				<button
					className={secondaryButton}
					disabled={busy}
					onClick={() => setMovingId(node.cause.id)}
					type="button"
				>
					{copy.causes.moveUnder}…
				</button>
				<button
					className={secondaryButton}
					disabled={busy}
					onClick={() => setMarkingId(node.cause.id)}
					type="button"
				>
					{copy.causes.mark}
				</button>
				<button
					className={secondaryButton}
					disabled={busy}
					onClick={() => setConfirmingDeleteId(node.cause.id)}
					type="button"
				>
					{copy.causes.delete}
				</button>
			</>
		);
	}

	function renderNode(node: TreeNode) {
		const measureCount = measureCounts.get(node.cause.id) ?? 0;
		const isEditing = editing?.nodeId === node.cause.id;
		const isDragged = dragging?.nodeId === node.cause.id;
		const isChildTarget =
			dropIndicator?.kind === "child" && dropIndicator.nodeId === node.cause.id;
		const siblingEdge =
			dropIndicator?.kind === "sibling" &&
			dropIndicator.nodeId === node.cause.id
				? dropIndicator.edge
				: null;

		return (
			<div
				className={`relative grid gap-1 rounded-md border bg-[var(--color-surface-elev)] px-3 py-2 ${
					isChildTarget
						? "border-[var(--color-accent)] ring-2 ring-[var(--color-accent)]"
						: "border-[var(--color-border)]"
				} ${isDragged ? "opacity-50" : ""}`}
				ref={(element) => {
					if (element) {
						rowRefs.current.set(node.cause.id, element);
					} else {
						rowRefs.current.delete(node.cause.id);
					}
				}}
				style={{ marginLeft: node.depth * INDENT_PER_DEPTH }}
			>
				{siblingEdge ? (
					<span
						aria-hidden="true"
						className={`pointer-events-none absolute inset-x-0 h-0.5 rounded-full bg-[var(--color-accent)] ${
							siblingEdge === "before" ? "top-[-5px]" : "bottom-[-5px]"
						}`}
					/>
				) : null}
				<div className="flex flex-wrap items-center gap-2">
					{/* Pointer-drag moves have a keyboard fallback via the "Move under…" select. */}
					<span
						aria-hidden="true"
						className="cursor-grab touch-none select-none text-xs leading-none tracking-tighter text-[var(--color-muted)]"
						onPointerCancel={handleGripPointerCancel}
						onPointerDown={(event) => handleGripPointerDown(event, node)}
						onPointerMove={(event) => handleGripPointerMove(event, node)}
						onPointerUp={(event) => handleGripPointerUp(event, node)}
						title={copy.causes.gripTitle}
					>
						⋮⋮
					</span>
					<span className="text-xs font-medium text-[var(--color-muted)]">
						{node.number}
					</span>
					{isRootMarked(node.cause) ? (
						<Badge variant="info">{copy.causes.rootCauseBadge}</Badge>
					) : null}
					{node.cause.branchStatus === "PARKED" ? (
						<Badge variant="warning">{copy.causes.parkedBadge}</Badge>
					) : null}
					{measureCount > 0 ? (
						<Badge variant="neutral">
							{measureCount}{" "}
							{measureCount === 1
								? copy.causes.measureBadgeOne
								: copy.causes.measureBadgeMany}
						</Badge>
					) : null}
				</div>
				{isEditing && editing ? (
					<div className="grid gap-2">
						<textarea
							className={textareaClassName}
							onChange={(event) => {
								const text = event.currentTarget.value;
								setEditing((current) =>
									current ? { ...current, text } : current,
								);
							}}
							rows={3}
							value={editing.text}
						/>
						<div className="flex gap-2">
							<button
								className={primaryButton}
								disabled={busy || !editing.text.trim()}
								onClick={() => void saveStatement(node.cause, editing.text)}
								type="button"
							>
								{copy.causes.save}
							</button>
							<button
								className={secondaryButton}
								disabled={busy}
								onClick={() => setEditing(null)}
								type="button"
							>
								{copy.causes.cancel}
							</button>
						</div>
					</div>
				) : (
					<button
						className="m-0 cursor-text border-0 bg-transparent p-0 text-left text-sm leading-6 text-[var(--color-text)]"
						onClick={() =>
							setEditing({ nodeId: node.cause.id, text: node.cause.statement })
						}
						title={copy.causes.editTitle}
						type="button"
					>
						{node.cause.statement}
					</button>
				)}
				{node.cause.question ? (
					<p className="m-0 text-xs text-[var(--color-muted)]">
						{node.cause.question}
					</p>
				) : null}
				{isEditing ? null : (
					<div className="flex flex-wrap items-center gap-2">
						{renderNodeActions(node)}
					</div>
				)}
			</div>
		);
	}

	return (
		<div className="grid gap-3">
			{error ? (
				<p className="m-0 rounded-md border border-[var(--color-danger)] px-3 py-2 text-sm text-[var(--color-danger)]">
					{error}
				</p>
			) : null}
			{flat.length === 0 ? (
				<p className="m-0 rounded-md border border-dashed border-[var(--color-border)] px-3 py-4 text-sm text-[var(--color-muted)]">
					{copy.causes.empty}
				</p>
			) : (
				<>
					<div className="grid gap-2">
						{flat.map((node) => (
							<Fragment key={node.cause.id}>
								{renderNode(node)}
								{renderAddForm(node.cause.id, node.depth + 1)}
							</Fragment>
						))}
					</div>
					{dragging ? (
						<div
							className={`rounded-md border border-dashed px-3 py-2 text-xs ${
								dropIndicator?.kind === "top"
									? "border-[var(--color-accent)] text-[var(--color-accent)]"
									: "border-[var(--color-border)] text-[var(--color-muted)]"
							}`}
							ref={topZoneRef}
						>
							{copy.causes.topDropZone}
						</div>
					) : null}
					<p className="m-0 text-xs text-[var(--color-muted)]">
						{copy.causes.dragHint}
					</p>
				</>
			)}
			{adding?.parentId === null ? (
				renderAddForm(null, 0)
			) : (
				<button
					className={`${secondaryButton} justify-self-start`}
					disabled={busy}
					onClick={() => setAdding({ parentId: null, text: "" })}
					type="button"
				>
					{copy.causes.addCause}
				</button>
			)}
			{dragging ? (
				<div
					aria-hidden="true"
					className="pointer-events-none fixed left-0 top-0 z-50 max-w-64 truncate rounded-md border border-[var(--color-accent)] bg-[var(--color-surface-elev)] px-2 py-1 text-xs text-[var(--color-text)] shadow-lg"
					ref={floatingLabelRef}
					style={{
						transform: `translate(${(dragSessionRef.current?.lastX ?? 0) + 14}px, ${(dragSessionRef.current?.lastY ?? 0) + 14}px)`,
					}}
				>
					{dragging.label}
				</div>
			) : null}
		</div>
	);
}

function updateBody(
	cause: RecordCauseNode,
	changes: Record<string, unknown>,
): Record<string, unknown> {
	return {
		isRootCause: cause.isRootCause,
		nodeId: cause.id,
		question: cause.question,
		statement: cause.statement,
		...changes,
	};
}

function isRootMarked(cause: RecordCauseNode): boolean {
	return cause.isRootCause || cause.branchStatus === "ROOT_REACHED";
}

function sameIndicator(
	a: DropIndicator | null,
	b: DropIndicator | null,
): boolean {
	if (!a || !b) {
		return a === b;
	}

	if (a.kind === "top") {
		return b.kind === "top";
	}

	if (a.kind === "child") {
		return b.kind === "child" && a.nodeId === b.nodeId;
	}

	return b.kind === "sibling" && a.nodeId === b.nodeId && a.edge === b.edge;
}

function buildTree(causes: readonly RecordCauseNode[]): TreeNode[] {
	const knownIds = new Set(causes.map((cause) => cause.id));
	const byParent = new Map<string | null, RecordCauseNode[]>();

	for (const cause of causes) {
		const parentKey =
			cause.parentId && knownIds.has(cause.parentId) ? cause.parentId : null;
		const siblings = byParent.get(parentKey) ?? [];
		siblings.push(cause);
		byParent.set(parentKey, siblings);
	}

	function branch(
		cause: RecordCauseNode,
		number: string,
		depth: number,
		parentId: string | null,
		nextSiblingId: string | null,
	): TreeNode {
		const childCauses = byParent.get(cause.id) ?? [];
		const children = childCauses.map((child, index) =>
			branch(
				child,
				`${number}.${index + 1}`,
				depth + 1,
				cause.id,
				childCauses[index + 1]?.id ?? null,
			),
		);

		return { cause, children, depth, nextSiblingId, number, parentId };
	}

	const roots = byParent.get(null) ?? [];

	return roots.map((cause, index) =>
		branch(cause, String(index + 1), 0, null, roots[index + 1]?.id ?? null),
	);
}

function flattenTree(nodes: readonly TreeNode[]): TreeNode[] {
	return nodes.flatMap((node) => [node, ...flattenTree(node.children)]);
}

function descendantIds(
	causes: readonly RecordCauseNode[],
	nodeId: string,
): Set<string> {
	const childIds = new Map<string, string[]>();

	for (const cause of causes) {
		if (cause.parentId) {
			const siblings = childIds.get(cause.parentId) ?? [];
			siblings.push(cause.id);
			childIds.set(cause.parentId, siblings);
		}
	}

	const collected = new Set<string>();
	const queue = [nodeId];

	for (let index = 0; index < queue.length; index += 1) {
		const current = queue[index];

		if (!current) {
			continue;
		}

		for (const childId of childIds.get(current) ?? []) {
			if (!collected.has(childId)) {
				collected.add(childId);
				queue.push(childId);
			}
		}
	}

	return collected;
}

function truncate(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function userSafeError(caught: unknown, copy: CoachCopy): string {
	if (caught instanceof Error) {
		const map: Record<string, string> = {
			CAUSE_NODE_NOT_FOUND: copy.causes.errorNotFound,
			INCIDENT_NOT_FOUND: copy.causes.errorIncidentNotFound,
			INVALID_CAUSE_BEFORE: copy.causes.errorInvalidBefore,
			INVALID_CAUSE_PARENT: copy.causes.errorInvalidParent,
			INVALID_CAUSE_PAYLOAD: copy.causes.errorInvalidPayload,
		};

		return map[caught.message] ?? caught.message;
	}

	return copy.causes.errorGeneric;
}
