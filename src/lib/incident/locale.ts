import { DEFAULT_LOCALE, LOCALES, type Locale } from "../i18n/types";

export type IncidentContentLanguageOption = {
	value: Locale;
	label: string;
	isCreatorDefault: boolean;
	isCompanyDefault: boolean;
};

export type IncidentLanguageContext = {
	creatorUiLocale: Locale | null | undefined;
	companyDefaultLanguage: Locale | null | undefined;
};

export function defaultIncidentContentLanguage(
	context: IncidentLanguageContext,
): Locale {
	return context.creatorUiLocale ?? DEFAULT_LOCALE;
}

export function incidentContentLanguageOptions(
	context: IncidentLanguageContext,
): IncidentContentLanguageOption[] {
	const creatorDefault = defaultIncidentContentLanguage(context);
	const orderedLanguages = uniqueLocales([
		creatorDefault,
		context.companyDefaultLanguage,
		...LOCALES,
	]);

	return orderedLanguages.map((language) => ({
		isCompanyDefault: language === context.companyDefaultLanguage,
		isCreatorDefault: language === creatorDefault,
		label: language.toUpperCase(),
		value: language,
	}));
}

export function parseIncidentContentLanguage(value: unknown): Locale | null {
	return LOCALES.includes(value as Locale) ? (value as Locale) : null;
}

export function resolveIncidentContentLanguage(
	value: unknown,
	context: IncidentLanguageContext,
): Locale | null {
	if (value === null || value === undefined || value === "") {
		return defaultIncidentContentLanguage(context);
	}

	return parseIncidentContentLanguage(value);
}

function uniqueLocales(values: Array<Locale | null | undefined>): Locale[] {
	const seen = new Set<Locale>();
	const result: Locale[] = [];

	for (const value of values) {
		if (!value || seen.has(value)) {
			continue;
		}

		seen.add(value);
		result.push(value);
	}

	return result;
}
