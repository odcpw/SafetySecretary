import { useEffect, useMemo, useState } from "react";
import { AssistantPanel } from "@/components/common/AssistantPanel";
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
import type { ControlHierarchy, RiskAssessmentCase } from "@/types/riskAssessment";
import {
  getRiskColorForAssessment,
  loadMatrixSettings,
  type RiskMatrixSettings
} from "@/lib/riskMatrixSettings";

interface PhaseControlsProps {
  raCase: RiskAssessmentCase;
  saving: boolean;
  onAddProposedControl: (hazardId: string, description: string, hierarchy?: ControlHierarchy) => Promise<void>;
  onDeleteProposedControl: (hazardId: string, controlId: string) => Promise<void>;
  onUpdateHazard: (hazardId: string, patch: { existingControls?: string[] }) => Promise<void>;
  onSaveResidualRisk: (ratings: { hazardId: string; severity: string; likelihood: string }[]) => Promise<void>;
  onExtractControls: (notes: string) => Promise<void>;
  onNext: () => Promise<void>;
  canAdvance?: boolean;
  mode?: "controls" | "residual";
}

const HIERARCHY_OPTIONS: { value: ControlHierarchy; label: string; description: string }[] = [
  { value: "SUBSTITUTION", label: "S - Substitution", description: "Replace the hazard entirely" },
  { value: "TECHNICAL", label: "T - Technical", description: "Engineering controls (guards, barriers)" },
  { value: "ORGANIZATIONAL", label: "O - Organizational", description: "Procedures, training, supervision" },
  { value: "PPE", label: "P - PPE", description: "Personal protective equipment" }
];

const groupHazardsByStep = (raCase: RiskAssessmentCase) => {
  const grouped = raCase.steps.map((step) => ({
    step,
    hazards: raCase.hazards.filter((hazard) => hazard.stepIds.includes(step.id))
  }));
  const unassigned = raCase.hazards.filter((hazard) => hazard.stepIds.length === 0);
  if (unassigned.length) {
    grouped.push({
      step: {
        id: "unassigned",
        activity: "Unassigned hazards",
        equipment: [],
        substances: [],
        description: "Assign hazards to steps to improve clarity",
        orderIndex: grouped.length
      } as RiskAssessmentCase["steps"][number],
      hazards: unassigned
    });
  }
  return grouped.filter((entry) => entry.hazards.length > 0);
};

const SEVERITY_OPTIONS = [
  { value: "LOW", label: "Low" },
  { value: "MEDIUM", label: "Medium" },
  { value: "HIGH", label: "High" },
  { value: "CRITICAL", label: "Critical" }
];

