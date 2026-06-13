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
	ACTION_BOARD_FIXTURES,
	ACTION_BOARD_MESSAGE_KEYS,
	ACTION_BOARD_ORIGINS,
	ACTION_BOARD_STATUSES,
	actionBoardLabels,
	renderActionBoardFixture,
} = await import("../../../src/lib/actions/fixtures");
const { LOCALES, MESSAGE_KEYS } = await import("../../../src/lib/i18n/types");

const catalogs = {
	de: deMessages,
	en: enMessages,
	fr: frMessages,
	it: itMessages,
};

test("action board copy keys are registered in the typed message catalog", () => {
	for (const key of ACTION_BOARD_MESSAGE_KEYS) {
		assert.ok(MESSAGE_KEYS.includes(key), `${key} must be a typed message key`);
	}
});

test("action board copy keys exist in all four locales", () => {
	for (const locale of LOCALES) {
		for (const key of ACTION_BOARD_MESSAGE_KEYS) {
			assert.ok(catalogs[locale][key]?.trim(), `${locale}.${key} should be present`);
		}
	}
});

test("action board fixtures stay deterministic and cover statuses, origins, and departments", () => {
	assert.ok(
		ACTION_BOARD_FIXTURES.length >= 5 && ACTION_BOARD_FIXTURES.length <= 8,
		"bead expects 5-8 deterministic action rows",
	);

	const statuses = new Set(ACTION_BOARD_FIXTURES.map((action) => action.status));
	const origins = new Set(ACTION_BOARD_FIXTURES.map((action) => action.origin));
	const departments = new Set(
		ACTION_BOARD_FIXTURES.map((action) => action.department.en),
	);

	for (const status of ACTION_BOARD_STATUSES) {
		assert.ok(statuses.has(status), `missing fixture status ${status}`);
	}

	assert.ok(origins.size >= 5, "fixtures should exercise varied origins");
	assert.ok(departments.size >= 5, "fixtures should exercise varied departments");
	assert.ok(origins.has("hira"));
	assert.ok(origins.has("jha"));
	assert.ok(origins.has("incident"));
	assert.ok(origins.has("finding"));
	assert.ok(origins.has("audit"));
});

test("action board fixture render model resolves labels for each locale", () => {
	for (const locale of LOCALES) {
		const labels = actionBoardLabels(locale);
		assert.equal(JSON.stringify(labels).includes("actionBoard."), false);

		for (const action of ACTION_BOARD_FIXTURES) {
			const rendered = renderActionBoardFixture(action, locale);
			const textValues = JSON.stringify(rendered);

			assert.equal(rendered.id, action.id);
			assert.equal(rendered.title, action.title[locale]);
			assert.equal(rendered.description, action.description[locale]);
			assert.equal(textValues.includes("actionBoard."), false);
		}
	}
});

test("action board fixture render model localizes sample content", () => {
	const first = ACTION_BOARD_FIXTURES[0];

	assert.notEqual(first.title.de, first.title.en);
	assert.notEqual(renderActionBoardFixture(first, "de").title, first.title.en);
	assert.notEqual(renderActionBoardFixture(first, "fr").title, first.title.en);
	assert.notEqual(renderActionBoardFixture(first, "it").title, first.title.en);
	assert.ok(enMessages["actionBoard.empty.noMatches.body"].includes("filters"));
});
