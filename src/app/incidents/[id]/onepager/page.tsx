import Link from "next/link";
import type { OnePagerExportDialogLabels } from "../../../../components/incident/coach/OnePagerExportDialog";
import OnePagerExportDialog from "../../../../components/incident/coach/OnePagerExportDialog";
import LanguageDropdown from "../../../../components/ui/LanguageDropdown";
import { resolveLocaleContext } from "../../../../lib/auth/locale-server";
import { withTenantConnection } from "../../../../lib/db";
import { t } from "../../../../lib/i18n/t";
import {
	DEFAULT_LOCALE,
	LOCALES,
	type Locale,
} from "../../../../lib/i18n/types";

type OnePagerPageProps = {
	params: Promise<{ id: string }> | { id: string };
};

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const localeNames: Record<Locale, string> = {
	de: "Deutsch",
	en: "English",
	fr: "Français",
	it: "Italiano",
};

type OnePagerPageCopy = {
	signInPrompt: string;
	notFound: string;
	incidents: string;
	onePager: string;
	incidentInvestigation: string;
	dialog: OnePagerExportDialogLabels;
};

const onePagerCopyByLocale: Record<Locale, OnePagerPageCopy> = {
	en: {
		signInPrompt: "Sign in to export this incident.",
		notFound: "Incident not found in your workspace.",
		incidents: "Incidents",
		onePager: "One-pager",
		incidentInvestigation: "Incident investigation",
		dialog: {
			exportLocale: "Export language",
			failed: "Could not generate the one-pager. Please try again.",
			generate: "Generate one-pager (PowerPoint)",
			generating: "Generating…",
			intro:
				"A one-slide summary for the team: what happened, why, what we're changing, and the lessons for everyone. Pick up to three photos to include.",
			localeNames,
			maxPhotosNote: "Up to 3 photos.",
			noPhotos:
				"No photos uploaded yet — you can still generate the one-pager.",
			photoSelectHint: "Select the photos to include:",
			title: "Manager one-pager",
		},
	},
	de: {
		signInPrompt: "Melde dich an, um dieses Ereignis zu exportieren.",
		notFound: "Ereignis in deinem Arbeitsbereich nicht gefunden.",
		incidents: "Ereignisse",
		onePager: "Einseiter",
		incidentInvestigation: "Ereignisuntersuchung",
		dialog: {
			exportLocale: "Exportsprache",
			failed:
				"Einseiter konnte nicht erstellt werden. Bitte versuche es erneut.",
			generate: "Einseiter erstellen (PowerPoint)",
			generating: "Wird erstellt…",
			intro:
				"Eine Zusammenfassung auf einer Folie für das Team: was passiert ist, warum, was wir ändern und die Lehren für alle. Wähle bis zu drei Fotos zum Einfügen.",
			localeNames,
			maxPhotosNote: "Bis zu 3 Fotos.",
			noPhotos:
				"Noch keine Fotos hochgeladen — du kannst den Einseiter trotzdem erstellen.",
			photoSelectHint: "Wähle die einzufügenden Fotos:",
			title: "Manager-Einseiter",
		},
	},
	fr: {
		signInPrompt: "Connecte-toi pour exporter cet événement.",
		notFound: "Événement introuvable dans ton espace de travail.",
		incidents: "Événements",
		onePager: "Note d'une page",
		incidentInvestigation: "Enquête d'événement",
		dialog: {
			exportLocale: "Langue d'export",
			failed: "Impossible de générer la note. Réessaie.",
			generate: "Générer la note d'une page (PowerPoint)",
			generating: "Génération…",
			intro:
				"Un résumé sur une diapositive pour l'équipe : ce qui s'est passé, pourquoi, ce qu'on change et les leçons pour tous. Choisis jusqu'à trois photos à inclure.",
			localeNames,
			maxPhotosNote: "Jusqu'à 3 photos.",
			noPhotos:
				"Aucune photo téléversée pour l'instant — tu peux quand même générer la note.",
			photoSelectHint: "Sélectionne les photos à inclure :",
			title: "Note manager d'une page",
		},
	},
	it: {
		signInPrompt: "Accedi per esportare questo evento.",
		notFound: "Evento non trovato nel tuo spazio di lavoro.",
		incidents: "Eventi",
		onePager: "Scheda di una pagina",
		incidentInvestigation: "Indagine sull'evento",
		dialog: {
			exportLocale: "Lingua di esportazione",
			failed: "Impossibile generare la scheda. Riprova.",
			generate: "Genera la scheda di una pagina (PowerPoint)",
			generating: "Generazione…",
			intro:
				"Un riepilogo in una diapositiva per il team: cosa è successo, perché, cosa stiamo cambiando e le lezioni per tutti. Scegli fino a tre foto da includere.",
			localeNames,
			maxPhotosNote: "Fino a 3 foto.",
			noPhotos:
				"Ancora nessuna foto caricata — puoi comunque generare la scheda.",
			photoSelectHint: "Seleziona le foto da includere:",
			title: "Scheda manager di una pagina",
		},
	},
};

