import { randomUUID } from "node:crypto";
import {
	PrismaWorkflowSerialiseStore,
	SNAPSHOT_SCHEMA_VERSION,
	type SnapshotPrismaClient,
	serialiseWorkflow,
	UnsupportedSnapshotWorkflowError,
	type WorkflowSerialiseStore,
	type WorkflowSnapshotData,
} from "./serialise";
import type {
	ApprovalSnapshot,
	ApprovalWorkflowType,
	ArtifactRef,
	AttachmentRef,
} from "./types";

export type ApproveOptions = {
	store?: SnapshotApprovalStore;
	client?: SnapshotApprovalPrismaClient;
	tenantId?: string;
	now?: Date;
	transactionOptions?: SnapshotTransactionOptions;
};

export interface SnapshotApprovalStore {
	transaction<T>(
		fn: (tx: SnapshotApprovalTransaction) => Promise<T>,
		options?: SnapshotTransactionOptions,
	): Promise<T>;
}

export interface SnapshotApprovalTransaction extends WorkflowSerialiseStore {
	findGeneratedArtifactRefs(
		workflowType: ApprovalWorkflowType,
		caseId: string,
	): Promise<ArtifactRef[]>;
	findAttachmentRefs(
		workflowType: ApprovalWorkflowType,
		caseId: string,
	): Promise<AttachmentRef[]>;
	countApprovalSnapshots(
		workflowType: ApprovalWorkflowType,
		caseId: string,
	): Promise<number>;
	createApprovalSnapshot(
		input: CreateApprovalSnapshotInput,
	): Promise<ApprovalSnapshotRow>;
	markGeneratedArtifactsSnapshotLinked(
		artifactIds: readonly string[],
	): Promise<void>;
}

export type SnapshotTransactionOptions = {
	isolationLevel?: string;
	maxWait?: number;
	timeout?: number;
};

export type CreateApprovalSnapshotInput = {
	workflowType: ApprovalWorkflowType;
	caseId: string;
	versionLabel: string;
	approvedById: string;
	approvedAt: Date;
	workflowData: WorkflowSnapshotData;
	artifactRefs: ArtifactRef[];
	attachmentRefs: AttachmentRef[];
};

export type ApprovalSnapshotRow = {
	id: string;
	workflowType: ApprovalWorkflowType;
	hiraCaseId: string | null;
	jhaCaseId: string | null;
	iiCaseId: string | null;
	versionLabel: string;
	approvedById: string;
	approvedAt: Date;
	schemaVersion: number;
	workflowData: Record<string, unknown>;
	artifactRefs: unknown;
	attachmentRefs: unknown;
};

export async function approve(
	caseId: string,
	workflowType: ApprovalWorkflowType,
	approverUserId: string,
	options: ApproveOptions = {},
): Promise<ApprovalSnapshot> {
	const store =
		options.store ??
		(options.tenantId
			? new TenantSnapshotApprovalStore(options.tenantId)
			: new PrismaSnapshotApprovalStore(
					options.client ?? (await getDefaultSnapshotApprovalPrismaClient()),
				));
	const approvedAt = options.now ?? new Date();

	return store.transaction(
		async (tx) => {
			const workflowData = await serialiseWorkflow(workflowType, caseId, {
				store: tx,
			});
			const [artifactRefs, attachmentRefs, snapshotCount] = await Promise.all([
				tx.findGeneratedArtifactRefs(workflowType, caseId),
				tx.findAttachmentRefs(workflowType, caseId),
				tx.countApprovalSnapshots(workflowType, caseId),
			]);
			const versionLabel = formatVersionLabel(snapshotCount + 1);
			const row = await tx.createApprovalSnapshot({
				workflowType,
				caseId,
				versionLabel,
				approvedById: approverUserId,
				approvedAt,
				workflowData,
				artifactRefs,
				attachmentRefs,
			});

			await tx.markGeneratedArtifactsSnapshotLinked(
				artifactRefs.map((ref) => ref.artifactId),
			);

			return toApprovalSnapshot(row);
		},
		{
			isolationLevel: "Serializable",
			timeout: 15_000,
			...options.transactionOptions,
		},
	);
}

export class PrismaSnapshotApprovalStore implements SnapshotApprovalStore {
	private readonly client: SnapshotApprovalPrismaClient;

