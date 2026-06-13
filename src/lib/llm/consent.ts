export const WORKFLOW_VISION_CONSENTS = ["ASK", "ALWAYS", "NEVER"] as const;

export type WorkflowVisionConsent = (typeof WORKFLOW_VISION_CONSENTS)[number];

export function applyVisionConsentDefault(
	consent: WorkflowVisionConsent | null | undefined = null,
): WorkflowVisionConsent {
	return consent ?? "ASK";
}

export function isWorkflowVisionConsent(
	value: unknown,
): value is WorkflowVisionConsent {
	return (
		typeof value === "string" &&
		(WORKFLOW_VISION_CONSENTS as readonly string[]).includes(value)
	);
}
