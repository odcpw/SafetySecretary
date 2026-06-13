import { t } from "../i18n/t";
import type { Locale, MessageKey } from "../i18n/types";

export const SETTINGS_KEYS = [
	"members",
	"invitations",
	"byok",
	"vision",
	"capabilities",
	"debug-log",
	"language",
	"disclaimer",
	"branding",
	"danger-zone",
] as const;

export type SettingsKey = (typeof SETTINGS_KEYS)[number];

type LocalizedText = Record<Locale, string>;

export type SettingsEntry = {
	key: SettingsKey;
	labelKey?: MessageKey;
	labels: LocalizedText;
	ownerBead: string;
	route: `/workspace/settings/${SettingsKey}`;
};

export type SettingsContentModel = {
	entry: SettingsEntry;
	label: string;
	placeholderBody: string;
	placeholderTitle: string;
};

export type SettingsNavItem = {
	active: boolean;
	href: SettingsEntry["route"];
	label: string;
};

export type SettingsShellModel = {
	description: string;
	navAriaLabel: string;
	title: string;
};

export const DEFAULT_SETTINGS_KEY: SettingsKey = "members";

export const SETTINGS_ENTRIES: readonly SettingsEntry[] = [
	settingsEntry(
		"members",
		labels("Mitglieder", "Members", "Membres", "Membri"),
		"ssfw-09i/ssfw-9lf",
	),
	settingsEntry(
		"invitations",
		labels("Einladungen", "Invitations", "Invitations", "Inviti"),
		"ssfw-4gl",
		"settings.invitations.title",
	),
	settingsEntry("byok", labels("BYOK", "BYOK", "BYOK", "BYOK"), "ssfw-duz"),
	settingsEntry(
		"vision",
		labels("Vision", "Vision", "Vision", "Visione"),
		"ssfw-92d",
	),
	settingsEntry(
		"capabilities",
		labels(
			"Fahigkeitsmatrix",
			"Capabilities",
			"Matrice des capacites",
			"Matrice capacita",
		),
		"ssfw-5kej",
	),
	settingsEntry(
		"debug-log",
		labels("Debug-Protokoll", "Debug log", "Journal de debug", "Log di debug"),
		"ssfw-q4p",
	),
	settingsEntry(
		"language",
		labels("Sprache", "Language", "Langue", "Lingua"),
		"ssfw-kle/ssfw-eyp",
	),
	settingsEntry(
		"disclaimer",
		labels("Hinweis", "Disclaimer", "Avertissement", "Avviso"),
		"ssfw-q67",
	),
	settingsEntry(
		"branding",
		labels("Branding", "Branding", "Image de marque", "Branding"),
		"ssfw-t4m",
	),
	settingsEntry(
		"danger-zone",
		labels(
			"Gefahrenbereich",
			"Danger zone",
			"Zone dangereuse",
			"Zona pericolosa",
		),
		"ssfw-9lf",
	),
];

export const settingsEntryByKey = Object.fromEntries(
	SETTINGS_ENTRIES.map((entry) => [entry.key, entry]),
) as Record<SettingsKey, SettingsEntry>;

const shellText = {
	description: labels(
		"Firmen- und Benutzereinstellungen bleiben in registrierten Einstellungsseiten.",
		"Company and user settings stay in registered settings pages.",
		"Les parametres de l'entreprise et des utilisateurs restent dans des pages de parametres enregistrees.",
		"Le impostazioni aziendali e utente restano in pagine impostazioni registrate.",
	),
	navAriaLabel: labels(
		"Einstellungsbereiche",
		"Settings sections",
		"Zones de parametres",
		"Aree impostazioni",
	),
	placeholderBody: labels(
		"Diese Seite ist in der Einstellungs-Shell registriert. Die Fachinhalte gehoeren zum nachgelagerten Bead.",
		"This page is registered in the settings shell. Its feature content belongs to the downstream bead.",
		"Cette page est enregistree dans la shell des parametres. Son contenu fonctionnel appartient au bead en aval.",
		"Questa pagina e registrata nella shell impostazioni. Il contenuto funzionale appartiene al bead successivo.",
	),
	placeholderTitle: labels(
		"Registrierte Einstellungsseite",
		"Registered settings page",
		"Page de parametres enregistree",
		"Pagina impostazioni registrata",
	),
	title: labels("Einstellungen", "Settings", "Parametres", "Impostazioni"),
};

export function isSettingsKey(
	value: string | null | undefined,
): value is SettingsKey {
	return SETTINGS_KEYS.includes(value as SettingsKey);
}

export function parseSettingsKey(
	value: string | null | undefined,
): SettingsKey | null {
	return isSettingsKey(value) ? value : null;
}

export function settingsKeyFromPathname(
	pathname: string | null | undefined,
): SettingsKey {
	const lastSegment = pathname?.split("/").filter(Boolean).at(-1);
	return parseSettingsKey(lastSegment) ?? DEFAULT_SETTINGS_KEY;
}

export function buildSettingsNavItems(
	locale: Locale,
	selectedKey: SettingsKey,
): SettingsNavItem[] {
	return SETTINGS_ENTRIES.map((entry) => ({
		active: entry.key === selectedKey,
		href: entry.route,
		label: localizedEntryLabel(entry, locale),
	}));
}

export function settingsContentModel(
	key: SettingsKey,
	locale: Locale,
): SettingsContentModel {
	const entry = settingsEntryByKey[key];

	return {
		entry,
		label: localizedEntryLabel(entry, locale),
		placeholderBody: localized(shellText.placeholderBody, locale),
		placeholderTitle: localized(shellText.placeholderTitle, locale),
	};
}

export function settingsShellModel(locale: Locale): SettingsShellModel {
	return {
		description: localized(shellText.description, locale),
		navAriaLabel: localized(shellText.navAriaLabel, locale),
		title: localized(shellText.title, locale),
	};
}

function settingsEntry(
	key: SettingsKey,
	labels: LocalizedText,
	ownerBead: string,
	labelKey?: MessageKey,
): SettingsEntry {
	return {
		key,
		labelKey,
		labels,
		ownerBead,
		route: `/workspace/settings/${key}`,
	};
}

function labels(de: string, en: string, fr: string, it: string): LocalizedText {
	return { de, en, fr, it };
}

function localized(text: LocalizedText, locale: Locale): string {
	return text[locale] ?? text.en;
}

function localizedEntryLabel(entry: SettingsEntry, locale: Locale): string {
	return entry.labelKey
		? t(entry.labelKey, locale)
		: localized(entry.labels, locale);
}
