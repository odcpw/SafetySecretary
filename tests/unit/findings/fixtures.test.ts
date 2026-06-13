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
	FINDING_FIXTURES,
	FINDING_MESSAGE_KEYS,
	FINDING_SEVERITIES,
	FINDING_STATUSES,
	FINDING_TYPES,
	renderFindingFixture,
} = await import("../../../src/lib/findings/fixtures");
const { LOCALES, MESSAGE_KEYS } = await import("../../../src/lib/i18n/types");

const catalogs = {
	de: deMessages,
	en: enMessages,
	fr: frMessages,
	it: itMessages,
};

test("finding copy keys are registered in the typed message catalog", () => {
	for (const key of FINDING_MESSAGE_KEYS) {
		assert.ok(MESSAGE_KEYS.includes(key), `${key} must be a typed message key`);
	}
});

test("finding copy keys exist in all four locales", () => {
	for (const locale of LOCALES) {
		for (const key of FINDING_MESSAGE_KEYS) {
			assert.ok(catalogs[locale][key]?.trim(), `${locale}.${key} should be present`);
		}
	}
});

test("finding fixtures stay deterministic and cover required types/statuses", () => {
	assert.ok(
		FINDING_FIXTURES.length >= 3 && FINDING_FIXTURES.length <= 5,
		"bead expects 3-5 deterministic finding rows",
	);

	const types = new Set(FINDING_FIXTURES.map((finding) => finding.type));
	const statuses = new Set(FINDING_FIXTURES.map((finding) => finding.status));

	for (const type of FINDING_TYPES) {
		assert.ok(types.has(type), `missing fixture type ${type}`);
	}

	for (const status of FINDING_STATUSES) {
		assert.ok(statuses.has(status), `missing fixture status ${status}`);
	}
});

test("finding fixtures cover severities, no-blame copy, and good-catch wording", () => {
	const severities = new Set(FINDING_FIXTURES.map((finding) => finding.severity));

	for (const severity of FINDING_SEVERITIES) {
		assert.ok(severities.has(severity), `missing fixture severity ${severity}`);
	}

	assert.ok(
		FINDING_FIXTURES.some((finding) => finding.goodCatch),
		"at least one fixture should exercise good-catch copy",
	);
	assert.ok(enMessages["finding.noBlame.note"].includes("do not assign blame"));
	assert.ok(enMessages["finding.goodCatch.badge"].includes("Good catch"));
});

test("finding fixture render model resolves labels for each locale", () => {
	for (const locale of LOCALES) {
		for (const finding of FINDING_FIXTURES) {
			const rendered = renderFindingFixture(finding, locale);
			const textValues = JSON.stringify(rendered);

			assert.equal(rendered.id, finding.id);
			assert.equal(rendered.title, finding.title[locale]);
			assert.equal(rendered.goodCatch.enabled, finding.goodCatch);
			assert.equal(textValues.includes("finding."), false);
		}
	}
});

test("finding fixture render model localizes sample content", () => {
	const first = FINDING_FIXTURES[0];

	assert.notEqual(first.title.de, first.title.en);
	assert.notEqual(renderFindingFixture(first, "de").title, first.title.en);
	assert.notEqual(renderFindingFixture(first, "fr").title, first.title.en);
	assert.notEqual(renderFindingFixture(first, "it").title, first.title.en);
});
