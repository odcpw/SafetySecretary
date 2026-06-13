/**
 * Coach photo uploads persist on one dedicated housekeeping timeline event
 * per case ("Photo evidence" / "Evidence"). The constants live here, in a
 * dependency-free module, so both client components and server code (see
 * src/lib/incident/coach-photos.ts) can recognise — and hide — that event.
 */
export const COACH_PHOTO_EVENT_TEXT = "Photo evidence";
export const COACH_PHOTO_EVENT_TIME_LABEL = "Evidence";

export type RecordIncident = {
	id: string;
	caseNumber: string | null;
	title: string;
	incidentAt: string | null;
	incidentTimeNote: string | null;
	location: string | null;
	incidentType: string;
	actualOutcome: string | null;
	actualSeverity: string | null;
	potentialOutcome: string | null;
	potentialSeverity: string | null;
	potentialLikelihood: number | null;
	potentialRiskBand: string | null;
	hazardCategory: string | null;
	department: string | null;
	immediateCause: string | null;
	controlFailure: string | null;
	area: string | null;
	shift: string | null;
	workActivity: string | null;
	workType: string | null;
	eventType: string | null;
	processInvolved: string | null;
	injuryNature: string | null;
	bodyPart: string | null;
	lostDays: number | null;
	coordinatorRole: string;
	coordinatorName: string | null;
	workflowStage: string;
	causeMethod?: string | null;
	contentLanguage: string;
	hiraFollowupNeeded: boolean;
	hiraFollowupText: string | null;
	seriousPotential?: boolean;
};

export type RecordPerson = {
	id: string;
	role: string;
	name: string | null;
	otherInfo: string | null;
};

export type RecordTimelineEvent = {
	id: string;
	phase?: "before" | "event" | "after";
	eventAt: string | null;
	timeLabel: string | null;
	text: string;
	confidence: string;
	attachmentCount: number;
};

export type RecordCauseBranchStatus = "OPEN" | "ROOT_REACHED" | "PARKED";

export type RecordCauseNode = {
	id: string;
	parentId: string | null;
	timelineEventId: string | null;
	statement: string;
	question: string | null;
	isRootCause: boolean;
	branchStatus?: RecordCauseBranchStatus;
};

export type RecordAction = {
	id: string;
	causeNodeId: string;
	description: string;
	ownerRole: string | null;
	dueDate: string | null;
	actionType: string | null;
	status: string;
};

export type RecordFact = {
	id: string;
	accountId: string;
	personId: string;
	personRole: string;
	personName: string | null;
	text: string;
};

export type RecordEvidence = {
	id: string;
	eventId: string;
	storageKey: string;
	filename: string | null;
	mimeType: string | null;
	caption: string | null;
	sizeBytes: number | null;
};

export type IncidentRecord = {
	incident: RecordIncident;
	people: RecordPerson[];
	facts: RecordFact[];
	timeline: RecordTimelineEvent[];
	causes: RecordCauseNode[];
	actions: RecordAction[];
	hiraFollowup: { needed: boolean; text: string | null };
	evidence: RecordEvidence[];
};
