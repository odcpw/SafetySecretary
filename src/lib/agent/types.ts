import type { KindEnum } from "../llm";

export const AgentWorkflowType = {
	Hira: "HIRA",
	Jha: "JHA",
	Ii: "II",
	Export: "EXPORT",
	DesignStudio: "DESIGN_STUDIO",
	Onboarding: "ONBOARDING",
} as const;

export type AgentWorkflowType =
	(typeof AgentWorkflowType)[keyof typeof AgentWorkflowType];

export const AgentSurface = {
	Workbench: "workbench",
	AppLevel: "app-level",
	Mobile: "mobile",
	Settings: "settings",
} as const;

export type AgentSurface = (typeof AgentSurface)[keyof typeof AgentSurface];

export const AgentRunStatus = {
	Running: "running",
	AwaitingConfirmation: "awaiting_confirmation",
	Completed: "completed",
	Cancelled: "cancelled",
	Errored: "errored",
	TimedOut: "timed_out",
} as const;

export type AgentRunStatus =
	(typeof AgentRunStatus)[keyof typeof AgentRunStatus];

export const AgentErrorCategory = {
	ProviderUnavailable: "provider_unavailable",
	ProviderRateLimited: "provider_rate_limited",
	CapExceeded: "cap_exceeded",
	VisionUnavailableCompany: "vision_unavailable_company",
	VisionUnavailableWorkflow: "vision_unavailable_workflow",
	ToolFailed: "tool_failed",
	SkillViolation: "skill_violation",
	ContextTooLarge: "context_too_large",
	RuntimeInternal: "runtime_internal",
} as const;

export type AgentErrorCategory =
	(typeof AgentErrorCategory)[keyof typeof AgentErrorCategory];

export const AgentConfirmationMode = {
	AskOnly: "ask-only",
	Propose: "propose",
	Fill: "fill",
	Edit: "edit",
} as const;

export type AgentConfirmationMode =
	(typeof AgentConfirmationMode)[keyof typeof AgentConfirmationMode];

export const AgentOperationKind = {
	AskQuestion: "ask_question",
	Fact: "fact",
	IncidentFieldUpdate: "incident_field_update",
	TimelineEvent: "timeline_event",
	CauseNode: "cause_node",
	CauseUpdate: "cause_update",
	StopAction: "stop_action",
	HiraFollowupNote: "hira_followup_note",
	ProcessStep: "process_step",
	Hazard: "hazard",
	RiskRatingSuggestion: "risk_rating_suggestion",
	ControlProposal: "control_proposal",
	ResidualRatingSuggestion: "residual_rating_suggestion",
	CrossHiraSuggestion: "cross_hira_suggestion",
	OutputSectionDraft: "output_section_draft",
	CompanyMemoryProposal: "company_memory_proposal",
} as const;

export type AgentOperationKind =
	(typeof AgentOperationKind)[keyof typeof AgentOperationKind];

export const AgentToolClassification = {
	Read: "read",
	Propose: "propose",
	Write: "write",
} as const;

export type AgentToolClassification =
	(typeof AgentToolClassification)[keyof typeof AgentToolClassification];

export const AgentForbiddenOperationTarget = {
	Approval: "approval",
	SignOff: "sign_off",
	SnapshotCreation: "snapshot_creation",
	ActionClosure: "action_closure",
	EvidenceDeletion: "evidence_deletion",
	CommunicationExit: "communication_exit",
	ProviderSetting: "provider_setting",
	LanguageSetting: "language_setting",
	PrivacySetting: "privacy_setting",
} as const;

export type AgentForbiddenOperationTarget =
	(typeof AgentForbiddenOperationTarget)[keyof typeof AgentForbiddenOperationTarget];

export const AgentAllowedOperationTarget = {
	WorkflowDraft: "workflow_draft",
	Conversation: "conversation",
	GeneratedArtifactDraft: "generated_artifact_draft",
	CompanyMemoryDraft: "company_memory_draft",
} as const;

