import LanguageDropdown from "../../components/ui/LanguageDropdown";
import type { Locale } from "../../lib/i18n/types";
import LandingAuthActions, { type LandingAuthCopy } from "./LandingAuthActions";
import WorkbenchTile from "./WorkbenchTile";

type LandingCopy = {
	tagline: string;
	intro: string;
	languageLabel: string;
	workbenchesLabel: string;
	iiTitle: string;
	iiBlurb: string;
	hiraTitle: string;
	hiraBlurb: string;
	comingSoon: string;
	signInFooter: string;
	auth: LandingAuthCopy;
};

const landingCopyByLocale: Record<Locale, LandingCopy> = {
	en: {
		tagline:
			"Record and investigate a workplace incident by talking it through.",
		intro:
			"A chat that helps a manager work through what happened, asks what it needs to know, and fills in the report as you talk.",
		languageLabel: "Language",
		workbenchesLabel: "Workbenches",
		iiTitle: "Incident Investigation",
		iiBlurb:
			"Investigate an incident by talking it through. The secretary asks what it needs and fills the record as you go.",
		hiraTitle: "HIRA / Risk Assessment",
		hiraBlurb:
			"Spot hazards and assess risk before anyone gets hurt. Built on the same talk-it-through approach.",
		comingSoon: "Coming soon",
		signInFooter:
			"Your sign-in link is your own workspace. We email it — no password to remember.",
		auth: {
			signIn: "Sign in",
			tryWorkspace: "Try it (test workspace)",
			starting: "Starting...",
			error: "Test workspace could not be started.",
		},
	},
	de: {
		tagline:
			"Erfasse und untersuche ein Ereignis am Arbeitsplatz, indem du es durchsprichst.",
		intro:
			"Ein Chat, der einer Führungskraft hilft, durchzugehen, was passiert ist, nachfragt, was er wissen muss, und den Bericht ausfüllt, während du erzählst.",
		languageLabel: "Sprache",
		workbenchesLabel: "Workbenches",
		iiTitle: "Ereignisuntersuchung",
		iiBlurb:
			"Untersuche ein Ereignis, indem du es durchsprichst. Das Secretary fragt nach, was es braucht, und füllt den Datensatz während du erzählst.",
		hiraTitle: "HIRA / Risikobeurteilung",
		hiraBlurb:
			"Erkenne Gefahren und beurteile das Risiko, bevor jemand verletzt wird. Auf demselben Erzähl-Ansatz aufgebaut.",
		comingSoon: "Demnächst",
		signInFooter:
			"Dein Anmeldelink ist dein eigener Arbeitsbereich. Wir senden ihn per E-Mail — kein Passwort zum Merken.",
		auth: {
			signIn: "Anmelden",
			tryWorkspace: "Ausprobieren (Test-Arbeitsbereich)",
			starting: "Wird gestartet...",
			error: "Der Test-Arbeitsbereich konnte nicht gestartet werden.",
		},
	},
	fr: {
		tagline:
			"Enregistre et enquête sur un événement au travail en le racontant.",
		intro:
			"Une discussion qui aide un responsable à passer en revue ce qui s'est passé, demande ce qu'elle doit savoir et remplit le rapport au fur et à mesure que tu racontes.",
		languageLabel: "Langue",
		workbenchesLabel: "Espaces de travail",
		iiTitle: "Enquête d'événement",
		iiBlurb:
			"Enquête sur un événement en le racontant. Le secretary demande ce dont il a besoin et remplit le dossier au fur et à mesure.",
		hiraTitle: "HIRA / Évaluation des risques",
		hiraBlurb:
			"Repérer les dangers et évaluer le risque avant que quelqu'un soit blessé. Construit sur la même approche par le dialogue.",
		comingSoon: "Bientôt disponible",
		signInFooter:
			"Ton lien de connexion est ton propre espace de travail. Nous l'envoyons par e-mail — aucun mot de passe à retenir.",
		auth: {
			signIn: "Se connecter",
			tryWorkspace: "Essayer (espace de test)",
			starting: "Démarrage...",
			error: "L'espace de test n'a pas pu être démarré.",
		},
	},
	it: {
		tagline: "Registra e indaga un evento sul lavoro raccontandolo.",
		intro:
			"Una chat che aiuta un responsabile a ripercorrere cosa è successo, chiede ciò che deve sapere e compila il rapporto mentre racconti.",
		languageLabel: "Lingua",
		workbenchesLabel: "Spazi di lavoro",
		iiTitle: "Indagine sull'evento",
		iiBlurb:
			"Indaga su un evento raccontandolo. Il secretary chiede ciò che serve e compila il record mentre procedi.",
		hiraTitle: "HIRA / Valutazione del rischio",
		hiraBlurb:
			"Individua i pericoli e valuta il rischio prima che qualcuno si faccia male. Costruito sullo stesso approccio del dialogo.",
		comingSoon: "Prossimamente",
		signInFooter:
			"Il tuo link di accesso è il tuo spazio di lavoro. Lo inviamo via e-mail — nessuna password da ricordare.",
		auth: {
			signIn: "Accedi",
			tryWorkspace: "Provalo (spazio di test)",
			starting: "Avvio...",
			error: "Lo spazio di test non è stato avviato.",
		},
	},
};

