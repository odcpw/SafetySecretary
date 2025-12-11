import { useState } from "react";
import type { FormEvent } from "react";
import type { RiskAssessmentCase } from "@/types/riskAssessment";

interface OverviewBoardProps {
  raCase: RiskAssessmentCase;
  saving: boolean;
  onAddHazard: (stepId: string, label: string, description: string) => Promise<void>;
  onAddAction: (payload: { hazardId: string; description: string; owner?: string; dueDate?: string }) => Promise<void>;
  onUpdateAction: (
    actionId: string,
    patch: { description?: string; owner?: string | null; dueDate?: string | null; status?: string }
  ) => Promise<void>;
}

export const OverviewBoard = ({ raCase, saving, onAddHazard, onAddAction, onUpdateAction }: OverviewBoardProps) => {
  const hazardsByStep = raCase.steps.map((step) => ({
    step,
    hazards: raCase.hazards.filter((hazard) => hazard.stepIds.includes(step.id))
  }));

  const actionsByHazard = raCase.actions.reduce<Record<string, typeof raCase.actions>>((acc, action) => {
    if (action.hazardId) {
      acc[action.hazardId] = acc[action.hazardId] ?? [];
      acc[action.hazardId]!.push(action);
    }
    return acc;
  }, {});

  const [hazardForm, setHazardForm] = useState({
    stepId: raCase.steps[0]?.id ?? "",
    label: "",
    description: ""
  });

  const [actionForms, setActionForms] = useState<Record<string, { description: string; owner: string; dueDate: string }>>({});

  const handleAddHazard = async (event: FormEvent) => {
    event.preventDefault();
    if (!hazardForm.stepId || !hazardForm.label.trim()) {
      return;
    }
    await onAddHazard(hazardForm.stepId, hazardForm.label, hazardForm.description);
    setHazardForm((prev) => ({ ...prev, label: "", description: "" }));
  };

  const handleAddAction = async (hazardId: string) => {
    const form = actionForms[hazardId];
    if (!form?.description.trim()) {
      return;
    }
    await onAddAction({
      hazardId,
      description: form.description,
      owner: form.owner || undefined,
      dueDate: form.dueDate || undefined
    });
    setActionForms((prev) => ({
      ...prev,
      [hazardId]: { description: "", owner: "", dueDate: "" }
    }));
  };

  return (
    <div className="space-y-6">
      <form className="rounded-lg border border-slate-200 p-4" onSubmit={handleAddHazard}>
        <h4 className="text-lg font-semibold text-slate-900">Add hazard to a step</h4>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <label>
            Step
            <select
              value={hazardForm.stepId}
              onChange={(event) => setHazardForm((prev) => ({ ...prev, stepId: event.target.value }))}
            >
              <option value="">Choose step…</option>
              {raCase.steps.map((step) => (
                <option key={step.id} value={step.id}>
                  {step.title}
                </option>
              ))}
            </select>
          </label>
          <label className="md:col-span-2">
            Hazard label
            <input
              value={hazardForm.label}
              onChange={(event) => setHazardForm((prev) => ({ ...prev, label: event.target.value }))}
              placeholder="Falling objects near mezzanine"
            />
          </label>
          <label className="md:col-span-3">
            Description
            <textarea
              className="min-h-[70px]"
              value={hazardForm.description}
              onChange={(event) => setHazardForm((prev) => ({ ...prev, description: event.target.value }))}
            />
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <button type="submit" disabled={saving || !hazardForm.stepId || !hazardForm.label.trim()}>
            Add hazard
          </button>
        </div>
      </form>

      {hazardsByStep.map(({ step, hazards }) => (
        <section key={step.id} className="rounded-lg border border-slate-200 p-4">
          <header className="mb-3">
            <h3 className="text-lg font-semibold text-slate-900">{step.title}</h3>
            {step.description && <p className="text-sm text-slate-500">{step.description}</p>}
          </header>
          <div className="space-y-4">
            {hazards.length === 0 && <p className="text-sm text-slate-500">No hazards recorded.</p>}
            {hazards.map((hazard) => {
              const actionForm = actionForms[hazard.id] ?? { description: "", owner: "", dueDate: "" };
              return (
                <div key={hazard.id} className="rounded-md border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-lg font-semibold text-slate-900">{hazard.label}</div>
                    <span className="text-xs text-slate-500">
                      Risk: {hazard.baseline?.riskRating ?? "unknown"} → {hazard.residual?.riskRating ?? "n/a"}
                    </span>
                  </div>
                  {hazard.description && <p className="text-sm text-slate-600">{hazard.description}</p>}
                  {hazard.controls.length > 0 && (
                    <p className="mt-2 text-sm text-slate-600">
                      Controls:{" "}
                      <span className="text-slate-800">
                        {hazard.controls.map((control) => control.description).join(", ")}
                      </span>
                    </p>
                  )}

                  <div className="mt-3">
                    <p className="text-sm font-semibold text-slate-800">Actions</p>
                    <ul className="mt-1 space-y-1 text-sm text-slate-600">
                      {(actionsByHazard[hazard.id] ?? []).map((action) => (
                        <li key={action.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 px-2 py-1">
                          <span>{action.description}</span>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span>{action.owner ?? "Unassigned"}</span>
                            <span>{action.dueDate ? new Date(action.dueDate).toLocaleDateString() : "No due date"}</span>
                            <select
                              value={action.status}
                              onChange={(event) => onUpdateAction(action.id, { status: event.target.value })}
                              className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                            >
                              <option value="OPEN">Open</option>
                              <option value="IN_PROGRESS">In progress</option>
                              <option value="COMPLETE">Complete</option>
                            </select>
                          </div>
                        </li>
                      ))}
                      {(actionsByHazard[hazard.id] ?? []).length === 0 && (
                        <li className="text-xs text-slate-500">No actions yet.</li>
                      )}
                    </ul>
                    <div className="mt-2 grid gap-2 md:grid-cols-3">
                      <input
                        placeholder="Action description"
                        value={actionForm.description}
                        onChange={(event) =>
                          setActionForms((prev) => ({
                            ...prev,
                            [hazard.id]: { ...actionForm, description: event.target.value }
                          }))
                        }
                      />
                      <input
                        placeholder="Owner"
                        value={actionForm.owner}
                        onChange={(event) =>
                          setActionForms((prev) => ({
                            ...prev,
                            [hazard.id]: { ...actionForm, owner: event.target.value }
                          }))
                        }
                      />
                      <input
                        type="date"
                        value={actionForm.dueDate}
                        onChange={(event) =>
                          setActionForms((prev) => ({
                            ...prev,
                            [hazard.id]: { ...actionForm, dueDate: event.target.value }
                          }))
                        }
                      />
                    </div>
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        className="bg-slate-800"
                        onClick={() => handleAddAction(hazard.id)}
                        disabled={saving || !actionForm.description.trim()}
                      >
                        Add action
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};
