import { useEffect, useMemo, useRef, useState } from "react";
import type { Hazard, RatingInput, RiskAssessmentCase } from "@/types/riskAssessment";
import {
  buildDefaultMatrixLabels,
  getRiskColorForAssessment,
  loadMatrixSettings,
  type RiskMatrixSettings
} from "@/lib/riskMatrixSettings";
import { TEMPLATE_LIKELIHOOD_OPTIONS, TEMPLATE_SEVERITY_OPTIONS } from "@/lib/templateRiskScales";
import {
  SheetBody,
  SheetCell,
  SheetHead,
  SheetHeaderCell,
  SheetRow,
  SheetSelect,
  SheetTable
} from "@/components/ui/SheetTable";
import { HAZARD_CATEGORIES } from "@/lib/hazardCategories";
import { SaveStatus } from "@/components/common/SaveStatus";
import { useSaveStatus } from "@/hooks/useSaveStatus";
import { useI18n } from "@/i18n/I18nContext";

interface PhaseRiskRatingProps {
  raCase: RiskAssessmentCase;
  saving: boolean;
  onSaveRiskRatings: (ratings: RatingInput[]) => Promise<void>;
  onUpdateHazard: (hazardId: string, patch: { label?: string; description?: string; categoryCode?: string; existingControls?: string[] }) => Promise<void>;
  onNext: () => Promise<void>;
  canAdvance?: boolean;
}

const initialRatingsFromHazards = (hazards: Hazard[]) =>
  hazards.reduce<Record<string, { severity: string; likelihood: string }>>((acc, hazard) => {
    acc[hazard.id] = {
      severity: hazard.baseline?.severity ?? "",
      likelihood: hazard.baseline?.likelihood ?? ""
    };
    return acc;
  }, {});

const ALL_STEPS = "ALL";

