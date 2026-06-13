import type { ApprovalWorkflowType } from "../snapshots/types";

export type GeneratedArtifactSource = "GENERATED" | "HAND_TUNED";

export interface GeneratedArtifact {
	id: string;
	workflowType: ApprovalWorkflowType;
	hiraCaseId: string | null;
	jhaCaseId: string | null;
	iiCaseId: string | null;
	outputType: string;
	versionSeq: number;
	snapshotId: string | null;
	storageKey: string;
	filename: string | null;
	mimeType: string | null;
	sizeBytes: bigint | null;
	generatedAt: Date;
	generatedById: string;
	source: GeneratedArtifactSource;
	isSnapshotLinked: boolean;
}
