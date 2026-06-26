import { randomUUID } from "node:crypto";
import { type AgentRouteHandler, createAgent, defineTool } from "@flue/runtime";
import * as v from "valibot";
import incidentInvestigationSkill from "../skills/incident-investigation/SKILL.md" with {
	type: "skill",
};
import { buildIncidentInvestigationAgentContext } from "../../src/lib/agent/incident-investigation/context";
import {
	INCIDENT_COACH_SKILL,
	incidentCoachSkillRef,
} from "../../src/lib/agent/skills/incident-coach-v1";
import { parseStructuredOperation } from "../../src/lib/agent/structured-operations";
import {
	AgentAllowedOperationTarget,
	AgentConfirmationMode,
	type AgentContextBundle,
	AgentOperationKind,
	type AgentRunMetadata,
	type AgentStructuredOperation,
	AgentSurface,
	AgentWorkflowType,
} from "../../src/lib/agent/types";
import {
	buildCauseTreeDigest,
	buildPhaseSignal,
	type CauseTreeDigestAction,
	type CauseTreeDigestCause,
} from "../../src/lib/incident/cause-tree";
import {
	buildFlueActionPlanOperations,
	type FlueActionPlanAction,
	type FlueActionPlanPurpose,
	type FlueActionPlanStopClass,
} from "../../src/lib/incident/coach-flue-action-plan";
import { decodeFlueIncidentInstanceId } from "../../src/lib/incident/coach-flue-ids";
import {
	buildFlueCauseTreeOperations,
	buildFlueEvidenceOperations,
	buildFlueHiraFollowupOperations,
	buildFlueIncidentFieldOperations,
	validateFlueRawIncidentOperations,
} from "../../src/lib/incident/coach-flue-operation-tools";
import { resolveFlueModel } from "../../src/lib/incident/coach-flue-config";
import {
	findDuplicateCoachProposalOperations,
	readIncidentCoachProposalDigest,
} from "../../src/lib/incident/coach-proposal-digest";
import { buildFlueIncidentRecordView } from "../../src/lib/incident/coach-flue-record-view";
import { KindEnum } from "../../src/lib/llm/types";

export const route: AgentRouteHandler = async (c, next) => {
	const expectedToken = (
		process.env.SAFETYSECRETARY_FLUE_TOKEN ??
		process.env.SSFW_FLUE_TOKEN ??
		""
	).trim();

	if (expectedToken) {
		const authorization = c.req.header("authorization") ?? "";
		if (authorization !== `Bearer ${expectedToken}`) {
			return c.json({ code: "FLUE_AUTH_REQUIRED" }, 401);
		}
	}

	await next();
};

const emptyParameters = v.object({});

const incidentFieldParameters = v.object({
	fields: v.array(
		v.object({
			field: v.string(),
			note: v.optional(v.string()),
			value: v.union([v.string(), v.number(), v.null_()]),
		}),
	),
});

const evidenceParameters = v.object({
	facts: v.optional(
		v.array(
			v.object({
				fieldPath: v.optional(v.string()),
				text: v.string(),
			}),
		),
	),
	timelineEvents: v.optional(
		v.array(
			v.object({
				narrative: v.optional(v.string()),
				occurredAt: v.optional(v.string()),
				phase: v.optional(v.picklist(["before", "event", "after"])),
				title: v.string(),
			}),
		),
	),
});

const causeTreeParameters = v.object({
	causeNodes: v.optional(
		v.array(
			v.object({
				branchStatus: v.optional(
					v.picklist(["OPEN", "ROOT_REACHED", "PARKED"]),
				),
				isRootCause: v.optional(v.boolean()),
				label: v.string(),
				method: v.optional(v.picklist(["5-whys", "cause-tree"])),
				parentId: v.optional(v.string()),
				ref: v.optional(v.string()),
			}),
		),
	),
	causeUpdates: v.optional(
		v.array(
			v.object({
				branchStatus: v.optional(
					v.picklist(["OPEN", "ROOT_REACHED", "PARKED"]),
				),
				causeId: v.string(),
				isRootCause: v.optional(v.boolean()),
				parentId: v.optional(v.nullable(v.string())),
				statement: v.optional(v.string()),
			}),
		),
	),
});

