import { createHash, randomBytes } from "node:crypto";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
	DEFAULT_MAGIC_LINK_DEV_EMAIL_LOG,
	type EmailTransport,
} from "../email/transport";
import {
	MAGIC_LINK_TTL_MS,
	type MagicLinkStore,
	PrismaMagicLinkStore,
	buildMagicLinkUrl,
	generateMagicLinkToken,
	hashMagicLinkToken,
	isValidMagicLinkEmail,
	normalizeMagicLinkEmail,
} from "./magic-link";

export const INVITATION_TOKEN_BYTES = 32;
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITATION_CREATED_MESSAGE = "Invitation created.";
export const INVITATION_INVALID_MESSAGE = "Invitation invalid.";
export const INVITATION_EXPIRED_MESSAGE = "Invitation expired";
export const INVITATION_ALREADY_USED_MESSAGE = "Already used";
export const INVITATION_EMAIL_MISMATCH_MESSAGE =
	"This invitation was sent to a different email address.";
export const INVITATION_MAGIC_LINK_SENT_MESSAGE =
	"Sign-in link sent to the invited email address.";

const UUID_PATTERN =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type GlobalState = typeof globalThis & {
	__ssfwInvitationPrisma?: PrismaClient;
};

const globalState = globalThis as GlobalState;

export type InvitationEmail = {
	to: string;
	from: string;
	inviteUrl: string;
	tenantName: string;
	expiresAt: Date;
};

export interface InvitationEmailTransport {
	sendInvitation(email: InvitationEmail): Promise<void>;
}

export class DevFileInvitationEmailTransport
	implements InvitationEmailTransport
{
	private readonly logPath: string;

	constructor(logPath: string = DEFAULT_MAGIC_LINK_DEV_EMAIL_LOG) {
		this.logPath = logPath;
	}

	async sendInvitation(email: InvitationEmail): Promise<void> {
		const absoluteLogPath = resolve(this.logPath);
		await mkdir(dirname(absoluteLogPath), { recursive: true });

		const payload = {
			kind: "invitation",
			to: email.to,
			from: email.from,
			subject: `Invitation to ${email.tenantName} on Safety Secretary`,
			inviteUrl: email.inviteUrl,
			tenantName: email.tenantName,
			expiresAt: email.expiresAt.toISOString(),
			sentAt: new Date().toISOString(),
		};

		await appendFile(absoluteLogPath, `${JSON.stringify(payload)}\n`, {
			encoding: "utf8",
			mode: 0o600,
		});
	}
}

export function createInvitationEmailTransport(
	env: Pick<NodeJS.ProcessEnv, string> = process.env,
): InvitationEmailTransport {
	return new DevFileInvitationEmailTransport(
		env.INVITATION_DEV_EMAIL_LOG ??
			env.MAGIC_LINK_DEV_EMAIL_LOG ??
			DEFAULT_MAGIC_LINK_DEV_EMAIL_LOG,
	);
}

export type InvitationRecord = {
	id: string;
	tenantId: string;
	tenantName: string;
	recipientEmail: string;
	tokenHash: Uint8Array;
	expiresAt: Date;
	consumedAt: Date | null;
	createdById: string;
	createdByEmail?: string;
};

export type InvitationListItem = Omit<InvitationRecord, "tokenHash">;

export type CreateInvitationStoreInput = {
	tenantId: string;
	actorUserId: string;
	recipientEmail: string;
	tokenHash: Uint8Array;
	expiresAt: Date;
};

export type EnsureInviteMagicLinkRecipientResult = {
	tenantId: string;
	recipientEmail: string;
	userId: string;
};

export type RedeemInvitationInput = {
	tokenHash: Uint8Array;
	userId: string;
	now: Date;
};

export type RedeemInvitationResult =
	| {
			ok: true;
			invitationId: string;
			tenantId: string;
			userId: string;
			message: "Invitation accepted.";
	  }
	| {
			ok: false;
			reason: "invalid" | "expired" | "used" | "mismatch";
			message: string;
	  };

export interface InvitationStore {
	createInvitation(input: CreateInvitationStoreInput): Promise<InvitationRecord>;
	listInvitations(input: {
		tenantId: string;
		actorUserId: string;
	}): Promise<InvitationListItem[]>;
	findInvitationByTokenHash(
		tokenHash: Uint8Array,
	): Promise<InvitationRecord | null>;
	ensureInviteMagicLinkRecipient(input: {
		tokenHash: Uint8Array;
		now: Date;
	}): Promise<EnsureInviteMagicLinkRecipientResult>;
	redeemInvitation(input: RedeemInvitationInput): Promise<RedeemInvitationResult>;
}

