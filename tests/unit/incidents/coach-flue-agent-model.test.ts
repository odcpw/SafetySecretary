import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { pathToFileURL } from "node:url";

const { DEFAULT_FLUE_MODEL, resolveFlueModel } = (await import(
	pathToFileURL("src/lib/incident/coach-flue-config.ts").href
)) as typeof import("../../../src/lib/incident/coach-flue-config");

test("flue incident model ownership resolves from SSFW_FLUE_MODEL only", async () => {
	assert.equal(resolveFlueModel({ SSFW_FLUE_MODEL: undefined }), DEFAULT_FLUE_MODEL);
	assert.equal(resolveFlueModel({ SSFW_FLUE_MODEL: "" }), DEFAULT_FLUE_MODEL);
	assert.equal(resolveFlueModel({ SSFW_FLUE_MODEL: "  " }), DEFAULT_FLUE_MODEL);
	assert.equal(
		resolveFlueModel({ SSFW_FLUE_MODEL: " openai/custom-model " }),
		"openai/custom-model",
	);

	const sources = await Promise.all([
		readFile(".flue/agents/incident-investigation.ts", "utf8"),
		readFile("scripts/agent-runtime/run-flue-incident-story.ts", "utf8"),
	]);

	for (const source of sources) {
		assert.match(source, /resolveFlueModel\(process\.env\)/);
	}
});
