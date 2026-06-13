import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

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
			return { shortCircuit: true, url: resolved.href };
		}

		return nextResolve(specifier, context);
	},
});

const {
	applyWorkflowAction,
	availableWorkflowActions,
	InvalidWorkflowTransitionError,
	isWorkflowStage,
	isWorkflowStageAction,
	registerStatus,
} = (await import(
	moduleUrl("src/lib/incident/workflow-stage.ts")
)) as typeof import("../../../src/lib/incident/workflow-stage");

test("lifecycle transitions follow capture→investigating→paused/closed", () => {
	assert.equal(applyWorkflowAction("CAPTURE", "start"), "INVESTIGATING");
	assert.equal(applyWorkflowAction("INVESTIGATING", "pause"), "PAUSED");
	assert.equal(applyWorkflowAction("PAUSED", "resume"), "INVESTIGATING");
	assert.equal(applyWorkflowAction("INVESTIGATING", "close"), "CLOSED");
	assert.equal(applyWorkflowAction("PAUSED", "close"), "CLOSED");
	assert.equal(applyWorkflowAction("CLOSED", "reopen"), "INVESTIGATING");
});

test("start is idempotent while an investigation is underway", () => {
	assert.equal(applyWorkflowAction("INVESTIGATING", "start"), "INVESTIGATING");
});

test("legacy per-tab stages count as an active investigation", () => {
	for (const legacy of ["FACTS", "TIMELINE", "CAUSES", "ACTIONS", "REVIEW"]) {
		assert.equal(registerStatus(legacy as never), "open");
		assert.equal(applyWorkflowAction(legacy as never, "pause"), "PAUSED");
		assert.equal(applyWorkflowAction(legacy as never, "close"), "CLOSED");
	}

	// APPROVED is terminal: it reads as closed and can only be reopened.
	assert.equal(registerStatus("APPROVED"), "closed");
	assert.equal(applyWorkflowAction("APPROVED", "reopen"), "INVESTIGATING");
});

test("invalid transitions throw a typed error", () => {
	assert.throws(
		() => applyWorkflowAction("CLOSED", "pause"),
		(error: unknown) =>
			error instanceof InvalidWorkflowTransitionError &&
			error.code === "INVALID_WORKFLOW_TRANSITION" &&
			error.from === "CLOSED" &&
			error.action === "pause",
	);
	assert.throws(() => applyWorkflowAction("CAPTURE", "resume"));
	assert.throws(() => applyWorkflowAction("CAPTURE", "reopen"));
	assert.throws(() => applyWorkflowAction("PAUSED", "pause"));
});

test("availableWorkflowActions lists only valid actions per stage", () => {
	assert.deepEqual(availableWorkflowActions("CAPTURE"), ["start", "close"]);
	assert.deepEqual(availableWorkflowActions("INVESTIGATING"), [
		"start",
		"pause",
		"close",
	]);
	assert.deepEqual(availableWorkflowActions("PAUSED"), ["resume", "close"]);
	assert.deepEqual(availableWorkflowActions("CLOSED"), ["reopen"]);
	assert.deepEqual(availableWorkflowActions("APPROVED"), ["reopen"]);
});

test("guards recognise valid stages and actions", () => {
	assert.ok(isWorkflowStage("CAPTURE"));
	assert.ok(isWorkflowStage("FACTS"));
	assert.ok(!isWorkflowStage("NONSENSE"));
	assert.ok(isWorkflowStageAction("start"));
	assert.ok(!isWorkflowStageAction("explode"));
});

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith(".") || specifier.startsWith("/");
}

function moduleUrl(relativePath: string): string {
	return pathToFileURL(`${process.cwd()}/${relativePath}`).href;
}
