"use client";

import { usePathname } from "next/navigation";
import SidebarNav from "../ui/SidebarNav";
import type { Locale } from "../../lib/i18n/types";
import {
	buildSettingsNavItems,
	settingsKeyFromPathname,
	settingsShellModel,
	type SettingsKey,
} from "../../lib/settings/registry";

export type SettingsNavProps = {
	locale: Locale;
};

export function SettingsNav({ locale }: SettingsNavProps) {
	const pathname = usePathname();
	const selectedKey = settingsKeyFromPathname(pathname);

	return <SettingsNavList locale={locale} selectedKey={selectedKey} />;
}

export function SettingsNavList({
	locale,
	selectedKey,
}: SettingsNavProps & { selectedKey: SettingsKey }) {
	const shell = settingsShellModel(locale);
	return (
		<SidebarNav
			aria-label={shell.navAriaLabel}
			items={buildSettingsNavItems(locale, selectedKey)}
		/>
	);
}

export default SettingsNav;
