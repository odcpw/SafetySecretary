import { useEffect, useMemo, useState } from "react";
import { AssistantPanel } from "@/components/common/AssistantPanel";
import { SaveStatus } from "@/components/common/SaveStatus";
import {
  SheetBody,
  SheetButton,
  SheetCell,
  SheetHead,
  SheetHeaderCell,
  SheetInput,
  SheetRow,
  SheetSelect,
  SheetTable
} from "@/components/ui/SheetTable";
import type { ControlHierarchy, RatingInput, RiskAssessmentCase } from "@/types/riskAssessment";
import {
  buildDefaultMatrixLabels,
  getRiskColorForAssessment,
  getRiskLabelForAssessment,
  loadMatrixSettings,
  type RiskMatrixSettings
} from "@/lib/riskMatrixSettings";
import { TEMPLATE_LIKELIHOOD_OPTIONS, TEMPLATE_SEVERITY_OPTIONS } from "@/lib/templateRiskScales";
import { useSaveStatus } from "@/hooks/useSaveStatus";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { useI18n } from "@/i18n/I18nContext";

interface PhaseControlsProps {
  raCase: RiskAssessmentCase;
  saving: boolean;
  onAddProposedControl: (hazardId: string, description: string, hierarchy?: ControlHierarchy) => Promise<void>;
  onDeleteProposedControl: (hazardId: string, controlId: string) => Promise<void>;
  onUpdateHazard: (hazardId: string, patch: { existingControls?: string[] }) => Promise<void>;
  onSaveResidualRisk: (ratings: RatingInput[]) => Promise<void>;
  onExtractControls: (notes: string) => Promise<void>;
  onNext: () => Promise<void>;
  canAdvance?: boolean;
  mode?: "controls" | "residual";
}

const groupHazardsByStep = (raCase: RiskAssessmentCase) => {
  const grouped = raCase.steps.map((step) => ({
    step,
    hazards: raCase.hazards
      .filter((hazard) => hazard.stepId === step.id)
      .sort((a, b) => a.orderIndex - b.orderIndex)
  }));
  return grouped.filter((entry) => entry.hazards.length > 0);
};

// Form state for adding new proposed controls
interface NewControlForm {
  description: string;
  hierarchy: ControlHierarchy | "";
}

const getResidualDraft = (raCase: RiskAssessmentCase) =>
  raCase.hazards.reduce<Record<string, { severity: string; likelihood: string }>>((acc, hazard) => {
    acc[hazard.id] = {
      severity: hazard.residual?.severity ?? "",
      likelihood: hazard.residual?.likelihood ?? ""
    };
    return acc;
  }, {});

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

