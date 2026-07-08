import PlaceholderShell from "../../components/PlaceholderShell";
import LanguageDropdown from "../../components/ui/LanguageDropdown";
import { resolveLocaleContext } from "../../lib/auth/locale-server";
import { t } from "../../lib/i18n/t";

export default async function WorkspacePage() {
	const { locale } = await resolveLocaleContext();

	return (
		<PlaceholderShell
			description="Empty workspace. Open Incidents to start an investigation."
			title="Workspace"
		>
			<div className="mt-4">
				<LanguageDropdown
					ariaLabel={t("auth.language.label", locale)}
					locale={locale}
				/>
			</div>
		</PlaceholderShell>
	);
}
