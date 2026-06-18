import Link from "next/link";
import IncidentRowMenu from "../../components/incident/IncidentRowMenu";
import NewIncidentButton from "../../components/incident/NewIncidentButton";
import LanguageDropdown from "../../components/ui/LanguageDropdown";
import { resolveLocaleContext } from "../../lib/auth/locale-server";
import { withTenantConnection } from "../../lib/db";
import { t } from "../../lib/i18n/t";
import type { Locale, MessageKey } from "../../lib/i18n/types";
import {
	deriveActualSeverityFromOutcome,
	normalizeIncidentClassification,
} from "../../lib/incident/classification";
import { incidentFieldHeading, outcomeLabel } from "../../lib/incident/labels";
import {
	type IncidentLifecycleStage,
	type IncidentRegisterStatus,
	type IncidentWorkflowStage,
	isLifecycleStage,
	isWorkflowStage,
	registerStatus,
} from "../../lib/incident/workflow-stage";
import { loadTaxonomy } from "../../lib/taxonomy";

type IncidentListRow = {
	id: string;
	caseNumber: string | null;
	title: string;
	incidentAt: Date | null;
	incidentTimeNote: string | null;
	location: string | null;
	incidentType: string;
	actualInjuryOutcome: string | null;
	actualSeverityCode: string | null;
	potentialSeverityCode: string | null;
	workflowStage: string;
	updatedAt: Date;
};

type StatusFilter = IncidentRegisterStatus | "all";

type RegisterCopy = {
	listDescription: string;
	filterAll: string;
	filterOpen: string;
	filterClosed: string;
	statusFilterLabel: string;
	columnStatus: string;
	stageCaptured: string;
	stageInvestigating: string;
	stagePaused: string;
	stageClosed: string;
	rowMenuLabel: string;
	rowMenuOpen: string;
	rowMenuDelete: string;
	rowMenuConfirm: string;
	rowMenuError: string;
};

const registerCopyByLocale: Record<Locale, RegisterCopy> = {
	en: {
		listDescription:
			"Start and reopen incident investigations for the current company.",
		filterAll: "All",
		filterOpen: "Open",
		filterClosed: "Closed",
		statusFilterLabel: "Status filter",
		columnStatus: "Status",
		stageCaptured: "Captured",
		stageInvestigating: "Investigating",
		stagePaused: "Paused",
		stageClosed: "Closed",
		rowMenuLabel: "Case actions",
		rowMenuOpen: "Open",
		rowMenuDelete: "Delete",
		rowMenuConfirm: "Delete this case? It will be removed from the register.",
		rowMenuError: "Could not delete. Please try again.",
	},
	de: {
		listDescription: "Starte und öffne Untersuchungen für die aktuelle Firma.",
		filterAll: "Alle",
		filterOpen: "Offen",
		filterClosed: "Abgeschlossen",
		statusFilterLabel: "Statusfilter",
		columnStatus: "Status",
		stageCaptured: "Erfasst",
		stageInvestigating: "In Untersuchung",
		stagePaused: "Pausiert",
		stageClosed: "Abgeschlossen",
		rowMenuLabel: "Fallaktionen",
		rowMenuOpen: "Öffnen",
		rowMenuDelete: "Löschen",
		rowMenuConfirm: "Diesen Fall löschen? Er wird aus dem Register entfernt.",
		rowMenuError: "Löschen fehlgeschlagen. Bitte erneut versuchen.",
	},
	fr: {
		listDescription:
			"Démarrer et rouvrir les enquêtes d'incident de l'entreprise actuelle.",
		filterAll: "Tous",
		filterOpen: "Ouvert",
		filterClosed: "Clôturé",
		statusFilterLabel: "Filtre de statut",
		columnStatus: "Statut",
		stageCaptured: "Saisi",
		stageInvestigating: "En enquête",
		stagePaused: "En pause",
		stageClosed: "Clôturé",
		rowMenuLabel: "Actions du cas",
		rowMenuOpen: "Ouvrir",
		rowMenuDelete: "Supprimer",
		rowMenuConfirm: "Supprimer ce cas ? Il sera retiré du registre.",
		rowMenuError: "Suppression impossible. Veuillez réessayer.",
	},
	it: {
		listDescription:
			"Avvia e riapri le indagini sugli incidenti dell'azienda corrente.",
		filterAll: "Tutti",
		filterOpen: "Aperto",
		filterClosed: "Chiuso",
		statusFilterLabel: "Filtro di stato",
		columnStatus: "Stato",
		stageCaptured: "Registrato",
		stageInvestigating: "In indagine",
		stagePaused: "In pausa",
		stageClosed: "Chiuso",
		rowMenuLabel: "Azioni del caso",
		rowMenuOpen: "Apri",
		rowMenuDelete: "Elimina",
		rowMenuConfirm: "Eliminare questo caso? Verrà rimosso dal registro.",
		rowMenuError: "Eliminazione non riuscita. Riprova.",
	},
};

