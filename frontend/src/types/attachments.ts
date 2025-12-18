export interface CaseAttachment {
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

