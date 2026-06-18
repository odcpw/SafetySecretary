import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import type { PrismaClient } from "@prisma/client";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (!context.parentURL || !isLocalImport(specifier)) {
			return nextResolve(specifier, context);
		}

		const candidates = [
			new URL(`${specifier}.ts`, context.parentURL),
			new URL(`${specifier}/index.ts`, context.parentURL),
		];
		const resolved = candidates.find((candidate) => existsSync(candidate));

		if (resolved) {
			return {
				shortCircuit: true,
				url: resolved.href,
			};
		}

		return nextResolve(specifier, context);
	},
});

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	test("OAuth identity integration", {
		skip: "DATABASE_URL is required",
	}, () => {});
} else {
	const { prisma, dropTenantSchema } = (await import(
		moduleUrl("src/lib/db/index.ts")
	)) as typeof import("../../../src/lib/db");
	const {
		OAuthIdentityConflictError,
		resolveOrCreateWorkspaceForOAuthIdentity,
	} = (await import(
		moduleUrl("src/lib/auth/oauth-identity.ts")
	)) as typeof import("../../../src/lib/auth/oauth-identity");

	test("OAuth identity provisions and reuses a provider subject", async () => {
		ensureMigrated();

		const suffix = randomUUID();
		const email = `alice@ssfw-oauth-${suffix}.example.invalid`;
		const subject = `google-subject-${suffix}`;
		const tenantIds = new Set<string>();
		let userId: string | undefined;

		try {
			const first = await resolveOrCreateWorkspaceForOAuthIdentity({
				defaultLanguage: "de",
				email,
				issuer: "https://accounts.google.com",
				provider: "google",
				subject,
			});
			tenantIds.add(first.tenantId);
			userId = first.userId;

			const identity = await prisma.oAuthIdentity.findUniqueOrThrow({
				where: {
					provider_providerSubject: {
						provider: "google",
						providerSubject: subject,
					},
				},
			});
			assert.equal(identity.userId, first.userId);
			assert.equal(identity.email, email);

			const second = await resolveOrCreateWorkspaceForOAuthIdentity({
				defaultLanguage: "fr",
				email,
				issuer: "https://accounts.google.com",
				provider: "google",
				subject,
			});
			tenantIds.add(second.tenantId);

			assert.equal(second.userId, first.userId);
			assert.equal(second.tenantId, first.tenantId);
			assert.equal(second.createdTenant, false);
		} finally {
			await cleanupOAuthRows(
				prisma,
				dropTenantSchema,
				[email],
				tenantIds,
				userId ? [userId] : [],
			);
		}
	});

	test("OAuth identity rejects rebinding a provider subject to another email", async () => {
		ensureMigrated();

		const suffix = randomUUID();
		const originalEmail = `alice@ssfw-oauth-conflict-${suffix}.example.invalid`;
		const attackerEmail = `bob@ssfw-oauth-conflict-${suffix}.example.invalid`;
		const subject = `microsoft-subject-${suffix}`;
		const tenantIds = new Set<string>();
		const userIds = new Set<string>();

		try {
			const first = await resolveOrCreateWorkspaceForOAuthIdentity({
				defaultLanguage: "en",
				email: originalEmail,
				issuer: "https://login.microsoftonline.com/common/v2.0",
				provider: "microsoft",
				subject,
			});
			tenantIds.add(first.tenantId);
			userIds.add(first.userId);

			await assert.rejects(
				() =>
					resolveOrCreateWorkspaceForOAuthIdentity({
						defaultLanguage: "en",
						email: attackerEmail,
						issuer: "https://login.microsoftonline.com/common/v2.0",
						provider: "microsoft",
						subject,
					}),
				OAuthIdentityConflictError,
			);

			const identities = await prisma.oAuthIdentity.findMany({
				where: { provider: "microsoft", providerSubject: subject },
				select: { email: true, userId: true },
			});
			assert.deepEqual(identities, [
				{ email: originalEmail, userId: first.userId },
			]);

			const attackerUser = await prisma.user.findUnique({
				where: { email: attackerEmail },
			});
			assert.equal(attackerUser, null);
		} finally {
			await cleanupOAuthRows(
				prisma,
				dropTenantSchema,
				[originalEmail, attackerEmail],
				tenantIds,
				[...userIds],
			);
		}
	});

	test("OAuth workspace resolution keeps public domains personal and does not auto-join same-domain company colleagues", async () => {
		ensureMigrated();

		const suffix = randomUUID();
		const personalAEmail = `ssfw-oauth-personal-a-${suffix}@outlook.com`;
		const personalBEmail = `ssfw-oauth-personal-b-${suffix}@outlook.com`;
		const companyDomain = `ssfw-oauth-${suffix}.example.invalid`;
		const companyAEmail = `alice@${companyDomain}`;
		const companyBEmail = `bob@${companyDomain}`;
		const emails = [
			personalAEmail,
			personalBEmail,
			companyAEmail,
			companyBEmail,
		];
		const tenantIds = new Set<string>();
		const userIds = new Set<string>();

		try {
			const personalA = await resolveForTest("microsoft", personalAEmail, suffix);
			const personalB = await resolveForTest("microsoft", personalBEmail, suffix);
			const companyA = await resolveForTest("google", companyAEmail, suffix);
			const companyB = await resolveForTest("google", companyBEmail, suffix);

			for (const result of [personalA, personalB, companyA, companyB]) {
				tenantIds.add(result.tenantId);
				userIds.add(result.userId);
			}

			assert.notEqual(personalA.tenantId, personalB.tenantId);
			assert.equal(companyA.tenantId, companyB.tenantId);
			assert.notEqual(personalA.tenantId, companyA.tenantId);

			const companyTenant = await prisma.tenant.findUniqueOrThrow({
				where: { id: companyA.tenantId },
				select: {
					memberships: {
						orderBy: { createdAt: "asc" },
						select: { userId: true },
					},
				},
			});
			assert.deepEqual(
				companyTenant.memberships.map((membership) => membership.userId),
				[companyA.userId],
			);

			const colleagueIdentity = await prisma.oAuthIdentity.findUnique({
				where: {
					provider_providerSubject: {
						provider: "google",
						providerSubject: `google-${companyBEmail}-${suffix}`,
					},
				},
				select: { userId: true },
			});
			assert.equal(colleagueIdentity, null);
		} finally {
			await cleanupOAuthRows(prisma, dropTenantSchema, emails, tenantIds, [
				...userIds,
			]);
		}
	});

	test.after(async () => {
		await prisma.$disconnect();
	});

	async function resolveForTest(
		provider: "google" | "microsoft",
		email: string,
		suffix: string,
	) {
		return resolveOrCreateWorkspaceForOAuthIdentity({
			defaultLanguage: "en",
			email,
			issuer:
				provider === "google"
					? "https://accounts.google.com"
					: "https://login.microsoftonline.com/common/v2.0",
			provider,
			subject: `${provider}-${email}-${suffix}`,
		});
	}
}

