import assert from "node:assert/strict";
import test from "node:test";

const localeModulePath = "../../../src/lib/auth/locale.ts";
const { pickInitialUiLocale } = (await import(
	localeModulePath
)) as typeof import("../../../src/lib/auth/locale");

test("pickInitialUiLocale maps regional tags and respects q-values", () => {
	assert.equal(pickInitialUiLocale("de-CH;q=0.9,en;q=0.7", "en"), "de");
});

test("pickInitialUiLocale falls back to company default when no supported locale overlaps", () => {
	assert.equal(pickInitialUiLocale("es,pt;q=0.5", "it"), "it");
});

test("pickInitialUiLocale falls back to company default when header is absent", () => {
	assert.equal(pickInitialUiLocale(null, "fr"), "fr");
});

test("pickInitialUiLocale uses the highest-q supported locale independent of order", () => {
	assert.equal(
		pickInitialUiLocale("en;q=0.4,fr-CH;q=0.8,de;q=0.6", "it"),
		"fr",
	);
});
