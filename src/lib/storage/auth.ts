import {
	readCookieMapValue,
	readSessionCookie as readSessionCookieFromStore,
	SESSION_COOKIE_NAMES,
} from "../auth/cookies";
import { type ValidatedSession, validateSession } from "../auth/session";
import { tenantPrefix } from "./keys";

export type TenantSession = Pick<
	ValidatedSession,
	"id" | "tenantId" | "userId"
>;

export type StorageSessionValidator = (
	cookieValue: string | null | undefined,
) => Promise<ValidatedSession | null>;

export class TenantSessionRequiredError extends Error {
	readonly code = "tenant_session_required";

	constructor() {
		super("A valid tenant session is required for storage access.");
		this.name = new.target.name;
	}
}

export class CrossTenantStorageKeyError extends Error {
	readonly code = "cross_tenant_storage_key";

	constructor() {
		super("Storage key does not belong to the active tenant.");
		this.name = new.target.name;
	}
}

export async function requireTenantSession(
	request: Request,
	options: { readonly sessionValidator?: StorageSessionValidator } = {},
): Promise<TenantSession> {
	const sessionValidator = options.sessionValidator ?? validateSession;
	const session = await sessionValidator(readSessionCookie(request));

	if (!session) {
		throw new TenantSessionRequiredError();
	}

	return {
		id: session.id,
		tenantId: session.tenantId,
		userId: session.userId,
	};
}

export function assertKeyBelongsToTenant(key: string, tenantId: string): void {
	const prefix = `${tenantPrefix(tenantId)}/`;

	if (!key.startsWith(prefix) || key.length <= prefix.length) {
		throw new CrossTenantStorageKeyError();
	}
}

export function tenantRelativeKeyFromStorageKey(
	key: string,
	tenantId: string,
): string {
	assertKeyBelongsToTenant(key, tenantId);
	return key.slice(`${tenantPrefix(tenantId)}/`.length);
}

type CookieReadableRequest = Request & {
	readonly cookies?: {
		get(name: string): { readonly value?: string } | undefined;
	};
};

function readSessionCookie(request: Request): string | null {
	const nextCookies = (request as CookieReadableRequest).cookies;
	const nextCookie = nextCookies
		? readSessionCookieFromStore(nextCookies)
		: undefined;

	if (nextCookie) {
		return nextCookie;
	}

	return (
		readCookieMapValue(
			parseCookieHeader(request.headers.get("cookie")),
			SESSION_COOKIE_NAMES,
		) ?? null
	);
}

function parseCookieHeader(headerValue: string | null): Map<string, string> {
	const cookies = new Map<string, string>();

	if (!headerValue) {
		return cookies;
	}

	for (const segment of headerValue.split(";")) {
		const [rawName, ...rawValue] = segment.trim().split("=");
		const name = rawName?.trim();

		if (!name) {
			continue;
		}

		cookies.set(name, rawValue.join("=").trim());
	}

	return cookies;
}
