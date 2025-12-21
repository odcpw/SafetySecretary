import { PHASES } from "@/lib/phases";
import type { Phase } from "@/types/riskAssessment";
import { useI18n } from "@/i18n/I18nContext";

interface CaseSidebarProps {
  activityName: string;
  location: string | null;
  team: string | null;
  currentPhase: Phase;
  onRefresh?: () => void;
}

export const CaseSidebar = ({ activityName, location, team, currentPhase, onRefresh }: CaseSidebarProps) => {
  const currentIndex = PHASES.findIndex((phase) => phase.id === currentPhase);
  const { t } = useI18n();

  return (
    <aside className="w-full max-w-xs border-r border-slate-200 bg-slate-50/70 p-4">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">{activityName}</h2>
        <p className="text-sm text-slate-600">{location || t("workspace.locationPending")}</p>
        <p className="text-sm text-slate-600">{team || t("workspace.teamPending")}</p>
        {onRefresh && (
          <button type="button" className="mt-3 bg-slate-800 text-sm" onClick={onRefresh}>
            {t("common.refresh")}
          </button>
        )}
      </div>

      <ol className="space-y-2 text-sm">
        {PHASES.map((phase, index) => {
          const state = index < currentIndex ? "done" : index === currentIndex ? "active" : "pending";
          return (
            <li
              key={phase.id}
              className={`rounded-md border px-3 py-2 ${
                state === "active"
                  ? "border-blue-500 bg-white text-slate-900"
                  : state === "done"
                    ? "border-green-500 bg-green-50 text-green-700"
                    : "border-slate-200 text-slate-500"
              }`}
            >
              <div className="font-medium">
                {t(phase.labelKey, { fallback: phase.label })}
              </div>
              <p className="text-xs">{t(phase.descriptionKey, { fallback: phase.description })}</p>
            </li>
          );
        })}
      </ol>
    </aside>
  );
};
