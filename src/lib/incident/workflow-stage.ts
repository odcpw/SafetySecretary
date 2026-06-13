/**
 * Incident workflow lifecycle: the "accident register" states a manager moves a
 * case through. A case is first CAPTURED (quick logging), then an investigation
 * is STARTED (INVESTIGATING). From there it can be PAUSED and resumed, or CLOSED
 * and later reopened.
 *
 * The `incident_case.workflow_stage` column is an enum that also holds the
 * legacy per-tab investigation stages (FACTS, TIMELINE, CAUSES, ACTIONS, REVIEW,
 * APPROVED). Those legacy stages are treated here as "investigating" for the
 * purpose of the register: a case sitting on any of them is an open
 * investigation. The transition helpers only ever WRITE the four lifecycle
 * states, but READ logic recognises the legacy ones so existing records keep
 * working.
 *
 * These helpers are deliberately framework-free so server routes — and, later,
 * the coach agent — can call them directly.
 */

export const INCIDENT_LIFECYCLE_STAGES = [
	"CAPTURE",
	"INVESTIGATING",
	"PAUSED",
	"CLOSED",
] as const;

export type IncidentLifecycleStage = (typeof INCIDENT_LIFECYCLE_STAGES)[number];

/** Legacy per-tab investigation stages that predate the lifecycle states. */
export const LEGACY_INVESTIGATION_STAGES = [
	"FACTS",
	"TIMELINE",
	"CAUSES",
	"ACTIONS",
	"REVIEW",
	"APPROVED",
] as const;

export type LegacyInvestigationStage =
	(typeof LEGACY_INVESTIGATION_STAGES)[number];

export type IncidentWorkflowStage =
	| IncidentLifecycleStage
	| LegacyInvestigationStage;

/** The action a caller asks for when transitioning a case. */
export const WORKFLOW_STAGE_ACTIONS = [
	"start",
	"pause",
	"resume",
	"close",
	"reopen",
] as const;

export type WorkflowStageAction = (typeof WORKFLOW_STAGE_ACTIONS)[number];

/**
 * High-level "open vs closed" buckets used by the register filter. APPROVED is
 * a terminal legacy state, so it counts as closed alongside CLOSED.
 */
export type IncidentRegisterStatus = "open" | "closed";

const lifecycleStageSet = new Set<string>(INCIDENT_LIFECYCLE_STAGES);
const legacyStageSet = new Set<string>(LEGACY_INVESTIGATION_STAGES);
const actionSet = new Set<string>(WORKFLOW_STAGE_ACTIONS);

export class InvalidWorkflowTransitionError extends Error {
	readonly code = "INVALID_WORKFLOW_TRANSITION" as const;
	readonly from: IncidentWorkflowStage;
	readonly action: WorkflowStageAction;

	constructor(from: IncidentWorkflowStage, action: WorkflowStageAction) {
		super(`Cannot ${action} a case in stage ${from}`);
		this.action = action;
		this.from = from;
	}
}

export function isLifecycleStage(value: string): value is IncidentLifecycleStage {
	return lifecycleStageSet.has(value);
}

export function isWorkflowStage(value: string): value is IncidentWorkflowStage {
	return lifecycleStageSet.has(value) || legacyStageSet.has(value);
}

export function isWorkflowStageAction(
	value: string,
): value is WorkflowStageAction {
	return actionSet.has(value);
}

/**
 * Whether a stage means "an investigation is underway". The non-terminal legacy
 * per-tab stages map onto this because they describe a live investigation;
 * APPROVED is terminal (closed) and is excluded.
 */
function isInvestigatingStage(stage: IncidentWorkflowStage): boolean {
	return (
		stage === "INVESTIGATING" ||
		(legacyStageSet.has(stage) && stage !== "APPROVED")
	);
}

export function registerStatus(
	stage: IncidentWorkflowStage,
): IncidentRegisterStatus {
	if (stage === "CLOSED" || stage === "APPROVED") {
		return "closed";
	}

	return "open";
}

/**
 * Compute the resulting stage for an action, or throw if the action is not
 * valid from the current stage. Pure: callers persist the result themselves.
 */
export function applyWorkflowAction(
	current: IncidentWorkflowStage,
	action: WorkflowStageAction,
): IncidentLifecycleStage {
	switch (action) {
		case "start":
			// A freshly captured case (or one with no real progress yet) begins
			// its investigation. Re-starting an investigation that is already
			// underway is a no-op rather than an error, so the agent can call it
			// defensively.
			if (current === "CAPTURE" || isInvestigatingStage(current)) {
				return "INVESTIGATING";
			}
			break;

		case "pause":
			if (isInvestigatingStage(current)) {
				return "PAUSED";
			}
			break;

		case "resume":
			if (current === "PAUSED") {
				return "INVESTIGATING";
			}
			break;

		case "close":
			// Anything that is not already closed can be closed.
			if (registerStatus(current) === "open") {
				return "CLOSED";
			}
			break;

		case "reopen":
			if (current === "CLOSED" || current === "APPROVED") {
				return "INVESTIGATING";
			}
			break;

		default:
			break;
	}

	throw new InvalidWorkflowTransitionError(current, action);
}

/** The actions a case in a given stage can currently take, in display order. */
export function availableWorkflowActions(
	current: IncidentWorkflowStage,
): WorkflowStageAction[] {
	return WORKFLOW_STAGE_ACTIONS.filter((action) => {
		try {
			applyWorkflowAction(current, action);
			return true;
		} catch {
			return false;
		}
	});
}
