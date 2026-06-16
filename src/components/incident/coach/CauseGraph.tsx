"use client";

import { useMemo, useState } from "react";
import { CSRF_COOKIE_NAME } from "../../../lib/auth/cookies";
import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
import {
	type LaidNodeStatus,
	layoutCauseTree,
	NODE_H,
	NODE_W,
} from "../../../lib/incident/cause-tree-layout";
import type { ManualIncidentRecordChange } from "../../../lib/incident/coach-consistency";
import type {
	IncidentRecord,
	RecordCauseBranchStatus,
	RecordCauseNode,
} from "./types";

// On-screen (dark-theme) renderer for the cause tree. The layout itself lives
// in lib/incident/cause-tree-layout.ts and is shared with the export SVG, so
// the diagram you see and the one in the report can never drift apart. This
// component only owns the dark palette, collapse state, and the SVG/HTML
// rendering. Editing still lives in the Causes/Actions tabs.

type MenuLabels = {
	menu: string;
	edit: string;
	addWhy: string;
	markRoot: string;
	unmarkRoot: string;
	park: string;
	unpark: string;
	moveUnder: string;
	topLevel: string;
	delete: string;
	deleteConfirm: string;
	save: string;
	cancel: string;
	editPlaceholder: string;
	addPlaceholder: string;
};

const LABELS: Record<
	string,
	{
		method: string;
		empty: string;
		legend: Record<string, string>;
		menu: MenuLabels;
	}
> = {
	en: {
		method: "Method",
		empty: "No causes recorded yet.",
		legend: {
			event: "Event",
			open: "Open",
			root: "Root cause",
			parked: "Parked",
			measure: "Measure",
		},
		menu: {
			menu: "Cause actions",
			edit: "Edit statement",
			addWhy: "Add why",
			markRoot: "Mark as root",
			unmarkRoot: "Unmark root",
			park: "Park",
			unpark: "Unpark",
			moveUnder: "Move under…",
			topLevel: "Top level",
			delete: "Delete",
			deleteConfirm: "Delete this cause?",
			save: "Save",
			cancel: "Cancel",
			editPlaceholder: "Cause statement",
			addPlaceholder: "Why did this happen?",
		},
	},
	de: {
		method: "Methode",
		empty: "Noch keine Ursachen erfasst.",
		legend: {
			event: "Ereignis",
			open: "Offen",
			root: "Grundursache",
			parked: "Geparkt",
			measure: "Massnahme",
		},
		menu: {
			menu: "Ursachen-Aktionen",
			edit: "Aussage bearbeiten",
			addWhy: "Warum hinzufügen",
			markRoot: "Als Grundursache markieren",
			unmarkRoot: "Markierung aufheben",
			park: "Parken",
			unpark: "Entparken",
			moveUnder: "Verschieben unter…",
			topLevel: "Oberste Ebene",
			delete: "Löschen",
			deleteConfirm: "Diese Ursache löschen?",
			save: "Speichern",
			cancel: "Abbrechen",
			editPlaceholder: "Ursachen-Aussage",
			addPlaceholder: "Warum ist das passiert?",
		},
	},
	fr: {
		method: "Méthode",
		empty: "Aucune cause enregistrée pour l'instant.",
		legend: {
			event: "Événement",
			open: "Ouvert",
			root: "Cause racine",
			parked: "En attente",
			measure: "Mesure",
		},
		menu: {
			menu: "Actions sur la cause",
			edit: "Modifier l'énoncé",
			addWhy: "Ajouter un pourquoi",
			markRoot: "Marquer comme cause racine",
			unmarkRoot: "Retirer la marque",
			park: "Mettre en attente",
			unpark: "Réactiver",
			moveUnder: "Déplacer sous…",
			topLevel: "Niveau supérieur",
			delete: "Supprimer",
			deleteConfirm: "Supprimer cette cause ?",
			save: "Enregistrer",
			cancel: "Annuler",
			editPlaceholder: "Énoncé de la cause",
			addPlaceholder: "Pourquoi est-ce arrivé ?",
		},
	},
	it: {
		method: "Metodo",
		empty: "Nessuna causa ancora registrata.",
		legend: {
			event: "Evento",
			open: "Aperto",
			root: "Causa radice",
			parked: "In sospeso",
			measure: "Misura",
		},
		menu: {
			menu: "Azioni sulla causa",
			edit: "Modifica enunciato",
			addWhy: "Aggiungi perché",
			markRoot: "Segna come causa radice",
			unmarkRoot: "Rimuovi marcatura",
			park: "Sospendi",
			unpark: "Riattiva",
			moveUnder: "Sposta sotto…",
			topLevel: "Livello superiore",
			delete: "Elimina",
			deleteConfirm: "Eliminare questa causa?",
			save: "Salva",
			cancel: "Annulla",
			editPlaceholder: "Enunciato della causa",
			addPlaceholder: "Perché è successo?",
		},
	},
};

