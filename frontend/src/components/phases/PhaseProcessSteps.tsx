import { useState } from "react";
import { AssistantPanel } from "@/components/common/AssistantPanel";
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

interface PhaseProcessStepsProps {
  raCase: RiskAssessmentCase;
  saving: boolean;
  onExtractSteps: (description: string) => Promise<void>;
  onSaveSteps: (steps: EditableProcessStep[]) => Promise<void>;
  onNext: () => Promise<void>;
  canAdvance?: boolean;
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

export const PhaseProcessSteps = ({
  raCase,
  saving,
  onExtractSteps,
  onSaveSteps,
  onNext,
  canAdvance = true
}: PhaseProcessStepsProps) => {
  const [description, setDescription] = useState("");
  const [draftSteps, setDraftSteps] = useState<EditableProcessStep[]>(() => toEditable(raCase.steps));
  const [status, setStatus] = useState<string | null>(null);

  const handleExtract = async () => {
    if (!description.trim()) {
      return;
    }
    setStatus("Extracting steps…");
    await onExtractSteps(description);
    setDescription("");
    setStatus("Steps extracted from description.");
    setTimeout(() => setStatus(null), 2500);
  };

  const handleSave = async () => {
    setStatus("Saving steps…");
    await onSaveSteps(
      draftSteps.map((step, index) => ({
        ...step,
        orderIndex: index
      }))
    );
    setStatus("Steps saved.");
    setTimeout(() => setStatus(null), 2500);
  };

  const createStep = () => ({
    id: undefined,
    activity: `New step ${draftSteps.length + 1}`,
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

  return (
    <div className="space-y-6">
      <AssistantPanel
        title="Describe the activity"
        description="Describe how this work is performed. Include what activities are done, what tools/equipment are used, and what materials/substances are involved. The assistant will extract steps with equipment and substances."
        value={description}
        placeholder="Describe the work process, equipment used, and substances involved..."
        primaryLabel="Generate steps"
        status={status}
        disabled={saving}
        onChange={setDescription}
        onSubmit={handleExtract}
        onClear={() => setDescription("")}
      />

      <section className="rounded-lg border border-slate-200 p-4 space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Process steps</h3>
            <p className="text-sm text-slate-500">Edit, reorder, or add missing steps.</p>
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
              <SheetHeaderCell>#</SheetHeaderCell>
              <SheetHeaderCell>Activity</SheetHeaderCell>
              <SheetHeaderCell>Equipment</SheetHeaderCell>
              <SheetHeaderCell>Substances</SheetHeaderCell>
              <SheetHeaderCell>Notes</SheetHeaderCell>
              <SheetHeaderCell>Actions</SheetHeaderCell>
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
                    placeholder="What is being done"
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
                    placeholder="Tools, machines (comma separated)"
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
                    placeholder="Materials, chemicals (comma separated)"
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
                    placeholder="Additional context"
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
                      Remove
                    </SheetButton>
                  </div>
                </SheetCell>
              </SheetRow>
            ))}
            {draftSteps.length === 0 && (
              <SheetRow>
                <SheetCell colSpan={6} className="sheet-empty-cell">
                  No steps yet. Use the generator above or add rows manually.
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
                  Add step
                </SheetButton>
              </SheetCell>
            </SheetAddRow>
          </SheetFooter>
        </SheetTable>
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={saving || draftSteps.length === 0} onClick={handleSave}>
            Save steps
          </button>
          {canAdvance && (
            <button type="button" className="bg-emerald-600" disabled={saving} onClick={onNext}>
              Continue
            </button>
          )}
          {status && <span className="text-sm text-slate-500">{status}</span>}
        </div>
      </section>
    </div >
  );
};
