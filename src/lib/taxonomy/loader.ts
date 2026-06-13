import { readFileSync } from "node:fs";
import path from "node:path";

import type { TaxonomyFile } from "./schema";
import { type TaxonomyValidationError, validateTaxonomyFile } from "./validate";

export const TAXONOMY_LOCALES = ["de", "en", "fr", "it"] as const;

export type TaxonomyLocale = (typeof TAXONOMY_LOCALES)[number];

export interface TaxonomyLoadOptions {
	fixtureRoot?: string;
	cache?: boolean;
}

export class TaxonomyLoadError extends Error {
	readonly errors: TaxonomyValidationError[];
	readonly locale: TaxonomyLocale;
	readonly sourcePath: string;

	constructor(input: {
		locale: TaxonomyLocale;
		sourcePath: string;
		errors: TaxonomyValidationError[];
	}) {
		super(
			`taxonomy ${input.locale} failed validation: ${input.errors
				.map((error) => `${error.path} ${error.message}`)
				.join("; ")}`,
		);
		this.name = "TaxonomyLoadError";
		this.locale = input.locale;
		this.sourcePath = input.sourcePath;
		this.errors = input.errors;
	}
}

const taxonomyCache = new Map<string, TaxonomyFile>();

export function loadTaxonomy(
	locale: TaxonomyLocale,
	options: TaxonomyLoadOptions = {},
): TaxonomyFile {
	const fixtureRoot = options.fixtureRoot ?? defaultFixtureRoot();
	const sourcePath = path.join(fixtureRoot, `taxonomy.${locale}.json`);
	const cacheKey = `${fixtureRoot}:${locale}`;

	if (options.cache !== false) {
		const cached = taxonomyCache.get(cacheKey);

		if (cached !== undefined) {
			return cached;
		}
	}

	const parsed = readTaxonomyJson(locale, sourcePath);
	const validation = validateTaxonomyFile(parsed);

	if (!validation.valid) {
		throw new TaxonomyLoadError({
			locale,
			sourcePath,
			errors: validation.errors,
		});
	}

	const taxonomy = parsed as TaxonomyFile;

	if (options.cache !== false) {
		taxonomyCache.set(cacheKey, taxonomy);
	}

	return taxonomy;
}

export function clearTaxonomyCache() {
	taxonomyCache.clear();
}

function defaultFixtureRoot() {
	return path.join(process.cwd(), "fixtures", "taxonomy");
}

function readTaxonomyJson(locale: TaxonomyLocale, sourcePath: string) {
	try {
		return JSON.parse(readFileSync(sourcePath, "utf8")) as unknown;
	} catch (error) {
		throw new TaxonomyLoadError({
			locale,
			sourcePath,
			errors: [
				{
					path: "$",
					message:
						error instanceof Error
							? `could not read or parse fixture: ${error.message}`
							: "could not read or parse fixture",
				},
			],
		});
	}
}
