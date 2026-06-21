export const SUPPORTED_UI_LOCALES = ["de", "en", "fr", "it"] as const;

export const DEFAULT_UI_LOCALE: UiLocale = "en";

export type UiLocale = (typeof SUPPORTED_UI_LOCALES)[number];

const supportedUiLocales = new Set<string>(SUPPORTED_UI_LOCALES);

/**
 * Narrow an arbitrary value to a supported UI locale, or null. Accepts only an
 * exact supported tag (no Accept-Language style ranges) — used for the locale
 * cookie and the persisted `user.uiLocale`.
 */
export function parseUiLocale(value: unknown): UiLocale | null {
	return typeof value === "string" && supportedUiLocales.has(value)
		? (value as UiLocale)
		: null;
}

export type UiLocaleCandidates = {
	/** Persisted preference for a signed-in user (`user.uiLocale`). */
	userLocale?: string | null | undefined;
	/** Value of the locale cookie. */
	cookieLocale?: string | null | undefined;
	/** Raw `Accept-Language` request header. */
	acceptLanguageHeader?: string | null | undefined;
};

/**
 * The single source of truth for "what language is this request in".
 *
 * Priority (per the product ruling — one language for chrome, coach replies,
 * stored content and exports):
 *   1. signed-in user's persisted `uiLocale`
 *   2. the locale cookie (anonymous choice / pre-sign-in)
 *   3. the browser `Accept-Language` header
 *   4. DEFAULT_UI_LOCALE
 *
 * This is a pure function so it can be unit-tested and reused from both server
 * components and the proxy; callers supply the candidate values.
 */
export function resolveUiLocale(candidates: UiLocaleCandidates): UiLocale {
	return (
		parseUiLocale(candidates.userLocale) ??
		parseUiLocale(candidates.cookieLocale) ??
		pickInitialUiLocale(candidates.acceptLanguageHeader, DEFAULT_UI_LOCALE)
	);
}

type LanguagePreference = {
	locale: UiLocale | "*";
	q: number;
	order: number;
};

export function pickInitialUiLocale(
	acceptLanguageHeader: string | null | undefined,
	companyDefault: UiLocale,
): UiLocale {
	const preferences = parseAcceptLanguage(acceptLanguageHeader);

	for (const preference of preferences) {
		if (preference.locale === "*") {
			return companyDefault;
		}

		return preference.locale;
	}

	return companyDefault;
}

function parseAcceptLanguage(
	acceptLanguageHeader: string | null | undefined,
): LanguagePreference[] {
	if (!acceptLanguageHeader) {
		return [];
	}

	return acceptLanguageHeader
		.split(",")
		.map((part, order) => parseLanguagePreference(part, order))
		.filter((preference): preference is LanguagePreference =>
			Boolean(preference),
		)
		.sort((left, right) => right.q - left.q || left.order - right.order);
}

function parseLanguagePreference(
	rawPart: string,
	order: number,
): LanguagePreference | null {
	const [rawRange, ...rawParams] = rawPart.split(";");
	const locale = normalizeSupportedLocale(rawRange);

	if (!locale) {
		return null;
	}

	const q = parseQValue(rawParams);

	if (q <= 0) {
		return null;
	}

	return {
		locale,
		q,
		order,
	};
}

function normalizeSupportedLocale(rawRange: string): UiLocale | "*" | null {
	const range = rawRange.trim().toLowerCase();

	if (range === "*") {
		return "*";
	}

	const [baseLocale] = range.split("-");

	return supportedUiLocales.has(baseLocale) ? (baseLocale as UiLocale) : null;
}

function parseQValue(rawParams: string[]): number {
	for (const rawParam of rawParams) {
		const [rawName, rawValue] = rawParam.split("=");

		if (rawName?.trim().toLowerCase() !== "q") {
			continue;
		}

		const parsed = Number.parseFloat(rawValue?.trim() ?? "");

		if (!Number.isFinite(parsed)) {
			return 0;
		}

		return Math.min(Math.max(parsed, 0), 1);
	}

	return 1;
}
