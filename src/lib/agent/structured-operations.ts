import { z } from "zod";
import { AgentRuntimeError } from "./errors";
import {
	AgentAllowedOperationTarget,
	AgentConfirmationMode,
	AgentErrorCategory,
	AgentForbiddenOperationTarget,
	AgentOperationKind,
	type AgentStructuredOperation,
	INCIDENT_CAUSE_BRANCH_STATUSES,
	INCIDENT_COACH_UPDATABLE_FIELDS,
} from "./types";

const sourceRefSchema = z.object({
	type: z.string().min(1),
	id: z.string().min(1),
	label: z.string().optional(),
});

const skillRefSchema = z.object({
	id: z.string().min(1),
	version: z.string().min(1),
	section: z.string().optional(),
});

const baseOperationSchema = z.object({
	id: z.string().min(1),
	runId: z.string().min(1),
	skill: skillRefSchema,
	target: z
		.union([
			z.enum(AgentAllowedOperationTarget),
			z.enum(AgentForbiddenOperationTarget),
		])
		.optional(),
	confirmationMode: z.enum(AgentConfirmationMode),
	sourceRefs: z.array(sourceRefSchema),
});

const riskRatingPayloadSchema = z.object({
	severity: z.enum(["A", "B", "C", "D", "E"]),
	likelihood: z.union([
		z.literal(1),
		z.literal(2),
		z.literal(3),
		z.literal(4),
		z.literal(5),
	]),
	rationale: z.string().min(1),
});

const operationSchema = z.discriminatedUnion("kind", [
	baseOperationSchema.extend({
		kind: z.literal(AgentOperationKind.AskQuestion),
		payload: z.object({
			question: z.string().min(1),
			fieldPath: z.string().optional(),
		}),
	}),
	baseOperationSchema.extend({
		kind: z.literal(AgentOperationKind.Fact),
		payload: z.object({
			text: z.string().min(1),
			fieldPath: z.string().optional(),
		}),
	}),
	baseOperationSchema.extend({
		kind: z.literal(AgentOperationKind.IncidentFieldUpdate),
		payload: z.object({
			field: z.enum(INCIDENT_COACH_UPDATABLE_FIELDS),
			value: z.union([z.string(), z.number(), z.null()]),
			note: z.string().optional(),
		}),
	}),
	baseOperationSchema.extend({
		kind: z.literal(AgentOperationKind.TimelineEvent),
		payload: z.object({
			title: z.string().min(1),
			narrative: z.string().optional(),
			phase: z.enum(["before", "event", "after"]).optional(),
			occurredAt: z.string().optional(),
		}),
	}),
	baseOperationSchema.extend({
		kind: z.literal(AgentOperationKind.CauseNode),
		payload: z.object({
			label: z.string().min(1),
			parentId: z.string().optional(),
			method: z.enum(["5-whys", "cause-tree"]).optional(),
			isRootCause: z.boolean().optional(),
			branchStatus: z.enum(INCIDENT_CAUSE_BRANCH_STATUSES).optional(),
		}),
	}),
	baseOperationSchema.extend({
		kind: z.literal(AgentOperationKind.CauseUpdate),
		payload: z.object({
			causeId: z.string().min(1),
			statement: z.string().min(1).optional(),
			isRootCause: z.boolean().optional(),
			branchStatus: z.enum(INCIDENT_CAUSE_BRANCH_STATUSES).optional(),
			parentId: z.union([z.string().min(1), z.null()]).optional(),
		}),
	}),
	baseOperationSchema.extend({
		kind: z.literal(AgentOperationKind.StopAction),
		payload: z.object({
			title: z.string().min(1),
			stopClass: z.enum(["S", "T", "O", "P"]),
			purpose: z.enum(["corrective", "preventive"]).optional(),
			linkedCauseNodeId: z.string().optional(),
			owner: z.string().optional(),
			dueDate: z.string().optional(),
		}),
	}),
	baseOperationSchema.extend({
		kind: z.literal(AgentOperationKind.HiraFollowupNote),
		payload: z.object({
			note: z.string().min(1),
			targetProcess: z.string().optional(),
		}),
	}),
	baseOperationSchema.extend({
		kind: z.literal(AgentOperationKind.ProcessStep),
		payload: z.object({
			label: z.string().min(1),
			parentId: z.string().optional(),
		}),
	}),
	baseOperationSchema.extend({
		kind: z.literal(AgentOperationKind.Hazard),
		payload: z.object({
			description: z.string().min(1),
			suvaCategoryId: z.string().optional(),
			existingControls: z.array(z.string()).optional(),
		}),
	}),
	baseOperationSchema.extend({
		kind: z.literal(AgentOperationKind.RiskRatingSuggestion),
		payload: riskRatingPayloadSchema,
	}),
	baseOperationSchema.extend({
		kind: z.literal(AgentOperationKind.ControlProposal),
		payload: z.object({
			title: z.string().min(1),
			stopClass: z.enum(["S", "T", "O", "P"]),
			rationale: z.string().optional(),
		}),
	}),
	baseOperationSchema.extend({
		kind: z.literal(AgentOperationKind.ResidualRatingSuggestion),
		payload: riskRatingPayloadSchema,
	}),
	baseOperationSchema.extend({
		kind: z.literal(AgentOperationKind.CrossHiraSuggestion),
		payload: z.object({
			sourceWorkflowId: z.string().min(1),
			copiedText: z.string().min(1),
			rationale: z.string().optional(),
		}),
	}),
	baseOperationSchema.extend({
		kind: z.literal(AgentOperationKind.OutputSectionDraft),
		payload: z.object({
			outputType: z.string().min(1),
			sectionId: z.string().min(1),
			text: z.string().min(1),
		}),
	}),
	baseOperationSchema.extend({
		kind: z.literal(AgentOperationKind.CompanyMemoryProposal),
		payload: z.object({
			summary: z.string().min(1),
			sourceRefs: z.array(sourceRefSchema),
		}),
	}),
]);

const forbiddenTargets = new Set<string>(
	Object.values(AgentForbiddenOperationTarget),
);

export function parseStructuredOperation(
	value: unknown,
): AgentStructuredOperation {
	const result = operationSchema.safeParse(value);

	if (!result.success) {
		throw new AgentRuntimeError(
			AgentErrorCategory.SkillViolation,
			"The assistant emitted an invalid structured operation.",
		);
	}

	const parsed = result.data as AgentStructuredOperation;
	assertStructuredOperationAllowed(parsed);
	return parsed;
}

export function assertStructuredOperationAllowed(
	operation: AgentStructuredOperation,
): void {
	if (operation.target && forbiddenTargets.has(operation.target)) {
		throw new AgentRuntimeError(
			AgentErrorCategory.SkillViolation,
			"The assistant cannot directly change approval, sign-off, evidence deletion, communication exit, provider, language, or privacy settings.",
		);
	}
}
