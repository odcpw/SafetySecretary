import { PHASES } from "@/lib/phases";
import type { Phase } from "@/types/riskAssessment";

interface CaseSidebarProps {
  activityName: string;
  location: string | null;
  team: string | null;
  currentPhase: Phase;
  onRefresh?: () => void;
}

export const CaseSidebar = ({ activityName, location, team, currentPhase, onRefresh }: CaseSidebarProps) => {
  const currentIndex = PHASES.findIndex((phase) => phase.id === currentPhase);

  return (
    <aside className="w-full max-w-xs border-r border-slate-200 bg-slate-50/70 p-4">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-slate-900">{activityName}</h2>
        <p className="text-sm text-slate-600">{location || "Location not set"}</p>
        <p className="text-sm text-slate-600">{team || "Team not set"}</p>
        {onRefresh && (
          <button type="button" className="mt-3 bg-slate-800 text-sm" onClick={onRefresh}>
            Refresh
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
              <div className="font-medium">{phase.label}</div>
              <p className="text-xs">{phase.description}</p>
            </li>
          );
        })}
      </ol>
    </aside>
  );
};
