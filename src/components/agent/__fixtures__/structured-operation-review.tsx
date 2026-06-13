"use client";

import {
	AgentAllowedOperationTarget,
	AgentConfirmationMode,
	AgentOperationKind,
	type AgentStructuredOperation,
} from "../../../lib/agent";
import StructuredOperationReview from "../StructuredOperationReview";

const baseOperation = {
	runId: "run-fixture-001",
	skill: {
		id: "incident-investigation",
		version: "0.1.0",
		section: "cause-analysis",
	},
	sourceRefs: [
		{
			type: "timeline_event",
			id: "event-before",
			label: "Situation before",
		},
	],
	target: AgentAllowedOperationTarget.WorkflowDraft,
} satisfies Pick<
	AgentStructuredOperation,
	"runId" | "skill" | "sourceRefs" | "target"
>;

export const structuredOperationReviewFixtureOperations = {
	askOnly: {
		...baseOperation,
		id: "op-ask-story-detail",
		kind: AgentOperationKind.AskQuestion,
		confirmationMode: AgentConfirmationMode.AskOnly,
		payload: {
			question:
				"Where exactly was the cable, and what was the person doing just before the trip?",
			fieldPath: "incident.storyDetail",
		},
	},
	propose: {
		...baseOperation,
		id: "op-propose-timeline",
		kind: AgentOperationKind.TimelineEvent,
		confirmationMode: AgentConfirmationMode.Propose,
		payload: {
			title: "Cable left across the printer walkway",
			phase: "before",
			narrative:
				"A loose cable was lying across the walking route to the label printer before the person arrived.",
		},
	},
	fillAllowed: {
		...baseOperation,
		id: "op-fill-department",
		kind: AgentOperationKind.Fact,
		confirmationMode: AgentConfirmationMode.Fill,
		payload: {
			text: "Packing",
			fieldPath: "incident.department",
		},
	},
	fillDowngraded: {
		...baseOperation,
		id: "op-fill-existing-task",
		kind: AgentOperationKind.Fact,
		confirmationMode: AgentConfirmationMode.Fill,
		payload: {
			text: "Label handling at the printer",
			fieldPath: "incident.workType",
		},
	},
	edit: {
		...baseOperation,
		id: "op-edit-action",
		kind: AgentOperationKind.StopAction,
		confirmationMode: AgentConfirmationMode.Edit,
		payload: {
			title: "Route temporary cables away from normal walking paths",
			stopClass: "T",
			purpose: "preventive",
			linkedCauseNodeId: "cause-technical-route",
		},
	},
	hira: {
		...baseOperation,
		id: "op-cross-hira",
		kind: AgentOperationKind.CrossHiraSuggestion,
		confirmationMode: AgentConfirmationMode.Propose,
		payload: {
			sourceWorkflowId: "HIRA-2026-004",
			copiedText:
				"Use a covered cable bridge or reroute the printer connection above head height.",
			rationale:
				"A similar cable-trip hazard in the packing HIRA used a technical control.",
		},
	},
} satisfies Record<string, AgentStructuredOperation>;

export function StructuredOperationReviewFixture() {
	const operations = structuredOperationReviewFixtureOperations;

	return (
		<section
			aria-label="Structured operation review fixture"
			className="mx-auto flex max-w-5xl flex-col gap-4 p-6"
		>
			<div>
				<p className="m-0 text-xs font-medium uppercase text-[var(--color-muted)]">
					Agent review primitive
				</p>
				<h1 className="m-0 mt-2 text-2xl font-semibold text-[var(--color-text)]">
					Review assistant suggestions before anything changes
				</h1>
			</div>
			<StructuredOperationReview operation={operations.askOnly} />
			<StructuredOperationReview operation={operations.propose} />
			<StructuredOperationReview
				fillState={{
					optedIn: true,
					targetEmpty: true,
					targetLabel: "department",
				}}
				operation={operations.fillAllowed}
			/>
			<StructuredOperationReview
				fillState={{
					optedIn: true,
					targetEmpty: false,
					targetLabel: "task / activity",
				}}
				operation={operations.fillDowngraded}
			/>
			<StructuredOperationReview operation={operations.edit} />
			<StructuredOperationReview operation={operations.hira} />
		</section>
	);
}
