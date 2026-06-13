import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";

registerHooks({
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

const { CHEMICAL_CONTROL_TYPES } = await import(
	"../../../src/lib/chemicals/fixtures"
);
const { chemicalProfileViewLabels } = await import(
	"../../../src/lib/chemicals/view-labels"
);

test("chemical profile detail renders extraction status and localized control labels", () => {
	const source = readFileSync(
		"src/app/workspace/chemicals/ChemicalProfilesClient.tsx",
		"utf8",
	);

	assert.ok(
		countOccurrences(
			source,
			"labels.extractionStatus[profile.extractionStatus]",
		) >= 2,
		"list and detail views should both render extraction status labels",
	);
	assert.match(source, /detailOpen/);
	assert.match(source, /isOpen=\{Boolean\(selectedProfile && detailOpen/);
	assert.match(source, /labels\.controlTypes\[control\.controlType\]/);
	assert.match(source, /initialProfileId/);
	assert.match(source, /selectedInitialProfileId/);
});

test("chemical profile view labels expose every control type without raw enum fallback", () => {
	const labels = chemicalProfileViewLabels("en");

	for (const controlType of CHEMICAL_CONTROL_TYPES) {
		const label = labels.controlTypes[controlType];
		assert.ok(label);
		assert.equal(label.includes("chemical."), false);
		assert.equal(label.includes("_"), false);
	}
});

function countOccurrences(source: string, needle: string): number {
	return source.split(needle).length - 1;
}
