import { resolveServerSession } from "../../../lib/auth/route-session";
import { prisma } from "../../../lib/db";
import { DEFAULT_LOCALE, type Locale } from "../../../lib/i18n/types";
import {
	DEFAULT_SETTINGS_KEY,
	settingsContentModel,
	type SettingsContentModel,
	type SettingsKey,
} from "../../../lib/settings/registry";

type SettingsContentPanelProps = {
	model: SettingsContentModel;
};

export default async function SettingsPage() {
	return <SettingsEntryPage settingsKey={DEFAULT_SETTINGS_KEY} />;
}

export async function SettingsEntryPage({
	settingsKey,
}: {
	settingsKey: SettingsKey;
}) {
	const locale = await resolveSettingsLocale();

	return (
		<SettingsContentPanel model={settingsContentModel(settingsKey, locale)} />
	);
}

export function SettingsContentPanel({ model }: SettingsContentPanelProps) {
	return (
		<article
			className="grid gap-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
			data-owning-bead={model.entry.ownerBead}
		>
			<header className="grid gap-1">
				<p className="m-0 text-xs font-medium uppercase tracking-[0.08em] text-[var(--color-muted)]">
					{model.placeholderTitle}
				</p>
				<h2 className="m-0 text-lg font-semibold">{model.label}</h2>
			</header>
			<p className="m-0 text-sm leading-6 text-[var(--color-muted)]">
				{model.placeholderBody}
			</p>
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
