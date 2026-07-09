"use client";

import Link from "next/link";
import {
	type Dispatch,
	type PointerEvent as ReactPointerEvent,
	type SetStateAction,
	type WheelEvent as ReactWheelEvent,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	EVENT_NODE_ID,
	layoutCauseTree,
	NODE_H,
	NODE_W,
} from "../../../lib/incident/cause-tree-layout";
import { assessIncidentReadiness } from "../../../lib/incident/readiness";
import {
	COACH_PHOTO_EVENT_TEXT,
	COACH_PHOTO_EVENT_TIME_LABEL,
	type IncidentRecord,
	type RecordAction,
	type RecordCauseNode,
	type RecordFact,
	type RecordTimelineEvent,
} from "../coach/types";

export type IncidentCanvasRecord = IncidentRecord;

type IncidentCanvasProps = {
	readonly incidentId: string;
	readonly initialRecord: IncidentCanvasRecord;
	readonly locale: string;
};

type Transform = {
	k: number;
	x: number;
	y: number;
};

type ViewportSize = {
	height: number;
	width: number;
};

type TimelineItem =
	| {
			id: string;
			kind: "event";
			title: string;
			meta: string | null;
			text: string;
			x: number;
			y: number;
			width: number;
			height: number;
	  }
	| {
			id: string;
			kind: "fact" | "timeline";
			title: string;
			meta: string | null;
			text: string;
			x: number;
			y: number;
			width: number;
			height: number;
	  };

type CanvasCauseNode = {
	cause: RecordCauseNode | null;
	id: string;
	kind: "event" | "cause";
	label: string;
	parentId: string | null;
	status: "event" | "open" | "parked" | "root";
	x: number;
	y: number;
	width: number;
	height: number;
};

type CanvasEdge = {
	id: string;
	from: CanvasCauseNode;
	to: CanvasCauseNode;
	status: CanvasCauseNode["status"];
};

type CanvasLayout = {
	actionsByCause: ReadonlyMap<string, readonly RecordAction[]>;
	bounds: { height: number; width: number; x: number; y: number };
	causeNodes: CanvasCauseNode[];
	edges: CanvasEdge[];
	eventAnchor: TimelineItem;
	timelineItems: TimelineItem[];
};

const minZoom = 0.12;
const maxZoom = 2.2;
const fitMargin = 24;
const maxFitZoom = 1.35;
const smallViewportWidth = 480;
const timelineY = 86;
const treeY = 355;
const timelineCardWidth = 190;
const timelineEventWidth = 252;
const timelineCardHeight = 108;
const timelineStep = 214;
const actionChipWidth = 178;

