import { z } from "zod";
import { AgentRuntimeError } from "./errors";
import { parseStructuredOperation } from "./structured-operations";
import {
	type AgentCompanyMemoryExcerpt,
	type AgentContextBundle,
	type AgentConversationMessage,
	AgentErrorCategory,
	type AgentMethodologyReference,
	type AgentRunMetadata,
	type AgentStructuredOperation,
	AgentSurface,
	AgentToolClassification,
	AgentWorkflowType,
	type AgentToolClassification as ToolClassification,
	type AgentWorkflowType as WorkflowType,
} from "./types";

export interface AgentToolSchema<T> {
	parse(value: unknown): T;
}

export interface AgentToolPermissionDescriptor {
	readonly workflowTypes: readonly WorkflowType[];
	readonly surfaces: readonly AgentSurface[];
	readonly classification: ToolClassification;
	readonly requiresVision: boolean;
	readonly sections?: readonly string[];
	readonly mutatesWorkflowRecords: boolean;
}

export interface AgentToolRuntimeContext {
	readonly metadata: AgentRunMetadata;
	readonly bundle?: AgentContextBundle;
}

export interface AgentToolDefinition<Input, Output> {
	readonly name: string;
	readonly version: string;
	readonly inputSchema: AgentToolSchema<Input>;
	readonly outputSchema: AgentToolSchema<Output>;
	readonly permissions: AgentToolPermissionDescriptor;
	execute(
		input: Input,
		context: AgentToolRuntimeContext,
	): Promise<Output> | Output;
}

export type AgentToolDescriptor = Pick<
	AgentToolDefinition<unknown, unknown>,
	"name" | "version" | "permissions"
>;

export interface AgentToolInvocation<Input = unknown> {
	readonly name: string;
	readonly version: string;
	readonly input: Input;
	readonly context: AgentToolRuntimeContext;
}

export class AgentToolRegistry {
	private readonly definitions = new Map<
		string,
		AgentToolDefinition<unknown, unknown>
	>();

	register<Input, Output>(
		definition: AgentToolDefinition<Input, Output>,
	): void {
		assertNoDirectWorkflowWrite(definition);
		const key = toolKey(definition.name, definition.version);

		if (this.definitions.has(key)) {
			throw new AgentRuntimeError(
				AgentErrorCategory.SkillViolation,
				`Agent tool ${definition.name}@${definition.version} is registered more than once.`,
			);
		}

		this.definitions.set(
			key,
			definition as AgentToolDefinition<unknown, unknown>,
		);
	}

	descriptor(name: string, version: string): AgentToolDescriptor {
		const definition = this.resolveDefinition(name, version);
		return {
			name: definition.name,
			version: definition.version,
			permissions: definition.permissions,
		};
	}

	listDescriptors(): AgentToolDescriptor[] {
		return Array.from(this.definitions.values()).map((definition) => ({
			name: definition.name,
			version: definition.version,
			permissions: definition.permissions,
		}));
	}

	async invoke<Output = unknown>(
		invocation: AgentToolInvocation,
	): Promise<Output> {
		const definition = this.resolveDefinition(
			invocation.name,
			invocation.version,
		);
		assertToolAllowed(definition, invocation.context.metadata);
		const input = definition.inputSchema.parse(invocation.input);
		const output = await definition.execute(input, invocation.context);
		return deepClone(definition.outputSchema.parse(output)) as Output;
	}

	private resolveDefinition(
		name: string,
		version: string,
	): AgentToolDefinition<unknown, unknown> {
		const definition = this.definitions.get(toolKey(name, version));

		if (!definition) {
			throw new AgentRuntimeError(
				AgentErrorCategory.ToolFailed,
				`Agent tool ${name}@${version} is not registered.`,
			);
		}

		return definition;
	}
}

export interface ReadWorkflowSectionInput {
	readonly section: string;
}

export interface ReadWorkflowSectionOutput {
	readonly section: string;
	readonly data: unknown;
}

export interface ReadMethodologyRefInput {
	readonly refId: string;
}

export interface ReadMethodologyRefOutput {
	readonly refId: string;
	readonly reference: AgentMethodologyReference | null;
}

