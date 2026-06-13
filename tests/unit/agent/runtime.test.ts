import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import type {
	AgentContextBundle,
	AgentRunInput,
	AgentSkillRegistration,
} from "../../../src/lib/agent";

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
	AgentConfirmationMode,
	AgentErrorCategory,
	AgentOperationKind,
	AgentRunStatus,
	AgentSurface,
	AgentWorkflowType,
	AgentRunCancelledError,
	AgentRuntimeError,
	AgentSkillRegistry,
	InMemoryAgentTraceStore,
	createAgentRuntime,
	digestContext,
} = (await import(agentModulePath)) as typeof import("../../../src/lib/agent");

const fixedNow = new Date("2026-05-12T06:00:00.000Z");

function baseInput(overrides: Partial<AgentRunInput> = {}): AgentRunInput {
	return {
		runId: "run-1",
		tenantId: "tenant-1",
		userId: "user-1",
		workflowType: AgentWorkflowType.Ii,
		workflowId: "incident-1",
		locale: "en",
		kind: "authoring",
		requiresVision: false,
		skill: { id: "ii", version: "0.0.0-placeholder", section: "timeline" },
		surface: AgentSurface.Workbench,
		...overrides,
	};
}

function contextFor(input: AgentRunInput): AgentContextBundle {
	return {
		metadata: {
			runId: input.runId ?? "run-1",
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
				incident: { title: "Synthetic near miss" },
			},
		},
		methodologyRefs: [{ id: "stop.definitions" }],
		sameCompanyPatterns: [],
		conversationHistory: [],
		companyMemoryExcerpts: [],
		generatedArtifacts: [],
	};
}

function createRegistry(skill?: Partial<AgentSkillRegistration>) {
	const registry = new AgentSkillRegistry();
	registry.register({
		id: "ii",
		version: "0.0.0-placeholder",
		workflowTypes: [AgentWorkflowType.Ii],
		surfaces: [AgentSurface.Workbench],
		async run(context) {
			return {
				operations: [
					{
						id: `${context.metadata.runId}:op-1`,
						runId: context.metadata.runId,
						skill: context.metadata.skill,
						kind: AgentOperationKind.AskQuestion,
						confirmationMode: AgentConfirmationMode.AskOnly,
						sourceRefs: [{ type: "conversation", id: "msg-1" }],
						payload: { question: "Where did this happen?" },
					},
				],
			};
		},
		...skill,
	});
	return registry;
}

test("dispatch assembles context and records trace lifecycle", async () => {
	const traceStore = new InMemoryAgentTraceStore();
	const input = baseInput();
	const context = contextFor(input);
	const runtime = createAgentRuntime({
		traceStore,
		skillRegistry: createRegistry(),
		assembleContext: () => context,
		now: () => fixedNow,
	});

	const result = await runtime.dispatch(input);

	assert.equal(result.runId, "run-1");
	assert.equal(result.status, AgentRunStatus.AwaitingConfirmation);
	assert.equal(result.operations.length, 1);
	assert.equal(result.operations[0].kind, AgentOperationKind.AskQuestion);
	assert.equal(result.trace.contextDigest, digestContext(context));
	assert.equal(
		result.trace.structuredOperations[0].kind,
		AgentOperationKind.AskQuestion,
	);
	assert.deepEqual(result.trace.structuredOperationIds, ["run-1:op-1"]);
	assert.equal(result.trace.tenantId, "tenant-1");
	assert.equal(result.trace.skill.id, "ii");

	const withVerification = await traceStore.recordVerificationChecks({
		tenantId: "tenant-1",
		runId: "run-1",
		checks: [
			{
				id: "check-1",
				label: "synthetic verification",
				status: "passed",
				checkedAt: fixedNow.toISOString(),
			},
		],
	});
	assert.equal(withVerification.verificationChecks[0].status, "passed");
});

test("trace store is tenant scoped", async () => {
	const traceStore = new InMemoryAgentTraceStore();
	const runtime = createAgentRuntime({
		traceStore,
		skillRegistry: createRegistry(),
		assembleContext: (metadata) => contextFor({ ...baseInput(), ...metadata }),
		now: () => fixedNow,
	});

	await runtime.dispatch(
		baseInput({ runId: "run-tenant-a", tenantId: "tenant-a" }),
	);

	assert.ok(
		await traceStore.get({ tenantId: "tenant-a", runId: "run-tenant-a" }),
	);
	assert.equal(
		await traceStore.get({ tenantId: "tenant-b", runId: "run-tenant-a" }),
		null,
	);
});

