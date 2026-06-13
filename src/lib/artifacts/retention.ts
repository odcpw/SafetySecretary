import type { GeneratedArtifact } from "./types";

export type ArtifactRetentionStorage = {
	delete(storageKey: string): Promise<void>;
};

export type ListDeletableArtifactsOptions = {
	store?: ArtifactRetentionStore;
	client?: ArtifactRetentionPrismaClient;
	tenantId?: string;
};

export type DeleteArtifactOptions = ListDeletableArtifactsOptions & {
	storage?: ArtifactRetentionStorage;
	transactionOptions?: ArtifactRetentionTransactionOptions;
};

export type DeleteArtifactResult = {
	deleted: true;
	artifactId: string;
	storageKey: string;
	artifact: GeneratedArtifact;
};

export interface ArtifactRetentionStore {
	listDeletableArtifacts(caseId: string): Promise<GeneratedArtifact[]>;
	transaction<T>(
		fn: (tx: ArtifactRetentionTransaction) => Promise<T>,
		options?: ArtifactRetentionTransactionOptions,
	): Promise<T>;
}

export interface ArtifactRetentionTransaction {
	findArtifactForDelete(artifactId: string): Promise<GeneratedArtifact | null>;
	deleteArtifactRow(artifactId: string): Promise<void>;
}

export type ArtifactRetentionTransactionOptions = {
	isolationLevel?: string;
	maxWait?: number;
	timeout?: number;
};

export class ArtifactSnapshotLinkedError extends Error {
	readonly code = "artifact_snapshot_linked";
	readonly artifactId: string;
	readonly storageKey: string;

	constructor(artifact: Pick<GeneratedArtifact, "id" | "storageKey">) {
		super(
			`Generated artifact ${artifact.id} is linked to an approval snapshot and cannot be deleted.`,
		);
		this.name = new.target.name;
		this.artifactId = artifact.id;
		this.storageKey = artifact.storageKey;
	}
}

export class ArtifactNotFoundError extends Error {
	readonly code = "artifact_not_found";
	readonly artifactId: string;

	constructor(artifactId: string) {
		super(`Generated artifact ${artifactId} was not found.`);
		this.name = new.target.name;
		this.artifactId = artifactId;
	}
}

export class ArtifactStorageDeleteError extends Error {
	readonly code = "artifact_storage_delete_failed";
	readonly artifactId: string;
	readonly storageKey: string;
	readonly cause: unknown;

	constructor(
		artifact: Pick<GeneratedArtifact, "id" | "storageKey">,
		cause: unknown,
	) {
		super(
			`Storage object for generated artifact ${artifact.id} could not be deleted.`,
		);
		this.name = new.target.name;
		this.artifactId = artifact.id;
		this.storageKey = artifact.storageKey;
		this.cause = cause;
	}
}

export const listDeletableArtifacts = async (
	caseId: string,
	options: ListDeletableArtifactsOptions = {},
): Promise<GeneratedArtifact[]> => {
	const store = await resolveArtifactRetentionStore(options);
	return store.listDeletableArtifacts(caseId);
};

export const deleteArtifact = async (
	artifactId: string,
	options: DeleteArtifactOptions = {},
): Promise<DeleteArtifactResult> => {
	const [store, storage] = await Promise.all([
		resolveArtifactRetentionStore(options),
		resolveArtifactRetentionStorage(options),
	]);

	const artifact = await store.transaction(
		async (tx) => {
			const row = await tx.findArtifactForDelete(artifactId);

			if (!row) {
				throw new ArtifactNotFoundError(artifactId);
			}

			if (row.isSnapshotLinked) {
				throw new ArtifactSnapshotLinkedError(row);
			}

			await tx.deleteArtifactRow(artifactId);
			return row;
		},
		{
			isolationLevel: "Serializable",
			timeout: 15_000,
			...options.transactionOptions,
		},
	);

	try {
		await storage.delete(artifact.storageKey);
	} catch (error) {
		// The DB row has committed; a later cleanup queue can retry this storage key.
		throw new ArtifactStorageDeleteError(artifact, error);
	}

	return {
		deleted: true,
		artifactId: artifact.id,
		storageKey: artifact.storageKey,
		artifact,
	};
};

const prismaArtifactRetentionStore = (
	client: ArtifactRetentionPrismaClient,
): ArtifactRetentionStore => {
	const queries = prismaArtifactRetentionQueries(client);

	return {
		listDeletableArtifacts: queries.listDeletableArtifacts,
		transaction: async (fn, options) =>
			client.$transaction(
				async (tx) => fn(prismaArtifactRetentionQueries(tx)),
				options,
			),
	};
};

