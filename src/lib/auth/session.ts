import { PrismaClient } from "@prisma/client";

export const DESKTOP_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
export const MOBILE_SESSION_TTL_SECONDS = 90 * 24 * 60 * 60;

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const mobileUserAgentPattern =
	/android|blackberry|iemobile|ipad|iphone|ipod|mobile|opera mini|webos/i;

export type SessionDeviceHint = "desktop" | "mobile";

export type SessionRow = {
	id: string;
	userId: string;
	tenantId: string;
	createdAt: Date;
	expiresAt: Date;
	lastSeenAt: Date;
	deviceHint: SessionDeviceHint;
};

export type IssuedSession = {
	cookieName: "ssfw_session";
	cookieValue: string;
	maxAgeSeconds: number;
	expiresAt: Date;
	userId: string;
	tenantId: string;
};

export type ValidatedSession = {
	id: string;
	userId: string;
	tenantId: string;
	expiresAt: Date;
	lastSeenAt: Date;
	deviceHint: SessionDeviceHint;
};

export type CreateSessionInput = {
	userId: string;
	tenantId: string;
	expiresAt: Date;
	lastSeenAt: Date;
	deviceHint: SessionDeviceHint;
};

export type ExtendSessionInput = {
	expiresAt: Date;
	lastSeenAt: Date;
};

export class SessionTenantMembershipError extends Error {
	readonly code = "SESSION_TENANT_MEMBERSHIP_REQUIRED";

	constructor() {
		super("Session creation requires an active tenant membership.");
		this.name = "SessionTenantMembershipError";
	}
}

export interface SessionStore {
	createSession(input: CreateSessionInput): Promise<SessionRow>;
	findSessionById(sessionId: string): Promise<SessionRow | null>;
	extendSession(
		sessionId: string,
		input: ExtendSessionInput,
	): Promise<SessionRow | null>;
}

type SessionOptions = {
	now?: Date;
	store?: SessionStore;
};

type GlobalState = typeof globalThis & {
	__ssfwSessionPrisma?: PrismaClient;
};

const globalState = globalThis as GlobalState;

export function resolveSessionDeviceHint(
	deviceHint?: string | null,
): SessionDeviceHint {
	if (!deviceHint) {
		return "desktop";
	}

	const normalized = deviceHint.toLowerCase();
	if (normalized === "mobile" || mobileUserAgentPattern.test(normalized)) {
		return "mobile";
	}

	return "desktop";
}

export function sessionTtlSeconds(deviceHint: SessionDeviceHint): number {
	return deviceHint === "mobile"
		? MOBILE_SESSION_TTL_SECONDS
		: DESKTOP_SESSION_TTL_SECONDS;
}

export function sessionExpiresAt(
	now: Date,
	deviceHint: SessionDeviceHint,
): Date {
	return new Date(now.getTime() + sessionTtlSeconds(deviceHint) * 1000);
}

export async function issueSession(
	userId: string,
	tenantId: string,
	deviceHint?: string | null,
	options: SessionOptions = {},
): Promise<IssuedSession> {
	const now = options.now ?? new Date();
	const resolvedDeviceHint = resolveSessionDeviceHint(deviceHint);
	const expiresAt = sessionExpiresAt(now, resolvedDeviceHint);
	const store = options.store ?? new PrismaSessionStore();
	const row = await store.createSession({
		userId,
		tenantId,
		expiresAt,
		lastSeenAt: now,
		deviceHint: resolvedDeviceHint,
	});

	return {
		cookieName: "ssfw_session",
		cookieValue: row.id,
		maxAgeSeconds: sessionTtlSeconds(resolvedDeviceHint),
		expiresAt: row.expiresAt,
		userId: row.userId,
		tenantId: row.tenantId,
	};
}

export async function validateSession(
	cookieValue: string | null | undefined,
	options: SessionOptions = {},
): Promise<ValidatedSession | null> {
	if (!cookieValue || !uuidPattern.test(cookieValue)) {
		return null;
	}

	const now = options.now ?? new Date();
	const store = options.store ?? new PrismaSessionStore();
	const row = await store.findSessionById(cookieValue);

	if (!row || row.expiresAt.getTime() <= now.getTime()) {
		return null;
	}

	return extendSession(row.id, row.deviceHint, { now, store });
}

export async function extendSession(
	sessionId: string,
	deviceHint: string | null | undefined,
	options: SessionOptions = {},
): Promise<ValidatedSession | null> {
	if (!uuidPattern.test(sessionId)) {
		return null;
	}

	const now = options.now ?? new Date();
	const resolvedDeviceHint = resolveSessionDeviceHint(deviceHint);
	const store = options.store ?? new PrismaSessionStore();
	const row = await store.extendSession(sessionId, {
		expiresAt: sessionExpiresAt(now, resolvedDeviceHint),
		lastSeenAt: now,
	});

	return row ? toValidatedSession(row) : null;
}

export class PrismaSessionStore implements SessionStore {
	private readonly prisma: PrismaClient;

	constructor(prisma: PrismaClient = getSessionPrismaClient()) {
		this.prisma = prisma;
	}

	async createSession(input: CreateSessionInput): Promise<SessionRow> {
		const row = await this.prisma.$transaction(async (tx) => {
			const memberships = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id::text AS id
        FROM shared.tenant_memberships
        WHERE tenant_id = ${input.tenantId}::uuid
          AND user_id = ${input.userId}::uuid
        FOR KEY SHARE
      `;

			if (memberships.length !== 1) {
				throw new SessionTenantMembershipError();
			}

			return tx.session.create({
				data: {
					userId: input.userId,
					tenantId: input.tenantId,
					expiresAt: input.expiresAt,
					lastSeenAt: input.lastSeenAt,
					deviceHint: input.deviceHint,
				},
			});
		});

		return toSessionRow(row);
	}

	async findSessionById(sessionId: string): Promise<SessionRow | null> {
		const row = await this.prisma.session.findUnique({
			where: { id: sessionId },
		});

		return row ? toSessionRow(row) : null;
	}

	async extendSession(
		sessionId: string,
		input: ExtendSessionInput,
	): Promise<SessionRow | null> {
		const result = await this.prisma.session.updateMany({
			where: { id: sessionId },
			data: {
				expiresAt: input.expiresAt,
				lastSeenAt: input.lastSeenAt,
			},
		});

		if (result.count !== 1) {
			return null;
		}

		return this.findSessionById(sessionId);
	}
}

function toValidatedSession(row: SessionRow): ValidatedSession {
	return {
		id: row.id,
		userId: row.userId,
		tenantId: row.tenantId,
		expiresAt: row.expiresAt,
		lastSeenAt: row.lastSeenAt,
		deviceHint: row.deviceHint,
	};
}

function toSessionRow(row: {
	id: string;
	userId: string;
	tenantId: string;
	createdAt: Date;
	expiresAt: Date;
	lastSeenAt: Date;
	deviceHint: string | null;
}): SessionRow {
	return {
		id: row.id,
		userId: row.userId,
		tenantId: row.tenantId,
		createdAt: row.createdAt,
		expiresAt: row.expiresAt,
		lastSeenAt: row.lastSeenAt,
		deviceHint: resolveSessionDeviceHint(row.deviceHint),
	};
}

function getSessionPrismaClient(): PrismaClient {
	if (!globalState.__ssfwSessionPrisma) {
		globalState.__ssfwSessionPrisma = new PrismaClient();
	}

	return globalState.__ssfwSessionPrisma;
}