const defaultIncidentTimeZone = "europe/zurich";

type IncidentsPageProps = {
	searchParams?:
		| Promise<Record<string, string | string[] | undefined>>
		| Record<string, string | string[] | undefined>;
};

export default async function IncidentsPage({
	searchParams,
}: IncidentsPageProps) {
	const resolvedParams = await Promise.resolve(searchParams ?? {});
	const statusFilter = parseStatusFilter(resolvedParams.status);
	const { locale, session } = await resolveLocaleContext();
	const copy = registerCopyByLocale[locale] ?? registerCopyByLocale.en;
	const statusFilters: ReadonlyArray<{ value: StatusFilter; label: string }> = [
		{ label: copy.filterAll, value: "all" },
		{ label: copy.filterOpen, value: "open" },
		{ label: copy.filterClosed, value: "closed" },
	];

	if (!session) {
		return (
			<IncidentsShell locale={locale} title={tr("incident.list.title", locale)}>
				<p className="m-0 text-sm text-[var(--color-muted)]">
					{tr(messageKey("incident", "authRequired"), locale)}
				</p>
			</IncidentsShell>
		);
	}

	const allIncidents = await loadIncidents(session.tenantId);
	const incidents =
		statusFilter === "all"
			? allIncidents
			: allIncidents.filter(
					(incident) => incidentRegisterStatus(incident) === statusFilter,
				);

	return (
		<IncidentsShell
			action={<NewIncidentButton label={tr("incident.action.new", locale)} />}
			description={copy.listDescription}
			locale={locale}
			title={tr("incident.list.title", locale)}
		>
			<nav
				aria-label={copy.statusFilterLabel}
				className="flex flex-wrap items-center gap-2 text-sm"
			>
				{statusFilters.map((filter) => {
					const active = filter.value === statusFilter;
					return (
						<Link
							aria-current={active ? "page" : undefined}
							className={`inline-flex min-h-9 items-center rounded-md border px-3 py-1.5 ${
								active
									? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-bg)]"
									: "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-text)]"
							}`}
							href={
								filter.value === "all"
									? "/incidents"
									: `/incidents?status=${filter.value}`
							}
							key={filter.value}
						>
							{filter.label}
						</Link>
					);
				})}
			</nav>
			{incidents.length === 0 ? (
				<section className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
					<p className="m-0 text-sm text-[var(--color-muted)]">
						{tr("incident.list.empty", locale)}
					</p>
				</section>
			) : (
				<section className="overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-surface)]">
					<div className="overflow-x-auto">
						<table className="w-full border-separate border-spacing-0 text-left text-sm">
							<thead>
								<tr className="text-[var(--color-muted)]">
									<th className="border-b border-[var(--color-border)] px-3 py-2 font-medium">
										{tr(messageKey("incident", "field", "caseNumber"), locale)}
									</th>
									<th className="border-b border-[var(--color-border)] px-3 py-2 font-medium">
										{tr("incident.field.title", locale)}
									</th>
									<th className="border-b border-[var(--color-border)] px-3 py-2 font-medium">
										{tr(messageKey("incident", "field", "incidentAt"), locale)}
									</th>
									<th className="border-b border-[var(--color-border)] px-3 py-2 font-medium">
										{tr(
											messageKey("incident", "field", "incidentType"),
											locale,
										)}
									</th>
									<th className="border-b border-[var(--color-border)] px-3 py-2 font-medium">
										{incidentFieldHeading("actualHarm", locale)}
									</th>
									<th className="border-b border-[var(--color-border)] px-3 py-2 font-medium">
										{incidentFieldHeading("potentialHarm", locale)}
									</th>
									<th className="border-b border-[var(--color-border)] px-3 py-2 font-medium">
										{tr("incident.field.location", locale)}
									</th>
									<th className="border-b border-[var(--color-border)] px-3 py-2 font-medium">
										{copy.columnStatus}
									</th>
									<th className="w-px border-b border-[var(--color-border)] px-3 py-2">
										<span className="sr-only">{copy.rowMenuLabel}</span>
									</th>
								</tr>
							</thead>
							<tbody>
								{incidents.map((incident) => (
									<tr
										className="transition-colors hover:bg-[var(--color-surface-elev)]"
										key={incident.id}
									>
										<td className="whitespace-nowrap border-b border-[var(--color-border)] px-3 py-2 text-[var(--color-muted)]">
											{incident.caseNumber ?? "-"}
										</td>
										<td className="border-b border-[var(--color-border)] px-3 py-2">
											<div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
												<Link
													className="font-medium text-[var(--color-text)] underline-offset-4 hover:underline"
													href={`/incidents/${incident.id}/coach`}
												>
													{incident.title}
												</Link>
											</div>
										</td>
										<td className="border-b border-[var(--color-border)] px-3 py-2 text-[var(--color-muted)]">
											{formatDateTime(
												incident.incidentAt,
												locale,
												incidentTimeZoneValue(incident.incidentTimeNote),
											)}
										</td>
										<td className="border-b border-[var(--color-border)] px-3 py-2">
											{incidentTypeSummary(
												incident.incidentType,
												incident.actualInjuryOutcome,
												locale,
											)}
										</td>
										<td className="border-b border-[var(--color-border)] px-3 py-2">
											{actualHarmSummary(incident, locale)}
										</td>
										<td className="border-b border-[var(--color-border)] px-3 py-2">
											{potentialHarmSummary(incident, locale)}
										</td>
										<td className="border-b border-[var(--color-border)] px-3 py-2 text-[var(--color-muted)]">
											{incident.location ?? "-"}
										</td>
										<td className="border-b border-[var(--color-border)] px-3 py-2">
											<span
												className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${
													incidentRegisterStatus(incident) === "closed"
														? "border-[var(--color-border)] text-[var(--color-muted)]"
														: "border-[var(--color-accent)] text-[var(--color-accent)]"
												}`}
											>
												{workflowStageLabel(
													incident.workflowStage,
													locale,
													copy,
												)}
											</span>
										</td>
										<td className="border-b border-[var(--color-border)] px-3 py-2 text-right">
											<IncidentRowMenu
												incidentId={incident.id}
												labels={{
													confirm: copy.rowMenuConfirm,
													delete: copy.rowMenuDelete,
													error: copy.rowMenuError,
													menu: copy.rowMenuLabel,
													open: copy.rowMenuOpen,
												}}
											/>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</section>
			)}
		</IncidentsShell>
	);
}

async function loadIncidents(tenantId: string): Promise<IncidentListRow[]> {
	return withTenantConnection(
		tenantId,
		async (tx) =>
			tx.$queryRaw<IncidentListRow[]>`
			SELECT
				id::text AS id,
				case_number AS "caseNumber",
				title,
				incident_at AS "incidentAt",
				incident_time_note AS "incidentTimeNote",
					location,
					incident_type::text AS "incidentType",
					actual_injury_outcome::text AS "actualInjuryOutcome",
					actual_severity_code AS "actualSeverityCode",
					potential_severity_code AS "potentialSeverityCode",
					workflow_stage::text AS "workflowStage",
				updated_at AS "updatedAt"
			FROM incident_case
			WHERE deleted_at IS NULL
			ORDER BY updated_at DESC, created_at DESC, title ASC
		`,
	);
}

function IncidentsShell({
	action,
	children,
	description,
	locale,
	title,
}: {
	action?: React.ReactNode;
	children: React.ReactNode;
	description?: string;
	locale: Locale;
	title: string;
}) {
	return (
		<main className="min-h-screen bg-[var(--color-bg)] px-4 py-5 text-[var(--color-text)] lg:px-6">
			<div className="mx-auto grid w-full max-w-6xl gap-5">
				<nav className="flex items-center justify-between gap-2 text-sm text-[var(--color-muted)]">
					<Link className="hover:text-[var(--color-text)]" href="/workspace">
						{tr("nav.incidents", locale)}
					</Link>
					<LanguageDropdown
						ariaLabel={tr("auth.language.label", locale)}
						locale={locale}
					/>
				</nav>
				<header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="grid gap-2">
						<h1 className="m-0 text-xl font-semibold">{title}</h1>
						{description ? (
							<p className="m-0 max-w-3xl text-sm text-[var(--color-muted)]">
								{description}
							</p>
						) : null}
					</div>
					{action}
				</header>
				{children}
			</div>
		</main>
	);
}

function incidentTypeLabel(value: string, locale: Locale): string {
	const keys: Record<string, MessageKey> = {
		ACCIDENT: messageKey("incident", "type", "accident"),
		FIRST_AID: messageKey("incident", "type", "firstAid"),
		LOST_TIME: messageKey("incident", "type", "lostTime"),
		NEAR_MISS: messageKey("incident", "type", "nearMiss"),
		PROPERTY_DAMAGE: messageKey("incident", "type", "propertyDamage"),
	};

	return t(keys[value] ?? messageKey("incident", "type", "nearMiss"), locale);
}

function actualInjuryOutcomeLabel(
	value: string | null,
	locale: Locale,
): string | null {
	const keys: Record<string, MessageKey> = {
		FATALITY: messageKey("incident", "actualInjuryOutcome", "fatality"),
		FIRST_AID: messageKey("incident", "actualInjuryOutcome", "firstAid"),
		IRREVERSIBLE_INJURY: messageKey(
			"incident",
			"actualInjuryOutcome",
			"irreversibleInjury",
		),
		LOST_TIME: messageKey("incident", "actualInjuryOutcome", "lostTime"),
		MEDICAL_TREATMENT: messageKey(
			"incident",
			"actualInjuryOutcome",
			"medicalTreatment",
		),
		NO_INJURY: messageKey("incident", "actualInjuryOutcome", "noInjury"),
		UNKNOWN: messageKey("incident", "actualInjuryOutcome", "unknown"),
	};

	return value && keys[value] ? t(keys[value], locale) : null;
}

function incidentTypeSummary(
	incidentType: string,
	actualInjuryOutcome: string | null,
	locale: Locale,
): string {
	const legacySeverity =
		incidentType === "FIRST_AID" || incidentType === "LOST_TIME"
			? incidentType
			: actualInjuryOutcome;
	const type =
		incidentType === "FIRST_AID" || incidentType === "LOST_TIME"
			? "ACCIDENT"
			: incidentType;
	const severityLabel = actualInjuryOutcomeLabel(legacySeverity, locale);

	return severityLabel
		? `${incidentTypeLabel(type, locale)} - ${severityLabel}`
		: incidentTypeLabel(type, locale);
}

/**
 * Collapse any stored workflow stage onto the four register lifecycle states.
 * The internal investigation phases (FACTS/CAUSES/measures…) must never reach
 * the UI: FACTS is the DB default a brand-new case carries before an
 * investigation is actually started, so it reads as CAPTURE; the remaining
 * active legacy phases describe a live investigation, and APPROVED is terminal.
 */
function lifecycleStageForDisplay(value: string): IncidentLifecycleStage {
	if (isLifecycleStage(value)) {
		return value;
	}

	if (value === "APPROVED") {
		return "CLOSED";
	}

	if (value === "FACTS") {
		return "CAPTURE";
	}

	// TIMELINE, CAUSES, ACTIONS, REVIEW — investigation underway.
	return "INVESTIGATING";
}

function workflowStageLabel(
	value: string,
	_locale: Locale,
	copy: RegisterCopy,
): string {
	// The Status column shows the register lifecycle stage, never the internal
	// investigation phase. Lifecycle labels are localized via the page copy map.
	const lifecycleLabels: Record<IncidentLifecycleStage, string> = {
		CAPTURE: copy.stageCaptured,
		CLOSED: copy.stageClosed,
		INVESTIGATING: copy.stageInvestigating,
		PAUSED: copy.stagePaused,
	};

	return lifecycleLabels[lifecycleStageForDisplay(value)];
}

function parseStatusFilter(value: string | string[] | undefined): StatusFilter {
	const raw = Array.isArray(value) ? value[0] : value;

	if (raw === "open" || raw === "closed") {
		return raw;
	}

	return "all";
}

function incidentRegisterStatus(
	incident: IncidentListRow,
): IncidentRegisterStatus {
	const stage: IncidentWorkflowStage = isWorkflowStage(incident.workflowStage)
		? incident.workflowStage
		: "CAPTURE";

	return registerStatus(stage);
}

/**
 * Tatsächlicher Schaden = the actual harm, derived from the recorded injury
 * outcome (FATALITY→A … FIRST_AID→E). A near-miss / no-injury yields no
 * severity code: we show "Keine Verletzung" for an explicit NO_INJURY and "—"
 * for an unknown outcome. We never borrow the potential severity here.
 */
function actualHarmSummary(incident: IncidentListRow, locale: Locale): string {
	const { actualInjuryOutcome } = normalizeIncidentClassification({
		actualInjuryOutcome: incident.actualInjuryOutcome,
		incidentType: incident.incidentType,
	});
	const code = deriveActualSeverityFromOutcome(actualInjuryOutcome);
	const label = severityCodeWithLabel(code, locale);

	if (label) {
		return label;
	}

	return actualInjuryOutcome === "NO_INJURY"
		? outcomeLabel("NO_INJURY", locale)
		: "—";
}

/**
 * Möglicher Schaden = the worst-credible potential severity (A–E). This is a
 * distinct field from the actual harm and is shown verbatim; it carries no
 * "(möglich)" qualifier — the column heading already says "Möglicher Schaden".
 */
function potentialHarmSummary(
	incident: IncidentListRow,
	locale: Locale,
): string {
	return severityCodeWithLabel(incident.potentialSeverityCode, locale) ?? "—";
}

function severityCodeWithLabel(
	value: string | null,
	locale: Locale,
): string | null {
	if (!value) {
		return null;
	}

	const severity = loadTaxonomy(locale).severity.find(
		(item) => item.code === value,
	);
	return severity ? `${severity.code} - ${severity.label}` : value;
}

function tr(key: MessageKey, locale: Locale): string {
	return t(key, locale);
}

function messageKey(...parts: string[]): MessageKey {
	return parts.join(".") as MessageKey;
}

function formatDateTime(
	value: Date | null,
	locale: Locale,
	timeZone: string,
): string {
	if (!value) {
		return "-";
	}

	return new Intl.DateTimeFormat(locale, {
		dateStyle: "medium",
		timeStyle: "short",
		timeZone,
	}).format(value);
}

function incidentTimeZoneValue(value: string | null): string {
	const candidate = value?.trim() || defaultIncidentTimeZone;

	try {
		return new Intl.DateTimeFormat("en", {
			timeZone: candidate,
		}).resolvedOptions().timeZone;
	} catch {
		return new Intl.DateTimeFormat("en", {
			timeZone: defaultIncidentTimeZone,
		}).resolvedOptions().timeZone;
	}
}
