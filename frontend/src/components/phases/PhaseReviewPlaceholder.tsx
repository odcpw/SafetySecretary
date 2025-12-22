import type { Phase, RiskAssessmentCase } from "@/types/riskAssessment";
import { useI18n } from "@/i18n/I18nContext";

interface PhaseReviewPlaceholderProps {
  phase: Phase;
  raCase: RiskAssessmentCase;
  canAdvance?: boolean;
  onNext: () => Promise<void>;
}

export const PhaseReviewPlaceholder = ({
  phase,
  raCase,
  canAdvance = false,
  onNext
}: PhaseReviewPlaceholderProps) => {
  const { t, formatDateTime } = useI18n();
  const copy =
    phase === "COMPLETE"
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
  const latestEdit = formatDateTime(raCase.createdAt);
  const stats = [
    { label: t("ra.review.stats.steps"), value: raCase.steps.length },
    { label: t("ra.review.stats.hazards"), value: raCase.hazards.length },
    { label: t("ra.review.stats.actions"), value: raCase.actions.length }
  ];

  return (
    <section className="phase-review app-panel stack-lg">
      <header className="phase-review__header">
        <p className="text-label">{t("ra.review.badge")}</p>
        <h3>{copy.title}</h3>
        <p>{copy.body}</p>
      </header>

      <dl className="phase-review__stats">
        {stats.map((stat) => (
          <div key={stat.label} className="phase-review__stat">
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>

      <div className="phase-review__note">
        {t("ra.review.latest", { values: { date: latestEdit } })}
      </div>

      {canAdvance && copy.actionLabel && (
        <button type="button" className="phase-review__action" onClick={() => onNext()}>
          {copy.actionLabel}
        </button>
      )}
    </section>
  );
};
