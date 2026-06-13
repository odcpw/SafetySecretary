import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

registerTaxonomyHooks();

const schemaModulePath = pathToFileURL(
	path.resolve("src/lib/taxonomy/schema.ts"),
).href;
const validateModulePath = pathToFileURL(
	path.resolve("src/lib/taxonomy/validate.ts"),
).href;

const { TAXONOMY_CANONICAL_CODES } = (await import(
	schemaModulePath
)) as typeof import("../../../src/lib/taxonomy/schema");
const { validateTaxonomyFile } = (await import(
	validateModulePath
)) as typeof import("../../../src/lib/taxonomy/validate");

const LOCALES = ["de", "en", "fr", "it"] as const;

type Locale = (typeof LOCALES)[number];
type TaxonomySection = keyof typeof TAXONOMY_CANONICAL_CODES;

interface TaxonomyEntry {
	code: string;
	label: string;
	description?: string;
	examples?: string[];
	anchor?: string;
}

type TaxonomyFixture = Record<TaxonomySection, TaxonomyEntry[]>;

test("all locale taxonomy fixtures validate against the shared schema", () => {
	for (const locale of LOCALES) {
		const result = validateTaxonomyFile(readFixture(locale));

		assert.equal(
			result.valid,
			true,
			`${locale} validation failed: ${JSON.stringify(result.errors)}`,
		);
	}
});

test("all locale fixtures contain the complete canonical code sets", () => {
	for (const locale of LOCALES) {
		const fixture = readFixture(locale);

		assert.deepEqual(sectionCodes(fixture, "categories"), [
			...TAXONOMY_CANONICAL_CODES.categories,
		]);
		assert.deepEqual(sectionCodes(fixture, "severity"), [
			...TAXONOMY_CANONICAL_CODES.severity,
		]);
		assert.deepEqual(sectionCodes(fixture, "likelihood"), [
			...TAXONOMY_CANONICAL_CODES.likelihood,
		]);
		assert.deepEqual(sectionCodes(fixture, "riskBands"), [
			...TAXONOMY_CANONICAL_CODES.riskBands,
		]);
		assert.deepEqual(sectionCodes(fixture, "controlHierarchy"), [
			...TAXONOMY_CANONICAL_CODES.controlHierarchy,
		]);
	}
});

test("taxonomy labels and required explanatory fields are present", () => {
	for (const locale of LOCALES) {
		const fixture = readFixture(locale);

		for (const section of Object.keys(
			TAXONOMY_CANONICAL_CODES,
		) as TaxonomySection[]) {
			for (const entry of fixture[section]) {
				assert.notEqual(
					entry.label.trim(),
					"",
					`${locale}:${section}:${entry.code}`,
				);
			}
		}

		for (const category of fixture.categories) {
			assert.ok(
				category.description?.trim(),
				`${locale}:categories:${category.code} missing description`,
			);
			assert.ok(
				category.examples?.length,
				`${locale}:categories:${category.code} missing examples`,
			);
			for (const example of category.examples ?? []) {
				assert.notEqual(
					example.trim(),
					"",
					`${locale}:categories:${category.code} contains empty example`,
				);
			}
		}

		for (const severity of fixture.severity) {
			assert.ok(
				severity.anchor?.trim(),
				`${locale}:severity:${severity.code} missing anchor`,
			);
		}

		for (const likelihood of fixture.likelihood) {
			assert.ok(
				likelihood.anchor?.trim(),
				`${locale}:likelihood:${likelihood.code} missing anchor`,
			);
		}
	}
});

function sectionCodes(fixture: TaxonomyFixture, section: TaxonomySection) {
	return fixture[section].map((entry) => entry.code);
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
