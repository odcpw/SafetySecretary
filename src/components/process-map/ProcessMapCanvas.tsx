"use client";

import ELK, { type ElkExtendedEdge, type ElkNode } from "elkjs/lib/elk.bundled";
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
	computeProcessMapAltitudeView,
	exploredPercent,
	type ProcessMapNodeAggregate,
} from "../../lib/process-map/canvas";
import type {
	ProcessEdge,
	ProcessFlow,
	ProcessMap,
	ProcessNode,
	ProcessResource,
} from "../../lib/process-map";
import type {
	ProcessMapFogState,
	ProcessMapReadiness,
} from "../../lib/process-map/readiness";

export type ProcessMapCanvasRecord = {
	map: SerializeDates<ProcessMap>;
	nodes: Array<SerializeDates<ProcessNode>>;
	edges: Array<SerializeDates<ProcessEdge>>;
	flows: Array<SerializeDates<ProcessFlow>>;
	resources: Array<SerializeDates<ProcessResource>>;
	readiness: ProcessMapReadiness;
};

type SerializeDates<T> = {
	[K in keyof T]: T[K] extends Date
		? string
		: T[K] extends Date | null
			? string | null
			: T[K];
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

type ElkDirection = "DOWN" | "RIGHT";

type LayoutNode = {
	aggregate: ProcessMapNodeAggregate | null;
	depth: number;
	fogState: ProcessMapFogState;
	hasVisibleChildren: boolean;
	height: number;
	isCollapsed: boolean;
	isFoggedRegion: boolean;
	node: SerializeDates<ProcessNode>;
	width: number;
	x: number;
	y: number;
};

type LayoutEdge = {
	id: string;
	label: string | null;
	points: Array<{ x: number; y: number }>;
};

type LayoutResult = {
	bounds: { height: number; width: number; x: number; y: number };
	edges: LayoutEdge[];
	mode: "ELK" | "fallback";
	nodes: Map<string, LayoutNode>;
};

const elk = new ELK();
const leafWidth = 210;
const leafHeight = 92;
const collapsedWidth = 236;
const collapsedHeight = 120;
const minZoom = 0.08;
const maxZoom = 2.2;
const fitMargin = 24;
const maxFitZoom = 1.5;
const smallViewportWidth = 480;

export default function ProcessMapCanvas({
	record,
}: {
	record: ProcessMapCanvasRecord;
}) {
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
	const [altitude, setAltitude] = useState(2);
	const [layout, setLayout] = useState<LayoutResult | null>(null);
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const [showQuestLog, setShowQuestLog] = useState(false);
	const [transform, setTransform] = useState<Transform>({
		k: 0.9,
		x: 80,
		y: 120,
	});
	const [viewportSize, setViewportSize] = useState<ViewportSize>({
		height: 0,
		width: 0,
	});

	const fogStates = useMemo(() => deriveFogStates(record), [record]);
	const altitudeView = useMemo(
		() =>
			computeProcessMapAltitudeView({
				altitude,
				fogStates,
				nodes: record.nodes,
				resources: record.resources,
			}),
		[altitude, fogStates, record.nodes, record.resources],
	);
	const clampedAltitude = Math.min(altitude, altitudeView.maxDepth);
	const explored = exploredPercent(record.readiness.questLog);
	useEffect(() => {
		if (altitude !== clampedAltitude) {
			setAltitude(clampedAltitude);
		}
	}, [altitude, clampedAltitude]);

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
		let cancelled = false;

		layoutWithElk(record, altitudeView, fogStates, "RIGHT")
			.catch(() => layoutFallback(record, altitudeView, fogStates, "RIGHT"))
			.then((nextLayout) => {
				if (cancelled) {
					return;
				}

				setLayout(nextLayout);
			});

		return () => {
			cancelled = true;
		};
	}, [altitudeView, fogStates, record]);

	useEffect(() => {
		if (!layout) {
			return;
		}

		setTransform(fitTransform(layout.bounds, viewportSize));
	}, [layout, viewportSize]);

	const visibleSelectedId = selectedNodeId
		? resolveVisibleNodeId(
				selectedNodeId,
				record.nodes,
				altitudeView.visibleNodeIds,
			)
		: null;

	const fitToScreen = () => {
		if (!layout) {
			return;
		}

		setTransform(fitTransform(layout.bounds, viewportSize));
	};

	return (
		<main className="h-screen overflow-hidden bg-[#101113] text-[var(--color-text)]">
			<div className="pointer-events-none absolute left-0 top-0 z-20 flex w-full flex-col gap-3 p-3 sm:p-4">
				<div className="pointer-events-auto flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[rgba(22,22,26,0.92)] px-3 py-2 shadow-lg backdrop-blur">
					<div className="flex min-w-0 items-center gap-3">
						<Link
							className="shrink-0 text-sm text-[var(--color-muted)] underline-offset-4 hover:text-[var(--color-text)] hover:underline"
							href="/process-maps"
						>
							&lt; Back
						</Link>
						<div className="min-w-0">
							<h1 className="m-0 truncate text-base font-semibold sm:text-lg">
								{record.map.title}
							</h1>
							<p className="m-0 text-xs text-[var(--color-muted)]">
								{explored}% explored
							</p>
						</div>
					</div>
					<div className="flex items-center gap-2">
						<AltitudeControl
							altitude={clampedAltitude}
							maxDepth={altitudeView.maxDepth}
							onChange={setAltitude}
						/>
						<button
							aria-label="Fit map to screen"
							className="inline-flex min-h-9 items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 text-xs font-medium text-[var(--color-text)] hover:border-[var(--color-accent)]"
							onClick={fitToScreen}
							type="button"
						>
							Fit
						</button>
						<button
							className="inline-flex min-h-9 items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm text-[var(--color-text)] hover:border-[var(--color-accent)]"
							onClick={() => setShowQuestLog((value) => !value)}
							type="button"
						>
							Quest log
						</button>
					</div>
				</div>
				{showQuestLog ? (
					<QuestPanel
						onSelect={(nodeId) => {
							setShowQuestLog(false);
							setSelectedNodeId(nodeId);
							panToNode(
								nodeId,
								record.nodes,
								altitudeView.visibleNodeIds,
								layout,
								svgRef.current,
								setTransform,
							);
						}}
						quests={record.readiness.questLog.quests}
					/>
				) : null}
			</div>
			<svg
				aria-label="Process map canvas"
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
						id="pm-arrow"
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
						id="pm-soft-shadow"
						x="-20%"
						y="-20%"
						width="140%"
						height="140%"
					>
						<feDropShadow
							dx="0"
							dy="8"
							floodColor="#000000"
							floodOpacity="0.2"
							stdDeviation="8"
						/>
					</filter>
					<filter
						id="pm-fog-blur"
						x="-40%"
						y="-40%"
						width="180%"
						height="180%"
					>
						<feGaussianBlur stdDeviation="8" />
					</filter>
					<g id="pm-fog-puff" opacity="0.64">
						<ellipse
							cx="22"
							cy="23"
							fill="#d7dade"
							filter="url(#pm-fog-blur)"
							rx="22"
							ry="13"
						/>
						<ellipse
							cx="42"
							cy="18"
							fill="#d7dade"
							filter="url(#pm-fog-blur)"
							rx="19"
							ry="15"
						/>
						<ellipse
							cx="59"
							cy="25"
							fill="#d7dade"
							filter="url(#pm-fog-blur)"
							rx="24"
							ry="12"
						/>
					</g>
				</defs>
				<rect fill="#101113" height="100%" width="100%" />
				{layout ? (
					<g
						transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}
					>
						<g>
							{[...layout.nodes.values()].map((node) =>
								renderRegion(node, visibleSelectedId),
							)}
						</g>
						<g>{layout.edges.map((edge) => renderEdge(edge, transform.k))}</g>
						<g>
							{[...layout.nodes.values()].map((node) =>
								renderNodeBox(node, visibleSelectedId, setSelectedNodeId),
							)}
						</g>
						<g>{[...layout.nodes.values()].map(renderRegionLabel)}</g>
					</g>
				) : (
					<text fill="#8e8e9a" x="24" y="88">
						Layout loading...
					</text>
				)}
			</svg>
			{layout ? (
				<Minimap
					bounds={layout.bounds}
					layout={layout}
					onPan={(x, y) =>
						centerOnWorldPoint(x, y, svgRef.current, setTransform)
					}
					transform={transform}
					viewportSize={viewportSize}
				/>
			) : null}
			<div className="absolute bottom-3 left-3 z-10 rounded-md border border-[var(--color-border)] bg-[rgba(22,22,26,0.9)] px-2 py-1 text-xs text-[var(--color-muted)]">
				Layout: {layout?.mode ?? "ELK"}
			</div>
		</main>
	);

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

