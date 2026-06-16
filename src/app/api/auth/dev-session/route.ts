import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import {
	authCookieSecurityContextFromRequest,
	CSRF_COOKIE_NAME,
	LOCALE_COOKIE_NAME,
	setSessionCookie,
	shouldUseSecureAuthCookies,
} from "../../../../lib/auth/cookies";
import { resolveUiLocale, type UiLocale } from "../../../../lib/auth/locale";
import { normalizeLocalReturnTo } from "../../../../lib/auth/return-to";
import { issueSession } from "../../../../lib/auth/session";
import { prisma, provisionTenantSchema } from "../../../../lib/db";
import { DISCLAIMER_VERSION } from "../../../../lib/legal/disclaimer";

export const runtime = "nodejs";

const defaultDevEmail = "tester@safetysecretary.local";
const defaultDevCompanyName = "Safety Secretary Test Workspace";
const csrfCookieMaxAgeSeconds = 30 * 24 * 60 * 60;

type DevLoginBody = {
	returnTo?: unknown;
};

type DevWorkspace = {
	tenantId: string;
	userId: string;
};

export async function POST(request: NextRequest): Promise<NextResponse> {
	if (!isDevAuthBypassEnabled()) {
		return NextResponse.json({ code: "NOT_FOUND" }, { status: 404 });
	}

	const returnTo = safeReturnTo(await readReturnTo(request));
	// Seed the test workspace's language from the visitor's current choice (the
	// ssfw_locale cookie the landing dropdown writes) or their browser, instead
	// of forcing English — otherwise a language picked before "Try it" is lost
	// at login because user.uiLocale outranks the cookie in the resolver.
	const seededLocale = resolveUiLocale({
		acceptLanguageHeader: request.headers.get("accept-language"),
		cookieLocale: request.cookies.get(LOCALE_COOKIE_NAME)?.value,
	});
	const workspace = await ensureDevWorkspace(seededLocale);
	const session = await issueSession(
		workspace.userId,
		workspace.tenantId,
		request.headers.get("user-agent"),
	);

	const response = NextResponse.json({
		message: "Development session started.",
		redirectTo: returnTo,
		tenantId: workspace.tenantId,
		userId: workspace.userId,
	});

	const cookieSecurity = authCookieSecurityContextFromRequest(request);
	setSessionCookie(response, session, cookieSecurity);
	setCsrfCookie(response, cookieSecurity);

	return response;
}

function isDevAuthBypassEnabled(): boolean {
	// Dev convenience: bypass works in non-production when SSFW_DEV_AUTH_BYPASS=1.
	// Public test workspaces: a deliberate, explicitly-named flag also allows the
	// "Try it" button on a live (production) demo so people can skip magic-link.
	if (process.env.SSFW_PUBLIC_TEST_LOGIN === "1") {
		return true;
	}
	return (
		process.env.NODE_ENV !== "production" &&
		process.env.SSFW_DEV_AUTH_BYPASS === "1"
	);
}

async function ensureDevWorkspace(
	seededLocale: UiLocale,
): Promise<DevWorkspace> {
	const email = normalizedDevEmail();
	const companyName =
		process.env.SSFW_DEV_AUTH_COMPANY_NAME?.trim() || defaultDevCompanyName;

	return prisma.$transaction(
		async (tx) => {
			const user = await tx.user.upsert({
				create: {
					email,
					uiLocale: seededLocale,
				},
				update: {
					uiLocale: seededLocale,
				},
				where: { email },
			});
			const existingMembership = await tx.tenantMembership.findFirst({
				include: { tenant: true },
				orderBy: { createdAt: "asc" },
				where: {
					userId: user.id,
					tenant: { deletedAt: null },
				},
			});

			if (existingMembership) {
				await tx.userAcknowledgement.upsert({
					create: {
						disclaimerVersion: DISCLAIMER_VERSION,
						userId: user.id,
					},
					update: {
						acknowledgedAt: new Date(),
					},
					where: {
						userId_disclaimerVersion: {
							disclaimerVersion: DISCLAIMER_VERSION,
							userId: user.id,
						},
					},
				});
				return {
					tenantId: existingMembership.tenantId,
					userId: user.id,
				};
			}

			const tenant = await tx.tenant.create({
				data: {
					defaultLanguage: seededLocale,
					name: companyName,
				},
			});

			await provisionTenantSchema(tenant.id, tx);

			await tx.tenantMembership.create({
				data: {
					tenantId: tenant.id,
					userId: user.id,
				},
			});

			await tx.userAcknowledgement.upsert({
				create: {
					disclaimerVersion: DISCLAIMER_VERSION,
					userId: user.id,
				},
				update: {
					acknowledgedAt: new Date(),
				},
				where: {
					userId_disclaimerVersion: {
						disclaimerVersion: DISCLAIMER_VERSION,
						userId: user.id,
					},
				},
			});

			return {
				tenantId: tenant.id,
				userId: user.id,
			};
		},
		{ timeout: 15_000 },
	);
}

function normalizedDevEmail(): string {
	return (process.env.SSFW_DEV_AUTH_EMAIL ?? defaultDevEmail)
		.trim()
		.toLowerCase();
}

async function readReturnTo(request: NextRequest): Promise<string | null> {
	const contentType = request.headers.get("content-type") ?? "";

	if (!contentType.includes("application/json")) {
		return request.nextUrl.searchParams.get("returnTo");
	}

	const body = (await request.json().catch(() => null)) as DevLoginBody | null;
	return typeof body?.returnTo === "string" ? body.returnTo : null;
}

function safeReturnTo(value: string | null): string {
	return normalizeLocalReturnTo(value);
}

function setCsrfCookie(
	response: NextResponse,
	cookieSecurity: ReturnType<typeof authCookieSecurityContextFromRequest>,
): void {
	response.cookies.set(CSRF_COOKIE_NAME, randomUUID(), {
		httpOnly: false,
		maxAge: csrfCookieMaxAgeSeconds,
		path: "/",
		sameSite: "lax",
		secure: shouldUseSecureAuthCookies(cookieSecurity),
	});
}
