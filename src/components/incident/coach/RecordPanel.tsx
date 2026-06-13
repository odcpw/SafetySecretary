"use client";

import { useState } from "react";
import {
	deriveActualSeverityFromOutcome,
	parseActualInjuryOutcome,
} from "../../../lib/incident/classification";
import {
	incidentFieldHeading,
	outcomeLabel,
	severityLabel,
} from "../../../lib/incident/labels";
import {
	assessIncidentReadiness,
	readinessCopy,
} from "../../../lib/incident/readiness";
import {
	type IncidentLifecycleStage,
	type IncidentWorkflowStage,
	isLifecycleStage,
	isWorkflowStage,
	registerStatus,
} from "../../../lib/incident/workflow-stage";
import Badge from "../../ui/Badge";
import { Tabs } from "../../ui/Tabs";
import ActionPlanEditor from "./ActionPlanEditor";
import CauseGraph from "./CauseGraph";
import CauseMethodToggle from "./CauseMethodToggle";
import CauseTreeEditor from "./CauseTreeEditor";
import type { CoachCopy } from "./copy";
import FishboneGraph from "./FishboneGraph";
import OverviewEditor from "./OverviewEditor";
import PhotosTab from "./PhotosTab";
import TimelineEditor from "./TimelineEditor";
import {
	COACH_PHOTO_EVENT_TEXT,
	COACH_PHOTO_EVENT_TIME_LABEL,
	type IncidentRecord,
	type RecordPerson,
	type RecordTimelineEvent,
} from "./types";

type RecordPanelProps = {
	readonly record: IncidentRecord;
	readonly copy: CoachCopy;
	readonly locale: string;
	readonly onRecordChange?: () => void;
	readonly onMethodSwitch?: (next: string) => void;
};

const GRAPHICAL_TAB_LABEL: Record<string, string> = {
	en: "Graphical",
	de: "Grafik",
	fr: "Graphique",
	it: "Grafico",
};

function graphicalTabLabel(locale: string): string {
	return (
		GRAPHICAL_TAB_LABEL[locale.split("-")[0]?.toLowerCase() ?? "en"] ??
		GRAPHICAL_TAB_LABEL.en
	);
}

export default function RecordPanel({
	record,
	copy,
	locale,
	onRecordChange,
	onMethodSwitch,
}: RecordPanelProps) {
	const [activeTab, setActiveTab] = useState("overview");
	const { incident } = record;
	const visibleTimeline = record.timeline.filter(
		(event) => !isCoachPhotoEvidenceEvent(event),
	);
	const photos = record.evidence.filter((entry) =>
		entry.mimeType?.startsWith("image/"),
	);
	const tabs = [
		{
			content: (
				<OverviewTab
					copy={copy}
					locale={locale}
					onRecordChange={onRecordChange}
					record={record}
				/>
			),
			label: copy.record.tabOverview,
			value: "overview",
		},
		{
			content: (
				<TimelineEditor
					copy={copy}
					facts={record.facts}
					incidentId={incident.id}
					onRecordChange={onRecordChange}
					timeline={visibleTimeline}
				/>
			),
			label: `${copy.record.tabFacts} (${record.facts.length + visibleTimeline.length})`,
			value: "facts",
		},
		{
			content: (
				<CauseTreeEditor
					actions={record.actions}
					causes={record.causes}
					copy={copy}
					incidentId={incident.id}
					onRecordChange={onRecordChange}
				/>
			),
			label: `${copy.record.tabCauses} (${record.causes.length})`,
			value: "causes",
		},
		{
			content:
				incident.causeMethod === "ISHIKAWA" ? (
					<FishboneGraph
						locale={locale}
						method={incident.causeMethod ?? undefined}
						record={record}
					/>
				) : (
					<CauseGraph
						incidentId={incident.id}
						locale={locale}
						method={incident.causeMethod ?? undefined}
						onRecordChange={onRecordChange}
						record={record}
					/>
				),
			label: graphicalTabLabel(locale),
			value: "graphical",
		},
		{
			content: (
				<ActionPlanEditor
					actions={record.actions}
					causes={record.causes}
					copy={copy}
					incidentId={incident.id}
					onRecordChange={onRecordChange}
				/>
			),
			label: `${copy.record.tabActions} (${record.actions.length})`,
			value: "actions",
		},
		{
			content: (
				<PhotosTab
					copy={copy}
					incidentId={incident.id}
					onRecordChange={onRecordChange}
					photos={photos}
				/>
			),
			label: `${copy.record.tabPhotos} (${photos.length})`,
			value: "photos",
		},
	];

	const stage: IncidentWorkflowStage = isWorkflowStage(incident.workflowStage)
		? incident.workflowStage
		: "CAPTURE";
	const lifecycleStage = lifecycleStageForDisplay(stage);

	// Tatsächlicher Schaden (actual harm) is derived from the recorded injury
	// outcome, never from the potential severity. A near-miss / no-injury yields
	// no actual severity code, so no actual-harm badge is shown.
	const actualOutcome = incident.actualOutcome
		? parseActualInjuryOutcome(incident.actualOutcome, incident.incidentType)
		: null;
	const actualSeverityCode = actualOutcome
		? deriveActualSeverityFromOutcome(actualOutcome)
		: null;

	// Soft, non-blocking readiness reminders — the shared definition of a
	// complete-enough record (see lib/incident/readiness.ts). Never disables
	// close or export; the coach's close protocol is gated separately by the
	// phase signal.
	const readiness = assessIncidentReadiness({
		actions: record.actions,
		causes: record.causes,
		hiraFollowupNeeded: record.hiraFollowup.needed,
		hiraFollowupText: record.hiraFollowup.text,
		incidentAt: incident.incidentAt,
		potentialSeverity: incident.potentialSeverity,
	});
	const readinessLabels = readinessCopy(locale);

	return (
		<div className="grid content-start gap-4">
			<div className="flex flex-wrap items-center gap-2">
				<Badge
					variant={
						registerStatus(lifecycleStage) === "closed" ? "neutral" : "info"
					}
				>
					{lifecycleStageLabel(lifecycleStage, copy)}
				</Badge>
				{actualSeverityCode ? (
					<Badge
						title={severityLabel(actualSeverityCode, locale)}
						variant={
							actualSeverityCode === "A" || actualSeverityCode === "B"
								? "error"
								: "neutral"
						}
					>
						{incidentFieldHeading("actualHarm", locale)}: {actualSeverityCode}
					</Badge>
				) : actualOutcome === "NO_INJURY" ? (
					<Badge variant="neutral">
						{incidentFieldHeading("actualHarm", locale)}:{" "}
						{outcomeLabel("NO_INJURY", locale)}
					</Badge>
				) : null}
				{incident.potentialSeverity ? (
					<Badge
						title={severityLabel(incident.potentialSeverity, locale)}
						variant={
							incident.potentialSeverity === "A" ||
							incident.potentialSeverity === "B"
								? "error"
								: "info"
						}
					>
						{incidentFieldHeading("potentialHarm", locale)}:{" "}
						{incident.potentialSeverity}
					</Badge>
				) : (
					<Badge variant="warning">{copy.record.potentialSeverityOpen}</Badge>
				)}
				{record.hiraFollowup.needed ? (
					<Badge variant="info">{copy.record.hiraFollowup}</Badge>
				) : null}
			</div>
			{readiness.ready ? null : (
				<div className="grid gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
					<p className="m-0 text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
						{readinessLabels.title}
					</p>
					<ul className="m-0 grid list-disc gap-0.5 pl-4 text-sm text-[var(--color-text)]">
						{readiness.gaps.map((gap) => (
							<li key={gap.key}>
								{readinessLabels.gaps[gap.key]}
								{typeof gap.count === "number" ? ` (${gap.count})` : ""}
							</li>
						))}
					</ul>
					<p className="m-0 text-xs text-[var(--color-muted)]">
						{readinessLabels.note}
					</p>
				</div>
			)}
			<CauseMethodToggle
				incidentId={incident.id}
				locale={locale}
				method={incident.causeMethod}
				onChange={onRecordChange}
				onSwitched={onMethodSwitch}
			/>
			<Tabs
				activeValue={activeTab}
				aria-label={copy.conversation.recordAriaLabel}
				onChange={setActiveTab}
				tabs={tabs}
			/>
		</div>
	);
}