function labelsFor(locale: string) {
	return LABELS[locale.split("-")[0]?.toLowerCase() ?? "en"] ?? LABELS.en;
}

const STATUS_STYLE: Record<
	LaidNodeStatus,
	{ border: string; bg: string; dot: string }
> = {
	event: {
		border: "var(--color-accent)",
		bg: "var(--color-surface-elev)",
		dot: "var(--color-danger)",
	},
	open: {
		border: "var(--color-border)",
		bg: "var(--color-surface)",
		dot: "var(--color-muted)",
	},
	root: {
		border: "var(--color-accent)",
		bg: "var(--color-surface)",
		dot: "var(--color-accent)",
	},
	parked: {
		border: "var(--color-muted)",
		bg: "var(--color-surface)",
		dot: "var(--color-muted)",
	},
	treated: {
		border: "var(--color-border)",
		bg: "var(--color-surface-elev)",
		dot: "var(--color-accent)",
	},
};

export default function CauseGraph({
	record,
	locale,
	method,
	incidentId,
	onRecordChange,
	onManualRecordChange,
}: {
	readonly record: IncidentRecord;
	readonly locale: string;
	readonly method?: string;
	readonly incidentId?: string;
	readonly onRecordChange?: () => void;
	readonly onManualRecordChange?: (change: ManualIncidentRecordChange) => void;
}) {
	const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
	// Editing state (only used when incidentId is present). `menuId` is the
	// open ⋯ dropdown; `editing`/`adding` drive the inline text input; `moving`
	// opens the "Move under…" submenu; `confirmingDeleteId` gates the delete.
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [menuId, setMenuId] = useState<string | null>(null);
	const [editing, setEditing] = useState<{
		nodeId: string;
		text: string;
	} | null>(null);
	const [adding, setAdding] = useState<{
		parentId: string;
		text: string;
	} | null>(null);
	const [movingId, setMovingId] = useState<string | null>(null);
	const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
		null,
	);
	const labels = labelsFor(locale);
	const menu = labels.menu;
	const editable = Boolean(incidentId);
	const causeById = useMemo(
		() => new Map((record.causes ?? []).map((c) => [c.id, c])),
		[record.causes],
	);

	function closeMenus() {
		setMenuId(null);
		setEditing(null);
		setAdding(null);
		setMovingId(null);
		setConfirmingDeleteId(null);
	}

	async function mutate(
		body: Record<string, unknown>,
		httpMethod: "POST" | "PATCH",
	): Promise<boolean> {
		if (!incidentId) {
			return false;
		}

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
					method: httpMethod,
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
			setError(caught instanceof Error ? caught.message : "CAUSE_SAVE_FAILED");
			return false;
		} finally {
			setBusy(false);
		}
	}

	async function saveStatement(cause: RecordCauseNode, text: string) {
		const statement = text.trim();

		if (!statement) {
			return;
		}

		if (await mutate(updateBody(cause, { statement }), "PATCH")) {
			onManualRecordChange?.({
				area: "causes",
				summary: `Edited cause in graph: ${truncate(statement, 120)}`,
			});
			closeMenus();
		}
	}

	async function addCause(parentId: string, text: string) {
		const statement = text.trim();

		if (!statement) {
			return;
		}

		if (await mutate({ parentId, statement }, "POST")) {
			onManualRecordChange?.({
				area: "causes",
				summary: `Added cause in graph: ${truncate(statement, 120)}`,
			});
			closeMenus();
		}
	}

	async function removeCause(nodeId: string) {
		if (await mutate({ _action: "delete", nodeId }, "POST")) {
			onManualRecordChange?.({
				area: "causes",
				summary: "Deleted a cause branch in graph",
			});
			closeMenus();
		}
	}

	async function markCause(
		cause: RecordCauseNode,
		branchStatus: RecordCauseBranchStatus,
	) {
		if (
			await mutate(
				updateBody(cause, {
					branchStatus,
					isRootCause: branchStatus === "ROOT_REACHED",
				}),
				"PATCH",
			)
		) {
			onManualRecordChange?.({
				area: "causes",
				summary: `Marked cause in graph as ${branchStatus}`,
			});
			closeMenus();
		}
	}

	async function moveCause(cause: RecordCauseNode, parentId: string | null) {
		if (
			parentId === cause.id ||
			parentId === cause.parentId ||
			(parentId !== null &&
				descendantIds(record.causes ?? [], cause.id).has(parentId))
		) {
			setMovingId(null);
			return;
		}

		if (await mutate(updateBody(cause, { parentId }), "PATCH")) {
			onManualRecordChange?.({
				area: "causes",
				summary: `Moved cause in graph: ${truncate(cause.statement, 120)}`,
			});
			closeMenus();
		}
	}

	const { nodes, width, height, childCount } = useMemo(
		() =>
			layoutCauseTree({
				actions: record.actions,
				causes: record.causes,
				collapsed,
				eventTitle: record.incident.title || labels.legend.event,
			}),
		[record, collapsed, labels.legend.event],
	);

	const byId = new Map(nodes.map((n) => [n.id, n]));

	if ((record.causes ?? []).length === 0) {
		return (
			<div className="grid place-items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-sm text-[var(--color-muted)]">
				{labels.legend.event}: {record.incident.title || "—"} — {labels.empty}
			</div>
		);
	}

	const toggle = (id: string) =>
		setCollapsed((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});

	return (
		<div className="grid gap-2">
			<div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-muted)]">
				{method ? (
					<span className="rounded bg-[var(--color-surface-elev)] px-2 py-0.5 font-medium text-[var(--color-text)]">
						{labels.method}: {method}
					</span>
				) : null}
				{(["root", "open", "parked", "measure"] as const).map((key) => (
					<span className="inline-flex items-center gap-1" key={key}>
						<span
							className="inline-block size-2 rounded-full"
							style={{
								background:
									key === "measure"
										? "var(--color-accent)"
										: STATUS_STYLE[key].dot,
							}}
						/>
						{labels.legend[key]}
					</span>
				))}
			</div>
			<div
				className="relative overflow-auto rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]"
				style={{ maxHeight: 560 }}
			>
				<div style={{ position: "relative", width, height }}>
					<svg
						aria-hidden="true"
						height={height}
						style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
						width={width}
					>
						<title>cause tree connectors</title>
						{nodes.map((n) => {
							if (!n.parentId) {
								return null;
							}
							const p = byId.get(n.parentId);
							if (!p) {
								return null;
							}
							const x1 = p.x + NODE_W;
							const y1 = p.y + NODE_H / 2;
							const x2 = n.x;
							const y2 = n.y + NODE_H / 2;
							const mx = (x1 + x2) / 2;
							return (
								<path
									d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
									fill="none"
									key={`e-${n.id}`}
									stroke={
										n.kind === "measure"
											? "var(--color-accent)"
											: "var(--color-border)"
									}
									strokeDasharray={n.status === "parked" ? "4 3" : undefined}
									strokeWidth={1.5}
								/>
							);
						})}
					</svg>
					{nodes.map((n) => {
						const style = STATUS_STYLE[n.status];
						const kids = childCount.get(n.id) ?? 0;
						const isCollapsed = collapsed.has(n.id);
						return (
							<div
								className="absolute grid gap-1 rounded-md border px-3 py-2 text-xs"
								key={n.id}
								style={{
									left: n.x,
									top: n.y,
									width: NODE_W,
									height: NODE_H,
									borderColor: style.border,
									background: style.bg,
									borderStyle: n.status === "parked" ? "dashed" : "solid",
									color: "var(--color-text)",
									overflow: "hidden",
								}}
								title={n.label}
							>
								<div className="flex items-start gap-1.5">
									<span
										className="mt-1 inline-block size-2 shrink-0 rounded-full"
										style={{
											background:
												n.kind === "measure"
													? "var(--color-accent)"
													: style.dot,
										}}
									/>
									<span
										style={{
											display: "-webkit-box",
											WebkitLineClamp: n.meta ? 2 : 3,
											WebkitBoxOrient: "vertical",
											overflow: "hidden",
											fontWeight: n.kind === "event" ? 600 : 400,
											lineHeight: 1.25,
										}}
									>
										{n.kind === "measure" && n.stopClass ? (
											<span className="mr-1 rounded bg-[var(--color-accent)] px-1 font-semibold text-white">
												{n.stopClass}
											</span>
										) : null}
										{n.label}
									</span>
									<div className="ml-auto flex shrink-0 items-center gap-1">
										{editable && n.kind === "cause" ? (
											<button
												aria-label={menu.menu}
												className="rounded border border-[var(--color-border)] px-1 leading-none text-[var(--color-muted)] hover:text-[var(--color-text)] disabled:opacity-60"
												disabled={busy}
												onClick={() => {
													const wasOpen = menuId === n.id;
													closeMenus();
													if (!wasOpen) {
														setMenuId(n.id);
													}
												}}
												title={menu.menu}
												type="button"
											>
												⋯
											</button>
										) : null}
										{kids > 0 ? (
											<button
												aria-label={isCollapsed ? "expand" : "collapse"}
												className="rounded border border-[var(--color-border)] px-1 leading-none text-[var(--color-muted)] hover:text-[var(--color-text)]"
												onClick={() => toggle(n.id)}
												type="button"
											>
												{isCollapsed ? "+" : "−"}
											</button>
										) : null}
									</div>
								</div>
								{n.meta ? (
									<div className="truncate text-[10px] text-[var(--color-muted)]">
										{n.meta}
									</div>
								) : null}
							</div>
						);
					})}
					{editable
						? nodes.map((n) => {
								if (n.kind !== "cause") {
									return null;
								}

								const cause = causeById.get(n.id);

								if (!cause) {
									return null;
								}

								const isMenuOpen = menuId === n.id;
								const isEditing = editing?.nodeId === n.id;
								const isAdding = adding?.parentId === n.id;
								const isMoving = movingId === n.id;
								const isConfirmingDelete = confirmingDeleteId === n.id;
								const anyOpen =
									isMenuOpen ||
									isEditing ||
									isAdding ||
									isMoving ||
									isConfirmingDelete;

								if (!anyOpen) {
									return null;
								}

								return (
									<div
										className="absolute z-20 grid w-60 gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elev)] p-1 text-xs shadow-lg"
										key={`menu-${n.id}`}
										style={{ left: n.x + NODE_W - 232, top: n.y + NODE_H - 4 }}
									>
										{isEditing && editing ? (
											<InlineForm
												busy={busy}
												cancelLabel={menu.cancel}
												onCancel={closeMenus}
												onChange={(text) =>
													setEditing((current) =>
														current ? { ...current, text } : current,
													)
												}
												onSubmit={() => void saveStatement(cause, editing.text)}
												placeholder={menu.editPlaceholder}
												saveLabel={menu.save}
												value={editing.text}
											/>
										) : isAdding && adding ? (
											<InlineForm
												busy={busy}
												cancelLabel={menu.cancel}
												onCancel={closeMenus}
												onChange={(text) =>
													setAdding((current) =>
														current ? { ...current, text } : current,
													)
												}
												onSubmit={() => void addCause(n.id, adding.text)}
												placeholder={menu.addPlaceholder}
												saveLabel={menu.save}
												value={adding.text}
											/>
										) : isConfirmingDelete ? (
											<>
												<span className="px-2 py-1 text-[var(--color-muted)]">
													{menu.deleteConfirm}
												</span>
												<button
													className={dangerMenuItem}
													disabled={busy}
													onClick={() => void removeCause(n.id)}
													type="button"
												>
													{menu.delete}
												</button>
												<button
													className={menuItem}
													disabled={busy}
													onClick={closeMenus}
													type="button"
												>
													{menu.cancel}
												</button>
											</>
										) : isMoving ? (
											<>
												{cause.parentId ? (
													<button
														className={menuItem}
														disabled={busy}
														onClick={() => void moveCause(cause, null)}
														type="button"
													>
														{menu.topLevel}
													</button>
												) : null}
												{moveTargets(record.causes ?? [], cause).map(
													(target) => (
														<button
															className={menuItem}
															disabled={busy}
															key={target.id}
															onClick={() => void moveCause(cause, target.id)}
															type="button"
														>
															{truncate(target.statement, 40)}
														</button>
													),
												)}
												<button
													className={menuItem}
													disabled={busy}
													onClick={() => setMovingId(null)}
													type="button"
												>
													{menu.cancel}
												</button>
											</>
										) : (
											<>
												<button
													className={menuItem}
													disabled={busy}
													onClick={() => {
														setMenuId(null);
														setEditing({
															nodeId: n.id,
															text: cause.statement,
														});
													}}
													type="button"
												>
													{menu.edit}
												</button>
												<button
													className={menuItem}
													disabled={busy}
													onClick={() => {
														setMenuId(null);
														setAdding({ parentId: n.id, text: "" });
													}}
													type="button"
												>
													{menu.addWhy}
												</button>
												<button
													className={menuItem}
													disabled={busy}
													onClick={() =>
														void markCause(
															cause,
															isRootMarked(cause) ? "OPEN" : "ROOT_REACHED",
														)
													}
													type="button"
												>
													{isRootMarked(cause)
														? menu.unmarkRoot
														: menu.markRoot}
												</button>
												<button
													className={menuItem}
													disabled={busy}
													onClick={() =>
														void markCause(
															cause,
															cause.branchStatus === "PARKED"
																? "OPEN"
																: "PARKED",
														)
													}
													type="button"
												>
													{cause.branchStatus === "PARKED"
														? menu.unpark
														: menu.park}
												</button>
												<button
													className={menuItem}
													disabled={busy}
													onClick={() => {
														setMenuId(null);
														setMovingId(n.id);
													}}
													type="button"
												>
													{menu.moveUnder}
												</button>
												<button
													className={dangerMenuItem}
													disabled={busy}
													onClick={() => {
														setMenuId(null);
														setConfirmingDeleteId(n.id);
													}}
													type="button"
												>
													{menu.delete}
												</button>
											</>
										)}
									</div>
								);
							})
						: null}
				</div>
			</div>
			{editable && error ? (
				<p className="m-0 rounded-md border border-[var(--color-danger)] px-3 py-2 text-xs text-[var(--color-danger)]">
					{error}
				</p>
			) : null}
		</div>
	);
}

