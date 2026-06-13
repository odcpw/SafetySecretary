import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import type { AgentContextBundle, AgentRunInput } from "../../../src/lib/agent";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (context.parentURL && specifier.startsWith(".")) {
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
		}

		return nextResolve(specifier, context);
	},
});

const agentModulePath = "../../../src/lib/agent/index.ts";
const {
	AgentAllowedOperationTarget,
	AgentConfirmationMode,
	AgentErrorCategory,
	AgentFakeTransport,
	AgentOperationKind,
	AgentRunStatus,
	AgentSkillRegistry,
	AgentSurface,
	AgentWorkflowType,
	InMemoryAgentTraceStore,
	assertAgentContextHasNoPhotoPayloads,
	createAgentRuntime,
	digestContext,
} = (await import(agentModulePath)) as typeof import("../../../src/lib/agent");

const fixedNow = new Date("2026-05-12T08:00:00.000Z");
const skill = { id: "ii", version: "0.0.0-fake", section: "timeline" };

function baseInput(overrides: Partial<AgentRunInput> = {}): AgentRunInput {
	return {
		runId: "fake-run",
		tenantId: "tenant-1",
		userId: "user-1",
		workflowType: AgentWorkflowType.Ii,
		workflowId: "incident-1",
		locale: "en",
		kind: "authoring",
		requiresVision: false,
		skill,
		surface: AgentSurface.Workbench,
		...overrides,
	};
}

function contextFor(input: AgentRunInput = baseInput()): AgentContextBundle {
	return {
		metadata: {
			runId: input.runId ?? "fake-run",
			parentRunId: input.parentRunId,
			tenantId: input.tenantId,
			userId: input.userId,
			workflowType: input.workflowType,
			workflowId: input.workflowId,
			locale: input.locale,
			exportLocale: input.exportLocale,
			kind: input.kind,
			requiresVision: input.requiresVision,
			skill: input.skill,
			surface: input.surface,
			createdAt: fixedNow.toISOString(),
		},
		workflowSnapshot: {
			sections: {
				basics: {
					title: "Synthetic cable trip near miss",
					attachmentRefs: [{ type: "photo", id: "photo-1" }],
				},
			},
			attachmentRefs: [{ type: "photo", id: "photo-1", label: "sha256:abc" }],
		},
		methodologyRefs: [{ id: "ii.timeline" }],
		sameCompanyPatterns: [],
		conversationHistory: [
			{
				id: "msg-1",
				role: "user",
				text: "Synthetic description only.",
				createdAt: fixedNow.toISOString(),
			},
		],
		companyMemoryExcerpts: [],
		generatedArtifacts: [],
	};
}

test("fake transport emits deterministic fixture operations and redacted trace evidence", async () => {
	const input = baseInput();
	const context = contextFor(input);
	const transport = new AgentFakeTransport([
		{
			contextDigest: digestContext(context),
			skill,
			operations: [
				{
					id: "fake-run:op-1",
					runId: "fake-run",
					skill,
					kind: AgentOperationKind.AskQuestion,
					target: AgentAllowedOperationTarget.Conversation,
					confirmationMode: AgentConfirmationMode.AskOnly,
					sourceRefs: [{ type: "conversation", id: "msg-1" }],
					payload: { question: "Where exactly was the cable?" },
				},
			],
			modelCalls: [
				{
					provider: "fake-agent-transport",
					model: "synthetic-fixture",
					inputTokens: 12,
					outputTokens: 9,
					promptRedacted: true,
					responseRedacted: true,
				},
			],
			verificationChecks: [
				{
					id: "fixture-known",
					label: "known deterministic fixture",
					status: "passed",
					checkedAt: fixedNow.toISOString(),
				},
			],
		},
	]);
	const traceStore = new InMemoryAgentTraceStore();
	const runtime = createAgentRuntime({
		traceStore,
		skillRegistry: registryFor(transport),
		assembleContext: () => context,
		now: () => fixedNow,
	});

	const result = await runtime.dispatch(input);

	assert.equal(result.status, AgentRunStatus.AwaitingConfirmation);
	assert.equal(result.operations[0].kind, AgentOperationKind.AskQuestion);
	assert.equal(result.trace.modelCalls[0].provider, "fake-agent-transport");
	assert.equal(result.trace.modelCalls[0].promptRedacted, true);
	assert.equal(result.trace.modelCalls[0].responseRedacted, true);
	assert.equal(result.trace.verificationChecks[0].status, "passed");
});

test("fake transport raises loud error for unknown context digest", async () => {
	const transport = new AgentFakeTransport([]);
	const runtime = createAgentRuntime({
		traceStore: new InMemoryAgentTraceStore(),
		skillRegistry: registryFor(transport),
		assembleContext: () => contextFor(),
		now: () => fixedNow,
	});

	const result = await runtime.dispatch(
		baseInput({ runId: "unknown-context" }),
	);

	assert.equal(result.status, AgentRunStatus.Errored);
	assert.equal(result.trace.errorCategory, AgentErrorCategory.SkillViolation);
	assert.match(
		result.trace.userSafeMessage ?? "",
		/no fixture for this context/,
	);
});

test("agent context redaction allows photo refs but rejects photo bytes", () => {
	const context = contextFor();
	const serialized = JSON.stringify(context);
	assert.equal(serialized.includes("SENTINEL_PHOTO_BYTES"), false);
	assert.doesNotThrow(() => assertAgentContextHasNoPhotoPayloads(context));

	assert.throws(
		() =>
			assertAgentContextHasNoPhotoPayloads({
				...context,
				workflowSnapshot: {
					sections: {
						bad: {
							photoBytes: "SENTINEL_PHOTO_BYTES",
						},
					},
				},
			}),
		/photo payload/,
	);
});

function registryFor(transport: InstanceType<typeof AgentFakeTransport>) {
	const registry = new AgentSkillRegistry();
	registry.register(
		transport.asSkillRegistration({
			id: skill.id,
			version: skill.version,
			workflowTypes: [AgentWorkflowType.Ii],
			surfaces: [AgentSurface.Workbench],
		}),
	);
	return registry;
}