export type CreateInvitationResult = {
	status: "created";
	message: typeof INVITATION_CREATED_MESSAGE;
	token: string;
	inviteUrl: string;
	invitation: InvitationListItem;
};

export type InvitationLandingResult =
	| {
			ok: true;
			status: "active";
			token: string;
			tenantName: string;
			recipientEmail: string;
			expiresAt: Date;
	  }
	| {
			ok: false;
			reason: "invalid" | "expired" | "used";
			message: string;
			tenantName?: string;
			recipientEmail?: string;
			expiresAt?: Date;
	  };

export class InvitationValidationError extends Error {
	readonly status = 400;
	readonly code = "INVALID_INVITATION_EMAIL";

	constructor(message = "Enter a valid email address.") {
		super(message);
		this.name = "InvitationValidationError";
	}
}

export class InvitationAuthorizationError extends Error {
	readonly status = 403;
	readonly code = "TENANT_MEMBERSHIP_REQUIRED";

	constructor() {
		super("Tenant membership required.");
		this.name = "InvitationAuthorizationError";
	}
}

export function generateInvitationToken(options: { tenantId: string }): string {
	const tenantId = normalizeTenantId(options.tenantId);
	const token = randomBytes(INVITATION_TOKEN_BYTES).toString("base64url");
	return `${token}.${tenantId}`;
}

export function hashInvitationToken(token: string): Uint8Array {
	return createHash("sha256").update(token, "utf8").digest();
}

export function buildInvitationUrl(baseUrl: string, token: string): string {
	const url = new URL(`/invite/${encodeURIComponent(token)}`, baseUrl);
	return url.toString();
}

export async function createInvitation(input: {
	tenantId: string;
	actorUserId: string;
	recipientEmail: string;
	baseUrl: string;
	from: string;
	now?: Date;
	store?: InvitationStore;
	transport?: InvitationEmailTransport;
}): Promise<CreateInvitationResult> {
	const recipientEmail = normalizeAndValidateInvitationEmail(
		input.recipientEmail,
	);
	const tenantId = normalizeTenantId(input.tenantId);
	const actorUserId = normalizeTenantId(input.actorUserId);
	const now = input.now ?? new Date();
	const token = generateInvitationToken({ tenantId });
	const tokenHash = hashInvitationToken(token);
	const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
	const store = input.store ?? new PrismaInvitationStore();
	const transport = input.transport ?? createInvitationEmailTransport();

	const invitation = await store.createInvitation({
		tenantId,
		actorUserId,
		recipientEmail,
		tokenHash,
		expiresAt,
	});
	const inviteUrl = buildInvitationUrl(input.baseUrl, token);

	await transport.sendInvitation({
		to: invitation.recipientEmail,
		from: input.from,
		inviteUrl,
		tenantName: invitation.tenantName,
		expiresAt: invitation.expiresAt,
	});

	return {
		status: "created",
		message: INVITATION_CREATED_MESSAGE,
		token,
		inviteUrl,
		invitation: stripTokenHash(invitation),
	};
}

export async function listInvitations(input: {
	tenantId: string;
	actorUserId: string;
	store?: InvitationStore;
}): Promise<InvitationListItem[]> {
	const store = input.store ?? new PrismaInvitationStore();
	return store.listInvitations({
		tenantId: normalizeTenantId(input.tenantId),
		actorUserId: normalizeTenantId(input.actorUserId),
	});
}

export async function readInvitationLanding(input: {
	token: string;
	now?: Date;
	store?: InvitationStore;
}): Promise<InvitationLandingResult> {
	const token = input.token.trim();
	if (!token) {
		return invalidLandingInvitation();
	}

	const store = input.store ?? new PrismaInvitationStore();
	const invitation = await store.findInvitationByTokenHash(
		hashInvitationToken(token),
	);

	if (!invitation) {
		return invalidLandingInvitation();
	}

	const state = invitationState(invitation, input.now ?? new Date());
	if (state !== "active") {
		return {
			ok: false,
			reason: state,
			message:
				state === "expired"
					? INVITATION_EXPIRED_MESSAGE
					: INVITATION_ALREADY_USED_MESSAGE,
			tenantName: invitation.tenantName,
			recipientEmail: invitation.recipientEmail,
			expiresAt: invitation.expiresAt,
		};
	}

	return {
		ok: true,
		status: "active",
		token,
		tenantName: invitation.tenantName,
		recipientEmail: invitation.recipientEmail,
		expiresAt: invitation.expiresAt,
	};
}

