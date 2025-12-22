import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AssistantPanel } from "@/components/common/AssistantPanel";
import { StepPhotosPanel } from "@/components/common/StepPhotosPanel";
import {
  SheetAddRow,
  SheetBody,
  SheetButton,
  SheetCell,
  SheetFooter,
  SheetHead,
  SheetHeaderCell,
  SheetInput,
  SheetRow,
  SheetTable,
  SheetTextarea
} from "@/components/ui/SheetTable";
import type { EditableProcessStep, RiskAssessmentCase } from "@/types/riskAssessment";
import { useI18n } from "@/i18n/I18nContext";

interface PhaseProcessStepsProps {
  raCase: RiskAssessmentCase;
  saving: boolean;
  onExtractSteps: (description: string) => Promise<void>;
  onSaveSteps: (steps: EditableProcessStep[]) => Promise<void>;
  onNext: () => Promise<void>;
  canAdvance?: boolean;
  onDirtyChange?: (isDirty: boolean) => void;
}

const toEditable = (steps: RiskAssessmentCase["steps"]): EditableProcessStep[] =>
  steps.map((step) => ({
    id: step.id,
    activity: step.activity,
    equipment: step.equipment ?? [],
    substances: step.substances ?? [],
    description: step.description,
    orderIndex: step.orderIndex
  }));

const normalizeList = (value?: string[] | null) => (value ?? []).filter((item) => item.trim().length > 0);

const stepsMatch = (left: EditableProcessStep[], right: EditableProcessStep[]) => {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftStep = left[index]!;
    const rightStep = right[index]!;
    if (leftStep.id !== rightStep.id) {
      return false;
    }
    if (leftStep.activity !== rightStep.activity) {
      return false;
    }
    if ((leftStep.description ?? "") !== (rightStep.description ?? "")) {
      return false;
    }
    const leftEquipment = normalizeList(leftStep.equipment);
    const rightEquipment = normalizeList(rightStep.equipment);
    if (leftEquipment.length !== rightEquipment.length || leftEquipment.some((value, idx) => value !== rightEquipment[idx])) {
      return false;
    }
    const leftSubstances = normalizeList(leftStep.substances);
    const rightSubstances = normalizeList(rightStep.substances);
    if (leftSubstances.length !== rightSubstances.length || leftSubstances.some((value, idx) => value !== rightSubstances[idx])) {
      return false;
    }
  }
  return true;
};

