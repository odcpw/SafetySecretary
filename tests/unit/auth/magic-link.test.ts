import assert from "node:assert/strict";
import test from "node:test";
import type {
	CreateMagicLinkTokenInput,
	MagicLinkRateLimitStore,
	MagicLinkStore,
	MagicLinkTokenRow,
} from "../../../src/lib/auth/magic-link";
import type {
	EmailTransport,
	MagicLinkEmail,
} from "../../../src/lib/email/transport";

const magicLinkModulePath = "../../../src/lib/auth/magic-link.ts";
const {
	MAGIC_LINK_ACTIVE_TOKEN_LIMIT,
	MAGIC_LINK_INVALID_OR_USED_MESSAGE,
	MAGIC_LINK_IP_RATE_LIMIT,
	MAGIC_LINK_REQUEST_SUCCESS_MESSAGE,
	checkMagicLinkRequestRateLimit,
	consumeMagicLinkToken,
	hashMagicLinkToken,
	requestMagicLink,
	resetMagicLinkRateLimitForValidation,
} = (await import(
	magicLinkModulePath
)) as typeof import("../../../src/lib/auth/magic-link");

class MemoryMagicLinkStore implements MagicLinkStore {
	readonly tokens = new Map<string, MagicLinkTokenRow>();
	private readonly memberships = new Map<
		string,
		Array<{ userId: string; tenantId: string }>
	>();
	deleteCalls = 0;

	constructor(knownEmail: string | null) {
		if (knownEmail) {
			this.addMembership(
				knownEmail,
				"user-1",
				"11111111-1111-4111-8111-111111111111",
			);
		}
	}

	addMembership(email: string, userId: string, tenantId: string): void {
		const memberships = this.memberships.get(email) ?? [];
		memberships.push({ userId, tenantId });
		this.memberships.set(email, memberships);
	}

	async findUserTenantByEmail(email: string, tenantId?: string) {
		const memberships = this.memberships.get(email) ?? [];
		const membership = tenantId
			? memberships.find((candidate) => candidate.tenantId === tenantId)
			: memberships[0];

		if (!membership) {
			return null;
		}

		return {
			userId: membership.userId,
			tenantId: membership.tenantId,
		};
	}

	async createToken(input: CreateMagicLinkTokenInput): Promise<void> {
		this.tokens.set(hashKey(input.tokenHash), {
			id: `token-${this.tokens.size + 1}`,
			email: input.email,
			tokenHash: input.tokenHash,
			expiresAt: input.expiresAt,
			consumedAt: null,
		});
	}

	async countUsableTokensByEmail(email: string, now: Date): Promise<number> {
		return [...this.tokens.values()].filter(
			(token) =>
				token.email === email &&
				!token.consumedAt &&
				token.expiresAt.getTime() > now.getTime(),
		).length;
	}

	async findTokenByHash(
		tokenHash: Uint8Array,
	): Promise<MagicLinkTokenRow | null> {
		return this.tokens.get(hashKey(tokenHash)) ?? null;
	}

	async deleteTokenByHash(tokenHash: Uint8Array): Promise<number> {
		this.deleteCalls += 1;
		return this.tokens.delete(hashKey(tokenHash)) ? 1 : 0;
	}

	async deleteUsableTokenByHash(
		tokenHash: Uint8Array,
		now: Date,
	): Promise<number> {
		const key = hashKey(tokenHash);
		const token = this.tokens.get(key);

		if (
			!token ||
			token.consumedAt ||
			token.expiresAt.getTime() <= now.getTime()
		) {
			return 0;
		}

		this.tokens.delete(key);
		return 1;
	}

	async deleteExpiredTokens(): Promise<number> {
		return 0;
	}
}

class ThrowingEmailTransport implements EmailTransport {
	sendCalls = 0;
	seenTokens: string[] = [];

	async sendMagicLink(email: MagicLinkEmail): Promise<void> {
		this.sendCalls += 1;
		const token = new URL(email.magicLinkUrl).searchParams.get("token");
		if (token) {
			this.seenTokens.push(token);
		}

		throw new Error("configured transport failed");
	}
}

class RecordingEmailTransport implements EmailTransport {
	readonly magicLinkUrls: string[] = [];

	async sendMagicLink(email: MagicLinkEmail): Promise<void> {
		this.magicLinkUrls.push(email.magicLinkUrl);
	}
}

