import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

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
			return { shortCircuit: true, url: resolved.href };
		}

		return nextResolve(specifier, context);
	},
});

const { normalizePotentialSeverityForEvidence } = (await import(
	pathToFileURL("src/lib/incident/classification.ts").href
)) as typeof import("../../../src/lib/incident/classification");

test("credible HCN toxic exposure is never normalized below fatal potential", () => {
	assert.equal(
		normalizePotentialSeverityForEvidence(
			"D",
			"HCN readings exceeded alarm thresholds; evacuation was delayed and one operator may have remained exposed.",
		),
		"A",
	);
});

test("irreversible finger injury or amputation is never normalized below B", () => {
	assert.equal(
		normalizePotentialSeverityForEvidence(
			"D",
			"Finger partly shortened, possible Teilamputation and lasting functional impairment.",
		),
		"B",
	);
});

test("hospital admission or lost-work path is never normalized below C", () => {
	assert.equal(
		normalizePotentialSeverityForEvidence(
			"E",
			"Admitted to hospital overnight and expected to be off work for several days.",
		),
		"C",
	);
});

test("normalization does not downgrade a stricter proposed severity", () => {
	assert.equal(
		normalizePotentialSeverityForEvidence(
			"A",
			"Potential irreversible hand injury without a fatality path.",
		),
		"A",
	);
});