export const PhaseProcessSteps = ({
  raCase,
  saving,
  onExtractSteps,
  onSaveSteps,
  onNext,
  canAdvance = true,
  onDirtyChange
}: PhaseProcessStepsProps) => {
  const { t, locale } = useI18n();
  const [description, setDescription] = useState("");
  const baseSteps = useMemo(() => toEditable(raCase.steps), [raCase.steps]);
  const [draftSteps, setDraftSteps] = useState<EditableProcessStep[]>(() => baseSteps);
  const [status, setStatus] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveInFlight, setSaveInFlight] = useState(false);
  const draftStepsRef = useRef(draftSteps);
  const prevBaseStepsRef = useRef(baseSteps);
  const forceSyncRef = useRef(false);

  const hasDraftChanges = !stepsMatch(draftSteps, baseSteps);
  const isDirty = hasDraftChanges || saveInFlight || Boolean(saveError);

  useEffect(() => {
    draftStepsRef.current = draftSteps;
  }, [draftSteps]);

  useEffect(() => {
    const previousBase = prevBaseStepsRef.current;
    const shouldSync = forceSyncRef.current || stepsMatch(draftSteps, previousBase);
    if (shouldSync) {
      setDraftSteps(baseSteps);
      setSaveError(null);
      forceSyncRef.current = false;
    }
    prevBaseStepsRef.current = baseSteps;
  }, [baseSteps, draftSteps]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (!isDirty) {
      return;
    }
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const handleExtract = async () => {
    if (!description.trim()) {
      return;
    }
    setStatus(t("ra.steps.extracting"));
    try {
      forceSyncRef.current = true;
      await onExtractSteps(description);
      setDescription("");
      setSaveError(null);
      setStatus(t("ra.steps.extracted"));
      setTimeout(() => setStatus(null), 2500);
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : t("ra.steps.extractFailed"));
      setTimeout(() => setStatus(null), 5000);
    }
  };

  const saveStepsNow = useCallback(async () => {
    if (saveInFlight) {
      return;
    }
    setSaveInFlight(true);
    setStatus(t("ra.steps.saving"));
    try {
      await onSaveSteps(
        draftStepsRef.current.map((step, index) => ({
          ...step,
          orderIndex: index
        }))
      );
      setSaveError(null);
      setStatus(t("ra.steps.saved"));
      setTimeout(() => setStatus(null), 2000);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : t("ra.steps.saveFailed");
      setSaveError(message);
      setStatus(message);
      setTimeout(() => setStatus(null), 4000);
    } finally {
      setSaveInFlight(false);
    }
  }, [onSaveSteps, saveInFlight]);

  useEffect(() => {
    if (!hasDraftChanges || saveInFlight || saving) {
      return;
    }
    const timeout = window.setTimeout(() => {
      void saveStepsNow();
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [hasDraftChanges, saveInFlight, saving, saveStepsNow, draftSteps]);

  const createStep = () => ({
    id: undefined,
    activity: t("ra.steps.newStep", { values: { index: draftSteps.length + 1 } }),
    equipment: [] as string[],
    substances: [] as string[],
    description: "",
    orderIndex: draftSteps.length
  });

  const removeStep = (index: number) => {
    setDraftSteps((prev) => prev.filter((_, idx) => idx !== index));
  };

  const moveStep = (index: number, direction: "up" | "down") => {
    setDraftSteps((prev) => {
      const next = [...prev];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= prev.length) {
        return prev;
      }
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const voiceLang = locale === "fr" ? "fr-FR" : locale === "de" ? "de-DE" : "en-US";

  return (
    <div className="space-y-6">
      <AssistantPanel
        title={t("ra.steps.assistantTitle")}
        description={t("ra.steps.assistantDescription")}
        value={description}
        placeholder={t("ra.steps.assistantPlaceholder")}
        primaryLabel={t("ra.steps.assistantAction")}
        status={status}
        disabled={saving}
        enableVoice
        voiceLang={voiceLang}
        onChange={setDescription}
        onSubmit={handleExtract}
        onClear={() => setDescription("")}
      />

      <section className="rounded-lg border border-slate-200 p-4 space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{t("ra.steps.title")}</h3>
            <p className="text-sm text-slate-500">{t("ra.steps.subtitle")}</p>
          </div>
        </header>

        <SheetTable>
          <colgroup>
            <col className="sheet-col-number" />
            <col className="sheet-col-label" />
            <col className="sheet-col-label" />
            <col className="sheet-col-label" />
            <col className="sheet-col-description" />
            <col className="sheet-col-actions" />
          </colgroup>
          <SheetHead>
            <SheetRow>
              <SheetHeaderCell>{t("ra.common.number")}</SheetHeaderCell>
              <SheetHeaderCell>{t("ra.steps.table.activity")}</SheetHeaderCell>
              <SheetHeaderCell>{t("ra.steps.table.equipment")}</SheetHeaderCell>
              <SheetHeaderCell>{t("ra.steps.table.substances")}</SheetHeaderCell>
              <SheetHeaderCell>{t("ra.steps.table.notes")}</SheetHeaderCell>
              <SheetHeaderCell>{t("ra.steps.table.actions")}</SheetHeaderCell>
            </SheetRow>
          </SheetHead>
          <SheetBody>
            {draftSteps.map((step, index) => (
              <SheetRow key={step.id ?? `draft-${index}`}>
                <SheetCell className="sheet-cell-number">{index + 1}</SheetCell>
                <SheetCell>
                  <SheetInput
                    value={step.activity}
                    onChange={(event) =>
                      setDraftSteps((prev) =>
                        prev.map((item, idx) =>
                          idx === index
                            ? {
                              ...item,
                              activity: event.target.value
                    }
                    : item
                        )
                      )
                    }
                    placeholder={t("ra.steps.activityPlaceholder")}
                  />
                </SheetCell>
                <SheetCell>
                  <SheetInput
                    value={(step.equipment ?? []).join(", ")}
                    onChange={(event) =>
                      setDraftSteps((prev) =>
                        prev.map((item, idx) =>
                          idx === index
                            ? {
                              ...item,
                              equipment: event.target.value.split(",").map(s => s.trim()).filter(Boolean)
                    }
                    : item
                        )
                      )
                    }
                    placeholder={t("ra.steps.equipmentPlaceholder")}
                  />
                </SheetCell>
                <SheetCell>
                  <SheetInput
                    value={(step.substances ?? []).join(", ")}
                    onChange={(event) =>
                      setDraftSteps((prev) =>
                        prev.map((item, idx) =>
                          idx === index
                            ? {
                              ...item,
                              substances: event.target.value.split(",").map(s => s.trim()).filter(Boolean)
                    }
                    : item
                        )
                      )
                    }
                    placeholder={t("ra.steps.substancesPlaceholder")}
                  />
                </SheetCell>
                <SheetCell className="sheet-cell--description">
                  <SheetTextarea
                    className="sheet-textarea--expanded"
                    value={step.description ?? ""}
                    onChange={(event) =>
                      setDraftSteps((prev) =>
                        prev.map((item, idx) =>
                          idx === index
                            ? {
                              ...item,
                              description: event.target.value
                    }
                    : item
                        )
                      )
                    }
                    placeholder={t("ra.steps.notesPlaceholder")}
                  />
                </SheetCell>
                <SheetCell className="sheet-cell-actions">
                  <div className="sheet-actions-grid">
                    <SheetButton
                      variant="icon"
                      onClick={() => moveStep(index, "up")}
                      disabled={index === 0}
                    >
                      ↑
                    </SheetButton>
                    <SheetButton
                      variant="icon"
                      onClick={() => moveStep(index, "down")}
                      disabled={index === draftSteps.length - 1}
                    >
                      ↓
                    </SheetButton>
                    <SheetButton
                      variant="danger"
                      onClick={() => removeStep(index)}
                    >
                      {t("common.remove")}
                    </SheetButton>
                  </div>
                </SheetCell>
              </SheetRow>
            ))}
            {draftSteps.length === 0 && (
              <SheetRow>
                <SheetCell colSpan={6} className="sheet-empty-cell">
                  {t("ra.steps.empty")}
                </SheetCell>
              </SheetRow>
            )}
          </SheetBody>

          <SheetFooter>
            <SheetAddRow>
              <SheetCell colSpan={6}>
                <SheetButton
                  variant="primary"
                  onClick={() => setDraftSteps((prev) => [...prev, createStep()])}
                >
                  {t("ra.steps.addStep")}
                </SheetButton>
              </SheetCell>
            </SheetAddRow>
          </SheetFooter>
        </SheetTable>

        <StepPhotosPanel caseId={raCase.id} steps={raCase.steps} />

        <div className="flex flex-wrap items-center gap-3">
          {saveError && (
            <button type="button" disabled={saving || saveInFlight} onClick={saveStepsNow}>
              {t("common.retry")}
            </button>
          )}
          {canAdvance && (
            <button
              type="button"
              className="btn-primary"
              disabled={saving || isDirty || draftSteps.length === 0}
              onClick={onNext}
            >
              {t("common.continue")}
            </button>
          )}
          {status && <span className="text-sm text-slate-500">{status}</span>}
        </div>
      </section>
    </div >
  );
};
