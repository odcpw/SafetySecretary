import { createHash, randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import type { EmailTransport } from "../email/transport";

export const MAGIC_LINK_TOKEN_BYTES = 32;
export const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
export const MAGIC_LINK_RATE_LIMIT = 3;
export const MAGIC_LINK_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
export const MAGIC_LINK_IP_RATE_LIMIT = 30;
export const MAGIC_LINK_GLOBAL_RATE_LIMIT = 300;
export const MAGIC_LINK_ACTIVE_TOKEN_LIMIT = 3;
export const MAGIC_LINK_REQUEST_SUCCESS_MESSAGE =
	"Check your email for a sign-in link.";
export const MAGIC_LINK_RATE_LIMIT_MESSAGE =
	"Too many sign-in links requested. Try again later.";
export const MAGIC_LINK_INVALID_OR_USED_MESSAGE =
	"Magic link is invalid or already used.";
export const MAGIC_LINK_EXPIRED_MESSAGE =
	"Magic link expired. Request a new sign-in link.";

type UserTenant = {
	userId: string;
	tenantId: string;
};

export type MagicLinkTokenRow = {
	id: string;
	email: string;
	tokenHash: Uint8Array;
	expiresAt: Date;
	consumedAt: Date | null;
};

export type CreateMagicLinkTokenInput = {
	email: string;
	tokenHash: Uint8Array;
	expiresAt: Date;
};

export interface MagicLinkStore {
	findUserTenantByEmail(
		email: string,
		tenantId?: string,
		now?: Date,
	): Promise<UserTenant | null>;
	createToken(input: CreateMagicLinkTokenInput): Promise<void>;
	countUsableTokensByEmail?(email: string, now: Date): Promise<number>;
	findTokenByHash(tokenHash: Uint8Array): Promise<MagicLinkTokenRow | null>;
	deleteTokenByHash(tokenHash: Uint8Array): Promise<number>;
	deleteUsableTokenByHash(tokenHash: Uint8Array, now: Date): Promise<number>;
	deleteExpiredTokens(now: Date): Promise<number>;
}

export interface MagicLinkRateLimitStore {
	incrementBucket(scope: string, bucketStart: Date): Promise<number>;
	deleteBucketsBefore(cutoff: Date): Promise<void>;
}

export type RequestMagicLinkResult = {
	status: "sent_or_ignored";
	message: typeof MAGIC_LINK_REQUEST_SUCCESS_MESSAGE;
	knownUser: boolean;
};

export type ConsumeMagicLinkResult =
	| {
			ok: true;
			userId: string;
			tenantId: string;
	  }
	| {
			ok: false;
			reason: "expired" | "invalid_or_used" | "no_membership";
			message: string;
	  };

export type MagicLinkWorkspaceResolver = (input: {
	email: string;
}) => Promise<UserTenant | null>;

type GlobalState = typeof globalThis & {
	__ssfwPrisma?: PrismaClient;
};

const globalState = globalThis as GlobalState;

const MAGIC_LINK_RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000;
const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function normalizeMagicLinkEmail(email: string): string {
	return email.trim().toLowerCase();
}

export function isValidMagicLinkEmail(email: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function magicLinkClientIpFromHeaders(
	headers: Headers,
): string | undefined {
	const forwardedFor = headers.get("x-forwarded-for");
	const firstForwardedFor = forwardedFor?.split(",")[0]?.trim();
	if (firstForwardedFor) {
		return firstForwardedFor;
	}

	return (
		headers.get("cf-connecting-ip")?.trim() ||
		headers.get("x-real-ip")?.trim() ||
		undefined
	);
}

export function generateMagicLinkToken(
	options: { targetTenantId?: string } = {},
): string {
	const token = randomBytes(MAGIC_LINK_TOKEN_BYTES).toString("base64url");
	const targetTenantId = normalizeTargetTenantId(options.targetTenantId);

	return targetTenantId ? `${token}.${targetTenantId}` : token;
}

export function hashMagicLinkToken(token: string): Uint8Array {
	return createHash("sha256").update(token, "utf8").digest();
}

export function buildMagicLinkUrl(baseUrl: string, token: string): string {
	const url = new URL("/api/auth/magic-link/verify", baseUrl);
	url.searchParams.set("token", token);
	return url.toString();
}

export async function checkMagicLinkRequestRateLimit(
	email: string,
	options: {
		clientIp?: string;
		now?: Date;
		store?: MagicLinkRateLimitStore;
	} = {},
): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }> {
	const normalizedEmail = normalizeMagicLinkEmail(email);
	const now = options.now ?? new Date();
	const nowMs = now.getTime();
	const store = options.store ?? new PrismaMagicLinkRateLimitStore();
	const scopes = magicLinkRequestRateLimitScopes(
		normalizedEmail,
		options.clientIp,
	);

	await store
		.deleteBucketsBefore(new Date(nowMs - MAGIC_LINK_RATE_LIMIT_RETENTION_MS))
		.catch(() => undefined);

	for (const scope of scopes) {
		const bucketStart = bucketStartFor(now, scope.windowMs);
		const count = await store.incrementBucket(scope.key, bucketStart);

		if (count > scope.limit) {
			return {
				allowed: false,
				retryAfterSeconds: retryAfterSecondsForBucket(
					bucketStart,
					scope.windowMs,
					now,
				),
			};
		}
	}

	return { allowed: true };
}

export function resetMagicLinkRateLimitForValidation(): void {
	// Durable rate-limit state lives in shared.magic_link_request_limits. Tests
	// that need isolation inject a MagicLinkRateLimitStore instead.
}

export async function requestMagicLink(input: {
	email: string;
	targetTenantId?: string;
	store?: MagicLinkStore;
	transport: EmailTransport;
	baseUrl: string;
	from: string;
	now?: Date;
}): Promise<RequestMagicLinkResult> {
	const normalizedEmail = normalizeMagicLinkEmail(input.email);
	if (!isValidMagicLinkEmail(normalizedEmail)) {
		throw new Error("Magic-link request requires a valid email address.");
	}

	const targetTenantId = normalizeTargetTenantId(input.targetTenantId);
	const now = input.now ?? new Date();
	const token = generateMagicLinkToken({ targetTenantId });
	const tokenHash = hashMagicLinkToken(token);
	const expiresAt = new Date(now.getTime() + MAGIC_LINK_TTL_MS);
	const store = input.store ?? new PrismaMagicLinkStore();

	await store.deleteExpiredTokens(now);

	if (
		(await countUsableTokensByEmail(store, normalizedEmail, now)) >=
		MAGIC_LINK_ACTIVE_TOKEN_LIMIT
	) {
		return {
			status: "sent_or_ignored",
			message: MAGIC_LINK_REQUEST_SUCCESS_MESSAGE,
			knownUser: false,
		};
	}

	let tokenCreated = false;

	try {
		await store.createToken({
			email: normalizedEmail,
			tokenHash,
			expiresAt,
		});
		tokenCreated = true;

		await input.transport.sendMagicLink({
			to: normalizedEmail,
			from: input.from,
			magicLinkUrl: buildMagicLinkUrl(input.baseUrl, token),
			expiresAt,
		});
	} catch {
		// Do not expose delivery failures on the request route. If a token row
		// was created for an email that never received the link, remove it.
		if (tokenCreated) {
			await store.deleteTokenByHash(tokenHash).catch(() => 0);
		}
	}

	return {
		status: "sent_or_ignored",
		message: MAGIC_LINK_REQUEST_SUCCESS_MESSAGE,
		knownUser: false,
	};
}

export async function consumeMagicLinkToken(
	token: string,
	options: {
		store?: MagicLinkStore;
		now?: Date;
		workspaceResolver?: MagicLinkWorkspaceResolver;
	} = {},
): Promise<ConsumeMagicLinkResult> {
	const now = options.now ?? new Date();
	const targetTenantId = parseMagicLinkTargetTenantId(token);
	const tokenHash = hashMagicLinkToken(token);
	const store = options.store ?? new PrismaMagicLinkStore();
	const tokenRow = await store.findTokenByHash(tokenHash);

	if (!tokenRow) {
		return invalidOrUsed();
	}

	if (tokenRow.consumedAt) {
		await store.deleteTokenByHash(tokenHash);
		return invalidOrUsed();
	}

	if (tokenRow.expiresAt.getTime() <= now.getTime()) {
		await store.deleteTokenByHash(tokenHash);
		return {
			ok: false,
			reason: "expired",
			message: MAGIC_LINK_EXPIRED_MESSAGE,
		};
	}

	const deletedCount = await store.deleteUsableTokenByHash(tokenHash, now);
	if (deletedCount !== 1) {
		return invalidOrUsed();
	}

	let userTenant: UserTenant | null = null;
	if (targetTenantId) {
		userTenant = await store.findUserTenantByEmail(
			tokenRow.email,
			targetTenantId,
			now,
		);
	} else if (options.workspaceResolver) {
		userTenant = await options.workspaceResolver({ email: tokenRow.email });
	} else {
		userTenant = await store.findUserTenantByEmail(tokenRow.email);
	}

	if (!userTenant) {
		return {
			ok: false,
			reason: "no_membership",
			message: MAGIC_LINK_INVALID_OR_USED_MESSAGE,
		};
	}

	return {
		ok: true,
		userId: userTenant.userId,
		tenantId: userTenant.tenantId,
	};
}

export class PrismaMagicLinkStore implements MagicLinkStore {
	private readonly prisma: PrismaClient;

	constructor(prisma: PrismaClient = getPrismaClient()) {
		this.prisma = prisma;
	}

	async findUserTenantByEmail(
		email: string,
		tenantId?: string,
		now: Date = new Date(),
	): Promise<UserTenant | null> {
		const normalizedEmail = normalizeMagicLinkEmail(email);
		const user = await this.prisma.user.findUnique({
			where: { email: normalizedEmail },
			select: {
				id: true,
				memberships: {
					where: tenantId ? { tenantId } : undefined,
					orderBy: { createdAt: "asc" },
					select: { tenantId: true },
					take: 1,
				},
			},
		});

		const membership = user?.memberships[0];
		if (!user || !membership) {
			if (!tenantId || !user) {
				return null;
			}

			return this.acceptPendingInvitationForTargetTenant({
				email: normalizedEmail,
				now,
				tenantId,
				userId: user.id,
			});
		}

		return {
			userId: user.id,
			tenantId: membership.tenantId,
		};
	}

	private async acceptPendingInvitationForTargetTenant(input: {
		email: string;
		now: Date;
		tenantId: string;
		userId: string;
	}): Promise<UserTenant | null> {
		return this.prisma.$transaction(async (tx) => {
			const invitations = await tx.$queryRaw<
				Array<{ id: string; tenantId: string }>
			>`
				SELECT id::text AS "id", tenant_id::text AS "tenantId"
				FROM shared.invitations
				WHERE tenant_id = ${input.tenantId}::uuid
					AND recipient_email = ${input.email}
					AND consumed_at IS NULL
					AND expires_at > ${input.now}
				ORDER BY expires_at DESC
				LIMIT 1
				FOR UPDATE
			`;
			const invitation = invitations[0];

			if (!invitation) {
				return null;
			}

			await tx.tenantMembership.upsert({
				where: {
					tenantId_userId: {
						tenantId: invitation.tenantId,
						userId: input.userId,
					},
				},
				update: {},
				create: {
					tenantId: invitation.tenantId,
					userId: input.userId,
				},
			});
			await tx.invitation.update({
				where: { id: invitation.id },
				data: { consumedAt: input.now },
			});

			return {
				tenantId: invitation.tenantId,
				userId: input.userId,
			};
		});
	}

	async createToken(input: CreateMagicLinkTokenInput): Promise<void> {
		await this.prisma.magicLinkToken.create({
			data: {
				email: input.email,
				tokenHash: Buffer.from(input.tokenHash),
				expiresAt: input.expiresAt,
			},
		});
	}

	async countUsableTokensByEmail(email: string, now: Date): Promise<number> {
		return this.prisma.magicLinkToken.count({
			where: {
				email,
				consumedAt: null,
				expiresAt: { gt: now },
			},
		});
	}

	async findTokenByHash(
		tokenHash: Uint8Array,
	): Promise<MagicLinkTokenRow | null> {
		const token = await this.prisma.magicLinkToken.findUnique({
			where: { tokenHash: Buffer.from(tokenHash) },
		});

		return token
			? {
					id: token.id,
					email: token.email,
					tokenHash: token.tokenHash,
					expiresAt: token.expiresAt,
					consumedAt: token.consumedAt,
				}
			: null;
	}

	async deleteTokenByHash(tokenHash: Uint8Array): Promise<number> {
		const result = await this.prisma.magicLinkToken.deleteMany({
			where: { tokenHash: Buffer.from(tokenHash) },
		});
		return result.count;
	}

	async deleteUsableTokenByHash(
		tokenHash: Uint8Array,
		now: Date,
	): Promise<number> {
		const result = await this.prisma.magicLinkToken.deleteMany({
			where: {
				tokenHash: Buffer.from(tokenHash),
				consumedAt: null,
				expiresAt: { gt: now },
			},
		});
		return result.count;
	}

	async deleteExpiredTokens(now: Date): Promise<number> {
		const result = await this.prisma.magicLinkToken.deleteMany({
			where: {
				expiresAt: { lte: now },
			},
		});
		return result.count;
	}
}

export class PrismaMagicLinkRateLimitStore implements MagicLinkRateLimitStore {
	private readonly prisma: PrismaClient;

	constructor(prisma: PrismaClient = getPrismaClient()) {
		this.prisma = prisma;
	}

	async incrementBucket(scope: string, bucketStart: Date): Promise<number> {
		const rows = await this.prisma.$queryRaw<Array<{ count: number | bigint }>>`
			INSERT INTO "shared"."magic_link_request_limits"
				("scope", "bucket_start", "count", "updated_at")
			VALUES (${scope}, ${bucketStart}, 1, CURRENT_TIMESTAMP)
			ON CONFLICT ("scope", "bucket_start")
			DO UPDATE SET
				"count" = "shared"."magic_link_request_limits"."count" + 1,
				"updated_at" = CURRENT_TIMESTAMP
			RETURNING "count"
		`;

		return Number(rows[0]?.count ?? 0);
	}

	async deleteBucketsBefore(cutoff: Date): Promise<void> {
		await this.prisma.$executeRaw`
			DELETE FROM "shared"."magic_link_request_limits"
			WHERE "bucket_start" < ${cutoff}
		`;
	}
}

function getPrismaClient(): PrismaClient {
	if (!globalState.__ssfwPrisma) {
		globalState.__ssfwPrisma = new PrismaClient();
	}

	return globalState.__ssfwPrisma;
}

function invalidOrUsed(): ConsumeMagicLinkResult {
	return {
		ok: false,
		reason: "invalid_or_used",
		message: MAGIC_LINK_INVALID_OR_USED_MESSAGE,
	};
}

type RateLimitScope = {
	key: string;
	limit: number;
	windowMs: number;
};

function magicLinkRequestRateLimitScopes(
	normalizedEmail: string,
	clientIp: string | undefined,
): RateLimitScope[] {
	const scopes: RateLimitScope[] = [
		{
			key: `email:${normalizedEmail}`,
			limit: MAGIC_LINK_RATE_LIMIT,
			windowMs: MAGIC_LINK_RATE_LIMIT_WINDOW_MS,
		},
		{
			key: "global",
			limit: MAGIC_LINK_GLOBAL_RATE_LIMIT,
			windowMs: MAGIC_LINK_RATE_LIMIT_WINDOW_MS,
		},
	];
	const clientIpScope = normalizedClientIpScope(clientIp);

	if (clientIpScope) {
		scopes.splice(1, 0, {
			key: clientIpScope,
			limit: MAGIC_LINK_IP_RATE_LIMIT,
			windowMs: MAGIC_LINK_RATE_LIMIT_WINDOW_MS,
		});
	}

	return scopes;
}

function normalizedClientIpScope(clientIp: string | undefined): string | null {
	const normalized = clientIp?.trim().toLowerCase();
	if (!normalized) {
		return null;
	}

	const digest = createHash("sha256").update(normalized).digest("hex");
	return `ip:${digest.slice(0, 32)}`;
}

function bucketStartFor(now: Date, windowMs: number): Date {
	return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

function retryAfterSecondsForBucket(
	bucketStart: Date,
	windowMs: number,
	now: Date,
): number {
	const retryAfterMs = bucketStart.getTime() + windowMs - now.getTime();
	return Math.max(1, Math.ceil(retryAfterMs / 1000));
}

async function countUsableTokensByEmail(
	store: MagicLinkStore,
	email: string,
	now: Date,
): Promise<number> {
	return store.countUsableTokensByEmail?.(email, now) ?? 0;
}

function normalizeTargetTenantId(
	tenantId: string | undefined,
): string | undefined {
	if (!tenantId) {
		return undefined;
	}

	const normalized = tenantId.trim().toLowerCase();
	if (!UUID_PATTERN.test(normalized)) {
		throw new Error("Magic-link target tenant must be a UUID.");
	}

	return normalized;
}

function parseMagicLinkTargetTenantId(token: string): string | undefined {
	const dotIndex = token.indexOf(".");
	if (dotIndex === -1 || token.indexOf(".", dotIndex + 1) !== -1) {
		return undefined;
	}

	const tenantId = token.slice(dotIndex + 1);
	return UUID_PATTERN.test(tenantId) ? tenantId.toLowerCase() : undefined;
}
