import type { ReactNode } from "react";
import { PHASES } from "@/lib/phases";
import { useI18n } from "@/i18n/I18nContext";
import type { Phase } from "@/types/riskAssessment";
import { TuiPanel } from "@/tui/components/TuiPanel";

interface TuiPhaseLayoutProps {
  phase: Phase;
  children: ReactNode;
}

export const TuiPhaseLayout = ({ phase, children }: TuiPhaseLayoutProps) => {
  const { t } = useI18n();
  const meta = PHASES.find((entry) => entry.id === phase);

  return (
    <TuiPanel
      eyebrow={t("ra.workspace.phaseTitle")}
      title={t(meta?.labelKey ?? "", { fallback: meta?.label ?? phase })}
      subtitle={t(meta?.descriptionKey ?? "", { fallback: meta?.description ?? "" })}
    >
      {children}
    </TuiPanel>
  );
};
