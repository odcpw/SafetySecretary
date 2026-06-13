"use client";

import { useEffect, useId, useMemo, useState } from "react";
import type { AgentStructuredOperation } from "../../lib/agent";
import {
	AgentAllowedOperationTarget,
	AgentConfirmationMode,
	AgentOperationKind,
	type AgentSourceReference,
} from "../../lib/agent";
import Badge from "../ui/Badge";
import { Button } from "../ui/Button";

export type StructuredOperationDecision =
	| "apply"
	| "edit-then-apply"
	| "ignore"
	| "ask-revise";

export type StructuredOperationReviewStatus =
	| "pending"
	| "applied"
	| "ignored"
	| "revision-requested";

export interface StructuredOperationReviewFillState {
	readonly optedIn: boolean;
	readonly targetEmpty: boolean;
	readonly targetLabel?: string;
}

export interface StructuredOperationReviewProps {
	readonly operation: AgentStructuredOperation;
	readonly status?: StructuredOperationReviewStatus;
	readonly fillState?: StructuredOperationReviewFillState;
	readonly disabled?: boolean;
	readonly onDecision?: (
		decision: StructuredOperationDecision,
		input: {
			readonly operation: AgentStructuredOperation;
			readonly editedText?: string;
			readonly effectiveMode: AgentConfirmationMode;
		},
	) => void;
}

export default function StructuredOperationReview({
	operation,
	status = "pending",
	fillState,
	disabled = false,
	onDecision,
}: StructuredOperationReviewProps) {
	const editorId = useId();
	const payload = summarizeOperation(operation);
	const mode = effectiveConfirmationMode(operation.confirmationMode, fillState);
	const fillDowngraded =
		operation.confirmationMode === AgentConfirmationMode.Fill &&
		mode !== AgentConfirmationMode.Fill;
	const [editedText, setEditedText] = useState(payload.primaryText);
	const canApply =
		status === "pending" && mode !== AgentConfirmationMode.AskOnly;
	const canEdit =
		status === "pending" &&
		(mode === AgentConfirmationMode.Edit ||
			mode === AgentConfirmationMode.Fill ||
			mode === AgentConfirmationMode.Propose);
	const statusLabel = statusLabelFor(status);
	const modeLabel = modeLabelFor(mode);
	const identityLabel = `${operation.skill.id}@${operation.skill.version}${
		operation.skill.section ? `:${operation.skill.section}` : ""
	}`;
	const targetLabel = targetLabelFor(operation.target);

	const handleDecision = (
		decision: StructuredOperationDecision,
		decisionEditedText?: string,
	) => {
		onDecision?.(decision, {
			operation,
			editedText: decisionEditedText,
			effectiveMode: mode,
		});
	};

	useEffect(() => {
		setEditedText(payload.primaryText);
	}, [payload.primaryText]);

	return (
		<article
			aria-labelledby={`${editorId}-title`}
			className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
			data-confirmation-mode={operation.confirmationMode}
			data-effective-mode={mode}
			data-operation-kind={operation.kind}
			data-operation-review
		>
			<header className="border-b border-[var(--color-border)] px-4 py-3">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="min-w-0">
						<p className="m-0 text-xs font-medium uppercase text-[var(--color-muted)]">
							Safety Secretary suggestion
						</p>
						<h3
							className="m-0 mt-1 text-sm font-semibold text-[var(--color-text)]"
							id={`${editorId}-title`}
						>
							{payload.title}
						</h3>
					</div>
					<div className="flex flex-wrap items-center gap-2">
						<Badge variant={statusBadgeVariant(status)}>{statusLabel}</Badge>
						<Badge variant={fillDowngraded ? "warning" : "info"}>
							{modeLabel}
						</Badge>
					</div>
				</div>
			</header>

			<div className="flex flex-col gap-4 px-4 py-4">
				{operation.confirmationMode === AgentConfirmationMode.Fill &&
					!fillDowngraded && (
						<p className="m-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elev)] px-3 py-2 text-sm text-[var(--color-muted)]">
							Fill is traceable: the user opted into filling{" "}
							{fillState?.targetLabel ?? "this empty target"}, and the target is
							still empty.
						</p>
					)}

				{fillDowngraded && (
					<p className="m-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elev)] px-3 py-2 text-sm text-[var(--color-muted)]">
						Fill is traceable and only runs after opt-in for an empty target.
						This suggestion is shown as a proposal because{" "}
						{fillDowngradeReason(fillState)}.
					</p>
				)}

				<div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-3">
					<p className="m-0 text-sm leading-6 text-[var(--color-text)]">
						{payload.primaryText}
					</p>
					{payload.details.length > 0 && (
						<dl className="mt-3 grid gap-2 text-xs text-[var(--color-muted)] sm:grid-cols-2">
							{payload.details.map((detail) => (
								<div key={detail.label} className="min-w-0">
									<dt className="font-medium text-[var(--color-text)]">
										{detail.label}
									</dt>
									<dd className="m-0 break-words">{detail.value}</dd>
								</div>
							))}
						</dl>
					)}
				</div>

				{canEdit && (
					<label className="flex flex-col gap-2 text-sm text-[var(--color-muted)]">
						<span>Edit before applying</span>
						<textarea
							className="min-h-24 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
							onChange={(event) => setEditedText(event.currentTarget.value)}
							value={editedText}
						/>
					</label>
				)}

				<TraceabilityDetails
					identityLabel={identityLabel}
					operation={operation}
					sourceRefs={operation.sourceRefs}
					targetLabel={targetLabel}
				/>
			</div>

			<footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] px-4 py-3">
				<p className="m-0 text-xs text-[var(--color-muted)]">
					Nothing changes until a user chooses an action.
				</p>
				<div className="flex flex-wrap gap-2">
					{canApply && (
						<Button
							disabled={disabled}
							onClick={() =>
								handleDecision(
									"apply",
									mode === AgentConfirmationMode.Edit ? editedText : undefined,
								)
							}
							size="sm"
							variant="primary"
						>
							{applyLabelFor(mode)}
						</Button>
					)}
					{canEdit && (
						<Button
							disabled={disabled}
							onClick={() => handleDecision("edit-then-apply", editedText)}
							size="sm"
							variant="secondary"
						>
							Edit then apply
						</Button>
					)}
					<Button
						disabled={disabled || status !== "pending"}
						onClick={() => handleDecision("ask-revise")}
						size="sm"
						variant="ghost"
					>
						Ask for revision
					</Button>
					<Button
						disabled={disabled || status !== "pending"}
						onClick={() => handleDecision("ignore")}
						size="sm"
						variant="ghost"
					>
						Ignore
					</Button>
				</div>
			</footer>
		</article>
	);
}