	constructor(client: SnapshotApprovalPrismaClient) {
		this.client = client;
	}

	async transaction<T>(
		fn: (tx: SnapshotApprovalTransaction) => Promise<T>,
		options?: SnapshotTransactionOptions,
	): Promise<T> {
		return this.client.$transaction(
			async (tx) => fn(new PrismaSnapshotApprovalTransaction(tx)),
			options,
		);
	}
}

export class TenantSnapshotApprovalStore implements SnapshotApprovalStore {
	private readonly tenantId: string;

	constructor(tenantId: string) {
		this.tenantId = tenantId;
	}

	async transaction<T>(
		fn: (tx: SnapshotApprovalTransaction) => Promise<T>,
		options?: SnapshotTransactionOptions,
	): Promise<T> {
		const { withTenantConnection } = await import("../db/tenancy");
		const tenantOptions = options as Parameters<typeof withTenantConnection>[2];
		return withTenantConnection(
			this.tenantId,
			(tx) =>
				fn(
					new PrismaSnapshotApprovalTransaction(
						tx as SnapshotApprovalTransactionPrismaClient,
					),
				),
			tenantOptions,
		);
	}
}

export class PrismaSnapshotApprovalTransaction
	implements SnapshotApprovalTransaction
{
	private readonly client: SnapshotApprovalTransactionPrismaClient;

	constructor(client: SnapshotApprovalTransactionPrismaClient) {
		this.client = client;
	}

	async findIncidentWorkflow(caseId: string) {
		return new PrismaWorkflowSerialiseStore(this.client).findIncidentWorkflow(
			caseId,
		);
	}

	async findGeneratedArtifactRefs(
		workflowType: ApprovalWorkflowType,
		caseId: string,
	): Promise<ArtifactRef[]> {
		if (workflowType !== "II") {
			throw new UnsupportedSnapshotWorkflowError(workflowType);
		}

		const rows = await this.client.$queryRaw<GeneratedArtifactRefRow[]>`
			SELECT
				id::text AS id,
				output_type AS "outputType",
				storage_key AS "storageKey",
				filename
			FROM generated_artifact
			WHERE workflow_type = ${workflowType}::approval_workflow_type
				AND ii_case_id = ${caseId}::uuid
			ORDER BY output_type ASC, version_seq ASC, generated_at ASC, id ASC
		`;

		return rows.map((row) => ({
			artifactId: row.id,
			outputType: row.outputType,
			storageKey: row.storageKey,
			filename: row.filename,
		}));
	}

	async findAttachmentRefs(
		workflowType: ApprovalWorkflowType,
		caseId: string,
	): Promise<AttachmentRef[]> {
		if (workflowType !== "II") {
			throw new UnsupportedSnapshotWorkflowError(workflowType);
		}

		const rows = await this.client.$queryRaw<AttachmentRefRow[]>`
			SELECT
				attachment.id::text AS id,
				attachment.event_id::text AS "eventId",
				attachment.storage_key AS "storageKey",
				attachment.filename
			FROM incident_attachment attachment
			JOIN incident_timeline_event event ON event.id = attachment.event_id
			WHERE event.case_id = ${caseId}::uuid
			ORDER BY attachment.created_at ASC, attachment.id ASC
		`;

		return rows.map((row) => ({
			attachmentId: row.id,
			storageKey: row.storageKey,
			filename: row.filename,
			parentType: "incident_timeline_event",
			parentId: row.eventId,
		}));
	}

	async countApprovalSnapshots(
		workflowType: ApprovalWorkflowType,
		caseId: string,
	): Promise<number> {
		if (workflowType !== "II") {
			throw new UnsupportedSnapshotWorkflowError(workflowType);
		}

		const rows = await this.client.$queryRaw<Array<{ count: number | bigint }>>`
			SELECT count(*) AS count
			FROM approval_snapshot
			WHERE workflow_type = ${workflowType}::approval_workflow_type
				AND ii_case_id = ${caseId}::uuid
		`;

		return Number(rows[0]?.count ?? 0);
	}

	async createApprovalSnapshot(
		input: CreateApprovalSnapshotInput,
	): Promise<ApprovalSnapshotRow> {
		const snapshotId = randomUUID();
		const hiraCaseId = input.workflowType === "HIRA" ? input.caseId : null;
		const jhaCaseId = input.workflowType === "JHA" ? input.caseId : null;
		const iiCaseId = input.workflowType === "II" ? input.caseId : null;
		const rows = await this.client.$queryRaw<ApprovalSnapshotRow[]>`
			INSERT INTO approval_snapshot (
				id,
				workflow_type,
				hira_case_id,
				jha_case_id,
				ii_case_id,
				version_label,
				approved_by,
				approved_at,
				schema_version,
				workflow_data,
				artifact_refs,
				attachment_refs
			)
			VALUES (
				${snapshotId}::uuid,
				${input.workflowType}::approval_workflow_type,
				${hiraCaseId}::uuid,
				${jhaCaseId}::uuid,
				${iiCaseId}::uuid,
				${input.versionLabel},
				${input.approvedById}::uuid,
				${input.approvedAt},
				${SNAPSHOT_SCHEMA_VERSION},
				${JSON.stringify(input.workflowData)}::jsonb,
				${JSON.stringify(input.artifactRefs)}::jsonb,
				${JSON.stringify(input.attachmentRefs)}::jsonb
			)
			RETURNING
				id::text AS id,
				workflow_type::text AS "workflowType",
				hira_case_id::text AS "hiraCaseId",
				jha_case_id::text AS "jhaCaseId",
				ii_case_id::text AS "iiCaseId",
				version_label AS "versionLabel",
				approved_by::text AS "approvedById",
				approved_at AS "approvedAt",
				schema_version AS "schemaVersion",
				workflow_data AS "workflowData",
				artifact_refs AS "artifactRefs",
				attachment_refs AS "attachmentRefs"
		`;
		const row = rows[0];

		if (!row) {
			throw new Error("Approval snapshot insert did not return a row.");
		}

		return row;
	}

	async markGeneratedArtifactsSnapshotLinked(
		artifactIds: readonly string[],
	): Promise<void> {
		if (artifactIds.length === 0) {
			return;
		}

		for (const artifactId of artifactIds) {
			await this.client.$executeRaw`
				UPDATE generated_artifact
				SET is_snapshot_linked = true
				WHERE id = ${artifactId}::uuid
			`;
		}
	}
}

