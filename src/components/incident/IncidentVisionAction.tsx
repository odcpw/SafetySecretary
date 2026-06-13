"use client";

import { useState } from "react";
import { CSRF_COOKIE_NAME } from "../../lib/auth/cookies";
import type { WorkflowVisionConsent } from "../../lib/llm/consent";
import {
	ensureCsrfToken,
	type VisionConsentModalLabels,
	VisionConsentModal,
} from "./VisionConsentModal";

export type IncidentVisionActionLabels = VisionConsentModalLabels & {
	actionButton: string;
	requestedStatus: string;
};

type IncidentVisionActionProps = {
	companyVisionEnabled: boolean;
	incidentId: string;
	initialConsent: WorkflowVisionConsent;
	labels: IncidentVisionActionLabels;
	requiresVision: boolean;
};

export function IncidentVisionAction({
	companyVisionEnabled,
	incidentId,
	initialConsent,
	labels,
	requiresVision,
}: IncidentVisionActionProps) {
	const [currentConsent, setCurrentConsent] =
		useState<WorkflowVisionConsent>(initialConsent);
	const [modalOpen, setModalOpen] = useState(false);
	const [status, setStatus] = useState("");

	function attemptVisionAction() {
		if (!requiresVision) {
			return;
		}

		if (!companyVisionEnabled) {
			setModalOpen(false);
			setStatus(labels.companyUnavailable);
			return;
		}

		if (currentConsent === "NEVER") {
			setModalOpen(false);
			setStatus(labels.workflowUnavailable);
			return;
		}

		if (currentConsent === "ASK") {
			setStatus("");
			setModalOpen(true);
			return;
		}

		void requestVisionAnalysis();
	}

	function handleConsent(consent: WorkflowVisionConsent) {
		if (consent !== "ASK") {
			setCurrentConsent(consent);
		}

		setModalOpen(false);

		if (consent === "NEVER") {
			setStatus(labels.workflowUnavailable);
			return;
		}

		void requestVisionAnalysis();
	}

	async function requestVisionAnalysis() {
		try {
			const csrfToken = ensureCsrfToken(CSRF_COOKIE_NAME);
			const response = await fetch(
				`/api/incidents/${encodeURIComponent(incidentId)}/vision-request`,
				{
					body: JSON.stringify({ requiresVision: true }),
					credentials: "same-origin",
					headers: {
						"content-type": "application/json",
						"x-ssfw-csrf": csrfToken,
						"x-ssfw-vision-modal-granted": "true",
					},
					method: "POST",
				},
			);
			const body = (await response.json().catch(() => ({}))) as {
				code?: string;
			};

			if (!response.ok) {
				setStatus(
					body.code === "vision_unavailable_company"
						? labels.companyUnavailable
						: body.code === "vision_unavailable_workflow"
							? labels.workflowUnavailable
							: labels.error,
				);
				return;
			}

			setStatus(labels.requestedStatus);
		} catch {
			setStatus(labels.error);
		}
	}

	return (
		<section
			className="grid gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
			data-incident-vision-action
		>
			<div className="flex flex-wrap items-center gap-2">
				<button
					className="inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elev)] px-3 py-2 text-sm font-medium text-[var(--color-text)]"
					onClick={attemptVisionAction}
					type="button"
				>
					{labels.actionButton}
				</button>
				{status ? (
					<p className="m-0 text-sm text-[var(--color-muted)]" role="status">
						{status}
					</p>
				) : null}
			</div>
			<VisionConsentModal
				companyVisionEnabled={companyVisionEnabled}
				incidentId={incidentId}
				initialConsent={currentConsent}
				labels={labels}
				onCancel={() => setModalOpen(false)}
				onConsent={handleConsent}
				open={modalOpen}
				requiresVision={requiresVision}
			/>
		</section>
	);
}
