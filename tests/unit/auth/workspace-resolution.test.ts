import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (!context.parentURL || !isLocalImport(specifier)) {
			return nextResolve(specifier, context);
		}

		const candidates = [
			new URL(`${specifier}.ts`, context.parentURL),
			new URL(`${specifier}/index.ts`, context.parentURL),
		];
		const resolved = candidates.find((candidate) =>
			existsSync(fileURLToPath(candidate)),
		);

		if (resolved) {
			return {
				shortCircuit: true,
				url: resolved.href,
			};
		}

		return nextResolve(specifier, context);
	},
});

const workspaceResolutionModulePath =
	"../../../src/lib/auth/workspace-resolution.ts";
const { resolveOrCreateWorkspaceForEmail } = (await import(
	workspaceResolutionModulePath
)) as typeof import("../../../src/lib/auth/workspace-resolution");

test("company-domain creator gets the tenant; other same-domain users do not auto-join", async () => {
	const db = new MemoryWorkspaceDb();

	const first = await resolveOrCreateWorkspaceForEmail(
		{ email: "alice@acme.com" },
		{
			prisma: db.asPrisma(),
			provisionTenantSchema: db.provisionTenantSchema,
		},
	);
	const second = await resolveOrCreateWorkspaceForEmail(
		{ email: "bob@acme.com" },
		{
			prisma: db.asPrisma(),
			provisionTenantSchema: db.provisionTenantSchema,
		},
	);

	assert.equal(first.workspaceKind, "company");
	assert.equal(second.workspaceKind, "company");
	assert.equal(first.tenantId, second.tenantId);
	assert.equal(db.provisionedTenantIds.length, 1);
	assert.equal(db.domains.get("acme.com"), first.tenantId);
	// The creator is auto-joined.
	assert.equal(db.memberships.has(`${first.tenantId}:user-1`), true);
	// A different same-domain user without an invitation gets no membership.
	assert.equal(db.memberships.has(`${first.tenantId}:user-2`), false);
});

test("same-domain user with opt-in flag auto-joins", async () => {
	const db = new MemoryWorkspaceDb();

	const first = await resolveOrCreateWorkspaceForEmail(
		{ email: "alice@acme.com" },
		{
			prisma: db.asPrisma(),
			provisionTenantSchema: db.provisionTenantSchema,
		},
	);
	db.setDomainAutoJoinEnabled(first.tenantId, true);

	const second = await resolveOrCreateWorkspaceForEmail(
		{ email: "bob@acme.com" },
		{
			prisma: db.asPrisma(),
			provisionTenantSchema: db.provisionTenantSchema,
		},
	);

	assert.equal(first.tenantId, second.tenantId);
	assert.equal(db.memberships.has(`${first.tenantId}:user-2`), true);
});

test("same-domain user with a pending invitation joins and consumes it", async () => {
	const db = new MemoryWorkspaceDb();

	const first = await resolveOrCreateWorkspaceForEmail(
		{ email: "alice@acme.com" },
		{
			prisma: db.asPrisma(),
			provisionTenantSchema: db.provisionTenantSchema,
		},
	);
	db.addPendingInvitation(first.tenantId, "bob@acme.com");

	const second = await resolveOrCreateWorkspaceForEmail(
		{ email: "bob@acme.com" },
		{
			prisma: db.asPrisma(),
			provisionTenantSchema: db.provisionTenantSchema,
		},
	);

	assert.equal(first.tenantId, second.tenantId);
	assert.equal(db.memberships.has(`${first.tenantId}:user-2`), true);
	assert.equal(db.consumedInvitationCount, 1);
});

test("public-domain users get separate personal tenants", async () => {
	const db = new MemoryWorkspaceDb();

	const first = await resolveOrCreateWorkspaceForEmail(
		{ email: "alice@gmail.com" },
		{
			prisma: db.asPrisma(),
			provisionTenantSchema: db.provisionTenantSchema,
		},
	);
	const second = await resolveOrCreateWorkspaceForEmail(
		{ email: "bob@gmail.com" },
		{
			prisma: db.asPrisma(),
			provisionTenantSchema: db.provisionTenantSchema,
		},
	);

	assert.equal(first.workspaceKind, "personal");
	assert.equal(second.workspaceKind, "personal");
	assert.notEqual(first.tenantId, second.tenantId);
	assert.equal(db.provisionedTenantIds.length, 2);
	assert.equal(db.domains.size, 0);
});

