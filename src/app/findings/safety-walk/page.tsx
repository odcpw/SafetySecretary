import { cookies } from "next/headers";
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
import SafetyWalkCaptureClient, {
	type SafetyWalkCaptureLabels,
} from "./SafetyWalkCaptureClient";

export default async function SafetyWalkFindingCapturePage() {
	const { locale, session } = await resolveSessionContext();

	if (!session) {
		return (
			<main className="min-h-screen bg-[var(--color-bg)] px-4 py-5 text-[var(--color-text)]">
				<p className="m-0 text-sm text-[var(--color-muted)]">
					{tr(messageKey("empty", "generic", "body"), locale)}
				</p>
			</main>
		);
	}

	return <SafetyWalkCaptureClient labels={captureLabels(locale)} />;
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

function captureLabels(locale: Locale): SafetyWalkCaptureLabels {
	return {
		actionDueDate: tr(
			messageKey("finding", "safetyWalk", "actionDueDate"),
			locale,
		),
		actionOwner: tr(messageKey("finding", "safetyWalk", "actionOwner"), locale),
		actionTitle: tr(messageKey("finding", "safetyWalk", "actionTitle"), locale),
		captureButton: tr(
			messageKey("finding", "safetyWalk", "captureButton"),
			locale,
		),
		createAction: tr(
			messageKey("finding", "safetyWalk", "createAction"),
			locale,
		),
		department: tr(messageKey("finding", "field", "department"), locale),
		description: tr(messageKey("finding", "field", "description"), locale),
		error: tr(messageKey("finding", "safetyWalk", "error"), locale),
		goodCatch: tr(messageKey("finding", "safetyWalk", "goodCatch"), locale),
		location: tr(messageKey("finding", "field", "location"), locale),
		meta: tr(messageKey("finding", "safetyWalk", "meta"), locale),
		noActionCreated: tr(
			messageKey("finding", "safetyWalk", "noActionCreated"),
			locale,
		),
		note: tr(messageKey("finding", "safetyWalk", "note"), locale),
		photo: tr(messageKey("finding", "capture", "photoLabel"), locale),
		quickAction: tr(messageKey("finding", "safetyWalk", "quickAction"), locale),
		requiredHint: tr(
			messageKey("finding", "safetyWalk", "requiredHint"),
			locale,
		),
		severity: tr(messageKey("finding", "field", "severity"), locale),
		severityCritical: tr(
			messageKey("actionBoard", "priority", "critical"),
			locale,
		),
		severityHigh: tr(messageKey("finding", "severity", "high"), locale),
		severityLow: tr(messageKey("finding", "severity", "low"), locale),
		severityMedium: tr(messageKey("finding", "severity", "medium"), locale),
		success: tr(messageKey("finding", "safetyWalk", "success"), locale),
		title: tr(messageKey("finding", "safetyWalk", "title"), locale),
		titleField: tr(messageKey("finding", "field", "title"), locale),
		viewAction: tr(messageKey("finding", "safetyWalk", "viewAction"), locale),
		workAsDone: tr(messageKey("finding", "safetyWalk", "workAsDone"), locale),
	};
}

function tr(key: MessageKey, locale: Locale): string {
	return t(key, locale);
}

function messageKey(...parts: string[]): MessageKey {
	return parts.join(".") as MessageKey;
}