export interface ReadConversationHistoryInput {
	readonly limit?: number;
}

export interface ReadConversationHistoryOutput {
	readonly messages: readonly AgentConversationMessage[];
}

export interface ReadCompanyMemoryInput {
	readonly query?: string;
}

export interface ReadCompanyMemoryOutput {
	readonly excerpts: readonly AgentCompanyMemoryExcerpt[];
}

export interface ProposeStructuredOperationInput {
	readonly operation: AgentStructuredOperation;
}

export interface ProposeStructuredOperationOutput {
	readonly operation: AgentStructuredOperation;
	readonly applied: false;
}

export interface InitialAgentToolHandlers {
	readWorkflowSection?(
		input: ReadWorkflowSectionInput,
		context: AgentToolRuntimeContext,
	): Promise<ReadWorkflowSectionOutput> | ReadWorkflowSectionOutput;
	readMethodologyRef?(
		input: ReadMethodologyRefInput,
		context: AgentToolRuntimeContext,
	): Promise<ReadMethodologyRefOutput> | ReadMethodologyRefOutput;
	readConversationHistory?(
		input: ReadConversationHistoryInput,
		context: AgentToolRuntimeContext,
	): Promise<ReadConversationHistoryOutput> | ReadConversationHistoryOutput;
	readCompanyMemory?(
		input: ReadCompanyMemoryInput,
		context: AgentToolRuntimeContext,
	): Promise<ReadCompanyMemoryOutput> | ReadCompanyMemoryOutput;
}

export function createInitialAgentToolRegistry(
	handlers: InitialAgentToolHandlers = {},
): AgentToolRegistry {
	const registry = new AgentToolRegistry();
	const iiReadPermissions = permissions({
		classification: AgentToolClassification.Read,
	});
	const proposePermissions = permissions({
		classification: AgentToolClassification.Propose,
	});

	registry.register({
		name: "read_workflow_section",
		version: "v1",
		inputSchema: zodSchema(readWorkflowSectionInputSchema),
		outputSchema: zodSchema(readWorkflowSectionOutputSchema),
		permissions: iiReadPermissions,
		execute: (input, context) =>
			handlers.readWorkflowSection?.(input, context) ?? {
				section: input.section,
				data: deepClone(
					context.bundle?.workflowSnapshot.sections[input.section] ?? null,
				),
			},
	});

	registry.register({
		name: "read_methodology_ref",
		version: "v1",
		inputSchema: zodSchema(readMethodologyRefInputSchema),
		outputSchema: zodSchema(readMethodologyRefOutputSchema),
		permissions: iiReadPermissions,
		execute: (input, context) =>
			handlers.readMethodologyRef?.(input, context) ?? {
				refId: input.refId,
				reference: deepClone(
					context.bundle?.methodologyRefs.find(
						(reference) => reference.id === input.refId,
					) ?? null,
				),
			},
	});

	registry.register({
		name: "read_conversation_history",
		version: "v1",
		inputSchema: zodSchema(readConversationHistoryInputSchema),
		outputSchema: zodSchema(readConversationHistoryOutputSchema),
		permissions: iiReadPermissions,
		execute: (input, context) =>
			handlers.readConversationHistory?.(input, context) ?? {
				messages:
					deepClone(
						context.bundle?.conversationHistory.slice(0, input.limit),
					) ?? [],
			},
	});

	registry.register({
		name: "read_company_memory",
		version: "v1",
		inputSchema: zodSchema(readCompanyMemoryInputSchema),
		outputSchema: zodSchema(readCompanyMemoryOutputSchema),
		permissions: iiReadPermissions,
		execute: (input, context) =>
			handlers.readCompanyMemory?.(input, context) ?? {
				excerpts: deepClone(context.bundle?.companyMemoryExcerpts) ?? [],
			},
	});

	registry.register({
		name: "propose_structured_operation",
		version: "v1",
		inputSchema: { parse: parseProposeStructuredOperationInput },
		outputSchema: { parse: parseProposeStructuredOperationOutput },
		permissions: proposePermissions,
		execute: (input) => ({
			operation: input.operation,
			applied: false,
		}),
	});

	return registry;
}