function TraceabilityDetails({
	identityLabel,
	operation,
	sourceRefs,
	targetLabel,
}: {
	readonly identityLabel: string;
	readonly operation: AgentStructuredOperation;
	readonly sourceRefs: readonly AgentSourceReference[];
	readonly targetLabel: string | null;
}) {
	return (
		<details className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-elev)] px-3 py-2">
			<summary className="cursor-pointer text-xs font-medium text-[var(--color-muted)]">
				Traceability
			</summary>
			<div className="mt-3 grid gap-3 text-xs text-[var(--color-muted)]">
				<dl className="m-0 grid gap-2 sm:grid-cols-2">
					<div className="min-w-0">
						<dt className="font-medium text-[var(--color-text)]">Skill</dt>
						<dd className="m-0 break-words">{identityLabel}</dd>
					</div>
					<div className="min-w-0">
						<dt className="font-medium text-[var(--color-text)]">Run</dt>
						<dd className="m-0 break-words">{operation.runId}</dd>
					</div>
					<div className="min-w-0 sm:col-span-2">
						<dt className="font-medium text-[var(--color-text)]">Operation</dt>
						<dd className="m-0 break-words">{operation.id}</dd>
					</div>
					{targetLabel ? (
						<div className="min-w-0">
							<dt className="font-medium text-[var(--color-text)]">Target</dt>
							<dd className="m-0 break-words">{targetLabel}</dd>
						</div>
					) : null}
				</dl>
				{sourceRefs.length > 0 && (
					<SourceReferenceList sourceRefs={sourceRefs} />
				)}
			</div>
		</details>
	);
}

