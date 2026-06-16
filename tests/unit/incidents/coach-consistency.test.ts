import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (!context.parentURL || !isLocalImport(specifier)) {
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

const { buildManualEditConsistencyReviewMessage } = (await import(
	moduleUrl("src/lib/incident/coach-consistency.ts")
)) as typeof import("../../../src/lib/incident/coach-consistency");

test("manual edit consistency prompt asks for global review without automatic mutation", () => {
	const message = buildManualEditConsistencyReviewMessage({
		changes: [
			{
				area: "facts",
				summary: "Edited fact: floor was wet before the slip",
			},
			{
				area: "actions",
				summary: "Deleted a measure",
			},
		],
		locale: "en",
	});

	assert.match(message, /manually changed/i);
	assert.match(message, /facts: Edited fact/);
	assert.match(message, /actions: Deleted a measure/);
	assert.match(message, /logical consistency/i);
	assert.match(message, /facts, timeline, causes, causal dependencies/i);
	assert.match(message, /create no proposals/i);
});

function moduleUrl(relativePath: string): string {
	return pathToFileURL(relativePath).href;
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}
