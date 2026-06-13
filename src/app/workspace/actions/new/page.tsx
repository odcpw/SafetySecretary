import { cookies } from "next/headers";
import type { ReactNode } from "react";
import {
	FINDINGS_WITHOUT_ACTION_SOURCE_QUEUE,
	loadNextUnlinkedFindingActionSeed,
} from "../../../../lib/actions/finding-queue";
import { actionBoardLabels } from "../../../../lib/actions/fixtures";
import { getActionItemDetail } from "../../../../lib/actions/queries";
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
import ActionFormClient, { emptyActionFormState } from "../ActionFormClient";

type NewActionPageProps = {
	searchParams?:
		| Promise<Record<string, string | string[] | undefined>>
		| Record<string, string | string[] | undefined>;
};

export default async function NewActionPage({
	searchParams,
}: NewActionPageProps = {}) {
	const { locale, session } = await resolveSessionContext();
	const labels = actionBoardLabels(locale);
	const params = await Promise.resolve(searchParams ?? {});
	const followUpFrom = stringParam(params.followUpFrom);
	const sourceQueue = stringParam(params.sourceQueue);

	if (!session) {
		return (
			<ActionFormShell>
				<p className="m-0 text-sm text-[var(--color-muted)]">
					{tr("empty.generic.body", locale)}
				</p>
			</ActionFormShell>
		);
	}

	const sourceAction = followUpFrom
		? await getActionItemDetail(session.tenantId, followUpFrom).catch(
				() => null,
			)
		: null;
	const findingSeed =
		!sourceAction && sourceQueue === FINDINGS_WITHOUT_ACTION_SOURCE_QUEUE
			? await loadNextUnlinkedFindingActionSeed(session.tenantId)
			: null;
	const initialAction = sourceAction
		? emptyActionFormState({
				description: sourceAction.description ?? sourceAction.title,
				originLabel: `${labels.form.followUpTitlePrefix} ${sourceAction.title}`,
				title: `${labels.form.followUpTitlePrefix} ${sourceAction.title}`,
			})
		: findingSeed
			? emptyActionFormState({
					departmentText: findingSeed.departmentText ?? "",
					description: findingSeed.description,
					originCreatedAt: findingSeed.originCreatedAt,
					originId: findingSeed.originId,
					originLabel: findingSeed.originLabel,
					originType: findingSeed.originType,
					priority: findingSeed.priority,
					sourceQueue: FINDINGS_WITHOUT_ACTION_SOURCE_QUEUE,
					title: findingSeed.title,
				})
			: emptyActionFormState();

	return (
		<ActionFormShell>
			<ActionFormClient
				initialAction={initialAction}
				labels={labels}
				locale={locale}
				mode="create"
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
