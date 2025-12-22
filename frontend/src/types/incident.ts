export type IncidentType = "NEAR_MISS" | "FIRST_AID" | "LOST_TIME" | "PROPERTY_DAMAGE";
export type IncidentTimelineConfidence = "CONFIRMED" | "LIKELY" | "UNCLEAR";
export type IncidentActionType = "ENGINEERING" | "ORGANISATIONAL" | "PPE" | "TRAINING";

export interface IncidentAssistantClarification {
  id?: string;
  question: string;
  rationale?: string | null;
  answer?: string | null;
  targetField?: string | null;
}

export interface IncidentAssistantDraft {
  facts: Array<{ text: string }>;
  timeline: Array<{
    eventAt?: string | null;
    timeLabel?: string | null;
    text: string;
    confidence?: IncidentTimelineConfidence;
  }>;
  clarifications: IncidentAssistantClarification[];
}

export interface IncidentPerson {
  id: string;
  role: string;
  name: string | null;
  otherInfo?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface IncidentFact {
  id: string;
  orderIndex: number;
  text: string;
}

export interface IncidentPersonalEvent {
  id: string;
  orderIndex: number;
  eventAt?: string | null;
  timeLabel: string | null;
  text: string;
}

export interface IncidentAccount {
  id: string;
  personId: string;
  rawStatement: string | null;
  person?: IncidentPerson | null;
  facts: IncidentFact[];
  personalEvents: IncidentPersonalEvent[];
}

export interface IncidentTimelineSource {
  id: string;
  accountId: string;
  factId: string | null;
  personalEventId: string | null;
  account?: IncidentAccount | null;
  fact?: IncidentFact | null;
  personalEvent?: IncidentPersonalEvent | null;
}

export interface IncidentTimelineEvent {
  id: string;
  orderIndex: number;
  eventAt?: string | null;
  timeLabel: string | null;
  text: string;
  confidence: IncidentTimelineConfidence;
  sources: IncidentTimelineSource[];
}

export interface IncidentTimelineEventInput {
  id?: string;
  orderIndex?: number;
  eventAt?: string | null;
  timeLabel?: string | null;
  text: string;
  confidence?: IncidentTimelineConfidence;
}

export interface IncidentCause {
  id: string;
  deviationId: string;
  orderIndex: number;
  statement: string;
  actions: IncidentAction[];
}

export interface IncidentDeviation {
  id: string;
  timelineEventId: string | null;
  orderIndex: number;
  expected: string | null;
  actual: string | null;
  changeObserved: string | null;
  causes: IncidentCause[];
}

export interface IncidentDeviationInput {
  id?: string;
  timelineEventId?: string | null;
  orderIndex?: number;
  expected?: string | null;
  actual?: string | null;
  changeObserved?: string | null;
}

export interface IncidentAction {
  id: string;
  causeId: string;
  orderIndex: number;
  description: string;
  ownerRole: string | null;
  dueDate: string | null;
  actionType: IncidentActionType | null;
}

export interface IncidentCauseInput {
  id?: string;
  deviationId: string;
  orderIndex?: number;
  statement: string;
}

export interface IncidentActionInput {
  id?: string;
  causeId: string;
  orderIndex?: number;
  description: string;
  ownerRole?: string | null;
  dueDate?: string | null;
  actionType?: IncidentActionType | null;
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
  actions: IncidentCauseAction[];
}

export interface IncidentCauseNodeInput {
  id?: string;
  parentId?: string | null;
  timelineEventId?: string | null;
  orderIndex?: number;
  statement: string;
  question?: string | null;
  isRootCause?: boolean;
}

export interface IncidentCauseAction {
  id: string;
  causeNodeId: string;
  orderIndex: number;
  description: string;
  ownerRole: string | null;
  dueDate: string | null;
  actionType: IncidentActionType | null;
}

export interface IncidentCauseActionInput {
  id?: string;
  causeNodeId: string;
  orderIndex?: number;
  description: string;
  ownerRole?: string | null;
  dueDate?: string | null;
  actionType?: IncidentActionType | null;
}

export interface IncidentAttachment {
  id: string;
  createdAt: string;
  updatedAt: string;
  caseId: string;
  timelineEventId: string | null;
  orderIndex: number;
  originalName: string;
  mimeType: string;
  byteSize: number;
  storageKey: string;
  url: string;
}

export interface IncidentCase {
  id: string;
  createdAt: string;
  updatedAt: string;
  title: string;
  workflowStage?: string | null;
  incidentAt: string | null;
  incidentTimeNote: string | null;
  location: string | null;
  incidentType: IncidentType;
  coordinatorRole: string;
  coordinatorName: string | null;
  assistantNarrative?: string | null;
  assistantDraft?: IncidentAssistantDraft | null;
  assistantDraftUpdatedAt?: string | null;
  persons: IncidentPerson[];
  accounts: IncidentAccount[];
  timelineEvents: IncidentTimelineEvent[];
  deviations: IncidentDeviation[];
  causeNodes?: IncidentCauseNode[];
  attachments: IncidentAttachment[];
}

export interface IncidentCaseSummary {
  id: string;
  title: string;
  workflowStage?: string | null;
  incidentAt: string | null;
  incidentTimeNote: string | null;
  location: string | null;
  incidentType: IncidentType;
  coordinatorRole: string;
  coordinatorName: string | null;
  createdAt: string;
  updatedAt: string;
}
