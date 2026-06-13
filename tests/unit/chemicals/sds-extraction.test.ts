import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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
const {
	SdsExtractionError,
	buildSdsExtractionPrompt,
	parseSdsExtractionResponse,
} = (await import(
	extractionModulePath
)) as typeof import("../../../src/lib/chemicals/sds-extraction");

test("SDS extraction prompt preserves product context and asks for sourced JSON controls", () => {
	const prompt = buildSdsExtractionPrompt({
		productName: "Synthetic solvent A",
		sdsText: "Section 8: Use local exhaust ventilation. Wear splash goggles.",
	});

	assert.match(prompt, /Synthetic solvent A/);
	assert.match(prompt, /Return JSON only/);
	assert.match(prompt, /sourceExcerpt/);
	assert.match(prompt, /Do not invent controls/);
});

test("SDS extraction response parser normalizes reviewable draft controls", () => {
	const controls = parseSdsExtractionResponse(`
		\`\`\`json
		{
			"controls": [
				{
					"controlType": "use_control",
					"controlText": "Use local exhaust ventilation",
					"sdsSection": "Section 8 - Exposure Controls",
					"sourceExcerpt": "Use local exhaust ventilation.",
					"pageLineRef": "p. 4",
					"confidence": 0.83
				},
				{
					"controlType": "first_aid",
					"controlText": "Rinse eyes with water for several minutes",
					"sdsSection": "Section 4 - First aid",
					"sourceExcerpt": "Rinse cautiously with water for several minutes."
				}
			]
		}
		\`\`\`
	`);

	assert.deepEqual(controls, [
		{
			controlText: "Use local exhaust ventilation",
			controlType: "use_control",
			extractionConfidence: 0.83,
			pageLineRef: "p. 4",
			sdsSection: "Section 8 - Exposure Controls",
			sourceExcerpt: "Use local exhaust ventilation.",
		},
		{
			controlText: "Rinse eyes with water for several minutes",
			controlType: "first_aid",
			extractionConfidence: null,
			pageLineRef: null,
			sdsSection: "Section 4 - First aid",
			sourceExcerpt: "Rinse cautiously with water for several minutes.",
		},
	]);
});

test("SDS extraction response parser rejects unsupported or unsourced controls", () => {
	assert.throws(
		() =>
			parseSdsExtractionResponse(
				JSON.stringify({
					controls: [
						{
							controlText: "Use a better process",
							controlType: "engineering",
							sdsSection: "Section 8",
							sourceExcerpt: "Use a better process.",
						},
					],
				}),
			),
		SdsExtractionError,
	);

	assert.throws(
		() =>
			parseSdsExtractionResponse(
				JSON.stringify({
					controls: [
						{
							controlText: "Wear gloves",
							controlType: "glove_type",
							sdsSection: "Section 8",
						},
					],
				}),
			),
		SdsExtractionError,
	);
});
