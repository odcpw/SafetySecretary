import { createHash, randomUUID } from "node:crypto";
import {
	categoryForUnknownError,
	isAgentRunCancelledError,
	isAgentRuntimeError,
	userSafeMessageForError,
} from "./errors";
import type { AgentSkillRegistry } from "./skill-registry";
import { parseStructuredOperation } from "./structured-operations";
import type { AgentTraceStore } from "./trace-store";
import type {
	AgentContextBundle,
	AgentRunInput,
	AgentRunMetadata,
	AgentRunResult,
	AgentRunTrace,
	AgentStructuredOperation,
} from "./types";
import { AgentRunStatus } from "./types";

export type AgentContextAssembler = (
	metadata: AgentRunMetadata,
) => Promise<AgentContextBundle> | AgentContextBundle;

export interface AgentRuntimeOptions {
	readonly traceStore: AgentTraceStore;
	readonly skillRegistry: AgentSkillRegistry;
	readonly assembleContext: AgentContextAssembler;
	readonly now?: () => Date;
	readonly createRunId?: () => string;
}

export interface AgentRuntime {
	dispatch(input: AgentRunInput): Promise<AgentRunResult>;
	cancelRun(input: {
		readonly tenantId: string;
		readonly runId: string;
		readonly reason?: string;
	}): Promise<AgentRunTrace>;
}

// This runtime is backend-owned by design: it imports Node crypto,
// assembles server-side context, and must not be bundled into client UI code.
export function createAgentRuntime(options: AgentRuntimeOptions): AgentRuntime {
	return {
		async dispatch(input: AgentRunInput): Promise<AgentRunResult> {
			const metadata = buildMetadata(input, options);

			if (input.signal?.aborted) {
				const cancelledTrace = await createCancelledTrace(
					metadata,
					"Cancelled before dispatch.",
					options,
				);
				return {
					runId: metadata.runId,
					status: AgentRunStatus.Cancelled,
					trace: cancelledTrace,
					operations: [],
				};
			}

			let trace: AgentRunTrace | null = null;
			let operations: readonly AgentStructuredOperation[] = [];

			try {
				const context = await options.assembleContext(metadata);
				const contextDigest = digestContext(context);
				trace = await options.traceStore.create({ metadata, contextDigest });
				const skill = options.skillRegistry.resolve(metadata);

				if (input.signal?.aborted) {
					const cancelled = await options.traceStore.cancel({
						tenantId: metadata.tenantId,
						runId: metadata.runId,
						reason: "Cancelled before skill execution.",
					});
					return {
						runId: metadata.runId,
						status: AgentRunStatus.Cancelled,
						trace: cancelled,
						operations: [],
					};
				}

				const result = await skill.run(context, { signal: input.signal });
				operations = result.operations.map((operation) =>
					parseStructuredOperation(operation),
				);

				if (input.signal?.aborted) {
					const cancelled = await options.traceStore.cancel({
						tenantId: metadata.tenantId,
						runId: metadata.runId,
						reason: "Cancelled after skill execution.",
					});
					return {
						runId: metadata.runId,
						status: AgentRunStatus.Cancelled,
						trace: cancelled,
						operations: [],
					};
				}

				for (const modelCall of result.modelCalls ?? []) {
					await options.traceStore.appendModelCall({
						tenantId: metadata.tenantId,
						runId: metadata.runId,
						call: modelCall,
					});
				}

				for (const toolCall of result.toolCalls ?? []) {
					await options.traceStore.appendToolCall({
						tenantId: metadata.tenantId,
						runId: metadata.runId,
						call: toolCall,
					});
				}

				if (operations.length > 0) {
					await options.traceStore.recordStructuredOperations({
						tenantId: metadata.tenantId,
						runId: metadata.runId,
						operations,
					});
				}

				if (result.verificationChecks?.length) {
					await options.traceStore.recordVerificationChecks({
						tenantId: metadata.tenantId,
						runId: metadata.runId,
						checks: result.verificationChecks,
					});
				}

				if (input.signal?.aborted) {
					const cancelled = await options.traceStore.cancel({
						tenantId: metadata.tenantId,
						runId: metadata.runId,
						reason: "Cancelled before completion.",
					});
					return {
						runId: metadata.runId,
						status: AgentRunStatus.Cancelled,
						trace: cancelled,
						operations: [],
					};
				}

				const finalStatus =
					operations.length > 0
						? AgentRunStatus.AwaitingConfirmation
						: AgentRunStatus.Completed;
				const completedTrace = await options.traceStore.complete({
					tenantId: metadata.tenantId,
					runId: metadata.runId,
					status: finalStatus,
				});

				if (input.signal?.aborted) {
					const cancelled = await options.traceStore.cancel({
						tenantId: metadata.tenantId,
						runId: metadata.runId,
						reason: "Cancelled before completion.",
					});
					return {
						runId: metadata.runId,
						status: AgentRunStatus.Cancelled,
						trace: cancelled,
						operations: [],
					};
				}

				return {
					runId: metadata.runId,
					status: completedTrace.status,
					trace: completedTrace,
					operations,
				};
			} catch (error) {
				if (input.signal?.aborted || isAgentRunCancelledError(error)) {
					const cancelled = trace
						? await options.traceStore.cancel({
								tenantId: metadata.tenantId,
								runId: metadata.runId,
								reason: userSafeMessageForError(error),
							})
						: await createCancelledTrace(
								metadata,
								userSafeMessageForError(error),
								options,
							);
					return {
						runId: metadata.runId,
						status: AgentRunStatus.Cancelled,
						trace: cancelled,
						operations: [],
					};
				}

				if (!trace) {
					const fallbackContext = emptyContext(metadata);
					trace = await options.traceStore.create({
						metadata,
						contextDigest: digestContext(fallbackContext),
					});
				}

				const failedTrace = await options.traceStore.fail({
					tenantId: metadata.tenantId,
					runId: metadata.runId,
					errorCategory: categoryForUnknownError(error),
					userSafeMessage: userSafeMessageForError(error),
				});

				if (isAgentRuntimeError(error)) {
					return {
						runId: metadata.runId,
						status: failedTrace.status,
						trace: failedTrace,
						operations,
					};
				}

				return {
					runId: metadata.runId,
					status: failedTrace.status,
					trace: failedTrace,
					operations,
				};
			}
		},

		async cancelRun(input: {
			readonly tenantId: string;
			readonly runId: string;
			readonly reason?: string;
		}): Promise<AgentRunTrace> {
			return options.traceStore.cancel(input);
		},
	};
}

