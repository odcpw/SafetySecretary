"use client";

import { useState } from "react";
import { CSRF_COOKIE_NAME } from "../../../lib/auth/cookies";
import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
import type { ManualIncidentRecordChange } from "../../../lib/incident/coach-consistency";
import Badge from "../../ui/Badge";
import type { CoachCopy } from "./copy";
import type { RecordAction, RecordCauseNode } from "./types";

type ActionPlanEditorProps = {
	readonly incidentId: string;
	readonly actions: RecordAction[];
	readonly causes: RecordCauseNode[];
	readonly copy: CoachCopy;
	readonly onRecordChange?: () => void;
	readonly onManualRecordChange?: (change: ManualIncidentRecordChange) => void;
};

type ActionTypeValue = "SUBSTITUTION" | "TECHNICAL" | "ORGANIZATIONAL" | "PPE";
type ActionStatusValue = "OPEN" | "IN_PROGRESS" | "COMPLETE";

type EditDraft = {
	actionId: string;
	description: string;
	ownerRole: string;
	dueDate: string;
	actionType: ActionTypeValue;
	status: ActionStatusValue;
};

type AddDraft = {
	causeNodeId: string;
	description: string;
	ownerRole: string;
	dueDate: string;
	actionType: ActionTypeValue;
	status: ActionStatusValue;
};

function buildActionTypeOptions(
	copy: CoachCopy,
): ReadonlyArray<{ value: ActionTypeValue; label: string }> {
	return [
		{ label: copy.actions.typeSubstitution, value: "SUBSTITUTION" },
		{ label: copy.actions.typeTechnical, value: "TECHNICAL" },
		{ label: copy.actions.typeOrganizational, value: "ORGANIZATIONAL" },
		{ label: copy.actions.typePpe, value: "PPE" },
	];
}
function buildStatusOptions(
	copy: CoachCopy,
): ReadonlyArray<{ value: ActionStatusValue; label: string }> {
	return [
		{ label: copy.actions.statusOpen, value: "OPEN" },
		{ label: copy.actions.statusInProgress, value: "IN_PROGRESS" },
		{ label: copy.actions.statusComplete, value: "COMPLETE" },
	];
}
const actionTypeSet = new Set<string>([
	"SUBSTITUTION",
	"TECHNICAL",
	"ORGANIZATIONAL",
	"PPE",
]);
const statusSet = new Set<string>(["OPEN", "IN_PROGRESS", "COMPLETE"]);

const inputClassName =
	"rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]";
const textareaClassName =
	"min-h-16 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]";
const selectClassName =
	"rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]";
const primaryButton =
	"inline-flex items-center justify-center rounded-md bg-[var(--color-accent)] px-2 py-1 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton =
	"inline-flex items-center justify-center rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-[var(--color-text)] transition hover:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60";
const dangerButton =
	"inline-flex items-center justify-center rounded-md border border-[var(--color-danger)] px-2 py-1 text-xs font-medium text-[var(--color-danger)] transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60";