export type AgentAllowedOperationTarget =
	(typeof AgentAllowedOperationTarget)[keyof typeof AgentAllowedOperationTarget];

export type AgentOperationTarget =
	| AgentAllowedOperationTarget
	| AgentForbiddenOperationTarget;

export interface AgentSkillRef {
	readonly id: string;
	readonly version: string;
	readonly section?: string;
}

export interface AgentRunMetadata {
	readonly runId: string;
	readonly parentRunId?: string;
	readonly tenantId: string;
	readonly userId: string;
	readonly workflowType: AgentWorkflowType;
	readonly workflowId?: string;
	readonly locale: string;
	readonly exportLocale?: string;
	readonly kind: KindEnum;
	readonly requiresVision: boolean;
	readonly skill: AgentSkillRef;
	readonly surface: AgentSurface;
	readonly createdAt: string;
}

export interface AgentSourceReference {
	readonly type: string;
	readonly id: string;
	readonly label?: string;
}

export interface AgentWorkflowSnapshot {
	readonly sections: Readonly<Record<string, unknown>>;
	readonly attachmentRefs?: readonly AgentSourceReference[];
}

export interface AgentMethodologyReference {
	readonly id: string;
	readonly label?: string;
}

export interface AgentSameCompanyPattern {
	readonly sourceWorkflowId: string;
	readonly summary: string;
	readonly score?: number;
}

export interface AgentConversationMessage {
	readonly id: string;
	readonly role: "user" | "assistant" | "system";
	readonly text: string;
	readonly createdAt: string;
}

export interface AgentCompanyMemoryExcerpt {
	readonly id: string;
	readonly summary: string;
	readonly sourceRefs: readonly AgentSourceReference[];
}

export interface AgentGeneratedArtifactMetadata {
	readonly id: string;
	readonly type: string;
	readonly status: "draft" | "approved" | "superseded";
	readonly versionLabel?: string;
}

export interface AgentContextBundle {
	readonly metadata: AgentRunMetadata;
	readonly workflowSnapshot: AgentWorkflowSnapshot;
	readonly methodologyRefs: readonly AgentMethodologyReference[];
	readonly sameCompanyPatterns: readonly AgentSameCompanyPattern[];
	readonly conversationHistory: readonly AgentConversationMessage[];
	readonly companyMemoryExcerpts: readonly AgentCompanyMemoryExcerpt[];
	readonly generatedArtifacts: readonly AgentGeneratedArtifactMetadata[];
}

export interface AgentStructuredOperationBase<
	Kind extends AgentOperationKind,
	Payload,
> {
	readonly id: string;
	readonly runId: string;
	readonly skill: AgentSkillRef;
	readonly kind: Kind;
	readonly target?: AgentOperationTarget;
	readonly confirmationMode: AgentConfirmationMode;
	readonly sourceRefs: readonly AgentSourceReference[];
	readonly payload: Payload;
}

export interface AgentAskQuestionPayload {
	readonly question: string;
	readonly fieldPath?: string;
}

export interface AgentFactPayload {
	readonly text: string;
	readonly fieldPath?: string;
}

export const INCIDENT_COACH_UPDATABLE_FIELDS = [
	"title",
	"location",
	"incidentType",
	"actualInjuryOutcome",
	"potentialSeverityCode",
	"potentialLikelihoodCode",
	"potentialOutcomeText",
	"hazardCategoryCode",
	"departmentText",
	"areaText",
	"shiftText",
	"workActivity",
	"workType",
	"eventType",
	"processInvolved",
	"controlFailure",
	"immediateCause",
	"injuryNature",
	"bodyPart",
	"lostDays",
	"incidentAt",
	"incidentTimeNote",
	"coordinatorName",
] as const;

export type IncidentCoachUpdatableField =
	(typeof INCIDENT_COACH_UPDATABLE_FIELDS)[number];

