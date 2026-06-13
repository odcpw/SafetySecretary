import { randomUUID } from "node:crypto";
import { withTenantConnection } from "../db/tenancy";
import {
	SNAPSHOT_SCHEMA_VERSION,
	serialiseWorkflow,
	UnsupportedSnapshotWorkflowError,
	WorkflowNotFoundError,
	type WorkflowSnapshotData,
} from "../snapshots/serialise";
import type { ApprovalWorkflowType } from "../snapshots/types";
import { artifactKey } from "../storage/keys";
import { createStorageFromEnv } from "../storage/tenant";
import type { Storage, StorageBody } from "../storage/types";
import type { GeneratedArtifact, GeneratedArtifactSource } from "./types";

export type RegenerateOptions = {
	tenantId: string;
	generatedById: string;
	workflowType?: ApprovalWorkflowType;
	storage?: ArtifactStorage;
	content?: StorageBody;
	now?: Date;
	transactionOptions?: TenantTransactionOptions;
};

export type CreateGeneratedArtifactInput = {
	tenantId: string;
	workflowType: ApprovalWorkflowType;
	caseId: string;
	outputType: string;
	source: GeneratedArtifactSource;
	generatedById: string;
	workflowData: WorkflowSnapshotData;
	snapshotId?: string | null;
	storage?: ArtifactStorage;
	content?: StorageBody;
	now?: Date;
};

export type ArtifactStorage = Pick<Storage, "put">;

type TenantTransactionOptions = Parameters<typeof withTenantConnection>[2];

type RegenerationTransactionClient = {
	$queryRaw<T = unknown>(
		strings: TemplateStringsArray,
		...values: unknown[]
	): Promise<T>;
};

type CaseLockRow = {
	id: string;
};

type NextVersionSeqRow = {
	nextVersionSeq: number | bigint;
};

type GeneratedArtifactRow = {
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
};

const artifactMimeType = "application/json";

export async function regenerate(
	caseId: string,
	outputType: string,
	source: GeneratedArtifactSource,
	options: RegenerateOptions,
): Promise<GeneratedArtifact> {
	const workflowType = options.workflowType ?? "II";

	if (workflowType !== "II") {
		throw new UnsupportedSnapshotWorkflowError(workflowType);
	}

	return withTenantConnection(
		options.tenantId,
		async (tx) => {
			const workflowData = await serialiseWorkflow(workflowType, caseId, {
				client: tx,
			});

			return createGeneratedArtifactInTransaction(tx, {
				tenantId: options.tenantId,
				workflowType,
				caseId,
				outputType,
				source,
				generatedById: options.generatedById,
				workflowData,
				storage: options.storage,
				content: options.content,
				now: options.now,
			});
		},
		{
			timeout: 15_000,
			...options.transactionOptions,
		},
	);
}

export async function createGeneratedArtifactInTransaction(
	client: RegenerationTransactionClient,
	input: CreateGeneratedArtifactInput,
): Promise<GeneratedArtifact> {
	if (input.workflowType !== "II") {
		throw new UnsupportedSnapshotWorkflowError(input.workflowType);
	}

	await lockWorkflowCase(client, input.workflowType, input.caseId);

	const versionSeq = await nextVersionSeq(
		client,
		input.workflowType,
		input.caseId,
		input.outputType,
	);
	const artifactId = randomUUID();
	const generatedAt = input.now ?? new Date();
	const storageKey = artifactKey(input.tenantId, artifactId, "json");
	const body =
		input.content ??
		defaultArtifactContent({
			workflowType: input.workflowType,
			caseId: input.caseId,
			outputType: input.outputType,
			versionSeq,
			source: input.source,
			snapshotId: input.snapshotId ?? null,
			generatedAt,
			workflowData: input.workflowData,
		});
	const bodySize = storageBodySize(body);
	const storage = input.storage ?? createStorageFromEnv();
	const metadata = await storage.put(storageKey, body, {
		contentType: artifactMimeType,
		sizeBytes: bodySize,
		customMetadata: {
			artifactId,
			workflowType: input.workflowType,
			outputType: input.outputType,
			versionSeq: String(versionSeq),
		},
	});
	const filename = artifactFilename(input.outputType, versionSeq);

	return insertGeneratedArtifact(client, {
		id: artifactId,
		workflowType: input.workflowType,
		caseId: input.caseId,
		outputType: input.outputType,
		versionSeq,
		snapshotId: input.snapshotId ?? null,
		storageKey: metadata.key,
		filename,
		mimeType: metadata.contentType ?? artifactMimeType,
		sizeBytes: BigInt(metadata.sizeBytes),
		generatedAt,
		generatedById: input.generatedById,
		source: input.source,
	});
}

