import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import type { Locale } from "../../../src/lib/i18n/types";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (!context.parentURL || !isLocalImport(specifier)) {
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

const { accountFormErrorMessageKey, personFormErrorMessageKey } = (await import(
	"../../../src/lib/incident/persons-errors"
)) as typeof import("../../../src/lib/incident/persons-errors");
const { t } = (await import(
	"../../../src/lib/i18n/t"
)) as typeof import("../../../src/lib/i18n/t");
const { LOCALES } = (await import(
	"../../../src/lib/i18n/types"
)) as typeof import("../../../src/lib/i18n/types");

test("II persons/account error messages resolve for all locales", () => {
	const cases = [
		personFormErrorMessageKey("INVALID_PERSON_PAYLOAD"),
		personFormErrorMessageKey("INVALID_PERSON_ID"),
		accountFormErrorMessageKey("INVALID_ACCOUNT_PAYLOAD"),
	];

	for (const locale of LOCALES) {
		for (const key of cases) {
			const translated = t(key, locale as Locale);
			assert.equal(typeof translated, "string");
			assert.ok(translated.trim(), `${locale}:${key} must resolve`);
		}
	}
});

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith(".") || specifier.startsWith("/");
}