export default async function OnePagerPage({ params }: OnePagerPageProps) {
	const { id } = await Promise.resolve(params);
	const { locale, session } = await resolveLocaleContext();
	const copy = onePagerCopyByLocale[locale] ?? onePagerCopyByLocale.en;

	if (!isUuid(id) || !session) {
		return (
			<Shell copy={copy}>
				<p className="m-0 text-sm text-[var(--color-muted)]">
					{copy.signInPrompt}
				</p>
			</Shell>
		);
	}

	const incident = await loadHeader(session.tenantId, id);

	if (!incident) {
		return (
			<Shell copy={copy}>
				<p className="m-0 text-sm text-[var(--color-muted)]">{copy.notFound}</p>
			</Shell>
		);
	}

	const exportLocale = (incident.contentLanguage as Locale) || locale;

	return (
		<Shell
			caseNumber={incident.caseNumber}
			copy={copy}
			localeControl={
				<LanguageDropdown
					ariaLabel={t("auth.language.label", locale)}
					locale={locale}
				/>
			}
			title={incident.title}
		>
			<OnePagerExportDialog
				caseId={incident.id}
				defaultExportLocale={
					LOCALES.includes(exportLocale) ? exportLocale : DEFAULT_LOCALE
				}
				labels={copy.dialog}
			/>
		</Shell>
	);
}

function Shell({
	caseNumber,
	children,
	copy,
	localeControl,
	title,
}: {
	caseNumber?: string | null;
	children: React.ReactNode;
	copy: OnePagerPageCopy;
	localeControl?: React.ReactNode;
	title?: string;
}) {
	return (
		<main className="min-h-screen bg-[var(--color-bg)] px-4 py-5 text-[var(--color-text)] lg:px-6">
			<div className="mx-auto grid w-full max-w-3xl gap-4">
				<nav className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--color-muted)]">
					<span className="flex flex-wrap items-center gap-2">
						<Link className="hover:text-[var(--color-text)]" href="/incidents">
							{copy.incidents}
						</Link>
						<span>/</span>
						<span>{copy.onePager}</span>
					</span>
					{localeControl}
				</nav>
				{title ? (
					<header className="grid gap-1">
						<p className="m-0 text-xs font-medium uppercase tracking-normal text-[var(--color-muted)]">
							{copy.incidentInvestigation}
							{caseNumber ? ` · ${caseNumber}` : ""}
						</p>
						<h1 className="m-0 text-xl font-semibold">{title}</h1>
					</header>
				) : null}
				{children}
			</div>
		</main>
	);
}

async function loadHeader(
	tenantId: string,
	incidentId: string,
): Promise<{
	id: string;
	caseNumber: string | null;
	title: string;
	contentLanguage: string;
} | null> {
	const rows = await withTenantConnection(
		tenantId,
		async (tx) =>
			tx.$queryRaw<
				Array<{
					id: string;
					caseNumber: string | null;
					title: string;
					contentLanguage: string;
				}>
			>`
			SELECT
				id::text AS id,
				case_number AS "caseNumber",
				title,
				content_language::text AS "contentLanguage"
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
