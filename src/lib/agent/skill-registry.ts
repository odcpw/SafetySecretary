import { AgentRuntimeError } from "./errors";
import {
	type AgentContextBundle,
	AgentErrorCategory,
	type AgentModelCallSummary,
	type AgentRunMetadata,
	type AgentStructuredOperation,
	type AgentSurface,
	type AgentToolCallSummary,
	type AgentVerificationCheckResult,
	type AgentWorkflowType,
} from "./types";

export interface AgentSkillControls {
	readonly signal?: AbortSignal;
}

export interface AgentSkillResult {
	readonly operations: readonly AgentStructuredOperation[];
	readonly modelCalls?: readonly AgentModelCallSummary[];
	readonly toolCalls?: readonly AgentToolCallSummary[];
	readonly verificationChecks?: readonly AgentVerificationCheckResult[];
}

export interface AgentSkillRegistration {
	readonly id: string;
	readonly version: string;
	readonly workflowTypes: readonly AgentWorkflowType[];
	readonly surfaces: readonly AgentSurface[];
	run(
		context: AgentContextBundle,
		controls: AgentSkillControls,
	): Promise<AgentSkillResult>;
}

export class AgentSkillRegistry {
	private readonly registrations = new Map<string, AgentSkillRegistration>();

	register(skill: AgentSkillRegistration): void {
		const key = skillKey(skill.id, skill.version);
		if (this.registrations.has(key)) {
			throw new AgentRuntimeError(
				AgentErrorCategory.SkillViolation,
				"The requested assistant skill is registered more than once.",
			);
		}

		this.registrations.set(key, skill);
	}

	resolve(metadata: AgentRunMetadata): AgentSkillRegistration {
		const skill = this.registrations.get(
			skillKey(metadata.skill.id, metadata.skill.version),
		);

		if (!skill) {
			throw new AgentRuntimeError(
				AgentErrorCategory.SkillViolation,
				"The requested assistant skill is not available.",
			);
		}

		if (!skill.workflowTypes.includes(metadata.workflowType)) {
			throw new AgentRuntimeError(
				AgentErrorCategory.SkillViolation,
				"The requested assistant skill cannot run for this workflow.",
			);
		}

		if (!skill.surfaces.includes(metadata.surface)) {
			throw new AgentRuntimeError(
				AgentErrorCategory.SkillViolation,
				"The requested assistant skill cannot run on this surface.",
			);
		}

		return skill;
	}
}

function skillKey(id: string, version: string): string {
	return `${id}@${version}`;
}