export type SnapshotApprovalPrismaClient = {
	$transaction<T>(
		fn: (tx: SnapshotApprovalTransactionPrismaClient) => Promise<T>,
		options?: SnapshotTransactionOptions,
	): Promise<T>;
};

export type SnapshotApprovalTransactionPrismaClient = SnapshotPrismaClient & {
	$executeRaw(
		strings: TemplateStringsArray,
		...values: unknown[]
	): Promise<number>;
};

type GeneratedArtifactRefRow = {
	id: string;
	outputType: string;
	storageKey: string;
	filename: string | null;
};

type AttachmentRefRow = {
	id: string;
	eventId: string;
	storageKey: string;
	filename: string | null;
};

async function getDefaultSnapshotApprovalPrismaClient(): Promise<SnapshotApprovalPrismaClient> {
	const { prisma } = await import("../db/tenancy");
	return prisma as unknown as SnapshotApprovalPrismaClient;
}

export function formatVersionLabel(version: number): string {
	if (!Number.isInteger(version) || version < 1) {
		throw new Error(`Invalid approval snapshot version: ${version}`);
	}

	return `v${String(version).padStart(2, "0")}`;
}

function toApprovalSnapshot(row: ApprovalSnapshotRow): ApprovalSnapshot {
	return {
		id: row.id,
		workflowType: row.workflowType,
		hiraCaseId: row.hiraCaseId,
		jhaCaseId: row.jhaCaseId,
		iiCaseId: row.iiCaseId,
		versionLabel: row.versionLabel,
		approvedBy: row.approvedById,
		approvedAt: row.approvedAt,
		schemaVersion: row.schemaVersion,
		workflowData: row.workflowData,
		artifactRefs: parseArray<ArtifactRef>(row.artifactRefs),
		attachmentRefs: parseArray<AttachmentRef>(row.attachmentRefs),
	};
}

function parseArray<T>(value: unknown): T[] {
	return Array.isArray(value) ? (value as T[]) : [];
}