export interface AgentIncidentFieldUpdatePayload {
	readonly field: IncidentCoachUpdatableField;
	readonly value: string | number | null;
	readonly note?: string;
}

export interface AgentTimelineEventPayload {
	readonly title: string;
	readonly narrative?: string;
	readonly phase?: "before" | "event" | "after";
	readonly occurredAt?: string;
}

export interface AgentCauseNodePayload {
	readonly label: string;
	readonly parentId?: string;
	readonly method?: "5-whys" | "cause-tree";
	readonly isRootCause?: boolean;
	readonly branchStatus?: IncidentCauseBranchStatus;
}

export const INCIDENT_CAUSE_BRANCH_STATUSES = [
	"OPEN",
	"ROOT_REACHED",
	"PARKED",
] as const;

export type IncidentCauseBranchStatus =
	(typeof INCIDENT_CAUSE_BRANCH_STATUSES)[number];

export interface AgentCauseUpdatePayload {
	readonly causeId: string;
	readonly statement?: string;
	readonly isRootCause?: boolean;
	readonly branchStatus?: IncidentCauseBranchStatus;
	/** Re-parent: UUID/ref of the new parent cause, or null for top level. */
	readonly parentId?: string | null;
}

export interface AgentStopActionPayload {
	readonly title: string;
	readonly stopClass: "S" | "T" | "O" | "P";
	readonly purpose?: "corrective" | "preventive";
	readonly linkedCauseNodeId?: string;
	readonly owner?: string;
	readonly dueDate?: string;
}

export interface AgentHiraFollowupPayload {
	readonly note: string;
	readonly targetProcess?: string;
}

export interface AgentOutputSectionDraftPayload {
	readonly outputType: string;
	readonly sectionId: string;
	readonly text: string;
}

export interface AgentProcessStepPayload {
	readonly label: string;
	readonly parentId?: string;
}

export interface AgentHazardPayload {
	readonly description: string;
	readonly suvaCategoryId?: string;
	readonly existingControls?: readonly string[];
}

export interface AgentRiskRatingSuggestionPayload {
	readonly severity: "A" | "B" | "C" | "D" | "E";
	readonly likelihood: 1 | 2 | 3 | 4 | 5;
	readonly rationale: string;
}

export interface AgentControlProposalPayload {
	readonly title: string;
	readonly stopClass: "S" | "T" | "O" | "P";
	readonly rationale?: string;
}

export interface AgentResidualRatingSuggestionPayload
	extends AgentRiskRatingSuggestionPayload {}

export interface AgentCrossHiraSuggestionPayload {
	readonly sourceWorkflowId: string;
	readonly copiedText: string;
	readonly rationale?: string;
}

export interface AgentCompanyMemoryProposalPayload {
	readonly summary: string;
	readonly sourceRefs: readonly AgentSourceReference[];
}

