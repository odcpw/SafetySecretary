import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const nextImageStubUrl = new URL("./next-image-stub.tsx", import.meta.url).href;

registerHooks({
	load(url, context, nextLoad) {
		if (!url.startsWith("file:") || !/\.[cm]?tsx?$/.test(url)) {
			return nextLoad(url, context);
		}

		const source = readFileSync(fileURLToPath(url), "utf8");
		const transpiled = ts.transpileModule(source, {
			compilerOptions: {
				jsx: ts.JsxEmit.ReactJSX,
				module: ts.ModuleKind.ESNext,
				moduleResolution: ts.ModuleResolutionKind.Bundler,
				target: ts.ScriptTarget.ES2022,
			},
			fileName: fileURLToPath(url),
		});

		return {
			format: "module",
			shortCircuit: true,
			source: transpiled.outputText,
		};
	},
	resolve(specifier, context, nextResolve) {
		if (specifier === "next/image") {
			return {
				shortCircuit: true,
				url: nextImageStubUrl,
			};
		}

		if (!context.parentURL || !specifier.startsWith(".")) {
			return nextResolve(specifier, context);
		}

		const candidates = [
			new URL(`${specifier}.ts`, context.parentURL),
			new URL(`${specifier}.tsx`, context.parentURL),
			new URL(`${specifier}.json`, context.parentURL),
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

const recapClientModule = (await import(
	"../../../src/app/workspace/chemicals/recap/ChemicalRecapClient"
)) as typeof import("../../../src/app/workspace/chemicals/recap/ChemicalRecapClient");
const viewLabelsModule = (await import(
	"../../../src/lib/chemicals/view-labels"
)) as typeof import("../../../src/lib/chemicals/view-labels");
const { default: ChemicalRecapClient } = recapClientModule;
const { chemicalProfileViewLabels, chemicalRecapViewLabels } = viewLabelsModule;

test("chemical recap labels are serializable across the client boundary", () => {
	assertNoFunctions(chemicalRecapViewLabels("en"));
});

test("chemical recap client renders worker quick cards and attached source photos", () => {
	const html = renderToStaticMarkup(
		createElement(ChemicalRecapClient, {
			cards: [
				{
					casNumber: "64-17-5",
					controls: [
						{
							controlText: "Wear nitrile gloves EN 374",
							controlType: "glove_type",
							id: "control-a",
							pageLineRef: "p. 4",
							reviewedAt: "2026-05-05T07:00:00.000Z",
							reviewedByUserEmail: "reviewer@example.invalid",
							sdsSection: "Section 8",
							sourceExcerpt: "Use suitable protective gloves.",
							sourceFilename: "glove-example.png",
							sourceStorageIsImage: true,
							sourceStoragePath:
								"tenants/11111111-1111-4111-8111-111111111111/attachments/glove-example.png",
						},
						{
							controlText: "Rinse with water for 15 minutes",
							controlType: "first_aid",
							id: "control-b",
							pageLineRef: "p. 2",
							reviewedAt: "2026-05-05T08:00:00.000Z",
							reviewedByUserEmail: "reviewer@example.invalid",
							sdsSection: "Section 4",
							sourceExcerpt: "Rinse cautiously with water.",
							sourceFilename: "fixture-sds.pdf",
							sourceStorageIsImage: false,
							sourceStoragePath:
								"tenants/11111111-1111-4111-8111-111111111111/attachments/fixture-sds.pdf",
						},
					],
					id: "profile-a",
					manufacturer: "Example Supplier",
					productName: "Fixture Solvent",
					sdsReviewed: true,
					sdsReviewedAt: "2026-05-05T06:00:00.000Z",
					sdsReviewedByUserEmail: "reviewer@example.invalid",
					storagePath:
						"tenants/11111111-1111-4111-8111-111111111111/attachments/fixture-sds.pdf",
					unNumber: "1170",
				},
			],
			labels: chemicalRecapViewLabels("en"),
			locale: "en",
		}),
	);

	assert.match(html, /Fixture Solvent/);
	assert.match(html, /General SDS controls/);
	assert.match(html, /Wear nitrile gloves EN 374/);
	assert.match(html, /Rinse with water for 15 minutes/);
	assert.match(html, /reviewer@example\.invalid on 5\/5\/2026/);
	assert.match(html, /data-toolbox-talk-source="chemical-recap"/);
	assert.match(html, /<img/);
	assert.match(
		html,
		/src="\/api\/storage\/tenants\/11111111-1111-4111-8111-111111111111\/attachments\/glove-example.png"/,
	);
	assert.doesNotMatch(html, /fixture-sds\.pdf"[^>]*><\/img>/);
	assert.doesNotMatch(html, /<h3[^>]*><div/);
});

test("chemical list and recap route expose recap navigation and session-backed loading", () => {
	const listLabels = chemicalProfileViewLabels("en");
	const listSource = readSource(
		"src/app/workspace/chemicals/ChemicalProfilesClient.tsx",
	);
	const recapPageSource = readSource(
		"src/app/workspace/chemicals/recap/page.tsx",
	);

	assert.equal(listLabels.actions.recap, "Worker recap");
	assert.match(listSource, /href="\/workspace\/chemicals\/recap"/);
	assert.match(recapPageSource, /validateSession/);
	assert.match(recapPageSource, /SESSION_COOKIE_NAME/);
	assert.match(recapPageSource, /listChemicalRecapCards\(session\.tenantId\)/);
});

function assertNoFunctions(value: unknown): void {
	if (typeof value === "function") {
		assert.fail("labels must not contain functions");
	}

	if (!value || typeof value !== "object") {
		return;
	}

	for (const item of Object.values(value)) {
		assertNoFunctions(item);
	}
}

function readSource(relativePath: string): string {
	return readFileSync(path.resolve(relativePath), "utf8");
}
