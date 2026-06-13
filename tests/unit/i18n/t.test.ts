import assert from "node:assert/strict";
import test from "node:test";
import deMessages from "../../../src/lib/i18n/messages.de.json" with { type: "json" };
import enMessages from "../../../src/lib/i18n/messages.en.json" with { type: "json" };
import frMessages from "../../../src/lib/i18n/messages.fr.json" with { type: "json" };
import itMessages from "../../../src/lib/i18n/messages.it.json" with { type: "json" };
// @ts-expect-error Node's strip-types runner resolves this local TS module at runtime.
import { LOCALES, MESSAGE_KEYS, type MessageKey } from "../../../src/lib/i18n/types.ts";
// @ts-expect-error Node's strip-types runner resolves this local TS module at runtime.
import { resolveMessage, t } from "../../../src/lib/i18n/t.ts";

const compileTimeTypeChecks = () => {
	const key: MessageKey = "action.save";

	void t(key, "en");
	// @ts-expect-error Unknown message keys must be rejected at compile time.
	void t("nonexistent.key", "en");
};

test("t returns strings for each locale", () => {
	assert.equal(t("action.save", "en"), "Save");
	assert.equal(t("action.save", "de"), "Speichern");
	assert.equal(t("action.save", "fr"), "Enregistrer");
	assert.equal(t("action.save", "it"), "Salva");
});

test("message catalogs share the same stable keys", () => {
	const expected = [...MESSAGE_KEYS].sort();

	assert.deepEqual(Object.keys(enMessages).sort(), expected);

	for (const catalog of [deMessages, frMessages, itMessages]) {
		assert.deepEqual(Object.keys(catalog).sort(), expected);
	}
});

test("every locale has non-empty values for every key", () => {
	for (const locale of LOCALES) {
		const catalog = { de: deMessages, en: enMessages, fr: frMessages, it: itMessages }[
			locale
		];

		for (const [key, value] of Object.entries(catalog)) {
			assert.ok(value.trim(), `${locale}.${key} should not be empty`);
		}
	}
});

test("resolveMessage falls back to EN for missing locale keys", () => {
	const catalogs = {
		de: {},
		en: { "action.save": "Save" },
		fr: {},
		it: {},
	};

	assert.equal(resolveMessage("action.save", "de", catalogs), "Save");
});

test("message keys are type-safe at compile time", () => {
	const key: MessageKey = "action.save";

	assert.equal(t(key, "en"), "Save");
	assert.equal(typeof compileTimeTypeChecks, "function");
});