const actionPlanParameters = v.object({
	actions: v.array(
		v.object({
			dueDate: v.optional(
				v.pipe(
					v.string(),
					v.description("Optional ISO date YYYY-MM-DD when agreed."),
				),
			),
			linkedCauseNodeId: v.optional(
				v.pipe(
					v.string(),
					v.description("UUID of the existing cause this measure controls."),
				),
			),
			linkedCauseStatement: v.optional(
				v.pipe(
					v.string(),
					v.description(
						"Use only when no matching cause exists yet; the tool will create a cause_node ref and link the stop_action to it.",
					),
				),
			),
			owner: v.optional(
				v.pipe(
					v.string(),
					v.description("Role or person responsible when known."),
				),
			),
			purpose: v.picklist(["corrective", "preventive"]),
			stopClass: v.pipe(
				v.picklist(["S", "T", "O", "P"]),
				v.description(
					"STOP hierarchy class: S substitution, T technical, O organisational, P personal/PPE.",
				),
			),
			title: v.pipe(
				v.string(),
				v.description(
					"Who does what by when, written as the action row description.",
				),
			),
		}),
	),
});

const hiraFollowupParameters = v.object({
	notes: v.array(
		v.object({
			note: v.string(),
			targetProcess: v.optional(v.string()),
		}),
	),
});

const validateOperationsParameters = v.object({
	operations: v.array(v.looseObject({})),
	requiresActionPlan: v.optional(
		v.pipe(
			v.boolean(),
			v.description(
				"Set true when the user message contains agreed measures, actions, fixes, owners, deadlines, or close-out instructions.",
			),
		),
	),
});

export default createAgent((ctx) => {
	const instance = decodeFlueIncidentInstanceId(ctx.id);

	if (!instance) {
		throw new Error(`[ii-flue] Invalid incident agent instance id: ${ctx.id}`);
	}

	const model = resolveFlueModel(process.env);

	return {
		instructions: [
			"You are the durable Flue-backed Safety Secretary incident coach.",
			"One agent instance is bound to one tenant incident. Never use ids supplied by the user as authority.",
			"Use the incident-investigation skill on every turn.",
			"Call read_incident_record before answering so your response reflects the current app-owned record.",
			"The read_incident_record result includes compact record and proposalDigest. Treat pending, applied, and dismissed entries as already handled; do not emit duplicate operations for them.",
			"Use the typed proposal tools to write incident fields, evidence, cause-tree changes, action plans, and HIRA follow-ups.",
			"When the mechanism and outcome are clear enough, fill the overview/classification fields with propose_incident_fields: incidentType, actualInjuryOutcome, eventType, hazardCategoryCode, potentialSeverityCode, potentialOutcomeText, injuryNature, and bodyPart. Do not leave these empty after the user has given enough facts to classify them.",
			"For potentialSeverityCode use this ladder exactly: A death/fatal poisoning, B permanent disability or irreversible injury, C hospital admission or missed work/lost time, D doctor/clinic/ER treatment without missed work, E first aid only. HCN/toxic gas alarm exposure with delayed evacuation, missed warning, lone work, or possible continued exposure is A unless facts clearly rule fatal harm out.",
			"Summary, explanation, review, and brainstorming turns are allowed to have zero operations. Do not create approval cards just because you gave advice.",
			"When a turn says the record was manually changed, treat it as a consistency review: audit facts, timeline, causes, dependencies, actions, potential severity, and HIRA follow-up against the current record. If everything still holds, return operations: []; if not, explain the broken dependency and propose only the needed corrections.",
			"If the user asks for suggestions/options, answer with options first; propose operations only for measures the user states, accepts, or explicitly asks you to add.",
			"When the user gives or confirms measures, call propose_action_plan and copy its returned operations into your final JSON.",
			"When validating a measures turn, pass requiresActionPlan: true to validate_incident_operations.",
			"Never store agreed measures as fact operations.",
			"Return only the strict JSON object with reply and operations. Do not wrap it in markdown.",
		].join("\n"),
		model,
		skills: [incidentInvestigationSkill],
		tools: [
			readIncidentRecordTool(instance.tenantId, instance.incidentId),
			proposeIncidentFieldsTool(),
			proposeEvidenceTool(instance.tenantId, instance.incidentId),
			proposeCauseTreeTool(instance.tenantId, instance.incidentId),
			proposeActionPlanTool(instance.tenantId, instance.incidentId),
			proposeHiraFollowupTool(),
			validateIncidentOperationsTool(instance.tenantId, instance.incidentId),
		],
	};
});

