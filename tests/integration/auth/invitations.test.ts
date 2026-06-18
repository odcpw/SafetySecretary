import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

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

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	test("invite flow integration", { skip: "DATABASE_URL is required" }, () => {});
} else {
	const {
		DevFileInvitationEmailTransport,
		INVITATION_ALREADY_USED_MESSAGE,
		INVITATION_EMAIL_MISMATCH_MESSAGE,
		INVITATION_EXPIRED_MESSAGE,
		PrismaInvitationStore,
		createInvitation,
		listInvitations,
		redeemInvitationToken,
		requestInvitationMagicLink,
	} = (await import(
		moduleUrl("src/lib/auth/invitations.ts")
	)) as typeof import("../../../src/lib/auth/invitations");
	const { PrismaMagicLinkStore, consumeMagicLinkToken } = (await import(
		moduleUrl("src/lib/auth/magic-link.ts")
	)) as typeof import("../../../src/lib/auth/magic-link");
	const { DevFileEmailTransport } = (await import(
		moduleUrl("src/lib/email/transport.ts")
	)) as typeof import("../../../src/lib/email/transport");
	const { prisma } = (await import(
		moduleUrl("src/lib/db/index.ts")
	)) as typeof import("../../../src/lib/db");

	test("happy path issues invite email and magic link, then consumes invitation once", async () => {
		ensureMigrated();
		const tenant = await seedTenant("happy");
		const logPath = join(tmpdir(), `ssfw-4gl-${randomUUID()}.jsonl`);
		const store = new PrismaInvitationStore(prisma);
		const recipientEmail = `ssfw-4gl-bob-${randomUUID()}@example.invalid`;

		try {
			await rm(logPath, { force: true });
			const created = await createInvitation({
				tenantId: tenant.tenantId,
				actorUserId: tenant.actorUserId,
				recipientEmail,
				baseUrl: "https://app.example.test",
				from: "no-reply@example.test",
				now: new Date("2026-05-05T08:00:00.000Z"),
				store,
				transport: new DevFileInvitationEmailTransport(logPath),
			});
			const invitePayload = (await readJsonl(logPath))[0];

			assert.equal(invitePayload.kind, "invitation");
			assert.equal(invitePayload.to, recipientEmail);
			assert.equal(invitePayload.tenantName, tenant.tenantName);

			const before = await prisma.invitation.findUniqueOrThrow({
				where: { id: created.invitation.id },
				select: {
					recipientEmail: true,
					tenantId: true,
					expiresAt: true,
					consumedAt: true,
				},
			});
			assert.equal(before.recipientEmail, recipientEmail);
			assert.equal(before.tenantId, tenant.tenantId);
			assert.equal(before.consumedAt, null);
			console.log(
				`DB inspection invitation before redemption: recipient_email=${before.recipientEmail}; tenant_id=${before.tenantId}; expires_at=${before.expiresAt.toISOString()}; consumed_at=${before.consumedAt}`,
			);
			console.log(`Invite email payload: ${JSON.stringify(invitePayload)}`);

			assert.equal(
				await prisma.user.findUnique({
					where: { email: recipientEmail },
					select: { id: true },
				}),
				null,
			);
			assert.equal(
				await membershipCountForEmail(tenant.tenantId, recipientEmail),
				0,
			);

			await requestInvitationMagicLink({
				token: created.token,
				baseUrl: "https://app.example.test",
				from: "no-reply@example.test",
				now: new Date("2026-05-05T08:01:00.000Z"),
				store,
				magicLinkTransport: new DevFileEmailTransport(logPath),
			});

			const payloads = await readJsonl(logPath);
			const magicPayload = payloads.find(
				(payload) => payload.kind === "magic-link",
			);
			assert.equal(magicPayload?.to, recipientEmail);
			assert.match(String(magicPayload?.magicLinkUrl), /token=/);
			console.log(`Magic-link email payload: ${JSON.stringify(magicPayload)}`);

			const recipient = await prisma.user.findUniqueOrThrow({
				where: { email: recipientEmail },
				select: { id: true },
			});
			const membershipBeforeRedeem = await prisma.tenantMembership.count({
				where: { tenantId: tenant.tenantId, userId: recipient.id },
			});
			const pendingBeforeRedeem = await prisma.invitation.findUniqueOrThrow({
				where: { id: created.invitation.id },
				select: { consumedAt: true },
			});
			assert.equal(membershipBeforeRedeem, 0);
			assert.equal(pendingBeforeRedeem.consumedAt, null);
			console.log(
				`DB inspection before invite redeem: recipient_user=${recipient.id}; consumed_at=${pendingBeforeRedeem.consumedAt}; recipient_memberships=${membershipBeforeRedeem}`,
			);

			const redeemed = await redeemInvitationToken({
				token: created.token,
				userId: recipient.id,
				now: new Date("2026-05-05T08:02:00.000Z"),
				store,
			});
			assert.equal(redeemed.ok, true);

			const after = await prisma.invitation.findUniqueOrThrow({
				where: { id: created.invitation.id },
				select: { consumedAt: true },
			});
			const membershipCount = await prisma.tenantMembership.count({
				where: { tenantId: tenant.tenantId, userId: recipient.id },
			});
			assert.ok(after.consumedAt);
			assert.equal(membershipCount, 1);
			console.log(
				`DB inspection invitation after redemption: consumed_at=${after.consumedAt?.toISOString()}; recipient_memberships=${membershipCount}`,
			);

			const replay = await redeemInvitationToken({
				token: created.token,
				userId: recipient.id,
				now: new Date("2026-05-05T08:03:00.000Z"),
				store,
			});
			assert.deepEqual(replay, {
				ok: false,
				reason: "used",
				message: INVITATION_ALREADY_USED_MESSAGE,
			});
			assert.equal(
				await prisma.tenantMembership.count({
					where: { tenantId: tenant.tenantId, userId: recipient.id },
				}),
				1,
			);
		} finally {
			await cleanupTenant(tenant, [recipientEmail]);
			await rm(logPath, { force: true });
		}
	});

	test("targeted invite magic link accepts the pending invitation", async () => {
		ensureMigrated();
		const tenant = await seedTenant("magic");
		const logPath = join(tmpdir(), `ssfw-4gl-${randomUUID()}.jsonl`);
		const store = new PrismaInvitationStore(prisma);
		const recipientEmail = `ssfw-4gl-magic-${randomUUID()}@example.invalid`;

		try {
			await rm(logPath, { force: true });
			const created = await createInvitation({
				tenantId: tenant.tenantId,
				actorUserId: tenant.actorUserId,
				recipientEmail,
				baseUrl: "https://app.example.test",
				from: "no-reply@example.test",
				now: new Date("2026-05-05T08:00:00.000Z"),
				store,
				transport: new DevFileInvitationEmailTransport(logPath),
			});

			await requestInvitationMagicLink({
				token: created.token,
				baseUrl: "https://app.example.test",
				from: "no-reply@example.test",
				now: new Date("2026-05-05T08:01:00.000Z"),
				store,
				magicLinkTransport: new DevFileEmailTransport(logPath),
			});

			const payloads = await readJsonl(logPath);
			const magicPayload = payloads.find(
				(payload) => payload.kind === "magic-link",
			);
			assert.ok(magicPayload?.magicLinkUrl);
			const magicToken = new URL(
				String(magicPayload.magicLinkUrl),
			).searchParams.get("token");
			assert.ok(magicToken);

			const verified = await consumeMagicLinkToken(magicToken, {
				now: new Date("2026-05-05T08:02:00.000Z"),
				store: new PrismaMagicLinkStore(prisma),
			});

			assert.equal(verified.ok, true);
			assert.equal(verified.ok ? verified.tenantId : "", tenant.tenantId);
			assert.equal(
				await membershipCountForEmail(tenant.tenantId, recipientEmail),
				1,
			);
			assert.ok(
				(
					await prisma.invitation.findUniqueOrThrow({
						where: { id: created.invitation.id },
						select: { consumedAt: true },
					})
				).consumedAt,
			);
		} finally {
			await cleanupTenant(tenant, [recipientEmail]);
			await rm(logPath, { force: true });
		}
	});

	test("mismatch and expired invitations reject with exact messages", async () => {
		ensureMigrated();
		const tenant = await seedTenant("reject");
		const store = new PrismaInvitationStore(prisma);
		const logPath = join(tmpdir(), `ssfw-4gl-${randomUUID()}.jsonl`);
		const intendedEmail = `ssfw-4gl-a-${randomUUID()}@example.invalid`;
		const otherEmail = `ssfw-4gl-b-${randomUUID()}@example.invalid`;

		try {
			const mismatchInvite = await createInvitation({
				tenantId: tenant.tenantId,
				actorUserId: tenant.actorUserId,
				recipientEmail: intendedEmail,
				baseUrl: "https://app.example.test",
				from: "no-reply@example.test",
				now: new Date("2026-05-05T08:00:00.000Z"),
				store,
				transport: new DevFileInvitationEmailTransport(logPath),
			});
			const otherUser = await prisma.user.create({
				data: { email: otherEmail },
				select: { id: true },
			});
			const mismatch = await redeemInvitationToken({
				token: mismatchInvite.token,
				userId: otherUser.id,
				now: new Date("2026-05-05T08:01:00.000Z"),
				store,
			});

			assert.deepEqual(mismatch, {
				ok: false,
				reason: "mismatch",
				message: INVITATION_EMAIL_MISMATCH_MESSAGE,
			});

			const expiredInvite = await createInvitation({
				tenantId: tenant.tenantId,
				actorUserId: tenant.actorUserId,
				recipientEmail: `ssfw-4gl-expired-${randomUUID()}@example.invalid`,
				baseUrl: "https://app.example.test",
				from: "no-reply@example.test",
				now: new Date("2026-05-01T08:00:00.000Z"),
				store,
				transport: new DevFileInvitationEmailTransport(logPath),
			});
			const expired = await redeemInvitationToken({
				token: expiredInvite.token,
				userId: otherUser.id,
				now: new Date("2026-05-08T08:00:00.001Z"),
				store,
			});

			assert.deepEqual(expired, {
				ok: false,
				reason: "expired",
				message: INVITATION_EXPIRED_MESSAGE,
			});
		} finally {
			await cleanupTenant(tenant, [intendedEmail, otherEmail]);
			await rm(logPath, { force: true });
		}
	});

	test("listing is tenant-scoped", async () => {
		ensureMigrated();
		const first = await seedTenant("list-a");
		const second = await seedTenant("list-b");
		const store = new PrismaInvitationStore(prisma);
		const logPath = join(tmpdir(), `ssfw-4gl-${randomUUID()}.jsonl`);

		try {
			const firstEmail = `ssfw-4gl-first-${randomUUID()}@example.invalid`;
			const secondEmail = `ssfw-4gl-second-${randomUUID()}@example.invalid`;
			await createInvitation({
				tenantId: first.tenantId,
				actorUserId: first.actorUserId,
				recipientEmail: firstEmail,
				baseUrl: "https://app.example.test",
				from: "no-reply@example.test",
				now: new Date("2026-05-05T08:00:00.000Z"),
				store,
				transport: new DevFileInvitationEmailTransport(logPath),
			});
			await createInvitation({
				tenantId: second.tenantId,
				actorUserId: second.actorUserId,
				recipientEmail: secondEmail,
				baseUrl: "https://app.example.test",
				from: "no-reply@example.test",
				now: new Date("2026-05-05T08:00:00.000Z"),
				store,
				transport: new DevFileInvitationEmailTransport(logPath),
			});

			const firstInvites = await listInvitations({
				tenantId: first.tenantId,
				actorUserId: first.actorUserId,
				store,
			});

			assert.deepEqual(
				firstInvites.map((invitation) => invitation.recipientEmail),
				[firstEmail],
			);
		} finally {
			await cleanupTenant(first);
			await cleanupTenant(second);
			await rm(logPath, { force: true });
		}
	});

	test.after(async () => {
		await prisma.$disconnect();
	});

	async function seedTenant(label: string): Promise<SeededTenant> {
		const suffix = randomUUID();
		const tenantName = `ssfw-4gl-${label}-${suffix}`;
		const actorEmail = `ssfw-4gl-owner-${label}-${suffix}@example.invalid`;
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

async function readJsonl(path: string): Promise<Array<Record<string, unknown>>> {
	const text = await readFile(path, "utf8");
	const payloads: Array<Record<string, unknown>> = [];

	for (const line of text.split("\n").filter(Boolean)) {
		try {
			payloads.push(JSON.parse(line) as Record<string, unknown>);
		} catch (error) {
			throw new Error(`Invalid JSONL payload: ${line}`, { cause: error });
		}
	}

	return payloads;
}

function moduleUrl(relativePath: string): string {
	return pathToFileURL(`${process.cwd()}/${relativePath}`).href;
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith(".") || specifier.startsWith("/");
}
