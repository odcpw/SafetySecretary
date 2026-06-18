import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("flue incident agent model is controlled by SSFW_FLUE_MODEL only", async () => {
	const sources = await Promise.all([
		readFile(".flue/agents/incident-investigation.ts", "utf8"),
		readFile("scripts/agent-runtime/run-flue-incident-story.ts", "utf8"),
	]);

	for (const source of sources) {
		assert.match(source, /process\.env\.SSFW_FLUE_MODEL\?\.trim\(\)/);
		assert.match(source, /"openai\/gpt-5\.5"/);
		assert.doesNotMatch(source, /process\.env\.SSFW_PI_MODEL/);
		assert.doesNotMatch(source, /process\.env\.LLM_TEXT_MODEL/);
	}
});
