import { createHash } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import {
	authCookieSecurityContextFromRequest,
	LOCALE_COOKIE_NAME,
	setSessionCookie,
} from "../../../../lib/auth/cookies";
import { hasTrustedAuthRequestOrigin } from "../../../../lib/auth/base-url";
import { setCsrfCookie } from "../../../../lib/auth/csrf";
import { resolveUiLocale, type UiLocale } from "../../../../lib/auth/locale";
import {
	magicLinkClientIpFromHeaders,
	PrismaMagicLinkRateLimitStore,
} from "../../../../lib/auth/magic-link";
import { normalizeLocalReturnTo } from "../../../../lib/auth/return-to";
import { issueSession } from "../../../../lib/auth/session";
import { prisma, provisionTenantSchema } from "../../../../lib/db";
import { DISCLAIMER_VERSION } from "../../../../lib/legal/disclaimer";

export const runtime = "nodejs";

const defaultDevEmail = "tester@safetysecretary.local";
const defaultDevCompanyName = "Safety Secretary Test Workspace";
// Cap credential-less demo session minting per source IP so the public "Try it"
// button can't be used to spray sessions. Scoped separately from magic-link so
// the two never share a bucket.
const devSessionRateLimitPerHour = 10;
const devSessionRateLimitWindowMs = 60 * 60 * 1000;

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

	// proxy.ts lists this path as CSRF-exempt public, so enforce a same-origin
	// check here (mirrors magic-link/verify) to keep cross-site callers out.
	if (!hasTrustedAuthRequestOrigin(request)) {
		return NextResponse.json({ code: "FORBIDDEN" }, { status: 403 });
	}

	const rateLimit = await checkDevSessionRateLimit(request);
	if (!rateLimit.allowed) {
		return NextResponse.json(
			{ code: "RATE_LIMITED" },
			{
				status: 429,
				headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
			},
		);
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
	setCsrfCookie(response, session.cookieValue, cookieSecurity);

	return response;
}

function isDevAuthBypassEnabled(): boolean {
	// Dev convenience: bypass works in non-production when SSFW_DEV_AUTH_BYPASS=1.
	if (process.env.NODE_ENV !== "production") {
		return (
			process.env.SSFW_PUBLIC_TEST_LOGIN === "1" ||
			process.env.SSFW_DEV_AUTH_BYPASS === "1"
		);
	}
	// Public test workspaces on a live (production) demo: SSFW_PUBLIC_TEST_LOGIN
	// is NOT enough on its own — it mints credential-less sessions, so production
	// requires a second, deliberate acknowledgement (SSFW_PUBLIC_TEST_LOGIN_ACK)
	// confirming the operator understands this exposes a shared demo workspace.
	// The session always lands in a dedicated demo tenant (ensureDevWorkspace),
	// never a real customer tenant.
	return (
		process.env.SSFW_PUBLIC_TEST_LOGIN === "1" &&
		process.env.SSFW_PUBLIC_TEST_LOGIN_ACK === "1"
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
			// Attach ONLY to the dedicated demo tenant this route owns (matched by
			// the demo company name), never "the first existing membership" — the
			// demo email could otherwise have been invited into a real customer
			// tenant, which the session must never land in.
			const existingMembership = await tx.tenantMembership.findFirst({
				include: { tenant: true },
				orderBy: { createdAt: "asc" },
				where: {
					userId: user.id,
					tenant: { deletedAt: null, name: companyName },
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

async function checkDevSessionRateLimit(
	request: NextRequest,
): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }> {
	const clientIp = magicLinkClientIpFromHeaders(request.headers);
	if (!clientIp) {
		return { allowed: true };
	}

	const now = new Date();
	const bucketStart = new Date(
		Math.floor(now.getTime() / devSessionRateLimitWindowMs) *
			devSessionRateLimitWindowMs,
	);
	const digest = createHash("sha256")
		.update(clientIp.trim().toLowerCase())
		.digest("hex");
	const scope = `dev-session:ip:${digest.slice(0, 32)}`;
	const store = new PrismaMagicLinkRateLimitStore();

	const count = await store.incrementBucket(scope, bucketStart).catch(() => 0);
	if (count > devSessionRateLimitPerHour) {
		const retryAfterMs =
			bucketStart.getTime() + devSessionRateLimitWindowMs - now.getTime();
		return {
			allowed: false,
			retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
		};
	}

	return { allowed: true };
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