export default function IncidentCanvas({
	incidentId,
	initialRecord,
	locale,
}: IncidentCanvasProps) {
	const svgRef = useRef<SVGSVGElement | null>(null);
	const pointersRef = useRef(new Map<number, { x: number; y: number }>());
	const panStartRef = useRef<{
		transform: Transform;
		x: number;
		y: number;
	} | null>(null);
	const pinchStartRef = useRef<{
		centerX: number;
		centerY: number;
		distance: number;
		transform: Transform;
	} | null>(null);
	const [selectedId, setSelectedId] = useState<string>("event-anchor");
	const [transform, setTransform] = useState<Transform>({
		k: 0.9,
		x: 80,
		y: 120,
	});
	const [viewportSize, setViewportSize] = useState<ViewportSize>({
		height: 0,
		width: 0,
	});

	const record = initialRecord;
	const readiness = useMemo(
		() =>
			assessIncidentReadiness({
				actions: record.actions,
				causes: record.causes,
				hiraFollowupNeeded: record.hiraFollowup.needed,
				hiraFollowupText: record.hiraFollowup.text,
				incidentAt: record.incident.incidentAt,
				potentialSeverity: record.incident.potentialSeverity,
			}),
		[record],
	);
	const completePercent = readinessPercent(readiness.gaps.length);
	const layout = useMemo(
		() => buildCanvasLayout(record, locale),
		[locale, record],
	);
	const selected = useMemo(
		() => resolveSelection(selectedId, layout, record, locale),
		[selectedId, layout, record, locale],
	);

	useEffect(() => {
		const svg = svgRef.current;
		if (!svg) {
			return;
		}

		const updateSize = () => {
			const rect = svg.getBoundingClientRect();
			const nextSize = {
				height: rect.height,
				width: rect.width,
			};

			setViewportSize((current) =>
				Math.abs(current.width - nextSize.width) < 0.5 &&
				Math.abs(current.height - nextSize.height) < 0.5
					? current
					: nextSize,
			);
		};

		updateSize();
		const observer = new ResizeObserver(updateSize);
		observer.observe(svg);

		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		setTransform(fitTransform(layout.bounds, viewportSize));
	}, [layout, viewportSize]);

	const fitToScreen = () => {
		setTransform(fitTransform(layout.bounds, viewportSize));
	};

	const zoomBy = (factor: number) => {
		const viewport = svgRef.current;
		const centerX = (viewport?.clientWidth ?? viewportSize.width) / 2;
		const centerY = (viewport?.clientHeight ?? viewportSize.height) / 2;
		const nextZoom = clamp(transform.k * factor, minZoom, maxZoom);
		const world = screenToWorld(centerX, centerY, transform, viewport);

		setTransform({
			k: nextZoom,
			x: centerX - world.x * nextZoom,
			y: centerY - world.y * nextZoom,
		});
	};

	return (
		<main className="h-screen overflow-hidden bg-[#101113] text-[var(--color-text)]">
			<div className="pointer-events-none absolute left-0 top-0 z-20 flex w-full flex-col gap-3 p-3 sm:p-4">
				<div className="pointer-events-auto flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[rgba(22,22,26,0.93)] px-3 py-2 shadow-lg backdrop-blur">
					<div className="flex min-w-0 items-center gap-3">
						<Link
							className="shrink-0 text-sm text-[var(--color-muted)] underline-offset-4 hover:text-[var(--color-text)] hover:underline"
							href={`/incidents/${incidentId}/coach`}
						>
							&lt; Back to workbench
						</Link>
						<div className="min-w-0">
							<h1 className="m-0 truncate text-base font-semibold sm:text-lg">
								{record.incident.title}
							</h1>
							<p className="m-0 text-xs text-[var(--color-muted)]">
								{record.incident.caseNumber ?? "Unnumbered"} · {completePercent}
								% complete
							</p>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<button
							aria-label="Fit investigation canvas to screen"
							className="inline-flex min-h-9 items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs font-medium text-[var(--color-text)] hover:border-[var(--color-accent)]"
							onClick={fitToScreen}
							type="button"
						>
							Fit
						</button>
						<button
							aria-label="Zoom out"
							className="grid size-9 place-items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text)] hover:border-[var(--color-accent)]"
							onClick={() => zoomBy(0.86)}
							type="button"
						>
							-
						</button>
						<button
							aria-label="Zoom in"
							className="grid size-9 place-items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-sm text-[var(--color-text)] hover:border-[var(--color-accent)]"
							onClick={() => zoomBy(1.16)}
							type="button"
						>
							+
						</button>
					</div>
				</div>
			</div>
			<svg
				aria-label="Incident investigation canvas"
				className="h-full w-full touch-none select-none"
				onPointerCancel={handlePointerEnd}
				onPointerDown={handleCanvasPointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerEnd}
				onWheel={handleWheel}
				ref={svgRef}
				role="img"
			>
				<defs>
					<marker
						id="ii-arrow"
						markerHeight="8"
						markerWidth="8"
						orient="auto"
						refX="7"
						refY="4"
						viewBox="0 0 8 8"
					>
						<path d="M 0 0 L 8 4 L 0 8 z" fill="#9ca3af" />
					</marker>
					<filter
						id="ii-soft-shadow"
						x="-20%"
						y="-20%"
						width="140%"
						height="140%"
					>
						<feDropShadow
							dx="0"
							dy="8"
							floodColor="#000000"
							floodOpacity="0.24"
							stdDeviation="8"
						/>
					</filter>
				</defs>
				<rect fill="#101113" height="100%" width="100%" />
				<g
					transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}
				>
					<BandLabel label="Timeline" x={layout.bounds.x + 8} y={42} />
					<BandLabel
						label="Cause tree"
						x={layout.bounds.x + 8}
						y={treeY - 38}
					/>
					<path
						d={`M ${layout.eventAnchor.x + layout.eventAnchor.width / 2} ${layout.eventAnchor.y + layout.eventAnchor.height} L ${layout.eventAnchor.x + layout.eventAnchor.width / 2} ${treeY + 34}`}
						fill="none"
						stroke="#7b83ff"
						strokeDasharray="7 7"
						strokeLinecap="round"
						strokeWidth="2.5"
					/>
					<g>{layout.timelineItems.map((item) => renderTimelineItem(item))}</g>
					<g>{layout.edges.map(renderCauseEdge)}</g>
					<g>
						{layout.causeNodes.map((node) =>
							renderCauseNode(node, layout.actionsByCause),
						)}
					</g>
				</g>
			</svg>
			<Minimap
				bounds={layout.bounds}
				layout={layout}
				onPan={(x, y) => centerOnWorldPoint(x, y, svgRef.current, setTransform)}
				transform={transform}
				viewportSize={viewportSize}
			/>
			<SelectionPanel selected={selected} />
		</main>
	);

	function renderTimelineItem(item: TimelineItem) {
		const selected = selectedId === item.id;
		const isEvent = item.kind === "event";

		return (
			<g
				data-node-id={item.id}
				key={item.id}
				onPointerDown={(event) => {
					event.stopPropagation();
					setSelectedId(item.id);
				}}
				style={{ cursor: "pointer" }}
			>
				<rect
					fill={isEvent ? "rgba(35,39,58,0.98)" : "rgba(25,28,36,0.96)"}
					filter="url(#ii-soft-shadow)"
					height={item.height}
					rx={isEvent ? "16" : "12"}
					stroke={selected ? "#e4e4e8" : isEvent ? "#7b83ff" : "#4b587c"}
					strokeWidth={selected ? 4 : isEvent ? 2.5 : 1.7}
					width={item.width}
					x={item.x}
					y={item.y}
				/>
				<foreignObject
					height={item.height}
					pointerEvents="none"
					width={item.width}
					x={item.x}
					y={item.y}
				>
					<div className="flex h-full flex-col gap-2 p-3">
						<div className="flex items-center justify-between gap-2">
							<span
								className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-normal ${
									isEvent
										? "border-indigo-300/60 bg-indigo-300/12 text-indigo-100"
										: "border-[var(--color-border)] bg-[rgba(255,255,255,0.04)] text-[var(--color-muted)]"
								}`}
							>
								{isEvent ? "Event" : item.kind}
							</span>
							{item.meta ? (
								<span className="truncate text-[10px] text-[var(--color-muted)]">
									{item.meta}
								</span>
							) : null}
						</div>
						<div
							className={`line-clamp-2 leading-tight ${
								isEvent ? "text-base font-semibold" : "text-sm font-medium"
							}`}
						>
							{item.title}
						</div>
						<div className="line-clamp-2 text-xs leading-snug text-[var(--color-muted)]">
							{item.text}
						</div>
					</div>
				</foreignObject>
			</g>
		);
	}

	function renderCauseNode(
		node: CanvasCauseNode,
		actionsByCause: ReadonlyMap<string, readonly RecordAction[]>,
	) {
		const selected = selectedId === node.id;
		const actions =
			node.kind === "cause" ? (actionsByCause.get(node.id) ?? []) : [];
		const style = causeNodeStyle(node.status);
		const question = node.cause?.question?.trim() || "needs a why";

		return (
			<g
				data-node-id={node.id}
				key={node.id}
				onPointerDown={(event) => {
					event.stopPropagation();
					setSelectedId(node.id);
				}}
				style={{ cursor: "pointer" }}
			>
				<rect
					fill={style.fill}
					filter="url(#ii-soft-shadow)"
					height={node.height}
					rx="12"
					stroke={selected ? "#e4e4e8" : style.stroke}
					strokeDasharray={style.dash}
					strokeWidth={selected ? 4 : 2}
					width={node.width}
					x={node.x}
					y={node.y}
				/>
				{node.status === "open" ? (
					<rect
						fill="rgba(244,244,245,0.13)"
						height={node.height}
						rx="12"
						width={node.width}
						x={node.x}
						y={node.y}
					/>
				) : null}
				<foreignObject
					height={node.height}
					pointerEvents="none"
					width={node.width}
					x={node.x}
					y={node.y}
				>
					<div className="flex h-full flex-col justify-between gap-2 p-3">
						<div className={node.status === "parked" ? "opacity-65" : ""}>
							<div className="line-clamp-2 text-sm font-semibold leading-tight">
								{node.label}
							</div>
							<div className="mt-1 text-[11px] uppercase tracking-normal text-[var(--color-muted)]">
								{node.kind === "event"
									? "effect"
									: causeStatusLabel(node.status)}
							</div>
						</div>
						{node.status === "open" ? (
							<div className="line-clamp-1 rounded-full border border-amber-500/70 bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-200">
								{question}
							</div>
						) : node.status === "parked" ? (
							<div className="rounded-full border border-zinc-400/50 bg-zinc-400/10 px-2 py-0.5 text-[10px] text-zinc-200">
								beyond our scope
							</div>
						) : null}
					</div>
				</foreignObject>
				{node.status === "open" ? (
					<CloudIcon x={node.x + node.width - 42} y={node.y + 12} />
				) : null}
				{node.status === "root" ? (
					<RootMarker x={node.x + node.width - 33} y={node.y + 12} />
				) : null}
				{actions.map((action, index) => (
					<ActionChip
						action={action}
						key={action.id}
						x={node.x + node.width - 18}
						y={node.y + 12 + index * 30}
					/>
				))}
			</g>
		);
	}

	function handleCanvasPointerDown(event: ReactPointerEvent<SVGSVGElement>) {
		const target = event.target as Element;
		if (target.closest("[data-node-id]")) {
			return;
		}

		event.currentTarget.setPointerCapture(event.pointerId);
		pointersRef.current.set(event.pointerId, {
			x: event.clientX,
			y: event.clientY,
		});
		panStartRef.current = {
			transform,
			x: event.clientX,
			y: event.clientY,
		};
		updatePinchStart();
	}

	function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
		if (!pointersRef.current.has(event.pointerId)) {
			return;
		}

		pointersRef.current.set(event.pointerId, {
			x: event.clientX,
			y: event.clientY,
		});

		if (pointersRef.current.size >= 2 && pinchStartRef.current) {
			event.preventDefault();
			const current = pointerPair();
			if (!current) {
				return;
			}

			const scale = clamp(
				(current.distance / pinchStartRef.current.distance) *
					pinchStartRef.current.transform.k,
				minZoom,
				maxZoom,
			);
			const world = screenToWorld(
				pinchStartRef.current.centerX,
				pinchStartRef.current.centerY,
				pinchStartRef.current.transform,
				svgRef.current,
			);

			setTransform({
				k: scale,
				x: current.centerX - world.x * scale,
				y: current.centerY - world.y * scale,
			});
			return;
		}

		if (panStartRef.current) {
			event.preventDefault();
			setTransform({
				...panStartRef.current.transform,
				x:
					panStartRef.current.transform.x +
					event.clientX -
					panStartRef.current.x,
				y:
					panStartRef.current.transform.y +
					event.clientY -
					panStartRef.current.y,
			});
		}
	}

	function handlePointerEnd(event: ReactPointerEvent<SVGSVGElement>) {
		pointersRef.current.delete(event.pointerId);
		if (pointersRef.current.size === 0) {
			panStartRef.current = null;
			pinchStartRef.current = null;
			return;
		}

		updatePinchStart();
	}

	function handleWheel(event: ReactWheelEvent<SVGSVGElement>) {
		event.preventDefault();
		const nextZoom = clamp(
			transform.k * (event.deltaY > 0 ? 0.9 : 1.1),
			minZoom,
			maxZoom,
		);
		const world = screenToWorld(
			event.clientX,
			event.clientY,
			transform,
			svgRef.current,
		);

		setTransform({
			k: nextZoom,
			x: event.clientX - world.x * nextZoom,
			y: event.clientY - world.y * nextZoom,
		});
	}

	function updatePinchStart() {
		const pair = pointerPair();
		pinchStartRef.current = pair
			? {
					centerX: pair.centerX,
					centerY: pair.centerY,
					distance: pair.distance,
					transform,
				}
			: null;
	}

	function pointerPair(): {
		centerX: number;
		centerY: number;
		distance: number;
	} | null {
		const points = [...pointersRef.current.values()];
		const first = points[0];
		const second = points[1];
		if (!first || !second) {
			return null;
		}

		return {
			centerX: (first.x + second.x) / 2,
			centerY: (first.y + second.y) / 2,
			distance: Math.hypot(first.x - second.x, first.y - second.y),
		};
	}
}

function BandLabel({ label, x, y }: { label: string; x: number; y: number }) {
	return (
		<text
			fill="#8e8e9a"
			fontSize="13"
			fontWeight="700"
			letterSpacing="0"
			textAnchor="start"
			x={x}
			y={y}
		>
			{label}
		</text>
	);
}

function ActionChip({
	action,
	x,
	y,
}: {
	action: RecordAction;
	x: number;
	y: number;
}) {
	const incomplete = !action.ownerRole || !action.dueDate;

	return (
		<g pointerEvents="none">
			<rect
				fill="rgba(20,83,45,0.9)"
				height="24"
				rx="12"
				stroke={incomplete ? "#f59e0b" : "#34d399"}
				strokeWidth="1.5"
				width={actionChipWidth}
				x={x}
				y={y}
			/>
			<text
				fill="#d1fae5"
				fontSize="10.5"
				fontWeight="600"
				x={x + 10}
				y={y + 16}
			>
				{truncate(action.description, incomplete ? 20 : 23)}
			</text>
			{incomplete ? (
				<circle
					cx={x + actionChipWidth - 13}
					cy={y + 12}
					fill="#f59e0b"
					r="4"
				/>
			) : null}
		</g>
	);
}

function Minimap({
	bounds,
	layout,
	onPan,
	transform,
	viewportSize,
}: {
	bounds: CanvasLayout["bounds"];
	layout: CanvasLayout;
	onPan: (x: number, y: number) => void;
	transform: Transform;
	viewportSize: ViewportSize;
}) {
	const isSmallViewport =
		viewportSize.width > 0 && viewportSize.width < smallViewportWidth;
	const width = isSmallViewport ? 96 : 168;
	const height = Math.round(width * (118 / 168));
	const view = minimapViewBox(bounds);
	const viewportRect =
		viewportSize.width > 0 && viewportSize.height > 0
			? {
					height: viewportSize.height / transform.k,
					width: viewportSize.width / transform.k,
					x: -transform.x / transform.k,
					y: -transform.y / transform.k,
				}
			: null;

	return (
		<svg
			aria-label="Incident canvas minimap"
			className={`absolute right-3 z-20 rounded-md border border-[var(--color-border)] bg-[rgba(22,22,26,0.9)] shadow-lg ${
				isSmallViewport ? "top-36" : "bottom-3"
			}`}
			height={height}
			onPointerDown={(event) => {
				const rect = event.currentTarget.getBoundingClientRect();
				const x =
					view.x + ((event.clientX - rect.left) / rect.width) * view.width;
				const y =
					view.y + ((event.clientY - rect.top) / rect.height) * view.height;
				onPan(x, y);
			}}
			role="img"
			viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
			width={width}
		>
			<rect
				fill="#16161a"
				height={view.height}
				width={view.width}
				x={view.x}
				y={view.y}
			/>
			{layout.timelineItems.map((item) => (
				<rect
					fill={
						item.kind === "event"
							? "rgba(123,131,255,0.45)"
							: "rgba(148,163,184,0.24)"
					}
					height={item.height}
					key={`mini-${item.id}`}
					rx="10"
					stroke={item.kind === "event" ? "#7b83ff" : "#64748b"}
					strokeWidth="4"
					width={item.width}
					x={item.x}
					y={item.y}
				/>
			))}
			{layout.causeNodes.map((node) => (
				<rect
					fill={
						node.status === "open"
							? "rgba(245,158,11,0.28)"
							: node.status === "parked"
								? "rgba(148,163,184,0.18)"
								: "rgba(123,131,255,0.24)"
					}
					height={node.height}
					key={`mini-${node.id}`}
					rx="10"
					stroke={node.status === "open" ? "#f59e0b" : "#7b83ff"}
					strokeWidth="4"
					width={node.width}
					x={node.x}
					y={node.y}
				/>
			))}
			{viewportRect ? (
				<rect
					fill="rgba(255,255,255,0.08)"
					height={viewportRect.height}
					stroke="#e4e4e8"
					strokeWidth="5"
					width={viewportRect.width}
					x={viewportRect.x}
					y={viewportRect.y}
				/>
			) : null}
		</svg>
	);
}

function SelectionPanel({
	selected,
}: {
	selected: { title: string; rows: Array<{ label: string; value: string }> };
}) {
	return (
		<aside className="pointer-events-none absolute bottom-3 left-3 right-3 z-20 sm:bottom-auto sm:left-auto sm:right-3 sm:top-24 sm:w-80">
			<div className="pointer-events-auto max-h-36 overflow-auto rounded-md border border-[var(--color-border)] bg-[rgba(22,22,26,0.94)] p-3 shadow-lg backdrop-blur sm:max-h-[58vh]">
				<p className="m-0 text-xs font-medium uppercase tracking-normal text-[var(--color-muted)]">
					Selected
				</p>
				<h2 className="m-0 mt-1 text-sm font-semibold leading-tight">
					{selected.title}
				</h2>
				<dl className="mt-3 grid gap-2 text-xs">
					{selected.rows.map((row) => (
						<div className="grid gap-0.5" key={row.label}>
							<dt className="text-[var(--color-muted)]">{row.label}</dt>
							<dd className="m-0 text-[var(--color-text)]">{row.value}</dd>
						</div>
					))}
				</dl>
			</div>
		</aside>
	);
}

function renderCauseEdge(edge: CanvasEdge) {
	const x1 = edge.from.x + edge.from.width;
	const y1 = edge.from.y + edge.from.height / 2;
	const x2 = edge.to.x;
	const y2 = edge.to.y + edge.to.height / 2;
	const mx = (x1 + x2) / 2;

	return (
		<path
			d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
			fill="none"
			key={edge.id}
			markerEnd="url(#ii-arrow)"
			stroke={edge.status === "open" ? "#d97706" : "#9ca3af"}
			strokeDasharray={edge.status === "parked" ? "5 5" : undefined}
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="2.2"
		/>
	);
}

function buildCanvasLayout(
	record: IncidentCanvasRecord,
	locale: string,
): CanvasLayout {
	const timelineItems = buildTimelineItems(record, locale);
	const eventAnchor = timelineItems.find((item) => item.kind === "event");
	const tree = layoutCauseTree({
		actions: [],
		causes: record.causes,
		eventTitle: record.incident.title || "Event",
	});
	const eventTreeNode = tree.nodes.find((node) => node.id === EVENT_NODE_ID);
	const eventAnchorCenter = eventAnchor
		? eventAnchor.x + eventAnchor.width / 2
		: 220;
	const treeOffsetX = eventTreeNode
		? eventAnchorCenter - (eventTreeNode.x + NODE_W / 2)
		: 160;
	const causeById = new Map(record.causes.map((cause) => [cause.id, cause]));
	const causeNodes: CanvasCauseNode[] = tree.nodes
		.filter((node) => node.kind !== "measure")
		.map((node) => {
			const cause =
				node.id === EVENT_NODE_ID ? null : (causeById.get(node.id) ?? null);
			const status =
				node.id === EVENT_NODE_ID
					? "event"
					: cause?.branchStatus === "PARKED"
						? "parked"
						: cause?.branchStatus === "ROOT_REACHED" || cause?.isRootCause
							? "root"
							: "open";

			return {
				cause,
				height: NODE_H,
				id: node.id,
				kind: node.id === EVENT_NODE_ID ? "event" : "cause",
				label: node.label,
				parentId: node.parentId,
				status,
				width: NODE_W,
				x: treeOffsetX + node.x,
				y: treeY + node.y,
			};
		});
	const nodesById = new Map(causeNodes.map((node) => [node.id, node]));
	const edges = causeNodes.flatMap((node) => {
		const parent = node.parentId ? nodesById.get(node.parentId) : null;
		if (!parent) {
			return [];
		}

		return [
			{
				from: parent,
				id: `edge-${node.id}`,
				status: node.status,
				to: node,
			},
		];
	});
	const actionsByCause = groupActionsByCause(record.actions);
	const bounds = computeBounds(timelineItems, causeNodes, actionsByCause);

	return {
		actionsByCause,
		bounds,
		causeNodes,
		edges,
		eventAnchor: eventAnchor ?? timelineItems[0],
		timelineItems,
	};
}

function buildTimelineItems(
	record: IncidentCanvasRecord,
	locale: string,
): TimelineItem[] {
	const incidentAt = record.incident.incidentAt
		? Date.parse(record.incident.incidentAt)
		: null;
	const events = record.timeline
		.filter((event) => !isCoachPhotoEvidenceEvent(event))
		.map((event) => ({
			event,
			sortAt: event.eventAt ? Date.parse(event.eventAt) : null,
		}));
	const datedBefore = events
		.filter(
			(item) =>
				item.sortAt !== null &&
				(incidentAt === null || item.sortAt < incidentAt),
		)
		.sort(sortTimelineDrafts);
	const datedAfter = events
		.filter(
			(item) =>
				item.sortAt !== null &&
				incidentAt !== null &&
				item.sortAt >= incidentAt,
		)
		.sort(sortTimelineDrafts);
	const undatedEvents = events
		.filter((item) => item.sortAt === null)
		.sort((left, right) => left.event.text.localeCompare(right.event.text));

	const drafts: Array<
		| { kind: "event" }
		| { kind: "timeline"; value: RecordTimelineEvent }
		| { kind: "fact"; value: RecordFact }
	> = [
		...datedBefore.map((item) => ({
			kind: "timeline" as const,
			value: item.event,
		})),
		{ kind: "event" },
		...datedAfter.map((item) => ({
			kind: "timeline" as const,
			value: item.event,
		})),
		...undatedEvents.map((item) => ({
			kind: "timeline" as const,
			value: item.event,
		})),
		...record.facts.map((fact) => ({ kind: "fact" as const, value: fact })),
	];

	let cursorX = 72;
	return drafts.map((draft) => {
		if (draft.kind === "event") {
			const item: TimelineItem = {
				height: 128,
				id: "event-anchor",
				kind: "event",
				meta: record.incident.incidentAt
					? formatDateTime(record.incident.incidentAt, locale)
					: "time open",
				text: [
					record.incident.incidentType,
					record.incident.potentialSeverity
						? `potential ${record.incident.potentialSeverity}`
						: null,
					record.incident.location,
				]
					.filter(Boolean)
					.join(" · "),
				title: record.incident.title || "Incident",
				width: timelineEventWidth,
				x: cursorX,
				y: timelineY - 10,
			};
			cursorX += timelineEventWidth + 34;
			return item;
		}

		const item: TimelineItem =
			draft.kind === "timeline"
				? timelineItemFromEvent(draft.value, cursorX, locale)
				: timelineItemFromFact(draft.value, cursorX);
		cursorX += timelineStep;
		return item;
	});
}

function groupActionsByCause(
	actions: readonly RecordAction[],
): ReadonlyMap<string, readonly RecordAction[]> {
	const groups = new Map<string, RecordAction[]>();
	for (const action of actions) {
		const group = groups.get(action.causeNodeId) ?? [];
		group.push(action);
		groups.set(action.causeNodeId, group);
	}
	return groups;
}

function timelineItemFromEvent(
	event: RecordTimelineEvent,
	x: number,
	locale: string,
): TimelineItem {
	return {
		height: timelineCardHeight,
		id: `timeline-${event.id}`,
		kind: "timeline",
		meta: event.eventAt
			? formatDateTime(event.eventAt, locale)
			: event.timeLabel || "undated",
		text: event.confidence ? `Confidence: ${event.confidence}` : "",
		title: event.text,
		width: timelineCardWidth,
		x,
		y: timelineY,
	};
}

function timelineItemFromFact(fact: RecordFact, x: number): TimelineItem {
	return {
		height: timelineCardHeight,
		id: `fact-${fact.id}`,
		kind: "fact",
		meta: factAttribution(fact),
		text: fact.text,
		title: "Fact",
		width: timelineCardWidth,
		x,
		y: timelineY,
	};
}

function computeBounds(
	timelineItems: readonly TimelineItem[],
	causeNodes: readonly CanvasCauseNode[],
	actionsByCause: ReadonlyMap<string, readonly RecordAction[]>,
) {
	const minX = Math.min(
		...timelineItems.map((item) => item.x),
		...causeNodes.map((node) => node.x),
	);
	const minY = Math.min(
		...timelineItems.map((item) => item.y),
		...causeNodes.map((node) => node.y),
	);
	const maxTimelineX = Math.max(
		...timelineItems.map((item) => item.x + item.width),
	);
	const maxCauseX = Math.max(
		...causeNodes.map((node) => {
			const actions = actionsByCause.get(node.id) ?? [];
			return node.x + node.width + (actions.length > 0 ? actionChipWidth : 0);
		}),
	);
	const maxY = Math.max(
		...timelineItems.map((item) => item.y + item.height),
		...causeNodes.map((node) => {
			const actions = actionsByCause.get(node.id) ?? [];
			return Math.max(node.y + node.height, node.y + 18 + actions.length * 30);
		}),
	);

	return {
		height: maxY - minY,
		width: Math.max(maxTimelineX, maxCauseX) - minX,
		x: minX,
		y: minY,
	};
}

function fitTransform(
	bounds: CanvasLayout["bounds"],
	viewportSize: ViewportSize,
): Transform {
	if (viewportSize.width <= 0 || viewportSize.height <= 0) {
		return { k: 0.9, x: 80, y: 120 };
	}

	const isSmallViewport = viewportSize.width < smallViewportWidth;
	const topInset = isSmallViewport ? 154 : 92;
	const usableWidth = Math.max(1, viewportSize.width - fitMargin * 2);
	const usableHeight = Math.max(1, viewportSize.height - topInset - fitMargin);
	const rawScale = Math.min(
		usableWidth / Math.max(bounds.width, 1),
		usableHeight / Math.max(bounds.height, 1),
	);
	const scale = clamp(rawScale, isSmallViewport ? 0.42 : minZoom, maxFitZoom);
	const focusX = isSmallViewport
		? bounds.x + bounds.width * 0.34
		: bounds.x + bounds.width / 2;

	return {
		k: scale,
		x: fitMargin + usableWidth / 2 - focusX * scale,
		y: topInset + usableHeight / 2 - (bounds.y + bounds.height / 2) * scale,
	};
}

function centerOnWorldPoint(
	x: number,
	y: number,
	viewport: SVGSVGElement | null,
	setTransform: Dispatch<SetStateAction<Transform>>,
) {
	if (!viewport) {
		return;
	}

	setTransform((current) => ({
		k: current.k,
		x: viewport.clientWidth / 2 - x * current.k,
		y: viewport.clientHeight / 2 - y * current.k,
	}));
}

function screenToWorld(
	clientX: number,
	clientY: number,
	transform: Transform,
	viewport: SVGSVGElement | null,
) {
	const rect = viewport?.getBoundingClientRect();
	const x = rect ? clientX - rect.left : clientX;
	const y = rect ? clientY - rect.top : clientY;

	return {
		x: (x - transform.x) / transform.k,
		y: (y - transform.y) / transform.k,
	};
}

function minimapViewBox(bounds: CanvasLayout["bounds"]) {
	const pad = 80;
	return {
		height: bounds.height + pad * 2,
		width: bounds.width + pad * 2,
		x: bounds.x - pad,
		y: bounds.y - pad,
	};
}

function resolveSelection(
	selectedId: string,
	layout: CanvasLayout,
	record: IncidentCanvasRecord,
	locale: string,
): { title: string; rows: Array<{ label: string; value: string }> } {
	if (selectedId === "event-anchor" || selectedId === EVENT_NODE_ID) {
		return {
			rows: [
				{
					label: "Reference",
					value: record.incident.caseNumber ?? "Unnumbered",
				},
				{
					label: "When",
					value: record.incident.incidentAt
						? formatDateTime(record.incident.incidentAt, locale)
						: "Not set",
				},
				{ label: "Where", value: record.incident.location ?? "Not set" },
				{ label: "Type", value: record.incident.incidentType || "Not set" },
				{
					label: "Actual harm",
					value:
						record.incident.actualOutcome ??
						record.incident.actualSeverity ??
						"Not set",
				},
				{
					label: "Potential harm",
					value: record.incident.potentialSeverity ?? "Not set",
				},
			],
			title: record.incident.title || "Incident",
		};
	}

	const timeline = layout.timelineItems.find((item) => item.id === selectedId);
	if (timeline) {
		return {
			rows: [
				{ label: "Kind", value: timeline.kind },
				{ label: "When/source", value: timeline.meta ?? "Not set" },
				{ label: "Text", value: timeline.text || timeline.title },
			],
			title: timeline.title,
		};
	}

	const cause = record.causes.find((candidate) => candidate.id === selectedId);
	if (cause) {
		const actions = record.actions.filter(
			(action) => action.causeNodeId === cause.id,
		);
		return {
			rows: [
				{ label: "Status", value: cause.branchStatus ?? "OPEN" },
				{ label: "Question", value: cause.question?.trim() || "needs a why" },
				{
					label: "Measures",
					value: actions.length > 0 ? String(actions.length) : "None linked",
				},
			],
			title: cause.statement,
		};
	}

	return {
		rows: [{ label: "Selection", value: selectedId }],
		title: "Canvas item",
	};
}

function causeNodeStyle(status: CanvasCauseNode["status"]): {
	dash?: string;
	fill: string;
	stroke: string;
} {
	switch (status) {
		case "event":
			return { fill: "rgba(35,39,58,0.98)", stroke: "#7b83ff" };
		case "parked":
			return {
				dash: "7 6",
				fill: "rgba(34,34,39,0.78)",
				stroke: "#8e8e9a",
			};
		case "root":
			return { fill: "rgba(25,45,37,0.96)", stroke: "#34d399" };
		case "open":
			return { fill: "rgba(43,33,19,0.96)", stroke: "#f59e0b" };
	}
}

function causeStatusLabel(status: CanvasCauseNode["status"]): string {
	switch (status) {
		case "event":
			return "effect";
		case "open":
			return "open branch";
		case "parked":
			return "parked";
		case "root":
			return "root cause";
	}
}

function CloudIcon({ x, y }: { x: number; y: number }) {
	return (
		<g
			fill="none"
			pointerEvents="none"
			stroke="#fbbf24"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="2"
			transform={`translate(${x} ${y})`}
		>
			<path d="M 8 24 H 28 C 34 24 38 20 38 15 C 38 10 34 7 29 7 C 27 3 23 1 18 1 C 11 1 6 6 6 13 C 3 14 1 17 1 20 C 1 22 4 24 8 24 Z" />
		</g>
	);
}

function RootMarker({ x, y }: { x: number; y: number }) {
	return (
		<g pointerEvents="none" transform={`translate(${x} ${y})`}>
			<circle
				cx="12"
				cy="12"
				fill="rgba(16,185,129,0.18)"
				r="12"
				stroke="#34d399"
				strokeWidth="2"
			/>
			<path
				d="M 12 19 V 8 M 8 12 H 16 M 9 9 L 12 6 L 15 9"
				fill="none"
				stroke="#a7f3d0"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.6"
			/>
		</g>
	);
}

function readinessPercent(gapCount: number): number {
	const totalChecks = 8;
	return Math.max(
		0,
		Math.min(100, Math.round(((totalChecks - gapCount) / totalChecks) * 100)),
	);
}

function sortTimelineDrafts(
	left: { sortAt: number | null; event: RecordTimelineEvent },
	right: { sortAt: number | null; event: RecordTimelineEvent },
): number {
	const leftTime = left.sortAt ?? Number.POSITIVE_INFINITY;
	const rightTime = right.sortAt ?? Number.POSITIVE_INFINITY;
	if (leftTime !== rightTime) {
		return leftTime - rightTime;
	}
	return left.event.text.localeCompare(right.event.text);
}

function factAttribution(fact: RecordFact): string {
	return (
		[fact.personName, fact.personRole].filter(Boolean).join(" · ") ||
		"attributed fact"
	);
}

function formatDateTime(value: string, locale?: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) {
		return value;
	}
	return date.toLocaleString(locale, {
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		month: "short",
		year: "numeric",
	});
}

function isCoachPhotoEvidenceEvent(event: RecordTimelineEvent): boolean {
	return (
		event.text === COACH_PHOTO_EVENT_TEXT &&
		event.timeLabel === COACH_PHOTO_EVENT_TIME_LABEL
	);
}

function truncate(value: string, length: number): string {
	return value.length <= length
		? value
		: `${value.slice(0, Math.max(0, length - 1))}...`;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
