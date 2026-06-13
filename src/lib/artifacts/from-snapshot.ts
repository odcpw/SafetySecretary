import { withTenantConnection } from "../db/tenancy";
import type { WorkflowSnapshotData } from "../snapshots/serialise";
import {
	UnsupportedSnapshotWorkflowError,
	WorkflowNotFoundError,
} from "../snapshots/serialise";
import type { ApprovalWorkflowType } from "../snapshots/types";
import type { ArtifactStorage } from "./regenerate";
import { createGeneratedArtifactInTransaction } from "./regenerate";

export type RegenerateFromSnapshotOptions = {
	tenantId: string;
	generatedById?: string;
	storage?: ArtifactStorage;
	now?: Date;
	transactionOptions?: Parameters<typeof withTenantConnection>[2];
};

type SnapshotRow = {
	id: string;
	workflowType: ApprovalWorkflowType;
	hiraCaseId: string | null;
	jhaCaseId: string | null;
	iiCaseId: string | null;
	approvedById: string;
	workflowData: unknown;
};

export async function regenerateFromSnapshot(
	snapshotId: string,
	outputType: string,
	options: RegenerateFromSnapshotOptions,
) {
	return withTenantConnection(
		options.tenantId,
		async (tx) => {
			const snapshot = await findSnapshot(tx, snapshotId);
			const caseId = snapshotCaseId(snapshot);

			return createGeneratedArtifactInTransaction(tx, {
				tenantId: options.tenantId,
				workflowType: snapshot.workflowType,
				caseId,
				outputType,
				source: "GENERATED",
				generatedById: options.generatedById ?? snapshot.approvedById,
				workflowData: workflowDataFromSnapshot(snapshot.workflowData),
				snapshotId,
				storage: options.storage,
				now: options.now,
			});
		},
		{
			timeout: 15_000,
			...options.transactionOptions,
		},
	);
}

async function findSnapshot(
	client: {
		$queryRaw<T = unknown>(
			strings: TemplateStringsArray,
			...values: unknown[]
		): Promise<T>;
	},
	snapshotId: string,
): Promise<SnapshotRow> {
	const rows = await client.$queryRaw<SnapshotRow[]>`
		SELECT
			id::text AS id,
			workflow_type::text AS "workflowType",
			hira_case_id::text AS "hiraCaseId",
			jha_case_id::text AS "jhaCaseId",
			ii_case_id::text AS "iiCaseId",
			approved_by::text AS "approvedById",
			workflow_data AS "workflowData"
		FROM approval_snapshot
		WHERE id = ${snapshotId}::uuid
		LIMIT 1
	`;
	const snapshot = rows[0];

	if (!snapshot) {
		throw new Error(`Approval snapshot not found: ${snapshotId}`);
	}

	return snapshot;
}

function snapshotCaseId(snapshot: SnapshotRow): string {
	if (snapshot.workflowType !== "II") {
		throw new UnsupportedSnapshotWorkflowError(snapshot.workflowType);
	}

	if (!snapshot.iiCaseId) {
		throw new WorkflowNotFoundError(snapshot.workflowType, snapshot.id);
	}

	return snapshot.iiCaseId;
}

function workflowDataFromSnapshot(value: unknown): WorkflowSnapshotData {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("Approval snapshot workflow_data is not a JSON object.");
	}

	return value as WorkflowSnapshotData;
}