export const PhaseControls = ({
  raCase,
  saving,
  onAddProposedControl,
  onDeleteProposedControl,
  onUpdateHazard,
  onSaveResidualRisk,
  onExtractControls,
  onNext,
  canAdvance = true,
  mode = "controls"
}: PhaseControlsProps) => {
  const { t, locale } = useI18n();
  const defaultLabels = useMemo(() => buildDefaultMatrixLabels(t), [t]);
  const [residualDraft, setResidualDraft] = useState<Record<string, { severity: string; likelihood: string }>>(() =>
    getResidualDraft(raCase)
  );
  const [controlForms, setControlForms] = useState<Record<string, NewControlForm>>({});
  const [riskSettings, setRiskSettings] = useState<RiskMatrixSettings | null>(() => loadMatrixSettings(defaultLabels));
  const [assistantNotes, setAssistantNotes] = useState("");
  const [llmStatus, setLlmStatus] = useState<string | null>(null);
  // State for inline editing of existing controls
  const [existingControlsEditing, setExistingControlsEditing] = useState<Record<string, string>>({});
  const { status, show, showSuccess, showError } = useSaveStatus();
  const { confirm, dialog } = useConfirmDialog();

  const hierarchyOptions = useMemo(
    () => [
      { value: "SUBSTITUTION" as const, label: t("ra.controls.hierarchy.substitution"), description: t("ra.controls.hierarchy.substitutionHint") },
      { value: "TECHNICAL" as const, label: t("ra.controls.hierarchy.technical"), description: t("ra.controls.hierarchy.technicalHint") },
      { value: "ORGANIZATIONAL" as const, label: t("ra.controls.hierarchy.organizational"), description: t("ra.controls.hierarchy.organizationalHint") },
      { value: "PPE" as const, label: t("ra.controls.hierarchy.ppe"), description: t("ra.controls.hierarchy.ppeHint") }
    ],
    [t]
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

  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      setResidualDraft(getResidualDraft(raCase));
    });
    return () => cancelAnimationFrame(handle);
  }, [raCase]);

  useEffect(() => {
    const syncSettings = () => setRiskSettings(loadMatrixSettings(defaultLabels));
    window.addEventListener("storage", syncSettings);
    return () => window.removeEventListener("storage", syncSettings);
  }, [defaultLabels]);

  useEffect(() => {
    setRiskSettings(loadMatrixSettings(defaultLabels));
  }, [defaultLabels]);

  const grouped = groupHazardsByStep(raCase);
  const stepNumberMap = useMemo(() => new Map(raCase.steps.map((step, index) => [step.id, index + 1])), [raCase.steps]);

  const saveResidualDraft = async (
    hazardIds?: string[],
    nextDraft?: Record<string, { severity: string; likelihood: string }>
  ) => {
    const source = nextDraft ?? residualDraft;
    const ids = hazardIds ?? raCase.hazards.map((hazard) => hazard.id);
    const payload: RatingInput[] = ids
      .map((hazardId) => ({
        hazardId,
        severity: (source[hazardId]?.severity ?? "") as RatingInput["severity"],
        likelihood: (source[hazardId]?.likelihood ?? "") as RatingInput["likelihood"]
      }))
      .filter((entry) => (entry.severity && entry.likelihood) || (!entry.severity && !entry.likelihood));
    if (!payload.length) {
      return false;
    }
    await onSaveResidualRisk(payload);
    return true;
  };

  const handleAddControl = async (hazardId: string) => {
    const form = controlForms[hazardId];
    const description = form?.description?.trim();
    if (!description) {
      return;
    }
    show({ message: t("ra.controls.addingProposed"), tone: "info" });
    const hierarchy = form.hierarchy || undefined;
    try {
      await onAddProposedControl(hazardId, description, hierarchy);
      setControlForms((prev) => ({ ...prev, [hazardId]: { description: "", hierarchy: "" } }));
      showSuccess(t("ra.controls.proposedAdded"));
    } catch (error) {
      console.error(error);
      showError(
        error instanceof Error ? error.message : t("ra.controls.addFailed"),
        () => void handleAddControl(hazardId),
        undefined,
        t("common.retry")
      );
    }
  };

  const handleDeleteControl = async (hazardId: string, controlId: string) => {
    const ok = await confirm({
      title: t("common.delete"),
      description: t("ra.controls.confirmRemove"),
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
      tone: "danger"
    });
    if (!ok) return;
    show({ message: t("ra.controls.removing"), tone: "info" });
    try {
      await onDeleteProposedControl(hazardId, controlId);
      showSuccess(t("ra.controls.removed"), 1200);
    } catch (error) {
      console.error(error);
      showError(
        error instanceof Error ? error.message : t("ra.controls.removeFailed"),
        () => void handleDeleteControl(hazardId, controlId),
        undefined,
        t("common.retry")
      );
    }
  };

  const handleResidualChange = (hazardId: string, patch: Partial<{ severity: string; likelihood: string }>) => {
    setResidualDraft((prev) => {
      const current = prev[hazardId] ?? { severity: "", likelihood: "" };
      const next = { ...current, ...patch };
      const nextDraft = { ...prev, [hazardId]: next };
      const shouldSave =
        (next.severity && next.likelihood) || (!next.severity && !next.likelihood);
      if (shouldSave) {
        const isClearing = !next.severity && !next.likelihood;
        show({ message: isClearing ? t("ra.controls.clearingResidual") : t("ra.controls.savingResidual"), tone: "info" });
        void saveResidualDraft([hazardId], nextDraft)
          .then((saved) => {
            if (saved) {
              showSuccess(isClearing ? t("ra.controls.residualCleared") : t("ra.controls.residualSaved"));
            }
          })
          .catch((error) => {
            console.error(error);
            showError(
              error instanceof Error ? error.message : t("ra.controls.residualSaveFailed"),
              () => void handleResidualChange(hazardId, patch),
              undefined,
              t("common.retry")
            );
          });
      }
      return { ...prev, [hazardId]: next };
    });
  };

  const handleSaveResidual = async () => {
    show({ message: t("ra.controls.savingResidual"), tone: "info" });
    try {
      const saved = await saveResidualDraft();
      showSuccess(saved ? t("ra.controls.residualUpdated") : t("ra.controls.nothingToSave"));
    } catch (error) {
      console.error(error);
      showError(
        error instanceof Error ? error.message : t("ra.controls.residualSaveFailed"),
        () => void handleSaveResidual(),
        undefined,
        t("common.retry")
      );
    }
  };

  const statusHint =
    mode === "residual"
      ? t("ra.controls.residualHint")
      : t("ra.controls.controlsHint");

  const handleExtractControls = async () => {
    if (!assistantNotes.trim()) {
      return;
    }
    setLlmStatus(t("ra.controls.requestingSuggestions"));
    try {
      await onExtractControls(assistantNotes);
      setAssistantNotes("");
      setLlmStatus(t("ra.controls.suggestionsRequested"));
      setTimeout(() => setLlmStatus(null), 2000);
    } catch (err) {
      console.error(err);
      setLlmStatus(err instanceof Error ? err.message : t("ra.controls.suggestionsFailed"));
      setTimeout(() => setLlmStatus(null), 5000);
    }
  };

  const handleExistingControlsBlur = async (hazardId: string) => {
    const editedText = existingControlsEditing[hazardId];
    if (editedText === undefined) return;

    const controls = editedText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    show({ message: t("ra.controls.updatingExisting"), tone: "info" });
    try {
      await onUpdateHazard(hazardId, { existingControls: controls });
      setExistingControlsEditing((prev) => {
        const next = { ...prev };
        delete next[hazardId];
        return next;
      });
      showSuccess(t("ra.controls.existingUpdated"));
    } catch (error) {
      console.error(error);
      showError(
        error instanceof Error ? error.message : t("ra.controls.existingUpdateFailed"),
        () => void handleExistingControlsBlur(hazardId),
        undefined,
        t("common.retry")
      );
    }
  };

  const getExistingControlsEditValue = (hazard: RiskAssessmentCase["hazards"][number]) => {
    if (existingControlsEditing[hazard.id] !== undefined) {
      return existingControlsEditing[hazard.id];
    }
    return (hazard.existingControls ?? []).join("\n");
  };

  const voiceLang = locale === "fr" ? "fr-FR" : locale === "de" ? "de-DE" : "en-US";

  return (
    <div className="space-y-6">
      <AssistantPanel
        title={t("ra.controls.assistantTitle")}
        description={t("ra.controls.assistantDescription")}
        value={assistantNotes}
        placeholder={t("ra.controls.assistantPlaceholder")}
        primaryLabel={t("ra.controls.assistantAction")}
        status={llmStatus}
        disabled={saving}
        enableVoice
        voiceLang={voiceLang}
        onChange={setAssistantNotes}
        onSubmit={handleExtractControls}
        onClear={() => setAssistantNotes("")}
      />

      {grouped.map(({ step, hazards }) => (
        <section key={step.id} className="rounded-lg border border-slate-200 p-4 space-y-3">
          <header>
            <h3 className="text-lg font-semibold text-slate-900">{step.activity}</h3>
            {step.description && <p className="text-sm text-slate-500">{step.description}</p>}
          </header>
          <div className="sheet-table-wrapper">
            <SheetTable>
              <colgroup>
                <col className="sheet-col-label" />
                <col className="sheet-col-description" />
                <col className="sheet-col-label" />
                <col className="sheet-col-actions" />
              </colgroup>
              <SheetHead>
                <SheetRow>
                  <SheetHeaderCell>{t("ra.controls.table.hazard")}</SheetHeaderCell>
                  <SheetHeaderCell>{t("ra.controls.table.controls")}</SheetHeaderCell>
                  <SheetHeaderCell>{t("ra.controls.table.residualAssessment")}</SheetHeaderCell>
                  <SheetHeaderCell>{t("ra.controls.table.riskTrend")}</SheetHeaderCell>
                </SheetRow>
              </SheetHead>
              <SheetBody>
                {hazards.map((hazard, hazardIndex) => {
                  const residual = residualDraft[hazard.id] ?? { severity: "", likelihood: "" };
                  const residualPreview =
                    residual.severity && residual.likelihood
                      ? `${residual.severity} × ${residual.likelihood}`
                      : t("ra.controls.pending");
                  const numbering =
                    stepNumberMap.get(step.id) !== undefined
                      ? `${stepNumberMap.get(step.id)}.${hazardIndex + 1}`
                      : "";
                  const cellColor = getRiskColorForAssessment(
                    residual.severity,
                    residual.likelihood,
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
                        <div className="sheet-control-list space-y-3">
                          {/* Existing controls - editable */}
                          <div className="space-y-1">
                            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                              {t("ra.controls.existingLabel")}
                            </div>
                            <textarea
                              className="w-full min-h-[50px] text-sm border border-slate-200 rounded p-2 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder={t("ra.controls.onePerLine")}
                              value={getExistingControlsEditValue(hazard)}
                              onChange={(event) =>
                                setExistingControlsEditing((prev) => ({ ...prev, [hazard.id]: event.target.value }))
                              }
                              onBlur={() => handleExistingControlsBlur(hazard.id)}
                            />
                          </div>

                          {/* Proposed controls - with hierarchy badge and delete */}
                          {hazard.proposedControls && hazard.proposedControls.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                                {t("ra.controls.proposedLabel")}
                              </div>
                              {hazard.proposedControls.map((control) => {
                                const hierarchyOption = hierarchyOptions.find((h) => h.value === control.hierarchy);
                                return (
                                  <div key={control.id} className="flex items-start gap-2 text-sm">
                                    {hierarchyOption && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-slate-200 text-slate-700">
                                        {hierarchyOption.label.split(" - ")[0]}
                                      </span>
                                    )}
                                    <span className="flex-1 text-slate-700">{control.description}</span>
                                    <button
                                      type="button"
                                      className="text-slate-400 hover:text-red-500 text-xs"
                                      onClick={() => handleDeleteControl(hazard.id, control.id)}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Empty state */}
                          {(!hazard.existingControls || hazard.existingControls.length === 0) &&
                           (!hazard.proposedControls || hazard.proposedControls.length === 0) && (
                            <p className="text-sm text-slate-500 italic">{t("ra.controls.noControls")}</p>
                          )}

                          {/* Add proposed control form */}
                          <form
                            className="sheet-control-add-form space-y-2 pt-2 border-t border-slate-100"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void handleAddControl(hazard.id);
                            }}
                          >
                            <SheetInput
                              value={controlForms[hazard.id]?.description ?? ""}
                              onChange={(event) =>
                                setControlForms((prev) => ({
                                  ...prev,
                                  [hazard.id]: { ...prev[hazard.id], description: event.target.value, hierarchy: prev[hazard.id]?.hierarchy ?? "" }
                                }))
                              }
                              placeholder={t("ra.controls.proposedPlaceholder")}
                            />
                            <div className="flex gap-2">
                              <SheetSelect
                                value={controlForms[hazard.id]?.hierarchy ?? ""}
                                onChange={(event) =>
                                  setControlForms((prev) => ({
                                    ...prev,
                                    [hazard.id]: { ...prev[hazard.id], description: prev[hazard.id]?.description ?? "", hierarchy: event.target.value as ControlHierarchy | "" }
                                  }))
                                }
                              >
                                <option value="">{t("ra.controls.hierarchySelect")}</option>
                                {hierarchyOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </SheetSelect>
                              <SheetButton type="submit" variant="primary" disabled={saving}>
                                {t("common.add")}
                              </SheetButton>
                            </div>
                          </form>
                        </div>
                      </SheetCell>
                      <SheetCell>
                        <div className="sheet-risk-cell" style={{ backgroundColor: cellColor, color: textColor }}>
                          <label>
                            {t("ra.controls.severity")}
                            <SheetSelect
                              value={residual.severity}
                              onChange={(event) =>
                                handleResidualChange(hazard.id, { severity: event.target.value })
                              }
                            >
                              <option value="">{t("ra.controls.selectOption")}</option>
                              {severityOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </SheetSelect>
                          </label>
                          <label>
                            {t("ra.controls.likelihood")}
                            <SheetSelect
                              value={residual.likelihood}
                              onChange={(event) =>
                                handleResidualChange(hazard.id, { likelihood: event.target.value })
                              }
                            >
                              <option value="">{t("ra.controls.selectOption")}</option>
                              {likelihoodOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </SheetSelect>
                          </label>
                        </div>
                      </SheetCell>
                      <SheetCell className="sheet-cell-actions">
                        {(() => {
                          const baselineLabel =
                            hazard.baseline?.riskRating ??
                            getRiskLabelForAssessment(hazard.baseline?.severity, hazard.baseline?.likelihood, riskSettings ?? undefined) ??
                            t("common.noData");
                          const residualLabel =
                            hazard.residual?.riskRating ??
                            getRiskLabelForAssessment(residual.severity, residual.likelihood, riskSettings ?? undefined) ??
                            residualPreview;
                          return (
                            <>
                              <div className="text-xs text-slate-500">
                                {t("ra.controls.baselineLabel")}: {baselineLabel}
                              </div>
                              <div className="text-xs font-semibold text-slate-700">
                                {t("ra.controls.residualLabel")}: {residualLabel}
                              </div>
                            </>
                          );
                        })()}
                      </SheetCell>
                    </SheetRow>
                  );
                })}
                {hazards.length === 0 && (
                  <SheetRow>
                    <SheetCell colSpan={5} className="sheet-empty-cell">
                      {t("ra.controls.noHazards")}
                    </SheetCell>
                  </SheetRow>
                )}
              </SheetBody>
            </SheetTable>
          </div>
        </section>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {status ? <SaveStatus status={status} /> : <div className="text-sm text-slate-500">{statusHint}</div>}
        <div className="flex gap-2">
          <button type="button" onClick={handleSaveResidual} disabled={saving}>
            {t("ra.controls.saveResidual")}
          </button>
          {canAdvance && (
            <button type="button" className="btn-primary" disabled={saving} onClick={onNext}>
              {t("common.continue")}
            </button>
          )}
        </div>
      </div>
      {dialog}
    </div>
  );
};
