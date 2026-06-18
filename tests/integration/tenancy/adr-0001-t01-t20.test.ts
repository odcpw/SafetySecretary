import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { performance } from "node:perf_hooks";
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
	test("ADR-0001 tenancy battery requires DATABASE_URL", () => {
		assert.fail(
			"DATABASE_URL is required for the ADR-0001 Gate A tenancy battery",
		);
	});
} else {
	const { removeMember } = (await import(
		moduleUrl("src/lib/auth/membership.ts")
	)) as typeof import("../../../src/lib/auth/membership");
	const {
		MAGIC_LINK_EXPIRED_MESSAGE,
		MAGIC_LINK_INVALID_OR_USED_MESSAGE,
		MAGIC_LINK_TTL_MS,
		PrismaMagicLinkStore,
		consumeMagicLinkToken,
		requestMagicLink,
	} = (await import(
		moduleUrl("src/lib/auth/magic-link.ts")
	)) as typeof import("../../../src/lib/auth/magic-link");
	const { resolveOrCreateWorkspaceForEmail } = (await import(
		moduleUrl("src/lib/auth/workspace-resolution.ts")
	)) as typeof import("../../../src/lib/auth/workspace-resolution");
	const {
		INVITATION_ALREADY_USED_MESSAGE,
		INVITATION_EMAIL_MISMATCH_MESSAGE,
		INVITATION_EXPIRED_MESSAGE,
		PrismaInvitationStore,
		createInvitation,
		redeemInvitationToken,
	} = (await import(
		moduleUrl("src/lib/auth/invitations.ts")
	)) as typeof import("../../../src/lib/auth/invitations");
	const {
		DESKTOP_SESSION_TTL_SECONDS,
		PrismaSessionStore,
		issueSession,
		validateSession,
	} = (await import(
		moduleUrl("src/lib/auth/session.ts")
	)) as typeof import("../../../src/lib/auth/session");
	const {
		dropTenantSchema,
		prisma,
		provisionTenantSchema,
		tenantDatabaseNames,
		withTenantConnection,
	} = (await import(
		moduleUrl("src/lib/db/index.ts")
	)) as typeof import("../../../src/lib/db");

	const invitationStore = new PrismaInvitationStore(prisma as PrismaClient);
	const magicLinkStore = new PrismaMagicLinkStore(prisma as PrismaClient);
	const sessionStore = new PrismaSessionStore(prisma as PrismaClient);
	const PRODUCTION_PROVISIONED_TABLES = [
		"approval_snapshot",
		"generated_artifact",
		"vision_call_audit",
		"cost_ledger_entry",
		"incident_case",
		"incident_timeline_event",
		"incident_attachment",
	];

	test("T1: tenant A cross-read and cross-write through scoped paths returns zero tenant B rows", async () => {
		await ensureMigrated();
		const tenantA = await seedTenant("t01-a", 1, {
			provisionSchema: true,
		});
		const tenantB = await seedTenant("t01-b", 1, {
			provisionSchema: true,
		});

		try {
			const userA = tenantA.users[0];
			const userB = tenantB.users[0];
			assert.ok(userA);
			assert.ok(userB);

			const caseA = await insertIncidentCase(
				tenantA.tenantId,
				userA.id,
				"T1 A",
			);
			const caseB = await insertIncidentCase(
				tenantB.tenantId,
				userB.id,
				"T1 B",
			);

			assert.equal(await readIncidentTitle(tenantA.tenantId, caseA), "T1 A");
			assert.equal(await readIncidentTitle(tenantA.tenantId, caseB), null);
			assert.equal(
				await updateIncidentTitle(
					tenantA.tenantId,
					caseB,
					"T1 attempted tenant B update",
				),
				0,
			);
			assert.equal(await readIncidentTitle(tenantB.tenantId, caseB), "T1 B");
		} finally {
			await cleanupTenant(tenantB);
			await cleanupTenant(tenantA);
		}
	});

	test("T2: tenant search_path excludes tenant B and public", async () => {
		await ensureMigrated();
		const tenantA = await seedTenant("t02-a", 1, {
			provisionSchema: true,
		});
		const tenantB = await seedTenant("t02-b", 1, {
			provisionSchema: true,
		});

		try {
			const namesA = tenantDatabaseNames(tenantA.tenantId);
			const namesB = tenantDatabaseNames(tenantB.tenantId);
			const [scope] = await withTenantConnection(
				tenantA.tenantId,
				async (tx) =>
					tx.$queryRaw<ScopeSnapshot[]>`
					SELECT
						current_user::text AS "currentUser",
						current_schema()::text AS "currentSchema",
						current_setting('search_path')::text AS "searchPath"
				`,
			);
			assert.ok(scope);
			assert.equal(scope.currentUser, namesA.roleName);
			assert.equal(scope.currentSchema, namesA.schemaName);
			assert.match(scope.searchPath, new RegExp(`\\b${namesA.schemaName}\\b`));
			assert.doesNotMatch(
				scope.searchPath,
				new RegExp(`\\b${namesB.schemaName}\\b`),
			);
			assert.doesNotMatch(scope.searchPath, /\bpublic\b/);
			console.log(
				`DB inspection T2 search_path: user=${scope.currentUser}; schema=${scope.currentSchema}; search_path=${scope.searchPath}`,
			);
		} finally {
			await cleanupTenant(tenantB);
			await cleanupTenant(tenantA);
		}
	});

	test("T3: schema-name injection is rejected before SQL execution", async () => {
		await ensureMigrated();
		const maliciousTenantIds = [
			"tenant_bad; DROP SCHEMA shared; --",
			"00000000-0000-0000-0000-000000000000;select",
			"../../shared",
		];

		for (const tenantId of maliciousTenantIds) {
			assert.throws(() => tenantDatabaseNames(tenantId), /Invalid tenantId/);
			await assert.rejects(
				() => provisionTenantSchema(tenantId, prisma),
				/Invalid tenantId/,
			);
			await assert.rejects(
				() => dropTenantSchema(tenantId, prisma),
				/Invalid tenantId/,
			);
		}
	});

	test("T4 and T5: tenant creation provisions schema and tenant deletion drops it", async () => {
		await ensureMigrated();
		const tenant = await seedTenant("t04-t05", 1, { provisionSchema: false });

		try {
			assert.equal(await schemaExists(tenant.tenantId), false);
			await provisionTenantSchema(tenant.tenantId, prisma);
			assert.equal(await schemaExists(tenant.tenantId), true);
			await assertProductionTenantSchema(tenant.tenantId, "T4");
			console.log(
				`DB inspection T4 provisioned schema: schema=${
					tenantDatabaseNames(tenant.tenantId).schemaName
				}; tables=${PRODUCTION_PROVISIONED_TABLES.join(",")}`,
			);

			await dropTenantSchema(tenant.tenantId, prisma);
			assert.equal(await schemaExists(tenant.tenantId), false);
			console.log(
				`DB inspection T5 dropped schema: schema=${
					tenantDatabaseNames(tenant.tenantId).schemaName
				}; exists=${await schemaExists(tenant.tenantId)}`,
			);
		} finally {
			await cleanupTenant(tenant);
		}
	});

	test("T6: tenant A role is denied explicit reads from tenant B schema", async () => {
		await ensureMigrated();
		const tenantA = await seedTenant("t06-a", 1, {
			provisionSchema: true,
		});
		const tenantB = await seedTenant("t06-b", 1, {
			provisionSchema: true,
		});

		try {
			const [userB] = tenantB.users;
			assert.ok(userB);
			await insertIncidentCase(tenantB.tenantId, userB.id, "T6 B");

			await assert.rejects(
				() => readOtherTenantSchemaAsRole(tenantA.tenantId, tenantB.tenantId),
				isPrivilegeError,
			);
		} finally {
			await cleanupTenant(tenantB);
			await cleanupTenant(tenantA);
		}
	});

	test("T7 and T8: same company-domain magic-link workspace resolution converges on one tenant", async () => {
		await ensureMigrated();
		const suffix = randomUUID();
		const domain = `ssfw-19k-t07-${suffix}.example.invalid`;
		const firstEmail = `owner@${domain}`;
		const secondEmail = `peer@${domain}`;
		const createdTenantIds: string[] = [];
		const createdUserIds: string[] = [];

		try {
			const first = await resolveOrCreateWorkspaceForEmail({
				email: firstEmail,
				defaultLanguage: "en",
			});
			createdTenantIds.push(first.tenantId);
			createdUserIds.push(first.userId);

			assert.equal(first.workspaceKind, "company");
			assert.equal(await tenantExists(first.tenantId), true);
			assert.equal(await schemaExists(first.tenantId), true);
			await assertProductionTenantSchema(first.tenantId, "T7");
			assert.equal(
				await membershipCountForUser(first.tenantId, first.userId),
				1,
			);
			assert.deepEqual(await tenantDomains(first.tenantId), [domain]);

			const second = await resolveOrCreateWorkspaceForEmail({
				email: secondEmail,
				defaultLanguage: "en",
			});
			createdUserIds.push(second.userId);
			createdTenantIds.push(second.tenantId);

			assert.equal(second.workspaceKind, "company");
			assert.equal(second.tenantId, first.tenantId);
			assert.equal(second.createdTenant, false);
			assert.equal(await schemaExists(second.tenantId), true);
			await assertProductionTenantSchema(second.tenantId, "T8");
			// A matching email domain alone must not grant membership: the peer
			// is neither the tenant creator nor invited, and the tenant has not
			// opted into domain auto-join, so no cross-tenant access is created.
			assert.equal(
				await membershipCountForUser(first.tenantId, second.userId),
				0,
			);
			assert.equal(
				await membershipCountForUser(second.tenantId, first.userId),
				1,
			);
			assert.equal(new Set(createdTenantIds).size, 1);
		} finally {
			await cleanupSignupRows(createdTenantIds, createdUserIds, [
				firstEmail,
				secondEmail,
			]);
		}
	});

	test("T9, T10, T14, and T15: invitations add matching members and reject mismatch, expired, and used tokens", async () => {
		await ensureMigrated();
		const tenant = await seedTenant("t09-t15", 1);
		const transport = new RecordingInvitationTransport();
		const recipientEmail = `ssfw-19k-t09-${randomUUID()}@example.invalid`;
		const mismatchEmail = `ssfw-19k-t10-${randomUUID()}@example.invalid`;
		const expiredEmail = `ssfw-19k-t14-${randomUUID()}@example.invalid`;
		const createdUserIds: string[] = [];

		try {
			const [actor] = tenant.users;
			assert.ok(actor);

			const created = await createInvitation({
				tenantId: tenant.tenantId,
				actorUserId: actor.id,
				recipientEmail,
				baseUrl: "https://app.example.test",
				from: "no-reply@example.test",
				now: new Date("2026-05-05T08:00:00.000Z"),
				store: invitationStore,
				transport,
			});
			const recipient = await prisma.user.create({
				data: { email: recipientEmail, uiLocale: "en" },
				select: { id: true },
			});
			createdUserIds.push(recipient.id);
			const redeemed = await redeemInvitationToken({
				token: created.token,
				userId: recipient.id,
				now: new Date("2026-05-05T08:01:00.000Z"),
				store: invitationStore,
			});
			assert.equal(redeemed.ok, true);
			assert.equal(
				await membershipCountForUser(tenant.tenantId, recipient.id),
				1,
			);

			const used = await redeemInvitationToken({
				token: created.token,
				userId: recipient.id,
				now: new Date("2026-05-05T08:02:00.000Z"),
				store: invitationStore,
			});
			assert.deepEqual(used, {
				ok: false,
				reason: "used",
				message: INVITATION_ALREADY_USED_MESSAGE,
			});

			const mismatchInvite = await createInvitation({
				tenantId: tenant.tenantId,
				actorUserId: actor.id,
				recipientEmail,
				baseUrl: "https://app.example.test",
				from: "no-reply@example.test",
				now: new Date("2026-05-05T08:03:00.000Z"),
				store: invitationStore,
				transport,
			});
			const mismatchUser = await prisma.user.create({
				data: { email: mismatchEmail, uiLocale: "en" },
				select: { id: true },
			});
			createdUserIds.push(mismatchUser.id);
			const mismatch = await redeemInvitationToken({
				token: mismatchInvite.token,
				userId: mismatchUser.id,
				now: new Date("2026-05-05T08:04:00.000Z"),
				store: invitationStore,
			});
			assert.deepEqual(mismatch, {
				ok: false,
				reason: "mismatch",
				message: INVITATION_EMAIL_MISMATCH_MESSAGE,
			});
			assert.equal(
				await membershipCountForUser(tenant.tenantId, mismatchUser.id),
				0,
			);

			const expiredInvite = await createInvitation({
				tenantId: tenant.tenantId,
				actorUserId: actor.id,
				recipientEmail: expiredEmail,
				baseUrl: "https://app.example.test",
				from: "no-reply@example.test",
				now: new Date("2026-05-05T08:00:00.000Z"),
				store: invitationStore,
				transport,
			});
			const expiredUser = await prisma.user.create({
				data: { email: expiredEmail, uiLocale: "en" },
				select: { id: true },
			});
			createdUserIds.push(expiredUser.id);
			const expired = await redeemInvitationToken({
				token: expiredInvite.token,
				userId: expiredUser.id,
				now: new Date("2026-05-12T08:00:00.001Z"),
				store: invitationStore,
			});
			assert.deepEqual(expired, {
				ok: false,
				reason: "expired",
				message: INVITATION_EXPIRED_MESSAGE,
			});
			assert.equal(
				await membershipCountForUser(tenant.tenantId, expiredUser.id),
				0,
			);
			assert.equal(transport.invitations.length, 3);
		} finally {
			await prisma.tenantMembership.deleteMany({
				where: { userId: { in: createdUserIds } },
			});
			await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
			await cleanupTenant(tenant);
		}
	});

	test("T11, T12, T13, T18, T19, and T20: sessions enforce removal, last-member, expiry, and tenant boundaries", async () => {
		await ensureMigrated();
		const tenant = await seedTenant("t11-t19", 2, { provisionSchema: true });
		const tenantB = await seedTenant("t20-b", 1, { provisionSchema: true });

		try {
			const [actor, target] = tenant.users;
			const [tenantBActor] = tenantB.users;
			assert.ok(actor);
			assert.ok(target);
			assert.ok(tenantBActor);

			const targetSession = await issueSession(
				target.id,
				tenant.tenantId,
				"desktop",
				{
					now: new Date("2026-05-05T08:00:00.000Z"),
					store: sessionStore,
				},
			);
			const expiredSession = await issueSession(
				actor.id,
				tenant.tenantId,
				"desktop",
				{
					now: new Date("2026-05-05T08:00:00.000Z"),
					store: sessionStore,
				},
			);

			const expired = await validateSession(expiredSession.cookieValue, {
				now: new Date(
					Date.parse("2026-05-05T08:00:00.000Z") +
						DESKTOP_SESSION_TTL_SECONDS * 1000 +
						1,
				),
				store: sessionStore,
			});
			assert.equal(expired, null);

			const removal = await removeMember(tenant.tenantId, target.id, actor.id, {
				db: prisma,
			});
			assert.deepEqual(removal, {
				deletedMemberships: 1,
				deletedSessions: 1,
				status: "removed",
			});
			const revocationStarted = performance.now();
			assert.equal(
				await validateSession(targetSession.cookieValue, {
					now: new Date("2026-05-05T08:01:00.000Z"),
					store: sessionStore,
				}),
				null,
			);
			assert.ok(
				performance.now() - revocationStarted <= 100,
				"removed member session should be denied within 100ms after membership removal commits",
			);

			const lastMember = await removeMember(
				tenant.tenantId,
				actor.id,
				actor.id,
				{
					db: prisma,
				},
			);
			assert.deepEqual(lastMember, {
				deletedMemberships: 0,
				deletedSessions: 0,
				status: "last_member",
			});
			assert.equal(await membershipCount(tenant.tenantId), 1);

			const concurrentTenant = await seedTenant("t13", 2);
			try {
				const [first, second] = concurrentTenant.users;
				assert.ok(first);
				assert.ok(second);
				const [firstResult, secondResult] = await Promise.all([
					removeMember(concurrentTenant.tenantId, second.id, first.id, {
						db: prisma,
					}),
					removeMember(concurrentTenant.tenantId, first.id, second.id, {
						db: prisma,
					}),
				]);
				assert.deepEqual([firstResult.status, secondResult.status].sort(), [
					"last_member",
					"removed",
				]);
				assert.equal(await membershipCount(concurrentTenant.tenantId), 1);
			} finally {
				await cleanupTenant(concurrentTenant);
			}

			await prisma.tenantMembership.create({
				data: {
					tenantId: tenantB.tenantId,
					userId: actor.id,
				},
			});
			const tenantBCase = await insertIncidentCase(
				tenantB.tenantId,
				actor.id,
				"T20 tenant B case",
			);
			const tenantASession = await issueSession(
				actor.id,
				tenant.tenantId,
				"desktop",
				{
					now: new Date("2026-05-05T08:02:00.000Z"),
					store: sessionStore,
				},
			);
			const tenantBSession = await issueSession(
				actor.id,
				tenantB.tenantId,
				"desktop",
				{
					now: new Date("2026-05-05T08:02:00.000Z"),
					store: sessionStore,
				},
			);
			const validatedTenantASession = await validateSession(
				tenantASession.cookieValue,
				{
					now: new Date("2026-05-05T08:03:00.000Z"),
					store: sessionStore,
				},
			);
			assert.ok(validatedTenantASession);
			assert.equal(validatedTenantASession.tenantId, tenant.tenantId);
			const validatedTenantBSession = await validateSession(
				tenantBSession.cookieValue,
				{
					now: new Date("2026-05-05T08:03:00.000Z"),
					store: sessionStore,
				},
			);
			assert.ok(validatedTenantBSession);
			assert.equal(validatedTenantBSession.tenantId, tenantB.tenantId);
			assert.equal(
				await readIncidentTitle(validatedTenantASession.tenantId, tenantBCase),
				null,
			);
			assert.equal(
				await readIncidentTitle(validatedTenantBSession.tenantId, tenantBCase),
				"T20 tenant B case",
			);
			const tenantBRemoval = await removeMember(
				tenantB.tenantId,
				actor.id,
				tenantBActor.id,
				{ db: prisma },
			);
			assert.deepEqual(tenantBRemoval, {
				deletedMemberships: 1,
				deletedSessions: 1,
				status: "removed",
			});
			assert.equal(
				await validateSession(tenantBSession.cookieValue, {
					now: new Date("2026-05-05T08:04:00.000Z"),
					store: sessionStore,
				}),
				null,
			);
			assert.equal(
				(
					await validateSession(tenantASession.cookieValue, {
						now: new Date("2026-05-05T08:04:00.000Z"),
						store: sessionStore,
					})
				)?.tenantId,
				tenant.tenantId,
			);
		} finally {
			await cleanupTenant(tenantB);
			await cleanupTenant(tenant);
		}
	});

	test("T16 and T17: magic links are single-use and expire", async () => {
		await ensureMigrated();
		const tenant = await seedTenant("t16-t17", 1);
		const [user] = tenant.users;
		assert.ok(user);
		const transport = new RecordingEmailTransport();

		try {
			await requestMagicLink({
				email: user.email,
				targetTenantId: tenant.tenantId,
				transport,
				baseUrl: "https://app.example.test",
				from: "no-reply@example.test",
				now: new Date("2026-05-05T08:00:00.000Z"),
				store: magicLinkStore,
			});
			const firstToken = transport.lastMagicToken();
			const firstUse = await consumeMagicLinkToken(firstToken, {
				now: new Date("2026-05-05T08:01:00.000Z"),
				store: magicLinkStore,
			});
			assert.deepEqual(firstUse, {
				ok: true,
				userId: user.id,
				tenantId: tenant.tenantId,
			});
			const replay = await consumeMagicLinkToken(firstToken, {
				now: new Date("2026-05-05T08:02:00.000Z"),
				store: magicLinkStore,
			});
			assert.deepEqual(replay, {
				ok: false,
				reason: "invalid_or_used",
				message: MAGIC_LINK_INVALID_OR_USED_MESSAGE,
			});

			await requestMagicLink({
				email: user.email,
				targetTenantId: tenant.tenantId,
				transport,
				baseUrl: "https://app.example.test",
				from: "no-reply@example.test",
				now: new Date("2026-05-05T08:03:00.000Z"),
				store: magicLinkStore,
			});
			const expiredToken = transport.lastMagicToken();
			const expired = await consumeMagicLinkToken(expiredToken, {
				now: new Date(
					Date.parse("2026-05-05T08:03:00.000Z") + MAGIC_LINK_TTL_MS + 1,
				),
				store: magicLinkStore,
			});
			assert.deepEqual(expired, {
				ok: false,
				reason: "expired",
				message: MAGIC_LINK_EXPIRED_MESSAGE,
			});
		} finally {
			await cleanupTenant(tenant);
		}
	});

	test.after(async () => {
		await restoreVectorExtensionFunctionIfShimmed();
		await prisma.$disconnect();
	});

	async function seedTenant(
		label: string,
		userCount: number,
		options: { provisionSchema?: boolean } = {},
	): Promise<SeededTenant> {
		const suffix = randomUUID();
		const tenant = await prisma.tenant.create({
			data: {
				defaultLanguage: "en",
				name: `ssfw-19k-${label}-${suffix}`,
			},
			select: { id: true },
		});
		const users = await Promise.all(
			Array.from({ length: userCount }, async (_, index) =>
				prisma.user.create({
					data: {
						email: `ssfw-19k-${label}-${index}-${suffix}@example.invalid`,
						uiLocale: "en",
					},
					select: { email: true, id: true },
				}),
			),
		);

		await prisma.tenantMembership.createMany({
			data: users.map((user) => ({
				tenantId: tenant.id,
				userId: user.id,
			})),
		});

		if (options.provisionSchema) {
			await provisionTenantSchema(tenant.id, prisma);
		}

		return {
			tenantId: tenant.id,
			users,
		};
	}

	async function cleanupTenant(input: SeededTenant): Promise<void> {
		await dropTenantSchema(input.tenantId, prisma).catch(() => undefined);
		await prisma.magicLinkToken.deleteMany({
			where: { email: { in: input.users.map((user) => user.email) } },
		});
		await prisma.invitation.deleteMany({ where: { tenantId: input.tenantId } });
		await prisma.session.deleteMany({ where: { tenantId: input.tenantId } });
		await prisma.tenantMembership.deleteMany({
			where: { tenantId: input.tenantId },
		});
		await prisma.tenant.deleteMany({ where: { id: input.tenantId } });
		await prisma.user.deleteMany({
			where: { id: { in: input.users.map((user) => user.id) } },
		});
	}

	async function cleanupSignupRows(
		tenantIds: string[],
		userIds: string[],
		emails: string[],
	): Promise<void> {
		await Promise.all(
			tenantIds.map((tenantId) =>
				dropTenantSchema(tenantId, prisma).catch(() => undefined),
			),
		);
		await prisma.magicLinkToken.deleteMany({
			where: { email: { in: emails } },
		});
		await prisma.invitation.deleteMany({
			where: { tenantId: { in: tenantIds } },
		});
		await prisma.session.deleteMany({ where: { tenantId: { in: tenantIds } } });
		await prisma.tenantMembership.deleteMany({
			where: { tenantId: { in: tenantIds } },
		});
		await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
		await prisma.user.deleteMany({ where: { id: { in: userIds } } });
	}

	async function insertIncidentCase(
		tenantId: string,
		userId: string,
		title: string,
	): Promise<string> {
		const id = randomUUID();
		await withTenantConnection(tenantId, async (tx) => {
			await tx.$executeRaw`
				INSERT INTO incident_case (
					id,
					title,
					incident_at,
					incident_type,
					coordinator_role,
					content_language,
					created_by
				) VALUES (
					${id}::uuid,
					${title},
					'2026-05-05T09:00:00Z'::timestamptz,
					'NEAR_MISS',
					'Safety lead',
					'en',
					${userId}::uuid
				)
			`;
		});
		return id;
	}

	async function readIncidentTitle(
		tenantId: string,
		caseId: string,
	): Promise<string | null> {
		return withTenantConnection(tenantId, async (tx) => {
			const rows = await tx.$queryRaw<Array<{ title: string }>>`
				SELECT title
				FROM incident_case
				WHERE id = ${caseId}::uuid
			`;
			return rows[0]?.title ?? null;
		});
	}

	async function updateIncidentTitle(
		tenantId: string,
		caseId: string,
		title: string,
	): Promise<number> {
		return withTenantConnection(tenantId, async (tx) => {
			const rows = await tx.$queryRaw<Array<{ id: string }>>`
				UPDATE incident_case
				SET title = ${title}
				WHERE id = ${caseId}::uuid
				RETURNING id::text AS id
			`;
			return rows.length;
		});
	}

	async function readOtherTenantSchemaAsRole(
		tenantAId: string,
		tenantBId: string,
	): Promise<void> {
		const tenantANames = tenantDatabaseNames(tenantAId);
		const tenantBNames = tenantDatabaseNames(tenantBId);

		await prisma.$transaction(async (tx) => {
			await tx.$executeRawUnsafe(
				`SET LOCAL ROLE ${quoteIdent(tenantANames.roleName)}`,
			);
			await tx.$executeRawUnsafe(
				`SET LOCAL search_path = ${quoteIdent(tenantANames.schemaName)}, shared`,
			);
			await tx.$queryRawUnsafe(
				`SELECT title FROM ${quoteIdent(tenantBNames.schemaName)}.incident_case`,
			);
		});
	}

	async function schemaExists(tenantId: string): Promise<boolean> {
		const names = tenantDatabaseNames(tenantId);
		const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
			SELECT EXISTS (
				SELECT 1
				FROM pg_catalog.pg_namespace
				WHERE nspname = ${names.schemaName}
			) AS "exists"
		`;
		return rows[0]?.exists ?? false;
	}

	async function tenantExists(tenantId: string): Promise<boolean> {
		const count = await prisma.tenant.count({ where: { id: tenantId } });
		return count === 1;
	}

	async function tenantDomains(tenantId: string): Promise<string[]> {
		const rows = await prisma.tenantDomain.findMany({
			where: { tenantId },
			orderBy: { domain: "asc" },
			select: { domain: true },
		});
		return rows.map((row) => row.domain);
	}

	async function tenantTableExists(
		tenantId: string,
		tableName: string,
	): Promise<boolean> {
		const names = tenantDatabaseNames(tenantId);
		const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
			SELECT EXISTS (
				SELECT 1
				FROM information_schema.tables
				WHERE table_schema = ${names.schemaName}
					AND table_name = ${tableName}
			) AS "exists"
		`;
		return rows[0]?.exists ?? false;
	}

	async function assertProductionTenantSchema(
		tenantId: string,
		label: string,
	): Promise<void> {
		for (const tableName of PRODUCTION_PROVISIONED_TABLES) {
			assert.equal(
				await tenantTableExists(tenantId, tableName),
				true,
				`${label}: expected production provision_tenant_schema to create ${tableName}`,
			);
		}
	}

	async function membershipCount(tenantId: string): Promise<number> {
		return prisma.tenantMembership.count({ where: { tenantId } });
	}

	async function membershipCountForUser(
		tenantId: string,
		userId: string,
	): Promise<number> {
		return prisma.tenantMembership.count({ where: { tenantId, userId } });
	}

	let migrated = false;
	let vectorShimInstalled = false;

	async function ensureMigrated(): Promise<void> {
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
		await installVectorExtensionShimIfUnavailable();
		migrated = true;
	}

	async function installVectorExtensionShimIfUnavailable(): Promise<void> {
		const rows = await prisma.$queryRaw<Array<{ available: boolean }>>`
			SELECT EXISTS (
				SELECT 1
				FROM pg_available_extensions
				WHERE name = 'vector'
			) AS "available"
		`;
		if (rows[0]?.available) {
			return;
		}

		await prisma.$executeRawUnsafe(`
			CREATE OR REPLACE FUNCTION "shared"."ensure_vector_extension"()
			RETURNS name
			LANGUAGE plpgsql
			AS $$
			BEGIN
				PERFORM "shared"."apply_approval_snapshot_schema_to_all_tenants"();
				PERFORM "shared"."apply_generated_artifact_schema_to_all_tenants"();
				PERFORM "shared"."apply_vision_call_audit_schema_to_all_tenants"();
				PERFORM "shared"."apply_cost_ledger_schema_to_all_tenants"();
				RETURN 'shared'::name;
			END
			$$;
		`);
		vectorShimInstalled = true;
		console.log(
			"DB inspection test shim: pgvector extension is unavailable; installed no-op shared.ensure_vector_extension() for tenant provisioning tests",
		);
	}

	async function restoreVectorExtensionFunctionIfShimmed(): Promise<void> {
		if (!vectorShimInstalled) {
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
			`pnpm db:migrate failed while restoring shared.ensure_vector_extension\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
		);
		vectorShimInstalled = false;
	}
}

type SeededTenant = {
	tenantId: string;
	users: Array<{
		email: string;
		id: string;
	}>;
};

type ScopeSnapshot = {
	currentUser: string;
	currentSchema: string;
	searchPath: string;
};

type MagicLinkMessage = {
	to: string;
	from: string;
	magicLinkUrl: string;
	expiresAt: Date;
};

type InvitationMessage = {
	to: string;
	from: string;
	inviteUrl: string;
	tenantName: string;
	expiresAt: Date;
};

class RecordingEmailTransport {
	readonly magicLinks: MagicLinkMessage[] = [];

	async sendMagicLink(email: MagicLinkMessage): Promise<void> {
		this.magicLinks.push(email);
	}

	lastMagicToken(): string {
		const message = this.magicLinks.at(-1);
		assert.ok(message, "expected a magic-link email");
		const url = new URL(message.magicLinkUrl);
		const token = url.searchParams.get("token");
		assert.ok(token, "expected magic-link token query param");
		return token;
	}
}

class RecordingInvitationTransport {
	readonly invitations: InvitationMessage[] = [];

	async sendInvitation(email: InvitationMessage): Promise<void> {
		this.invitations.push(email);
	}
}

function moduleUrl(relativePath: string): string {
	return pathToFileURL(`${process.cwd()}/${relativePath}`).href;
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith(".") || specifier.startsWith("/");
}

function quoteIdent(value: string): string {
	return `"${String(value).replaceAll('"', '""')}"`;
}

function isPrivilegeError(error: unknown): boolean {
	return (
		error instanceof Error && /(permission denied|42501)/i.test(error.message)
	);
}