function SourceReferenceList({
	sourceRefs,
}: {
	readonly sourceRefs: readonly AgentSourceReference[];
}) {
	const refs = useMemo(
		() =>
			sourceRefs.map((ref) => ({
				key: `${ref.type}:${ref.id}:${ref.label ?? ""}`,
				label: ref.label ? `${ref.label} (${ref.type})` : ref.type,
				id: ref.id,
			})),
		[sourceRefs],
	);

	return (
		<section aria-label="Source references">
			<p className="m-0 mb-2 text-xs font-medium uppercase text-[var(--color-muted)]">
				Sources
			</p>
			<ul className="m-0 flex list-none flex-wrap gap-2 p-0">
				{refs.map((ref) => (
					<li
						className="rounded-full border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-muted)]"
						key={ref.key}
					>
						{ref.label}: {ref.id}
					</li>
				))}
			</ul>
		</section>
	);
}

interface OperationSummary {
	readonly title: string;
	readonly primaryText: string;
	readonly details: readonly {
		readonly label: string;
		readonly value: string;
	}[];
}

function summarizeOperation(
	operation: AgentStructuredOperation,
): OperationSummary {
	switch (operation.kind) {
		case AgentOperationKind.AskQuestion:
			return {
				title: "Question for the user",
				primaryText: operation.payload.question,
				details: detailList([["Field", operation.payload.fieldPath]]),
			};
		case AgentOperationKind.Fact:
			return {
				title: "Fact to add",
				primaryText: operation.payload.text,
				details: detailList([["Field", operation.payload.fieldPath]]),
			};
		case AgentOperationKind.TimelineEvent:
			return {
				title: `Timeline event: ${operation.payload.title}`,
				primaryText:
					operation.payload.narrative ??
					"Add this event to the incident timeline.",
				details: detailList([
					["Phase", operation.payload.phase],
					["Time", operation.payload.occurredAt],
				]),
			};
		case AgentOperationKind.CauseNode:
			return {
				title: "Cause card",
				primaryText: operation.payload.label,
				details: detailList([
					["Parent", operation.payload.parentId],
					["Method", operation.payload.method],
				]),
			};
		case AgentOperationKind.StopAction:
			return {
				title: `S-T-O-P action: ${operation.payload.stopClass}`,
				primaryText: operation.payload.title,
				details: detailList([
					["Purpose", operation.payload.purpose],
					["Linked cause", operation.payload.linkedCauseNodeId],
				]),
			};
		case AgentOperationKind.HiraFollowupNote:
			return {
				title: "Risk-assessment follow-up",
				primaryText: operation.payload.note,
				details: detailList([
					["Target process", operation.payload.targetProcess],
				]),
			};
		case AgentOperationKind.OutputSectionDraft:
			return {
				title: `Output draft: ${operation.payload.sectionId}`,
				primaryText: operation.payload.text,
				details: detailList([["Output", operation.payload.outputType]]),
			};
		case AgentOperationKind.ProcessStep:
			return {
				title: "Process step",
				primaryText: operation.payload.label,
				details: detailList([["Parent step", operation.payload.parentId]]),
			};
		case AgentOperationKind.Hazard:
			return {
				title: "Hazard",
				primaryText: operation.payload.description,
				details: detailList([
					["SUVA category", operation.payload.suvaCategoryId],
					["Existing controls", operation.payload.existingControls?.join(", ")],
				]),
			};
		case AgentOperationKind.RiskRatingSuggestion:
			return {
				title: "Risk rating suggestion",
				primaryText: operation.payload.rationale,
				details: detailList([
					["Severity", operation.payload.severity],
					["Likelihood", operation.payload.likelihood],
				]),
			};
		case AgentOperationKind.ControlProposal:
			return {
				title: `S-T-O-P control: ${operation.payload.stopClass}`,
				primaryText: operation.payload.title,
				details: detailList([["Rationale", operation.payload.rationale]]),
			};
		case AgentOperationKind.ResidualRatingSuggestion:
			return {
				title: "Residual risk suggestion",
				primaryText: operation.payload.rationale,
				details: detailList([
					["Severity", operation.payload.severity],
					["Likelihood", operation.payload.likelihood],
				]),
			};
		case AgentOperationKind.CrossHiraSuggestion:
			return {
				title: "Similar HIRA suggestion",
				primaryText: operation.payload.copiedText,
				details: detailList([
					["Source HIRA", operation.payload.sourceWorkflowId],
					["Rationale", operation.payload.rationale],
				]),
			};
		case AgentOperationKind.CompanyMemoryProposal:
			return {
				title: "Company memory draft",
				primaryText: operation.payload.summary,
				details: detailList(
					operation.payload.sourceRefs.map((sourceRef, index) => [
						`Source ${index + 1}`,
						sourceRef.label
							? `${sourceRef.label} (${sourceRef.type}:${sourceRef.id})`
							: `${sourceRef.type}:${sourceRef.id}`,
					]),
				),
			};
		default: {
			const fallback = operation as { readonly kind: string };
			return {
				title: fallback.kind.replaceAll("_", " "),
				primaryText: "Review this assistant suggestion.",
				details: [],
			};
		}
	}
}

