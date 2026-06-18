import type { Prisma, PrismaClient } from "@prisma/client";

export const LAST_MEMBER_MESSAGE =
	"Cannot remove the last member. Delete the company workspace instead.";

class LastMemberRemovalError extends Error {
	constructor() {
		super(LAST_MEMBER_MESSAGE);
		this.name = "LastMemberRemovalError";
	}
}

export type RemoveMemberStatus =
	| "removed"
	| "actor_not_member"
	| "target_not_member"
	| "last_member";

export type RemoveMemberResult = {
	deletedMemberships: number;
	deletedSessions: number;
	status: RemoveMemberStatus;
};

type CountResult = {
	count: number;
};

type MembershipTransactionClient = {
	$queryRaw<T = unknown>(
		query: TemplateStringsArray,
		...values: unknown[]
	): Promise<T>;
	tenantMembership: {
		deleteMany(args: {
			where: { tenantId: string; userId: string };
		}): Promise<CountResult>;
	};
	session: {
		deleteMany(args: {
			where: { tenantId: string; userId: string };
		}): Promise<CountResult>;
	};
};

type MembershipDatabase = {
	$transaction<T>(
		fn: (tx: MembershipTransactionClient) => Promise<T>,
		options?: MembershipTransactionOptions,
	): Promise<T>;
};

type LockedMembershipRow = {
	userId: string;
};

export type RemoveMemberOptions = {
	db?: MembershipDatabase | PrismaClient;
	transactionOptions?: MembershipTransactionOptions;
};

export type TenantMembershipLookupOptions = {
	db?: PrismaClient;
};

type MembershipTransactionOptions = {
	isolationLevel?: Prisma.TransactionIsolationLevel;
	maxWait?: number;
	timeout?: number;
};

export async function removeMember(
	tenantId: string,
	targetUserId: string,
	actorUserId: string,
	options: RemoveMemberOptions = {},
): Promise<RemoveMemberResult> {
	const db = (options.db ??
		(await defaultMembershipDatabase())) as MembershipDatabase;

	try {
		return await db.$transaction(async (tx) => {
			const lockedMemberships = await tx.$queryRaw<LockedMembershipRow[]>`
				SELECT user_id::text AS "userId"
				FROM shared.tenant_memberships
				WHERE tenant_id = ${tenantId}::uuid
				FOR UPDATE
			`;
			const memberIds = new Set(
				lockedMemberships.map((membership) => membership.userId.toLowerCase()),
			);
			const normalizedActorUserId = actorUserId.toLowerCase();
			const normalizedTargetUserId = targetUserId.toLowerCase();

			if (memberIds.size <= 1) {
				throw new LastMemberRemovalError();
			}

			if (!memberIds.has(normalizedActorUserId)) {
				return {
					deletedMemberships: 0,
					deletedSessions: 0,
					status: "actor_not_member",
				};
			}

			if (!memberIds.has(normalizedTargetUserId)) {
				return {
					deletedMemberships: 0,
					deletedSessions: 0,
					status: "target_not_member",
				};
			}

			const deletedMemberships = await tx.tenantMembership.deleteMany({
				where: {
					tenantId,
					userId: targetUserId,
				},
			});
			const deletedSessions = await tx.session.deleteMany({
				where: {
					tenantId,
					userId: targetUserId,
				},
			});

			return {
				deletedMemberships: deletedMemberships.count,
				deletedSessions: deletedSessions.count,
				status: "removed",
			};
		}, options.transactionOptions);
	} catch (error) {
		if (error instanceof LastMemberRemovalError) {
			return {
				deletedMemberships: 0,
				deletedSessions: 0,
				status: "last_member",
			};
		}

		throw error;
	}
}

export async function hasActiveTenantMembership(
	tenantId: string,
	userId: string,
	options: TenantMembershipLookupOptions = {},
): Promise<boolean> {
	const db = options.db ?? (await defaultMembershipDatabase());
	const membership = await db.tenantMembership.findUnique({
		where: {
			tenantId_userId: {
				tenantId,
				userId,
			},
		},
		select: { id: true },
	});

	return membership !== null;
}

async function defaultMembershipDatabase(): Promise<PrismaClient> {
	const { prisma } = await import("../db");
	return prisma;
}
