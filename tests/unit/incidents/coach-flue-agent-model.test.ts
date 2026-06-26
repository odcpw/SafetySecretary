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

test("flue incident agent contract stays agent-first, not prompt-only", async () => {
	const [agentSource, skillSource, architectureDoc, coachChatDoc, caseLabDoc] =
		await Promise.all([
			readFile(".flue/agents/incident-investigation.ts", "utf8"),
			readFile(".flue/skills/incident-investigation/SKILL.md", "utf8"),
			readFile("docs/dev/incident-investigation-agent.md", "utf8"),
			readFile("docs/dev/coach-chat.md", "utf8"),
			readFile("docs/dev/case-lab.md", "utf8"),
		]);

	assert.match(agentSource, /incident investigation agent/);
	assert.match(agentSource, /record reader, proposal tools, and validator/);
	assert.match(agentSource, /fix the operations before the final response/);

	assert.match(skillSource, /## Agent Operating Model/);
	assert.match(skillSource, /not a stateless prompt completion/);
	assert.match(skillSource, /read_incident_record/);
	assert.match(skillSource, /validate_incident_operations/);

	assert.match(architectureDoc, /not a prompt-only chat completion/);
	assert.match(architectureDoc, /Flue agent plus Flue skill and tools/);
	assert.match(architectureDoc, /Backend guards are not the intelligence/);

	assert.doesNotMatch(coachChatDoc, /The brain \(system prompt\)/);
	assert.match(coachChatDoc, /Live Flue investigation skill/);
	assert.match(coachChatDoc, /Fallback dispatch\/Pi prompt contract/);

	assert.match(caseLabDoc, /Flue agent\s+instructions/);
	assert.match(
		caseLabDoc,
		/not whether a transcript\s+resembles\s+an old conversation/,
	);
});
