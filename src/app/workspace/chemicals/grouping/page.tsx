import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { readSessionCookie } from "../../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../lib/auth/session";
import {
	listChemicalControlGroups,
	serializeChemicalControlGroup,
} from "../../../../lib/chemicals/control-grouping";
import { chemicalControlGroupingViewLabels } from "../../../../lib/chemicals/view-labels";
import { prisma } from "../../../../lib/db";
import { t } from "../../../../lib/i18n/t";
import {
	DEFAULT_LOCALE,
	type Locale,
	type MessageKey,
} from "../../../../lib/i18n/types";
import ChemicalControlGroupingClient from "./ChemicalControlGroupingClient";

export default async function ChemicalControlGroupingPage() {
	const { locale, session } = await resolveSessionContext();

	if (!session) {
		return (
			<GroupingShell locale={locale}>
				<p className="m-0 text-sm text-[var(--color-muted)]">
					{tr(messageKey("incident", "authRequired"), locale)}
				</p>
			</GroupingShell>
		);
	}

	const groups = await listChemicalControlGroups(session.tenantId);

	return (
		<GroupingShell locale={locale}>
			<ChemicalControlGroupingClient
				groups={groups.map(serializeChemicalControlGroup)}
				labels={chemicalControlGroupingViewLabels(locale)}
			/>
		</GroupingShell>
	);
}

function GroupingShell({
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
					<a
						className="text-sm text-[var(--color-muted)] underline-offset-4 hover:text-[var(--color-text)] hover:underline"
						href="/workspace/chemicals"
					>
						{tr(messageKey("chemical", "grouping", "backToList"), locale)}
					</a>
					<h1 className="m-0 text-xl font-semibold">
						{tr(messageKey("chemical", "grouping", "title"), locale)}
					</h1>
					<p className="m-0 max-w-3xl text-sm text-[var(--color-muted)]">
						{tr(messageKey("chemical", "grouping", "description"), locale)}
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
	const session = await validateSession(readSessionCookie(await cookies()));

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
