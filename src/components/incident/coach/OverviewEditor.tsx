"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { CSRF_COOKIE_NAME } from "../../../lib/auth/cookies";
import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
import {
	deriveActualSeverityFromOutcome,
	INCIDENT_ACTUAL_INJURY_OUTCOME_CODES,
	INCIDENT_TYPE_CODES,
	parseActualInjuryOutcome,
} from "../../../lib/incident/classification";
import type { ManualIncidentRecordChange } from "../../../lib/incident/coach-consistency";
import {
	dateTimeLabel,
	incidentFieldHeading,
	incidentTypeLabel,
	outcomeLabel,
	severityLabel,
} from "../../../lib/incident/labels";
import { SEVERITY_CODES } from "../../../lib/taxonomy/schema";
import type { CoachCopy } from "./copy";
import type { RecordIncident } from "./types";

type OverviewEditorProps = {
	readonly incident: RecordIncident;
	readonly copy: CoachCopy;
	readonly locale: string;
	readonly onRecordChange?: () => void;
	readonly onManualRecordChange?: (change: ManualIncidentRecordChange) => void;
};

type FieldKind = "text" | "datetime" | "select";

type EditableField = {
	key: EditableKey;
	label: string;
	kind: FieldKind;
	options?: ReadonlyArray<{ value: string; label: string }>;
	/** Localized label for the stored enum value (read-only display). */
	valueLabel?: (code: string) => string;
	/** Whether the field accepts an empty value (cleared to null). */
	optional?: boolean;
};

/** The overview fields a manager can edit inline. */
type EditableKey =
	| "title"
	| "incidentType"
	| "incidentAt"
	| "location"
	| "actualOutcome"
	| "department"
	| "area"
	| "workActivity"
	| "immediateCause"
	| "coordinatorName"
	| "potentialSeverity";

/**
 * Localized "kein/—" word for the clearable potential-severity select. The
 * potential severity can be left unset; this is the option that does so. Swiss
 * German keeps "ss".
 */
const NONE_OPTION_LABEL: Record<string, string> = {
	de: "kein",
	en: "none",
	fr: "aucun",
	it: "nessuno",
};

function noneOptionLabel(locale: string): string {
	return NONE_OPTION_LABEL[locale] ?? NONE_OPTION_LABEL.en;
}

const inputClassName =
	"rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-sm text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]";
const selectClassName = inputClassName;
const primaryButton =
	"inline-flex items-center justify-center rounded-md bg-[var(--color-accent)] px-2 py-1 text-xs font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton =
	"inline-flex items-center justify-center rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium text-[var(--color-text)] transition hover:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60";

function buildEditableFields(
	copy: CoachCopy,
	locale: string,
): ReadonlyArray<EditableField> {
	const incidentTypeOptions = INCIDENT_TYPE_CODES.map((code) => ({
		label: incidentTypeLabel(code, locale),
		value: code,
	}));
	const actualOutcomeOptions = INCIDENT_ACTUAL_INJURY_OUTCOME_CODES.map(
		(code) => ({
			label: outcomeLabel(code, locale),
			value: code,
		}),
	);

	return [
		{ key: "title", kind: "text", label: copy.overview.title },
		{
			key: "incidentType",
			kind: "select",
			label: copy.overview.type,
			options: incidentTypeOptions,
			valueLabel: (code) => incidentTypeLabel(code, locale),
		},
		{ key: "incidentAt", kind: "datetime", label: copy.overview.when },
		{
			key: "location",
			kind: "text",
			label: copy.overview.where,
			optional: true,
		},
		{
			key: "actualOutcome",
			kind: "select",
			label: copy.overview.actualOutcome,
			options: actualOutcomeOptions,
			valueLabel: (code) => outcomeLabel(code, locale),
		},
		{
			key: "department",
			kind: "text",
			label: copy.overview.department,
			optional: true,
		},
		{ key: "area", kind: "text", label: copy.overview.area, optional: true },
		{
			key: "workActivity",
			kind: "text",
			label: copy.overview.workActivity,
			optional: true,
		},
		{
			key: "immediateCause",
			kind: "text",
			label: copy.overview.immediateCause,
			optional: true,
		},
		{
			key: "coordinatorName",
			kind: "text",
			label: copy.overview.coordinator,
			optional: true,
		},
	];
}

