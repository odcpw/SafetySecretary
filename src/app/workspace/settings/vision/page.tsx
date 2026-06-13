import { resolveServerSession } from "../../../../lib/auth/route-session";
import { prisma } from "../../../../lib/db";
import { t } from "../../../../lib/i18n/t";
import {
	DEFAULT_LOCALE,
	type Locale,
	type MessageKey,
} from "../../../../lib/i18n/types";
import { VisionToggle, type VisionToggleLabels } from "./VisionToggle";

export default async function VisionSettingsPage() {
	const context = await resolveVisionContext();

	if (!context) {
		return (
			<VisionPanel locale={DEFAULT_LOCALE}>
				<p className="m-0 text-sm text-[var(--color-muted)]">
					{tr(messageKey("settings", "vision", "authRequired"), DEFAULT_LOCALE)}
				</p>
			</VisionPanel>
		);
	}

	const tenant = await prisma.tenant.findFirst({
		select: { visionEnabled: true },
		where: {
			id: context.tenantId,
			memberships: {
				some: { userId: context.userId },
			},
		},
	});

	return (
		<VisionPanel locale={context.locale}>
			<VisionToggle
				initialEnabled={tenant?.visionEnabled ?? false}
				labels={visionLabels(context.locale)}
			/>
		</VisionPanel>
	);
}

function VisionPanel({
	children,
	locale,
}: {
	children: React.ReactNode;
	locale: Locale;
}) {
	return (
		<article className="grid gap-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
			<header className="grid gap-1">
				<p className="m-0 text-xs font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
					{tr(messageKey("settings", "vision", "eyebrow"), locale)}
				</p>
				<h2 className="m-0 text-lg font-semibold">
					{tr(messageKey("settings", "vision", "title"), locale)}
				</h2>
				<p className="m-0 text-sm leading-6 text-[var(--color-muted)]">
					{tr(messageKey("settings", "vision", "description"), locale)}
				</p>
			</header>
			{children}
		</article>
	);
}

async function resolveVisionContext(): Promise<{
	locale: Locale;
	tenantId: string;
	userId: string;
} | null> {
	const session = await resolveServerSession();

	if (!session) {
		return null;
	}

	const user = await prisma.user.findUnique({
		select: { uiLocale: true },
		where: { id: session.userId },
	});

	return {
		locale: user?.uiLocale ?? DEFAULT_LOCALE,
		tenantId: session.tenantId,
		userId: session.userId,
	};
}

function visionLabels(locale: Locale): VisionToggleLabels {
	return {
		disable: tr(messageKey("settings", "vision", "disable"), locale),
		enable: tr(messageKey("settings", "vision", "enable"), locale),
		error: tr(messageKey("settings", "vision", "error"), locale),
		offStatus: tr(messageKey("settings", "vision", "offStatus"), locale),
		onStatus: tr(messageKey("settings", "vision", "onStatus"), locale),
		pending: tr(messageKey("settings", "vision", "pending"), locale),
	};
}

function tr(key: MessageKey, locale: Locale): string {
	return t(key, locale);
}

function messageKey(...parts: string[]): MessageKey {
	return parts.join(".") as MessageKey;
}