function readIncidentRecordTool(tenantId: string, incidentId: string) {
	return defineTool({
		description:
			"Read the current tenant-scoped incident record view, proposal approval digest, cause digest, and investigation phase signal for this bound incident.",
		execute: async () => {
			const metadata = buildMetadata({ incidentId, tenantId });
			const [context, proposalDigest] = await Promise.all([
				buildIncidentInvestigationAgentContext({
					metadata,
				}),
				readIncidentCoachProposalDigest({ incidentId, tenantId }),
			]);

			if (!context) {
				return JSON.stringify({ code: "INCIDENT_NOT_FOUND", ok: false });
			}

			const sections = context.workflowSnapshot.sections as {
				readonly actions?: readonly CauseTreeDigestAction[];
				readonly causes?: readonly CauseTreeDigestCause[];
				readonly facts?: readonly unknown[];
				readonly incident?: {
					readonly causeMethod?: string | null;
					readonly potentialSeverity?: string | null;
				};
				readonly timeline?: readonly unknown[];
			};
			const causes = sections.causes ?? [];
			const actions = sections.actions ?? [];

			return JSON.stringify({
				causeTreeDigest: buildCauseTreeDigest({ actions, causes }),
				ok: true,
				phaseSignal: buildPhaseSignal({
					actions,
					causes,
					factCount: sections.facts?.length ?? 0,
					potentialSeverity: sections.incident?.potentialSeverity ?? null,
					timelineCount: sections.timeline?.length ?? 0,
				}),
				proposalDigest,
				record: buildFlueIncidentRecordView(context),
			});
		},
		name: "read_incident_record",
		parameters: emptyParameters,
	});
}

function proposeIncidentFieldsTool() {
	return defineTool({
		description:
			"Build validated incident_field_update operations for overview/classification fields. Use this instead of hand-writing incident_field_update JSON. For potentialSeverityCode use A death/fatal poisoning, B irreversible/permanent injury, C hospital admission or lost time, D doctor/clinic/ER treatment without missed work, E first aid only; credible HCN/toxic gas alarm exposure with possible continued exposure is A.",
		execute: async (args) =>
			JSON.stringify(
				buildFlueIncidentFieldOperations({
					fields: incidentFieldsFromArgs(args),
				}),
			),
		name: "propose_incident_fields",
		parameters: incidentFieldParameters,
	});
}

function proposeEvidenceTool(tenantId: string, incidentId: string) {
	return defineTool({
		description:
			"Build fact and timeline_event operations. Use facts for standing conditions and timeline events for sequence; measures are rejected and must go through propose_action_plan. Near-duplicate facts are rejected so the record stays clean.",
		execute: async (args) => {
			const context = await buildIncidentInvestigationAgentContext({
				metadata: buildMetadata({ incidentId, tenantId }),
			});

			if (!context) {
				return JSON.stringify({ code: "INCIDENT_NOT_FOUND", ok: false });
			}

			return JSON.stringify(
				buildFlueEvidenceOperations({
					existingFacts: factTextsFromContext(context),
					facts: factsFromArgs(args),
					timelineEvents: timelineEventsFromArgs(args),
				}),
			);
		},
		name: "propose_evidence",
		parameters: evidenceParameters,
	});
}

function proposeCauseTreeTool(tenantId: string, incidentId: string) {
	return defineTool({
		description:
			"Build cause_node and cause_update operations with refs, parent dependencies, and existing-cause validation. Use this for new causes, deeper whys, root marks, parking, and re-parenting.",
		execute: async (args) => {
			const context = await buildIncidentInvestigationAgentContext({
				metadata: buildMetadata({ incidentId, tenantId }),
			});

			if (!context) {
				return JSON.stringify({ code: "INCIDENT_NOT_FOUND", ok: false });
			}

			const causes = causeListFromContext(context);
			const result = buildFlueCauseTreeOperations({
				causeNodes: causeNodesFromArgs(args),
				causeUpdates: causeUpdatesFromArgs(args),
				existingCauseIds: causes.map((cause) => cause.id),
			});

			return JSON.stringify({
				...result,
				existingCauses: causes.map((cause) => ({
					branchStatus: cause.branchStatus ?? null,
					id: cause.id,
					isRootCause: cause.isRootCause ?? false,
					parentId: cause.parentId ?? null,
					statement: cause.statement,
				})),
			});
		},
		name: "propose_cause_tree",
		parameters: causeTreeParameters,
	});
}

