import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import type {
	LAST_MEMBER_MESSAGE as lastMemberMessageType,
	removeMember as removeMemberType,
} from "../../../src/lib/auth/membership";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (
			specifier === "../db" &&
			context.parentURL?.endsWith("/src/lib/auth/membership.ts")
		) {
			return localModuleUrl("src/lib/db/index.ts");
		}

		if (context.parentURL && specifier.startsWith(".")) {
			const candidates = [
				new URL(`${specifier}.ts`, context.parentURL),
				new URL(`${specifier}.tsx`, context.parentURL),
				new URL(`${specifier}/index.ts`, context.parentURL),
			];
			const resolved = candidates.find((candidate) => existsSync(candidate));

			if (resolved) {
				return {
					shortCircuit: true,
					url: resolved.href,
				};
			}
		}

		return nextResolve(specifier, context);
	},
});

const membershipModulePath = pathToFileURL(
	path.resolve("src/lib/auth/membership.ts"),
).href;
const { LAST_MEMBER_MESSAGE, removeMember } = (await import(
	membershipModulePath
)) as {
	LAST_MEMBER_MESSAGE: typeof lastMemberMessageType;
	removeMember: typeof removeMemberType;
};

function localModuleUrl(relativePath: string) {
	return {
		shortCircuit: true,
		url: pathToFileURL(path.resolve(relativePath)).href,
	};
}

type MembershipRow = {
	tenantId: string;
	userId: string;
};

type SessionRow = {
	tenantId: string;
	userId: string;
};

class MemoryMembershipDb {
	readonly lockQueries: string[] = [];
	readonly memberships: MembershipRow[];
	readonly sessions: SessionRow[];

	constructor(input: { memberships: MembershipRow[]; sessions: SessionRow[] }) {
		this.memberships = [...input.memberships];
		this.sessions = [...input.sessions];
	}

	async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
		return fn({
			$queryRaw: async (
				query: TemplateStringsArray,
				tenantId: string,
			): Promise<Array<{ userId: string }>> => {
				this.lockQueries.push(query.join("?"));
				return this.memberships
					.filter((membership) => membership.tenantId === tenantId)
					.map((membership) => ({ userId: membership.userId }));
			},
			session: {
				deleteMany: async ({
					where,
				}: {
					where: { tenantId: string; userId: string };
				}) => {
					const before = this.sessions.length;
					removeMatching(this.sessions, where);
					return { count: before - this.sessions.length };
				},
			},
			tenantMembership: {
				deleteMany: async ({
					where,
				}: {
					where: { tenantId: string; userId: string };
				}) => {
					const before = this.memberships.length;
					removeMatching(this.memberships, where);
					return { count: before - this.memberships.length };
				},
			},
		});
	}
}

test("removeMember locks tenant memberships, deletes membership, and invalidates only current-tenant sessions", async () => {
	const db = new MemoryMembershipDb({
		memberships: [
			{ tenantId: "tenant-a", userId: "user-a" },
			{ tenantId: "tenant-a", userId: "user-b" },
			{ tenantId: "tenant-b", userId: "user-b" },
		],
		sessions: [
			{ tenantId: "tenant-a", userId: "user-a" },
			{ tenantId: "tenant-a", userId: "user-b" },
			{ tenantId: "tenant-a", userId: "user-b" },
			{ tenantId: "tenant-b", userId: "user-b" },
		],
	});

	const result = await removeMember("tenant-a", "user-b", "user-a", {
		db: db as never,
	});

	assert.deepEqual(result, {
		deletedMemberships: 1,
		deletedSessions: 2,
		status: "removed",
	});
	assert.match(db.lockQueries[0] ?? "", /FOR UPDATE/);
	assert.deepEqual(db.memberships, [
		{ tenantId: "tenant-a", userId: "user-a" },
		{ tenantId: "tenant-b", userId: "user-b" },
	]);
	assert.deepEqual(db.sessions, [
		{ tenantId: "tenant-a", userId: "user-a" },
		{ tenantId: "tenant-b", userId: "user-b" },
	]);
});

