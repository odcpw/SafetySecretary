import { useEffect, useMemo, useState } from "react";
import type { Hazard, RiskAssessmentCase } from "@/types/riskAssessment";
import {
  getRiskColorForAssessment,
  loadMatrixSettings,
  type RiskMatrixSettings
} from "@/lib/riskMatrixSettings";
import {
  SheetBody,
  SheetCell,
  SheetHead,
  SheetHeaderCell,
  SheetInput,
  SheetRow,
  SheetSelect,
  SheetTable
} from "@/components/ui/SheetTable";
import { getCategoryLabel, HAZARD_CATEGORIES } from "@/lib/hazardCategories";

interface PhaseRiskRatingProps {
  raCase: RiskAssessmentCase;
  saving: boolean;
  onSaveRiskRatings: (ratings: { hazardId: string; severity: string; likelihood: string }[]) => Promise<void>;
  onUpdateHazard: (hazardId: string, patch: { label?: string; description?: string; categoryCode?: string; existingControls?: string[] }) => Promise<void>;
  onNext: () => Promise<void>;
  canAdvance?: boolean;
}

const SEVERITY_OPTIONS = [
  { value: "LOW", label: "Low", helper: "First aid or reversible harm" },
  { value: "MEDIUM", label: "Medium", helper: "Medical treatment or lost time" },
  { value: "HIGH", label: "High", helper: "Serious injury or long-term harm" },
  { value: "CRITICAL", label: "Critical", helper: "Fatality or multiple serious injuries" }
];

const LIKELIHOOD_OPTIONS = [
  { value: "RARE", label: "Rare", helper: "Would take multiple failures" },
  { value: "UNLIKELY", label: "Unlikely", helper: "Could happen but not expected" },
  { value: "POSSIBLE", label: "Possible", helper: "Has happened or could soon" },
  { value: "LIKELY", label: "Likely", helper: "Happens regularly" },
  { value: "ALMOST_CERTAIN", label: "Almost certain", helper: "When uncontrolled it will happen" }
];

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
  const [ratings, setRatings] = useState(() => initialRatingsFromHazards(raCase.hazards));
  const [status, setStatus] = useState<string | null>(null);
  const [activeStepId, setActiveStepId] = useState<string>(ALL_STEPS);
  const [riskSettings, setRiskSettings] = useState<RiskMatrixSettings | null>(() => loadMatrixSettings());
  // Local state for inline editing of existing controls
  const [controlsEditing, setControlsEditing] = useState<Record<string, string>>({});

  useEffect(() => {
    setRatings(initialRatingsFromHazards(raCase.hazards));
  }, [raCase]);

  useEffect(() => {
    const syncSettings = () => setRiskSettings(loadMatrixSettings());
    window.addEventListener("storage", syncSettings);
    return () => window.removeEventListener("storage", syncSettings);
  }, []);

  const hazardsByStep = useMemo(() => {
    const grouped = raCase.steps.map((step) => ({
      step,
      hazards: raCase.hazards
        .filter((hazard) => hazard.stepIds.includes(step.id))
        .sort(
          (a, b) =>
            (a.stepOrder?.[step.id] ?? Number.MAX_SAFE_INTEGER) -
            (b.stepOrder?.[step.id] ?? Number.MAX_SAFE_INTEGER)
        )
    }));
    const unassigned = raCase.hazards.filter((hazard) => hazard.stepIds.length === 0);
    if (unassigned.length) {
      grouped.push({
        step: {
          id: "unassigned",
          activity: "Unassigned hazards",
          equipment: [],
          substances: [],
          description: "Assign these hazards to steps to keep context clear",
          orderIndex: grouped.length
        } as RiskAssessmentCase["steps"][number],
        hazards: unassigned
      });
    }
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
    setRatings((prev) => {
      const current = prev[hazardId] ?? { severity: "", likelihood: "" };
      const next = { ...current, ...patch };
      void commitRating(hazardId, next);
      return { ...prev, [hazardId]: next };
    });
  };

  const commitRating = async (hazardId: string, value: { severity: string; likelihood: string }) => {
    if (!value.severity || !value.likelihood) {
      setStatus("Select severity and likelihood to save.");
      return;
    }
    setStatus("Saving risk rating…");
    await onSaveRiskRatings([{ hazardId, severity: value.severity, likelihood: value.likelihood }]);
    setStatus("Autosaved.");
    setTimeout(() => setStatus(null), 1500);
  };

  const handleCategoryChange = async (hazardId: string, categoryCode: string) => {
    setStatus("Updating category…");
    await onUpdateHazard(hazardId, { categoryCode: categoryCode || undefined });
    setStatus("Category updated.");
    setTimeout(() => setStatus(null), 1500);
  };

  const handleControlsBlur = async (hazardId: string) => {
    const editedText = controlsEditing[hazardId];
    if (editedText === undefined) return;

    const controls = editedText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    setStatus("Updating existing controls…");
    await onUpdateHazard(hazardId, { existingControls: controls });
    setControlsEditing((prev) => {
      const next = { ...prev };
      delete next[hazardId];
      return next;
    });
    setStatus("Controls updated.");
    setTimeout(() => setStatus(null), 1500);
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
          <strong>Baseline Risk Assessment:</strong> Rate each hazard based on your <em>current adherence</em> to the existing controls.
          Ask yourself: "Given these controls exist, how well are we following them? What&apos;s the actual risk today?"
        </p>
      </div>
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
                <SheetHeaderCell>Hazard</SheetHeaderCell>
                <SheetHeaderCell>Category</SheetHeaderCell>
                <SheetHeaderCell>Existing Controls</SheetHeaderCell>
                <SheetHeaderCell>Assessment</SheetHeaderCell>
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
                        <option value="">Select category…</option>
                        {HAZARD_CATEGORIES.map((cat) => (
                          <option key={cat.code} value={cat.code}>
                            {cat.label}
                          </option>
                        ))}
                      </SheetSelect>
                    </SheetCell>
                    <SheetCell>
                      <textarea
                        className="w-full min-h-[60px] text-sm border border-slate-200 rounded p-2 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="One control per line…"
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
                          Severity
                          <SheetSelect
                            value={current.severity}
                            onChange={(event) =>
                              handleRatingChange(hazard.id, { severity: event.target.value })
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
                            value={current.likelihood}
                            onChange={(event) =>
                              handleRatingChange(hazard.id, { likelihood: event.target.value })
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
                  </SheetRow>
                );
              })}
              {hazards.length === 0 && (
                <SheetRow>
                  <SheetCell colSpan={4} className="sheet-empty-cell">
                    No hazards for this step.
                  </SheetCell>
                </SheetRow>
              )}
            </SheetBody>
          </SheetTable>
        </section>
      ))}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {status && <span className="text-sm text-slate-500">{status}</span>}
        {canAdvance && (
          <button type="button" className="bg-emerald-600" disabled={saving} onClick={onNext}>
            Continue
          </button>
        )}
      </div>
    </div>
  );
};