function proposeActionPlanTool(tenantId: string, incidentId: string) {
	return defineTool({
		description:
			"Convert agreed incident measures into linked stop_action operations. Use this for fixes, actions, controls, owners, deadlines, or close-out measures; do not encode agreed measures as facts.",
		execute: async (args) => {
			const metadata = buildMetadata({ incidentId, tenantId });
			const context = await buildIncidentInvestigationAgentContext({
				metadata,
			});

			if (!context) {
				return JSON.stringify({ code: "INCIDENT_NOT_FOUND", ok: false });
			}

			const sections = context.workflowSnapshot.sections as {
				readonly causes?: readonly CauseTreeDigestCause[];
			};
			const causes = sections.causes ?? [];
			const result = buildFlueActionPlanOperations({
				actions: actionPlanActionsFromArgs(args),
				existingCauseIds: causes.map((cause) => cause.id),
			});

			return JSON.stringify({
				...result,
				existingCauses: causes.map((cause) => ({
					branchStatus: cause.branchStatus ?? null,
					id: cause.id,
					isRootCause: cause.isRootCause ?? false,
					statement: cause.statement,
				})),
				requiredFinalOperationKind: AgentOperationKind.StopAction,
			});
		},
		name: "propose_action_plan",
		parameters: actionPlanParameters,
	});
}

function proposeHiraFollowupTool() {
	return defineTool({
		description:
			"Build one hira_followup_note operation when the incident exposes hazards/processes that should be checked in the risk assessment. Multiple notes are combined because the app stores one follow-up text field.",
		execute: async (args) =>
			JSON.stringify(
				buildFlueHiraFollowupOperations({
					notes: hiraFollowupNotesFromArgs(args),
				}),
			),
		name: "propose_hira_followup",
		parameters: hiraFollowupParameters,
	});
}

function validateIncidentOperationsTool(tenantId: string, incidentId: string) {
	return defineTool({
		description:
			"Validate proposed Safety Secretary incident operations before returning them to the app.",
		execute: async (args) => {
			const context = await buildIncidentInvestigationAgentContext({
				metadata: buildMetadata({ incidentId, tenantId }),
			});

			if (!context) {
				return JSON.stringify({ code: "INCIDENT_NOT_FOUND", ok: false });
			}

			const existingCauseIds = causeListFromContext(context).map(
				(cause) => cause.id,
			);
			const proposalDigest = await readIncidentCoachProposalDigest({
				incidentId,
				tenantId,
			});
			const argsRecord = asRecord(args);
			const operations = Array.isArray(argsRecord.operations)
				? argsRecord.operations
				: [];
			const requiresActionPlan = argsRecord.requiresActionPlan === true;
			const runId = randomUUID();
			const skill = incidentCoachSkillRef("flue-agent");
			const errors: Array<{ index: number; message: string }> = [];
			const parsed: Array<{
				readonly index: number;
				readonly operation: AgentStructuredOperation;
			}> = [];

			for (const [index, raw] of operations.entries()) {
				const record =
					raw && typeof raw === "object"
						? (raw as Record<string, unknown>)
						: {};
				const kind = typeof record.kind === "string" ? record.kind : "";
				const payload =
					record.payload && typeof record.payload === "object"
						? (record.payload as Record<string, unknown>)
						: {};

				if (
					!INCIDENT_COACH_SKILL.allowedOperationKinds.includes(kind as never)
				) {
					errors.push({
						index,
						message: `Unsupported operation kind: ${kind}`,
					});
					continue;
				}

				try {
					parsed.push({
						index,
						operation: parseStructuredOperation({
							confirmationMode: AgentConfirmationMode.Propose,
							id: `${runId}:flue:${index}-${kind}`,
							kind,
							payload,
							runId,
							skill,
							sourceRefs: [
								{
									id: incidentId,
									label: "Flue incident investigation conversation",
									type: "incident_case",
								},
							],
							target: AgentAllowedOperationTarget.WorkflowDraft,
						}),
					});
				} catch (error) {
					errors.push({
						index,
						message: error instanceof Error ? error.message : String(error),
					});
				}
			}

			errors.push(
				...validateFlueRawIncidentOperations({
					existingCauseIds,
					operations,
					requiresActionPlan,
				}),
				...findDuplicateCoachProposalOperations({
					operations: parsed,
					proposalDigest,
				}),
			);

			return JSON.stringify({
				acceptedCount: parsed.length,
				errors,
				ok: errors.length === 0,
			});
		},
		name: "validate_incident_operations",
		parameters: validateOperationsParameters,
	});
}

function buildMetadata(input: {
	readonly incidentId: string;
	readonly tenantId: string;
}): AgentRunMetadata {
	return {
		createdAt: new Date().toISOString(),
		kind: KindEnum.Authoring,
		locale: "en",
		requiresVision: false,
		runId: randomUUID(),
		skill: incidentCoachSkillRef("flue-agent"),
		surface: AgentSurface.Workbench,
		tenantId: input.tenantId,
		userId: "flue-agent",
		workflowId: input.incidentId,
		workflowType: AgentWorkflowType.Ii,
	};
}

