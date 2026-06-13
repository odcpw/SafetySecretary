import { DEFAULT_LOCALE, LOCALES, type Locale } from "../../i18n/types";

export type IIExportOptions = {
	exportLocale: Locale;
	translateStoredContent: boolean;
};

export type IIExportOptionsInput = Partial<IIExportOptions> & {
	locale?: Locale;
};

export type IIExportOptionParseResult =
	| {
			ok: true;
			options: IIExportOptions;
	  }
	| {
			code: "INVALID_EXPORT_LOCALE" | "INVALID_TRANSLATE_STORED_CONTENT";
			ok: false;
	  };

const localeSet = new Set<string>(LOCALES);

export function parseIIExportOptions(input: {
	defaultLocale?: Locale | null;
	exportLocaleParam?: string | null;
	localeParam?: string | null;
	translateParam?: string | null;
}): IIExportOptionParseResult {
	const localeParam = input.localeParam ?? input.exportLocaleParam;
	const exportLocale = localeParam
		? parseLocale(localeParam)
		: (input.defaultLocale ?? DEFAULT_LOCALE);

	if (!exportLocale) {
		return { code: "INVALID_EXPORT_LOCALE", ok: false };
	}

	const translateStoredContent = parseTranslate(input.translateParam);

	if (translateStoredContent === null) {
		return { code: "INVALID_TRANSLATE_STORED_CONTENT", ok: false };
	}

	return {
		ok: true,
		options: {
			exportLocale,
			translateStoredContent,
		},
	};
}

export function normalizeIIExportOptions(
	input: IIExportOptionsInput,
	defaultLocale: Locale,
): IIExportOptions {
	return {
		exportLocale: input.exportLocale ?? input.locale ?? defaultLocale,
		translateStoredContent: input.translateStoredContent ?? false,
	};
}

export function parseSelectedAttachmentIds(params: URLSearchParams): string[] {
	return [
		...params.getAll("photoId"),
		...params.getAll("photoIds").flatMap((value) => value.split(",")),
	]
		.map((value) => value.trim().toLowerCase())
		.filter((value) => value.length > 0);
}

export function attachmentContentDisposition(filename: string): string {
	return `attachment; filename="${filename.replaceAll('"', "")}"`;
}

function parseLocale(value: string): Locale | null {
	const normalized = value.trim().toLowerCase();

	return localeSet.has(normalized) ? (normalized as Locale) : null;
}

function parseTranslate(value: string | null | undefined): boolean | null {
	if (value === null || value === undefined || value === "") {
		return false;
	}

	const normalized = value.trim().toLowerCase();

	if (normalized === "true") {
		return true;
	}

	if (normalized === "false") {
		return false;
	}

	return null;
}
