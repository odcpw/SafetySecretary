import {
	type AgentErrorCategory,
	type AgentModelCallSummary,
	type AgentRunMetadata,
	AgentRunStatus,
	type AgentRunTrace,
	type AgentStructuredOperation,
	type AgentToolCallSummary,
	type AgentUserDecision,
	type AgentVerificationCheckResult,
} from "./types";

export interface AgentTraceStore {
	create(input: {
		readonly metadata: AgentRunMetadata;
		readonly contextDigest: string;
	}): Promise<AgentRunTrace>;
	appendModelCall(input: {
		readonly tenantId: string;
		readonly runId: string;
		readonly call: AgentModelCallSummary;
	}): Promise<AgentRunTrace>;
	appendToolCall(input: {
		readonly tenantId: string;
		readonly runId: string;
		readonly call: AgentToolCallSummary;
	}): Promise<AgentRunTrace>;
	recordStructuredOperations(input: {
		readonly tenantId: string;
		readonly runId: string;
		readonly operations: readonly AgentStructuredOperation[];
	}): Promise<AgentRunTrace>;
	recordUserDecision(input: {
		readonly tenantId: string;
		readonly runId: string;
		readonly decision: AgentUserDecision;
	}): Promise<AgentRunTrace>;
	recordVerificationChecks(input: {
		readonly tenantId: string;
		readonly runId: string;
		readonly checks: readonly AgentVerificationCheckResult[];
	}): Promise<AgentRunTrace>;
	complete(input: {
		readonly tenantId: string;
		readonly runId: string;
		readonly status:
			| typeof AgentRunStatus.Completed
			| typeof AgentRunStatus.AwaitingConfirmation;
	}): Promise<AgentRunTrace>;
	fail(input: {
		readonly tenantId: string;
		readonly runId: string;
		readonly errorCategory: AgentErrorCategory;
		readonly userSafeMessage: string;
	}): Promise<AgentRunTrace>;
	cancel(input: {
		readonly tenantId: string;
		readonly runId: string;
		readonly reason?: string;
	}): Promise<AgentRunTrace>;
	get(input: {
		readonly tenantId: string;
		readonly runId: string;
	}): Promise<AgentRunTrace | null>;
}

export class InMemoryAgentTraceStore implements AgentTraceStore {
	private readonly traces = new Map<string, AgentRunTrace>();

	async create(input: {
		readonly metadata: AgentRunMetadata;
		readonly contextDigest: string;
	}): Promise<AgentRunTrace> {
		const now = input.metadata.createdAt;
		const trace: AgentRunTrace = {
			runId: input.metadata.runId,
			parentRunId: input.metadata.parentRunId,
			tenantId: input.metadata.tenantId,
			userId: input.metadata.userId,
			workflowType: input.metadata.workflowType,
			workflowId: input.metadata.workflowId,
			skill: input.metadata.skill,
			status: AgentRunStatus.Running,
			contextDigest: input.contextDigest,
			modelCalls: [],
			toolCalls: [],
			structuredOperations: [],
			structuredOperationIds: [],
			userDecisions: [],
			verificationChecks: [],
			createdAt: now,
			updatedAt: now,
		};

		this.traces.set(traceKey(trace.tenantId, trace.runId), trace);
		return trace;
	}

	async appendModelCall(input: {
		readonly tenantId: string;
		readonly runId: string;
		readonly call: AgentModelCallSummary;
	}): Promise<AgentRunTrace> {
		return this.update(input, (trace) => ({
			...trace,
			modelCalls: [...trace.modelCalls, input.call],
		}));
	}

	async appendToolCall(input: {
		readonly tenantId: string;
		readonly runId: string;
		readonly call: AgentToolCallSummary;
	}): Promise<AgentRunTrace> {
		return this.update(input, (trace) => ({
			...trace,
			toolCalls: [...trace.toolCalls, input.call],
		}));
	}

	async recordStructuredOperations(input: {
		readonly tenantId: string;
		readonly runId: string;
		readonly operations: readonly AgentStructuredOperation[];
	}): Promise<AgentRunTrace> {
		return this.update(input, (trace) => ({
			...trace,
			structuredOperations: [
				...trace.structuredOperations,
				...input.operations,
			],
			structuredOperationIds: [
				...trace.structuredOperationIds,
				...input.operations.map((operation) => operation.id),
			],
		}));
	}

	async recordUserDecision(input: {
		readonly tenantId: string;
		readonly runId: string;
		readonly decision: AgentUserDecision;
	}): Promise<AgentRunTrace> {
		return this.update(input, (trace) => ({
			...trace,
			userDecisions: [...trace.userDecisions, input.decision],
		}));
	}

	async recordVerificationChecks(input: {
		readonly tenantId: string;
		readonly runId: string;
		readonly checks: readonly AgentVerificationCheckResult[];
	}): Promise<AgentRunTrace> {
		return this.update(input, (trace) => ({
			...trace,
			verificationChecks: [...trace.verificationChecks, ...input.checks],
		}));
	}

	async complete(input: {
		readonly tenantId: string;
		readonly runId: string;
		readonly status:
			| typeof AgentRunStatus.Completed
			| typeof AgentRunStatus.AwaitingConfirmation;
	}): Promise<AgentRunTrace> {
		return this.update(input, (trace) => ({
			...trace,
			status: input.status,
		}));
	}

	async fail(input: {
		readonly tenantId: string;
		readonly runId: string;
		readonly errorCategory: AgentErrorCategory;
		readonly userSafeMessage: string;
	}): Promise<AgentRunTrace> {
		return this.update(input, (trace) => ({
			...trace,
			status: AgentRunStatus.Errored,
			errorCategory: input.errorCategory,
			userSafeMessage: input.userSafeMessage,
		}));
	}

	async cancel(input: {
		readonly tenantId: string;
		readonly runId: string;
		readonly reason?: string;
	}): Promise<AgentRunTrace> {
		return this.update(input, (trace) => ({
			...trace,
			status: AgentRunStatus.Cancelled,
			structuredOperations: [],
			structuredOperationIds: [],
			cancelReason: input.reason,
		}));
	}

	async get(input: {
		readonly tenantId: string;
		readonly runId: string;
	}): Promise<AgentRunTrace | null> {
		return this.traces.get(traceKey(input.tenantId, input.runId)) ?? null;
	}

	private update(
		input: { readonly tenantId: string; readonly runId: string },
		mutate: (trace: AgentRunTrace) => AgentRunTrace,
	): AgentRunTrace {
		const key = traceKey(input.tenantId, input.runId);
		const existing = this.traces.get(key);

		if (!existing) {
			throw new Error(
				`Agent run trace not found for tenant="${input.tenantId}" run="${input.runId}".`,
			);
		}

		const updated = {
			...mutate(existing),
			updatedAt: new Date().toISOString(),
		};
		this.traces.set(key, updated);
		return updated;
	}
}

function traceKey(tenantId: string, runId: string): string {
	return `${tenantId}:${runId}`;
}