function actionPlanActionsFromArgs(args: unknown): FlueActionPlanAction[] {
	const record = asRecord(args);
	const actions = Array.isArray(record.actions) ? record.actions : [];

	return actions.map((action) => {
		const item = asRecord(action);

		return {
			dueDate: optionalString(item.dueDate),
			linkedCauseNodeId: optionalString(item.linkedCauseNodeId),
			linkedCauseStatement: optionalString(item.linkedCauseStatement),
			owner: optionalString(item.owner),
			purpose: optionalString(item.purpose) as FlueActionPlanPurpose,
			stopClass: optionalString(item.stopClass) as FlueActionPlanStopClass,
			title: optionalString(item.title) ?? "",
		};
	});
}

function incidentFieldsFromArgs(args: unknown) {
	const record = asRecord(args);
	const fields = Array.isArray(record.fields) ? record.fields : [];

	return fields.map((field) => {
		const item = asRecord(field);
		const value = item.value;

		return {
			field: optionalString(item.field) ?? "",
			note: optionalString(item.note),
			value:
				typeof value === "string" || typeof value === "number" || value === null
					? value
					: null,
		};
	});
}

function factsFromArgs(args: unknown) {
	const record = asRecord(args);
	const facts = Array.isArray(record.facts) ? record.facts : [];

	return facts.map((fact) => {
		const item = asRecord(fact);

		return {
			fieldPath: optionalString(item.fieldPath),
			text: optionalString(item.text) ?? "",
		};
	});
}

function timelineEventsFromArgs(args: unknown) {
	const record = asRecord(args);
	const timelineEvents = Array.isArray(record.timelineEvents)
		? record.timelineEvents
		: [];

	return timelineEvents.map((event) => {
		const item = asRecord(event);

		return {
			narrative: optionalString(item.narrative),
			occurredAt: optionalString(item.occurredAt),
			phase: optionalString(item.phase) as "before" | "event" | "after",
			title: optionalString(item.title) ?? "",
		};
	});
}

function causeNodesFromArgs(args: unknown) {
	const record = asRecord(args);
	const causeNodes = Array.isArray(record.causeNodes) ? record.causeNodes : [];

	return causeNodes.map((cause) => {
		const item = asRecord(cause);

		return {
			branchStatus: optionalString(item.branchStatus) as
				| "OPEN"
				| "ROOT_REACHED"
				| "PARKED",
			isRootCause: optionalBoolean(item.isRootCause),
			label: optionalString(item.label) ?? "",
			method: optionalString(item.method) as "5-whys" | "cause-tree",
			parentId: optionalString(item.parentId),
			ref: optionalString(item.ref),
		};
	});
}

function causeUpdatesFromArgs(args: unknown) {
	const record = asRecord(args);
	const causeUpdates = Array.isArray(record.causeUpdates)
		? record.causeUpdates
		: [];

	return causeUpdates.map((update) => {
		const item = asRecord(update);

		return {
			branchStatus: optionalString(item.branchStatus) as
				| "OPEN"
				| "ROOT_REACHED"
				| "PARKED",
			causeId: optionalString(item.causeId) ?? "",
			isRootCause: optionalBoolean(item.isRootCause),
			parentId: item.parentId === null ? null : optionalString(item.parentId),
			statement: optionalString(item.statement),
		};
	});
}

function hiraFollowupNotesFromArgs(args: unknown) {
	const record = asRecord(args);
	const notes = Array.isArray(record.notes) ? record.notes : [];

	return notes.map((note) => {
		const item = asRecord(note);

		return {
			note: optionalString(item.note) ?? "",
			targetProcess: optionalString(item.targetProcess),
		};
	});
}

function causeListFromContext(
	context: AgentContextBundle,
): readonly CauseTreeDigestCause[] {
	const sections = context.workflowSnapshot.sections as {
		readonly causes?: readonly CauseTreeDigestCause[];
	};

	return sections.causes ?? [];
}

function factTextsFromContext(context: AgentContextBundle): string[] {
	const sections = context.workflowSnapshot.sections as {
		readonly facts?: readonly { readonly text?: unknown }[];
	};

	return (sections.facts ?? [])
		.map((fact) => (typeof fact.text === "string" ? fact.text : ""))
		.filter(Boolean);
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object"
		? (value as Record<string, unknown>)
		: {};
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined;
}
