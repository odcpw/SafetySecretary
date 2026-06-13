import Link from "next/link";
import CoachWorkbench from "../../../../components/incident/coach/CoachWorkbench";
import type { StatusControlsLabels } from "../../../../components/incident/coach/StatusControls";
import StatusControls from "../../../../components/incident/coach/StatusControls";
import LanguageDropdown from "../../../../components/ui/LanguageDropdown";
import { resolveLocaleContext } from "../../../../lib/auth/locale-server";
import { withTenantConnection } from "../../../../lib/db";
import { t } from "../../../../lib/i18n/t";
import type { Locale } from "../../../../lib/i18n/types";

type CoachPageProps = {
	params: Promise<{ id: string }> | { id: string };
};

type CoachPageCopy = {
	invalidLink: string;
	signInPrompt: string;
	notFound: string;
	export: string;
	fullReportWord: string;
	fullReportPdf: string;
	commsWord: string;
	managerOnePager: string;
	approve: string;
	incidents: string;
	coach: string;
	incidentInvestigation: string;
	status: StatusControlsLabels;
};

const coachPageCopyByLocale: Record<Locale, CoachPageCopy> = {
	en: {
		invalidLink: "This incident link is not valid.",
		signInPrompt: "Sign in to work on this investigation.",
		notFound: "This incident could not be found in your workspace.",
		export: "Export",
		fullReportWord: "Full report (Word)",
		fullReportPdf: "Full report (PDF)",
		commsWord: "Comms one-pager (Word)",
		managerOnePager: "Manager one-pager (PowerPoint)…",
		approve: "Approve",
		incidents: "Incidents",
		coach: "Chat",
		incidentInvestigation: "Incident investigation",
		status: {
			actions: {
				close: "Close",
				pause: "Pause",
				reopen: "Reopen",
				resume: "Resume",
				start: "Start investigation",
			},
			errorNotFound: "This incident is no longer available.",
			errorInvalidAction: "That action is not valid here.",
			errorInvalidTransition:
				"That step is not available from the current status. The page was refreshed.",
			errorGeneric: "Something went wrong. Try again.",
		},
	},
	de: {
		invalidLink: "Dieser Ereignis-Link ist nicht gültig.",
		signInPrompt: "Melde dich an, um an dieser Untersuchung zu arbeiten.",
		notFound: "Dieses Ereignis wurde in deinem Arbeitsbereich nicht gefunden.",
		export: "Export",
		fullReportWord: "Vollbericht (Word)",
		fullReportPdf: "Vollbericht (PDF)",
		commsWord: "Kommunikations-Einseiter (Word)",
		managerOnePager: "Manager-Einseiter (PowerPoint)…",
		approve: "Freigeben",
		incidents: "Ereignisse",
		coach: "Chat",
		incidentInvestigation: "Ereignisuntersuchung",
		status: {
			actions: {
				close: "Abschliessen",
				pause: "Pausieren",
				reopen: "Wieder öffnen",
				resume: "Fortsetzen",
				start: "Untersuchung starten",
			},
			errorNotFound: "Dieses Ereignis ist nicht mehr verfügbar.",
			errorInvalidAction: "Diese Aktion ist hier nicht gültig.",
			errorInvalidTransition:
				"Dieser Schritt ist vom aktuellen Status aus nicht verfügbar. Die Seite wurde aktualisiert.",
			errorGeneric: "Etwas ist schiefgelaufen. Versuche es erneut.",
		},
	},
	fr: {
		invalidLink: "Ce lien d'événement n'est pas valide.",
		signInPrompt: "Connecte-toi pour travailler sur cette enquête.",
		notFound: "Cet événement est introuvable dans ton espace de travail.",
		export: "Export",
		fullReportWord: "Rapport complet (Word)",
		fullReportPdf: "Rapport complet (PDF)",
		commsWord: "Note d'une page (Word)",
		managerOnePager: "Note manager d'une page (PowerPoint)…",
		approve: "Approuver",
		incidents: "Événements",
		coach: "Chat",
		incidentInvestigation: "Enquête d'événement",
		status: {
			actions: {
				close: "Clôturer",
				pause: "Mettre en pause",
				reopen: "Rouvrir",
				resume: "Reprendre",
				start: "Démarrer l'enquête",
			},
			errorNotFound: "Cet événement n'est plus disponible.",
			errorInvalidAction: "Cette action n'est pas valide ici.",
			errorInvalidTransition:
				"Cette étape n'est pas disponible depuis le statut actuel. La page a été actualisée.",
			errorGeneric: "Une erreur s'est produite. Réessaie.",
		},
	},
	it: {
		invalidLink: "Questo link dell'evento non è valido.",
		signInPrompt: "Accedi per lavorare a questa indagine.",
		notFound: "Questo evento non è stato trovato nel tuo spazio di lavoro.",
		export: "Esporta",
		fullReportWord: "Rapporto completo (Word)",
		fullReportPdf: "Rapporto completo (PDF)",
		commsWord: "Scheda di una pagina (Word)",
		managerOnePager: "Scheda manager di una pagina (PowerPoint)…",
		approve: "Approva",
		incidents: "Eventi",
		coach: "Chat",
		incidentInvestigation: "Indagine sull'evento",
		status: {
			actions: {
				close: "Chiudi",
				pause: "Metti in pausa",
				reopen: "Riapri",
				resume: "Riprendi",
				start: "Avvia indagine",
			},
			errorNotFound: "Questo evento non è più disponibile.",
			errorInvalidAction: "Questa azione non è valida qui.",
			errorInvalidTransition:
				"Questo passaggio non è disponibile dallo stato attuale. La pagina è stata aggiornata.",
			errorGeneric: "Qualcosa è andato storto. Riprova.",
		},
	},
};