test("same public-domain user reuses their personal tenant", async () => {
	const db = new MemoryWorkspaceDb();

	const first = await resolveOrCreateWorkspaceForEmail(
		{ email: "alice+beta@gmail.com" },
		{
			prisma: db.asPrisma(),
			provisionTenantSchema: db.provisionTenantSchema,
		},
	);
	const second = await resolveOrCreateWorkspaceForEmail(
		{ email: "ALICE+BETA@GMAIL.COM" },
		{
			prisma: db.asPrisma(),
			provisionTenantSchema: db.provisionTenantSchema,
		},
	);

	assert.equal(first.tenantId, second.tenantId);
	assert.equal(first.createdTenant, true);
	assert.equal(second.createdTenant, false);
	assert.equal(db.provisionedTenantIds.length, 1);
});

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}

class MemoryWorkspaceDb {
	private userSequence = 0;
	private tenantSequence = 0;
	readonly users = new Map<string, { id: string; email: string }>();
	readonly tenants = new Map<
		string,
		{
			id: string;
			name: string;
			workspaceKind: string;
			createdByUserId: string | null;
			domainAutoJoinEnabled: boolean;
		}
	>();
	readonly domains = new Map<string, string>();
	readonly memberships = new Set<string>();
	readonly provisionedTenantIds: string[] = [];
	readonly invitations = new Map<
		string,
		{ id: string; tenantId: string; recipientEmail: string; consumedAt: Date | null }
	>();
	consumedInvitationCount = 0;
	private invitationSequence = 0;

	readonly provisionTenantSchema = async (tenantId: string): Promise<void> => {
		this.provisionedTenantIds.push(tenantId);
	};

	setDomainAutoJoinEnabled(tenantId: string, enabled: boolean): void {
		const tenant = this.tenants.get(tenantId);
		if (tenant) {
			tenant.domainAutoJoinEnabled = enabled;
		}
	}

	addPendingInvitation(tenantId: string, recipientEmail: string): void {
		const id = `invitation-${++this.invitationSequence}`;
		this.invitations.set(id, {
			id,
			tenantId,
			recipientEmail,
			consumedAt: null,
		});
	}

	asPrisma() {
		return {
			$transaction: async <T>(callback: (tx: unknown) => Promise<T>) =>
				callback(this.tx()),
		} as never;
	}

	private tx() {
		return {
			$queryRaw: async (
				_strings: TemplateStringsArray,
				tenantId: string,
				recipientEmail: string,
			) => {
				const match = [...this.invitations.values()].find(
					(invitation) =>
						invitation.tenantId === tenantId &&
						invitation.recipientEmail === recipientEmail &&
						invitation.consumedAt === null,
				);
				return match ? [{ id: match.id }] : [];
			},
			user: {
				upsert: async ({
					create,
					where,
				}: {
					create: { email: string };
					where: { email: string };
				}) => {
					const existing = this.users.get(where.email);
					if (existing) {
						return existing;
					}

					const user = {
						id: `user-${++this.userSequence}`,
						email: create.email,
					};
					this.users.set(user.email, user);
					return user;
				},
			},
			tenant: {
				findFirst: async ({
					where,
				}: {
					where: { createdByUserId: string; workspaceKind: string };
				}) => {
					for (const tenant of this.tenants.values()) {
						if (
							tenant.createdByUserId === where.createdByUserId &&
							tenant.workspaceKind === where.workspaceKind
						) {
							return { id: tenant.id };
						}
					}

					return null;
				},
				create: async ({
					data,
				}: {
					data: {
						name: string;
						workspaceKind: string;
						createdByUserId: string;
					};
				}) => {
					const tenant = {
						id: `tenant-${++this.tenantSequence}`,
						name: data.name,
						workspaceKind: data.workspaceKind,
						createdByUserId: data.createdByUserId,
						domainAutoJoinEnabled: false,
					};
					this.tenants.set(tenant.id, tenant);
					return tenant;
				},
			},
			tenantDomain: {
				findUnique: async ({ where }: { where: { domain: string } }) => {
					const tenantId = this.domains.get(where.domain);
					if (!tenantId) {
						return null;
					}

					const tenant = this.tenants.get(tenantId);
					return {
						tenantId,
						tenant: {
							createdByUserId: tenant?.createdByUserId ?? null,
							domainAutoJoinEnabled: tenant?.domainAutoJoinEnabled ?? false,
						},
					};
				},
				create: async ({
					data,
				}: {
					data: { tenantId: string; domain: string };
				}) => {
					this.domains.set(data.domain, data.tenantId);
					return data;
				},
			},
			tenantMembership: {
				upsert: async ({
					create,
				}: {
					create: { tenantId: string; userId: string };
				}) => {
					this.memberships.add(`${create.tenantId}:${create.userId}`);
					return create;
				},
			},
			invitation: {
				update: async ({
					where,
					data,
				}: {
					where: { id: string };
					data: { consumedAt: Date };
				}) => {
					const invitation = this.invitations.get(where.id);
					if (invitation) {
						invitation.consumedAt = data.consumedAt;
						this.consumedInvitationCount += 1;
					}
					return invitation;
				},
			},
		};
	}
}