test("pre-dispatch cancellation records cancelled trace", async () => {
	const controller = new AbortController();
	controller.abort();
	const traceStore = new InMemoryAgentTraceStore();
	const runtime = createAgentRuntime({
		traceStore,
		skillRegistry: createRegistry(),
		assembleContext: () => {
			throw new Error("context assembly should not run");
		},
		now: () => fixedNow,
	});

	const result = await runtime.dispatch(
		baseInput({ runId: "cancelled-run", signal: controller.signal }),
	);

	assert.equal(result.status, AgentRunStatus.Cancelled);
	assert.equal(result.trace.cancelReason, "Cancelled before dispatch.");
	assert.deepEqual(result.operations, []);
});

test("skill-level cancellation finalizes a cancelled trace", async () => {
	const traceStore = new InMemoryAgentTraceStore();
	const runtime = createAgentRuntime({
		traceStore,
		skillRegistry: createRegistry({
			async run() {
				throw new AgentRunCancelledError("Cancelled inside skill.");
			},
		}),
		assembleContext: (metadata) => contextFor({ ...baseInput(), ...metadata }),
		now: () => fixedNow,
	});

	const result = await runtime.dispatch(
		baseInput({ runId: "skill-cancelled" }),
	);

	assert.equal(result.status, AgentRunStatus.Cancelled);
	assert.equal(result.trace.cancelReason, "Cancelled inside skill.");
	assert.deepEqual(result.trace.structuredOperationIds, []);
	assert.deepEqual(result.operations, []);
});

test("late cancellation after skill execution does not record operations", async () => {
	const controller = new AbortController();
	const traceStore = new InMemoryAgentTraceStore();
	const runtime = createAgentRuntime({
		traceStore,
		skillRegistry: createRegistry({
			async run(context) {
				queueMicrotask(() => controller.abort());
				return {
					operations: [
						{
							id: `${context.metadata.runId}:late-op`,
							runId: context.metadata.runId,
							skill: context.metadata.skill,
							kind: AgentOperationKind.AskQuestion,
							confirmationMode: AgentConfirmationMode.AskOnly,
							sourceRefs: [],
							payload: { question: "Should not be recorded." },
						},
					],
				};
			},
		}),
		assembleContext: (metadata) => contextFor({ ...baseInput(), ...metadata }),
		now: () => fixedNow,
	});

	const result = await runtime.dispatch(
		baseInput({ runId: "late-cancelled", signal: controller.signal }),
	);

	assert.equal(result.status, AgentRunStatus.Cancelled);
	assert.equal(result.trace.cancelReason, "Cancelled after skill execution.");
	assert.deepEqual(result.trace.structuredOperationIds, []);
	assert.deepEqual(result.operations, []);
});

test("cancellation during operation recording discards proposed operations", async () => {
	const controller = new AbortController();
	const traceStore = new InMemoryAgentTraceStore();
	const recordStructuredOperations =
		traceStore.recordStructuredOperations.bind(traceStore);
	traceStore.recordStructuredOperations = async (input) => {
		const trace = await recordStructuredOperations(input);
		controller.abort();
		return trace;
	};
	const runtime = createAgentRuntime({
		traceStore,
		skillRegistry: createRegistry(),
		assembleContext: (metadata) => contextFor({ ...baseInput(), ...metadata }),
		now: () => fixedNow,
	});

	const result = await runtime.dispatch(
		baseInput({ runId: "record-cancelled", signal: controller.signal }),
	);

	assert.equal(result.status, AgentRunStatus.Cancelled);
	assert.equal(result.trace.cancelReason, "Cancelled before completion.");
	assert.deepEqual(result.trace.structuredOperations, []);
	assert.deepEqual(result.trace.structuredOperationIds, []);
	assert.deepEqual(result.operations, []);
});

test("runtime records named error category from skill failure", async () => {
	const traceStore = new InMemoryAgentTraceStore();
	const runtime = createAgentRuntime({
		traceStore,
		skillRegistry: createRegistry({
			async run() {
				throw new AgentRuntimeError(
					AgentErrorCategory.ToolFailed,
					"The assistant tool failed. Manual editing is still available.",
				);
			},
		}),
		assembleContext: (metadata) => contextFor({ ...baseInput(), ...metadata }),
		now: () => fixedNow,
	});

	const result = await runtime.dispatch(baseInput({ runId: "failed-run" }));

	assert.equal(result.status, AgentRunStatus.Errored);
	assert.equal(result.trace.errorCategory, AgentErrorCategory.ToolFailed);
	assert.match(result.trace.userSafeMessage ?? "", /Manual editing/);
});

test("registry rejects unavailable skill without workflow logic fallback", async () => {
	const traceStore = new InMemoryAgentTraceStore();
	const runtime = createAgentRuntime({
		traceStore,
		skillRegistry: new AgentSkillRegistry(),
		assembleContext: (metadata) => contextFor({ ...baseInput(), ...metadata }),
		now: () => fixedNow,
	});

	const result = await runtime.dispatch(baseInput({ runId: "missing-skill" }));

	assert.equal(result.status, AgentRunStatus.Errored);
	assert.equal(result.trace.errorCategory, AgentErrorCategory.SkillViolation);
});
