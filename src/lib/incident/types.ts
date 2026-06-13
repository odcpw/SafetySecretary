export type IncidentType = "NEAR_MISS" | "ACCIDENT" | "PROPERTY_DAMAGE";
export type IncidentActualInjuryOutcome =
	| "UNKNOWN"
	| "NO_INJURY"
	| "FIRST_AID"
	| "MEDICAL_TREATMENT"
	| "LOST_TIME"
	| "IRREVERSIBLE_INJURY"
	| "FATALITY";

export type IncidentWorkflowStage =
	| "FACTS"
	| "TIMELINE"
	| "CAUSES"
	| "ACTIONS"
	| "REVIEW"
	| "APPROVED";

export type IncidentTimelineConfidence = "CONFIRMED" | "LIKELY" | "UNCLEAR";

export type IncidentActionType =
	| "SUBSTITUTION"
	| "TECHNICAL"
	| "ORGANIZATIONAL"
	| "ORGANISATIONAL"
	| "PPE"
	| "ENGINEERING"
	| "TRAINING";

export type IncidentContentLanguage = "de" | "en" | "fr" | "it";

export interface IncidentCase {
	id: string;
	title: string;
	incidentAt: Date | null;
	incidentTimeNote: string | null;
	location: string | null;
	incidentType: IncidentType;
	actualInjuryOutcome: IncidentActualInjuryOutcome | null;
	actualSeverityCode: string | null;
	actualSeverityReason: string | null;
	potentialOutcomeText: string | null;
	potentialSeverityCode: string | null;
	potentialLikelihoodCode: string | null;
	potentialRiskBand: string | null;
	hazardCategoryCode: string | null;
	caseNumber: string | null;
	suvaCaseNumber: string | null;
	departmentText: string | null;
	areaText: string | null;
	workActivity: string | null;
	workType: string | null;
	eventType: string | null;
	processInvolved: string | null;
	ppeRequired: string[];
	ppeWorn: string[];
	injuryNature: string | null;
	bodyPart: string | null;
	lostDays: number | null;
	contractorFlag: boolean | null;
	timeInRoleBand: string | null;
	reportableUvg: boolean | null;
	controlFailure: string | null;
	immediateCause: string | null;
	contributingCauses: string[];
	closedAt: Date | null;
	coordinatorRole: string;
	coordinatorName: string | null;
	workflowStage: IncidentWorkflowStage;
	contentLanguage: IncidentContentLanguage;
	hiraFollowupNeeded: boolean;
	hiraFollowupText: string | null;
	createdById: string;
	createdAt: Date;
	updatedAt: Date;
}

export interface IncidentPerson {
	id: string;
	caseId: string;
	role: string;
	name: string | null;
	otherInfo: string | null;
	yearsWithCompany: number | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface IncidentAccount {
	id: string;
	caseId: string;
	personId: string;
	rawStatement: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface IncidentFact {
	id: string;
	accountId: string;
	orderIndex: number;
	text: string;
	createdAt: Date;
	updatedAt: Date;
}

export interface IncidentPersonalEvent {
	id: string;
	accountId: string;
	orderIndex: number;
	eventAt: Date | null;
	timeLabel: string | null;
	text: string;
	createdAt: Date;
	updatedAt: Date;
}

export interface IncidentTimelineEvent {
	id: string;
	caseId: string;
	orderIndex: number;
	eventAt: Date | null;
	timeLabel: string | null;
	text: string;
	confidence: IncidentTimelineConfidence;
	createdAt: Date;
	updatedAt: Date;
}

export interface IncidentTimelineSource {
	id: string;
	timelineEventId: string;
	accountId: string;
	factId: string | null;
	personalEventId: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface IncidentDeviation {
	id: string;
	eventId: string;
	orderIndex: number;
	expected: string | null;
	actual: string | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface IncidentCauseNode {
	id: string;
	caseId: string;
	parentId: string | null;
	timelineEventId: string | null;
	orderIndex: number;
	statement: string;
	question: string | null;
	isRootCause: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export interface IncidentCauseAction {
	id: string;
	causeNodeId: string;
	orderIndex: number;
	description: string;
	ownerRole: string | null;
	dueDate: Date | null;
	actionType: IncidentActionType | null;
	createdAt: Date;
	updatedAt: Date;
}

export interface IncidentAttachment {
	id: string;
	eventId: string;
	storageKey: string;
	filename: string | null;
	mimeType: string | null;
	sizeBytes: bigint | null;
	createdAt: Date;
	createdById: string;
}
