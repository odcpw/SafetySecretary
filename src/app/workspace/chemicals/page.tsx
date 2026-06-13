import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { SESSION_COOKIE_NAME } from "../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../lib/auth/session";
import {
	getChemicalProfileDetail,
	listChemicalProfiles,
	serializeChemicalProfile,
} from "../../../lib/chemicals/queries";
import { chemicalProfileViewLabels } from "../../../lib/chemicals/view-labels";
import { prisma } from "../../../lib/db";
import { t } from "../../../lib/i18n/t";
import {
	DEFAULT_LOCALE,
	type Locale,
	type MessageKey,
} from "../../../lib/i18n/types";
import ChemicalProfilesClient from "./ChemicalProfilesClient";

type ChemicalsPageProps = {
	searchParams?:
		| Promise<Record<string, string | string[] | undefined>>
		| Record<string, string | string[] | undefined>;
};

export default async function ChemicalsPage({
	searchParams,
}: ChemicalsPageProps = {}) {
	const { locale, session } = await resolveSessionContext();
	const profileParam = stringParam(
		(await Promise.resolve(searchParams ?? {})).profile,
	);

	if (!session) {
		return (
			<ChemicalsShell locale={locale}>
				<p className="m-0 text-sm text-[var(--color-muted)]">
					{tr(messageKey("incident", "authRequired"), locale)}
				</p>
			</ChemicalsShell>
		);
	}

	const rows = await listChemicalProfiles(session.tenantId);
	const details = await Promise.all(
		rows.map((row) => getChemicalProfileDetail(session.tenantId, row.id)),
	);
	const serializedProfiles = details
		.filter((row) => row !== null)
		.map((row) => serializeChemicalProfile(row));

	return (
		<ChemicalsShell locale={locale}>
			<ChemicalProfilesClient
				initialProfileId={profileParam}
				initialProfiles={serializedProfiles}
				labels={chemicalProfileViewLabels(locale)}
			/>
		</ChemicalsShell>
	);
}

function ChemicalsShell({
	children,
	locale,
}: {
	children: ReactNode;
	locale: Locale;
}) {
	return (
		<main className="min-h-screen bg-[var(--color-bg)] px-4 py-5 text-[var(--color-text)] lg:px-6">
			<div className="mx-auto grid w-full max-w-7xl gap-5">
				<header className="grid gap-2">
					<h1 className="m-0 text-xl font-semibold">
						{tr("chemical.list.title", locale)}
					</h1>
					<p className="m-0 max-w-3xl text-sm text-[var(--color-muted)]">
						{tr("chemical.empty.body", locale)}
					</p>
				</header>
				{children}
			</div>
		</main>
	);
}

async function resolveSessionContext(): Promise<{
	locale: Locale;
	session: Pick<ValidatedSession, "tenantId" | "userId"> | null;
}> {
	const session = await validateSession(
		(await cookies()).get(SESSION_COOKIE_NAME)?.value,
	);

	if (!session) {
		return { locale: DEFAULT_LOCALE, session: null };
	}

	return {
		locale: await loadUserLocale(session.userId),
		session,
	};
}

async function loadUserLocale(userId: string): Promise<Locale> {
	const user = await prisma.user.findUnique({
		select: { uiLocale: true },
		where: { id: userId },
	});

	return user?.uiLocale ?? DEFAULT_LOCALE;
}

function tr(key: MessageKey, locale: Locale): string {
	return t(key, locale);
}

function messageKey(...parts: string[]): MessageKey {
	return parts.join(".") as MessageKey;
}

function stringParam(value: string | string[] | undefined): string | null {
	if (typeof value === "string") {
		return value;
	}

	return Array.isArray(value) ? (value[0] ?? null) : null;
}
