import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import type {
	AgentContextBundle,
	AgentRunInput,
	AgentRunMetadata,
	AgentStructuredOperation,
	AgentToolDefinition,
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
	AgentAllowedOperationTarget,
	AgentConfirmationMode,
	AgentErrorCategory,
	AgentForbiddenOperationTarget,
	AgentOperationKind,
	AgentRuntimeError,
	AgentSurface,
	AgentToolClassification,
	AgentToolRegistry,
	AgentWorkflowType,
	AgentSkillRegistry,
	InMemoryAgentTraceStore,
	createAgentRuntime,
	createInitialAgentToolRegistry,
} = (await import(agentModulePath)) as typeof import("../../../src/lib/agent");

const fixedNow = new Date("2026-05-12T07:00:00.000Z");

function metadata(overrides: Partial<AgentRunMetadata> = {}): AgentRunMetadata {
	return {
		runId: "tool-run",
		tenantId: "tenant-1",
		userId: "user-1",
		workflowType: AgentWorkflowType.Ii,
		workflowId: "incident-1",
		locale: "en",
		kind: "authoring" as const,
		requiresVision: false,
		skill: { id: "ii", version: "0.0.0-placeholder" },
		surface: AgentSurface.Workbench,
		createdAt: fixedNow.toISOString(),
		...overrides,
	};
}

function runInput(overrides: Partial<AgentRunInput> = {}): AgentRunInput {
	const { createdAt: _createdAt, ...input } = metadata();
	return {
		...input,
		...overrides,
	};
}

function bundle(): AgentContextBundle {
	return {
		metadata: metadata(),
		workflowSnapshot: {
			sections: {
				basics: { title: "Synthetic near miss" },
			},
		},
		methodologyRefs: [{ id: "ii.timeline" }],
		sameCompanyPatterns: [],
		conversationHistory: [
			{
				id: "msg-1",
				role: "user",
				text: "I tripped over a cable.",
				createdAt: fixedNow.toISOString(),
			},
		],
		companyMemoryExcerpts: [],
		generatedArtifacts: [],
	};
}

function askQuestionOperation(
	overrides: Partial<AgentStructuredOperation> = {},
): AgentStructuredOperation {
	return {
		id: "op-1",
		runId: "tool-run",
		skill: { id: "ii", version: "0.0.0-placeholder" },
		kind: AgentOperationKind.AskQuestion,
		target: AgentAllowedOperationTarget.Conversation,
		confirmationMode: AgentConfirmationMode.AskOnly,
		sourceRefs: [{ type: "conversation", id: "msg-1" }],
		payload: { question: "Where exactly did this happen?" },
		...overrides,
	} as AgentStructuredOperation;
}

test("initial II tool registry exposes read and propose tool descriptors", () => {
	const registry = createInitialAgentToolRegistry();
	const descriptors = registry.listDescriptors();

	assert.deepEqual(descriptors.map((descriptor) => descriptor.name).sort(), [
		"propose_structured_operation",
		"read_company_memory",
		"read_conversation_history",
		"read_methodology_ref",
		"read_workflow_section",
	]);
	assert.equal(
		registry.descriptor("read_workflow_section", "v1").permissions
			.classification,
		AgentToolClassification.Read,
	);
	assert.equal(
		registry.descriptor("propose_structured_operation", "v1").permissions
			.classification,
		AgentToolClassification.Propose,
	);
	assert.ok(
		descriptors.every(
			(descriptor) => descriptor.permissions.mutatesWorkflowRecords === false,
		),
	);
});

test("read tools validate input and enforce workflow permissions", async () => {
	const registry = createInitialAgentToolRegistry();
	const contextBundle = bundle();

	const output = (await registry.invoke({
		name: "read_workflow_section",
		version: "v1",
		input: { section: "basics" },
		context: { metadata: metadata(), bundle: contextBundle },
	})) as { data: { title: string } };

	assert.deepEqual(output, {
		section: "basics",
		data: { title: "Synthetic near miss" },
	});
	output.data.title = "mutated through tool output";
	assert.deepEqual(contextBundle.workflowSnapshot.sections.basics, {
		title: "Synthetic near miss",
	});

	await assert.rejects(
		registry.invoke({
			name: "read_workflow_section",
			version: "v1",
			input: { section: "" },
			context: { metadata: metadata(), bundle: bundle() },
		}),
		/Too small/,
	);

	await assert.rejects(
		registry.invoke({
			name: "read_workflow_section",
			version: "v1",
			input: { section: "basics" },
			context: {
				metadata: metadata({ workflowType: AgentWorkflowType.Hira }),
				bundle: bundle(),
			},
		}),
		(error) =>
			error instanceof AgentRuntimeError &&
			error.category === AgentErrorCategory.SkillViolation,
	);

	await assert.rejects(
		registry.invoke({
			name: "read_workflow_section",
			version: "v1",
			input: { section: "basics" },
			context: {
				metadata: metadata({ surface: AgentSurface.Mobile }),
				bundle: bundle(),
			},
		}),
		(error) =>
			error instanceof AgentRuntimeError &&
			error.category === AgentErrorCategory.SkillViolation,
	);
});

