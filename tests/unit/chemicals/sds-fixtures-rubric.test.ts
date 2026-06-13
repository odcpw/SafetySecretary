import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (!context.parentURL || !specifier.startsWith(".")) {
			return nextResolve(specifier, context);
		}

		const candidates = [
			new URL(`${specifier}.ts`, context.parentURL),
			new URL(`${specifier}.tsx`, context.parentURL),
			new URL(`${specifier}/index.ts`, context.parentURL),
		];
		const resolved = candidates.find((candidate) => existsSync(candidate));

		if (resolved) {
			return {
				shortCircuit: true,
				url: resolved.href,
			};
		}

		return nextResolve(specifier, context);
	},
});

const extractionModulePath = "../../../src/lib/chemicals/sds-extraction.ts";
const { buildSdsExtractionPrompt, parseSdsExtractionResponse } = (await import(
	extractionModulePath
)) as typeof import("../../../src/lib/chemicals/sds-extraction");
const chemicalControlModulePath =
	"../../../src/lib/chemicals/chemical-control.ts";
const { isChemicalControlOperationallyUsable } = (await import(
	chemicalControlModulePath
)) as typeof import("../../../src/lib/chemicals/chemical-control");
type ChemicalControlRecord =
	import("../../../src/lib/chemicals/chemical-control").ChemicalControlRecord;

const fixtureDir = path.join(process.cwd(), "tests/fixtures/chemicals/sds");

type ExpectedFixture = {
	readonly id: string;
	readonly file: string;
	readonly productName: string;
	readonly controls: readonly {
		readonly controlType: string;
		readonly controlText: string;
		readonly sdsSection: string;
		readonly sourceExcerpt: string;
		readonly pageLineRef: string | null;
		readonly confidence: number;
	}[];
};

test("synthetic SDS fixtures are fake, sourced, and cover common SDS control sections", async () => {
	const fixtures = await loadExpectedFixtures();

	assert.ok(fixtures.length >= 3);
	assert.ok(fixtures.length <= 5);

	const sections = new Set<string>();
	for (const fixture of fixtures) {
		const text = await readFixtureText(fixture.file);
		const normalizedText = normalizeWhitespace(text);
		assert.match(text, /^Synthetic SDS Fixture:/);
		assert.doesNotMatch(text, /suva|acme|incident|real company/i);
		assert.match(text, /Section 2 - Hazard Identification/);

		for (const control of fixture.controls) {
			assert.ok(
				normalizedText.includes(normalizeWhitespace(control.sourceExcerpt)),
				`${fixture.id} expected source excerpt missing from fixture text: ${control.sourceExcerpt}`,
			);
			sections.add(control.sdsSection);
		}
	}

	assert.ok([...sections].some((section) => section.startsWith("Section 7")));
	assert.ok([...sections].some((section) => section.startsWith("Section 8")));
});

test("mocked SDS extraction produces expected control types and text", async () => {
	for (const fixture of await loadExpectedFixtures()) {
		const sdsText = await readFixtureText(fixture.file);
		const prompt = buildSdsExtractionPrompt({
			productName: fixture.productName,
			sdsText,
		});
		const mockResponse = deterministicMockSdsExtractor(prompt, fixture);
		const controls = parseSdsExtractionResponse(mockResponse);

		assert.deepEqual(
			controls.map((control) => ({
				controlText: control.controlText,
				controlType: control.controlType,
			})),
			fixture.controls.map((control) => ({
				controlText: control.controlText,
				controlType: control.controlType,
			})),
			fixture.id,
		);
		assert.deepEqual(
			controls.map((control) => control.extractionConfidence),
			fixture.controls.map((control) => control.confidence),
		);
	}
});

test("review-gating excludes pending and rejected SDS controls from operational extraction output", () => {
	const rows: ChemicalControlRecord[] = [
		controlRecord("pending", "Use local exhaust ventilation"),
		controlRecord("approved", "Wear splash goggles"),
		controlRecord("rejected", "Use unsupported generic PPE wording"),
	];
	const operational = rows.filter(isChemicalControlOperationallyUsable);

	assert.deepEqual(
		operational.map((control) => control.controlText),
		["Wear splash goggles"],
	);
});

async function loadExpectedFixtures(): Promise<readonly ExpectedFixture[]> {
	let raw: { fixtures?: unknown };
	try {
		raw = JSON.parse(
			await readFile(
				path.join(fixtureDir, "expected-extractions.json"),
				"utf8",
			),
		) as { fixtures?: unknown };
	} catch (error) {
		throw new Error(
			`Failed to parse synthetic SDS expected extractions: ${(error as Error).message}`,
		);
	}

	assert.ok(Array.isArray(raw.fixtures));
	return raw.fixtures as readonly ExpectedFixture[];
}

async function readFixtureText(file: string): Promise<string> {
	const safeName = path.basename(file);
	assert.equal(file, safeName);
	return readFile(path.join(fixtureDir, safeName), "utf8");
}

function deterministicMockSdsExtractor(
	prompt: string,
	fixture: ExpectedFixture,
): string {
	assert.match(prompt, new RegExp(fixture.productName.replaceAll(" ", "\\s+")));

	return JSON.stringify({
		controls: fixture.controls.map((control) => ({
			confidence: control.confidence,
			controlText: control.controlText,
			controlType: control.controlType,
			pageLineRef: control.pageLineRef,
			sdsSection: control.sdsSection,
			sourceExcerpt: control.sourceExcerpt,
		})),
	});
}

function normalizeWhitespace(value: string): string {
	return value.replace(/\s+/g, " ").trim();
}

function controlRecord(
	reviewStatus: ChemicalControlRecord["reviewStatus"],
	controlText: string,
): ChemicalControlRecord {
	return {
		chemicalProfileId: "22222222-2222-4222-8222-222222222222",
		controlText,
		controlType: "use_control",
		extractionConfidence: 0.9,
		extractionModelMarker: "mock:fixture",
		pageLineRef: null,
		reviewStatus,
		reviewedAt:
			reviewStatus === "pending" ? null : new Date("2026-05-06T08:00:00.000Z"),
		reviewedByUserId:
			reviewStatus === "pending"
				? null
				: "33333333-3333-4333-8333-333333333333",
		sdsSection: "Section 8 - Exposure Controls and Personal Protection",
		sortOrder: 0,
		sourceExcerpt: "Wear splash goggles.",
		sourceFilename: "synthetic-solvent-cleaner.txt",
		sourceProvenance: "sds_extraction",
		sourceStoragePath:
			"tenants/11111111-1111-4111-8111-111111111111/sds/22222222-2222-4222-8222-222222222222/fixture.txt",
	};
}
