import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

registerTaxonomyHooks();

const indexModulePath = pathToFileURL(
	path.resolve("src/lib/taxonomy/index.ts"),
).href;
const schemaModulePath = pathToFileURL(
	path.resolve("src/lib/taxonomy/schema.ts"),
).href;

const {
	getCategoryLabel,
	getControlHierarchyLabel,
	getLikelihoodLabel,
	getRiskBandLabel,
	getSeverityLabel,
} = (await import(
	indexModulePath
)) as typeof import("../../../src/lib/taxonomy/index");
const { TAXONOMY_CANONICAL_CODES } = (await import(
	schemaModulePath
)) as typeof import("../../../src/lib/taxonomy/schema");

const LOCALES = ["de", "en", "fr", "it"] as const;
const SOURCE_HEADINGS = {
	de: "DE",
	en: "EN",
	fr: "FR",
	it: "IT",
} as const;

type Locale = (typeof LOCALES)[number];
type TaxonomySection = keyof typeof TAXONOMY_CANONICAL_CODES;
type LabelReader = (code: string, locale: Locale) => string;

interface TaxonomyEntry {
	code: string;
	label: string;
}

type TaxonomyFixture = Record<TaxonomySection, TaxonomyEntry[]>;

interface CitationEntry {
	key: string;
	label: string;
}

const LABEL_READERS: Record<TaxonomySection, LabelReader> = {
	categories: (code, locale) => getCategoryLabel(code as never, locale),
	severity: (code, locale) => getSeverityLabel(code as never, locale),
	likelihood: (code, locale) => getLikelihoodLabel(code as never, locale),
	riskBands: (code, locale) => getRiskBandLabel(code as never, locale),
	controlHierarchy: (code, locale) =>
		getControlHierarchyLabel(code as never, locale),
};

test("canonical code order is byte-identical across all four locale fixtures", () => {
	const fixtures = Object.fromEntries(
		LOCALES.map((locale) => [locale, readFixture(locale)]),
	) as Record<Locale, TaxonomyFixture>;
	const baseline = fixtures.de;

	for (const locale of LOCALES) {
		for (const section of Object.keys(
			TAXONOMY_CANONICAL_CODES,
		) as TaxonomySection[]) {
			assert.deepEqual(
				sectionCodes(fixtures[locale], section),
				sectionCodes(baseline, section),
				`${locale}:${section} code order differs from de`,
			);
		}
	}
});

test("every taxonomy code in every locale has a source citation row", () => {
	const expectedRows = expectedCitationRows();

	for (const locale of LOCALES) {
		const rows = citationEntries(locale).map((entry) => entry.key);

		assert.equal(rows.length, expectedRows.length, `${locale} citation count`);
		assert.deepEqual(rows, expectedRows, `${locale} citation rows`);
	}
});

test("label lookups for the same code across locales are citation-backed", () => {
	const citations = Object.fromEntries(
		LOCALES.map((locale) => [
			locale,
			new Map(citationEntries(locale).map((entry) => [entry.key, entry])),
		]),
	) as Record<Locale, Map<string, CitationEntry>>;

	for (const locale of LOCALES) {
		for (const section of Object.keys(
			TAXONOMY_CANONICAL_CODES,
		) as TaxonomySection[]) {
			for (const code of TAXONOMY_CANONICAL_CODES[section]) {
				const label = getLabel(section, code, locale);
				const citation = citations[locale].get(`${section}:${code}`);

				assert.notEqual(label.trim(), "", `${locale}:${section}:${code}`);
				assert.equal(
					citation?.label,
					label,
					`${locale}:${section}:${code} missing citation`,
				);
			}
		}
	}
});

function getLabel(section: TaxonomySection, code: string, locale: Locale) {
	return LABEL_READERS[section](code, locale);
}

function sectionCodes(fixture: TaxonomyFixture, section: TaxonomySection) {
	return fixture[section].map((entry) => entry.code);
}

function expectedCitationRows() {
	return Object.entries(TAXONOMY_CANONICAL_CODES).flatMap(([section, codes]) =>
		codes.map((code) => `${section}:${code}`),
	);
}

function citationEntries(locale: Locale): CitationEntry[] {
	const sources = readFileSync("fixtures/taxonomy/SOURCES.md", "utf8");
	const heading = SOURCE_HEADINGS[locale];
	const block = sources
		.split(`## ${heading} Entry Citations`)[1]
		?.split("\n## ")[0];

	assert.ok(block, `missing ${heading} citation block`);

	return [...block.matchAll(/^\| ([^|]+) \| `([^`]+)` \| ([^|]+) \|/gm)].map(
		(match) => ({
			key: `${match[1].trim()}:${match[2].trim()}`,
			label: match[3].trim(),
		}),
	);
}

function readFixture(locale: Locale): TaxonomyFixture {
	const fixturePath = `fixtures/taxonomy/taxonomy.${locale}.json`;

	try {
		return JSON.parse(readFileSync(fixturePath, "utf8")) as TaxonomyFixture;
	} catch (error) {
		throw new Error(`failed to parse ${fixturePath}`, { cause: error });
	}
}

function registerTaxonomyHooks() {
	registerHooks({
		resolve(specifier, context, nextResolve) {
			if (
				specifier.startsWith("./") &&
				context.parentURL?.includes("/src/lib/taxonomy/") &&
				!specifier.endsWith(".ts")
			) {
				const parentPath = fileURLToPath(context.parentURL.split("?")[0]);
				const resolvedPath = path.resolve(
					path.dirname(parentPath),
					`${specifier}.ts`,
				);

				return {
					shortCircuit: true,
					url: pathToFileURL(resolvedPath).href,
				};
			}

			return nextResolve(specifier, context);
		},
	});
}
