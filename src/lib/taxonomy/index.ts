import { loadTaxonomy, TAXONOMY_LOCALES, type TaxonomyLocale } from "./loader";
import type {
	ControlHierarchyCode,
	HazardCategoryCode,
	LikelihoodCode,
	RiskBandCode,
	SeverityCode,
	TaxonomyFile,
} from "./schema";

export type {
	ControlHierarchyCode,
	HazardCategoryCode,
	LikelihoodCode,
	RiskBandCode,
	SeverityCode,
	TaxonomyFile,
	TaxonomyLocale,
};
export { loadTaxonomy, TAXONOMY_LOCALES };

type TaxonomySection = keyof TaxonomyFile;

export class UnknownTaxonomyCodeError extends Error {
	readonly locale: TaxonomyLocale;
	readonly section: TaxonomySection;
	readonly code: string;

	constructor(input: {
		locale: TaxonomyLocale;
		section: TaxonomySection;
		code: string;
	}) {
		super(
			`unknown taxonomy code ${input.code} in ${input.section} for locale ${input.locale}`,
		);
		this.name = "UnknownTaxonomyCodeError";
		this.locale = input.locale;
		this.section = input.section;
		this.code = input.code;
	}
}

export function getCategoryLabel(
	code: HazardCategoryCode,
	locale: TaxonomyLocale,
) {
	return getLabel("categories", code, locale);
}

export function getSeverityLabel(code: SeverityCode, locale: TaxonomyLocale) {
	return getLabel("severity", code, locale);
}

export function getLikelihoodLabel(
	code: LikelihoodCode,
	locale: TaxonomyLocale,
) {
	return getLabel("likelihood", code, locale);
}

export function getRiskBandLabel(code: RiskBandCode, locale: TaxonomyLocale) {
	return getLabel("riskBands", code, locale);
}

export function getControlHierarchyLabel(
	code: ControlHierarchyCode,
	locale: TaxonomyLocale,
) {
	return getLabel("controlHierarchy", code, locale);
}

function getLabel(
	section: TaxonomySection,
	code: string,
	locale: TaxonomyLocale,
) {
	const entry = loadTaxonomy(locale)[section].find(
		(item) => item.code === code,
	);

	if (entry === undefined) {
		throw new UnknownTaxonomyCodeError({ locale, section, code });
	}

	return entry.label;
}
