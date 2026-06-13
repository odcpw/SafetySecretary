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
			new URL(`${specifier}/index.ts`, context.parentURL),
		];
		const resolved = candidates.find((candidate) => existsSync(candidate));

		if (resolved) {
			return { shortCircuit: true, url: resolved.href };
		}

		return nextResolve(specifier, context);
	},
});

const { INCIDENT_COACH_SKILL, incidentCoachSkillRef } = (await import(
	moduleUrl("src/lib/agent/skills/incident-coach-v1.ts")
)) as typeof import("../../../src/lib/agent/skills/incident-coach-v1");
const { AgentOperationKind } = (await import(
	moduleUrl("src/lib/agent/types.ts")
)) as typeof import("../../../src/lib/agent/types");

test("incident coach skill contract pins the prompt sections", () => {
	for (const section of INCIDENT_COACH_SKILL.requiredPromptSections) {
		assert.ok(
			INCIDENT_COACH_SKILL.systemPrompt.includes(section),
			`prompt is missing required section "${section}" — if intentional, bump the skill version and update the contract`,
		);
	}
});

test("incident coach skill version is semver and the ref carries it", () => {
	assert.match(INCIDENT_COACH_SKILL.version, /^\d+\.\d+\.\d+$/);
	const ref = incidentCoachSkillRef("coach-chat");
	assert.equal(ref.id, "incident-investigation");
	assert.equal(ref.version, INCIDENT_COACH_SKILL.version);
	assert.equal(ref.section, "coach-chat");
});

test("every allowed operation kind is documented in the prompt", () => {
	for (const kind of INCIDENT_COACH_SKILL.allowedOperationKinds) {
		assert.ok(
			INCIDENT_COACH_SKILL.systemPrompt.includes(`- ${kind}:`),
			`allowed kind "${kind}" has no payload documentation in the prompt`,
		);
	}

	assert.ok(
		INCIDENT_COACH_SKILL.allowedOperationKinds.includes(
			AgentOperationKind.CauseUpdate,
		),
	);
});

function moduleUrl(relativePath: string): string {
	return pathToFileURL(relativePath).href;
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}
