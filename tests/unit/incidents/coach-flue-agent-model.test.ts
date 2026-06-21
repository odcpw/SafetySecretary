import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (context.parentURL && specifier.startsWith(".")) {
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
		}

		return nextResolve(specifier, context);
	},
});

const { DEFAULT_FLUE_MODEL, resolveFlueModel } = (await import(
	pathToFileURL("src/lib/incident/coach-flue-config.ts").href
)) as typeof import("../../../src/lib/incident/coach-flue-config");

test("flue incident model ownership resolves from SafetySecretary env with legacy fallback", async () => {
	assert.equal(
		resolveFlueModel({ SAFETYSECRETARY_FLUE_MODEL: undefined }),
		DEFAULT_FLUE_MODEL,
	);
	assert.equal(
		resolveFlueModel({ SAFETYSECRETARY_FLUE_MODEL: "" }),
		DEFAULT_FLUE_MODEL,
	);
	assert.equal(
		resolveFlueModel({ SAFETYSECRETARY_FLUE_MODEL: "  " }),
		DEFAULT_FLUE_MODEL,
	);
	assert.equal(
		resolveFlueModel({ SAFETYSECRETARY_FLUE_MODEL: " openai/custom-model " }),
		"openai/custom-model",
	);
	assert.equal(
		resolveFlueModel({ SSFW_FLUE_MODEL: " openai/legacy-model " }),
		"openai/legacy-model",
	);
	assert.equal(
		resolveFlueModel({
			SAFETYSECRETARY_FLUE_MODEL: " openai/new-model ",
			SSFW_FLUE_MODEL: " openai/legacy-model ",
		}),
		"openai/new-model",
	);

	const sources = await Promise.all([
		readFile(".flue/agents/incident-investigation.ts", "utf8"),
		readFile("scripts/agent-runtime/run-flue-incident-story.ts", "utf8"),
	]);

	for (const source of sources) {
		assert.match(source, /resolveFlueModel\(process\.env\)/);
	}
});