const getContrastColor = (hex: string) => {
  if (!hex.startsWith("#") || (hex.length !== 7 && hex.length !== 4)) {
    return "#0f172a";
  }
  const normalized =
    hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex.toLowerCase();
  const r = parseInt(normalized.slice(1, 3), 16);
  const g = parseInt(normalized.slice(3, 5), 16);
  const b = parseInt(normalized.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#0f172a" : "#fff";
};

export const PhaseRiskRating = ({
  raCase,
  saving,
  onSaveRiskRatings,
  onUpdateHazard,
  onNext,
  canAdvance = true
}: PhaseRiskRatingProps) => {
  const { t } = useI18n();
  const defaultLabels = useMemo(() => buildDefaultMatrixLabels(t), [t]);
  const [ratings, setRatings] = useState(() => initialRatingsFromHazards(raCase.hazards));
  const ratingsRef = useRef<Record<string, { severity: string; likelihood: string }>>(ratings);
  const [activeStepId, setActiveStepId] = useState<string>(ALL_STEPS);
  const [riskSettings, setRiskSettings] = useState<RiskMatrixSettings | null>(() => loadMatrixSettings(defaultLabels));
  // Local state for inline editing of existing controls
  const [controlsEditing, setControlsEditing] = useState<Record<string, string>>({});
  const { status, show, showSuccess, showError } = useSaveStatus();

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

  useEffect(() => {
    const next = initialRatingsFromHazards(raCase.hazards);
    ratingsRef.current = next;
    setRatings(next);
  }, [raCase]);

  useEffect(() => {
    const syncSettings = () => setRiskSettings(loadMatrixSettings(defaultLabels));
    window.addEventListener("storage", syncSettings);
    return () => window.removeEventListener("storage", syncSettings);
  }, [defaultLabels]);

  useEffect(() => {
    setRiskSettings(loadMatrixSettings(defaultLabels));
  }, [defaultLabels]);

  const hazardsByStep = useMemo(() => {
    const grouped = raCase.steps.map((step) => ({
      step,
      hazards: raCase.hazards
        .filter((hazard) => hazard.stepId === step.id)
        .sort((a, b) => a.orderIndex - b.orderIndex)
    }));
    return grouped.filter((entry) => entry.hazards.length > 0);
  }, [raCase.hazards, raCase.steps]);

  const stepsToRender = useMemo(() => {
    if (activeStepId === ALL_STEPS) {
      return hazardsByStep;
    }
    return hazardsByStep.filter((group) => group.step.id === activeStepId);
  }, [activeStepId, hazardsByStep]);

  const stepNumberMap = useMemo(() => new Map(raCase.steps.map((step, index) => [step.id, index + 1])), [raCase.steps]);

  const handleRatingChange = (hazardId: string, patch: Partial<{ severity: string; likelihood: string }>) => {
    const current = ratingsRef.current[hazardId] ?? { severity: "", likelihood: "" };
    const next = { ...current, ...patch };
    ratingsRef.current = { ...ratingsRef.current, [hazardId]: next };
    setRatings((prev) => ({ ...prev, [hazardId]: next }));
    void commitRating(hazardId, next);
  };

  const commitRating = async (hazardId: string, value: { severity: string; likelihood: string }) => {
    const shouldSave =
      (value.severity && value.likelihood) || (!value.severity && !value.likelihood);
    if (!shouldSave) {
      return;
    }
    const isClearing = !value.severity && !value.likelihood;
    show({ message: isClearing ? t("ra.risk.clearingRating") : t("ra.risk.savingRating"), tone: "info" });
    try {
      await onSaveRiskRatings([
        {
          hazardId,
          severity: value.severity as RatingInput["severity"],
          likelihood: value.likelihood as RatingInput["likelihood"]
        }
      ]);
      showSuccess(isClearing ? t("ra.risk.ratingCleared") : t("ra.risk.autosaved"));
    } catch (error) {
      console.error(error);
      showError(
        error instanceof Error ? error.message : t("ra.risk.saveFailed"),
        () => void commitRating(hazardId, value),
        undefined,
        t("common.retry")
      );
    }
  };

  const handleCategoryChange = async (hazardId: string, categoryCode: string) => {
    show({ message: t("ra.risk.updatingCategory"), tone: "info" });
    try {
      await onUpdateHazard(hazardId, { categoryCode: categoryCode || undefined });
      showSuccess(t("ra.risk.categoryUpdated"));
    } catch (error) {
      console.error(error);
      showError(
        error instanceof Error ? error.message : t("ra.risk.categoryUpdateFailed"),
        () => void handleCategoryChange(hazardId, categoryCode),
        undefined,
        t("common.retry")
      );
    }
  };

  const handleControlsBlur = async (hazardId: string) => {
    const editedText = controlsEditing[hazardId];
    if (editedText === undefined) return;

    const controls = editedText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    show({ message: t("ra.risk.updatingControls"), tone: "info" });
    try {
      await onUpdateHazard(hazardId, { existingControls: controls });
      setControlsEditing((prev) => {
        const next = { ...prev };
        delete next[hazardId];
        return next;
      });
      showSuccess(t("ra.risk.controlsUpdated"));
    } catch (error) {
      console.error(error);
      showError(
        error instanceof Error ? error.message : t("ra.risk.controlsUpdateFailed"),
        () => void handleControlsBlur(hazardId),
        undefined,
        t("common.retry")
      );
    }
  };

  const getControlsEditValue = (hazard: Hazard) => {
    if (controlsEditing[hazard.id] !== undefined) {
      return controlsEditing[hazard.id];
    }
    return (hazard.existingControls ?? []).join("\n");
  };

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
        <p className="text-sm text-blue-800">
          <strong>{t("ra.risk.bannerTitle")}</strong>{" "}
          {t("ra.risk.bannerBodyPrefix")} <em>{t("ra.risk.bannerBodyEmphasis")}</em>{" "}
          {t("ra.risk.bannerBodySuffix")}
        </p>
      </div>
      <div className="phase-step-tabs">
        <button
          type="button"
          className={activeStepId === ALL_STEPS ? "phase-chip phase-chip--active" : "phase-chip"}
          onClick={() => setActiveStepId(ALL_STEPS)}
        >
          {t("ra.common.seeAll")}
        </button>
        {raCase.steps.map((step) => (
          <button
            key={step.id}
            type="button"
            className={activeStepId === step.id ? "phase-chip phase-chip--active" : "phase-chip"}
            onClick={() => setActiveStepId(step.id)}
          >
            {step.activity}
          </button>
        ))}
      </div>

      {stepsToRender.map(({ step, hazards }) => (
        <section key={step.id} className="rounded-lg border border-slate-200 p-4 space-y-3">
          <header>
            <h3 className="text-lg font-semibold text-slate-900">{step.activity}</h3>
            {step.description && <p className="text-sm text-slate-500">{step.description}</p>}
          </header>
          <SheetTable>
            <colgroup>
              <col className="sheet-col-label" />
              <col className="sheet-col-label" />
              <col className="sheet-col-description" />
              <col className="sheet-col-label" />
            </colgroup>
            <SheetHead>
              <SheetRow>
                <SheetHeaderCell>{t("ra.risk.table.hazard")}</SheetHeaderCell>
                <SheetHeaderCell>{t("ra.risk.table.category")}</SheetHeaderCell>
                <SheetHeaderCell>{t("ra.risk.table.existingControls")}</SheetHeaderCell>
                <SheetHeaderCell>{t("ra.risk.table.assessment")}</SheetHeaderCell>
              </SheetRow>
            </SheetHead>
            <SheetBody>
              {hazards.map((hazard, index) => {
                const numbering = stepNumberMap.get(step.id) ? `${stepNumberMap.get(step.id)}.${index + 1}` : "";
                const current = ratings[hazard.id] ?? { severity: "", likelihood: "" };
                const cellColor = getRiskColorForAssessment(
                  current.severity,
                  current.likelihood,
                  riskSettings ?? undefined
                );
                const textColor = getContrastColor(cellColor);
                return (
                  <SheetRow key={hazard.id}>
                    <SheetCell>
                      <div className="font-semibold text-slate-800">
                        {numbering ? `${numbering} ` : ""}
                        {hazard.label}
                      </div>
                      {hazard.description && <p className="mt-1 text-sm text-slate-600">{hazard.description}</p>}
                    </SheetCell>
                    <SheetCell>
                      <SheetSelect
                        value={hazard.categoryCode ?? ""}
                        onChange={(event) => handleCategoryChange(hazard.id, event.target.value)}
                      >
                        <option value="">{t("ra.risk.selectCategory")}</option>
                        {HAZARD_CATEGORIES.map((cat) => (
                          <option key={cat.code} value={cat.code}>
                            {t(`domain.hazardCategories.${cat.code}`, { fallback: cat.label })}
                          </option>
                        ))}
                      </SheetSelect>
                    </SheetCell>
                    <SheetCell>
                      <textarea
                        className="w-full min-h-[60px] text-sm border border-slate-200 rounded p-2 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder={t("ra.risk.controlsPlaceholder")}
                        value={getControlsEditValue(hazard)}
                        onChange={(event) =>
                          setControlsEditing((prev) => ({ ...prev, [hazard.id]: event.target.value }))
                        }
                        onBlur={() => handleControlsBlur(hazard.id)}
                      />
                    </SheetCell>
                    <SheetCell>
                      <div className="sheet-risk-cell" style={{ backgroundColor: cellColor, color: textColor }}>
                        <label>
                          {t("ra.risk.severity")}
                          <SheetSelect
                            value={current.severity}
                            onChange={(event) =>
                              handleRatingChange(hazard.id, { severity: event.target.value })
                            }
                          >
                            <option value="">{t("ra.risk.selectOption")}</option>
                            {severityOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </SheetSelect>
                        </label>
                        <label>
                          {t("ra.risk.likelihood")}
                          <SheetSelect
                            value={current.likelihood}
                            onChange={(event) =>
                              handleRatingChange(hazard.id, { likelihood: event.target.value })
                            }
                          >
                            <option value="">{t("ra.risk.selectOption")}</option>
                            {likelihoodOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </SheetSelect>
                        </label>
                      </div>
                    </SheetCell>
                  </SheetRow>
                );
              })}
              {hazards.length === 0 && (
                <SheetRow>
                  <SheetCell colSpan={4} className="sheet-empty-cell">
                    {t("ra.risk.noHazards")}
                  </SheetCell>
                </SheetRow>
              )}
            </SheetBody>
          </SheetTable>
        </section>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SaveStatus status={status} />
        {canAdvance && (
          <button type="button" className="bg-emerald-600" disabled={saving} onClick={onNext}>
            {t("common.continue")}
          </button>
        )}
      </div>
    </div>
  );
};