async function lockWorkflowCase(
	client: RegenerationTransactionClient,
	workflowType: ApprovalWorkflowType,
	caseId: string,
): Promise<void> {
	if (workflowType !== "II") {
		throw new UnsupportedSnapshotWorkflowError(workflowType);
	}

	// Lock the parent case row before MAX(version_seq); aggregate FOR UPDATE
	// does not lock candidate artifact rows in Postgres.
	const rows = await client.$queryRaw<CaseLockRow[]>`
		SELECT id::text AS id
		FROM incident_case
		WHERE id = ${caseId}::uuid
		FOR UPDATE
	`;

	if (rows.length === 0) {
		throw new WorkflowNotFoundError(workflowType, caseId);
	}
}

async function nextVersionSeq(
	client: RegenerationTransactionClient,
	workflowType: ApprovalWorkflowType,
	caseId: string,
	outputType: string,
): Promise<number> {
	const rows = await client.$queryRaw<NextVersionSeqRow[]>`
		SELECT COALESCE(MAX(version_seq), 0) + 1 AS "nextVersionSeq"
		FROM generated_artifact
		WHERE workflow_type = ${workflowType}::approval_workflow_type
			AND ii_case_id = ${caseId}::uuid
			AND output_type = ${outputType}
	`;
	const nextSeq = Number(rows[0]?.nextVersionSeq ?? 1);

	if (!Number.isSafeInteger(nextSeq) || nextSeq < 1) {
		throw new Error(
			`Invalid generated_artifact version_seq allocation for ${workflowType}:${caseId}:${outputType}`,
		);
	}

	return nextSeq;
}

async function insertGeneratedArtifact(
	client: RegenerationTransactionClient,
	input: {
		id: string;
		workflowType: ApprovalWorkflowType;
		caseId: string;
		outputType: string;
		versionSeq: number;
		snapshotId: string | null;
		storageKey: string;
		filename: string;
		mimeType: string;
		sizeBytes: bigint;
		generatedAt: Date;
		generatedById: string;
		source: GeneratedArtifactSource;
	},
): Promise<GeneratedArtifact> {
	const rows = await client.$queryRaw<GeneratedArtifactRow[]>`
		INSERT INTO generated_artifact (
			id,
			workflow_type,
			hira_case_id,
			jha_case_id,
			ii_case_id,
			output_type,
			version_seq,
			snapshot_id,
			storage_key,
			filename,
			mime_type,
			size_bytes,
			generated_at,
			generated_by,
			source
		)
		VALUES (
			${input.id}::uuid,
			${input.workflowType}::approval_workflow_type,
			NULL::uuid,
			NULL::uuid,
			${input.caseId}::uuid,
			${input.outputType},
			${input.versionSeq},
			${input.snapshotId}::uuid,
			${input.storageKey},
			${input.filename},
			${input.mimeType},
			${input.sizeBytes},
			${input.generatedAt},
			${input.generatedById}::uuid,
			${input.source}::generated_artifact_source
		)
		RETURNING
			id::text AS id,
			workflow_type::text AS "workflowType",
			hira_case_id::text AS "hiraCaseId",
			jha_case_id::text AS "jhaCaseId",
			ii_case_id::text AS "iiCaseId",
			output_type AS "outputType",
			version_seq AS "versionSeq",
			snapshot_id::text AS "snapshotId",
			storage_key AS "storageKey",
			filename,
			mime_type AS "mimeType",
			size_bytes AS "sizeBytes",
			generated_at AS "generatedAt",
			generated_by::text AS "generatedById",
			source::text AS source,
			is_snapshot_linked AS "isSnapshotLinked"
	`;
	const row = rows[0];

	if (!row) {
		throw new Error("Generated artifact insert did not return a row.");
	}

	return row;
}

function defaultArtifactContent(input: {
	workflowType: ApprovalWorkflowType;
	caseId: string;
	outputType: string;
	versionSeq: number;
	source: GeneratedArtifactSource;
	snapshotId: string | null;
	generatedAt: Date;
	workflowData: WorkflowSnapshotData;
}): string {
	return `${JSON.stringify(
		{
			artifactSchemaVersion: SNAPSHOT_SCHEMA_VERSION,
			workflowType: input.workflowType,
			caseId: input.caseId,
			outputType: input.outputType,
			versionSeq: input.versionSeq,
			source: input.source,
			snapshotId: input.snapshotId,
			generatedAt: input.generatedAt.toISOString(),
			workflowData: input.workflowData,
		},
		null,
		2,
	)}\n`;
}

function artifactFilename(outputType: string, versionSeq: number): string {
	const safeOutputType = outputType
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^-+|-+$/g, "");

	return `${safeOutputType || "artifact"}-v${String(versionSeq).padStart(
		2,
		"0",
	)}.json`;
}

function storageBodySize(body: StorageBody): number {
	if (typeof body === "string") {
		return Buffer.byteLength(body);
	}

	if (body instanceof ArrayBuffer) {
		return body.byteLength;
	}

	return body.byteLength;
}
