import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { RiskAssessmentCase } from "@/types/riskAssessment";
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
  SheetSelect,
  SheetTable
} from "@/components/ui/SheetTable";

interface PhaseControlsActionsProps {
  raCase: RiskAssessmentCase;
  saving: boolean;
  onAddAction: (payload: { hazardId: string; description: string; owner?: string; dueDate?: string }) => Promise<void>;
  onUpdateAction: (
    actionId: string,
    patch: { description?: string; owner?: string | null; dueDate?: string | null; status?: string }
  ) => Promise<void>;
  onExtractActions: (notes: string) => Promise<void>;
  onNext: () => Promise<void>;
  canAdvance?: boolean;
}

const buildActionDrafts = (caseData: RiskAssessmentCase) =>
  caseData.actions.reduce<Record<string, { owner: string; dueDate: string }>>((acc, action) => {
    acc[action.id] = {
      owner: action.owner ?? "",
      dueDate: action.dueDate ? action.dueDate.slice(0, 10) : ""
    };
    return acc;
  }, {});

export const PhaseControlsActions = ({
  raCase,
  saving,
  onAddAction,
  onUpdateAction,
  onExtractActions,
  onNext,
  canAdvance = true
}: PhaseControlsActionsProps) => {
  const [form, setForm] = useState({
    hazardId: raCase.hazards[0]?.id ?? "",
    description: "",
    owner: "",
    dueDate: ""
  });
  const [tableStatus, setTableStatus] = useState<string | null>(null);
  const [actionDrafts, setActionDrafts] = useState<Record<string, { owner: string; dueDate: string }>>(() =>
    buildActionDrafts(raCase)
  );
  const [assistantNotes, setAssistantNotes] = useState("");
  const [assistantStatus, setAssistantStatus] = useState<string | null>(null);

  useEffect(() => {
    setActionDrafts(buildActionDrafts(raCase));
  }, [raCase]);

  const handleActionPatch = async (
    actionId: string,
    patch: { description?: string; owner?: string | null; dueDate?: string | null; status?: string },
    message = "Action updated."
  ) => {
    if (typeof patch.owner === "string") {
      patch.owner = patch.owner.trim() || null;
    }
    if (typeof patch.description === "string") {
      patch.description = patch.description.trim();
    }
    if (typeof patch.dueDate === "string") {
      patch.dueDate = patch.dueDate.trim() || null;
    }
    setTableStatus("Saving action…");
    await onUpdateAction(actionId, patch);
    setTableStatus(message);
    setTimeout(() => setTableStatus(null), 1500);
  };

  const handleExtractActions = async () => {
    if (!assistantNotes.trim()) {
      return;
    }
    setAssistantStatus("Requesting actions…");
    await onExtractActions(assistantNotes);
    setAssistantNotes("");
    setAssistantStatus("Suggestions requested. Refresh after the job completes.");
    setTimeout(() => setAssistantStatus(null), 2000);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.hazardId || !form.description.trim()) {
      return;
    }
    setTableStatus("Adding action…");
    await onAddAction({
      hazardId: form.hazardId,
      description: form.description,
      owner: form.owner || undefined,
      dueDate: form.dueDate || undefined
    });
    setForm((prev) => ({ ...prev, description: "", owner: "", dueDate: "" }));
    setTableStatus("Action added.");
    setTimeout(() => setTableStatus(null), 2000);
  };

  return (
    <div className="space-y-6">
      <AssistantPanel
        title="Ask the assistant for actions"
        description="Share outstanding issues or audit notes and the assistant will draft corrective actions mapped to hazards."
        value={assistantNotes}
        placeholder="E.g., 'Need to verify ladder inspections and assign owner before next shift'"
        primaryLabel="Generate actions"
        status={assistantStatus}
        disabled={saving}
        onChange={setAssistantNotes}
        onSubmit={handleExtractActions}
        onClear={() => setAssistantNotes("")}
      />



      <section className="rounded-lg border border-slate-200 p-4 space-y-3">
        <header className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">Action plan</h3>
          {tableStatus && <span className="text-sm text-slate-500">{tableStatus}</span>}
        </header>
        <div className="sheet-table-wrapper">
          <SheetTable>
            <colgroup>
              <col className="sheet-col-description" />
              <col className="sheet-col-label" />
              <col className="sheet-col-label" />
              <col className="sheet-col-label" />
            </colgroup>
            <SheetHead>
              <SheetRow>
                <SheetHeaderCell>Action</SheetHeaderCell>
                <SheetHeaderCell>Owner</SheetHeaderCell>
                <SheetHeaderCell>Due date</SheetHeaderCell>
                <SheetHeaderCell>Status</SheetHeaderCell>
              </SheetRow>
            </SheetHead>
            <SheetBody>
              {raCase.actions.length === 0 && (
                <SheetRow>
                  <SheetCell colSpan={4} className="sheet-empty-cell">
                    No actions captured yet. Add one below.
                  </SheetCell>
                </SheetRow>
              )}
              {raCase.actions.map((action) => {
                const hazard = raCase.hazards.find((h) => h.id === action.hazardId);
                const drafts = actionDrafts[action.id] ?? { owner: action.owner ?? "", dueDate: action.dueDate ?? "" };
                return (
                  <SheetRow key={action.id}>
                    <SheetCell>
                      <div className="font-semibold text-slate-800">{action.description}</div>
                      <p className="mt-1 text-sm text-slate-500">{hazard ? hazard.label : "Unlinked hazard"}</p>
                    </SheetCell>
                    <SheetCell>
                      <SheetInput
                        value={drafts.owner}
                        onChange={(event) =>
                          setActionDrafts((prev) => ({
                            ...prev,
                            [action.id]: { ...(prev[action.id] ?? drafts), owner: event.target.value }
                          }))
                        }
                        onBlur={() =>
                          handleActionPatch(action.id, { owner: (actionDrafts[action.id]?.owner ?? "") || null })
                        }
                        placeholder="Owner"
                      />
                    </SheetCell>
                    <SheetCell>
                      <SheetInput
                        type="date"
                        value={drafts.dueDate}
                        onChange={(event) =>
                          setActionDrafts((prev) => ({
                            ...prev,
                            [action.id]: { ...(prev[action.id] ?? drafts), dueDate: event.target.value }
                          }))
                        }
                        onBlur={() =>
                          handleActionPatch(action.id, {
                            dueDate: (actionDrafts[action.id]?.dueDate ?? "") || null
                          })
                        }
                      />
                    </SheetCell>
                    <SheetCell>
                      <SheetSelect
                        value={action.status}
                        onChange={(event) => handleActionPatch(action.id, { status: event.target.value })}
                      >
                        <option value="OPEN">Open</option>
                        <option value="IN_PROGRESS">In progress</option>
                        <option value="COMPLETE">Complete</option>
                      </SheetSelect>
                    </SheetCell>
                  </SheetRow>
                );
              })}
            </SheetBody>
            <SheetFooter>
              <SheetAddRow>
                <SheetCell>
                  <div className="space-y-2">
                    <SheetSelect
                      value={form.hazardId}
                      onChange={(event) => setForm((prev) => ({ ...prev, hazardId: event.target.value }))}
                    >
                      <option value="">Select a hazard…</option>
                      {raCase.hazards.map((hazard) => (
                        <option key={hazard.id} value={hazard.id}>
                          {hazard.label}
                        </option>
                      ))}
                    </SheetSelect>
                    <SheetInput
                      value={form.description}
                      onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                      placeholder="What needs to be done?"
                    />
                  </div>
                </SheetCell>
                <SheetCell>
                  <SheetInput
                    value={form.owner}
                    onChange={(event) => setForm((prev) => ({ ...prev, owner: event.target.value }))}
                    placeholder="Owner"
                  />
                </SheetCell>
                <SheetCell>
                  <SheetInput
                    type="date"
                    value={form.dueDate}
                    onChange={(event) => setForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                  />
                </SheetCell>
                <SheetCell>
                  <SheetButton
                    variant="primary"
                    disabled={saving || !form.hazardId || !form.description.trim()}
                    onClick={handleSubmit}
                  >
                    Add action
                  </SheetButton>
                </SheetCell>
              </SheetAddRow>
            </SheetFooter>
          </SheetTable>
        </div>
      </section>

      {canAdvance && (
        <div className="flex justify-end">
          <button type="button" className="bg-emerald-600" disabled={saving} onClick={onNext}>
            Continue
          </button>
        </div>
      )}
    </div>
  );
};
