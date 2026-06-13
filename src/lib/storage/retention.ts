export type SnapshotAttachmentReferenceStore = {
	isKeyReferencedBySnapshot(key: string): Promise<boolean>;
};

export type SnapshotAttachmentReferenceOptions = {
	readonly client?: SnapshotAttachmentReferencePrismaClient;
	readonly store?: SnapshotAttachmentReferenceStore;
	readonly tenantId?: string;
};

export type SnapshotAttachmentReferencePrismaClient = {
	$queryRaw<T = unknown>(
		strings: TemplateStringsArray,
		...values: unknown[]
	): Promise<T>;
};

type SnapshotAttachmentReferenceRow = {
	referenced: boolean;
};

export async function isKeyReferencedBySnapshot(
	key: string,
	options: SnapshotAttachmentReferenceOptions = {},
): Promise<boolean> {
	const store = await resolveSnapshotAttachmentReferenceStore(options);
	return store.isKeyReferencedBySnapshot(key);
}

class PrismaSnapshotAttachmentReferenceStore
	implements SnapshotAttachmentReferenceStore
{
	private readonly client: SnapshotAttachmentReferencePrismaClient;

	constructor(client: SnapshotAttachmentReferencePrismaClient) {
		this.client = client;
	}

	async isKeyReferencedBySnapshot(key: string): Promise<boolean> {
		const rows = await this.client.$queryRaw<SnapshotAttachmentReferenceRow[]>`
			SELECT EXISTS (
				SELECT 1
				FROM approval_snapshot snapshot,
					jsonb_array_elements(snapshot.attachment_refs) AS attachment_ref
				WHERE attachment_ref ->> 'storageKey' = ${key}
			) AS referenced
		`;

		return Boolean(rows[0]?.referenced);
	}
}

function tenantSnapshotAttachmentReferenceStore(
	tenantId: string,
): SnapshotAttachmentReferenceStore {
	return {
		isKeyReferencedBySnapshot: async (key) => {
			const { withTenantConnection } = await import("../db/tenancy");
			return withTenantConnection(tenantId, (tx) =>
				new PrismaSnapshotAttachmentReferenceStore(
					tx as SnapshotAttachmentReferencePrismaClient,
				).isKeyReferencedBySnapshot(key),
			);
		},
	};
}

async function resolveSnapshotAttachmentReferenceStore(
	options: SnapshotAttachmentReferenceOptions,
): Promise<SnapshotAttachmentReferenceStore> {
	if (options.store) {
		return options.store;
	}

	if (options.tenantId) {
		return tenantSnapshotAttachmentReferenceStore(options.tenantId);
	}

	return new PrismaSnapshotAttachmentReferenceStore(
		options.client ??
			(await getDefaultSnapshotAttachmentReferencePrismaClient()),
	);
}

async function getDefaultSnapshotAttachmentReferencePrismaClient(): Promise<SnapshotAttachmentReferencePrismaClient> {
	const { prisma } = await import("../db/tenancy");
	return prisma as unknown as SnapshotAttachmentReferencePrismaClient;
}
