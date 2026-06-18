/**
 * Deterministic agent transport for tests and manual validation harnesses.
 *
 * It is exported with the agent runtime so those harnesses can exercise the
 * real dispatch/trace path, but it must only replay seeded synthetic
 * operations for an exact context digest.
 */
import { AgentRuntimeError } from "./errors";
import { digestContext } from "./runtime";
import type {
	AgentSkillRegistration,
	AgentSkillResult,
} from "./skill-registry";
import type {
	AgentContextBundle,
	AgentModelCallSummary,
	AgentSkillRef,
	AgentStructuredOperation,
	AgentSurface,
	AgentToolCallSummary,
	AgentVerificationCheckResult,
	AgentWorkflowType,
} from "./types";
import { AgentErrorCategory } from "./types";

export interface AgentFakeTransportSeedEntry {
	readonly contextDigest: string;
	readonly skill: AgentSkillRef;
	readonly operations: readonly AgentStructuredOperation[];
	readonly modelCalls?: readonly AgentModelCallSummary[];
	readonly toolCalls?: readonly AgentToolCallSummary[];
	readonly verificationChecks?: readonly AgentVerificationCheckResult[];
}

export interface AgentFakeTransportRunEvidence {
	readonly transport: "fake-agent-transport";
	readonly contextDigest: string;
	readonly skill: AgentSkillRef;
	readonly operationCount: number;
	readonly modelCallCount: number;
	readonly toolCallCount: number;
	readonly verificationCheckCount: number;
}

export interface AgentFakeTransportResult extends AgentSkillResult {
	readonly evidence: AgentFakeTransportRunEvidence;
}

export class AgentFakeTransportUnknownInputError extends AgentRuntimeError {
	readonly contextDigest: string;
	readonly skill: AgentSkillRef;

	constructor(contextDigest: string, skill: AgentSkillRef) {
		super(
			AgentErrorCategory.SkillViolation,
			"The deterministic assistant test transport has no fixture for this context.",
			`FakeAgentTransport has no seed for contextDigest="${contextDigest}" skill="${skill.id}@${skill.version}".`,
		);
		this.name = "AgentFakeTransportUnknownInputError";
		this.contextDigest = contextDigest;
		this.skill = skill;
	}
}

export class AgentContextPhotoPayloadError extends AgentRuntimeError {
	constructor(path: string) {
		super(
			AgentErrorCategory.SkillViolation,
			"The assistant context includes photo bytes. Manual editing is still available.",
			`Agent context redaction guard rejected possible photo payload at "${path}".`,
		);
		this.name = "AgentContextPhotoPayloadError";
	}
}

export class AgentFakeTransport {
	private readonly entries: ReadonlyMap<string, AgentFakeTransportSeedEntry>;

	constructor(seed: readonly AgentFakeTransportSeedEntry[]) {
		const entries = new Map<string, AgentFakeTransportSeedEntry>();

		for (const entry of seed) {
			const key = fakeTransportKey(entry.contextDigest, entry.skill);
			if (entries.has(key)) {
				throw new AgentRuntimeError(
					AgentErrorCategory.SkillViolation,
					"The deterministic assistant test transport has duplicate fixtures.",
				);
			}

			entries.set(key, entry);
		}

		this.entries = entries;
	}

	async run(
		context: AgentContextBundle,
		controls: { readonly signal?: AbortSignal } = {},
	): Promise<AgentFakeTransportResult> {
		if (controls.signal?.aborted) {
			throw new AgentRuntimeError(
				AgentErrorCategory.RuntimeInternal,
				"The assistant run was cancelled before the deterministic test transport started.",
			);
		}

		assertAgentContextHasNoPhotoPayloads(context);
		const contextDigest = digestContext(context);
		const entry = this.entries.get(
			fakeTransportKey(contextDigest, context.metadata.skill),
		);

		if (!entry) {
			throw new AgentFakeTransportUnknownInputError(
				contextDigest,
				context.metadata.skill,
			);
		}

		return {
			operations: clonePlain(entry.operations),
			modelCalls: clonePlain(entry.modelCalls ?? []),
			toolCalls: clonePlain(entry.toolCalls ?? []),
			verificationChecks: clonePlain(entry.verificationChecks ?? []),
			evidence: {
				transport: "fake-agent-transport",
				contextDigest,
				skill: { ...context.metadata.skill },
				operationCount: entry.operations.length,
				modelCallCount: entry.modelCalls?.length ?? 0,
				toolCallCount: entry.toolCalls?.length ?? 0,
				verificationCheckCount: entry.verificationChecks?.length ?? 0,
			},
		};
	}

	asSkillRegistration(input: {
		readonly id: string;
		readonly version: string;
		readonly workflowTypes: readonly AgentWorkflowType[];
		readonly surfaces: readonly AgentSurface[];
	}): AgentSkillRegistration {
		return {
			...input,
			run: (context, controls) => this.run(context, controls),
		};
	}
}

export function fakeTransportKey(
	contextDigest: string,
	skill: AgentSkillRef,
): string {
	return `${contextDigest}:${skill.id}@${skill.version}:${skill.section ?? ""}`;
}

export function assertAgentContextHasNoPhotoPayloads(
	context: AgentContextBundle,
): void {
	visitContextValue(context, "$");
}

function visitContextValue(value: unknown, path: string): void {
	if (typeof value === "string") {
		if (/^data:image\//i.test(value) || /;base64,/i.test(value)) {
			throw new AgentContextPhotoPayloadError(path);
		}
		return;
	}

	if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
		throw new AgentContextPhotoPayloadError(path);
	}

	if (!value || typeof value !== "object") {
		return;
	}

	if (Array.isArray(value)) {
		value.forEach((item, index) => {
			visitContextValue(item, `${path}[${index}]`);
		});
		return;
	}

	for (const [key, child] of Object.entries(value)) {
		if (isForbiddenPhotoPayloadKey(key)) {
			throw new AgentContextPhotoPayloadError(`${path}.${key}`);
		}

		visitContextValue(child, `${path}.${key}`);
	}
}

function isForbiddenPhotoPayloadKey(key: string): boolean {
	return /^(photoBytes|imageBytes|photoData|imageData|base64|base64Data|dataUrl|dataUri)$/i.test(
		key,
	);
}

function clonePlain<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T;
}
