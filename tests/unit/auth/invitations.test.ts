import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type {
	CreateInvitationStoreInput,
	EnsureInviteMagicLinkRecipientResult,
	InvitationEmail,
	InvitationEmailTransport,
	InvitationListItem,
	InvitationRecord,
	InvitationStore,
	RedeemInvitationInput,
	RedeemInvitationResult,
} from "../../../src/lib/auth/invitations";
import type {
	EmailTransport,
	MagicLinkEmail,
} from "../../../src/lib/email/transport";
import type {
	CreateMagicLinkTokenInput,
	MagicLinkStore,
	MagicLinkTokenRow,
} from "../../../src/lib/auth/magic-link";

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

const invitationsModulePath = "../../../src/lib/auth/invitations.ts";
const {
	INVITATION_ALREADY_USED_MESSAGE,
	INVITATION_EMAIL_MISMATCH_MESSAGE,
	INVITATION_EXPIRED_MESSAGE,
	INVITATION_INVALID_MESSAGE,
	DevFileInvitationEmailTransport,
	createInvitation,
	createInvitationEmailTransport,
	hashInvitationToken,
	readInvitationLanding,
	redeemInvitationToken,
	requestInvitationMagicLink,
} = (await import(
	invitationsModulePath
)) as typeof import("../../../src/lib/auth/invitations");
const { ResendEmailTransport } = (await import(
	"../../../src/lib/email/transport"
)) as typeof import("../../../src/lib/email/transport");

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";
const actorUserId = "33333333-3333-4333-8333-333333333333";
const bobUserId = "44444444-4444-4444-8444-444444444444";
const otherUserId = "55555555-5555-4555-8555-555555555555";
const now = new Date("2026-05-05T08:00:00.000Z");

class MemoryInvitationStore implements InvitationStore {
	readonly invitations = new Map<string, InvitationRecord>();
	readonly tenants = new Map<string, string>();
	readonly users = new Map<string, string>();
	readonly memberships = new Set<string>();
	private invitationCounter = 0;

	addTenant(tenantId: string, tenantName: string): void {
		this.tenants.set(tenantId, tenantName);
	}

	addUser(userId: string, email: string): void {
		this.users.set(userId, email.toLowerCase());
	}

	addMembership(tenantId: string, userId: string): void {
		this.memberships.add(membershipKey(tenantId, userId));
	}

	hasMembership(tenantId: string, userId: string): boolean {
		return this.memberships.has(membershipKey(tenantId, userId));
	}

	membershipCount(tenantId: string, userId: string): number {
		return this.hasMembership(tenantId, userId) ? 1 : 0;
	}

	async createInvitation(
		input: CreateInvitationStoreInput,
	): Promise<InvitationRecord> {
		if (!this.hasMembership(input.tenantId, input.actorUserId)) {
			throw new Error("Tenant membership required.");
		}

		const actorEmail = this.users.get(input.actorUserId) ?? "owner@example.test";
		const invitation = {
			id: `invite-${++this.invitationCounter}`,
			tenantId: input.tenantId,
			tenantName: this.tenants.get(input.tenantId) ?? "Unknown tenant",
			recipientEmail: input.recipientEmail,
			tokenHash: input.tokenHash,
			expiresAt: input.expiresAt,
			consumedAt: null,
			createdById: input.actorUserId,
			createdByEmail: actorEmail,
		};

		this.invitations.set(hashKey(input.tokenHash), invitation);
		return invitation;
	}

	async listInvitations(input: {
		tenantId: string;
		actorUserId: string;
	}): Promise<InvitationListItem[]> {
		if (!this.hasMembership(input.tenantId, input.actorUserId)) {
			throw new Error("Tenant membership required.");
		}

		return [...this.invitations.values()]
			.filter((invitation) => invitation.tenantId === input.tenantId)
			.map(({ tokenHash: _tokenHash, ...invitation }) => invitation);
	}

	async findInvitationByTokenHash(
		tokenHash: Uint8Array,
	): Promise<InvitationRecord | null> {
		return this.invitations.get(hashKey(tokenHash)) ?? null;
	}

