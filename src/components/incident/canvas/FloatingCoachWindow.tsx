"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentStructuredOperation } from "../../../lib/agent/types";
import type { CoachChatMessage } from "../../../lib/incident/coach-chat";
import PushToTalkButton from "../coach/PushToTalkButton";
import { resolveCoachCopy } from "../coach/copy";
import type { IncidentCanvasCoach } from "./useIncidentCanvasCoach";

export type CanvasCoachFocus = {
	readonly id: string;
	readonly title: string;
};

export type CanvasCoachPrefill = {
	readonly nonce: number;
	readonly text: string;
};

type WindowGeometry = {
	height: number;
	width: number;
	x: number;
	y: number;
};

type PersistedWindowState = WindowGeometry & {
	collapsed: boolean;
	mobileSnap: "half" | "peek";
};

const minWidth = 320;
const minHeight = 300;
const defaultWidth = 380;
const defaultHeight = 480;
const mobilePeekHeight = 120;

export default function FloatingCoachWindow({
	coach,
	focus,
	initialAsk,
	incidentId,
	locale,
	mapGhostOperationIds,
	onClearFocus,
	onMobileSheetHeightChange,
	prefillRequest,
	userStorageId,
}: {
	coach: IncidentCanvasCoach;
	focus: CanvasCoachFocus | null;
	initialAsk?: string;
	incidentId: string;
	locale: string;
	mapGhostOperationIds: ReadonlySet<string>;
	onClearFocus: () => void;
	onMobileSheetHeightChange: (height: number) => void;
	prefillRequest: CanvasCoachPrefill | null;
	userStorageId: string;
}) {
	const copy = resolveCoachCopy(locale);
	const storageKey = `safetysecretary:ii-coach-window:v1:${userStorageId}`;
	const [input, setInput] = useState(initialAsk ?? "");
	const [geometry, setGeometry] = useState<WindowGeometry>({
		height: defaultHeight,
		width: defaultWidth,
		x: 16,
		y: 96,
	});
	const [collapsed, setCollapsed] = useState(false);
	const [mobileSnap, setMobileSnap] = useState<"half" | "peek">("peek");
	const [mobileDragHeight, setMobileDragHeight] = useState<number | null>(null);
	const [isMobile, setIsMobile] = useState(false);
	const [responsiveReady, setResponsiveReady] = useState(false);
	const [unreadCount, setUnreadCount] = useState(0);
	const [hydrated, setHydrated] = useState(false);
	const [drag, setDrag] = useState<{
		startX: number;
		startY: number;
		originX: number;
		originY: number;
	} | null>(null);
	const [resize, setResize] = useState<{
		startX: number;
		startY: number;
		originWidth: number;
		originHeight: number;
	} | null>(null);
	const [mobileDrag, setMobileDrag] = useState<{
		startY: number;
		originHeight: number;
	} | null>(null);
	const composerRef = useRef<HTMLTextAreaElement | null>(null);
	const scrollRef = useRef<HTMLDivElement | null>(null);
	const knownAssistantIdsRef = useRef<Set<string> | null>(null);
	const initialAskAppliedRef = useRef(false);

	const halfHeight =
		typeof window === "undefined"
			? 420
			: Math.max(300, Math.round(window.innerHeight * 0.5));
	const mobileHeight =
		mobileDragHeight ?? (mobileSnap === "peek" ? mobilePeekHeight : halfHeight);

	useEffect(() => {
		const media = window.matchMedia("(max-width: 479px)");
		const update = () => {
			setIsMobile(media.matches);
			setResponsiveReady(true);
		};
		update();
		media.addEventListener("change", update);
		return () => media.removeEventListener("change", update);
	}, []);

	useEffect(() => {
		const fallback = defaultGeometry();
		let restored = fallback;
		let restoredCollapsed = false;
		let restoredMobileSnap: "half" | "peek" = "peek";
		try {
			const raw = window.localStorage.getItem(storageKey);
			const parsed = raw ? parsePersistedState(JSON.parse(raw)) : null;
			if (parsed) {
				restored = window.matchMedia("(max-width: 479px)").matches
					? parsed
					: clampGeometry(parsed);
				restoredCollapsed = parsed.collapsed;
				restoredMobileSnap = parsed.mobileSnap;
			}
		} catch {
			// Ignore malformed or unavailable storage and use the safe default.
		}
		setGeometry(restored);
		setCollapsed(restoredCollapsed);
		setMobileSnap(restoredMobileSnap);
		setHydrated(true);
	}, [storageKey]);

	useEffect(() => {
		if (!hydrated) {
			return;
		}
		const value: PersistedWindowState = {
			...geometry,
			collapsed,
			mobileSnap,
		};
		try {
			window.localStorage.setItem(storageKey, JSON.stringify(value));
		} catch {
			// A private browser may deny storage; the window remains usable.
		}
	}, [collapsed, geometry, hydrated, mobileSnap, storageKey]);

	useEffect(() => {
		if (!responsiveReady || isMobile) {
			return;
		}
		setGeometry((current) => clampGeometry(current));
		function onResize() {
			if (window.matchMedia("(max-width: 479px)").matches) {
				return;
			}
			setGeometry((current) => clampGeometry(current));
		}
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, [isMobile, responsiveReady]);

	useEffect(() => {
		onMobileSheetHeightChange(isMobile ? mobileHeight : 0);
	}, [isMobile, mobileHeight, onMobileSheetHeightChange]);

	useEffect(() => {
		if (!prefillRequest) {
			return;
		}
		setInput(prefillRequest.text.slice(0, 300));
		setCollapsed(false);
		if (isMobile) {
			setMobileSnap("half");
		}
		requestAnimationFrame(() => composerRef.current?.focus());
	}, [isMobile, prefillRequest]);

	useEffect(() => {
		if (!hydrated || !initialAsk || initialAskAppliedRef.current) {
			return;
		}
		initialAskAppliedRef.current = true;
		setInput(initialAsk.slice(0, 300));
		setCollapsed(false);
		if (isMobile) {
			setMobileSnap("half");
		}
		requestAnimationFrame(() => composerRef.current?.focus());
	}, [hydrated, initialAsk, isMobile]);

	useEffect(() => {
		const assistantIds = new Set(
			coach.messages
				.filter((message) => message.role === "assistant")
				.map((message) => message.id),
		);
		const known = knownAssistantIdsRef.current;
		if (known && collapsed) {
			let additions = 0;
			for (const id of assistantIds) {
				if (!known.has(id)) {
					additions += 1;
				}
			}
			if (additions > 0) {
				setUnreadCount((current) => current + additions);
			}
		}
		knownAssistantIdsRef.current = assistantIds;
	}, [coach.messages, collapsed]);

	useEffect(() => {
		if (!collapsed) {
			setUnreadCount(0);
		}
	}, [collapsed]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: scroll after message and sending-state changes.
	useEffect(() => {
		scrollRef.current?.scrollTo({
			behavior: "smooth",
			top: scrollRef.current.scrollHeight,
		});
	}, [coach.messages.length, coach.sending]);

	useEffect(() => {
		if (!drag && !resize && !mobileDrag) {
			return;
		}

		function onPointerMove(event: PointerEvent) {
			if (drag) {
				setGeometry((current) =>
					clampGeometry({
						...current,
						x: drag.originX + event.clientX - drag.startX,
						y: drag.originY + event.clientY - drag.startY,
					}),
				);
			}
			if (resize) {
				setGeometry((current) =>
					clampGeometry({
						...current,
						height: resize.originHeight + event.clientY - resize.startY,
						width: resize.originWidth + event.clientX - resize.startX,
					}),
				);
			}
			if (mobileDrag) {
				setMobileDragHeight(
					clamp(
						mobileDrag.originHeight + mobileDrag.startY - event.clientY,
						mobilePeekHeight,
						halfHeight,
					),
				);
			}
		}

		function onPointerEnd() {
			if (mobileDrag && mobileDragHeight !== null) {
				const midpoint = (mobilePeekHeight + halfHeight) / 2;
				setMobileSnap(mobileDragHeight >= midpoint ? "half" : "peek");
			}
			setDrag(null);
			setResize(null);
			setMobileDrag(null);
			setMobileDragHeight(null);
		}

		window.addEventListener("pointermove", onPointerMove);
		window.addEventListener("pointerup", onPointerEnd, { once: true });
		window.addEventListener("pointercancel", onPointerEnd, { once: true });
		return () => {
			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("pointerup", onPointerEnd);
			window.removeEventListener("pointercancel", onPointerEnd);
		};
	}, [drag, halfHeight, mobileDrag, mobileDragHeight, resize]);

	const appendTranscript = useCallback((text: string) => {
		const addition = text.trim();
		if (!addition) {
			return;
		}
		setInput((current) =>
			current.trim() ? `${current.trimEnd()} ${addition}` : addition,
		);
		composerRef.current?.focus();
	}, []);

	const compactOperationsByMessage = useMemo(() => {
		const map = new Map<string, AgentStructuredOperation[]>();
		for (const { message, operation } of coach.pendingOperations) {
			if (
				!isCanvasGhostOperation(operation) ||
				!mapGhostOperationIds.has(operation.id)
			) {
				map.set(message.id, [...(map.get(message.id) ?? []), operation]);
			}
		}
		return map;
	}, [coach.pendingOperations, mapGhostOperationIds]);

	async function send() {
		const plain = input.trim();
		if (!plain || coach.sending) {
			return;
		}
		const outgoing = focus ? `About "${focus.title}": ${plain}` : plain;
		setInput("");
		const sent = await coach.submitMessage(outgoing);
		if (!sent) {
			setInput(plain);
		}
		requestAnimationFrame(() => composerRef.current?.focus());
	}

	function expand() {
		setCollapsed(false);
		requestAnimationFrame(() => composerRef.current?.focus());
	}

	if (!isMobile && collapsed) {
		return (
			<button
				className="absolute z-40 inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-sm font-medium text-[var(--color-text)] shadow-xl hover:border-[var(--color-accent)]"
				data-coach-collapsed-pill=""
				onClick={expand}
				style={{ left: geometry.x, top: geometry.y }}
				type="button"
			>
				<span aria-hidden="true">✦</span> Coach
				{unreadCount > 0 ? (
					<span className="grid min-w-5 place-items-center rounded-full bg-[var(--color-accent)] px-1 text-[11px] text-white">
						{unreadCount}
					</span>
				) : null}
			</button>
		);
	}

	const windowStyle = isMobile
		? { height: mobileHeight }
		: {
				height: geometry.height,
				left: geometry.x,
				top: geometry.y,
				width: geometry.width,
			};

	return (
		<section
			aria-label="Incident coach"
			className={`absolute z-40 flex flex-col overflow-hidden border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] shadow-2xl backdrop-blur ${
				isMobile
					? "bottom-0 left-0 w-full rounded-t-xl border-b-0"
					: "rounded-lg"
			}`}
			data-coach-mobile-snap={isMobile ? mobileSnap : undefined}
			data-floating-coach-window=""
			style={windowStyle}
		>
			{isMobile ? (
				<button
					aria-label="Drag to resize coach sheet"
					className="grid h-5 shrink-0 touch-none place-items-center bg-transparent"
					data-coach-mobile-handle=""
					onPointerDown={(event) => {
						event.preventDefault();
						setMobileDrag({
							originHeight: mobileHeight,
							startY: event.clientY,
						});
					}}
					type="button"
				>
					<span className="h-1 w-10 rounded-full bg-[var(--color-border)]" />
				</button>
			) : null}
			<header
				className={`flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-border)] px-3 py-2 ${
					isMobile ? "" : "cursor-move touch-none"
				}`}
				data-coach-drag-handle=""
				onPointerDown={(event) => {
					if (isMobile || (event.target as Element).closest("button")) {
						return;
					}
					event.preventDefault();
					setDrag({
						originX: geometry.x,
						originY: geometry.y,
						startX: event.clientX,
						startY: event.clientY,
					});
				}}
			>
				<div className="min-w-0">
					<h2 className="m-0 text-sm font-semibold">Investigation coach</h2>
					{coach.activity ? (
						<p className="m-0 truncate text-[11px] text-[var(--color-muted)]">
							{coach.activity}
						</p>
					) : null}
				</div>
				<div className="flex shrink-0 items-center gap-2">
					{coach.pendingOperations.length > 0 ? (
						<button
							className="rounded-full border border-[var(--color-accent)] px-2 py-1 text-[11px] font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-white disabled:opacity-60"
							data-coach-review-all=""
							disabled={coach.bulkApplying}
							onClick={() => void coach.applyAllPending()}
							type="button"
						>
							{coach.bulkApplying ? "Reviewing…" : "Review all"} (
							{coach.pendingOperations.length})
						</button>
					) : null}
					{!isMobile ? (
						<button
							aria-label="Collapse coach"
							className="grid size-8 place-items-center rounded border border-[var(--color-border)] text-sm hover:border-[var(--color-accent)]"
							onClick={() => setCollapsed(true)}
							type="button"
						>
							—
						</button>
					) : null}
				</div>
			</header>

			{!isMobile || mobileSnap === "half" || mobileDragHeight !== null ? (
				<div
					className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3"
					data-coach-message-history=""
					ref={scrollRef}
				>
					{coach.loaded && coach.messages.length === 0 ? (
						<p className="m-0 text-xs text-[var(--color-muted)]">
							Ask what to investigate next or describe what you learned.
						</p>
					) : null}
					{coach.messages.map((message) => (
						<CompactMessage
							bulkApplying={coach.bulkApplying}
							busyOperationIds={coach.busyOperationIds}
							compactOperations={
								compactOperationsByMessage.get(message.id) ?? []
							}
							key={message.id}
							message={message}
							onApply={(operation) =>
								void coach.decide(message, operation, "apply")
							}
							onDismiss={(operation) =>
								void coach.decide(message, operation, "dismiss")
							}
						/>
					))}
					{coach.sending ? (
						<p className="m-0 text-xs text-[var(--color-muted)]">
							Coach is working…
						</p>
					) : null}
				</div>
			) : null}

			<div className="shrink-0 border-t border-[var(--color-border)] p-2">
				{focus && (!isMobile || mobileSnap === "half") ? (
					<div
						className="mb-2 flex max-w-full items-center gap-1 rounded-full border border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] px-2 py-1 text-[11px]"
						data-coach-focus-chip=""
					>
						<span className="truncate">About: {focus.title}</span>
						<button
							aria-label="Clear conversational focus"
							className="ml-auto grid size-5 shrink-0 place-items-center rounded-full hover:bg-black/10"
							onClick={onClearFocus}
							type="button"
						>
							×
						</button>
					</div>
				) : null}
				<div className="flex items-end gap-2">
					{focus && isMobile && mobileSnap === "peek" ? (
						<div
							className="flex max-w-20 shrink-0 items-center gap-1 rounded-full border border-[var(--color-accent)] px-2 py-1 text-[10px]"
							data-coach-focus-chip=""
							title={`About: ${focus.title}`}
						>
							<span className="truncate">About: {focus.title}</span>
							<button
								aria-label="Clear conversational focus"
								className="shrink-0"
								onClick={onClearFocus}
								type="button"
							>
								×
							</button>
						</div>
					) : null}
					<textarea
						aria-label="Message the investigation coach"
						className="min-h-11 min-w-0 flex-1 resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
						data-coach-composer=""
						disabled={coach.sending}
						onChange={(event) => setInput(event.currentTarget.value)}
						onKeyDown={(event) => {
							if (event.key === "Enter" && !event.shiftKey) {
								event.preventDefault();
								void send();
							}
						}}
						onFocus={() => {
							if (isMobile && mobileSnap === "peek") {
								setMobileSnap("half");
							}
						}}
						placeholder="Tell the coach what you learned…"
						ref={composerRef}
						rows={isMobile && mobileSnap === "peek" ? 1 : 2}
						value={input}
					/>
					<PushToTalkButton
						copy={copy}
						disabled={coach.sending}
						incidentId={incidentId}
						onTranscript={appendTranscript}
					/>
					<button
						className="inline-flex min-h-11 items-center justify-center rounded-md bg-[var(--color-accent)] px-3 text-sm font-medium text-white disabled:opacity-60"
						disabled={coach.sending || !input.trim()}
						onClick={() => void send()}
						type="button"
					>
						Send
					</button>
				</div>
				{coach.error ? (
					<p className="m-0 mt-1 text-xs text-[var(--color-danger)]">
						{coach.error}
					</p>
				) : null}
			</div>

			{!isMobile ? (
				<button
					aria-label="Resize coach window"
					className="absolute bottom-0 right-0 size-5 cursor-nwse-resize touch-none bg-transparent after:absolute after:bottom-1 after:right-1 after:size-2 after:border-b-2 after:border-r-2 after:border-[var(--color-muted)]"
					data-coach-resize-handle=""
					onPointerDown={(event) => {
						event.preventDefault();
						setResize({
							originHeight: geometry.height,
							originWidth: geometry.width,
							startX: event.clientX,
							startY: event.clientY,
						});
					}}
					type="button"
				/>
			) : null}
		</section>
	);
}

function CompactMessage({
	bulkApplying,
	busyOperationIds,
	compactOperations,
	message,
	onApply,
	onDismiss,
}: {
	bulkApplying: boolean;
	busyOperationIds: ReadonlySet<string>;
	compactOperations: readonly AgentStructuredOperation[];
	message: CoachChatMessage;
	onApply: (operation: AgentStructuredOperation) => void;
	onDismiss: (operation: AgentStructuredOperation) => void;
}) {
	const isUser = message.role === "user";
	return (
		<div className={`grid gap-2 ${isUser ? "justify-items-end" : ""}`}>
			<div
				className={`max-w-[92%] whitespace-pre-wrap rounded-md px-2.5 py-2 text-xs leading-5 ${
					isUser
						? "bg-[var(--color-accent)] text-white"
						: "border border-[var(--color-border)] bg-[var(--color-surface-elev)]"
				}`}
			>
				{message.content}
			</div>
			{compactOperations.map((operation) => {
				const busy = bulkApplying || busyOperationIds.has(operation.id);
				return (
					<div
						className="w-full rounded-md border border-dashed border-[var(--color-accent)] bg-[var(--color-surface-elev)] p-2"
						data-coach-inline-proposal={operation.kind}
						key={operation.id}
					>
						<p className="m-0 text-[10px] font-medium uppercase tracking-wide text-[var(--color-accent)]">
							{operationLabel(operation)}
						</p>
						<p className="m-0 mt-1 text-xs leading-5">
							{operationPrimaryText(operation)}
						</p>
						<div className="mt-2 flex gap-2">
							<button
								className="rounded bg-[var(--color-accent)] px-2 py-1 text-[11px] text-white disabled:opacity-60"
								disabled={busy}
								onClick={() => onApply(operation)}
								type="button"
							>
								Accept
							</button>
							<button
								className="rounded border border-[var(--color-border)] px-2 py-1 text-[11px] disabled:opacity-60"
								disabled={busy}
								onClick={() => onDismiss(operation)}
								type="button"
							>
								Dismiss
							</button>
						</div>
					</div>
				);
			})}
		</div>
	);
}

export function isCanvasGhostOperation(
	operation: AgentStructuredOperation,
): boolean {
	return (
		operation.kind === "cause_node" ||
		operation.kind === "timeline_event" ||
		operation.kind === "fact" ||
		operation.kind === "stop_action"
	);
}

function operationLabel(operation: AgentStructuredOperation): string {
	switch (operation.kind) {
		case "incident_field_update":
			return "Record detail";
		case "cause_update":
			return "Cause update";
		case "hira_followup_note":
			return "Risk assessment follow-up";
		default:
			return operation.kind.replaceAll("_", " ");
	}
}

function operationPrimaryText(operation: AgentStructuredOperation): string {
	if (operation.kind === "incident_field_update") {
		return `${operation.payload.field}: ${String(operation.payload.value ?? "cleared")}`;
	}
	if (operation.kind === "cause_update") {
		return operation.payload.statement ?? "Update the selected cause status.";
	}
	const payload = operation.payload as unknown as Record<string, unknown>;
	for (const key of ["value", "narrative", "label", "title", "note", "text"]) {
		const value = payload[key];
		if (typeof value === "string" && value.trim()) {
			return value;
		}
		if (typeof value === "number") {
			return String(value);
		}
	}
	return "Review this proposed record change.";
}

function defaultGeometry(): WindowGeometry {
	const width = Math.min(
		defaultWidth,
		Math.max(minWidth, window.innerWidth - 32),
	);
	const height = Math.min(
		defaultHeight,
		Math.max(minHeight, window.innerHeight - 112),
	);
	return {
		height,
		width,
		x: 16,
		y: Math.max(84, window.innerHeight - height - 16),
	};
}

function clampGeometry(value: WindowGeometry): WindowGeometry {
	const maxWidth = Math.max(minWidth, window.innerWidth - 16);
	const maxHeight = Math.max(minHeight, window.innerHeight - 16);
	const width = clamp(value.width, minWidth, maxWidth);
	const height = clamp(value.height, minHeight, maxHeight);
	return {
		height,
		width,
		x: clamp(value.x, 0, Math.max(0, window.innerWidth - width)),
		y: clamp(value.y, 0, Math.max(0, window.innerHeight - height)),
	};
}

function parsePersistedState(value: unknown): PersistedWindowState | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const candidate = value as Partial<PersistedWindowState>;
	if (
		![candidate.height, candidate.width, candidate.x, candidate.y].every(
			(value) => typeof value === "number" && Number.isFinite(value),
		)
	) {
		return null;
	}
	return {
		collapsed: candidate.collapsed === true,
		height: candidate.height as number,
		mobileSnap: candidate.mobileSnap === "half" ? "half" : "peek",
		width: candidate.width as number,
		x: candidate.x as number,
		y: candidate.y as number,
	};
}

function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(maximum, Math.max(minimum, value));
}
