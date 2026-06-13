import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

		return nextResolve(specifier, context);
	},
});

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	test("membership invite integration", {
		skip: "DATABASE_URL is required",
	}, () => {});
} else {
	const {
		DevFileInvitationEmailTransport,
		INVITATION_EMAIL_MISMATCH_MESSAGE,
		PrismaInvitationStore,
		createInvitation,
		redeemInvitationToken,
	} = (await import(
		moduleUrl("src/lib/auth/invitations.ts")
	)) as typeof import("../../../src/lib/auth/invitations");
	const { removeMember } = (await import(
		moduleUrl("src/lib/auth/membership.ts")
	)) as typeof import("../../../src/lib/auth/membership");
	const { PrismaSessionStore, issueSession, validateSession } = (await import(
		moduleUrl("src/lib/auth/session.ts")
	)) as typeof import("../../../src/lib/auth/session");
	const { prisma } = (await import(
		moduleUrl("src/lib/db/index.ts")
	)) as typeof import("../../../src/lib/db");

	test("pending invite binds recipient email; redeem creates membership; removal revokes session", async () => {
		ensureMigrated();
		const tenant = await seedTenant("lifecycle");
		const invitationStore = new PrismaInvitationStore(prisma);
		const sessionStore = new PrismaSessionStore(prisma as PrismaClient);
		const logPath = join(tmpdir(), `ssfw-aea-${randomUUID()}.jsonl`);
		const recipientEmail = `ssfw-aea-recipient-${randomUUID()}@example.invalid`;
		const differentEmail = `ssfw-aea-different-${randomUUID()}@example.invalid`;

		try {
			await rm(logPath, { force: true });
			const created = await createInvitation({
				tenantId: tenant.tenantId,
				actorUserId: tenant.actorUserId,
				recipientEmail,
				baseUrl: "https://app.example.test",
				from: "no-reply@example.test",
				now: new Date("2026-05-05T09:00:00.000Z"),
				store: invitationStore,
				transport: new DevFileInvitationEmailTransport(logPath),
			});

			const pendingInvitation = await prisma.invitation.findUniqueOrThrow({
				where: { id: created.invitation.id },
				select: {
					recipientEmail: true,
					tenantId: true,
					consumedAt: true,
				},
			});
			assert.equal(pendingInvitation.recipientEmail, recipientEmail);
			assert.equal(pendingInvitation.tenantId, tenant.tenantId);
			assert.equal(pendingInvitation.consumedAt, null);
			assert.equal(
				await membershipCountForEmail(tenant.tenantId, recipientEmail),
				0,
			);
			assert.equal(await membershipCount(tenant.tenantId), 1);

			const differentUser = await prisma.user.create({
				data: {
					email: differentEmail,
					uiLocale: "en",
				},
				select: { id: true },
			});
			const mismatch = await redeemInvitationToken({
				token: created.token,
				userId: differentUser.id,
				now: new Date("2026-05-05T09:01:00.000Z"),
				store: invitationStore,
			});
			assert.deepEqual(mismatch, {
				ok: false,
				reason: "mismatch",
				message: INVITATION_EMAIL_MISMATCH_MESSAGE,
			});
			assert.equal(
				await membershipCountForEmail(tenant.tenantId, differentEmail),
				0,
			);
			assert.equal(
				(
					await prisma.invitation.findUniqueOrThrow({
						where: { id: created.invitation.id },
						select: { consumedAt: true },
					})
				).consumedAt,
				null,
			);

			const recipient = await prisma.user.create({
				data: {
					email: recipientEmail,
					uiLocale: "en",
				},
				select: { id: true },
			});
			const redeemed = await redeemInvitationToken({
				token: created.token,
				userId: recipient.id,
				now: new Date("2026-05-05T09:02:00.000Z"),
				store: invitationStore,
			});
			assert.equal(redeemed.ok, true);
			assert.equal(redeemed.ok ? redeemed.tenantId : "", tenant.tenantId);
			assert.equal(redeemed.ok ? redeemed.userId : "", recipient.id);
			const consumedInvitation = await prisma.invitation.findUniqueOrThrow({
				where: { id: created.invitation.id },
				select: { consumedAt: true },
			});
			assert.ok(consumedInvitation.consumedAt);
			assert.equal(
				await membershipCountForEmail(tenant.tenantId, recipientEmail),
				1,
			);
			assert.equal(await membershipCount(tenant.tenantId), 2);

			const issuedSession = await issueSession(
				recipient.id,
				tenant.tenantId,
				"desktop",
				{
					now: new Date("2026-05-05T09:03:00.000Z"),
					store: sessionStore,
				},
			);
			assert.equal(
				(
					await validateSession(issuedSession.cookieValue, {
						now: new Date("2026-05-05T09:04:00.000Z"),
						store: sessionStore,
					})
				)?.userId,
				recipient.id,
			);

			const removal = await removeMember(
				tenant.tenantId,
				recipient.id,
				tenant.actorUserId,
				{ db: prisma },
			);
			assert.deepEqual(removal, {
				deletedMemberships: 1,
				deletedSessions: 1,
				status: "removed",
			});
			assert.equal(
				await membershipCountForEmail(tenant.tenantId, recipientEmail),
				0,
			);
			assert.equal(await sessionCountForUser(tenant.tenantId, recipient.id), 0);
			assert.equal(
				await validateSession(issuedSession.cookieValue, {
					now: new Date("2026-05-05T09:05:00.000Z"),
					store: sessionStore,
				}),
				null,
			);
			console.log(
				`DB inspection membership invite lifecycle: recipient_memberships_before_redeem=0; mismatch_memberships=${await membershipCountForEmail(
					tenant.tenantId,
					differentEmail,
				)}; consumed_at=${consumedInvitation.consumedAt?.toISOString()}; removal_status=${
					removal.status
				}; recipient_sessions=${await sessionCountForUser(
					tenant.tenantId,
					recipient.id,
				)}`,
			);
		} finally {
			await cleanupTenant(tenant, [recipientEmail, differentEmail]);
			await rm(logPath, { force: true });
		}
	});

	test.after(async () => {
		await prisma.$disconnect();
	});

	async function seedTenant(label: string): Promise<SeededTenant> {
		const suffix = randomUUID();
		const tenantName = `ssfw-aea-${label}-${suffix}`;
		const actorEmail = `ssfw-aea-owner-${label}-${suffix}@example.invalid`;
		const tenant = await prisma.tenant.create({
			data: {
				defaultLanguage: "en",
				name: tenantName,
			},
			select: { id: true },
		});
		const actor = await prisma.user.create({
			data: {
				email: actorEmail,
				uiLocale: "en",
			},
			select: { id: true },
		});
		await prisma.tenantMembership.create({
			data: {
				tenantId: tenant.id,
				userId: actor.id,
			},
		});

		return {
			actorEmail,
			actorUserId: actor.id,
			tenantId: tenant.id,
			tenantName,
		};
	}

	async function cleanupTenant(
		tenant: SeededTenant,
		extraEmails: string[] = [],
	): Promise<void> {
		await prisma.invitation.deleteMany({ where: { tenantId: tenant.tenantId } });
		await prisma.tenantMembership.deleteMany({
			where: { tenantId: tenant.tenantId },
		});
		await prisma.session.deleteMany({ where: { tenantId: tenant.tenantId } });
		await prisma.tenant.deleteMany({ where: { id: tenant.tenantId } });
		await prisma.magicLinkToken.deleteMany({
			where: { email: { in: [tenant.actorEmail, ...extraEmails] } },
		});
		await prisma.user.deleteMany({
			where: { email: { in: [tenant.actorEmail, ...extraEmails] } },
		});
	}

	async function membershipCount(tenantId: string): Promise<number> {
		return prisma.tenantMembership.count({ where: { tenantId } });
	}

	async function membershipCountForEmail(
		tenantId: string,
		email: string,
	): Promise<number> {
		return prisma.tenantMembership.count({
			where: {
				tenantId,
				user: { email },
			},
		});
	}

	async function sessionCountForUser(
		tenantId: string,
		userId: string,
	): Promise<number> {
		return prisma.session.count({ where: { tenantId, userId } });
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

type SeededTenant = {
	actorEmail: string;
	actorUserId: string;
	tenantId: string;
	tenantName: string;
};

function moduleUrl(relativePath: string): string {
	return pathToFileURL(`${process.cwd()}/${relativePath}`).href;
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith(".") || specifier.startsWith("/");
}
