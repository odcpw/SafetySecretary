export type ApprovalWorkflowType = "HIRA" | "JHA" | "II";

export interface ArtifactRef {
  artifactId: string;
  outputType: string;
  storageKey: string;
  filename?: string | null;
}

export interface AttachmentRef {
  attachmentId: string;
  storageKey: string;
  filename?: string | null;
  parentType: string;
  parentId: string;
}

export interface ApprovalSnapshot {
  id: string;
  workflowType: ApprovalWorkflowType;
  hiraCaseId: string | null;
  jhaCaseId: string | null;
  iiCaseId: string | null;
  versionLabel: string;
  approvedBy: string;
  approvedAt: Date;
  schemaVersion: number;
  workflowData: Record<string, unknown>;
  artifactRefs: ArtifactRef[];
  attachmentRefs: AttachmentRef[];
}
