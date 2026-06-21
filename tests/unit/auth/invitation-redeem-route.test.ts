import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (
			context.parentURL?.endsWith(
				"/src/app/api/auth/invitations/redeem/route.ts",
			)
		) {
			if (specifier === "next/server") {
				return nextResolve("next/server.js", context);
			}

			if (specifier.endsWith("/lib/auth/cookies")) {
				return dataModuleUrl(`
					export const SESSION_COOKIE_NAME = "safetysecretary_session";
					export function readSessionCookie(cookies) {
						return cookies.get("safetysecretary_session")?.value ?? cookies.get("ssfw_session")?.value;
					}
					export function authCookieSecurityContextFromRequest() {
						return {};
					}
					export function setSessionCookie(response, session) {
						for (const name of ["safetysecretary_session", "ssfw_session"]) {
							response.cookies.set(name, session.cookieValue, {
								httpOnly: true,
								maxAge: session.maxAgeSeconds,
								path: "/",
								sameSite: "lax",
								secure: false,
							});
						}
					}
				`);
			}

			if (specifier.endsWith("/lib/auth/csrf")) {
				return dataModuleUrl(`
					export function verifyCsrfRequest(headers, sessionId) {
						return (headers.get("x-safetysecretary-csrf") ?? headers.get("x-ssfw-csrf")) === "csrf-" + sessionId;
					}
					export function setCsrfCookie(response, sessionId) {
						for (const name of ["safetysecretary_csrf", "ssfw_csrf"]) {
							response.cookies.set(name, "csrf-" + sessionId, {
								httpOnly: false,
								maxAge: 2592000,
								path: "/",
								sameSite: "lax",
								secure: false,
							});
						}
					}
				`);
			}

			if (specifier.endsWith("/lib/auth/invitations")) {
				return dataModuleUrl(`
					export async function redeemInvitationToken(input) {
						globalThis.__ssfwInviteRedeemCalls ??= [];
						globalThis.__ssfwInviteRedeemCalls.push(input);
						return globalThis.__ssfwInviteRedeemResult;
					}
				`);
			}

			if (specifier.endsWith("/lib/auth/session")) {
				return dataModuleUrl(`
					export class SessionTenantMembershipError extends Error {
						constructor() {
							super("Session creation requires an active tenant membership.");
							this.code = "SESSION_TENANT_MEMBERSHIP_REQUIRED";
						}
					}
					export async function validateSession() {
						return globalThis.__ssfwInviteRouteSession ?? null;
					}
					export async function issueSession(userId, tenantId, deviceHint) {
						globalThis.__ssfwInviteIssueSessionCalls ??= [];
						globalThis.__ssfwInviteIssueSessionCalls.push({ deviceHint, tenantId, userId });
						return {
							cookieValue: "session-invited-tenant",
							maxAgeSeconds: 2592000,
							tenantId,
							userId,
						};
					}
				`);
			}
		}

		if (context.parentURL && isLocalImport(specifier)) {
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
		}

		return nextResolve(specifier, context);
	},
});

const { NextRequest } = (await import(
	"next/server.js"
)) as typeof import("next/server");
const { POST: redeemInvite } = (await import(
	moduleUrl("src/app/api/auth/invitations/redeem/route.ts")
)) as typeof import("../../../src/app/api/auth/invitations/redeem/route");

const globalState = globalThis as typeof globalThis & {
	__ssfwInviteIssueSessionCalls?: unknown[];
	__ssfwInviteRedeemCalls?: unknown[];
	__ssfwInviteRedeemResult?: unknown;
	__ssfwInviteRouteSession?: {
		id: string;
		tenantId: string;
		userId: string;
	} | null;
};

test("invitation redeem route switches the session to the invited tenant", async () => {
	globalState.__ssfwInviteIssueSessionCalls = [];
	globalState.__ssfwInviteRedeemCalls = [];
	globalState.__ssfwInviteRouteSession = {
		id: "session-original",
		tenantId: "tenant-original",
		userId: "user-recipient",
	};
	globalState.__ssfwInviteRedeemResult = {
		ok: true,
		message: "Invitation accepted.",
		tenantId: "tenant-invited",
		userId: "user-recipient",
	};

	const response = await redeemInvite(
		new NextRequest("https://app.example.test/api/auth/invitations/redeem", {
			body: JSON.stringify({ token: "invite-token" }),
			headers: {
				cookie: "ssfw_session=session-original",
				"content-type": "application/json",
				"user-agent": "Desktop Browser",
				"x-ssfw-csrf": "csrf-session-original",
			},
			method: "POST",
		}),
	);

	assert.equal(response.status, 200);
	assert.deepEqual(await response.json(), {
		message: "Invitation accepted.",
		tenantId: "tenant-invited",
		userId: "user-recipient",
	});
	assert.deepEqual(globalState.__ssfwInviteRedeemCalls, [
		{ token: "invite-token", userId: "user-recipient" },
	]);
	assert.deepEqual(globalState.__ssfwInviteIssueSessionCalls, [
		{
			deviceHint: "Desktop Browser",
			tenantId: "tenant-invited",
			userId: "user-recipient",
		},
	]);

	const setCookie = response.headers.get("set-cookie") ?? "";
	assert.match(setCookie, /ssfw_session=session-invited-tenant/);
	assert.match(setCookie, /ssfw_csrf=csrf-session-invited-tenant/);
});

function dataModuleUrl(source: string) {
	return {
		shortCircuit: true,
		url: `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`,
	};
}

function moduleUrl(relativePath: string): string {
	return pathToFileURL(`${process.cwd()}/${relativePath}`).href;
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith(".") || specifier.startsWith("/");
}
