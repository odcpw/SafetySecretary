import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

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

const groupingClientModule = (await import(
	"../../../src/app/workspace/chemicals/grouping/ChemicalControlGroupingClient"
)) as typeof import("../../../src/app/workspace/chemicals/grouping/ChemicalControlGroupingClient");
const viewLabelsModule = (await import(
	"../../../src/lib/chemicals/view-labels"
)) as typeof import("../../../src/lib/chemicals/view-labels");
const { default: ChemicalControlGroupingClient } = groupingClientModule;
const { chemicalControlGroupingViewLabels } = viewLabelsModule;

test("chemical control grouping labels are serializable across the client boundary", () => {
	const labels = chemicalControlGroupingViewLabels("en");

	assertNoFunctions(labels);
	assert.ok(labels.counts.controlCountTemplate.includes("{count}"));
	assert.ok(labels.counts.profileCountTemplate.includes("{count}"));
});

test("chemical control grouping client renders linked profiles", () => {
	const labels = chemicalControlGroupingViewLabels("en");
	const html = renderToStaticMarkup(
		createElement(ChemicalControlGroupingClient, {
			groups: [
				{
					controlCount: 2,
					controlText: "Nitrile gloves EN 374",
					controlType: "glove_type",
					profileCount: 2,
					profiles: [
						{
							id: "profile-a",
							manufacturer: "Example Safety",
							productName: "Solvent Alpha",
							profileStatus: "active",
						},
						{
							id: "profile-b",
							manufacturer: "Example Safety",
							productName: "Degreaser Beta",
							profileStatus: "draft",
						},
					],
				},
			],
			labels,
		}),
	);

	assert.match(html, /Nitrile gloves EN 374/);
	assert.match(html, /href="\/workspace\/chemicals\?profile=profile-a"/);
	assert.match(html, /Solvent Alpha/);
	assert.doesNotMatch(html, /<h3[^>]*><div/);
});

test("chemical routes expose grouping navigation and session-backed route loading", () => {
	const listPageSource = readSource(
		"src/app/workspace/chemicals/ChemicalProfilesClient.tsx",
	);
	const groupingPageSource = readSource(
		"src/app/workspace/chemicals/grouping/page.tsx",
	);

	assert.match(listPageSource, /href="\/workspace\/chemicals\/grouping"/);
	assert.match(groupingPageSource, /validateSession/);
	assert.match(groupingPageSource, /SESSION_COOKIE_NAME/);
	assert.match(
		groupingPageSource,
		/listChemicalControlGroups\(session\.tenantId\)/,
	);
	assert.match(groupingPageSource, /ChemicalControlGroupingClient/);
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
