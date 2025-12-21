import { useCallback, useEffect, useMemo, useState } from "react";
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
  SheetTable,
  SheetTextarea
} from "@/components/ui/SheetTable";
import type { Hazard, RiskAssessmentCase } from "@/types/riskAssessment";
import { HAZARD_CATEGORIES } from "@/lib/hazardCategories";
import { useHazardDrafts } from "@/hooks/useHazardDrafts";
import { useSaveStatus } from "@/hooks/useSaveStatus";
import { useI18n } from "@/i18n/I18nContext";

interface PhaseHazardNarrativeProps {
  raCase: RiskAssessmentCase;
  saving: boolean;
  onExtractHazards: (narrative: string, stepId?: string) => Promise<void>;
  onAddHazard: (stepId: string, label: string, description: string) => Promise<void>;
  onUpdateHazard: (hazardId: string, patch: { label?: string; description?: string; stepId?: string; existingControls?: string[]; categoryCode?: string }) => Promise<void>;
  onDeleteHazard: (hazardId: string) => Promise<void>;
  onReorderHazards: (stepId: string, hazardIds: string[]) => Promise<void>;
  onNext: () => Promise<void>;
  canAdvance?: boolean;
}

const ALL_STEPS = "ALL";

export const PhaseHazardNarrative = ({
  raCase,
  saving,
  onExtractHazards,
  onAddHazard,
  onUpdateHazard,
  onDeleteHazard,
  onReorderHazards,
  onNext,
  canAdvance = true
}: PhaseHazardNarrativeProps) => {
  const [narrative, setNarrative] = useState("");
  const [activeStepId, setActiveStepId] = useState<string>(ALL_STEPS);
  const [forms, setForms] = useState<Record<string, { label: string; description: string }>>({});
  const [moveMenuHazardId, setMoveMenuHazardId] = useState<string | null>(null);
  const [pendingDuplicates, setPendingDuplicates] = useState<
    Array<{
      id: string;
      stepId: string;
      originalHazardId: string;
      previousIds: string[];
      label: string;
      description: string;
    }>
  >([]);
  const [assistantStatus, setAssistantStatus] = useState<string | null>(null);

  const { drafts, patchDraft, commitDraft } = useHazardDrafts(raCase.hazards);
  const { t, locale } = useI18n();
  const { status, show, showSuccess, showError, clear } = useSaveStatus();

  const stepNumberMap = useMemo(
    () => new Map(raCase.steps.map((step, index) => [step.id, index + 1])),
    [raCase.steps]
  );

  const hazardsByStep = useMemo(
    () =>
      raCase.steps.map((step) => ({
        step,
        hazards: raCase.hazards
          .filter((hazard) => hazard.stepId === step.id)
          .sort((a, b) => a.orderIndex - b.orderIndex)
      })),
    [raCase.hazards, raCase.steps]
  );

  const stepsToRender = useMemo(() => {
    if (activeStepId === ALL_STEPS) {
      return hazardsByStep;
    }
    return hazardsByStep.filter((group) => group.step.id === activeStepId);
  }, [activeStepId, hazardsByStep]);

  const handleExtract = async () => {
    if (!narrative.trim()) {
      return;
    }
    setAssistantStatus(t("ra.hazards.extracting"));
    const stepId = activeStepId === ALL_STEPS ? undefined : activeStepId;
    try {
      await onExtractHazards(narrative, stepId);
      setNarrative("");
      setAssistantStatus(t("ra.hazards.extracted"));
      setTimeout(() => setAssistantStatus(null), 2500);
    } catch (err) {
      console.error(err);
      setAssistantStatus(err instanceof Error ? err.message : t("ra.hazards.extractFailed"));
      setTimeout(() => setAssistantStatus(null), 5000);
    }
  };

  const handleAutoSave = useCallback(
    async (hazardId: string) => {
      try {
        show({ message: t("status.savingChanges"), tone: "info" });
        const saved = await commitDraft(hazardId, onUpdateHazard);
        if (saved) {
          showSuccess(t("status.saved"));
        } else {
          clear();
        }
      } catch (err) {
        console.error(err);
        showError(
          err instanceof Error ? err.message : t("status.saveFailed"),
          () => void handleAutoSave(hazardId),
          undefined,
          t("common.retry")
        );
      }
    },
    [commitDraft, onUpdateHazard, show, showSuccess, showError, clear, t]
  );

  const handleDelete = async (hazardId: string) => {
    if (!window.confirm(t("ra.hazards.confirmDelete"))) {
      return;
    }
    show({ message: t("ra.hazards.deleting"), tone: "info" });
    try {
      await onDeleteHazard(hazardId);
      showSuccess(t("ra.hazards.deleted"), 2000);
    } catch (err) {
      console.error(err);
      showError(
        err instanceof Error ? err.message : t("ra.hazards.deleteFailed"),
        () => void handleDelete(hazardId),
        undefined,
        t("common.retry")
      );
    }
  };

  const handleCategoryChange = async (
    hazardId: string,
    currentCategory: string | null | undefined,
    nextCategory: string
  ) => {
    if ((currentCategory ?? "") === nextCategory) {
      return;
    }
    show({ message: t("ra.risk.updatingCategory"), tone: "info" });
    try {
      await onUpdateHazard(hazardId, { categoryCode: nextCategory || undefined });
      showSuccess(t("ra.risk.categoryUpdated"));
    } catch (err) {
      console.error(err);
      showError(
        err instanceof Error ? err.message : t("ra.risk.categoryUpdateFailed"),
        () => void handleCategoryChange(hazardId, currentCategory, nextCategory),
        undefined,
        t("common.retry")
      );
    }
  };

  const handleReorder = async (stepId: string, hazardId: string, direction: "up" | "down") => {
    const hazards = hazardsByStep.find((group) => group.step.id === stepId)?.hazards.slice();
    if (!hazards) {
      return;
    }
    const index = hazards.findIndex((hazard) => hazard.id === hazardId);
    if (index === -1) {
      return;
    }
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= hazards.length) {
      return;
    }
    [hazards[index], hazards[targetIndex]] = [hazards[targetIndex], hazards[index]];
    show({ message: t("ra.hazards.reordering"), tone: "info" });
    try {
      await onReorderHazards(
        stepId,
        hazards.map((hazard) => hazard.id)
      );
      showSuccess(t("ra.hazards.orderUpdated"));
    } catch (err) {
      console.error(err);
      showError(
        err instanceof Error ? err.message : t("ra.hazards.reorderFailed"),
        () => void handleReorder(stepId, hazardId, direction),
        undefined,
        t("common.retry")
      );
    }
  };

  const handleMoveToStep = async (hazardId: string, targetStepId: string) => {
    setMoveMenuHazardId(null);
    show({ message: t("ra.hazards.moving"), tone: "info" });
    try {
      await onUpdateHazard(hazardId, {
        stepId: targetStepId
      });
      showSuccess(t("ra.hazards.moved"), 2000);
    } catch (err) {
      console.error(err);
      showError(
        err instanceof Error ? err.message : t("ra.hazards.moveFailed"),
        () => void handleMoveToStep(hazardId, targetStepId),
        undefined,
        t("common.retry")
      );
    }
  };

  const handleAddHazard = async (stepId: string) => {
    const form = forms[stepId];
    if (!form?.label || !form?.description) {
      return;
    }
    show({ message: t("ra.hazards.adding"), tone: "info" });
    try {
      await onAddHazard(stepId, form.label, form.description);
      setForms((prev) => ({ ...prev, [stepId]: { label: "", description: "" } }));
      showSuccess(t("ra.hazards.added"), 2000);
    } catch (err) {
      console.error(err);
      showError(
        err instanceof Error ? err.message : t("ra.hazards.addFailed"),
        () => void handleAddHazard(stepId),
        undefined,
        t("common.retry")
      );
    }
  };

  const handleDuplicateHazard = async (stepId: string, hazard: Hazard) => {
    show({ message: t("ra.hazards.duplicating"), tone: "info" });
    const duplicateId = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
    setPendingDuplicates((queue) => [
      ...queue,
      {
        id: duplicateId,
        stepId,
        originalHazardId: hazard.id,
        previousIds: raCase.hazards.map((existing) => existing.id),
        label: hazard.label,
        description: hazard.description ?? ""
      }
    ]);
    try {
      await onAddHazard(stepId, hazard.label, hazard.description ?? "");
      showSuccess(t("ra.hazards.duplicated"), 2000);
    } catch (err) {
      console.error(err);
      showError(
        err instanceof Error ? err.message : t("ra.hazards.duplicateFailed"),
        () => void handleDuplicateHazard(stepId, hazard),
        undefined,
        t("common.retry")
      );
    }
  };

  useEffect(() => {
    if (!pendingDuplicates.length) {
      return;
    }
    const processDuplicates = async () => {
      for (const duplicate of pendingDuplicates) {
        const previousIdSet = new Set(duplicate.previousIds);
        const candidate = raCase.hazards.find(
          (hazard) =>
            !previousIdSet.has(hazard.id) &&
            hazard.stepId === duplicate.stepId &&
            hazard.label === duplicate.label &&
            (hazard.description ?? "") === duplicate.description
        );
        if (!candidate) {
          continue;
        }
        const stepGroup = hazardsByStep.find((group) => group.step.id === duplicate.stepId);
        if (!stepGroup) {
          setPendingDuplicates((queue) => queue.filter((item) => item.id !== duplicate.id));
          return;
        }
        const order = stepGroup.hazards.map((hazard) => hazard.id);
        const originalIndex = order.indexOf(duplicate.originalHazardId);
        const newIndex = order.indexOf(candidate.id);
        if (originalIndex === -1 || newIndex === -1) {
          setPendingDuplicates((queue) => queue.filter((item) => item.id !== duplicate.id));
          return;
        }
        if (newIndex !== originalIndex + 1) {
          const reordered = [...order];
          reordered.splice(newIndex, 1);
          reordered.splice(originalIndex + 1, 0, candidate.id);
          await onReorderHazards(duplicate.stepId, reordered);
        }
        setPendingDuplicates((queue) => queue.filter((item) => item.id !== duplicate.id));
        showSuccess(t("ra.hazards.duplicated"), 2000);
        return;
      }
    };
    void processDuplicates();
  }, [pendingDuplicates, raCase.hazards, hazardsByStep, onReorderHazards, showSuccess, t]);

  useEffect(() => {
    if (!moveMenuHazardId) {
      return;
    }
    const handleClickAway = (event: MouseEvent) => {
      if (!(event.target instanceof HTMLElement)) {
        return;
      }
      if (event.target.closest(".sheet-move-control")) {
        return;
      }
      setMoveMenuHazardId(null);
    };
    document.addEventListener("mousedown", handleClickAway);
    return () => document.removeEventListener("mousedown", handleClickAway);
  }, [moveMenuHazardId]);

  const voiceLang = locale === "fr" ? "fr-FR" : locale === "de" ? "de-DE" : "en-US";

  return (
    <div className="space-y-6">
      <AssistantPanel
        title={t("ra.hazards.assistantTitle")}
        description={t("ra.hazards.assistantDescription")}
        value={narrative}
        placeholder={t("ra.hazards.assistantPlaceholder")}
        primaryLabel={t("ra.hazards.assistantAction")}
        status={assistantStatus}
        disabled={saving}
        enableVoice
        voiceLang={voiceLang}
        onChange={setNarrative}
        onSubmit={handleExtract}
        onClear={() => setNarrative("")}
      />

      <section className="rounded-lg border border-slate-200 p-4 space-y-4">
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

        <SheetTable>
          <colgroup>
            <col className="sheet-col-step" />
            <col className="sheet-col-number" />
            <col className="sheet-col-label" />
            <col className="sheet-col-label" />
            <col className="sheet-col-description" />
            <col className="sheet-col-description" />
            <col className="sheet-col-actions" />
          </colgroup>
          <SheetHead>
            <SheetRow>
              <SheetHeaderCell>{t("ra.hazards.table.processStep")}</SheetHeaderCell>
              <SheetHeaderCell>{t("ra.common.number")}</SheetHeaderCell>
              <SheetHeaderCell>{t("ra.hazards.table.hazard")}</SheetHeaderCell>
              <SheetHeaderCell>{t("ra.hazards.table.category")}</SheetHeaderCell>
              <SheetHeaderCell>{t("ra.hazards.table.description")}</SheetHeaderCell>
              <SheetHeaderCell>{t("ra.hazards.table.existingControls")}</SheetHeaderCell>
              <SheetHeaderCell>{t("ra.hazards.table.actions")}</SheetHeaderCell>
            </SheetRow>
          </SheetHead>
          <SheetBody>
            {stepsToRender.map(({ step, hazards }) => {
              const stepNumber = stepNumberMap.get(step.id);
              const visibleHazards = hazards.length ? hazards : [null];
              return visibleHazards.map((hazard, index) => {
                const hazardNumber =
                  hazard && stepNumber ? `${stepNumber}.${index + 1}` : hazard ? `${index + 1}` : "";
                const draft = hazard
                  ? drafts[hazard.id] ?? { label: hazard.label, description: hazard.description ?? "", existingControls: (hazard.existingControls ?? []).join("\n") }
                  : null;
                const rowSpan = hazards.length ? hazards.length : 1;

                return (
                  <SheetRow key={`${step.id}-${hazard ? hazard.id : "empty"}`}>
                    {index === 0 && (
                      <SheetCell rowSpan={rowSpan} className="sheet-step-cell sheet-step-cell--sheet">
                        <div className="sheet-step-heading">
                          <div className="sheet-step-index">{stepNumber ? `${stepNumber}.` : "-"}</div>
                          <div>
                            <strong>{step.activity}</strong>
                            {step.equipment && step.equipment.length > 0 && (
                              <p className="text-xs text-slate-500">
                                {t("ra.hazards.equipmentLabel")}: {step.equipment.join(", ")}
                              </p>
                            )}
                            {step.substances && step.substances.length > 0 && (
                              <p className="text-xs text-slate-500">
                                {t("ra.hazards.substancesLabel")}: {step.substances.join(", ")}
                              </p>
                            )}
                            <p>{step.description || t("ra.common.noDescription")}</p>
                          </div>
                        </div>
                        <div className="sheet-control-list">
                          <form
                            className="sheet-control-add-form sheet-hazard-add-form"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void handleAddHazard(step.id);
                            }}
                          >
                            <SheetInput
                              value={forms[step.id]?.label ?? ""}
                              onChange={(event) =>
                                setForms((prev) => ({
                                  ...prev,
                                  [step.id]: {
                                    ...(prev[step.id] ?? { description: "" }),
                                    label: event.target.value
                                  }
                                }))
                              }
                              placeholder={t("ra.hazards.form.labelPlaceholder")}
                            />
                            <SheetTextarea
                              className="sheet-hazard-add-textarea"
                              value={forms[step.id]?.description ?? ""}
                              onChange={(event) =>
                                setForms((prev) => ({
                                  ...prev,
                                  [step.id]: {
                                    ...(prev[step.id] ?? { label: "" }),
                                    description: event.target.value
                                  }
                                }))
                              }
                              placeholder={t("ra.hazards.form.descriptionPlaceholder")}
                            />
                            <SheetButton
                              type="submit"
                              variant="primary"
                              disabled={saving || !forms[step.id]?.label || !forms[step.id]?.description}
                            >
                              {t("ra.hazards.form.addHazard")}
                            </SheetButton>
                          </form>
                        </div>
                      </SheetCell>
                    )}
                    {hazard ? (
                      <>
                        <SheetCell className="sheet-cell-number">{hazardNumber}</SheetCell>
                        <SheetCell>
                          <SheetInput
                            value={draft?.label ?? ""}
                            onChange={(event) =>
                              patchDraft(hazard.id, { label: event.target.value })
                            }
                            onBlur={() => {
                              void handleAutoSave(hazard.id);
                            }}
                          />
                        </SheetCell>
                        <SheetCell>
                          <SheetSelect
                            value={hazard.categoryCode ?? ""}
                            onChange={(event) =>
                              void handleCategoryChange(hazard.id, hazard.categoryCode, event.target.value)
                            }
                            disabled={saving}
                            title={hazard.categoryCode ?? ""}
                          >
                            <option value="">{t("ra.risk.selectCategory")}</option>
                            {HAZARD_CATEGORIES.map((category) => (
                              <option key={category.code} value={category.code}>
                                {t(`domain.hazardCategories.${category.code}`, { fallback: category.label })}
                              </option>
                            ))}
                          </SheetSelect>
                        </SheetCell>
                        <SheetCell className="sheet-cell--description">
                          <SheetTextarea
                            className="sheet-textarea--expanded"
                            value={draft?.description ?? ""}
                            onChange={(event) =>
                              patchDraft(hazard.id, { description: event.target.value })
                            }
                            onBlur={() => {
                              void handleAutoSave(hazard.id);
                            }}
                            placeholder={t("ra.hazards.form.descriptionHint")}
                          />
                        </SheetCell>
                        <SheetCell className="sheet-cell--description">
                          <SheetTextarea
                            className="sheet-textarea--expanded"
                            value={draft?.existingControls ?? ""}
                            onChange={(event) =>
                              patchDraft(hazard.id, { existingControls: event.target.value })
                            }
                            onBlur={() => {
                              void handleAutoSave(hazard.id);
                            }}
                            placeholder={t("ra.hazards.form.controlsHint")}
                          />
                        </SheetCell>
                        <SheetCell className="sheet-cell-actions">
                          <div className="sheet-actions-grid">
                            <SheetButton
                              variant="icon"
                              disabled={index === 0}
                              onClick={() => handleReorder(step.id, hazard.id, "up")}
                            >
                              ↑
                            </SheetButton>
                            <SheetButton
                              variant="icon"
                              disabled={index === hazards.length - 1}
                              onClick={() => handleReorder(step.id, hazard.id, "down")}
                            >
                              ↓
                            </SheetButton>
                            <div className="sheet-move-control">
                              <SheetButton
                                variant="move"
                                className={
                                  moveMenuHazardId === hazard.id
                                    ? "is-active"
                                    : ""
                                }
                                onClick={() =>
                                  setMoveMenuHazardId((current) => (current === hazard.id ? null : hazard.id))
                                }
                                title={t("ra.hazards.moveTitle")}
                              >
                                ⇢
                              </SheetButton>
                              {moveMenuHazardId === hazard.id && (
                                <div className="sheet-move-menu">
                                  <p>{t("ra.hazards.movePrompt")}</p>
                                  <ul>
                                    {raCase.steps.map((stepOption) => (
                                      <li key={stepOption.id}>
                                        <button
                                          type="button"
                                          onClick={() => handleMoveToStep(hazard.id, stepOption.id)}
                                          disabled={hazard.stepId === stepOption.id}
                                        >
                                          {stepNumberMap.get(stepOption.id)
                                            ? `${stepNumberMap.get(stepOption.id)}. `
                                            : ""}
                                          {stepOption.activity}
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                            <SheetButton
                              variant="duplicate"
                              onClick={() => handleDuplicateHazard(step.id, hazard)}
                            >
                              {t("common.duplicate")}
                            </SheetButton>
                            <SheetButton
                              variant="danger"
                              onClick={() => handleDelete(hazard.id)}
                            >
                              {t("common.delete")}
                            </SheetButton>
                          </div>
                        </SheetCell>
                      </>
                    ) : (
                      <SheetCell colSpan={6} className="sheet-empty-cell">
                        {t("ra.hazards.empty")}
                      </SheetCell>
                    )}
                  </SheetRow>
                );
              });
            })}
          </SheetBody>
        </SheetTable>
        <SaveStatus status={status} />
      </section>

      {canAdvance && (
        <div className="flex justify-end gap-3">
          <button type="button" className="bg-emerald-600" disabled={saving} onClick={onNext}>
            {t("common.continue")}
          </button>
        </div>
      )}
    </div>
  );
};