const tenantArtifactRetentionStore = (
	tenantId: string,
): ArtifactRetentionStore => {
	return {
		listDeletableArtifacts: async (caseId) => {
			const { withTenantConnection } = await import("../db/tenancy");
			return withTenantConnection(tenantId, (tx) =>
				prismaArtifactRetentionQueries(
					tx as ArtifactRetentionTransactionPrismaClient,
				).listDeletableArtifacts(caseId),
			);
		},
		transaction: async (fn, options) => {
			const { withTenantConnection } = await import("../db/tenancy");
			const tenantOptions = options as Parameters<
				typeof withTenantConnection
			>[2];

			return withTenantConnection(
				tenantId,
				(tx) =>
					fn(
						prismaArtifactRetentionQueries(
							tx as ArtifactRetentionTransactionPrismaClient,
						),
					),
				tenantOptions,
			);
		},
	};
};

const prismaArtifactRetentionQueries = (
	client: ArtifactRetentionTransactionPrismaClient,
): ArtifactRetentionTransaction & {
	listDeletableArtifacts(caseId: string): Promise<GeneratedArtifact[]>;
} => {
	return {
		listDeletableArtifacts: async (caseId) => {
			const rows = await client.$queryRaw<GeneratedArtifactRow[]>`
			SELECT
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
			FROM generated_artifact
			WHERE is_snapshot_linked = false
				AND (
					hira_case_id = ${caseId}::uuid
					OR jha_case_id = ${caseId}::uuid
					OR ii_case_id = ${caseId}::uuid
				)
			ORDER BY generated_at ASC, output_type ASC, version_seq ASC, id ASC
		`;

			return rows.map(toGeneratedArtifact);
		},

		findArtifactForDelete: async (artifactId) => {
			const rows = await client.$queryRaw<GeneratedArtifactRow[]>`
			SELECT
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
			FROM generated_artifact
			WHERE id = ${artifactId}::uuid
			FOR UPDATE
		`;

			return rows[0] ? toGeneratedArtifact(rows[0]) : null;
		},

		deleteArtifactRow: async (artifactId) => {
			await client.$executeRaw`
			DELETE FROM generated_artifact
			WHERE id = ${artifactId}::uuid
				AND is_snapshot_linked = false
		`;
		},
	};
};

export type ArtifactRetentionPrismaClient =
	ArtifactRetentionTransactionPrismaClient & {
		$transaction<T>(
			fn: (tx: ArtifactRetentionTransactionPrismaClient) => Promise<T>,
			options?: ArtifactRetentionTransactionOptions,
		): Promise<T>;
	};

export type ArtifactRetentionTransactionPrismaClient = {
	$queryRaw<T = unknown>(
		strings: TemplateStringsArray,
		...values: unknown[]
	): Promise<T>;
	$executeRaw(
		strings: TemplateStringsArray,
		...values: unknown[]
	): Promise<number>;
};

type GeneratedArtifactRow = {
	id: string;
	workflowType: GeneratedArtifact["workflowType"];
	hiraCaseId: string | null;
	jhaCaseId: string | null;
	iiCaseId: string | null;
	outputType: string;
	versionSeq: number;
	snapshotId: string | null;
	storageKey: string;
	filename: string | null;
	mimeType: string | null;
	sizeBytes: bigint | number | string | null;
	generatedAt: Date;
	generatedById: string;
	source: GeneratedArtifact["source"];
	isSnapshotLinked: boolean;
};

const resolveArtifactRetentionStore = async (
	options: ListDeletableArtifactsOptions,
): Promise<ArtifactRetentionStore> => {
	if (options.store) {
		return options.store;
	}

	if (options.tenantId) {
		return tenantArtifactRetentionStore(options.tenantId);
	}

	return prismaArtifactRetentionStore(
		options.client ?? (await getDefaultArtifactRetentionPrismaClient()),
	);
};

const resolveArtifactRetentionStorage = async (
	options: DeleteArtifactOptions,
): Promise<ArtifactRetentionStorage> => {
	return options.storage ?? environmentArtifactRetentionStorage();
};

const getDefaultArtifactRetentionPrismaClient =
	async (): Promise<ArtifactRetentionPrismaClient> => {
		const { prisma } = await import("../db/tenancy");
		return prisma as unknown as ArtifactRetentionPrismaClient;
	};

const environmentArtifactRetentionStorage = (): ArtifactRetentionStorage => {
	return {
		delete: async (storageKey) => {
			const { createStorageFromEnv } = await import("../storage");
			await createStorageFromEnv().delete(storageKey);
		},
	};
};

const toGeneratedArtifact = (row: GeneratedArtifactRow): GeneratedArtifact => {
	return {
		id: row.id,
		workflowType: row.workflowType,
		hiraCaseId: row.hiraCaseId,
		jhaCaseId: row.jhaCaseId,
		iiCaseId: row.iiCaseId,
		outputType: row.outputType,
		versionSeq: row.versionSeq,
		snapshotId: row.snapshotId,
		storageKey: row.storageKey,
		filename: row.filename,
		mimeType: row.mimeType,
		sizeBytes: row.sizeBytes === null ? null : BigInt(row.sizeBytes),
		generatedAt: row.generatedAt,
		generatedById: row.generatedById,
		source: row.source,
		isSnapshotLinked: row.isSnapshotLinked,
	};
};