export type AgentStructuredOperation =
	| AgentStructuredOperationBase<
			typeof AgentOperationKind.AskQuestion,
			AgentAskQuestionPayload
	  >
	| AgentStructuredOperationBase<
			typeof AgentOperationKind.Fact,
			AgentFactPayload
	  >
	| AgentStructuredOperationBase<
			typeof AgentOperationKind.IncidentFieldUpdate,
			AgentIncidentFieldUpdatePayload
	  >
	| AgentStructuredOperationBase<
			typeof AgentOperationKind.TimelineEvent,
			AgentTimelineEventPayload
	  >
	| AgentStructuredOperationBase<
			typeof AgentOperationKind.CauseNode,
			AgentCauseNodePayload
	  >
	| AgentStructuredOperationBase<
			typeof AgentOperationKind.CauseUpdate,
			AgentCauseUpdatePayload
	  >
	| AgentStructuredOperationBase<
			typeof AgentOperationKind.StopAction,
			AgentStopActionPayload
	  >
	| AgentStructuredOperationBase<
			typeof AgentOperationKind.HiraFollowupNote,
			AgentHiraFollowupPayload
	  >
	| AgentStructuredOperationBase<
			typeof AgentOperationKind.ProcessStep,
			AgentProcessStepPayload
	  >
	| AgentStructuredOperationBase<
			typeof AgentOperationKind.Hazard,
			AgentHazardPayload
	  >
	| AgentStructuredOperationBase<
			typeof AgentOperationKind.RiskRatingSuggestion,
			AgentRiskRatingSuggestionPayload
	  >
	| AgentStructuredOperationBase<
			typeof AgentOperationKind.ControlProposal,
			AgentControlProposalPayload
	  >
	| AgentStructuredOperationBase<
			typeof AgentOperationKind.ResidualRatingSuggestion,
			AgentResidualRatingSuggestionPayload
	  >
	| AgentStructuredOperationBase<
			typeof AgentOperationKind.CrossHiraSuggestion,
			AgentCrossHiraSuggestionPayload
	  >
	| AgentStructuredOperationBase<
			typeof AgentOperationKind.OutputSectionDraft,
			AgentOutputSectionDraftPayload
	  >
	| AgentStructuredOperationBase<
			typeof AgentOperationKind.CompanyMemoryProposal,
			AgentCompanyMemoryProposalPayload
	  >;

export interface AgentModelCallSummary {
	readonly provider: string;
	readonly model?: string;
	readonly latencyMs?: number;
	readonly inputTokens?: number;
	readonly outputTokens?: number;
	readonly costUsd?: number;
	readonly promptRedacted: true;
	readonly responseRedacted: true;
}

export interface AgentToolCallSummary {
	readonly name: string;
	readonly version: string;
	readonly inputDigest: string;
	readonly outputDigest?: string;
	readonly latencyMs?: number;
	readonly errorCategory?: AgentErrorCategory;
}

export interface AgentUserDecision {
	readonly operationId: string;
	readonly decision: "apply" | "edit-then-apply" | "ignore" | "ask-revise";
	readonly decidedAt: string;
	readonly userId: string;
}

export interface AgentVerificationCheckResult {
	readonly id: string;
	readonly label: string;
	readonly status: "passed" | "failed" | "skipped";
	readonly checkedAt: string;
	readonly details?: string;
}

export interface AgentRunTrace {
	readonly runId: string;
	readonly parentRunId?: string;
	readonly tenantId: string;
	readonly userId: string;
	readonly workflowType: AgentWorkflowType;
	readonly workflowId?: string;
	readonly skill: AgentSkillRef;
	readonly status: AgentRunStatus;
	readonly contextDigest: string;
	readonly modelCalls: readonly AgentModelCallSummary[];
	readonly toolCalls: readonly AgentToolCallSummary[];
	readonly structuredOperations: readonly AgentStructuredOperation[];
	readonly structuredOperationIds: readonly string[];
	readonly userDecisions: readonly AgentUserDecision[];
	readonly verificationChecks: readonly AgentVerificationCheckResult[];
	readonly errorCategory?: AgentErrorCategory;
	readonly userSafeMessage?: string;
	readonly cancelReason?: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface AgentRunInput {
	readonly runId?: string;
	readonly parentRunId?: string;
	readonly tenantId: string;
	readonly userId: string;
	readonly workflowType: AgentWorkflowType;
	readonly workflowId?: string;
	readonly locale: string;
	readonly exportLocale?: string;
	readonly kind: KindEnum;
	readonly requiresVision: boolean;
	readonly skill: AgentSkillRef;
	readonly surface: AgentSurface;
	readonly signal?: AbortSignal;
}

export interface AgentRunResult {
	readonly runId: string;
	readonly status: AgentRunStatus;
	readonly trace: AgentRunTrace;
	readonly operations: readonly AgentStructuredOperation[];
}
