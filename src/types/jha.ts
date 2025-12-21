export interface JhaStepInput {
  id?: string;
  label: string;
  orderIndex?: number;
}

export interface JhaHazardInput {
  id?: string;
  stepId: string;
  hazard: string;
  consequence?: string | null;
  controls?: string[];
  orderIndex?: number;
}

export type JhaWorkflowStage = "steps" | "hazards" | "controls" | "review";

export interface CreateJhaCaseInput {
  jobTitle: string;
  site?: string;
  supervisor?: string;
  workersInvolved?: string;
  jobDate?: string;
  revision?: string;
  preparedBy?: string;
  reviewedBy?: string;
  approvedBy?: string;
  signoffDate?: string;
  workflowStage?: JhaWorkflowStage;
  createdBy?: string;
}

export interface JhaCaseSummary {
  id: string;
  jobTitle: string;
  site: string | null;
  supervisor: string | null;
  workersInvolved: string | null;
  jobDate: Date | null;
  revision: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string | null;
}