export async function requestInvitationMagicLink(input: {
	token: string;
	baseUrl: string;
	from: string;
	now?: Date;
	store?: InvitationStore;
	magicLinkTransport: EmailTransport;
	magicLinkStore?: MagicLinkStore;
}): Promise<{ message: typeof INVITATION_MAGIC_LINK_SENT_MESSAGE }> {
	const token = input.token.trim();
	const now = input.now ?? new Date();
	const store = input.store ?? new PrismaInvitationStore();
	const target = await store.ensureInviteMagicLinkRecipient({
		tokenHash: hashInvitationToken(token),
		now,
	});
	const magicLinkStore = input.magicLinkStore ?? new PrismaMagicLinkStore();
	const magicToken = generateMagicLinkToken({ targetTenantId: target.tenantId });
	const tokenHash = hashMagicLinkToken(magicToken);
	const expiresAt = new Date(now.getTime() + MAGIC_LINK_TTL_MS);

	await magicLinkStore.deleteExpiredTokens(now);

	let tokenCreated = false;
	try {
		await magicLinkStore.createToken({
			email: target.recipientEmail,
			tokenHash,
			expiresAt,
		});
		tokenCreated = true;

		await input.magicLinkTransport.sendMagicLink({
			to: target.recipientEmail,
			from: input.from,
			magicLinkUrl: buildMagicLinkUrl(input.baseUrl, magicToken),
			expiresAt,
		});
	} catch {
		if (tokenCreated) {
			await magicLinkStore.deleteTokenByHash(tokenHash).catch(() => 0);
		}
	}

	return { message: INVITATION_MAGIC_LINK_SENT_MESSAGE };
}

export async function redeemInvitationToken(input: {
	token: string;
	userId: string;
	now?: Date;
	store?: InvitationStore;
}): Promise<RedeemInvitationResult> {
	const token = input.token.trim();
	if (!token) {
		return invalidInvitation();
	}

	const store = input.store ?? new PrismaInvitationStore();
	return store.redeemInvitation({
		tokenHash: hashInvitationToken(token),
		userId: normalizeTenantId(input.userId),
		now: input.now ?? new Date(),
	});
}

export class PrismaInvitationStore implements InvitationStore {
	private readonly prisma: PrismaClient;

	constructor(prisma: PrismaClient = getInvitationPrismaClient()) {
		this.prisma = prisma;
	}

	async createInvitation(
		input: CreateInvitationStoreInput,
	): Promise<InvitationRecord> {
		const invitation = await this.prisma.$transaction(async (tx) => {
			const membership = await tx.tenantMembership.findFirst({
				where: {
					tenantId: input.tenantId,
					userId: input.actorUserId,
				},
				select: {
					tenant: {
						select: {
							name: true,
						},
					},
				},
			});

			if (!membership) {
				throw new InvitationAuthorizationError();
			}

			return tx.invitation.create({
				data: {
					tenantId: input.tenantId,
					recipientEmail: input.recipientEmail,
					tokenHash: Buffer.from(input.tokenHash),
					expiresAt: input.expiresAt,
					createdById: input.actorUserId,
				},
				include: invitationInclude,
			});
		});

		return toInvitationRecord(invitation);
	}

	async listInvitations(input: {
		tenantId: string;
		actorUserId: string;
	}): Promise<InvitationListItem[]> {
		const membership = await this.prisma.tenantMembership.findFirst({
			where: {
				tenantId: input.tenantId,
				userId: input.actorUserId,
			},
			select: { id: true },
		});

		if (!membership) {
			throw new InvitationAuthorizationError();
		}

		const invitations = await this.prisma.invitation.findMany({
			where: { tenantId: input.tenantId },
			orderBy: { expiresAt: "desc" },
			include: invitationInclude,
		});

		return invitations.map((invitation) =>
			stripTokenHash(toInvitationRecord(invitation)),
		);
	}

	async findInvitationByTokenHash(
		tokenHash: Uint8Array,
	): Promise<InvitationRecord | null> {
		const invitation = await this.prisma.invitation.findUnique({
			where: { tokenHash: Buffer.from(tokenHash) },
			include: invitationInclude,
		});

		return invitation ? toInvitationRecord(invitation) : null;
	}