test("propose_structured_operation round-trips synthetic II operations without applying", async () => {
	const registry = createInitialAgentToolRegistry();
	const operation = askQuestionOperation();

	const output = await registry.invoke({
		name: "propose_structured_operation",
		version: "v1",
		input: { operation },
		context: { metadata: metadata(), bundle: bundle() },
	});

	assert.deepEqual(output, {
		operation,
		applied: false,
	});
});

test("forbidden operation targets are rejected by propose tool and runtime", async () => {
	const registry = createInitialAgentToolRegistry();
	const forbidden = askQuestionOperation({
		target: AgentForbiddenOperationTarget.Approval,
	});

	await assert.rejects(
		registry.invoke({
			name: "propose_structured_operation",
			version: "v1",
			input: { operation: forbidden },
			context: { metadata: metadata(), bundle: bundle() },
		}),
		(error) =>
			error instanceof AgentRuntimeError &&
			error.category === AgentErrorCategory.SkillViolation,
	);

	const skillRegistry = new AgentSkillRegistry();
	skillRegistry.register({
		id: "ii",
		version: "0.0.0-placeholder",
		workflowTypes: [AgentWorkflowType.Ii],
		surfaces: [AgentSurface.Workbench],
		async run() {
			return { operations: [forbidden] };
		},
	});
	const runtime = createAgentRuntime({
		traceStore: new InMemoryAgentTraceStore(),
		skillRegistry,
		assembleContext: () => bundle(),
		now: () => fixedNow,
	});

	const result = await runtime.dispatch(runInput());

	assert.equal(result.status, "errored");
	assert.equal(result.trace.errorCategory, AgentErrorCategory.SkillViolation);
	assert.deepEqual(result.trace.structuredOperations, []);
});

test("unknown operation targets and vision-only tools are rejected", async () => {
	const registry = createInitialAgentToolRegistry();
	const unknownTargetOperation = {
		...askQuestionOperation(),
		target: "totally_new_target",
	};

	await assert.rejects(
		registry.invoke({
			name: "propose_structured_operation",
			version: "v1",
			input: { operation: unknownTargetOperation },
			context: { metadata: metadata(), bundle: bundle() },
		}),
		(error) =>
			error instanceof AgentRuntimeError &&
			error.category === AgentErrorCategory.SkillViolation,
	);

	const skillRegistry = new AgentSkillRegistry();
	skillRegistry.register({
		id: "ii",
		version: "0.0.0-placeholder",
		workflowTypes: [AgentWorkflowType.Ii],
		surfaces: [AgentSurface.Workbench],
		async run() {
			return {
				operations: [unknownTargetOperation as AgentStructuredOperation],
			};
		},
	});
	const runtime = createAgentRuntime({
		traceStore: new InMemoryAgentTraceStore(),
		skillRegistry,
		assembleContext: () => bundle(),
		now: () => fixedNow,
	});
	const result = await runtime.dispatch(runInput({ runId: "unknown-target" }));

	assert.equal(result.status, "errored");
	assert.equal(result.trace.errorCategory, AgentErrorCategory.SkillViolation);
	assert.deepEqual(result.trace.structuredOperations, []);

	const visionRegistry = new AgentToolRegistry();
	visionRegistry.register({
		name: "read_photo_hazards",
		version: "v1",
		inputSchema: { parse: (value) => value },
		outputSchema: { parse: (value) => value },
		permissions: {
			workflowTypes: [AgentWorkflowType.Ii],
			surfaces: [AgentSurface.Workbench],
			classification: AgentToolClassification.Read,
			requiresVision: true,
			mutatesWorkflowRecords: false,
		},
		execute: (input) => input,
	});

	await assert.rejects(
		visionRegistry.invoke({
			name: "read_photo_hazards",
			version: "v1",
			input: {},
			context: {
				metadata: metadata({ requiresVision: false }),
				bundle: bundle(),
			},
		}),
		(error) =>
			error instanceof AgentRuntimeError &&
			error.category === AgentErrorCategory.VisionUnavailableWorkflow,
	);
});

test("direct write tools cannot be registered", () => {
	const registry = new AgentToolRegistry();
	const directWriteTool: AgentToolDefinition<unknown, unknown> = {
		name: "close_action_directly",
		version: "v1",
		inputSchema: { parse: (value) => value },
		outputSchema: { parse: (value) => value },
		permissions: {
			workflowTypes: [AgentWorkflowType.Ii],
			surfaces: [AgentSurface.Workbench],
			classification: AgentToolClassification.Write,
			requiresVision: false,
			mutatesWorkflowRecords: true,
		},
		execute: (input) => input,
	};

	assert.throws(
		() => registry.register(directWriteTool),
		(error) =>
			error instanceof AgentRuntimeError &&
			error.category === AgentErrorCategory.SkillViolation,
	);
});