type CoachIncidentHeader = {
	id: string;
	caseNumber: string | null;
	title: string;
	contentLanguage: string;
	workflowStage: string;
};

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function IncidentCoachPage({ params }: CoachPageProps) {
	const { id } = await Promise.resolve(params);
	const { locale, session } = await resolveLocaleContext();
	const copy = coachPageCopyByLocale[locale] ?? coachPageCopyByLocale.en;

	if (!isUuid(id)) {
		return (
			<CoachShell copy={copy} title={copy.incidentInvestigation}>
				<p className="m-0 text-sm text-[var(--color-muted)]">
					{copy.invalidLink}
				</p>
			</CoachShell>
		);
	}

	if (!session) {
		return (
			<CoachShell copy={copy} title={copy.incidentInvestigation}>
				<p className="m-0 text-sm text-[var(--color-muted)]">
					{copy.signInPrompt}
				</p>
			</CoachShell>
		);
	}

	const incident = await loadIncidentHeader(session.tenantId, id);

	if (!incident) {
		return (
			<CoachShell copy={copy} title={copy.incidentInvestigation}>
				<p className="m-0 text-sm text-[var(--color-muted)]">{copy.notFound}</p>
			</CoachShell>
		);
	}

	const exportBase = `/api/incidents/${incident.id}/export`;
	// For an existing incident the coach keeps replying in (and the export
	// defaults to) the incident's stored content_language so chat and record
	// stay consistent. Changing the global language dropdown switches the UI
	// chrome and future incidents, but never rewrites this incident's content.
	const contentLocale = incident.contentLanguage || locale;

	return (
		<CoachShell
			localeControl={
				<LanguageDropdown
					ariaLabel={t("auth.language.label", locale)}
					locale={locale}
				/>
			}
			action={
				<div className="flex flex-wrap items-center gap-2">
					<details className="relative">
						<summary className="inline-flex min-h-10 cursor-pointer list-none items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elev)] px-4 py-2 text-sm font-medium text-[var(--color-text)] transition hover:border-[var(--color-accent)]">
							{copy.export}
						</summary>
						<div className="absolute right-0 z-10 mt-1 grid w-60 gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-lg">
							<a
								className={exportLinkClassName}
								href={`${exportBase}?report=full-report&format=docx&locale=${contentLocale}`}
							>
								{copy.fullReportWord}
							</a>
							<a
								className={exportLinkClassName}
								href={`${exportBase}?report=full-report&format=pdf&locale=${contentLocale}`}
							>
								{copy.fullReportPdf}
							</a>
							<a
								className={exportLinkClassName}
								href={`${exportBase}?report=comms&format=docx&locale=${contentLocale}`}
							>
								{copy.commsWord}
							</a>
							<a
								className={exportLinkClassName}
								href={`/incidents/${incident.id}/onepager`}
							>
								{copy.managerOnePager}
							</a>
						</div>
					</details>
					<StatusControls
						incidentId={incident.id}
						labels={copy.status}
						workflowStage={incident.workflowStage}
					/>
					<Link
						className="inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elev)] px-4 py-2 text-sm font-medium text-[var(--color-text)] transition hover:border-[var(--color-accent)]"
						href={`/incidents/${incident.id}/approval`}
					>
						{copy.approve}
					</Link>
				</div>
			}
			caseNumber={incident.caseNumber}
			copy={copy}
			title={incident.title}
		>
			<CoachWorkbench
				incidentId={incident.id}
				locale={locale}
				replyLocale={contentLocale}
			/>
		</CoachShell>
	);
}

const exportLinkClassName =
	"rounded px-2 py-1.5 text-sm text-[var(--color-text)] transition hover:bg-[var(--color-surface-elev)]";

function CoachShell({
	action,
	caseNumber,
	children,
	copy,
	localeControl,
	title,
}: {
	action?: React.ReactNode;
	caseNumber?: string | null;
	children: React.ReactNode;
	copy: CoachPageCopy;
	localeControl?: React.ReactNode;
	title: string;
}) {
	return (
		<main className="min-h-screen bg-[var(--color-bg)] px-4 py-5 text-[var(--color-text)] lg:px-6">
			<div className="mx-auto grid w-full max-w-[96rem] gap-4">
				<nav className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--color-muted)]">
					<span className="flex flex-wrap items-center gap-2">
						<Link className="hover:text-[var(--color-text)]" href="/incidents">
							{copy.incidents}
						</Link>
						<span>/</span>
						<span>{copy.coach}</span>
					</span>
					{localeControl}
				</nav>
				<header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="grid gap-1">
						<p className="m-0 text-xs font-medium uppercase tracking-normal text-[var(--color-muted)]">
							{copy.incidentInvestigation}
							{caseNumber ? ` · ${caseNumber}` : ""}
						</p>
						<h1 className="m-0 text-xl font-semibold">{title}</h1>
					</div>
					{action}
				</header>
				{children}
			</div>
		</main>
	);
}

async function loadIncidentHeader(
	tenantId: string,
	incidentId: string,
): Promise<CoachIncidentHeader | null> {
	const rows = await withTenantConnection(
		tenantId,
		async (tx) =>
			tx.$queryRaw<CoachIncidentHeader[]>`
			SELECT
				id::text AS id,
				case_number AS "caseNumber",
				title,
				content_language::text AS "contentLanguage",
				workflow_stage::text AS "workflowStage"
			FROM incident_case
			WHERE id = ${incidentId}::uuid
			LIMIT 1
		`,
	);

	return rows[0] ?? null;
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}