function targetLabelFor(
	target: AgentStructuredOperation["target"],
): string | null {
	switch (target) {
		case AgentAllowedOperationTarget.WorkflowDraft:
			return "workflow draft";
		case AgentAllowedOperationTarget.Conversation:
			return "conversation";
		case AgentAllowedOperationTarget.GeneratedArtifactDraft:
			return "generated artifact draft";
		case AgentAllowedOperationTarget.CompanyMemoryDraft:
			return "company memory draft";
		default:
			return target ?? null;
	}
}

function detailList(
	values: readonly (readonly [string, string | number | undefined])[],
): readonly { readonly label: string; readonly value: string }[] {
	return values
		.filter(([, value]) => value !== undefined && value !== "")
		.map(([label, value]) => ({ label, value: String(value) }));
}

function effectiveConfirmationMode(
	mode: AgentConfirmationMode,
	fillState: StructuredOperationReviewFillState | undefined,
): AgentConfirmationMode {
	if (mode !== AgentConfirmationMode.Fill) {
		return mode;
	}
	if (fillState?.optedIn && fillState.targetEmpty) {
		return AgentConfirmationMode.Fill;
	}
	return AgentConfirmationMode.Propose;
}

function fillDowngradeReason(
	fillState: StructuredOperationReviewFillState | undefined,
): string {
	if (!fillState?.optedIn) {
		return "the user has not opted into fill mode";
	}
	if (!fillState.targetEmpty) {
		return `${fillState.targetLabel ?? "the target"} is not empty`;
	}
	return "the fill target is not available";
}

function modeLabelFor(mode: AgentConfirmationMode): string {
	switch (mode) {
		case AgentConfirmationMode.AskOnly:
			return "Ask only";
		case AgentConfirmationMode.Fill:
			return "Fill empty slot";
		case AgentConfirmationMode.Edit:
			return "Edit";
		case AgentConfirmationMode.Propose:
			return "Proposal";
	}
}

function applyLabelFor(mode: AgentConfirmationMode): string {
	switch (mode) {
		case AgentConfirmationMode.Fill:
			return "Fill";
		case AgentConfirmationMode.Edit:
			return "Apply edit";
		default:
			return "Apply";
	}
}

function statusLabelFor(status: StructuredOperationReviewStatus): string {
	switch (status) {
		case "applied":
			return "Applied";
		case "ignored":
			return "Ignored";
		case "revision-requested":
			return "Revision requested";
		case "pending":
			return "Pending review";
	}
}

function statusBadgeVariant(
	status: StructuredOperationReviewStatus,
): "neutral" | "info" | "success" | "warning" | "error" {
	switch (status) {
		case "applied":
			return "success";
		case "ignored":
			return "neutral";
		case "revision-requested":
			return "warning";
		case "pending":
			return "info";
	}
}
