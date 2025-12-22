import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditableProcessStep, ProcessStep } from "@/types/riskAssessment";
import { useRaContext } from "@/contexts/RaContext";
import { useI18n } from "@/i18n/I18nContext";
import { TuiBanner } from "@/tui/components/TuiBanner";
import { TuiEmptyState } from "@/tui/components/TuiEmptyState";
import { TuiFormField } from "@/tui/components/TuiFormField";
import { TuiPanel } from "@/tui/components/TuiPanel";
import { TuiPhaseLayout } from "@/tui/phases/TuiPhaseLayout";

const toEditable = (steps: ProcessStep[]): EditableProcessStep[] =>
  steps.map((step) => ({
    id: step.id,
    activity: step.activity,
    equipment: step.equipment ?? [],
    substances: step.substances ?? [],
    description: step.description ?? "",
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

const parseList = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const formatList = (value?: string[] | null) => normalizeList(value).join(", ");

export const TuiPhaseProcessSteps = () => {
  const { t } = useI18n();
  const { raCase, saving, actions } = useRaContext();

  const [assistantInput, setAssistantInput] = useState("");
  const [assistantStatus, setAssistantStatus] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [saveInFlight, setSaveInFlight] = useState(false);

  const baseSteps = useMemo(() => toEditable(raCase.steps), [raCase.steps]);
  const [draftSteps, setDraftSteps] = useState<EditableProcessStep[]>(() => baseSteps);
  const draftStepsRef = useRef(draftSteps);
  const prevBaseStepsRef = useRef(baseSteps);
  const forceSyncRef = useRef(false);

  const hasDraftChanges = !stepsMatch(draftSteps, baseSteps);

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

  const saveStepsNow = useCallback(async () => {
    if (saveInFlight) {
      return;
    }
    setSaveInFlight(true);
    setSaveStatus(t("ra.steps.saving"));
    try {
      await actions.saveSteps(
        draftStepsRef.current.map((step, index) => ({
          ...step,
          orderIndex: index
        }))
      );
      setSaveError(null);
      setSaveStatus(t("ra.steps.saved"));
      window.setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("ra.steps.saveFailed");
      setSaveError(message);
      setSaveStatus(null);
    } finally {
      setSaveInFlight(false);
    }
  }, [actions, saveInFlight, t]);

  useEffect(() => {
    if (!hasDraftChanges || saveInFlight || saving) {
      return;
    }
    const timeout = window.setTimeout(() => {
      void saveStepsNow();
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [hasDraftChanges, saveInFlight, saveStepsNow, saving, draftSteps]);

  const handleExtract = async () => {
    if (!assistantInput.trim()) {
      return;
    }
    setAssistantStatus(t("ra.steps.extracting"));
    try {
      forceSyncRef.current = true;
      await actions.extractSteps(assistantInput);
      setAssistantInput("");
      setSaveError(null);
      setAssistantStatus(t("ra.steps.extracted"));
      window.setTimeout(() => setAssistantStatus(null), 2500);
    } catch (err) {
      setAssistantStatus(err instanceof Error ? err.message : t("ra.steps.extractFailed"));
      window.setTimeout(() => setAssistantStatus(null), 4000);
    }
  };

  const addStep = () => {
    setDraftSteps((prev) => [
      ...prev,
      {
        id: undefined,
        activity: t("ra.steps.newStep", { values: { index: prev.length + 1 } }),
        equipment: [],
        substances: [],
        description: "",
        orderIndex: prev.length
      }
    ]);
  };

  const updateStep = (index: number, patch: Partial<EditableProcessStep>) => {
    setDraftSteps((prev) => prev.map((step, idx) => (idx === index ? { ...step, ...patch } : step)));
  };

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

  const disableInputs = saving || saveInFlight;

  return (
    <TuiPhaseLayout phase="PROCESS_STEPS">
      <div className="tui-columns">
        <TuiPanel
          eyebrow={t("ra.steps.assistantTitle")}
          title={t("ra.steps.assistantTitle")}
          subtitle={t("ra.steps.assistantDescription")}
          actions={(
            <button type="button" onClick={() => void handleExtract()} disabled={!assistantInput.trim() || disableInputs}>
              {t("ra.steps.assistantAction")}
            </button>
          )}
        >
          <TuiFormField label={t("ra.steps.assistantTitle")} hint={t("ra.steps.assistantDescription")}>
            <textarea
              rows={6}
              value={assistantInput}
              onChange={(event) => setAssistantInput(event.target.value)}
              placeholder={t("ra.steps.assistantPlaceholder")}
              disabled={disableInputs}
            />
          </TuiFormField>
          {assistantStatus && <p className="tui-muted">{assistantStatus}</p>}
        </TuiPanel>

        <TuiPanel
          eyebrow={t("ra.steps.title")}
          title={t("ra.steps.title")}
          subtitle={t("ra.steps.subtitle")}
          actions={(
            <button type="button" onClick={addStep} disabled={disableInputs}>
              {t("ra.steps.addStep")}
            </button>
          )}
        >
          {saveError && (
            <TuiBanner variant="error">
              {saveError}
            </TuiBanner>
          )}
          {saveStatus && <p className="tui-muted">{saveStatus}</p>}
          {draftSteps.length === 0 ? (
            <TuiEmptyState
              title={t("ra.steps.empty")}
              action={(
                <button type="button" onClick={addStep}>
                  {t("ra.steps.addStep")}
                </button>
              )}
            />
          ) : (
            <div className="tui-step-list">
              {draftSteps.map((step, index) => (
                <div key={step.id ?? `draft-${index}`} className="tui-step-item">
                  <div className="tui-step-item__header">
                    <strong>{t("ra.steps.newStep", { values: { index: index + 1 } })}</strong>
                    <div className="tui-step-item__actions">
                      <button type="button" onClick={() => moveStep(index, "up")} disabled={disableInputs || index === 0}>
                        {t("common.moveUp")}
                      </button>
                      <button
                        type="button"
                        onClick={() => moveStep(index, "down")}
                        disabled={disableInputs || index === draftSteps.length - 1}
                      >
                        {t("common.moveDown")}
                      </button>
                      <button type="button" className="tui-danger" onClick={() => removeStep(index)} disabled={disableInputs}>
                        {t("common.delete")}
                      </button>
                    </div>
                  </div>
                  <div className="tui-step-item__fields">
                    <TuiFormField label={t("ra.steps.table.activity")}>
                      <input
                        value={step.activity}
                        onChange={(event) => updateStep(index, { activity: event.target.value })}
                        placeholder={t("ra.steps.activityPlaceholder")}
                        disabled={disableInputs}
                      />
                    </TuiFormField>
                    <TuiFormField label={t("ra.steps.table.equipment")}>
                      <input
                        value={formatList(step.equipment)}
                        onChange={(event) => updateStep(index, { equipment: parseList(event.target.value) })}
                        placeholder={t("ra.steps.equipmentPlaceholder")}
                        disabled={disableInputs}
                      />
                    </TuiFormField>
                    <TuiFormField label={t("ra.steps.table.substances")}>
                      <input
                        value={formatList(step.substances)}
                        onChange={(event) => updateStep(index, { substances: parseList(event.target.value) })}
                        placeholder={t("ra.steps.substancesPlaceholder")}
                        disabled={disableInputs}
                      />
                    </TuiFormField>
                    <TuiFormField label={t("ra.steps.table.notes")}>
                      <textarea
                        rows={3}
                        value={step.description ?? ""}
                        onChange={(event) => updateStep(index, { description: event.target.value })}
                        placeholder={t("ra.steps.notesPlaceholder")}
                        disabled={disableInputs}
                      />
                    </TuiFormField>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TuiPanel>
      </div>
    </TuiPhaseLayout>
  );
};