function AltitudeControl({
	altitude,
	maxDepth,
	onChange,
}: {
	altitude: number;
	maxDepth: number;
	onChange: (value: number) => void;
}) {
	return (
		<div className="flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-1">
			<button
				aria-label="Decrease altitude"
				className="grid size-7 place-items-center rounded text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-elev)] hover:text-[var(--color-text)] disabled:opacity-40"
				disabled={altitude <= 1}
				onClick={() => onChange(Math.max(1, altitude - 1))}
				type="button"
			>
				-
			</button>
			<div
				aria-label={`Altitude ${altitude} of ${maxDepth}`}
				className="flex items-end gap-0.5 px-1"
				role="img"
			>
				{Array.from({ length: maxDepth }, (_, index) => index + 1).map(
					(rung) => (
						<span
							className={`block w-1.5 rounded-sm ${
								rung <= altitude
									? "bg-[var(--color-accent)]"
									: "bg-[var(--color-border)]"
							}`}
							key={`altitude-rung-${rung}`}
							style={{ height: 5 + rung * 3 }}
						/>
					),
				)}
			</div>
			<button
				aria-label="Increase altitude"
				className="grid size-7 place-items-center rounded text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface-elev)] hover:text-[var(--color-text)] disabled:opacity-40"
				disabled={altitude >= maxDepth}
				onClick={() => onChange(Math.min(maxDepth, altitude + 1))}
				type="button"
			>
				+
			</button>
		</div>
	);
}

