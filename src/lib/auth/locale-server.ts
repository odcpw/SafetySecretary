import { cookies, headers } from "next/headers";
import { prisma } from "../db";
import type { Locale } from "../i18n/types";
import { LOCALE_COOKIE_NAME, SESSION_COOKIE_NAME } from "./cookies";
import { resolveUiLocale } from "./locale";
import { type ValidatedSession, validateSession } from "./session";

export type SessionIdentity = Pick<ValidatedSession, "tenantId" | "userId">;

export type ResolvedLocaleContext = {
	locale: Locale;
	session: SessionIdentity | null;
};

/**
 * The single server-side entry point every authenticated page uses to learn
 * (a) who is signed in and (b) which language to render. It consolidates the
 * previously duplicated per-page `resolveSessionContext()` helpers onto one
 * resolution order: signed-in `user.uiLocale` → `ssfw_locale` cookie →
 * Accept-Language → default. Pages must NOT re-derive a locale on their own.
 */
export async function resolveLocaleContext(): Promise<ResolvedLocaleContext> {
	const [requestHeaders, requestCookies] = await Promise.all([
		headers(),
		cookies(),
	]);

	const session = await resolveSessionIdentity(requestCookies);
	const userLocale = session ? await loadUserLocale(session.userId) : undefined;

	const locale = resolveUiLocale({
		acceptLanguageHeader: requestHeaders.get("accept-language"),
		cookieLocale: requestCookies.get(LOCALE_COOKIE_NAME)?.value,
		userLocale,
	});

	return { locale, session };
}

async function resolveSessionIdentity(
	requestCookies: Awaited<ReturnType<typeof cookies>>,
): Promise<SessionIdentity | null> {
	const validated = await validateSession(
		requestCookies.get(SESSION_COOKIE_NAME)?.value,
	);

	return validated
		? { tenantId: validated.tenantId, userId: validated.userId }
		: null;
}

async function loadUserLocale(userId: string): Promise<string | null> {
	const user = await prisma.user.findUnique({
		select: { uiLocale: true },
		where: { id: userId },
	});

	return user?.uiLocale ?? null;
}
