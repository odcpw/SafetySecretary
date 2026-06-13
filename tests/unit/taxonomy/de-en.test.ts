import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const schemaModulePath = pathToFileURL(
	path.resolve("src/lib/taxonomy/schema.ts"),
).href;
const validateModulePath = pathToFileURL(
	path.resolve("src/lib/taxonomy/validate.ts"),
).href;

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (
			specifier === "./schema" &&
			context.parentURL?.endsWith("/src/lib/taxonomy/validate.ts")
		) {
			return {
				shortCircuit: true,
				url: pathToFileURL(path.resolve("src/lib/taxonomy/schema.ts")).href,
			};
		}

		return nextResolve(specifier, context);
	},
});

const { TAXONOMY_CANONICAL_CODES } = (await import(
	schemaModulePath
)) as typeof import("../../../src/lib/taxonomy/schema");
const { validateTaxonomyFile } = (await import(
	validateModulePath
)) as typeof import("../../../src/lib/taxonomy/validate");

type TaxonomySection = keyof typeof TAXONOMY_CANONICAL_CODES;

interface TaxonomyEntry {
	code: string;
	label: string;
	examples?: string[];
}

type TaxonomyFixture = Record<TaxonomySection, TaxonomyEntry[]>;

const deFixture = readFixture("de");
const enFixture = readFixture("en");
const methodologyPackPath =
	process.env.SAFETYSECRETARY_FLYWHEEL_DIR === undefined
		? undefined
		: path.join(
				process.env.SAFETYSECRETARY_FLYWHEEL_DIR,
				"docs/methodology-pack.md",
			);

function readFixture(locale: "de" | "en"): TaxonomyFixture {
	const fixturePath = `fixtures/taxonomy/taxonomy.${locale}.json`;

	try {
		return JSON.parse(readFileSync(fixturePath, "utf8")) as TaxonomyFixture;
	} catch (error) {
		throw new Error(`failed to parse ${fixturePath}`, { cause: error });
	}
}

function assertValidFixture(locale: "de" | "en", fixture: TaxonomyFixture) {
	const result = validateTaxonomyFile(fixture);

	assert.equal(
		result.valid,
		true,
		`${locale} fixture validation failed: ${JSON.stringify(result.errors)}`,
	);
}

function sectionCodes(fixture: TaxonomyFixture, section: TaxonomySection) {
	return fixture[section].map((entry) => entry.code);
}

function sectionLabels(fixture: TaxonomyFixture, section: TaxonomySection) {
	return Object.fromEntries(
		fixture[section].map((entry) => [entry.code, entry.label]),
	);
}