export default function ActionPlanEditor({
	incidentId,
	actions,
	causes,
	copy,
	onRecordChange,
	onManualRecordChange,
}: ActionPlanEditorProps) {
	const actionTypeOptions = buildActionTypeOptions(copy);
	const statusOptions = buildStatusOptions(copy);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [editing, setEditing] = useState<EditDraft | null>(null);
	const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
		null,
	);
	const [adding, setAdding] = useState<AddDraft | null>(null);

	const causeById = new Map(causes.map((cause) => [cause.id, cause]));

	async function mutate(body: Record<string, unknown>): Promise<boolean> {
		setBusy(true);
		setError(null);

		try {
			const response = await fetch(
				`/api/incidents/${encodeURIComponent(incidentId)}/actions`,
				{
					body: JSON.stringify(body),
					credentials: "same-origin",
					headers: {
						accept: "application/json",
						"content-type": "application/json",
						"x-safetysecretary-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
					},
					method: "POST",
				},
			);

			if (!response.ok) {
				const payload = (await response.json().catch(() => ({}))) as {
					code?: string;
				};
				throw new Error(
					payload.code ?? `ACTION_SAVE_FAILED_${response.status}`,
				);
			}

			onRecordChange?.();
			return true;
		} catch (caught) {
			setError(userSafeError(caught, copy));
			return false;
		} finally {
			setBusy(false);
		}
	}

	async function saveEdit(draft: EditDraft) {
		if (!draft.description.trim()) {
			setError(copy.actions.descriptionRequired);
			return;
		}

		const saved = await mutate({
			_action: "update",
			actionId: draft.actionId,
			actionType: draft.actionType,
			description: draft.description.trim(),
			dueDate: draft.dueDate || "",
			ownerRole: draft.ownerRole.trim(),
			status: draft.status,
		});

		if (saved) {
			setEditing(null);
			onManualRecordChange?.({
				area: "actions",
				summary: `Edited measure: ${truncate(draft.description.trim(), 120)}`,
			});
		}
	}

	async function addAction(draft: AddDraft) {
		if (!draft.causeNodeId) {
			setError(copy.actions.pickCause);
			return;
		}

		if (!draft.description.trim()) {
			setError(copy.actions.descriptionRequired);
			return;
		}

		const added = await mutate({
			actionType: draft.actionType,
			causeNodeId: draft.causeNodeId,
			description: draft.description.trim(),
			dueDate: draft.dueDate || "",
			ownerRole: draft.ownerRole.trim(),
			status: draft.status,
		});

		if (added) {
			setAdding(null);
			onManualRecordChange?.({
				area: "actions",
				summary: `Added measure: ${truncate(draft.description.trim(), 120)}`,
			});
		}
	}

	async function removeAction(actionId: string) {
		if (await mutate({ _action: "delete", actionId })) {
			setConfirmingDeleteId(null);
			onManualRecordChange?.({
				area: "actions",
				summary: "Deleted a measure",
			});
		}
	}

	function renderFields(
		draft: EditDraft | AddDraft,
		update: (changes: Partial<EditDraft & AddDraft>) => void,
	) {
		return (
			<>
				<textarea
					className={textareaClassName}
					onChange={(event) =>
						update({ description: event.currentTarget.value })
					}
					placeholder={copy.actions.whatWillBeDone}
					rows={2}
					value={draft.description}
				/>
				<div className="flex flex-wrap items-center gap-2">
					<input
						className={inputClassName}
						onChange={(event) =>
							update({ ownerRole: event.currentTarget.value })
						}
						placeholder={copy.actions.ownerRole}
						type="text"
						value={draft.ownerRole}
					/>
					<label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
						{copy.actions.due}
						<input
							className={inputClassName}
							onChange={(event) =>
								update({ dueDate: event.currentTarget.value })
							}
							type="date"
							value={draft.dueDate}
						/>
					</label>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
						{copy.actions.type}
						<select
							className={selectClassName}
							onChange={(event) =>
								update({
									actionType: event.currentTarget.value as ActionTypeValue,
								})
							}
							value={draft.actionType}
						>
							{actionTypeOptions.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</label>
					<label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
						{copy.actions.status}
						<select
							className={selectClassName}
							onChange={(event) =>
								update({
									status: event.currentTarget.value as ActionStatusValue,
								})
							}
							value={draft.status}
						>
							{statusOptions.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</label>
				</div>
			</>
		);
	}

	function renderCard(action: RecordAction) {
		const cause = causeById.get(action.causeNodeId);
		const isEditing = editing?.actionId === action.id;

		if (isEditing && editing) {
			return (
				<div
					className="grid gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elev)] px-3 py-2"
					key={action.id}
				>
					{renderFields(editing, (changes) =>
						setEditing((current) =>
							current ? { ...current, ...changes } : current,
						),
					)}
					<div className="flex gap-2">
						<button
							className={primaryButton}
							disabled={busy || !editing.description.trim()}
							onClick={() => void saveEdit(editing)}
							type="button"
						>
							{busy ? copy.actions.saving : copy.actions.save}
						</button>
						<button
							className={secondaryButton}
							disabled={busy}
							onClick={() => setEditing(null)}
							type="button"
						>
							{copy.actions.cancel}
						</button>
					</div>
				</div>
			);
		}

		return (
			<div
				className="grid gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elev)] px-3 py-2"
				key={action.id}
			>
				<div className="flex flex-wrap items-center gap-2">
					{action.actionType ? (
						<Badge variant="info">{stopLetter(action.actionType)}</Badge>
					) : null}
					<button
						className="m-0 cursor-text border-0 bg-transparent p-0 text-left text-sm leading-6 text-[var(--color-text)]"
						disabled={busy}
						onClick={() => setEditing(toEditDraft(action))}
						title={copy.actions.editTitle}
						type="button"
					>
						{action.description}
					</button>
				</div>
				<p className="m-0 text-xs text-[var(--color-muted)]">
					{action.ownerRole ? `${action.ownerRole} · ` : ""}
					{dueLabel(action.dueDate, copy)
						? `${dueLabel(action.dueDate, copy)} · `
						: ""}
					{statusLabel(action.status, copy)}
					{cause
						? ` · ${copy.actions.forPrefix}: ${truncate(cause.statement, 80)}`
						: ""}
				</p>
				<div className="flex flex-wrap items-center gap-2">
					{confirmingDeleteId === action.id ? (
						<>
							<span className="text-xs text-[var(--color-muted)]">
								{copy.actions.deletePrompt}
							</span>
							<button
								className={dangerButton}
								disabled={busy}
								onClick={() => void removeAction(action.id)}
								type="button"
							>
								{copy.actions.delete}
							</button>
							<button
								className={secondaryButton}
								disabled={busy}
								onClick={() => setConfirmingDeleteId(null)}
								type="button"
							>
								{copy.actions.cancel}
							</button>
						</>
					) : (
						<>
							<button
								className={secondaryButton}
								disabled={busy}
								onClick={() => setEditing(toEditDraft(action))}
								type="button"
							>
								{copy.actions.edit}
							</button>
							<button
								className={secondaryButton}
								disabled={busy}
								onClick={() => setConfirmingDeleteId(action.id)}
								type="button"
							>
								{copy.actions.delete}
							</button>
						</>
					)}
				</div>
			</div>
		);
	}

	return (
		<div className="grid gap-2">
			{error ? (
				<p className="m-0 rounded-md border border-[var(--color-danger)] px-3 py-2 text-sm text-[var(--color-danger)]">
					{error}
				</p>
			) : null}
			{actions.length === 0 ? (
				<p className="m-0 rounded-md border border-dashed border-[var(--color-border)] px-3 py-4 text-sm text-[var(--color-muted)]">
					{copy.actions.empty}
				</p>
			) : (
				actions.map((action) => renderCard(action))
			)}
			{causes.length === 0 ? (
				<p className="m-0 text-xs text-[var(--color-muted)]">
					{copy.actions.noCauses}
				</p>
			) : adding ? (
				<div className="grid gap-2 rounded-md border border-dashed border-[var(--color-border)] px-3 py-2">
					<label className="flex flex-col gap-1 text-xs text-[var(--color-muted)]">
						{copy.actions.causeAddressed}
						<select
							className={selectClassName}
							onChange={(event) =>
								setAdding((current) =>
									current
										? { ...current, causeNodeId: event.currentTarget.value }
										: current,
								)
							}
							value={adding.causeNodeId}
						>
							<option disabled value="">
								{copy.actions.chooseCause}
							</option>
							{causes.map((cause) => (
								<option key={cause.id} value={cause.id}>
									{truncate(cause.statement, 70)}
								</option>
							))}
						</select>
					</label>
					{renderFields(adding, (changes) =>
						setAdding((current) =>
							current ? { ...current, ...changes } : current,
						),
					)}
					<div className="flex gap-2">
						<button
							className={primaryButton}
							disabled={
								busy || !adding.description.trim() || !adding.causeNodeId
							}
							onClick={() => void addAction(adding)}
							type="button"
						>
							{copy.actions.addMeasure}
						</button>
						<button
							className={secondaryButton}
							disabled={busy}
							onClick={() => setAdding(null)}
							type="button"
						>
							{copy.actions.cancel}
						</button>
					</div>
				</div>
			) : (
				<button
					className={`${secondaryButton} justify-self-start`}
					disabled={busy}
					onClick={() =>
						setAdding({
							actionType: "ORGANIZATIONAL",
							causeNodeId: causes[0]?.id ?? "",
							description: "",
							dueDate: "",
							ownerRole: "",
							status: "OPEN",
						})
					}
					type="button"
				>
					{copy.actions.addMeasure}
				</button>
			)}
		</div>
	);
}

function toEditDraft(action: RecordAction): EditDraft {
	return {
		actionId: action.id,
		actionType: normalizeActionType(action.actionType),
		description: action.description,
		dueDate: dateOnly(action.dueDate),
		ownerRole: action.ownerRole ?? "",
		status: normalizeStatus(action.status),
	};
}

function normalizeActionType(value: string | null): ActionTypeValue {
	return value && actionTypeSet.has(value)
		? (value as ActionTypeValue)
		: "ORGANIZATIONAL";
}

function normalizeStatus(value: string): ActionStatusValue {
	return statusSet.has(value) ? (value as ActionStatusValue) : "OPEN";
}

function dateOnly(value: string | null): string {
	if (!value) {
		return "";
	}

	return value.slice(0, 10);
}

function dueLabel(dueDate: string | null, copy: CoachCopy): string | null {
	if (!dueDate) {
		return null;
	}

	const date = new Date(dueDate);

	if (Number.isNaN(date.getTime())) {
		return null;
	}

	return `${copy.actions.duePrefix} ${date.toLocaleDateString(undefined, { dateStyle: "medium" })}`;
}

function statusLabel(value: string, copy: CoachCopy): string | null {
	switch (value) {
		case "OPEN":
			return copy.actions.statusOpen;
		case "IN_PROGRESS":
			return copy.actions.statusInProgress;
		case "COMPLETE":
			return copy.actions.statusComplete;
		default:
			return enumLabel(value);
	}
}

function enumLabel(value: unknown): string | null {
	if (typeof value !== "string" || !value.trim()) {
		return null;
	}

	const text = value.replaceAll("_", " ").toLowerCase();
	return text.charAt(0).toUpperCase() + text.slice(1);
}

function stopLetter(actionType: string): string {
	if (actionType === "SUBSTITUTION") {
		return "S";
	}

	if (actionType === "TECHNICAL") {
		return "T";
	}

	if (actionType === "PPE") {
		return "P";
	}

	if (actionType === "ORGANIZATIONAL") {
		return "O";
	}

	return enumLabel(actionType) ?? actionType;
}

function truncate(text: string, max: number): string {
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function userSafeError(caught: unknown, copy: CoachCopy): string {
	if (caught instanceof Error) {
		const map: Record<string, string> = {
			CAUSE_NODE_NOT_FOUND: copy.actions.errorCauseNotFound,
			INCIDENT_ACTION_NOT_FOUND: copy.actions.errorActionNotFound,
			INVALID_ACTION_PAYLOAD: copy.actions.errorInvalidPayload,
			INVALID_ACTION_STATUS: copy.actions.errorInvalidStatus,
			INVALID_ACTION_TYPE: copy.actions.errorInvalidType,
			INVALID_DUE_DATE: copy.actions.errorInvalidDueDate,
		};

		return map[caught.message] ?? caught.message;
	}

	return copy.actions.errorGeneric;
}
