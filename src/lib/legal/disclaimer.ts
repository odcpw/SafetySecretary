import { t } from "../i18n/t";
import {
	DEFAULT_LOCALE,
	LOCALES,
	type Locale,
	type MessageKey,
} from "../i18n/types";

export const ACKNOWLEDGEMENT_TEXT_KEY =
	"legal.acknowledgement.text" satisfies MessageKey;
export const EXPORT_FOOTER_TEXT_KEY =
	"legal.exportFooter.text" satisfies MessageKey;
export const DISCLAIMER_VERSION = "2026.5.4+3d6cf962";

export const ACKNOWLEDGEMENT_TEXT = textByLocale(ACKNOWLEDGEMENT_TEXT_KEY);
export const EXPORT_FOOTER_TEXT = textByLocale(EXPORT_FOOTER_TEXT_KEY);

export function acknowledgementText(locale: Locale = DEFAULT_LOCALE): string {
	return t(ACKNOWLEDGEMENT_TEXT_KEY, locale);
}

export function exportFooterText(locale: Locale = DEFAULT_LOCALE): string {
	return t(EXPORT_FOOTER_TEXT_KEY, locale);
}

function textByLocale(key: MessageKey): Record<Locale, string> {
	return Object.fromEntries(
		LOCALES.map((locale) => [locale, t(key, locale)]),
	) as Record<Locale, string>;
}
