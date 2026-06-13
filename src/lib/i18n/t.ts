import deMessages from "./messages.de.json" with { type: "json" };
import enMessages from "./messages.en.json" with { type: "json" };
import frMessages from "./messages.fr.json" with { type: "json" };
import itMessages from "./messages.it.json" with { type: "json" };
import type { Locale, MessageCatalog, MessageCatalogs, MessageKey } from "./types";

const DEFAULT_LOCALE: Locale = "en";

export const messageCatalogs = {
	de: deMessages,
	en: enMessages,
	fr: frMessages,
	it: itMessages,
} satisfies Record<Locale, MessageCatalog>;

export function t(key: MessageKey, locale: Locale = DEFAULT_LOCALE): string {
	return resolveMessage(key, locale, messageCatalogs);
}

export function resolveMessage(
	key: MessageKey,
	locale: Locale,
	catalogs: MessageCatalogs,
): string {
	return catalogs[locale]?.[key] ?? catalogs[DEFAULT_LOCALE]?.[key] ?? key;
}
