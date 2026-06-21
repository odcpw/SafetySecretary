import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { readSessionCookie } from "./cookies";
import { type ValidatedSession, validateSession } from "./session";

export type RouteSessionIdentity = Pick<
	ValidatedSession,
	"tenantId" | "userId"
>;

export async function resolveRouteSession(
	request: Pick<NextRequest, "cookies">,
): Promise<RouteSessionIdentity | null> {
	return resolveSessionCookieValue(readSessionCookie(request.cookies));
}

export async function resolveServerSession(): Promise<RouteSessionIdentity | null> {
	const requestCookies = await cookies();
	return resolveSessionCookieValue(readSessionCookie(requestCookies));
}

async function resolveSessionCookieValue(
	cookieValue: string | null | undefined,
): Promise<RouteSessionIdentity | null> {
	const session = await validateSession(cookieValue);
	return session
		? { tenantId: session.tenantId, userId: session.userId }
		: null;
}
