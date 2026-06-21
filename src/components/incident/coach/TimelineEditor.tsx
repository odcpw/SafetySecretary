"use client";

import { useState } from "react";
import { CSRF_COOKIE_NAME } from "../../../lib/auth/cookies";
import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
import type { ManualIncidentRecordChange } from "../../../lib/incident/coach-consistency";
import type { CoachCopy } from "./copy";
import type { RecordFact, RecordTimelineEvent } from "./types";

type TimelineEditorProps = {
	readonly incidentId: string;
	readonly facts: RecordFact[];
	readonly timeline: RecordTimelineEvent[];
	readonly copy: CoachCopy;
	readonly onRecordChange?: () => void;
	readonly onManualRecordChange?: (change: ManualIncidentRecordChange) => void;
};

type PhaseValue = "before" | "event" | "after" | "none";

type EditDraft = {
	eventId: string;
	text: string;
	phase: PhaseValue;
	timeLabel: string;
};

type AddDraft = {
	text: string;
	phase: PhaseValue;
	timeLabel: string;
};

function buildPhaseOptions(
	copy: CoachCopy,
): ReadonlyArray<{ value: PhaseValue; label: string }> {
	return [
		{ label: copy.timeline.phaseBefore, value: "before" },
		{ label: copy.timeline.phaseEvent, value: "event" },
		{ label: copy.timeline.phaseAfter, value: "after" },
		{ label: copy.timeline.phaseUnsorted, value: "none" },
	];
}

function buildPhaseHeadings(
	copy: CoachCopy,
): ReadonlyArray<{ key: PhaseValue; label: string }> {
	return [
		{ key: "before", label: copy.timeline.phaseBefore },
		{ key: "event", label: copy.timeline.phaseEvent },
		{ key: "after", label: copy.timeline.phaseAfter },
	];
}

const textareaClassName =
	"min-h-16 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-sm text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]";
const inputClassName =
	"rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]";
const selectClassName =
	"rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]";
const primaryButton =
	"inline-flex items-center justify-center rounded-md bg-[var(--color-accent)] px-2 py-1 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton =
	"inline-flex items-center justify-center rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-[var(--color-text)] transition hover:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60";
const dangerButton =
	"inline-flex items-center justify-center rounded-md border border-[var(--color-danger)] px-2 py-1 text-xs font-medium text-[var(--color-danger)] transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-60";

