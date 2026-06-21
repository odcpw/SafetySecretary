"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CSRF_COOKIE_NAME } from "../../../lib/auth/cookies";
import { ensureCsrfToken } from "../../../lib/auth/csrf-client";
import {
	availableWorkflowActions,
	type IncidentWorkflowStage,
	isWorkflowStage,
	type WorkflowStageAction,
} from "../../../lib/incident/workflow-stage";

export type StatusControlsLabels = {
	actions: Record<WorkflowStageAction, string>;
	errorNotFound: string;
	errorInvalidAction: string;
	errorInvalidTransition: string;
	errorGeneric: string;
};

type StatusControlsProps = {
	readonly incidentId: string;
	readonly workflowStage: string;
	readonly labels?: StatusControlsLabels;
	/** Called after a successful transition. Defaults to refreshing the route. */
	readonly onChange?: () => void;
};

const defaultLabels: StatusControlsLabels = {
	actions: {
		close: "Close",
		pause: "Pause",
		reopen: "Reopen",
		resume: "Resume",
		start: "Start investigation",
	},
	errorNotFound: "This incident is no longer available.",
	errorInvalidAction: "That action is not valid here.",
	errorInvalidTransition:
		"That step is not available from the current status. The page was refreshed.",
	errorGeneric: "Something went wrong. Try again.",
};

const primaryButton =
	"inline-flex min-h-9 items-center justify-center rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60";
const secondaryButton =
	"inline-flex min-h-9 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm font-medium text-[var(--color-text)] transition hover:border-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Workflow lifecycle controls for the accident register: start an
 * investigation, pause/resume it, close it, or reopen it. POSTs {action} to the
 * tenant-scoped status endpoint. Drop this into an incident header to surface
 * the transitions; it is self-contained.
 */
export default function StatusControls({
	incidentId,
	workflowStage,
	labels = defaultLabels,
	onChange,
}: StatusControlsProps) {
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const stage: IncidentWorkflowStage = isWorkflowStage(workflowStage)
		? workflowStage
		: "CAPTURE";
	const actions = availableWorkflowActions(stage);

	async function transition(action: WorkflowStageAction) {
		setBusy(true);
		setError(null);

		try {
			const response = await fetch(
				`/api/incidents/${encodeURIComponent(incidentId)}/status`,
				{
					body: JSON.stringify({ action }),
					credentials: "same-origin",
					headers: {
						accept: "application/json",
						"content-type": "application/json",
						"x-safetysecretary-csrf": ensureCsrfToken(CSRF_COOKIE_NAME),
					},
					method: "POST",
				},
			);

			if (!response.ok) {
				const body = (await response.json().catch(() => ({}))) as {
					code?: string;
				};
				throw new Error(body.code ?? `STATUS_FAILED_${response.status}`);
			}

			if (onChange) {
				onChange();
			} else {
				router.refresh();
			}
		} catch (caught) {
			setError(userSafeError(caught, labels));
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="grid gap-1">
			<div className="flex flex-wrap items-center gap-2">
				{actions.map((action) => (
					<button
						className={action === "start" ? primaryButton : secondaryButton}
						disabled={busy}
						key={action}
						onClick={() => void transition(action)}
						type="button"
					>
						{labels.actions[action]}
					</button>
				))}
			</div>
			{error ? (
				<p className="m-0 text-xs text-[var(--color-danger)]">{error}</p>
			) : null}
		</div>
	);
}

function userSafeError(caught: unknown, labels: StatusControlsLabels): string {
	if (caught instanceof Error) {
		const map: Record<string, string> = {
			INCIDENT_NOT_FOUND: labels.errorNotFound,
			INVALID_WORKFLOW_ACTION: labels.errorInvalidAction,
			INVALID_WORKFLOW_TRANSITION: labels.errorInvalidTransition,
		};

		return map[caught.message] ?? caught.message;
	}

	return labels.errorGeneric;
}