function QuestPanel({
	onSelect,
	quests,
}: {
	onSelect: (nodeId: string) => void;
	quests: ProcessMapReadiness["questLog"]["quests"];
}) {
	return (
		<aside className="pointer-events-auto max-h-[45vh] w-full max-w-sm overflow-auto rounded-md border border-[var(--color-border)] bg-[rgba(22,22,26,0.96)] p-2 shadow-lg backdrop-blur">
			{quests.length === 0 ? (
				<p className="m-0 px-2 py-2 text-sm text-[var(--color-muted)]">
					No open quests.
				</p>
			) : (
				<ul className="m-0 grid list-none gap-1 p-0">
					{quests.map((quest) => (
						<li key={quest.nodeId}>
							<button
								className="grid w-full gap-0.5 rounded px-2 py-2 text-left hover:bg-[var(--color-surface-elev)]"
								onClick={() => onSelect(quest.nodeId)}
								type="button"
							>
								<span className="text-sm font-medium text-[var(--color-text)]">
									{quest.nodeName}
								</span>
								<span className="text-xs text-amber-300">
									Ask {quest.whoWouldKnow}
								</span>
							</button>
						</li>
					))}
				</ul>
			)}
		</aside>
	);
}

function Minimap({
	bounds,
	layout,
	onPan,
	transform,
	viewportSize,
}: {
	bounds: LayoutResult["bounds"];
	layout: LayoutResult;
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
			aria-label="Process map minimap"
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
			{[...layout.nodes.values()]
				.filter((node) => !node.node.parentId)
				.map((node) => (
					<rect
						fill={
							node.isFoggedRegion
								? "rgba(245,158,11,0.28)"
								: "rgba(123,131,255,0.24)"
						}
						height={node.height}
						key={node.node.id}
						rx="16"
						stroke={node.isFoggedRegion ? "#f59e0b" : "#7b83ff"}
						strokeWidth="5"
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

async function layoutWithElk(
	record: ProcessMapCanvasRecord,
	altitudeView: ReturnType<typeof computeProcessMapAltitudeView>,
	fogStates: ReadonlyMap<string, ProcessMapFogState>,
	direction: ElkDirection,
): Promise<LayoutResult> {
	const graph = buildElkGraph(record, altitudeView, direction);
	const result = await elk.layout(graph);
	return collectElkLayout(record, altitudeView, fogStates, result, "ELK");
}

function buildElkGraph(
	record: ProcessMapCanvasRecord,
	altitudeView: ReturnType<typeof computeProcessMapAltitudeView>,
	direction: ElkDirection,
): ElkNode {
	const nodesByParent = groupNodesByParent(record.nodes);
	const visibleNodeIds = altitudeView.visibleNodeIds;

	const buildNode = (node: SerializeDates<ProcessNode>): ElkNode => {
		const visibleChildren = (nodesByParent.get(node.id) ?? []).filter((child) =>
			visibleNodeIds.has(child.id),
		);
		const isCollapsed = altitudeView.collapsedNodeIds.has(node.id);

		if (visibleChildren.length > 0 && !isCollapsed) {
			return {
				children: visibleChildren.map(buildNode),
				id: node.id,
				layoutOptions: {
					"elk.direction": "RIGHT",
					"elk.padding": "[top=58,left=30,bottom=30,right=30]",
					"elk.layered.spacing.edgeNodeBetweenLayers": "34",
					"elk.layered.spacing.nodeNodeBetweenLayers": "64",
					"elk.spacing.nodeNode": "52",
				},
			};
		}

		return {
			height: isCollapsed ? collapsedHeight : leafHeight,
			id: node.id,
			width: isCollapsed ? collapsedWidth : leafWidth,
		};
	};

	return {
		children: (nodesByParent.get(null) ?? [])
			.filter((node) => visibleNodeIds.has(node.id))
			.map(buildNode),
		edges: visibleEdges(record, altitudeView).map((edge) => ({
			id: edge.id,
			sources: [edge.fromNodeId],
			targets: [edge.toNodeId],
		})),
		id: "root",
		layoutOptions: {
			"elk.algorithm": "layered",
			"elk.direction": direction,
			"elk.hierarchyHandling": "INCLUDE_CHILDREN",
			"elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
			"elk.layered.spacing.edgeNodeBetweenLayers": "56",
			"elk.layered.spacing.nodeNodeBetweenLayers": "128",
			"elk.spacing.nodeNode": "76",
		},
	};
}

function collectElkLayout(
	record: ProcessMapCanvasRecord,
	altitudeView: ReturnType<typeof computeProcessMapAltitudeView>,
	fogStates: ReadonlyMap<string, ProcessMapFogState>,
	graph: ElkNode,
	mode: LayoutResult["mode"],
): LayoutResult {
	const recordNodesById = new Map(record.nodes.map((node) => [node.id, node]));
	const childrenByParent = groupNodesByParent(record.nodes);
	const nodes = new Map<string, LayoutNode>();

	const visit = (elkNode: ElkNode, parentX: number, parentY: number) => {
		const recordNode = recordNodesById.get(elkNode.id);
		const x = parentX + (elkNode.x ?? 0);
		const y = parentY + (elkNode.y ?? 0);

		if (recordNode) {
			nodes.set(recordNode.id, {
				aggregate: altitudeView.aggregatesByNodeId.get(recordNode.id) ?? null,
				depth: altitudeView.depthByNodeId.get(recordNode.id) ?? 1,
				fogState: fogStates.get(recordNode.id) ?? "fog",
				hasVisibleChildren:
					(elkNode.children?.length ?? 0) > 0 &&
					!altitudeView.collapsedNodeIds.has(recordNode.id),
				height: elkNode.height ?? leafHeight,
				isCollapsed: altitudeView.collapsedNodeIds.has(recordNode.id),
				isFoggedRegion: isFoggedRegion(
					recordNode.id,
					childrenByParent,
					fogStates,
				),
				node: recordNode,
				width: elkNode.width ?? leafWidth,
				x,
				y,
			});
		}

		for (const child of elkNode.children ?? []) {
			visit(child, x, y);
		}
	};

	for (const child of graph.children ?? []) {
		visit(child, 0, 0);
	}

	const edges = (graph.edges ?? []).flatMap((edge) => {
		const original = record.edges.find((candidate) => candidate.id === edge.id);
		return edgeToLayout(edge, original?.routingNote ?? null);
	});

	return {
		bounds: computeBounds(nodes),
		edges,
		mode,
		nodes,
	};
}

function layoutFallback(
	record: ProcessMapCanvasRecord,
	altitudeView: ReturnType<typeof computeProcessMapAltitudeView>,
	fogStates: ReadonlyMap<string, ProcessMapFogState>,
	direction: ElkDirection,
): LayoutResult {
	const childrenByParent = groupNodesByParent(record.nodes);
	const visibleEdgesList = visibleEdges(record, altitudeView);
	const rankByNodeId = rankVisibleNodes(record.nodes, visibleEdgesList);
	const nodes = new Map<string, LayoutNode>();
	const columns = new Map<number, SerializeDates<ProcessNode>[]>();

	for (const node of record.nodes) {
		if (!altitudeView.visibleNodeIds.has(node.id)) {
			continue;
		}

		const rank = rankByNodeId.get(node.id) ?? 0;
		const column = columns.get(rank) ?? [];
		column.push(node);
		columns.set(rank, column);
	}

	for (const [rank, column] of columns) {
		column.sort((left, right) => left.orderIndex - right.orderIndex);
		column.forEach((node, index) => {
			const visibleChildren = (childrenByParent.get(node.id) ?? []).filter(
				(child) => altitudeView.visibleNodeIds.has(child.id),
			);
			const isCollapsed = altitudeView.collapsedNodeIds.has(node.id);
			const hasVisibleChildren = visibleChildren.length > 0 && !isCollapsed;
			nodes.set(node.id, {
				aggregate: altitudeView.aggregatesByNodeId.get(node.id) ?? null,
				depth: altitudeView.depthByNodeId.get(node.id) ?? 1,
				fogState: fogStates.get(node.id) ?? "fog",
				hasVisibleChildren,
				height: hasVisibleChildren
					? 260
					: isCollapsed
						? collapsedHeight
						: leafHeight,
				isCollapsed,
				isFoggedRegion: isFoggedRegion(node.id, childrenByParent, fogStates),
				node,
				width: hasVisibleChildren
					? 320
					: isCollapsed
						? collapsedWidth
						: leafWidth,
				x: direction === "DOWN" ? 80 + index * 280 : 80 + rank * 360,
				y: direction === "DOWN" ? 80 + rank * 220 : 80 + index * 180,
			});
		});
	}

	return {
		bounds: computeBounds(nodes),
		edges: visibleEdgesList.flatMap((edge) => {
			const from = nodes.get(edge.fromNodeId);
			const to = nodes.get(edge.toNodeId);
			if (!from || !to) {
				return [];
			}

			return [
				{
					id: edge.id,
					label: edge.routingNote,
					points: [
						{ x: from.x + from.width, y: from.y + from.height / 2 },
						{ x: to.x, y: to.y + to.height / 2 },
					],
				},
			];
		}),
		mode: "fallback",
		nodes,
	};
}

function deriveFogStates(
	record: ProcessMapCanvasRecord,
): ReadonlyMap<string, ProcessMapFogState> {
	return new Map(
		record.nodes.map((node) => [node.id, deriveCanvasFogState(node)]),
	);
}

function deriveCanvasFogState(
	node: SerializeDates<ProcessNode>,
): ProcessMapFogState {
	const description = node.description?.trim() ?? "";
	const hasSubstantiveDescription =
		description.length > 0 && description.toLowerCase() !== "unexplored";

	if (!hasSubstantiveDescription) {
		return "fog";
	}

	if (node.sourceConfidence === "DIRECT") {
		return "clear";
	}

	if (node.sourceConfidence === "HEARSAY") {
		return "haze";
	}

	return "fog";
}

function visibleEdges(
	record: ProcessMapCanvasRecord,
	altitudeView: ReturnType<typeof computeProcessMapAltitudeView>,
): Array<SerializeDates<ProcessEdge>> {
	return record.edges.flatMap((edge) => {
		const fromNodeId = resolveVisibleNodeId(
			edge.fromNodeId,
			record.nodes,
			altitudeView.visibleNodeIds,
		);
		const toNodeId = resolveVisibleNodeId(
			edge.toNodeId,
			record.nodes,
			altitudeView.visibleNodeIds,
		);

		if (!fromNodeId || !toNodeId || fromNodeId === toNodeId) {
			return [];
		}

		return [{ ...edge, fromNodeId, toNodeId }];
	});
}

function resolveVisibleNodeId(
	nodeId: string,
	nodes: readonly SerializeDates<ProcessNode>[],
	visibleNodeIds: ReadonlySet<string>,
): string | null {
	const nodesById = new Map(nodes.map((node) => [node.id, node]));
	let current = nodesById.get(nodeId) ?? null;

	while (current) {
		if (visibleNodeIds.has(current.id)) {
			return current.id;
		}

		current = current.parentId
			? (nodesById.get(current.parentId) ?? null)
			: null;
	}

	return null;
}

function groupNodesByParent(
	nodes: readonly SerializeDates<ProcessNode>[],
): Map<string | null, Array<SerializeDates<ProcessNode>>> {
	const groups = new Map<string | null, Array<SerializeDates<ProcessNode>>>();

	for (const node of nodes) {
		const key = node.parentId ?? null;
		const group = groups.get(key) ?? [];
		group.push(node);
		groups.set(key, group);
	}

	for (const group of groups.values()) {
		group.sort((left, right) => {
			const delta = left.orderIndex - right.orderIndex;
			return delta === 0 ? left.name.localeCompare(right.name) : delta;
		});
	}

	return groups;
}

function isFoggedRegion(
	nodeId: string,
	childrenByParent: ReadonlyMap<
		string | null,
		readonly SerializeDates<ProcessNode>[]
	>,
	fogStates: ReadonlyMap<string, ProcessMapFogState>,
): boolean {
	const children = childrenByParent.get(nodeId) ?? [];

	return (
		children.length > 0 &&
		children.every((child) => fogStates.get(child.id) === "fog")
	);
}

function edgeToLayout(
	edge: ElkExtendedEdge,
	label: string | null,
): LayoutEdge[] {
	const section = edge.sections?.[0];
	if (!section) {
		return [];
	}

	return [
		{
			id: edge.id,
			label,
			points: [
				section.startPoint,
				...(section.bendPoints ?? []),
				section.endPoint,
			],
		},
	];
}

function computeBounds(nodes: ReadonlyMap<string, LayoutNode>) {
	if (nodes.size === 0) {
		return { height: 600, width: 900, x: 0, y: 0 };
	}

	const values = [...nodes.values()];
	const minX = Math.min(...values.map((node) => node.x));
	const minY = Math.min(...values.map((node) => node.y));
	const maxX = Math.max(...values.map((node) => node.x + node.width));
	const maxY = Math.max(...values.map((node) => node.y + node.height));

	return {
		height: maxY - minY,
		width: maxX - minX,
		x: minX,
		y: minY,
	};
}

function fitTransform(
	bounds: LayoutResult["bounds"],
	viewportSize: ViewportSize,
): Transform {
	if (viewportSize.width <= 0 || viewportSize.height <= 0) {
		return { k: 0.9, x: 80, y: 120 };
	}

	const topInset = viewportSize.width < smallViewportWidth ? 136 : 88;
	const usableWidth = Math.max(1, viewportSize.width - fitMargin * 2);
	const usableHeight = Math.max(1, viewportSize.height - topInset - fitMargin);
	const scale = clamp(
		Math.min(
			usableWidth / Math.max(bounds.width, 1),
			usableHeight / Math.max(bounds.height, 1),
		),
		minZoom,
		maxFitZoom,
	);

	return {
		k: scale,
		x: fitMargin + usableWidth / 2 - (bounds.x + bounds.width / 2) * scale,
		y: topInset + usableHeight / 2 - (bounds.y + bounds.height / 2) * scale,
	};
}

function panToNode(
	nodeId: string,
	nodes: readonly SerializeDates<ProcessNode>[],
	visibleNodeIds: ReadonlySet<string>,
	layout: LayoutResult | null,
	viewport: SVGSVGElement | null,
	setTransform: Dispatch<SetStateAction<Transform>>,
) {
	const visibleNodeId = resolveVisibleNodeId(nodeId, nodes, visibleNodeIds);
	const node = visibleNodeId ? layout?.nodes.get(visibleNodeId) : null;
	if (!node) {
		return;
	}

	centerOnWorldPoint(
		node.x + node.width / 2,
		node.y + node.height / 2,
		viewport,
		setTransform,
	);
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

function minimapViewBox(bounds: LayoutResult["bounds"]) {
	const pad = 80;
	return {
		height: bounds.height + pad * 2,
		width: bounds.width + pad * 2,
		x: bounds.x - pad,
		y: bounds.y - pad,
	};
}

function renderRegion(node: LayoutNode, selectedNodeId: string | null) {
	if (!node.hasVisibleChildren) {
		return null;
	}

	return (
		<g data-node-id={node.node.id} key={`region-${node.node.id}`}>
			<rect
				fill={
					node.isFoggedRegion
						? "rgba(42,43,47,0.68)"
						: "rgba(28,28,33,0.72)"
				}
				filter="url(#pm-soft-shadow)"
				height={node.height}
				rx="30"
				stroke={
					selectedNodeId === node.node.id
						? "#e4e4e8"
						: node.isFoggedRegion
							? "#f59e0b"
							: "#3f465e"
				}
				strokeDasharray={node.isFoggedRegion ? "9 8" : undefined}
				strokeWidth={selectedNodeId === node.node.id ? 4 : 2}
				width={node.width}
				x={node.x}
				y={node.y}
			/>
			{node.isFoggedRegion ? (
				<>
					<rect
						fill="rgba(215,218,222,0.36)"
						height={node.height}
						rx="30"
						width={node.width}
						x={node.x}
						y={node.y}
					/>
					<use
						href="#pm-fog-puff"
						pointerEvents="none"
						transform={`translate(${node.x + node.width - 70} ${node.y + 8}) scale(0.72)`}
					/>
					<use
						href="#pm-fog-puff"
						opacity="0.54"
						pointerEvents="none"
						transform={`translate(${node.x + node.width - 32} ${node.y - 20}) scale(0.58)`}
					/>
				</>
			) : null}
		</g>
	);
}

function renderRegionLabel(node: LayoutNode) {
	if (!node.hasVisibleChildren) {
		return null;
	}

	return (
		<g key={`region-label-${node.node.id}`} pointerEvents="none">
			<text
				fill="#e4e4e8"
				fontSize="16"
				fontWeight="700"
				x={node.x + 26}
				y={node.y + 34}
			>
				{truncate(node.node.name, 34)}
			</text>
		</g>
	);
}

function renderNodeBox(
	node: LayoutNode,
	selectedNodeId: string | null,
	setSelectedNodeId: (nodeId: string) => void,
) {
	if (node.hasVisibleChildren) {
		return null;
	}

	const stroke =
		selectedNodeId === node.node.id
			? "#e4e4e8"
			: node.fogState === "fog"
				? "#f59e0b"
				: node.fogState === "haze"
					? "#8e8e9a"
					: "#4b587c";
	const fill =
		node.fogState === "fog"
			? "rgba(42,43,47,0.96)"
			: node.fogState === "haze"
				? "rgba(34,34,39,0.86)"
				: "rgba(25,28,36,0.96)";
	const contentTone =
		node.fogState === "fog"
			? "opacity-60 grayscale"
			: node.fogState === "haze"
				? "opacity-85 grayscale"
				: "";

	return (
		<g
			data-node-id={node.node.id}
			key={`box-${node.node.id}`}
			onPointerDown={(event) => {
				event.stopPropagation();
				setSelectedNodeId(node.node.id);
			}}
			style={{ cursor: "pointer" }}
		>
			<rect
				fill={fill}
				filter="url(#pm-soft-shadow)"
				height={node.height}
				rx="12"
				stroke={stroke}
				strokeDasharray={node.fogState === "haze" ? "7 6" : undefined}
				strokeWidth={selectedNodeId === node.node.id ? 4 : 2}
				width={node.width}
				x={node.x}
				y={node.y}
			/>
			{node.fogState === "fog" ? (
				<>
					<rect
						fill="rgba(215,218,222,0.55)"
						height={node.height}
						rx="12"
						width={node.width}
						x={node.x}
						y={node.y}
					/>
					<use
						href="#pm-fog-puff"
						pointerEvents="none"
						transform={`translate(${node.x + node.width - 48} ${node.y - 14}) scale(0.46)`}
					/>
					<use
						href="#pm-fog-puff"
						opacity="0.54"
						pointerEvents="none"
						transform={`translate(${node.x + node.width - 24} ${node.y + 16}) scale(0.36)`}
					/>
				</>
			) : node.fogState === "haze" ? (
				<use
					href="#pm-fog-puff"
					opacity="0.28"
					pointerEvents="none"
					transform={`translate(${node.x + node.width - 44} ${node.y - 10}) scale(0.34)`}
				/>
			) : null}
			<foreignObject
				height={node.height}
				pointerEvents="none"
				width={node.width}
				x={node.x}
				y={node.y}
			>
				<div className="flex h-full flex-col justify-between gap-2 p-3 text-left">
					<div className={contentTone}>
						<div className="text-sm font-semibold leading-tight text-[var(--color-text)]">
							{node.node.name}
						</div>
						<div className="mt-1 text-[11px] uppercase tracking-normal text-[var(--color-muted)]">
							{node.isCollapsed
								? "Collapsed region"
								: node.node.kind.toLowerCase()}
						</div>
					</div>
					{node.isCollapsed && node.aggregate ? (
						<div className="flex flex-wrap gap-1">
							<Badge label={`${node.aggregate.childBlockCount} blocks`} />
							<Badge label={`${node.aggregate.peopleCount} people`} />
							<Badge
								label={`${Math.round(node.aggregate.fogShare * 100)}% fog`}
							/>
						</div>
					) : (
						<StateChip fogState={node.fogState} who={node.node.whoWouldKnow} />
					)}
				</div>
			</foreignObject>
		</g>
	);
}

function StateChip({
	fogState,
	who,
}: {
	fogState: ProcessMapFogState;
	who: string | null;
}) {
	if (fogState === "clear") {
		return <Badge label="clear" tone="clear" />;
	}

	if (fogState === "haze") {
		return <Badge label={`ask ${who || "owner"}`} tone="haze" />;
	}

	return <Badge label={`quest: ask ${who || "who knows"}`} tone="fog" />;
}

function Badge({
	label,
	tone = "default",
}: {
	label: string;
	tone?: "clear" | "default" | "fog" | "haze";
}) {
	const className =
		tone === "fog"
			? "border-amber-500/70 bg-amber-500/15 text-amber-200"
			: tone === "haze"
				? "border-zinc-400/60 bg-zinc-400/10 text-zinc-200"
				: tone === "clear"
					? "border-emerald-400/60 bg-emerald-400/10 text-emerald-200"
					: "border-[var(--color-border)] bg-[rgba(255,255,255,0.04)] text-[var(--color-muted)]";

	return (
		<span
			className={`inline-flex rounded-full border px-1.5 py-0.5 text-[10px] ${className}`}
		>
			{label}
		</span>
	);
}

function renderEdge(edge: LayoutEdge, zoom: number) {
	if (edge.points.length < 2) {
		return null;
	}

	const mid = edge.points[Math.floor(edge.points.length / 2)];

	return (
		<g key={edge.id} pointerEvents="none">
			<path
				d={toPath(edge.points)}
				fill="none"
				markerEnd="url(#pm-arrow)"
				stroke="#9ca3af"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="2.5"
			/>
			{edge.label && zoom > 0.62 ? (
				<g>
					<rect
						fill="rgba(16,17,19,0.88)"
						height="22"
						rx="6"
						stroke="rgba(156,163,175,0.28)"
						width={Math.min(180, 18 + edge.label.length * 6)}
						x={mid.x + 8}
						y={mid.y - 20}
					/>
					<text fill="#cbd5e1" fontSize="11" x={mid.x + 16} y={mid.y - 5}>
						{truncate(edge.label, 28)}
					</text>
				</g>
			) : null}
		</g>
	);
}

function toPath(points: Array<{ x: number; y: number }>): string {
	const [first, ...rest] = points;
	if (!first) {
		return "";
	}

	return `M ${first.x} ${first.y} ${rest.map((point) => `L ${point.x} ${point.y}`).join(" ")}`;
}

function rankVisibleNodes(
	nodes: readonly SerializeDates<ProcessNode>[],
	edges: readonly SerializeDates<ProcessEdge>[],
): ReadonlyMap<string, number> {
	const visibleIds = new Set(nodes.map((node) => node.id));
	const rankByNodeId = new Map(nodes.map((node) => [node.id, 0]));

	for (let pass = 0; pass < nodes.length; pass += 1) {
		let changed = false;
		for (const edge of edges) {
			if (!visibleIds.has(edge.fromNodeId) || !visibleIds.has(edge.toNodeId)) {
				continue;
			}

			const fromRank = rankByNodeId.get(edge.fromNodeId) ?? 0;
			const toRank = rankByNodeId.get(edge.toNodeId) ?? 0;
			if (fromRank + 1 > toRank && fromRank < nodes.length) {
				rankByNodeId.set(edge.toNodeId, fromRank + 1);
				changed = true;
			}
		}
		if (!changed) {
			break;
		}
	}

	return rankByNodeId;
}

function truncate(value: string, length: number): string {
	return value.length <= length
		? value
		: `${value.slice(0, Math.max(0, length - 1))}...`;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, value));
}
