export interface JhaStep {
  id: string;
  orderIndex: number;
  label: string;
}

export interface JhaHazard {
  id: string;
  stepId: string;
  orderIndex: number;
  hazard: string;
  consequence: string | null;
  controls: string[];
}

export type JhaPatchIntent = "add" | "insert" | "modify" | "delete" | "move";
export type JhaPatchTarget = "step" | "hazard" | "control";

export interface JhaPatchLocation {
  stepId?: string;
  stepIndex?: number;
  hazardId?: string;
  hazardIndex?: number;
  insertAfterStepIndex?: number;
  insertBeforeStepIndex?: number;
  insertAfterHazardIndex?: number;
  insertBeforeHazardIndex?: number;
  toStepIndex?: number;
}

export interface JhaPatchCommand {
  intent: JhaPatchIntent;
  target: JhaPatchTarget;
  location?: JhaPatchLocation;
  data?: Record<string, unknown>;
  explanation?: string;
}

export type JhaWorkflowStage = "steps" | "hazards" | "controls" | "review";

export interface JhaAttachment {
  id: string;
  createdAt: string;
  updatedAt: string;
  caseId: string;
  stepId: string | null;
  hazardId: string | null;
  orderIndex: number;
  originalName: string;
  mimeType: string;
  byteSize: number;
  storageKey: string;
  url: string;
}

export interface JhaCase {
  id: string;
  createdAt: string;
  updatedAt: string;
  jobTitle: string;
  site: string | null;
  supervisor: string | null;
  workersInvolved: string | null;
  jobDate: string | null;
  revision: string | null;
  preparedBy: string | null;
  reviewedBy: string | null;
  approvedBy: string | null;
  signoffDate: string | null;
  workflowStage: JhaWorkflowStage | null;
  steps: JhaStep[];
  hazards: JhaHazard[];
  attachments: JhaAttachment[];
}

export interface JhaCaseSummary {
  id: string;
  jobTitle: string;
  site: string | null;
  supervisor: string | null;
  workersInvolved: string | null;
  jobDate: string | null;
  revision: string | null;
  createdAt: string;
  updatedAt: string;
}
