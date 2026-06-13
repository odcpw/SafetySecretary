import type { ReactNode } from "react";
import SettingsNav from "../../../components/settings/SettingsNav";
import { resolveServerSession } from "../../../lib/auth/route-session";
import { prisma } from "../../../lib/db";
import { DEFAULT_LOCALE, type Locale } from "../../../lib/i18n/types";
import { settingsShellModel } from "../../../lib/settings/registry";

type SettingsLayoutProps = {
	children: ReactNode;
};

export default async function SettingsLayout({
	children,
}: SettingsLayoutProps) {
	const locale = await resolveSettingsLocale();
	return <SettingsChrome locale={locale}>{children}</SettingsChrome>;
}

export function SettingsChrome({
	children,
	locale,
}: SettingsLayoutProps & { locale: Locale }) {
	const shell = settingsShellModel(locale);

	return (
		<main className="grid min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] lg:grid-cols-[18rem_minmax(0,1fr)]">
			<SettingsNav locale={locale} />
			<section className="min-w-0 px-4 py-5 lg:px-6">
				<div className="mx-auto grid w-full max-w-5xl gap-5">
					<header className="grid gap-2">
						<h1 className="m-0 text-xl font-semibold">{shell.title}</h1>
						<p className="m-0 max-w-3xl text-sm text-[var(--color-muted)]">
							{shell.description}
						</p>
					</header>
					{children}
				</div>
			</section>
		</main>
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