class MemoryRateLimitStore implements MagicLinkRateLimitStore {
	readonly buckets = new Map<string, number>();
	deleteCalls = 0;

	async incrementBucket(scope: string, bucketStart: Date): Promise<number> {
		const key = `${scope}:${bucketStart.toISOString()}`;
		const count = (this.buckets.get(key) ?? 0) + 1;
		this.buckets.set(key, count);
		return count;
	}

	async deleteBucketsBefore(): Promise<void> {
		this.deleteCalls += 1;
	}
}

test.beforeEach(() => {
	resetMagicLinkRateLimitForValidation();
});

test("transport failures do not distinguish known and unknown emails", async () => {
	const now = new Date("2026-04-30T10:00:00.000Z");
	const knownStore = new MemoryMagicLinkStore("known@example.com");
	const unknownStore = new MemoryMagicLinkStore(null);
	const knownTransport = new ThrowingEmailTransport();
	const unknownTransport = new ThrowingEmailTransport();

	const known = await requestMagicLink({
		email: "known@example.com",
		store: knownStore,
		transport: knownTransport,
		baseUrl: "https://app.example.test",
		from: "no-reply@example.test",
		now,
	});
	const unknown = await requestMagicLink({
		email: "unknown@example.com",
		store: unknownStore,
		transport: unknownTransport,
		baseUrl: "https://app.example.test",
		from: "no-reply@example.test",
		now,
	});

	assert.equal(known.status, "sent_or_ignored");
	assert.equal(unknown.status, "sent_or_ignored");
	assert.equal(known.message, MAGIC_LINK_REQUEST_SUCCESS_MESSAGE);
	assert.equal(unknown.message, MAGIC_LINK_REQUEST_SUCCESS_MESSAGE);
	assert.equal(knownTransport.sendCalls, 1);
	assert.equal(unknownTransport.sendCalls, 1);
	assert.equal(knownStore.deleteCalls, 1);
	assert.equal(unknownStore.deleteCalls, 1);
	assert.equal(knownStore.tokens.size, 0);
	assert.equal(unknownStore.tokens.size, 0);
	assert.equal(hashMagicLinkToken(knownTransport.seenTokens[0]).byteLength, 32);
	assert.equal(
		hashMagicLinkToken(unknownTransport.seenTokens[0]).byteLength,
		32,
	);
});

test("untargeted magic links can resolve a workspace only after verification", async () => {
	const now = new Date("2026-04-30T10:00:00.000Z");
	const email = "new@example.com";
	const store = new MemoryMagicLinkStore(null);
	const transport = new RecordingEmailTransport();

	await requestMagicLink({
		email,
		store,
		transport,
		baseUrl: "https://app.example.test",
		from: "no-reply@example.test",
		now,
	});

	assert.equal(transport.magicLinkUrls.length, 1);
	assert.equal(store.tokens.size, 1);

	const token = new URL(transport.magicLinkUrls[0]).searchParams.get("token");
	assert.ok(token);

	const unresolved = await consumeMagicLinkToken(token, {
		store,
		now,
	});

	assert.deepEqual(unresolved, {
		ok: false,
		reason: "no_membership",
		message: MAGIC_LINK_INVALID_OR_USED_MESSAGE,
	});

	await requestMagicLink({
		email,
		store,
		transport,
		baseUrl: "https://app.example.test",
		from: "no-reply@example.test",
		now,
	});
	const resolvedToken = new URL(transport.magicLinkUrls[1]).searchParams.get(
		"token",
	);
	assert.ok(resolvedToken);

	const resolved = await consumeMagicLinkToken(resolvedToken, {
		store,
		now,
		workspaceResolver: async ({ email: resolvedEmail }) => {
			assert.equal(resolvedEmail, email);
			return {
				userId: "user-created-after-verify",
				tenantId: "tenant-created-after-verify",
			};
		},
	});

	assert.deepEqual(resolved, {
		ok: true,
		userId: "user-created-after-verify",
		tenantId: "tenant-created-after-verify",
	});
});

