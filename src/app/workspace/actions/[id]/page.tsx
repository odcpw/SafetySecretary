import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { actionBoardLabels } from "../../../../lib/actions/fixtures";
import {
	getActionItemDetail,
	serializeActionItemDetail,
} from "../../../../lib/actions/queries";
import { SESSION_COOKIE_NAME } from "../../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../lib/auth/session";
import { prisma } from "../../../../lib/db";
import { t } from "../../../../lib/i18n/t";
import {
	DEFAULT_LOCALE,
	type Locale,
	type MessageKey,
} from "../../../../lib/i18n/types";
import ActionFormClient, { actionToFormState } from "../ActionFormClient";

type EditActionPageProps = {
	params: Promise<{ id: string }> | { id: string };
	searchParams?:
		| Promise<Record<string, string | string[] | undefined>>
		| Record<string, string | string[] | undefined>;
};

export default async function EditActionPage({
	params,
	searchParams,
}: EditActionPageProps) {
	const { locale, session } = await resolveSessionContext();
	const labels = actionBoardLabels(locale);
	const { id } = await Promise.resolve(params);
	const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
	const focus = stringParam(resolvedSearchParams.focus);

	if (!session) {
		return (
			<ActionFormShell>
				<p className="m-0 text-sm text-[var(--color-muted)]">
					{tr("empty.generic.body", locale)}
				</p>
			</ActionFormShell>
		);
	}

	const action = await getActionItemDetail(session.tenantId, id).catch(
		() => null,
	);

	if (!action) {
		notFound();
	}

	return (
		<ActionFormShell>
			<ActionFormClient
				focus={focus}
				initialAction={actionToFormState(serializeActionItemDetail(action))}
				labels={labels}
				locale={locale}
				mode="edit"
			/>
		</ActionFormShell>
	);
}

function ActionFormShell({ children }: { children: ReactNode }) {
	return (
		<main className="min-h-screen bg-[var(--color-bg)] px-4 py-5 text-[var(--color-text)] lg:px-6">
			<div className="mx-auto grid w-full max-w-4xl gap-5">{children}</div>
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