function citationRows(locale: "DE" | "EN") {
	const sources = readFileSync("fixtures/taxonomy/SOURCES.md", "utf8");
	const block = sources
		.split(`## ${locale} Entry Citations`)[1]
		?.split("## ")[0];

	assert.ok(block, `missing ${locale} citations block`);

	return [...block.matchAll(/^\| ([^|]+) \| `([^`]+)` \|/gm)].map(
		(match) => `${match[1].trim()}:${match[2].trim()}`,
	);
}

function methodologySectionCodes(
	heading: string,
	nextHeading: string,
	rowCodePattern: RegExp,
) {
	return methodologySectionRows(heading, nextHeading, rowCodePattern).map(
		(match) => match[1],
	);
}

function methodologySectionRows(
	heading: string,
	nextHeading: string,
	rowPattern: RegExp,
) {
	assert.ok(methodologyPackPath, "methodology pack path not configured");
	const methodology = readFileSync(methodologyPackPath, "utf8");
	const block = methodology.split(heading)[1]?.split(nextHeading)[0];

	assert.ok(block, `missing methodology section ${heading}`);

	return [...block.matchAll(rowPattern)];
}

function methodologySectionLabels(
	heading: string,
	nextHeading: string,
	rowPattern: RegExp,
	mapMatch: (match: RegExpMatchArray) => {
		code: string;
		de: string;
		en: string;
	},
) {
	const entries = methodologySectionRows(heading, nextHeading, rowPattern).map(
		mapMatch,
	);

	return {
		de: Object.fromEntries(
			entries.map((entry) => [entry.code, entry.de.trim()]),
		),
		en: Object.fromEntries(
			entries.map((entry) => [entry.code, entry.en.trim()]),
		),
	};
}

test("DE and EN taxonomy fixtures validate against the shared schema", () => {
	assertValidFixture("de", deFixture);
	assertValidFixture("en", enFixture);
});

test("DE and EN taxonomy fixtures use identical canonical code order", () => {
	for (const section of Object.keys(
		TAXONOMY_CANONICAL_CODES,
	) as TaxonomySection[]) {
		assert.deepEqual(sectionCodes(deFixture, section), [
			...TAXONOMY_CANONICAL_CODES[section],
		]);
		assert.deepEqual(sectionCodes(enFixture, section), [
			...TAXONOMY_CANONICAL_CODES[section],
		]);
		assert.deepEqual(
			sectionCodes(deFixture, section),
			sectionCodes(enFixture, section),
		);
	}
});

test("DE and EN category examples stay paired by category", () => {
	for (let index = 0; index < deFixture.categories.length; index += 1) {
		assert.equal(
			deFixture.categories[index].examples?.length,
			enFixture.categories[index].examples?.length,
			`example count mismatch for ${deFixture.categories[index].code}`,
		);
	}
});

test("DE and EN taxonomy fixtures match methodology-pack code sets when available", {
	skip:
		methodologyPackPath !== undefined && existsSync(methodologyPackPath)
			? undefined
			: "methodology pack path not configured",
}, () => {
	const packCodes: Record<TaxonomySection, string[]> = {
		categories: methodologySectionCodes(
			"## Hazard taxonomy (canonical)",
			"## Severity anchors",
			/^\| \d+ \| `([^`]+)` \|/gm,
		),
		severity: methodologySectionCodes(
			"## Severity anchors",
			"## Likelihood anchors",
			/^\| `([^`]+)` \|/gm,
		),
		likelihood: methodologySectionCodes(
			"## Likelihood anchors",
			"## Risk matrix",
			/^\| `([^`]+)` \|/gm,
		),
		riskBands: methodologySectionCodes(
			"Three default risk bands:",
			"Banding rationale",
			/^\| `([^`]+)` \|/gm,
		),
		controlHierarchy: methodologySectionCodes(
			"## S-T-O-P control hierarchy",
			"## HIRA data-shape rules",
			/^\| `([^`]+)` \|/gm,
		),
	};
	const packLabels: Record<
		TaxonomySection,
		{ de: Record<string, string>; en: Record<string, string> }
	> = {
		categories: methodologySectionLabels(
			"## Hazard taxonomy (canonical)",
			"## Severity anchors",
			/^\| \d+ \| `([^`]+)` \| ([^|]+) \| ([^|]+) \|/gm,
			(match) => ({ code: match[1], de: match[2], en: match[3] }),
		),
		severity: methodologySectionLabels(
			"## Severity anchors",
			"## Likelihood anchors",
			/^\| `([^`]+)` \| ([^|]+) \| ([^|]+) \|/gm,
			(match) => ({ code: match[1], en: match[2], de: match[3] }),
		),
		likelihood: methodologySectionLabels(
			"## Likelihood anchors",
			"## Risk matrix",
			/^\| `([^`]+)` \| ([^|]+) \| ([^|]+) \|/gm,
			(match) => ({ code: match[1], en: match[2], de: match[3] }),
		),
		riskBands: methodologySectionLabels(
			"Three default risk bands:",
			"Banding rationale",
			/^\| `([^`]+)` \| ([^|]+) \| ([^|]+) \|/gm,
			(match) => ({ code: match[1], en: match[2], de: match[3] }),
		),
		controlHierarchy: methodologySectionLabels(
			"## S-T-O-P control hierarchy",
			"## HIRA data-shape rules",
			/^\| `([^`]+)` \| [^|]+ \| ([^|]+) \| ([^|]+) \|/gm,
			(match) => ({ code: match[1], en: match[2], de: match[3] }),
		),
	};

	for (const section of Object.keys(
		TAXONOMY_CANONICAL_CODES,
	) as TaxonomySection[]) {
		assert.deepEqual(sectionCodes(deFixture, section), packCodes[section]);
		assert.deepEqual(sectionCodes(enFixture, section), packCodes[section]);
		assert.deepEqual(sectionLabels(deFixture, section), packLabels[section].de);
		assert.deepEqual(sectionLabels(enFixture, section), packLabels[section].en);
	}
});

test("SOURCES.md cites all 29 DE and EN entries", () => {
	const expected = Object.entries(TAXONOMY_CANONICAL_CODES).flatMap(
		([section, codes]) => codes.map((code) => `${section}:${code}`),
	);

	for (const locale of ["DE", "EN"] as const) {
		const rows = citationRows(locale);

		assert.equal(rows.length, 29);
		assert.deepEqual(rows, expected);
	}
});