const menuItem =
	"w-full rounded px-2 py-1 text-left text-[var(--color-text)] transition hover:bg-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-60";
const dangerMenuItem =
	"w-full rounded px-2 py-1 text-left text-[var(--color-danger)] transition hover:bg-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-60";

function InlineForm({
	value,
	placeholder,
	busy,
	saveLabel,
	cancelLabel,
	onChange,
	onSubmit,
	onCancel,
}: {
	readonly value: string;
	readonly placeholder: string;
	readonly busy: boolean;
	readonly saveLabel: string;
	readonly cancelLabel: string;
	readonly onChange: (text: string) => void;
	readonly onSubmit: () => void;
	readonly onCancel: () => void;
}) {
	return (
		<div className="grid gap-1 p-1">
			<textarea
				// biome-ignore lint/a11y/noAutofocus: focus the field as the menu opens
				autoFocus
				className="min-h-14 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
				onChange={(event) => onChange(event.currentTarget.value)}
				placeholder={placeholder}
				rows={2}
				value={value}
			/>
			<div className="flex gap-1">
				<button
					className="inline-flex items-center justify-center rounded-md bg-[var(--color-accent)] px-2 py-1 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
					disabled={busy || !value.trim()}
					onClick={onSubmit}
					type="button"
				>
					{saveLabel}
				</button>
				<button
					className="inline-flex items-center justify-center rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-[var(--color-text)] transition hover:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60"
					disabled={busy}
					onClick={onCancel}
					type="button"
				>
					{cancelLabel}
				</button>
			</div>
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

/** Candidate new parents: every cause except self, current parent, descendants. */
function moveTargets(
	causes: readonly RecordCauseNode[],
	cause: RecordCauseNode,
): RecordCauseNode[] {
	const blocked = descendantIds(causes, cause.id);
	blocked.add(cause.id);

	return causes.filter(
		(candidate) =>
			!blocked.has(candidate.id) && candidate.id !== cause.parentId,
	);
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