let migrated = false;

function ensureMigrated(): void {
	if (migrated) {
		return;
	}

	const result = spawnSync("pnpm", ["db:migrate"], {
		cwd: process.cwd(),
		encoding: "utf8",
		env: { ...process.env, DATABASE_URL: databaseUrl },
	});

	assert.equal(
		result.status,
		0,
		`pnpm db:migrate failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
	);
	migrated = true;
}

async function cleanupOAuthRows(
	prismaClient: PrismaClient,
	dropTenantSchemaFn: typeof import("../../../src/lib/db")["dropTenantSchema"],
	emails: string[],
	tenantIds: Set<string>,
	userIds: string[],
): Promise<void> {
	await prismaClient.oAuthIdentity.deleteMany({
		where: { email: { in: emails } },
	});

	for (const tenantId of tenantIds) {
		await dropTenantSchemaFn(tenantId, prismaClient).catch(() => undefined);
	}

	await prismaClient.tenantMembership.deleteMany({
		where: { tenantId: { in: [...tenantIds] } },
	});
	await prismaClient.session.deleteMany({
		where: { tenantId: { in: [...tenantIds] } },
	});
	await prismaClient.tenant.deleteMany({
		where: { id: { in: [...tenantIds] } },
	});
	await prismaClient.user.deleteMany({
		where: {
			OR: [{ id: { in: userIds } }, { email: { in: emails } }],
		},
	});
}

function moduleUrl(relativePath: string): string {
	return pathToFileURL(`${process.cwd()}/${relativePath}`).href;
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}