test("removeMember allows self-removal and invalidates the actor's current-tenant sessions", async () => {
	const db = new MemoryMembershipDb({
		memberships: [
			{ tenantId: "tenant-a", userId: "user-a" },
			{ tenantId: "tenant-a", userId: "user-b" },
		],
		sessions: [
			{ tenantId: "tenant-a", userId: "user-a" },
			{ tenantId: "tenant-a", userId: "user-b" },
		],
	});

	const result = await removeMember("tenant-a", "user-a", "user-a", {
		db: db as never,
	});

	assert.equal(result.status, "removed");
	assert.equal(result.deletedMemberships, 1);
	assert.equal(result.deletedSessions, 1);
	assert.deepEqual(db.memberships, [
		{ tenantId: "tenant-a", userId: "user-b" },
	]);
	assert.deepEqual(db.sessions, [{ tenantId: "tenant-a", userId: "user-b" }]);
});

test("removeMember blocks removal that would empty the tenant", async () => {
	const db = new MemoryMembershipDb({
		memberships: [{ tenantId: "tenant-a", userId: "user-a" }],
		sessions: [{ tenantId: "tenant-a", userId: "user-a" }],
	});

	const result = await removeMember("tenant-a", "user-a", "user-a", {
		db: db as never,
	});

	assert.equal(
		LAST_MEMBER_MESSAGE,
		"Cannot remove the last member. Delete the company workspace instead.",
	);
	assert.deepEqual(result, {
		deletedMemberships: 0,
		deletedSessions: 0,
		status: "last_member",
	});
	assert.deepEqual(db.memberships, [
		{ tenantId: "tenant-a", userId: "user-a" },
	]);
	assert.deepEqual(db.sessions, [{ tenantId: "tenant-a", userId: "user-a" }]);
});

test("removeMember rejects non-member actors without deleting rows", async () => {
	const db = new MemoryMembershipDb({
		memberships: [
			{ tenantId: "tenant-a", userId: "user-b" },
			{ tenantId: "tenant-a", userId: "user-c" },
		],
		sessions: [{ tenantId: "tenant-a", userId: "user-b" }],
	});

	const result = await removeMember("tenant-a", "user-b", "user-a", {
		db: db as never,
	});

	assert.deepEqual(result, {
		deletedMemberships: 0,
		deletedSessions: 0,
		status: "actor_not_member",
	});
	assert.deepEqual(db.memberships, [
		{ tenantId: "tenant-a", userId: "user-b" },
		{ tenantId: "tenant-a", userId: "user-c" },
	]);
	assert.deepEqual(db.sessions, [{ tenantId: "tenant-a", userId: "user-b" }]);
});

test("removeMember rejects absent target members without deleting rows", async () => {
	const db = new MemoryMembershipDb({
		memberships: [
			{ tenantId: "tenant-a", userId: "user-a" },
			{ tenantId: "tenant-a", userId: "user-b" },
		],
		sessions: [{ tenantId: "tenant-a", userId: "user-c" }],
	});

	const result = await removeMember("tenant-a", "user-c", "user-a", {
		db: db as never,
	});

	assert.deepEqual(result, {
		deletedMemberships: 0,
		deletedSessions: 0,
		status: "target_not_member",
	});
	assert.deepEqual(db.memberships, [
		{ tenantId: "tenant-a", userId: "user-a" },
		{ tenantId: "tenant-a", userId: "user-b" },
	]);
	assert.deepEqual(db.sessions, [{ tenantId: "tenant-a", userId: "user-c" }]);
});

function removeMatching<T extends { tenantId: string; userId: string }>(
	rows: T[],
	where: { tenantId: string; userId: string },
): void {
	for (let index = rows.length - 1; index >= 0; index -= 1) {
		const row = rows[index];

		if (row?.tenantId === where.tenantId && row.userId === where.userId) {
			rows.splice(index, 1);
		}
	}
}