function OverviewTab({
	record,
	copy,
	locale,
	onRecordChange,
}: {
	record: IncidentRecord;
	copy: CoachCopy;
	locale: string;
	onRecordChange?: () => void;
}) {
	const { incident } = record;

	return (
		<div className="grid gap-4">
			<OverviewEditor
				copy={copy}
				incident={incident}
				locale={locale}
				onRecordChange={onRecordChange}
			/>
			{record.people.length > 0 ? (
				<div className="grid gap-1">
					<h3 className="m-0 text-xs font-medium uppercase text-[var(--color-muted)]">
						{copy.record.peopleInvolved}
					</h3>
					<ul className="m-0 grid list-none gap-1 p-0 text-sm">
						{record.people.map((person: RecordPerson) => (
							<li key={person.id}>
								{person.name ?? copy.record.unnamed}{" "}
								<span className="text-[var(--color-muted)]">
									({enumLabel(person.role)})
								</span>
							</li>
						))}
					</ul>
				</div>
			) : null}
			{record.hiraFollowup.text ? (
				<div className="grid gap-1">
					<h3 className="m-0 text-xs font-medium uppercase text-[var(--color-muted)]">
						{copy.record.hiraFollowup}
					</h3>
					<p className="m-0 text-sm">{record.hiraFollowup.text}</p>
				</div>
			) : null}
		</div>
	);
}

function isCoachPhotoEvidenceEvent(event: RecordTimelineEvent): boolean {
	return (
		event.text === COACH_PHOTO_EVENT_TEXT &&
		event.timeLabel === COACH_PHOTO_EVENT_TIME_LABEL
	);
}

/**
 * Collapse any stored workflow stage onto the four register lifecycle states so
 * the badge never surfaces an internal investigation phase (FACTS/TIMELINE/
 * CAUSES/ACTIONS/REVIEW). Mirrors the incident register at /incidents: FACTS is
 * the DB default a fresh case carries, so it reads as CAPTURE; the other active
 * legacy phases mean a live investigation; APPROVED is terminal (closed).
 */
function lifecycleStageForDisplay(
	stage: IncidentWorkflowStage,
): IncidentLifecycleStage {
	if (isLifecycleStage(stage)) {
		return stage;
	}

	if (stage === "APPROVED") {
		return "CLOSED";
	}

	if (stage === "FACTS") {
		return "CAPTURE";
	}

	return "INVESTIGATING";
}

function lifecycleStageLabel(
	stage: IncidentLifecycleStage,
	copy: CoachCopy,
): string {
	switch (stage) {
		case "CAPTURE":
			return copy.record.stageCaptured;
		case "INVESTIGATING":
			return copy.record.stageInvestigating;
		case "PAUSED":
			return copy.record.statusPaused;
		case "CLOSED":
			return copy.record.stageClosed;
	}
}

function enumLabel(value: unknown): string | null {
	if (typeof value !== "string" || !value.trim()) {
		return null;
	}

	const text = value.replaceAll("_", " ").toLowerCase();
	return text.charAt(0).toUpperCase() + text.slice(1);
}
