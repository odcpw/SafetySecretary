import { loadTaxonomy, TAXONOMY_LOCALES, type TaxonomyLocale } from "./loader";
import type { TaxonomyFile } from "./schema";

export type LoadedTaxonomies = Record<TaxonomyLocale, TaxonomyFile>;

export const loadedTaxonomies = preloadAllTaxonomies();

export function preloadAllTaxonomies(
	logger: Pick<Console, "info"> = console,
): LoadedTaxonomies {
	const loaded = Object.fromEntries(
		TAXONOMY_LOCALES.map((locale) => [locale, loadTaxonomy(locale)]),
	) as LoadedTaxonomies;

	logger.info("taxonomy: loaded de+en+fr+it ok");

	return loaded;
}
