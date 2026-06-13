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

test("company-domain users converge on one tenant", async () => {
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
	assert.equal(db.memberships.has(`${first.tenantId}:user-1`), true);
	assert.equal(db.memberships.has(`${first.tenantId}:user-2`), true);
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
		}
	>();
	readonly domains = new Map<string, string>();
	readonly memberships = new Set<string>();
	readonly provisionedTenantIds: string[] = [];

	readonly provisionTenantSchema = async (tenantId: string): Promise<void> => {
		this.provisionedTenantIds.push(tenantId);
	};

	asPrisma() {
		return {
			$transaction: async <T>(callback: (tx: unknown) => Promise<T>) =>
				callback(this.tx()),
		} as never;
	}

	private tx() {
		return {
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
					};
					this.tenants.set(tenant.id, tenant);
					return tenant;
				},
			},
			tenantDomain: {
				findUnique: async ({ where }: { where: { domain: string } }) => {
					const tenantId = this.domains.get(where.domain);
					return tenantId ? { tenantId } : null;
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
		};
	}
}
