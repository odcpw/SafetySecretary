import { useCallback, useEffect, useMemo, useState } from "react";
import { AssistantPanel } from "@/components/common/AssistantPanel";
import {
  SheetBody,
  SheetButton,
  SheetCell,
  SheetHead,
  SheetHeaderCell,
  SheetInput,
  SheetRow,
  SheetTable,
  SheetTextarea
} from "@/components/ui/SheetTable";
import type { Hazard, RiskAssessmentCase } from "@/types/riskAssessment";
import { getCategoryLabel } from "@/lib/hazardCategories";
import { useHazardDrafts } from "@/hooks/useHazardDrafts";

interface PhaseHazardNarrativeProps {
  raCase: RiskAssessmentCase;
  saving: boolean;
  onExtractHazards: (narrative: string, stepId?: string) => Promise<void>;
  onAddHazard: (stepId: string, label: string, description: string) => Promise<void>;
  onUpdateHazard: (hazardId: string, patch: { label?: string; description?: string; stepId?: string; existingControls?: string[] }) => Promise<void>;
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
  const [status, setStatus] = useState<string | null>(null);
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
    setAssistantStatus("Extracting hazards…");
    const stepId = activeStepId === ALL_STEPS ? undefined : activeStepId;
    try {
      await onExtractHazards(narrative, stepId);
      setNarrative("");
      setAssistantStatus("Hazards returned from assistant.");
      setTimeout(() => setAssistantStatus(null), 2500);
    } catch (err) {
      console.error(err);
      setAssistantStatus(err instanceof Error ? err.message : "Failed to extract hazards");
      setTimeout(() => setAssistantStatus(null), 5000);
    }
  };

  const handleAutoSave = useCallback(
    async (hazardId: string) => {
      await commitDraft(hazardId, onUpdateHazard);
      setStatus("Autosaved.");
      setTimeout(() => setStatus(null), 1500);
    },
    [commitDraft, onUpdateHazard]
  );

  const handleDelete = async (hazardId: string) => {
    if (!window.confirm("Delete this hazard?")) {
      return;
    }
    await onDeleteHazard(hazardId);
    setStatus("Hazard deleted.");
    setTimeout(() => setStatus(null), 2000);
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
    await onReorderHazards(
      stepId,
      hazards.map((hazard) => hazard.id)
    );
  };

  const handleMoveToStep = async (hazardId: string, targetStepId: string) => {
    setMoveMenuHazardId(null);
    await onUpdateHazard(hazardId, {
      stepId: targetStepId
    });
    setStatus("Hazard moved.");
    setTimeout(() => setStatus(null), 2000);
  };

  const handleAddHazard = async (stepId: string) => {
    const form = forms[stepId];
    if (!form?.label || !form?.description) {
      return;
    }
    setStatus("Adding hazard…");
    await onAddHazard(stepId, form.label, form.description);
    setForms((prev) => ({ ...prev, [stepId]: { label: "", description: "" } }));
    setStatus("Hazard added.");
    setTimeout(() => setStatus(null), 2000);
  };

  const handleDuplicateHazard = async (stepId: string, hazard: Hazard) => {
    setStatus("Duplicating hazard…");
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
    await onAddHazard(stepId, hazard.label, hazard.description ?? "");
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
        setStatus("Hazard duplicated.");
        setTimeout(() => setStatus(null), 2000);
        return;
      }
    };
    void processDuplicates();
  }, [pendingDuplicates, raCase.hazards, hazardsByStep, onReorderHazards]);

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

  return (
    <div className="space-y-6">
      <AssistantPanel
        title="Identify hazards and existing controls"
        description="Describe what can go wrong, past incidents, near-misses, and what controls/rules are already in place."
        value={narrative}
        placeholder="Describe hazards, incidents, and existing controls..."
        primaryLabel="Extract hazards"
        status={assistantStatus}
        disabled={saving}
        enableVoice
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
            See all
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
              <SheetHeaderCell>Process step</SheetHeaderCell>
              <SheetHeaderCell>#</SheetHeaderCell>
              <SheetHeaderCell>Hazard</SheetHeaderCell>
              <SheetHeaderCell>Category</SheetHeaderCell>
              <SheetHeaderCell>Description / incidents</SheetHeaderCell>
              <SheetHeaderCell>Existing controls</SheetHeaderCell>
              <SheetHeaderCell>Actions</SheetHeaderCell>
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
                              <p className="text-xs text-slate-500">Equipment: {step.equipment.join(", ")}</p>
                            )}
                            {step.substances && step.substances.length > 0 && (
                              <p className="text-xs text-slate-500">Substances: {step.substances.join(", ")}</p>
                            )}
                            <p>{step.description || "No description"}</p>
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
                              placeholder="Hazard label"
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
                              placeholder="Description / anecdote"
                            />
                            <SheetButton
                              type="submit"
                              variant="primary"
                              disabled={saving || !forms[step.id]?.label || !forms[step.id]?.description}
                            >
                              Add hazard
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
                          <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded">
                            {getCategoryLabel(hazard.categoryCode)}
                          </span>
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
                            placeholder="What can happen? Past incidents?"
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
                            placeholder="What rules/controls are in place? (one per line)"
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
                                title="Move to another step"
                              >
                                ⇢
                              </SheetButton>
                              {moveMenuHazardId === hazard.id && (
                                <div className="sheet-move-menu">
                                  <p>Move hazard to:</p>
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
                              Duplicate
                            </SheetButton>
                            <SheetButton
                              variant="danger"
                              onClick={() => handleDelete(hazard.id)}
                            >
                              Delete
                            </SheetButton>
                          </div>
                        </SheetCell>
                      </>
                    ) : (
                      <SheetCell colSpan={6} className="sheet-empty-cell">
                        No hazards yet. Use the form in the step cell to add one.
                      </SheetCell>
                    )}
                  </SheetRow>
                );
              });
            })}
          </SheetBody>
        </SheetTable>
        {status && <p className="text-sm text-slate-500">{status}</p>}
      </section>

      {canAdvance && (
        <div className="flex justify-end gap-3">
          <button type="button" className="bg-emerald-600" disabled={saving} onClick={onNext}>
            Continue
          </button>
        </div>
      )}
    </div>
  );
};
