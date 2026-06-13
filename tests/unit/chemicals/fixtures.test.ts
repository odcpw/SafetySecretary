import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import deMessages from "../../../src/lib/i18n/messages.de.json" with { type: "json" };
import enMessages from "../../../src/lib/i18n/messages.en.json" with { type: "json" };
import frMessages from "../../../src/lib/i18n/messages.fr.json" with { type: "json" };
import itMessages from "../../../src/lib/i18n/messages.it.json" with { type: "json" };

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

const {
	CHEMICAL_CONTROL_TYPES,
	CHEMICAL_EXTRACTION_STATUSES,
	CHEMICAL_MESSAGE_KEYS,
	CHEMICAL_PROFILE_FIXTURES,
	renderChemicalProfileFixture,
} = await import("../../../src/lib/chemicals/fixtures");
const { LOCALES, MESSAGE_KEYS } = await import("../../../src/lib/i18n/types");

const catalogs = {
	de: deMessages,
	en: enMessages,
	fr: frMessages,
	it: itMessages,
};

test("chemical copy keys are registered in the typed message catalog", () => {
	for (const key of CHEMICAL_MESSAGE_KEYS) {
		assert.ok(MESSAGE_KEYS.includes(key), `${key} must be a typed message key`);
	}
});

test("chemical copy keys exist in all four locales", () => {
	for (const locale of LOCALES) {
		for (const key of CHEMICAL_MESSAGE_KEYS) {
			assert.ok(catalogs[locale][key]?.trim(), `${locale}.${key} should be present`);
		}
	}
});

test("chemical fixture rows cover every extraction status", () => {
	assert.ok(
		CHEMICAL_PROFILE_FIXTURES.length >= 3 && CHEMICAL_PROFILE_FIXTURES.length <= 5,
		"bead expects 3-5 deterministic chemical profiles",
	);

	const statuses = new Set(
		CHEMICAL_PROFILE_FIXTURES.map((profile) => profile.extractionStatus),
	);

	for (const status of CHEMICAL_EXTRACTION_STATUSES) {
		assert.ok(statuses.has(status), `missing fixture status ${status}`);
	}
});

test("chemical fixture rows cover the required quick-card and control wording", () => {
	const controls = new Set(
		CHEMICAL_PROFILE_FIXTURES.flatMap((profile) => profile.controls),
	);

	for (const control of CHEMICAL_CONTROL_TYPES) {
		assert.ok(controls.has(control), `missing fixture control ${control}`);
	}
});

test("chemical fixture render model resolves labels for each locale", () => {
	for (const locale of LOCALES) {
		for (const profile of CHEMICAL_PROFILE_FIXTURES) {
			const rendered = renderChemicalProfileFixture(profile, locale);
			const textValues = JSON.stringify(rendered);

			assert.equal(rendered.id, profile.id);
			assert.equal(rendered.name, profile.name);
			assert.equal(rendered.controlLabels.length, profile.controls.length);
			assert.equal(textValues.includes("chemical."), false);
		}
	}
});
