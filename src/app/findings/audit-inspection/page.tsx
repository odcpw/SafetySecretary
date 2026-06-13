import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../lib/auth/session";
import { prisma } from "../../../lib/db";
import { auditInspectionDraftStorageKey } from "../../../lib/findings/audit-inspection-draft";
import { t } from "../../../lib/i18n/t";
import {
	DEFAULT_LOCALE,
	type Locale,
	type MessageKey,
} from "../../../lib/i18n/types";
import AuditInspectionCaptureClient, {
	type AuditInspectionCaptureLabels,
} from "./AuditInspectionCaptureClient";

export default async function AuditInspectionFindingCapturePage() {
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

	return (
		<AuditInspectionCaptureClient
			draftStorageKey={auditInspectionDraftStorageKey(session)}
			labels={captureLabels(locale)}
		/>
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

function captureLabels(locale: Locale): AuditInspectionCaptureLabels {
	return {
		actionDueDate: tr(
			messageKey("finding", "auditInspection", "actionDueDate"),
			locale,
		),
		actionOwner: tr(
			messageKey("finding", "auditInspection", "actionOwner"),
			locale,
		),
		actionTitle: tr(
			messageKey("finding", "auditInspection", "actionTitle"),
			locale,
		),
		addItem: tr(messageKey("finding", "auditInspection", "addItem"), locale),
		audit: tr(messageKey("finding", "type", "audit"), locale),
		captureButton: tr(
			messageKey("finding", "auditInspection", "captureButton"),
			locale,
		),
		checklistTitle: tr(
			messageKey("finding", "auditInspection", "checklistTitle"),
			locale,
		),
		clearDraft: tr(
			messageKey("finding", "auditInspection", "clearDraft"),
			locale,
		),
		createAction: tr(
			messageKey("finding", "auditInspection", "createAction"),
			locale,
		),
		department: tr(messageKey("finding", "field", "department"), locale),
		draftCleared: tr(
			messageKey("finding", "auditInspection", "draftCleared"),
			locale,
		),
		draftSaved: tr(
			messageKey("finding", "auditInspection", "draftSaved"),
			locale,
		),
		error: tr(messageKey("finding", "auditInspection", "error"), locale),
		findingType: tr(
			messageKey("finding", "auditInspection", "findingType"),
			locale,
		),
		findingsCreated: tr(
			messageKey("finding", "auditInspection", "findingsCreated"),
			locale,
		),
		inspection: tr(messageKey("finding", "type", "inspection"), locale),
		itemDescription: tr(
			messageKey("finding", "auditInspection", "itemDescription"),
			locale,
		),
		itemLabel: tr(
			messageKey("finding", "auditInspection", "itemLabel"),
			locale,
		),
		itemPrompt: tr(
			messageKey("finding", "auditInspection", "itemPrompt"),
			locale,
		),
		itemResult: tr(
			messageKey("finding", "auditInspection", "itemResult"),
			locale,
		),
		location: tr(messageKey("finding", "field", "location"), locale),
		meta: tr(messageKey("finding", "auditInspection", "meta"), locale),
		noFindingsCreated: tr(
			messageKey("finding", "auditInspection", "noFindingsCreated"),
			locale,
		),
		nonPunitiveContext: tr(
			messageKey("finding", "auditInspection", "nonPunitiveContext"),
			locale,
		),
		note: tr(messageKey("finding", "auditInspection", "note"), locale),
		photo: tr(messageKey("finding", "capture", "photoLabel"), locale),
		quickAction: tr(
			messageKey("finding", "auditInspection", "quickAction"),
			locale,
		),
		removeItem: tr(
			messageKey("finding", "auditInspection", "removeItem"),
			locale,
		),
		resultCheckedOk: tr(
			messageKey("finding", "auditInspection", "resultCheckedOk"),
			locale,
		),
		resultNonConformance: tr(
			messageKey("finding", "auditInspection", "resultNonConformance"),
			locale,
		),
		resultNotChecked: tr(
			messageKey("finding", "auditInspection", "resultNotChecked"),
			locale,
		),
		resultPositiveObservation: tr(
			messageKey("finding", "auditInspection", "resultPositiveObservation"),
			locale,
		),
		saveDraft: tr(
			messageKey("finding", "auditInspection", "saveDraft"),
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
		success: tr(messageKey("finding", "auditInspection", "success"), locale),
		title: tr(messageKey("finding", "auditInspection", "title"), locale),
		viewAction: tr(
			messageKey("finding", "auditInspection", "viewAction"),
			locale,
		),
		workAsDone: tr(
			messageKey("finding", "auditInspection", "workAsDone"),
			locale,
		),
	};
}

function tr(key: MessageKey, locale: Locale): string {
	return t(key, locale);
}

function messageKey(...parts: string[]): MessageKey {
	return parts.join(".") as MessageKey;
}
