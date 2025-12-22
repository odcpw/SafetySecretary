import { IncidentActionType, IncidentTimelineConfidence, IncidentType } from "@prisma/client";

export { IncidentActionType, IncidentTimelineConfidence, IncidentType };

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

export interface CreateIncidentCaseInput {
  title: string;
  workflowStage?: string;
  incidentAt?: string;
  incidentTimeNote?: string;
  location?: string;
  incidentType: IncidentType;
  coordinatorRole: string;
  coordinatorName?: string;
  createdBy?: string;
}

export interface IncidentPersonInput {
  role: string;
  name?: string;
  otherInfo?: string;
}

export interface IncidentAccountInput {
  personId: string;
  rawStatement?: string;
}

export interface IncidentFactInput {
  id?: string;
  accountId: string;
  orderIndex?: number;
  text: string;
}

export interface IncidentPersonalEventInput {
  id?: string;
  accountId: string;
  orderIndex?: number;
  eventAt?: string | null;
  timeLabel?: string | null;
  text: string;
}

export interface IncidentTimelineEventInput {
  id?: string;
  orderIndex?: number;
  eventAt?: string | null;
  timeLabel?: string | null;
  text: string;
  confidence?: IncidentTimelineConfidence;
}

export interface IncidentTimelineSourceInput {
  timelineEventId: string;
  accountId: string;
  factId?: string | null;
  personalEventId?: string | null;
}

export interface IncidentDeviationInput {
  id?: string;
  timelineEventId?: string | null;
  orderIndex?: number;
  expected?: string | null;
  actual?: string | null;
  changeObserved?: string | null;
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

export interface IncidentCauseNodeInput {
  id?: string;
  parentId?: string | null;
  timelineEventId?: string | null;
  orderIndex?: number;
  statement: string;
  question?: string | null;
  isRootCause?: boolean;
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

export interface IncidentCaseSummary {
  id: string;
  title: string;
  workflowStage: string | null;
  incidentAt: Date | null;
  incidentTimeNote: string | null;
  location: string | null;
  incidentType: IncidentType;
  coordinatorRole: string;
  coordinatorName: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
}