	async ensureInviteMagicLinkRecipient(input: {
		tokenHash: Uint8Array;
		now: Date;
	}): Promise<EnsureInviteMagicLinkRecipientResult> {
		const invitation = this.invitations.get(hashKey(input.tokenHash));

		if (!invitation) {
			throw new Error(INVITATION_INVALID_MESSAGE);
		}

		if (invitation.consumedAt) {
			throw new Error(INVITATION_ALREADY_USED_MESSAGE);
		}

		if (invitation.expiresAt.getTime() <= input.now.getTime()) {
			throw new Error(INVITATION_EXPIRED_MESSAGE);
		}

		const userId = this.userIdByEmail(invitation.recipientEmail) ?? bobUserId;
		this.addUser(userId, invitation.recipientEmail);

		return {
			tenantId: invitation.tenantId,
			recipientEmail: invitation.recipientEmail,
			userId,
		};
	}

	async redeemInvitation(
		input: RedeemInvitationInput,
	): Promise<RedeemInvitationResult> {
		const invitation = this.invitations.get(hashKey(input.tokenHash));

		if (!invitation) {
			return {
				ok: false,
				reason: "invalid",
				message: INVITATION_INVALID_MESSAGE,
			};
		}

		if (invitation.consumedAt) {
			return {
				ok: false,
				reason: "used",
				message: INVITATION_ALREADY_USED_MESSAGE,
			};
		}

		if (invitation.expiresAt.getTime() <= input.now.getTime()) {
			return {
				ok: false,
				reason: "expired",
				message: INVITATION_EXPIRED_MESSAGE,
			};
		}

		const email = this.users.get(input.userId);
		if (!email || email !== invitation.recipientEmail.toLowerCase()) {
			return {
				ok: false,
				reason: "mismatch",
				message: INVITATION_EMAIL_MISMATCH_MESSAGE,
			};
		}

		this.addMembership(invitation.tenantId, input.userId);
		invitation.consumedAt = input.now;

		return {
			ok: true,
			invitationId: invitation.id,
			tenantId: invitation.tenantId,
			userId: input.userId,
			message: "Invitation accepted.",
		};
	}

	private userIdByEmail(email: string): string | null {
		const normalized = email.toLowerCase();
		for (const [userId, userEmail] of this.users) {
			if (userEmail === normalized) {
				return userId;
			}
		}

		return null;
	}
}

class RecordingInvitationEmailTransport implements InvitationEmailTransport {
	readonly emails: InvitationEmail[] = [];

	async sendInvitation(email: InvitationEmail): Promise<void> {
		this.emails.push(email);
	}
}

class RecordingMagicLinkTransport implements EmailTransport {
	readonly emails: MagicLinkEmail[] = [];

	async sendMagicLink(email: MagicLinkEmail): Promise<void> {
		this.emails.push(email);
	}
}

class MemoryMagicLinkStore implements MagicLinkStore {
	readonly tokens = new Map<string, MagicLinkTokenRow>();
	private readonly invitations: MemoryInvitationStore;

	constructor(invitations: MemoryInvitationStore) {
		this.invitations = invitations;
	}

	async findUserTenantByEmail(email: string, tenantId?: string) {
		const normalizedEmail = email.toLowerCase();
		for (const [userId, userEmail] of this.invitations.users) {
			if (userEmail !== normalizedEmail) {
				continue;
			}

			const tenantIds = [...this.invitations.memberships]
				.filter((membership) => membership.endsWith(`:${userId}`))
				.map((membership) => membership.split(":")[0]);
			const matchedTenantId = tenantId
				? tenantIds.find((candidate) => candidate === tenantId)
				: tenantIds[0];

			if (matchedTenantId) {
				return { userId, tenantId: matchedTenantId };
			}
		}

		return null;
	}

	async createToken(input: CreateMagicLinkTokenInput): Promise<void> {
		this.tokens.set(hashKey(input.tokenHash), {
			id: `magic-${this.tokens.size + 1}`,
			email: input.email,
			tokenHash: input.tokenHash,
			expiresAt: input.expiresAt,
			consumedAt: null,
		});
	}

	async findTokenByHash(
		tokenHash: Uint8Array,
	): Promise<MagicLinkTokenRow | null> {
		return this.tokens.get(hashKey(tokenHash)) ?? null;
	}

	async deleteTokenByHash(tokenHash: Uint8Array): Promise<number> {
		return this.tokens.delete(hashKey(tokenHash)) ? 1 : 0;
	}

