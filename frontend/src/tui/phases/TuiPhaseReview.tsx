import { useState } from "react";
import { useRaContext } from "@/contexts/RaContext";
import { useI18n } from "@/i18n/I18nContext";
import { TuiBanner } from "@/tui/components/TuiBanner";
import { TuiPhaseLayout } from "@/tui/phases/TuiPhaseLayout";

export const TuiPhaseReview = () => {
  const { t, formatDateTime } = useI18n();
  const { raCase, actions, saving } = useRaContext();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isComplete = raCase.phase === "COMPLETE";
  const copy = isComplete
    ? {
        title: t("ra.review.complete.title"),
        body: t("ra.review.complete.body"),
        actionLabel: null
      }
    : {
        title: t("ra.review.signoff.title"),
        body: t("ra.review.signoff.body"),
        actionLabel: t("ra.review.signoff.action")
      };

  const stats = [
    { label: t("ra.review.stats.steps"), value: raCase.steps.length },
    { label: t("ra.review.stats.hazards"), value: raCase.hazards.length },
    { label: t("ra.review.stats.actions"), value: raCase.actions.length }
  ];

  const latestEdit = formatDateTime(raCase.createdAt);

  const handleAdvance = async () => {
    try {
      await actions.advancePhase();
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t("status.saveFailed"));
    }
  };

  return (
    <TuiPhaseLayout phase="COMPLETE">
      <div className="tui-review-copy">
        <p className="tui-eyebrow">{t("ra.review.badge")}</p>
        <h3 className="tui-review-title">{copy.title}</h3>
        <p className="tui-muted">{copy.body}</p>
      </div>

      {errorMessage && (
        <TuiBanner variant="error">
          {errorMessage}
        </TuiBanner>
      )}

      <div className="tui-review-stats">
        {stats.map((stat) => (
          <div key={stat.label} className="tui-review-stat">
            <div className="tui-muted">{stat.label}</div>
            <strong>{stat.value}</strong>
          </div>
        ))}
      </div>

      <p className="tui-muted">{t("ra.review.latest", { values: { date: latestEdit } })}</p>

      <div className="tui-review-actions">
        <button type="button" onClick={() => window.open(`/api/ra-cases/${raCase.id}/export/pdf`, "_blank", "noopener")}>
          {t("common.exportPdf")}
        </button>
        <button type="button" onClick={() => window.open(`/api/ra-cases/${raCase.id}/export/xlsx`, "_blank", "noopener")}>
          {t("common.exportXlsx")}
        </button>
        {!isComplete && copy.actionLabel && (
          <button type="button" onClick={() => void handleAdvance()} disabled={saving}>
            {copy.actionLabel}
          </button>
        )}
      </div>
    </TuiPhaseLayout>
  );
};
