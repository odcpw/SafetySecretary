import { cookies } from "next/headers";
import type { ReactNode } from "react";
import {
	normalizeActionItemStatusFilter,
	normalizeActionOriginTypeFilter,
	normalizeDueFilter,
} from "../../../lib/actions/filters";
import { actionBoardLabels } from "../../../lib/actions/fixtures";
import { loadActionManagerMetrics } from "../../../lib/actions/metrics";
import {
	listActionItems,
	serializeActionItemListRow,
} from "../../../lib/actions/queries";
import { SESSION_COOKIE_NAME } from "../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../lib/auth/session";
import { prisma } from "../../../lib/db";
import { t } from "../../../lib/i18n/t";
import {
	DEFAULT_LOCALE,
	type Locale,
	type MessageKey,
} from "../../../lib/i18n/types";
import ActionBoardClient, {
	type ActionBoardFilterState,
} from "./ActionBoardClient";

type ActionsPageProps = {
	searchParams?:
		| Promise<Record<string, string | string[] | undefined>>
		| Record<string, string | string[] | undefined>;
};

export default async function ActionsPage({
	searchParams,
}: ActionsPageProps = {}) {
	const { locale, session } = await resolveSessionContext();
	const params = await Promise.resolve(searchParams ?? {});
	const initialFilters: ActionBoardFilterState = {
		assignee: stringParam(params.assignee) ?? "all",
		department: stringParam(params.department) ?? "all",
		due: normalizeDueFilter(stringParam(params.due)),
		origin:
			normalizeActionOriginTypeFilter(stringParam(params.origin)) ?? "all",
		status:
			normalizeActionItemStatusFilter(stringParam(params.status)) ?? "all",
	};

	if (!session) {
		return (
			<ActionsShell locale={locale}>
				<p className="m-0 text-sm text-[var(--color-muted)]">
					{tr("empty.generic.body", locale)}
				</p>
			</ActionsShell>
		);
	}

	const [actions, metrics] = await Promise.all([
		listActionItems(session.tenantId),
		loadActionManagerMetrics(session.tenantId),
	]);

	return (
		<ActionsShell locale={locale}>
			<ActionBoardClient
				initialActions={actions.map(serializeActionItemListRow)}
				initialFilters={initialFilters}
				initialMetrics={metrics}
				labels={actionBoardLabels(locale)}
				locale={locale}
			/>
		</ActionsShell>
	);
}

function ActionsShell({
	children,
	locale,
}: {
	children: ReactNode;
	locale: Locale;
}) {
	const labels = actionBoardLabels(locale);

	return (
		<main className="min-h-screen bg-[var(--color-bg)] px-4 py-5 text-[var(--color-text)] lg:px-6">
			<div className="mx-auto grid w-full max-w-7xl gap-5">
				<header className="flex flex-wrap items-start justify-between gap-3">
					<div className="grid gap-2">
						<h1 className="m-0 text-xl font-semibold">{labels.list.title}</h1>
						<p className="m-0 max-w-3xl text-sm text-[var(--color-muted)]">
							{labels.empty.noActions.body}
						</p>
					</div>
					<a
						className="inline-flex min-h-10 items-center justify-center rounded-md border border-[var(--color-accent)] bg-[var(--color-accent)] px-3 py-2 text-sm font-medium text-[var(--color-bg)] hover:opacity-90"
						href="/workspace/actions/new"
					>
						{labels.empty.noActions.cta}
					</a>
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

function stringParam(value: string | string[] | undefined): string | null {
	if (typeof value === "string") {
		return value;
	}

	return Array.isArray(value) ? (value[0] ?? null) : null;
}