	async deleteUsableTokenByHash(
		tokenHash: Uint8Array,
		now: Date,
	): Promise<number> {
		const token = this.tokens.get(hashKey(tokenHash));
		if (!token || token.consumedAt || token.expiresAt.getTime() <= now.getTime()) {
			return 0;
		}

		this.tokens.delete(hashKey(tokenHash));
		return 1;
	}

	async deleteExpiredTokens(now: Date): Promise<number> {
		let deleted = 0;
		for (const [key, token] of this.tokens) {
			if (token.expiresAt.getTime() <= now.getTime()) {
				this.tokens.delete(key);
				deleted += 1;
			}
		}

		return deleted;
	}
}

test("peer member creates recipient-bound invite, email payload, and tenant landing context", async () => {
	const store = seededStore();
	const transport = new RecordingInvitationEmailTransport();
	const result = await createInvitation({
		tenantId: tenantA,
		actorUserId,
		recipientEmail: "BOB@Example.Test",
		baseUrl: "https://app.example.test",
		from: "no-reply@example.test",
		now,
		store,
		transport,
	});

	assert.equal(result.status, "created");
	assert.equal(result.invitation.recipientEmail, "bob@example.test");
	assert.equal(result.invitation.tenantId, tenantA);
	assert.equal(result.invitation.tenantName, "Alpha Safety AG");
	assert.equal(
		result.invitation.expiresAt.toISOString(),
		"2026-05-12T08:00:00.000Z",
	);
	assert.equal(result.token.endsWith(`.${tenantA}`), true);
	assert.equal(hashInvitationToken(result.token).byteLength, 32);
	assert.equal(transport.emails.length, 1);
	assert.deepEqual(transport.emails[0], {
		to: "bob@example.test",
		from: "no-reply@example.test",
		inviteUrl: result.inviteUrl,
		tenantName: "Alpha Safety AG",
		expiresAt: result.invitation.expiresAt,
	});

	const landing = await readInvitationLanding({
		token: result.token,
		now,
		store,
	});

	assert.equal(landing.ok, true);
	assert.equal(landing.ok ? landing.tenantName : "", "Alpha Safety AG");
	assert.equal(landing.ok ? landing.recipientEmail : "", "bob@example.test");
});

test("invitation transport factory uses configured provider in production", () => {
	const transport = createInvitationEmailTransport({
		EMAIL_TRANSPORT: "resend",
		NODE_ENV: "production",
		RESEND_API_KEY: "re_test",
	});

	assert.ok(transport instanceof ResendEmailTransport);
	assert.equal(transport instanceof DevFileInvitationEmailTransport, false);
});

test("listing returns only current tenant invitations", async () => {
	const store = seededStore();
	await createInvitation({
		tenantId: tenantA,
		actorUserId,
		recipientEmail: "first@example.test",
		baseUrl: "https://app.example.test",
		from: "no-reply@example.test",
		now,
		store,
		transport: new RecordingInvitationEmailTransport(),
	});
	await createInvitation({
		tenantId: tenantB,
		actorUserId,
		recipientEmail: "second@example.test",
		baseUrl: "https://app.example.test",
		from: "no-reply@example.test",
		now,
		store,
		transport: new RecordingInvitationEmailTransport(),
	});

	const tenantAInvites = await store.listInvitations({
		tenantId: tenantA,
		actorUserId,
	});

	assert.deepEqual(
		tenantAInvites.map((invitation) => invitation.recipientEmail),
		["first@example.test"],
	);
});

test("invite magic-link request prepares targeted sign-in for the recipient", async () => {
	const store = seededStore();
	const magicLinkTransport = new RecordingMagicLinkTransport();
	const result = await createInvitation({
		tenantId: tenantA,
		actorUserId,
		recipientEmail: "bob@example.test",
		baseUrl: "https://app.example.test",
		from: "no-reply@example.test",
		now,
		store,
		transport: new RecordingInvitationEmailTransport(),
	});

	assert.equal(store.users.has(bobUserId), false);
	assert.equal(store.hasMembership(tenantA, bobUserId), false);

	await requestInvitationMagicLink({
		token: result.token,
		baseUrl: "https://app.example.test",
		from: "no-reply@example.test",
		now,
		store,
		magicLinkTransport,
		magicLinkStore: new MemoryMagicLinkStore(store),
	});

	assert.equal(store.users.get(bobUserId), "bob@example.test");
	assert.equal(store.hasMembership(tenantA, bobUserId), false);
	assert.equal(magicLinkTransport.emails.length, 1);
	assert.equal(magicLinkTransport.emails[0].to, "bob@example.test");

	const magicToken = new URL(
		magicLinkTransport.emails[0].magicLinkUrl,
	).searchParams.get("token");
	assert.ok(magicToken);
	assert.equal(magicToken.endsWith(`.${tenantA}`), true);
});