/**
 * Möglicher Schaden (potential severity): an A–E select where A is the worst.
 * A leading "kein/—" (empty value) clears it. This is the only honest severity
 * an incident post-mortem hand-edits — we do not judge likelihood after the
 * fact, so there is no likelihood control and no derived risk band.
 */
function buildPotentialSeverityField(locale: string): EditableField {
	const options = [
		{ label: `— ${noneOptionLabel(locale)}`, value: "" },
		...SEVERITY_CODES.map((code) => ({
			label: `${code} · ${severityLabel(code, locale)}`,
			value: code,
		})),
	];

	return {
		key: "potentialSeverity",
		kind: "select",
		label: incidentFieldHeading("potentialHarm", locale),
		optional: true,
		options,
		valueLabel: (code) => `${code} · ${severityLabel(code, locale)}`,
	};
}

export default function OverviewEditor({
	incident,
	copy,
	locale,
	onRecordChange,
	onManualRecordChange,
}: OverviewEditorProps) {
	const editableFields = buildEditableFields(copy, locale);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [editing, setEditing] = useState<{
		key: EditableKey;
		value: string;
	} | null>(null);

	const severityField = buildPotentialSeverityField(locale);

	async function save(field: EditableField, raw: string) {
		const value = field.kind === "datetime" ? raw : raw.trim();

		if (!value && !field.optional) {
			setError(`${field.label} ${copy.overview.cannotBeEmpty}`);
			return;
		}

		setBusy(true);
		setError(null);

		try {
			const payload = buildPayload(incident, field.key, value);
			const response = await fetch(
				`/api/incidents/${encodeURIComponent(incident.id)}`,
				{
					body: JSON.stringify(payload),
					credentials: "same-origin",
					headers: {
						accept: "application/json",
						"content-type": "application/json",
						"x-ssfw-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
					},
					method: "PATCH",
				},
			);

			if (!response.ok) {
				const body = (await response.json().catch(() => ({}))) as {
					code?: string;
				};
				throw new Error(body.code ?? `OVERVIEW_SAVE_FAILED_${response.status}`);
			}

			setEditing(null);
			onRecordChange?.();
			onManualRecordChange?.({
				area: "overview",
				summary: `${field.label}: ${displayValue(incident, field) ?? "—"} -> ${
					value || "—"
				}`,
			});
		} catch (caught) {
			setError(userSafeError(caught, copy));
		} finally {
			setBusy(false);
		}
	}

	const controller: EditController = {
		busy,
		copy,
		editing,
		incident,
		onCancel: () => setEditing(null),
		onChange: (next) =>
			setEditing((current) =>
				current ? { ...current, value: next } : current,
			),
		onStart: (field) =>
			setEditing({ key: field.key, value: editValue(incident, field) }),
		save: (field, raw) => void save(field, raw),
	};

	return (
		<div className="grid gap-3">
			{error ? (
				<p className="m-0 rounded-md border border-[var(--color-danger)] px-3 py-2 text-sm text-[var(--color-danger)]">
					{error}
				</p>
			) : null}
			<HarmSummary
				controller={controller}
				incident={incident}
				locale={locale}
				severityField={severityField}
			/>
			<dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
				{editableFields.map((field) => (
					<div
						className="grid grid-cols-[8rem_1fr] items-baseline gap-2"
						key={field.key}
					>
						<dt className="m-0 text-xs text-[var(--color-muted)]">
							{field.label}
						</dt>
						<dd className="m-0 text-sm">
							<InlineField controller={controller} field={field} />
						</dd>
					</div>
				))}
			</dl>
		</div>
	);
}

/**
 * Shared inline edit/save/cancel control. The collapsed state is a text-styled
 * button showing the current value; clicking it opens the field's input with
 * Save/Cancel. Used by both the overview `<dl>` and the harm/risk summary so
 * every editable field follows the same UX.
 */