test("targeted magic links verify into the requested tenant membership", async () => {
	const now = new Date("2026-04-30T10:00:00.000Z");
	const email = "owner@example.com";
	const oldTenantId = "11111111-1111-4111-8111-111111111111";
	const newTenantId = "22222222-2222-4222-8222-222222222222";
	const store = new MemoryMagicLinkStore(null);
	const transport = new RecordingEmailTransport();

	store.addMembership(email, "user-1", oldTenantId);
	store.addMembership(email, "user-1", newTenantId);

	const targeted = await requestMagicLink({
		email,
		targetTenantId: newTenantId,
		store,
		transport,
		baseUrl: "https://app.example.test",
		from: "no-reply@example.test",
		now,
	});

	assert.equal(targeted.knownUser, false);
	assert.equal(transport.magicLinkUrls.length, 1);

	const targetedToken = new URL(transport.magicLinkUrls[0]).searchParams.get(
		"token",
	);
	assert.ok(targetedToken);
	assert.ok(targetedToken.endsWith(`.${newTenantId}`));

	const targetedResult = await consumeMagicLinkToken(targetedToken, {
		store,
		now,
	});

	assert.deepEqual(targetedResult, {
		ok: true,
		userId: "user-1",
		tenantId: newTenantId,
	});

	await requestMagicLink({
		email,
		store,
		transport,
		baseUrl: "https://app.example.test",
		from: "no-reply@example.test",
		now,
	});

	const defaultToken = new URL(transport.magicLinkUrls[1]).searchParams.get(
		"token",
	);
	assert.ok(defaultToken);

	const defaultResult = await consumeMagicLinkToken(defaultToken, {
		store,
		now,
		workspaceResolver: async ({ email: resolvedEmail }) => {
			assert.equal(resolvedEmail, email);
			return {
				userId: "user-1",
				tenantId: newTenantId,
			};
		},
	});

	assert.deepEqual(defaultResult, {
		ok: true,
		userId: "user-1",
		tenantId: newTenantId,
	});
});

test("untargeted magic links do not fall back to oldest membership when resolver is supplied", async () => {
	const now = new Date("2026-04-30T10:00:00.000Z");
	const email = "member@example.com";
	const store = new MemoryMagicLinkStore(null);
	const transport = new RecordingEmailTransport();

	store.addMembership(email, "user-1", "11111111-1111-4111-8111-111111111111");

	await requestMagicLink({
		email,
		store,
		transport,
		baseUrl: "https://app.example.test",
		from: "no-reply@example.test",
		now,
	});

	const token = new URL(transport.magicLinkUrls[0]).searchParams.get("token");
	assert.ok(token);

	const result = await consumeMagicLinkToken(token, {
		store,
		now,
		workspaceResolver: async () => null,
	});

	assert.deepEqual(result, {
		ok: false,
		reason: "no_membership",
		message: MAGIC_LINK_INVALID_OR_USED_MESSAGE,
	});
});

test("requestMagicLink stops issuing new tokens when live email tokens are capped", async () => {
	const now = new Date("2026-04-30T10:00:00.000Z");
	const email = "capped@example.com";
	const store = new MemoryMagicLinkStore(null);
	const transport = new RecordingEmailTransport();

	for (let index = 0; index < MAGIC_LINK_ACTIVE_TOKEN_LIMIT + 1; index += 1) {
		await requestMagicLink({
			email,
			store,
			transport,
			baseUrl: "https://app.example.test",
			from: "no-reply@example.test",
			now: new Date(now.getTime() + index),
		});
	}

	assert.equal(transport.magicLinkUrls.length, MAGIC_LINK_ACTIVE_TOKEN_LIMIT);
	assert.equal(store.tokens.size, MAGIC_LINK_ACTIVE_TOKEN_LIMIT);
});

test("request limiter blocks distinct-email bursts from one client IP", async () => {
	const now = new Date("2026-04-30T10:00:00.000Z");
	const store = new MemoryRateLimitStore();
	const clientIp = "203.0.113.10";

	for (let index = 0; index < MAGIC_LINK_IP_RATE_LIMIT; index += 1) {
		const result = await checkMagicLinkRequestRateLimit(
			`person-${index}@example.com`,
			{ clientIp, now, store },
		);
		assert.deepEqual(result, { allowed: true });
	}

	const blocked = await checkMagicLinkRequestRateLimit(
		`person-${MAGIC_LINK_IP_RATE_LIMIT}@example.com`,
		{ clientIp, now, store },
	);

	assert.equal(blocked.allowed, false);
	if (!blocked.allowed) {
		assert.equal(blocked.retryAfterSeconds, 3600);
	}
});

function hashKey(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("hex");
}
