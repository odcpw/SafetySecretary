import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

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

const indexModulePath = pathToFileURL(
	path.resolve("src/lib/taxonomy/index.ts"),
).href;
const loaderModulePath = pathToFileURL(
	path.resolve("src/lib/taxonomy/loader.ts"),
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
	UnknownTaxonomyCodeError,
} = (await import(
	indexModulePath
)) as typeof import("../../../src/lib/taxonomy/index");
const { loadTaxonomy, TAXONOMY_LOCALES, TaxonomyLoadError } = (await import(
	loaderModulePath
)) as typeof import("../../../src/lib/taxonomy/loader");
const { HAZARD_CATEGORY_CODES } = (await import(
	schemaModulePath
)) as typeof import("../../../src/lib/taxonomy/schema");

type TaxonomyLocale = (typeof TAXONOMY_LOCALES)[number];

interface LabelEntry {
	code: string;
	label: string;
}

interface FixtureShape {
	categories: LabelEntry[];
	severity: LabelEntry[];
	likelihood: LabelEntry[];
	riskBands: LabelEntry[];
	controlHierarchy: LabelEntry[];
}

test("loadTaxonomy reads and validates all locale fixtures", () => {
	for (const locale of TAXONOMY_LOCALES) {
		const taxonomy = loadTaxonomy(locale, { cache: false });

		assert.equal(taxonomy.categories.length, 12);
		assert.equal(taxonomy.severity.length, 5);
		assert.equal(taxonomy.likelihood.length, 5);
		assert.equal(taxonomy.riskBands.length, 3);
		assert.equal(taxonomy.controlHierarchy.length, 4);
	}
});

test("category labels round-trip for all 12 codes in all 4 locales", () => {
	for (const locale of TAXONOMY_LOCALES) {
		const fixture = readFixture(locale);

		for (const code of HAZARD_CATEGORY_CODES) {
			const expected = fixture.categories.find((entry) => entry.code === code);

			assert.ok(expected, `${locale} fixture missing ${code}`);
			assert.equal(getCategoryLabel(code, locale), expected.label);
		}
	}
});

test("label helpers expose severity, likelihood, risk band, and S-T-O-P labels", () => {
	assert.equal(getSeverityLabel("A", "fr"), "Décès");
	assert.equal(getLikelihoodLabel("1", "it"), "Frequente");
	assert.equal(getRiskBandLabel("HIGH", "de"), "Höheres Risiko");
	assert.equal(getControlHierarchyLabel("PPE", "en"), "PPE");
});

test("unknown codes throw structured errors instead of falling back", () => {
	assert.throws(
		() => getCategoryLabel("UNKNOWN" as never, "en"),
		(error: unknown) => {
			assert.ok(error instanceof UnknownTaxonomyCodeError);
			assert.equal(error.locale, "en");
			assert.equal(error.section, "categories");
			assert.equal(error.code, "UNKNOWN");
			return true;
		},
	);
});

test("corrupted fixtures fail at load time with structured validation paths", () => {
	const fixtureRoot = mkdtempSync(path.join(tmpdir(), "ssfw-taxonomy-"));

	try {
		const fixture = readFixture("en");
		fixture.categories = fixture.categories.slice(0, -1);
		writeFileSync(
			path.join(fixtureRoot, "taxonomy.en.json"),
			JSON.stringify(fixture),
		);

		assert.throws(
			() => loadTaxonomy("en", { fixtureRoot, cache: false }),
			(error: unknown) => {
				assert.ok(error instanceof TaxonomyLoadError);
				assert.equal(error.locale, "en");
				assert.ok(error.sourcePath.endsWith("taxonomy.en.json"));
				assert.ok(
					error.errors.some((item) => item.path === "$.categories"),
					`unexpected validation errors: ${JSON.stringify(error.errors)}`,
				);
				return true;
			},
		);
	} finally {
		rmSync(fixtureRoot, { recursive: true, force: true });
	}
});

test("load-all imports all four locales and logs the boot preload line", async () => {
	const messages: string[] = [];
	const originalInfo = console.info;
	console.info = (...args: unknown[]) => {
		messages.push(args.join(" "));
	};

	try {
		const moduleUrl = `${
			pathToFileURL(path.resolve("src/lib/taxonomy/load-all.ts")).href
		}?test=${Date.now()}`;
		const module = (await import(
			moduleUrl
		)) as typeof import("../../../src/lib/taxonomy/load-all");

		assert.deepEqual(Object.keys(module.loadedTaxonomies), [
			"de",
			"en",
			"fr",
			"it",
		]);
		assert.ok(messages.includes("taxonomy: loaded de+en+fr+it ok"));
	} finally {
		console.info = originalInfo;
	}
});

function readFixture(locale: TaxonomyLocale): FixtureShape {
	const fixturePath = `fixtures/taxonomy/taxonomy.${locale}.json`;

	try {
		return JSON.parse(readFileSync(fixturePath, "utf8")) as FixtureShape;
	} catch (error) {
		throw new Error(`failed to parse ${fixturePath}`, { cause: error });
	}
}
