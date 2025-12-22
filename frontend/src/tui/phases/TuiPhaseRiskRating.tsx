import { useEffect, useMemo, useRef, useState } from "react";
import type { Hazard, RatingInput } from "@/types/riskAssessment";
import { TEMPLATE_LIKELIHOOD_OPTIONS, TEMPLATE_SEVERITY_OPTIONS } from "@/lib/templateRiskScales";
import { useRaContext } from "@/contexts/RaContext";
import { useI18n } from "@/i18n/I18nContext";
import { TuiBanner } from "@/tui/components/TuiBanner";
import { TuiEmptyState } from "@/tui/components/TuiEmptyState";
import { TuiFormField } from "@/tui/components/TuiFormField";
import { TuiPhaseLayout } from "@/tui/phases/TuiPhaseLayout";

const initialRatingsFromHazards = (hazards: Hazard[]) =>
  hazards.reduce<Record<string, { severity: string; likelihood: string }>>((acc, hazard) => {
    acc[hazard.id] = {
      severity: hazard.baseline?.severity ?? "",
      likelihood: hazard.baseline?.likelihood ?? ""
    };
    return acc;
  }, {});

const showStatusWithTimeout = (setStatus: (value: string | null) => void, message: string, timeout = 2000) => {
  setStatus(message);
  window.setTimeout(() => setStatus(null), timeout);
};

export const TuiPhaseRiskRating = () => {
  const { t } = useI18n();
  const { raCase, saving, actions } = useRaContext();
  const [ratings, setRatings] = useState(() => initialRatingsFromHazards(raCase.hazards));
  const ratingsRef = useRef<Record<string, { severity: string; likelihood: string }>>(ratings);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const next = initialRatingsFromHazards(raCase.hazards);
    ratingsRef.current = next;
    setRatings(next);
  }, [raCase.hazards]);

  const hazardsByStep = useMemo(
    () =>
      raCase.steps.map((step, index) => ({
        step,
        index,
        hazards: raCase.hazards
          .filter((hazard) => hazard.stepId === step.id)
          .sort((a, b) => a.orderIndex - b.orderIndex)
      })),
    [raCase.hazards, raCase.steps]
  );

  const severityOptions = useMemo(
    () =>
      TEMPLATE_SEVERITY_OPTIONS.map((option) => ({
        value: option.value,
        label: t(`domain.severity.${option.value}`, { fallback: option.label })
      })),
    [t]
  );

  const likelihoodOptions = useMemo(
    () =>
      TEMPLATE_LIKELIHOOD_OPTIONS.map((option) => ({
        value: option.value,
        label: t(`domain.likelihood.${option.value}`, { fallback: option.label })
      })),
    [t]
  );

  const commitRating = async (hazardId: string, value: { severity: string; likelihood: string }) => {
    const shouldSave = (value.severity && value.likelihood) || (!value.severity && !value.likelihood);
    if (!shouldSave) {
      return;
    }
    const isClearing = !value.severity && !value.likelihood;
    try {
      await actions.saveRiskRatings([
        {
          hazardId,
          severity: value.severity as RatingInput["severity"],
          likelihood: value.likelihood as RatingInput["likelihood"]
        }
      ]);
      setErrorMessage(null);
      showStatusWithTimeout(setActionStatus, isClearing ? t("ra.risk.ratingCleared") : t("ra.risk.autosaved"));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t("ra.risk.saveFailed"));
    }
  };

  const handleRatingChange = (hazardId: string, patch: Partial<{ severity: string; likelihood: string }>) => {
    const current = ratingsRef.current[hazardId] ?? { severity: "", likelihood: "" };
    const next = { ...current, ...patch };
    ratingsRef.current = { ...ratingsRef.current, [hazardId]: next };
    setRatings((prev) => ({ ...prev, [hazardId]: next }));
    void commitRating(hazardId, next);
  };

  const disableInputs = saving;

  return (
    <TuiPhaseLayout phase="RISK_RATING">
      <TuiBanner>
        <strong>{t("ra.risk.bannerTitle")}</strong> {t("ra.risk.bannerBodyPrefix")}{" "}
        <em>{t("ra.risk.bannerBodyEmphasis")}</em> {t("ra.risk.bannerBodySuffix")}
      </TuiBanner>

      {errorMessage && (
        <TuiBanner variant="error">
          {errorMessage}
        </TuiBanner>
      )}

      {actionStatus && <p className="tui-muted">{actionStatus}</p>}

      {raCase.hazards.length === 0 ? (
        <TuiEmptyState title={t("ra.risk.noHazards")} />
      ) : (
        <div className="tui-hazard-list">
          {hazardsByStep.map(({ step, index, hazards }) => (
            <div key={step.id} className="tui-hazard-step">
              <div className="tui-hazard-step__header">
                <strong>{t("ra.steps.newStep", { values: { index: index + 1 } })}</strong>
                <span className="tui-muted">{step.activity}</span>
              </div>

              {hazards.length === 0 ? (
                <TuiEmptyState title={t("ra.risk.noHazardsForStep")} />
              ) : (
                <div className="tui-hazard-items">
                  {hazards.map((hazard) => {
                    const value = ratings[hazard.id] ?? { severity: "", likelihood: "" };
                    return (
                      <div key={hazard.id} className="tui-hazard-item">
                        <div className="tui-hazard-item__header">
                          <strong>{hazard.label}</strong>
                        </div>
                        <div className="tui-hazard-item__fields">
                          <TuiFormField label={t("ra.risk.severity")}>
                            <select
                              value={value.severity}
                              onChange={(event) => handleRatingChange(hazard.id, { severity: event.target.value })}
                              disabled={disableInputs}
                            >
                              <option value="">{t("ra.risk.selectOption")}</option>
                              {severityOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </TuiFormField>
                          <TuiFormField label={t("ra.risk.likelihood")}>
                            <select
                              value={value.likelihood}
                              onChange={(event) => handleRatingChange(hazard.id, { likelihood: event.target.value })}
                              disabled={disableInputs}
                            >
                              <option value="">{t("ra.risk.selectOption")}</option>
                              {likelihoodOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </TuiFormField>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </TuiPhaseLayout>
  );
};
