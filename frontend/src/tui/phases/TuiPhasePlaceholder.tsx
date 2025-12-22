import { useI18n } from "@/i18n/I18nContext";
import type { Phase } from "@/types/riskAssessment";
import { TuiEmptyState } from "@/tui/components/TuiEmptyState";
import { TuiPhaseLayout } from "@/tui/phases/TuiPhaseLayout";

interface TuiPhasePlaceholderProps {
  phase: Phase;
}

export const TuiPhasePlaceholder = ({ phase }: TuiPhasePlaceholderProps) => {
  const { t } = useI18n();

  return (
    <TuiPhaseLayout phase={phase}>
      <TuiEmptyState
        title={t("tui.phasePlaceholderTitle")}
        description={t("tui.phasePlaceholderDescription")}
      />
    </TuiPhaseLayout>
  );
};