type LandingShellProps = {
	readonly locale: Locale;
};

/**
 * The public landing page (route "/").
 *
 * Server component: only the auth actions island is a client component. Locale
 * comes from the Accept-Language header (no session here), resolved by the page.
 * Dark mode is inherited from the `dark` class on <html> in the root layout, so
 * no theme handling is needed here.
 */
export default function LandingShell({ locale }: LandingShellProps) {
	const copy = landingCopyByLocale[locale] ?? landingCopyByLocale.en;
	return (
		<main className="flex min-h-screen flex-col items-center justify-center px-6 py-16 font-[family-name:var(--font-sans)] text-[var(--color-text)]">
			<div className="flex w-full max-w-[44rem] flex-col gap-10">
				<header className="flex flex-col gap-3">
					<div className="flex items-center justify-between gap-2.5">
						<div className="flex items-center gap-2.5">
							<span
								aria-hidden="true"
								className="flex size-7 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-accent)]"
							>
								<svg
									fill="none"
									height="16"
									role="presentation"
									stroke="currentColor"
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth="1.6"
									viewBox="0 0 24 24"
									width="16"
								>
									<path d="M12 3 4 6v5c0 4.4 3.1 8.2 8 9.5 4.9-1.3 8-5.1 8-9.5V6l-8-3Z" />
									<path d="m9 12 2 2 4-4" />
								</svg>
							</span>
							<span className="text-[var(--text-lg)] font-semibold tracking-tight text-[var(--color-text)]">
								Safety Secretary
							</span>
						</div>
						<LanguageDropdown
							ariaLabel={copy.languageLabel}
							locale={locale}
							signedIn={false}
						/>
					</div>
					<h1 className="m-0 max-w-[34rem] text-2xl font-semibold leading-tight tracking-tight text-[var(--color-text)]">
						{copy.tagline}
					</h1>
					<p className="m-0 max-w-[34rem] text-[var(--text-base)] leading-relaxed text-[var(--color-muted)]">
						{copy.intro}
					</p>
				</header>

				<section
					aria-label={copy.workbenchesLabel}
					className="grid gap-3.5 sm:grid-cols-2"
				>
					<WorkbenchTile
						blurb={copy.iiBlurb}
						href="/incidents"
						icon={
							<svg
								aria-hidden="true"
								fill="none"
								height="18"
								stroke="currentColor"
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth="1.6"
								viewBox="0 0 24 24"
								width="18"
							>
								<path d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z" />
								<path d="m20 20-4-4" />
							</svg>
						}
						title={copy.iiTitle}
					/>
					<WorkbenchTile
						blurb={copy.hiraBlurb}
						comingSoonLabel={copy.comingSoon}
						disabled
						icon={
							<svg
								aria-hidden="true"
								fill="none"
								height="18"
								stroke="currentColor"
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth="1.6"
								viewBox="0 0 24 24"
								width="18"
							>
								<path d="M12 4 2.5 20h19L12 4Z" />
								<path d="M12 10v4" />
								<path d="M12 17h.01" />
							</svg>
						}
						title={copy.hiraTitle}
					/>
				</section>

				<footer className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-7">
					<LandingAuthActions copy={copy.auth} />
					<p className="m-0 text-[var(--text-xs)] text-[var(--color-muted)]">
						{copy.signInFooter}
					</p>
				</footer>
			</div>
		</main>
	);
}
