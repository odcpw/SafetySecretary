import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME } from "./cookies";
import { type ValidatedSession, validateSession } from "./session";

export type RouteSessionIdentity = Pick<
	ValidatedSession,
	"tenantId" | "userId"
>;

export async function resolveRouteSession(
	request: Pick<NextRequest, "cookies">,
): Promise<RouteSessionIdentity | null> {
	return resolveSessionCookieValue(
		request.cookies.get(SESSION_COOKIE_NAME)?.value,
	);
}

export async function resolveServerSession(): Promise<RouteSessionIdentity | null> {
	const requestCookies = await cookies();
	return resolveSessionCookieValue(
		requestCookies.get(SESSION_COOKIE_NAME)?.value,
	);
}

async function resolveSessionCookieValue(
	cookieValue: string | null | undefined,
): Promise<RouteSessionIdentity | null> {
	const session = await validateSession(cookieValue);
	return session
		? { tenantId: session.tenantId, userId: session.userId }
		: null;
}