	async ensureInviteMagicLinkRecipient(input: {
		tokenHash: Uint8Array;
		now: Date;
	}): Promise<EnsureInviteMagicLinkRecipientResult> {
		return this.prisma.$transaction(async (tx) => {
			const invitation = await tx.invitation.findUnique({
				where: { tokenHash: Buffer.from(input.tokenHash) },
				select: {
					tenantId: true,
					recipientEmail: true,
					expiresAt: true,
					consumedAt: true,
				},
			});

			if (!invitation) {
				throw new InvitationValidationError(INVITATION_INVALID_MESSAGE);
			}

			if (invitation.consumedAt) {
				throw new InvitationValidationError(INVITATION_ALREADY_USED_MESSAGE);
			}

			if (invitation.expiresAt.getTime() <= input.now.getTime()) {
				throw new InvitationValidationError(INVITATION_EXPIRED_MESSAGE);
			}

			const recipientEmail = normalizeMagicLinkEmail(
				invitation.recipientEmail,
			);
			const user = await tx.user.upsert({
				where: { email: recipientEmail },
				update: {},
				create: { email: recipientEmail },
				select: { id: true },
			});

			return {
				tenantId: invitation.tenantId,
				recipientEmail,
				userId: user.id,
			};
		});
	}

	async redeemInvitation(
		input: RedeemInvitationInput,
	): Promise<RedeemInvitationResult> {
		return this.prisma.$transaction(async (tx) => {
			const invitations = await tx.$queryRaw<LockedInvitationRow[]>`
				SELECT
					i.id::text AS "id",
					i.tenant_id::text AS "tenantId",
					i.recipient_email::text AS "recipientEmail",
					i.expires_at AS "expiresAt",
					i.consumed_at AS "consumedAt"
				FROM shared.invitations i
				WHERE i.token_hash = ${Buffer.from(input.tokenHash)}
				FOR UPDATE
			`;
			const invitation = invitations[0];

			if (!invitation) {
				return invalidInvitation();
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

			const user = await tx.user.findUnique({
				where: { id: input.userId },
				select: { email: true },
			});

			if (!user) {
				return invalidInvitation();
			}

			if (
				normalizeMagicLinkEmail(user.email) !==
				normalizeMagicLinkEmail(invitation.recipientEmail)
			) {
				return {
					ok: false,
					reason: "mismatch",
					message: INVITATION_EMAIL_MISMATCH_MESSAGE,
				};
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
				ok: true,
				invitationId: invitation.id,
				tenantId: invitation.tenantId,
				userId: input.userId,
				message: "Invitation accepted.",
			};
		});
	}
}

type LockedInvitationRow = {
	id: string;
	tenantId: string;
	recipientEmail: string;
	expiresAt: Date;
	consumedAt: Date | null;
};

const invitationInclude = {
	tenant: {
		select: {
			name: true,
		},
	},
	createdBy: {
		select: {
			email: true,
		},
	},
} as const;

function normalizeAndValidateInvitationEmail(email: string): string {
	const normalized = normalizeMagicLinkEmail(email);

	if (!isValidMagicLinkEmail(normalized)) {
		throw new InvitationValidationError();
	}

	return normalized;
}

function invitationState(
	invitation: Pick<InvitationRecord, "consumedAt" | "expiresAt">,
	now: Date,
): "active" | "expired" | "used" {
	if (invitation.consumedAt) {
		return "used";
	}

	if (invitation.expiresAt.getTime() <= now.getTime()) {
		return "expired";
	}

	return "active";
}

function invalidInvitation(): Extract<RedeemInvitationResult, { ok: false }> {
	return {
		ok: false,
		reason: "invalid",
		message: INVITATION_INVALID_MESSAGE,
	};
}

function invalidLandingInvitation(): Extract<InvitationLandingResult, { ok: false }> {
	return {
		ok: false,
		reason: "invalid",
		message: INVITATION_INVALID_MESSAGE,
	};
}

function stripTokenHash(invitation: InvitationRecord): InvitationListItem {
	const { tokenHash: _tokenHash, ...rest } = invitation;
	return rest;
}

function normalizeTenantId(value: string): string {
	const normalized = value.trim().toLowerCase();
	if (!UUID_PATTERN.test(normalized)) {
		throw new Error("Expected UUID.");
	}

	return normalized;
}

function toInvitationRecord(invitation: {
	id: string;
	tenantId: string;
	recipientEmail: string;
	tokenHash: Uint8Array;
	expiresAt: Date;
	consumedAt: Date | null;
	createdById: string;
	tenant: { name: string };
	createdBy?: { email: string } | null;
}): InvitationRecord {
	return {
		id: invitation.id,
		tenantId: invitation.tenantId,
		tenantName: invitation.tenant.name,
		recipientEmail: invitation.recipientEmail,
		tokenHash: invitation.tokenHash,
		expiresAt: invitation.expiresAt,
		consumedAt: invitation.consumedAt,
		createdById: invitation.createdById,
		createdByEmail: invitation.createdBy?.email,
	};
}

function getInvitationPrismaClient(): PrismaClient {
	if (!globalState.__ssfwInvitationPrisma) {
		globalState.__ssfwInvitationPrisma = new PrismaClient();
	}

	return globalState.__ssfwInvitationPrisma;
}
