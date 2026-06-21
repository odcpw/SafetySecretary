import { type NextRequest, NextResponse } from "next/server";
import { readSessionCookie } from "../../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../lib/auth/session";
import { prisma } from "../../../../lib/db";
import { type Locale, LOCALES } from "../../../../lib/i18n/types";

export const runtime = "nodejs";

export type LocalePreferenceStore = {
	updateUserLocale(input: {
		locale: Locale;
		tenantId: string;
		userId: string;
	}): Promise<boolean>;
};

type LocalePatchBody = {
	locale?: unknown;
	uiLocale?: unknown;
};

export async function PATCH(request: NextRequest): Promise<NextResponse> {
	return handleLocalePatch(request);
}

export async function handleLocalePatch(
	request: NextRequest,
	store: LocalePreferenceStore = new PrismaLocalePreferenceStore(),
): Promise<NextResponse> {
	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	const locale = parseLocale(await readLocalePatchBody(request));

	if (!locale) {
		return NextResponse.json({ code: "UNSUPPORTED_LOCALE" }, { status: 400 });
	}

	const updated = await store.updateUserLocale({
		locale,
		tenantId: session.tenantId,
		userId: session.userId,
	});

	if (!updated) {
		return NextResponse.json(
			{ code: "TENANT_MEMBERSHIP_REQUIRED" },
			{ status: 403 },
		);
	}

	return NextResponse.json({ locale });
}

export class PrismaLocalePreferenceStore implements LocalePreferenceStore {
	async updateUserLocale(input: {
		locale: Locale;
		tenantId: string;
		userId: string;
	}): Promise<boolean> {
		const result = await prisma.user.updateMany({
			data: { uiLocale: input.locale },
			where: {
				id: input.userId,
				memberships: {
					some: {
						tenantId: input.tenantId,
					},
				},
			},
		});

		return result.count === 1;
	}
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "tenantId" | "userId"> | null> {
	return validateSession(readSessionCookie(request.cookies));
}

async function readLocalePatchBody(request: NextRequest): Promise<unknown> {
	const body = (await request
		.json()
		.catch(() => null)) as LocalePatchBody | null;
	return body?.locale ?? body?.uiLocale ?? null;
}

function parseLocale(value: unknown): Locale | null {
	return typeof value === "string" && isLocale(value) ? value : null;
}

function isLocale(value: string): value is Locale {
	return (LOCALES as readonly string[]).includes(value);
}