function permissions(input: {
	readonly classification: ToolClassification;
}): AgentToolPermissionDescriptor {
	return {
		workflowTypes: [AgentWorkflowType.Ii],
		surfaces: [AgentSurface.Workbench],
		classification: input.classification,
		requiresVision: false,
		mutatesWorkflowRecords: false,
	};
}

function assertNoDirectWorkflowWrite(
	definition: AgentToolDefinition<unknown, unknown>,
): void {
	if (
		definition.permissions.mutatesWorkflowRecords ||
		definition.permissions.classification === AgentToolClassification.Write
	) {
		throw new AgentRuntimeError(
			AgentErrorCategory.SkillViolation,
			"Agent tools must not mutate workflow records directly; use propose_structured_operation.",
		);
	}
}

function assertToolAllowed(
	definition: AgentToolDefinition<unknown, unknown>,
	metadata: AgentRunMetadata,
): void {
	if (!definition.permissions.workflowTypes.includes(metadata.workflowType)) {
		throw new AgentRuntimeError(
			AgentErrorCategory.SkillViolation,
			`Agent tool ${definition.name}@${definition.version} is not allowed for this workflow.`,
		);
	}

	if (!definition.permissions.surfaces.includes(metadata.surface)) {
		throw new AgentRuntimeError(
			AgentErrorCategory.SkillViolation,
			`Agent tool ${definition.name}@${definition.version} is not allowed on this surface.`,
		);
	}

	if (definition.permissions.requiresVision && !metadata.requiresVision) {
		throw new AgentRuntimeError(
			AgentErrorCategory.VisionUnavailableWorkflow,
			`Agent tool ${definition.name}@${definition.version} requires a vision-enabled run.`,
		);
	}
}

function toolKey(name: string, version: string): string {
	return `${name}@${version}`;
}

function deepClone<T>(value: T): T {
	return value === undefined ? value : (structuredClone(value) as T);
}

function zodSchema<T>(schema: z.ZodType<T>): AgentToolSchema<T> {
	return {
		parse(value: unknown): T {
			return schema.parse(value);
		},
	};
}

const readWorkflowSectionInputSchema = z.object({
	section: z.string().min(1),
});

const readWorkflowSectionOutputSchema = z.object({
	section: z.string().min(1),
	data: z.unknown(),
});

const readMethodologyRefInputSchema = z.object({
	refId: z.string().min(1),
});

const methodologyReferenceSchema = z.object({
	id: z.string().min(1),
	label: z.string().optional(),
});

const readMethodologyRefOutputSchema = z.object({
	refId: z.string().min(1),
	reference: methodologyReferenceSchema.nullable(),
});

const readConversationHistoryInputSchema = z.object({
	limit: z.number().int().positive().optional(),
});

const conversationMessageSchema = z.object({
	id: z.string().min(1),
	role: z.enum(["user", "assistant", "system"]),
	text: z.string(),
	createdAt: z.string(),
});

const readConversationHistoryOutputSchema = z.object({
	messages: z.array(conversationMessageSchema),
});

const readCompanyMemoryInputSchema = z.object({
	query: z.string().optional(),
});

const sourceRefSchema = z.object({
	type: z.string().min(1),
	id: z.string().min(1),
	label: z.string().optional(),
});

const companyMemoryExcerptSchema = z.object({
	id: z.string().min(1),
	summary: z.string().min(1),
	sourceRefs: z.array(sourceRefSchema),
});

const readCompanyMemoryOutputSchema = z.object({
	excerpts: z.array(companyMemoryExcerptSchema),
});

function parseProposeStructuredOperationInput(
	value: unknown,
): ProposeStructuredOperationInput {
	const parsed = z
		.object({
			operation: z.unknown(),
		})
		.parse(value);
	return {
		operation: parseStructuredOperation(parsed.operation),
	};
}

function parseProposeStructuredOperationOutput(
	value: unknown,
): ProposeStructuredOperationOutput {
	const parsed = z
		.object({
			operation: z.unknown(),
			applied: z.literal(false),
		})
		.parse(value);
	return {
		operation: parseStructuredOperation(parsed.operation),
		applied: parsed.applied,
	};
}