test("redeem adds matching user, consumes the invite, and rejects replay", async () => {
	const store = seededStore();
	store.addUser(bobUserId, "bob@example.test");
	const result = await createInvitation({
		tenantId: tenantA,
		actorUserId,
		recipientEmail: "bob@example.test",
		baseUrl: "https://app.example.test",
		from: "no-reply@example.test",
		now,
		store,
		transport: new RecordingInvitationEmailTransport(),
	});

	assert.equal(store.hasMembership(tenantA, bobUserId), false);

	const redeemed = await redeemInvitationToken({
		token: result.token,
		userId: bobUserId,
		now,
		store,
	});

	assert.equal(redeemed.ok, true);
	assert.equal(store.hasMembership(tenantA, bobUserId), true);
	assert.equal(store.membershipCount(tenantA, bobUserId), 1);
	assert.equal(
		store.invitations.get(hashKey(hashInvitationToken(result.token)))?.consumedAt,
		now,
	);

	const replay = await redeemInvitationToken({
		token: result.token,
		userId: bobUserId,
		now: new Date(now.getTime() + 1000),
		store,
	});

	assert.equal(store.membershipCount(tenantA, bobUserId), 1);
	assert.deepEqual(replay, {
		ok: false,
		reason: "used",
		message: INVITATION_ALREADY_USED_MESSAGE,
	});
});

test("redeem rejects authenticated email mismatch with exact message", async () => {
	const store = seededStore();
	store.addUser(otherUserId, "b@y.example");
	const result = await createInvitation({
		tenantId: tenantA,
		actorUserId,
		recipientEmail: "a@x.example",
		baseUrl: "https://app.example.test",
		from: "no-reply@example.test",
		now,
		store,
		transport: new RecordingInvitationEmailTransport(),
	});

	const redeemed = await redeemInvitationToken({
		token: result.token,
		userId: otherUserId,
		now,
		store,
	});

	assert.deepEqual(redeemed, {
		ok: false,
		reason: "mismatch",
		message: INVITATION_EMAIL_MISMATCH_MESSAGE,
	});
	assert.equal(store.hasMembership(tenantA, otherUserId), false);
});

test("expired invite is rejected with exact message", async () => {
	const store = seededStore();
	store.addUser(bobUserId, "bob@example.test");
	const createdAt = new Date("2026-05-01T08:00:00.000Z");
	const result = await createInvitation({
		tenantId: tenantA,
		actorUserId,
		recipientEmail: "bob@example.test",
		baseUrl: "https://app.example.test",
		from: "no-reply@example.test",
		now: createdAt,
		store,
		transport: new RecordingInvitationEmailTransport(),
	});
	const afterExpiry = new Date("2026-05-08T08:00:00.001Z");

	const landing = await readInvitationLanding({
		token: result.token,
		now: afterExpiry,
		store,
	});
	assert.deepEqual(landing, {
		ok: false,
		reason: "expired",
		message: INVITATION_EXPIRED_MESSAGE,
		tenantName: "Alpha Safety AG",
		recipientEmail: "bob@example.test",
		expiresAt: result.invitation.expiresAt,
	});

	const redeemed = await redeemInvitationToken({
		token: result.token,
		userId: bobUserId,
		now: afterExpiry,
		store,
	});

	assert.deepEqual(redeemed, {
		ok: false,
		reason: "expired",
		message: INVITATION_EXPIRED_MESSAGE,
	});
});

function seededStore(): MemoryInvitationStore {
	const store = new MemoryInvitationStore();
	store.addTenant(tenantA, "Alpha Safety AG");
	store.addTenant(tenantB, "Beta Works GmbH");
	store.addUser(actorUserId, "owner@example.test");
	store.addMembership(tenantA, actorUserId);
	store.addMembership(tenantB, actorUserId);
	return store;
}

function membershipKey(tenantId: string, userId: string): string {
	return `${tenantId}:${userId}`;
}

function hashKey(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("hex");
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}