export function digestContext(context: AgentContextBundle): string {
	return createHash("sha256").update(stableStringify(context)).digest("hex");
}

function buildMetadata(
	input: AgentRunInput,
	options: AgentRuntimeOptions,
): AgentRunMetadata {
	const now = (options.now ?? (() => new Date()))().toISOString();
	return {
		runId: input.runId ?? options.createRunId?.() ?? randomUUID(),
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
		createdAt: now,
	};
}

async function createCancelledTrace(
	metadata: AgentRunMetadata,
	reason: string,
	options: AgentRuntimeOptions,
): Promise<AgentRunTrace> {
	await options.traceStore.create({
		metadata,
		contextDigest: digestContext(emptyContext(metadata)),
	});
	return options.traceStore.cancel({
		tenantId: metadata.tenantId,
		runId: metadata.runId,
		reason,
	});
}

function emptyContext(metadata: AgentRunMetadata): AgentContextBundle {
	return {
		metadata,
		workflowSnapshot: { sections: {} },
		methodologyRefs: [],
		sameCompanyPatterns: [],
		conversationHistory: [],
		companyMemoryExcerpts: [],
		generatedArtifacts: [],
	};
}

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}

	if (Array.isArray(value)) {
		return `[${value.map((item) => stableStringify(item)).join(",")}]`;
	}

	const entries = Object.entries(value as Record<string, unknown>).sort(
		([left], [right]) => left.localeCompare(right),
	);
	return `{${entries
		.filter(([, entryValue]) => entryValue !== undefined)
		.map(
			([key, entryValue]) =>
				`${JSON.stringify(key)}:${stableStringify(entryValue)}`,
		)
		.join(",")}}`;
}
