import Link from "next/link";
import { resolveServerSession } from "../../../../lib/auth/route-session";
import { prisma } from "../../../../lib/db";
import { t } from "../../../../lib/i18n/t";
import {
	DEFAULT_LOCALE,
	type Locale,
	type MessageKey,
} from "../../../../lib/i18n/types";
import { settingsContentModel } from "../../../../lib/settings/registry";

export default async function DangerZoneSettingsPage() {
	const locale = await resolveSettingsLocale();
	const model = settingsContentModel("danger-zone", locale);

	return (
		<article
			className="grid gap-4 rounded-md border border-[var(--color-danger)] bg-[var(--color-surface)] p-5"
			data-owning-bead={model.entry.ownerBead}
		>
			<header className="grid gap-1">
				<p className="m-0 text-xs font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
					{model.placeholderTitle}
				</p>
				<h2 className="m-0 text-lg font-semibold">{model.label}</h2>
				<p className="m-0 text-sm leading-6 text-[var(--color-muted)]">
					{tr(messageKey("company", "delete", "description"), locale)}
				</p>
			</header>
			<Link
				className="inline-flex min-h-10 w-fit items-center justify-center rounded-md border border-[var(--color-danger)] bg-[var(--color-danger)] px-3 py-2 text-sm font-medium text-[var(--color-bg)]"
				href="/workspace/company/delete"
			>
				{tr(messageKey("company", "delete", "submit"), locale)}
			</Link>
		</article>
	);
}

async function resolveSettingsLocale(): Promise<Locale> {
	const session = await resolveServerSession();

	if (!session) {
		return DEFAULT_LOCALE;
	}

	const user = await prisma.user.findUnique({
		select: { uiLocale: true },
		where: { id: session.userId },
	});

	return user?.uiLocale ?? DEFAULT_LOCALE;
}

function tr(key: MessageKey, locale: Locale): string {
	return t(key, locale);
}

function messageKey(...parts: string[]): MessageKey {
	return parts.join(".") as MessageKey;
}