type EditController = {
	readonly busy: boolean;
	readonly copy: CoachCopy;
	readonly editing: { key: EditableKey; value: string } | null;
	readonly incident: RecordIncident;
	readonly onCancel: () => void;
	readonly onChange: (value: string) => void;
	readonly onStart: (field: EditableField) => void;
	readonly save: (field: EditableField, raw: string) => void;
};

function InlineField({
	controller,
	field,
}: {
	controller: EditController;
	field: EditableField;
}) {
	const { busy, copy, editing, incident } = controller;
	const isEditing = editing?.key === field.key;
	const display = displayValue(incident, field);

	if (isEditing && editing) {
		return (
			<div className="grid gap-1.5">
				{renderInput(field, editing.value, controller.onChange)}
				<div className="flex gap-2">
					<button
						className={primaryButton}
						disabled={busy}
						onClick={() => controller.save(field, editing.value)}
						type="button"
					>
						{busy ? copy.overview.saving : copy.overview.save}
					</button>
					<button
						className={secondaryButton}
						disabled={busy}
						onClick={controller.onCancel}
						type="button"
					>
						{copy.overview.cancel}
					</button>
				</div>
			</div>
		);
	}

	return (
		<button
			className={`m-0 cursor-text border-0 bg-transparent p-0 text-left text-sm leading-6 ${
				display ? "text-[var(--color-text)]" : "text-[var(--color-muted)]"
			}`}
			disabled={busy}
			onClick={() => controller.onStart(field)}
			title={`${copy.overview.editPrefix} ${field.label.toLowerCase()}`}
			type="button"
		>
			{display ?? "—"}
		</button>
	);
}

/**
 * Honesty panel for the two distinct damages, never conflated.
 *  - Tatsächlicher Schaden (actual harm) is DERIVED from the injury outcome
 *    (FATALITY→A … FIRST_AID→E); a near-miss / no-injury shows "Keine
 *    Verletzung" or "—", never the potential severity. READ-ONLY.
 *  - Möglicher Schaden (potential harm, worst-credible severity A–E) is
 *    hand-editable here, with the same inline edit/save/cancel UX as the rest
 *    of the overview. Saving PATCHes the incident.
 *
 * The incident post-mortem does not judge likelihood after the fact, so there
 * is no likelihood control and no derived risk band.
 */
function HarmSummary({
	controller,
	incident,
	locale,
	severityField,
}: {
	controller: EditController;
	incident: RecordIncident;
	locale: string;
	severityField: EditableField;
}) {
	const actualOutcome = incident.actualOutcome
		? parseActualInjuryOutcome(incident.actualOutcome, incident.incidentType)
		: null;
	const actualSeverityCode = actualOutcome
		? deriveActualSeverityFromOutcome(actualOutcome)
		: null;
	const actualHarm = actualSeverityCode
		? `${actualSeverityCode} · ${severityLabel(actualSeverityCode, locale)}`
		: actualOutcome === "NO_INJURY"
			? outcomeLabel("NO_INJURY", locale)
			: "—";

	return (
		<dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2 sm:grid-cols-2">
			<HarmItem label={incidentFieldHeading("actualHarm", locale)}>
				<span className="text-sm">{actualHarm}</span>
			</HarmItem>
			<HarmItem label={severityField.label}>
				<InlineField controller={controller} field={severityField} />
			</HarmItem>
		</dl>
	);
}

function HarmItem({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="grid gap-0.5">
			<dt className="m-0 text-xs text-[var(--color-muted)]">{label}</dt>
			<dd className="m-0 text-sm">{children}</dd>
		</div>
	);
}