const LIKELIHOOD_OPTIONS = [
  { value: "RARE", label: "Rare" },
  { value: "UNLIKELY", label: "Unlikely" },
  { value: "POSSIBLE", label: "Possible" },
  { value: "LIKELY", label: "Likely" },
  { value: "ALMOST_CERTAIN", label: "Almost certain" }
];

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
  const [residualDraft, setResidualDraft] = useState<Record<string, { severity: string; likelihood: string }>>(() =>
    getResidualDraft(raCase)
  );
  const [controlForms, setControlForms] = useState<Record<string, NewControlForm>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [riskSettings, setRiskSettings] = useState<RiskMatrixSettings | null>(() => loadMatrixSettings());
  const [assistantNotes, setAssistantNotes] = useState("");
  const [llmStatus, setLlmStatus] = useState<string | null>(null);
  // State for inline editing of existing controls
  const [existingControlsEditing, setExistingControlsEditing] = useState<Record<string, string>>({});

  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      setResidualDraft(getResidualDraft(raCase));
    });
    return () => cancelAnimationFrame(handle);
  }, [raCase]);

  useEffect(() => {
    const syncSettings = () => setRiskSettings(loadMatrixSettings());
    window.addEventListener("storage", syncSettings);
    return () => window.removeEventListener("storage", syncSettings);
  }, []);

  const grouped = groupHazardsByStep(raCase);
  const stepNumberMap = useMemo(() => new Map(raCase.steps.map((step, index) => [step.id, index + 1])), [raCase.steps]);

  const saveResidualDraft = async (nextDraft?: Record<string, { severity: string; likelihood: string }>) => {
    const source = nextDraft ?? residualDraft;
    const payload = raCase.hazards
      .map((hazard) => ({
        hazardId: hazard.id,
        severity: source[hazard.id]?.severity ?? "",
        likelihood: source[hazard.id]?.likelihood ?? ""
      }))
      .filter((entry) => entry.severity && entry.likelihood);
    if (!payload.length) {
      return;
    }
    await onSaveResidualRisk(payload);
  };

  const handleAddControl = async (hazardId: string) => {
    const form = controlForms[hazardId];
    const description = form?.description?.trim();
    if (!description) {
      return;
    }
    setStatus("Adding proposed control...");
    const hierarchy = form.hierarchy || undefined;
    await onAddProposedControl(hazardId, description, hierarchy);
    setControlForms((prev) => ({ ...prev, [hazardId]: { description: "", hierarchy: "" } }));
    setStatus("Proposed control added.");
    setTimeout(() => setStatus(null), 1500);
  };

  const handleDeleteControl = async (hazardId: string, controlId: string) => {
    if (!window.confirm("Remove this proposed control?")) {
      return;
    }
    setStatus("Removing control...");
    await onDeleteProposedControl(hazardId, controlId);
    setStatus("Control removed.");
    setTimeout(() => setStatus(null), 1200);
  };

  const handleResidualChange = (hazardId: string, patch: Partial<{ severity: string; likelihood: string }>) => {
    setResidualDraft((prev) => {
      const current = prev[hazardId] ?? { severity: "", likelihood: "" };
      const next = { ...current, ...patch };
      void saveResidualDraft({ ...prev, [hazardId]: next });
      return { ...prev, [hazardId]: next };
    });
    setStatus("Saving residual risk…");
    setTimeout(() => setStatus(null), 1200);
  };

  const handleSaveResidual = async () => {
    setStatus("Saving residual risk…");
    await saveResidualDraft();
    setStatus("Residual risk updated.");
    setTimeout(() => setStatus(null), 1500);
  };

  const statusHint =
    status ??
    (mode === "residual"
      ? "Verify that your controls reduce risk to an acceptable level."
      : "Document every safeguard and the target residual rating.");

  const handleExtractControls = async () => {
    if (!assistantNotes.trim()) {
      return;
    }
    setLlmStatus("Requesting suggestions…");
    await onExtractControls(assistantNotes);
    setAssistantNotes("");
    setLlmStatus("Suggestions requested. Check back after the job completes.");
    setTimeout(() => setLlmStatus(null), 2000);
  };

  const handleExistingControlsBlur = async (hazardId: string) => {
    const editedText = existingControlsEditing[hazardId];
    if (editedText === undefined) return;

    const controls = editedText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    setStatus("Updating existing controls…");
    await onUpdateHazard(hazardId, { existingControls: controls });
    setExistingControlsEditing((prev) => {
      const next = { ...prev };
      delete next[hazardId];
      return next;
    });
    setStatus("Controls updated.");
    setTimeout(() => setStatus(null), 1500);
  };

  const getExistingControlsEditValue = (hazard: RiskAssessmentCase["hazards"][number]) => {
    if (existingControlsEditing[hazard.id] !== undefined) {
      return existingControlsEditing[hazard.id];
    }
    return (hazard.existingControls ?? []).join("\n");
  };

  return (
    <div className="space-y-6">
      <AssistantPanel
        title="Let the assistant draft controls"
        description="Paste observations or inspection notes and the assistant will propose controls plus a target residual rating."
        value={assistantNotes}
        placeholder="Describe safeguards, audit findings, nagging worries..."
        primaryLabel="Generate suggestions"
        status={llmStatus}
        disabled={saving}
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
                  <SheetHeaderCell>Hazard</SheetHeaderCell>
                  <SheetHeaderCell>Controls</SheetHeaderCell>
                  <SheetHeaderCell>Residual assessment</SheetHeaderCell>
                  <SheetHeaderCell>Risk trend</SheetHeaderCell>
                </SheetRow>
              </SheetHead>
              <SheetBody>
                {hazards.map((hazard, hazardIndex) => {
                  const residual = residualDraft[hazard.id] ?? { severity: "", likelihood: "" };
                  const residualPreview =
                    residual.severity && residual.likelihood
                      ? `${residual.severity} × ${residual.likelihood}`
                      : "Pending";
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
                            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Existing</div>
                            <textarea
                              className="w-full min-h-[50px] text-sm border border-slate-200 rounded p-2 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="One control per line…"
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
                              <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Proposed</div>
                              {hazard.proposedControls.map((control) => {
                                const hierarchyOption = HIERARCHY_OPTIONS.find((h) => h.value === control.hierarchy);
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
                            <p className="text-sm text-slate-500 italic">No controls yet.</p>
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
                              placeholder="Describe proposed control"
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
                                <option value="">S-T-O-P level…</option>
                                {HIERARCHY_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </SheetSelect>
                              <SheetButton type="submit" variant="primary" disabled={saving}>
                                Add
                              </SheetButton>
                            </div>
                          </form>
                        </div>
                      </SheetCell>
                      <SheetCell>
                        <div className="sheet-risk-cell" style={{ backgroundColor: cellColor, color: textColor }}>
                          <label>
                            Severity
                            <SheetSelect
                              value={residual.severity}
                              onChange={(event) =>
                                handleResidualChange(hazard.id, { severity: event.target.value })
                              }
                            >
                              <option value="">Select…</option>
                              {SEVERITY_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </SheetSelect>
                          </label>
                          <label>
                            Likelihood
                            <SheetSelect
                              value={residual.likelihood}
                              onChange={(event) =>
                                handleResidualChange(hazard.id, { likelihood: event.target.value })
                              }
                            >
                              <option value="">Select…</option>
                              {LIKELIHOOD_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </SheetSelect>
                          </label>
                        </div>
                      </SheetCell>
                      <SheetCell className="sheet-cell-actions">
                        <div className="text-xs text-slate-500">
                          Baseline: {hazard.baseline?.riskRating ?? "n/a"}
                        </div>
                        <div className="text-xs font-semibold text-slate-700">
                          Residual: {hazard.residual?.riskRating ?? residualPreview}
                        </div>
                      </SheetCell>
                    </SheetRow>
                  );
                })}
                {hazards.length === 0 && (
                  <SheetRow>
                    <SheetCell colSpan={5} className="sheet-empty-cell">
                      No hazards assigned to this step.
                    </SheetCell>
                  </SheetRow>
                )}
              </SheetBody>
            </SheetTable>
          </div>
        </section>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-slate-500">{statusHint}</div>
        <div className="flex gap-2">
          <button type="button" onClick={handleSaveResidual} disabled={saving}>
            Save residual
          </button>
          {canAdvance && (
            <button type="button" className="bg-emerald-600" disabled={saving} onClick={onNext}>
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