export default function TimelineEditor({
	incidentId,
	facts,
	timeline,
	copy,
	onRecordChange,
	onManualRecordChange,
}: TimelineEditorProps) {
	const phaseOptions = buildPhaseOptions(copy);
	const phaseHeadings = buildPhaseHeadings(copy);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [editing, setEditing] = useState<EditDraft | null>(null);
	const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
		null,
	);
	const [adding, setAdding] = useState<AddDraft | null>(null);

	async function mutate(body: Record<string, unknown>): Promise<boolean> {
		setBusy(true);
		setError(null);

		try {
			const response = await fetch(
				`/api/incidents/${encodeURIComponent(incidentId)}/timeline`,
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
					payload.code ?? `TIMELINE_SAVE_FAILED_${response.status}`,
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

	/**
	 * Editing replaces the timeline event's person sources, so we must forward
	 * the existing ones or they would be wiped. The snapshot does not carry
	 * source ids, so fetch the live event first.
	 */
	async function existingSourcePersonIds(eventId: string): Promise<string[]> {
		const response = await fetch(
			`/api/incidents/${encodeURIComponent(incidentId)}/timeline`,
			{ credentials: "same-origin" },
		);

		if (!response.ok) {
			return [];
		}

		const body = (await response.json().catch(() => ({}))) as {
			events?: Array<{
				id: string;
				sources?: Array<{ personId: string }>;
			}>;
		};
		const event = body.events?.find((candidate) => candidate.id === eventId);
		return (event?.sources ?? []).map((source) => source.personId);
	}

	async function saveEdit(event: RecordTimelineEvent, draft: EditDraft) {
		const text = draft.text.trim();

		if (!text) {
			setError(copy.timeline.textRequired);
			return;
		}

		const sourcePersonIds = await existingSourcePersonIds(event.id);

		const saved = await mutate({
			_action: "update",
			confidence: event.confidence || "LIKELY",
			eventId: event.id,
			sourcePersonIds,
			text,
			timeLabel: resolveTimeLabel(draft.phase, draft.timeLabel),
		});

		if (saved) {
			setEditing(null);
			onManualRecordChange?.({
				area: "facts",
				summary: `Edited fact: ${truncateForReview(text, 120)}`,
			});
		}
	}

	async function addEvent(draft: AddDraft) {
		const text = draft.text.trim();

		if (!text) {
			setError(copy.timeline.textRequired);
			return;
		}

		const added = await mutate({
			confidence: "LIKELY",
			sourcePersonIds: [],
			text,
			timeLabel: resolveTimeLabel(draft.phase, draft.timeLabel),
		});

		if (added) {
			setAdding(null);
			onManualRecordChange?.({
				area: "facts",
				summary: `Added fact: ${truncateForReview(text, 120)}`,
			});
		}
	}

	async function removeEvent(eventId: string) {
		if (await mutate({ _action: "delete", eventId })) {
			setConfirmingDeleteId(null);
			onManualRecordChange?.({
				area: "facts",
				summary: "Deleted a fact or timeline event",
			});
		}
	}

	function renderEditForm(event: RecordTimelineEvent, draft: EditDraft) {
		return (
			<div className="grid gap-2">
				<textarea
					className={textareaClassName}
					onChange={(formEvent) => {
						const text = formEvent.currentTarget.value;
						setEditing((current) => (current ? { ...current, text } : current));
					}}
					rows={2}
					value={draft.text}
				/>
				<div className="flex flex-wrap items-center gap-2">
					<label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
						{copy.timeline.phaseLabel}
						<select
							className={selectClassName}
							onChange={(formEvent) => {
								const phase = formEvent.currentTarget.value as PhaseValue;
								setEditing((current) =>
									current ? { ...current, phase } : current,
								);
							}}
							value={draft.phase}
						>
							{phaseOptions.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</label>
					<input
						className={inputClassName}
						onChange={(formEvent) => {
							const timeLabel = formEvent.currentTarget.value;
							setEditing((current) =>
								current ? { ...current, timeLabel } : current,
							);
						}}
						placeholder={copy.timeline.timeNotePlaceholder}
						type="text"
						value={draft.timeLabel}
					/>
				</div>
				<div className="flex gap-2">
					<button
						className={primaryButton}
						disabled={busy || !draft.text.trim()}
						onClick={() => void saveEdit(event, draft)}
						type="button"
					>
						{busy ? copy.timeline.saving : copy.timeline.save}
					</button>
					<button
						className={secondaryButton}
						disabled={busy}
						onClick={() => setEditing(null)}
						type="button"
					>
						{copy.timeline.cancel}
					</button>
				</div>
			</div>
		);
	}

	function renderCard(event: RecordTimelineEvent) {
		const isEditing = editing?.eventId === event.id;

		if (isEditing && editing) {
			return (
				<div
					className="grid gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elev)] px-3 py-2"
					key={event.id}
				>
					{renderEditForm(event, editing)}
				</div>
			);
		}

		return (
			<div
				className="grid gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elev)] px-3 py-2"
				key={event.id}
			>
				{event.timeLabel ? (
					<p className="m-0 text-xs text-[var(--color-muted)]">
						{event.timeLabel}
					</p>
				) : null}
				<button
					className="m-0 cursor-text border-0 bg-transparent p-0 text-left text-sm leading-6 text-[var(--color-text)]"
					disabled={busy}
					onClick={() =>
						setEditing({
							eventId: event.id,
							phase: event.phase ?? "none",
							text: event.text,
							timeLabel: event.timeLabel ?? "",
						})
					}
					title={copy.timeline.editTitle}
					type="button"
				>
					{event.text}
				</button>
				<div className="flex flex-wrap items-center gap-2">
					{confirmingDeleteId === event.id ? (
						<>
							<span className="text-xs text-[var(--color-muted)]">
								{copy.timeline.deletePrompt}
							</span>
							<button
								className={dangerButton}
								disabled={busy}
								onClick={() => void removeEvent(event.id)}
								type="button"
							>
								{copy.timeline.delete}
							</button>
							<button
								className={secondaryButton}
								disabled={busy}
								onClick={() => setConfirmingDeleteId(null)}
								type="button"
							>
								{copy.timeline.cancel}
							</button>
						</>
					) : (
						<>
							<button
								className={secondaryButton}
								disabled={busy}
								onClick={() =>
									setEditing({
										eventId: event.id,
										phase: event.phase ?? "none",
										text: event.text,
										timeLabel: event.timeLabel ?? "",
									})
								}
								type="button"
							>
								{copy.timeline.edit}
							</button>
							<button
								className={secondaryButton}
								disabled={busy}
								onClick={() => setConfirmingDeleteId(event.id)}
								type="button"
							>
								{copy.timeline.delete}
							</button>
						</>
					)}
				</div>
			</div>
		);
	}

	const unphased = timeline.filter((event) => !event.phase);
	const hasPhasedEvents = phaseHeadings.some((phase) =>
		timeline.some((event) => event.phase === phase.key),
	);

	return (
		<div className="grid gap-4">
			{error ? (
				<p className="m-0 rounded-md border border-[var(--color-danger)] px-3 py-2 text-sm text-[var(--color-danger)]">
					{error}
				</p>
			) : null}
			{facts.length > 0 ? (
				<div className="grid gap-1">
					<h3 className="m-0 text-xs font-medium uppercase text-[var(--color-muted)]">
						{copy.timeline.statementFacts}
					</h3>
					<ul className="m-0 grid list-none gap-1 p-0 text-sm">
						{facts.map((fact) => (
							<li key={fact.id}>
								{fact.text}{" "}
								<span className="text-[var(--color-muted)]">
									— {factAttribution(fact)}
								</span>
							</li>
						))}
					</ul>
				</div>
			) : null}
			{timeline.length === 0 ? (
				<p className="m-0 rounded-md border border-dashed border-[var(--color-border)] px-3 py-4 text-sm text-[var(--color-muted)]">
					{copy.timeline.empty}
				</p>
			) : (
				<>
					{phaseHeadings.map(({ key, label }) => {
						const events = timeline.filter((event) => event.phase === key);

						if (events.length === 0) {
							return null;
						}

						return (
							<div className="grid gap-2" key={key}>
								<h3 className="m-0 text-xs font-medium uppercase text-[var(--color-muted)]">
									{label}
								</h3>
								{events.map((event) => renderCard(event))}
							</div>
						);
					})}
					{unphased.length > 0 ? (
						<div className="grid gap-2">
							{hasPhasedEvents ? (
								<h3 className="m-0 text-xs font-medium uppercase text-[var(--color-muted)]">
									{copy.timeline.other}
								</h3>
							) : null}
							{unphased.map((event) => renderCard(event))}
						</div>
					) : null}
				</>
			)}
			{adding ? (
				<div className="grid gap-2 rounded-md border border-dashed border-[var(--color-border)] px-3 py-2">
					<textarea
						className={textareaClassName}
						onChange={(event) => {
							const text = event.currentTarget.value;
							setAdding((current) =>
								current ? { ...current, text } : current,
							);
						}}
						placeholder={copy.timeline.whatHappened}
						rows={2}
						value={adding.text}
					/>
					<div className="flex flex-wrap items-center gap-2">
						<label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
							{copy.timeline.phaseLabel}
							<select
								className={selectClassName}
								onChange={(event) => {
									const phase = event.currentTarget.value as PhaseValue;
									setAdding((current) =>
										current ? { ...current, phase } : current,
									);
								}}
								value={adding.phase}
							>
								{phaseOptions.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
						</label>
						<input
							className={inputClassName}
							onChange={(event) => {
								const timeLabel = event.currentTarget.value;
								setAdding((current) =>
									current ? { ...current, timeLabel } : current,
								);
							}}
							placeholder={copy.timeline.timeNotePlaceholder}
							type="text"
							value={adding.timeLabel}
						/>
					</div>
					<div className="flex gap-2">
						<button
							className={primaryButton}
							disabled={busy || !adding.text.trim()}
							onClick={() => void addEvent(adding)}
							type="button"
						>
							{copy.timeline.add}
						</button>
						<button
							className={secondaryButton}
							disabled={busy}
							onClick={() => setAdding(null)}
							type="button"
						>
							{copy.timeline.cancel}
						</button>
					</div>
				</div>
			) : (
				<button
					className={`${secondaryButton} justify-self-start`}
					disabled={busy}
					onClick={() => setAdding({ phase: "none", text: "", timeLabel: "" })}
					type="button"
				>
					{copy.timeline.addFact}
				</button>
			)}
		</div>
	);
}

/**
 * The snapshot derives the phase from keywords in the time label, so a chosen
 * phase is encoded back into the label. A user-typed note is kept verbatim if
 * it already implies the phase; otherwise the canonical phase word is prefixed.
 */
function resolveTimeLabel(phase: PhaseValue, timeLabel: string): string | null {
	const trimmed = timeLabel.trim();

	if (phase === "none") {
		return trimmed || null;
	}

	const phaseWord =
		phase === "before" ? "Before" : phase === "after" ? "After" : "Event";

	if (trimmed) {
		return trimmed.toLowerCase().includes(phaseWord.toLowerCase())
			? trimmed
			: `${phaseWord} — ${trimmed}`;
	}

	return phaseWord;
}

function factAttribution(fact: RecordFact): string {
	const role = enumLabel(fact.personRole) ?? fact.personRole;
	return fact.personName ? `${fact.personName} (${role})` : role;
}

function enumLabel(value: unknown): string | null {
	if (typeof value !== "string" || !value.trim()) {
		return null;
	}

	const text = value.replaceAll("_", " ").toLowerCase();
	return text.charAt(0).toUpperCase() + text.slice(1);
}

function userSafeError(caught: unknown, copy: CoachCopy): string {
	if (caught instanceof Error) {
		const map: Record<string, string> = {
			INCIDENT_NOT_FOUND: copy.timeline.errorNotFound,
			INVALID_TIMELINE_PAYLOAD: copy.timeline.errorInvalidPayload,
			INVALID_TIMELINE_SOURCE: copy.timeline.errorInvalidSource,
			TIMELINE_EVENT_NOT_FOUND: copy.timeline.errorEventNotFound,
		};

		return map[caught.message] ?? caught.message;
	}

	return copy.timeline.errorGeneric;
}

function truncateForReview(value: string, maxLength: number): string {
	return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}