function renderInput(
	field: EditableField,
	value: string,
	onChange: (value: string) => void,
) {
	if (field.kind === "select" && field.options) {
		return (
			<select
				className={selectClassName}
				onChange={(event) => onChange(event.currentTarget.value)}
				value={value}
			>
				{field.options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		);
	}

	return (
		<input
			className={inputClassName}
			onChange={(event) => onChange(event.currentTarget.value)}
			type={field.kind === "datetime" ? "datetime-local" : "text"}
			value={value}
		/>
	);
}

/**
 * Build a complete, valid PATCH payload from the current record, overriding the
 * one edited field. PATCH /incidents/[id] re-derives outcomes and risk bands, so
 * we forward every field it reads to avoid clobbering anything on save.
 */
function buildPayload(
	incident: RecordIncident,
	key: EditableKey,
	value: string,
): Record<string, unknown> {
	const incidentType = key === "incidentType" ? value : incident.incidentType;
	const actualOutcome =
		key === "actualOutcome" ? value : (incident.actualOutcome ?? "");
	const potentialSeverityCode =
		key === "potentialSeverity" ? value : (incident.potentialSeverity ?? "");

	return {
		actualInjuryOutcome: actualOutcome,
		areaText: key === "area" ? value : (incident.area ?? ""),
		bodyPart: incident.bodyPart ?? "",
		controlFailure: incident.controlFailure ?? "",
		coordinatorName:
			key === "coordinatorName" ? value : (incident.coordinatorName ?? ""),
		coordinatorRole: incident.coordinatorRole,
		departmentText: key === "department" ? value : (incident.department ?? ""),
		eventType: incident.eventType ?? "",
		hazardCategoryCode: incident.hazardCategory ?? "",
		immediateCause:
			key === "immediateCause" ? value : (incident.immediateCause ?? ""),
		incidentAt: key === "incidentAt" ? value : (incident.incidentAt ?? ""),
		incidentTimeZone: incident.incidentTimeNote ?? "",
		incidentType,
		injuryNature: incident.injuryNature ?? "",
		location: key === "location" ? value : (incident.location ?? ""),
		lostDays: incident.lostDays ?? "",
		potentialOutcomeText: incident.potentialOutcome ?? "",
		potentialSeverityCode,
		processInvolved: incident.processInvolved ?? "",
		title: key === "title" ? value : incident.title,
		workActivity:
			key === "workActivity" ? value : (incident.workActivity ?? ""),
		workType: incident.workType ?? "",
	};
}

function displayValue(
	incident: RecordIncident,
	field: EditableField,
): string | null {
	const raw = rawValue(incident, field.key);

	if (raw === null || raw === "") {
		return null;
	}

	if (field.kind === "datetime") {
		return dateTimeLabel(raw);
	}

	if (field.kind === "select") {
		return field.valueLabel ? field.valueLabel(raw) : raw;
	}

	return raw;
}

function editValue(incident: RecordIncident, field: EditableField): string {
	const raw = rawValue(incident, field.key);

	if (field.kind === "datetime") {
		return toDatetimeLocal(raw);
	}

	if (field.kind === "select") {
		// Selects must hold a valid option; default to the first.
		return raw || (field.options?.[0]?.value ?? "");
	}

	return raw ?? "";
}

function rawValue(incident: RecordIncident, key: EditableKey): string | null {
	switch (key) {
		case "title":
			return incident.title;
		case "incidentType":
			return incident.incidentType;
		case "incidentAt":
			return incident.incidentAt;
		case "location":
			return incident.location;
		case "actualOutcome":
			return incident.actualOutcome;
		case "department":
			return incident.department;
		case "area":
			return incident.area;
		case "workActivity":
			return incident.workActivity;
		case "immediateCause":
			return incident.immediateCause;
		case "coordinatorName":
			return incident.coordinatorName;
		case "potentialSeverity":
			return incident.potentialSeverity;
		default:
			return null;
	}
}

function toDatetimeLocal(value: string | null): string {
	if (!value) {
		return "";
	}

	const date = new Date(value);

	if (Number.isNaN(date.getTime())) {
		return "";
	}

	const pad = (input: number) => String(input).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
		date.getDate(),
	)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function userSafeError(caught: unknown, copy: CoachCopy): string {
	if (caught instanceof Error) {
		const map: Record<string, string> = {
			INCIDENT_NOT_FOUND: copy.overview.errorNotFound,
			INVALID_INCIDENT_PAYLOAD: copy.overview.errorInvalidPayload,
		};

		return map[caught.message] ?? caught.message;
	}

	return copy.overview.errorGeneric;
}
