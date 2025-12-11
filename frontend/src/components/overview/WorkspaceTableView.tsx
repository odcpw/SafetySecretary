/**
 * WorkspaceTableView - Full editable table view for HIRA worksheet
 *
 * Displays the entire risk assessment as an editable spreadsheet-like table.
 * All columns can be edited inline:
 * - Process steps: activity, equipment, substances, description
 * - Hazards: label, description, category
 * - Risk ratings: severity, likelihood (via dropdowns)
 * - Controls: existing controls, proposed controls
 * - Residual risk: severity, likelihood (via dropdowns)
 * - Actions: description, owner, due date, status
 */
import { useState, useMemo, useEffect } from "react";
import type { Hazard, RiskAssessmentCase } from "@/types/riskAssessment";
import { useRaContext } from "@/contexts/RaContext";
import { HAZARD_CATEGORIES } from "@/lib/hazardCategories";
import {
  getRiskColorForAssessment,
  loadMatrixSettings
} from "@/lib/riskMatrixSettings";
import {
  SheetBody,
  SheetCell,
  SheetHead,
  SheetHeaderCell,
  SheetRow,
  SheetTable
} from "@/components/ui/SheetTable";

const SEVERITY_OPTIONS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const LIKELIHOOD_OPTIONS = ["RARE", "UNLIKELY", "POSSIBLE", "LIKELY", "ALMOST_CERTAIN"];

interface WorkspaceTableViewProps {
  raCase: RiskAssessmentCase;
}

// Group hazards by their associated step for display
const groupHazardsByStep = (raCase: RiskAssessmentCase) => {
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

  // Include unassigned hazards in a virtual "step"
  const unassigned = raCase.hazards.filter((hazard) => hazard.stepIds.length === 0);
  if (unassigned.length) {
    grouped.push({
      step: {
        id: "unassigned",
        activity: "Unassigned hazards",
        equipment: [],
        substances: [],
        description: "Link these hazards to steps for better context",
        orderIndex: grouped.length
      } as RiskAssessmentCase["steps"][number],
      hazards: unassigned
    });
  }

  return grouped;
};

export const WorkspaceTableView = ({ raCase }: WorkspaceTableViewProps) => {
  const { saving, actions } = useRaContext();
  const [settings] = useState(() => loadMatrixSettings());
  const [baselineDraft, setBaselineDraft] = useState<Record<string, { severity: string; likelihood: string }>>(() =>
    raCase.hazards.reduce<Record<string, { severity: string; likelihood: string }>>((acc, hazard) => {
      acc[hazard.id] = {
        severity: hazard.baseline?.severity ?? "",
        likelihood: hazard.baseline?.likelihood ?? ""
      };
      return acc;
    }, {})
  );
  const [residualDraft, setResidualDraft] = useState<Record<string, { severity: string; likelihood: string }>>(() =>
    raCase.hazards.reduce<Record<string, { severity: string; likelihood: string }>>((acc, hazard) => {
      acc[hazard.id] = {
        severity: hazard.residual?.severity ?? "",
        likelihood: hazard.residual?.likelihood ?? ""
      };
      return acc;
    }, {})
  );

  const grouped = useMemo(() => groupHazardsByStep(raCase), [raCase]);
  const actionsByHazard = useMemo(() => {
    return raCase.actions.reduce<Record<string, RiskAssessmentCase["actions"]>>((acc, action) => {
      if (!action.hazardId) return acc;
      acc[action.hazardId] = acc[action.hazardId] ?? [];
      acc[action.hazardId]!.push(action);
      return acc;
    }, {});
  }, [raCase.actions]);

  useEffect(() => {
    setBaselineDraft(
      raCase.hazards.reduce<Record<string, { severity: string; likelihood: string }>>((acc, hazard) => {
        acc[hazard.id] = {
          severity: hazard.baseline?.severity ?? "",
          likelihood: hazard.baseline?.likelihood ?? ""
        };
        return acc;
      }, {})
    );
    setResidualDraft(
      raCase.hazards.reduce<Record<string, { severity: string; likelihood: string }>>((acc, hazard) => {
        acc[hazard.id] = {
          severity: hazard.residual?.severity ?? "",
          likelihood: hazard.residual?.likelihood ?? ""
        };
        return acc;
      }, {})
    );
  }, [raCase]);

  const handleBaselineChange = async (
    hazardId: string,
    patch: Partial<{ severity: string; likelihood: string }>
  ) => {
    let nextRecord: { severity: string; likelihood: string } | undefined;
    setBaselineDraft((prev) => {
      const current = prev[hazardId] ?? { severity: "", likelihood: "" };
      nextRecord = { ...current, ...patch };
      return { ...prev, [hazardId]: nextRecord! };
    });
    if (nextRecord?.severity && nextRecord.likelihood) {
      await actions.saveRiskRatings([
        { hazardId, severity: nextRecord.severity, likelihood: nextRecord.likelihood }
      ]);
    }
  };

  const handleResidualChange = async (
    hazardId: string,
    patch: Partial<{ severity: string; likelihood: string }>
  ) => {
    let nextRecord: { severity: string; likelihood: string } | undefined;
    setResidualDraft((prev) => {
      const current = prev[hazardId] ?? { severity: "", likelihood: "" };
      nextRecord = { ...current, ...patch };
      return { ...prev, [hazardId]: nextRecord! };
    });
    if (nextRecord?.severity && nextRecord.likelihood) {
      await actions.saveResidualRisk([
        { hazardId, severity: nextRecord.severity, likelihood: nextRecord.likelihood }
      ]);
    }
  };

  // Render colored risk pill based on matrix settings
  const renderRiskPill = (severity?: string | null, likelihood?: string | null) => {
    if (!severity || !likelihood) {
      return <span className="risk-pill muted">—</span>;
    }
    const color = getRiskColorForAssessment(severity, likelihood, settings);
    return (
      <span className="risk-pill" style={{ backgroundColor: color }}>
        {severity} × {likelihood}
      </span>
    );
  };

  return (
    <div className="workspace-table">
      <SheetTable className="sheet-table--grid">
        <SheetHead>
          <SheetRow>
            <SheetHeaderCell className="sheet-col-step">Process step / Hazard</SheetHeaderCell>
            <SheetHeaderCell>Category</SheetHeaderCell>
            <SheetHeaderCell>Severity</SheetHeaderCell>
            <SheetHeaderCell>Likelihood</SheetHeaderCell>
            <SheetHeaderCell>Risk</SheetHeaderCell>
            <SheetHeaderCell>Controls</SheetHeaderCell>
            <SheetHeaderCell>Residual Sev.</SheetHeaderCell>
            <SheetHeaderCell>Residual Lik.</SheetHeaderCell>
            <SheetHeaderCell>Residual Risk</SheetHeaderCell>
            <SheetHeaderCell className="sheet-col-actions">Actions</SheetHeaderCell>
          </SheetRow>
        </SheetHead>
        <SheetBody>
          {grouped.map(({ step, hazards }) => (
            <EditableStepRows
              key={step.id}
              step={step}
              hazards={hazards}
              renderRiskPill={renderRiskPill}
              actionsByHazard={actionsByHazard}
              saving={saving}
              actions={actions}
              baselineDraft={baselineDraft}
              residualDraft={residualDraft}
              onBaselineChange={handleBaselineChange}
              onResidualChange={handleResidualChange}
            />
          ))}
        </SheetBody>
      </SheetTable>
    </div>
  );
};

// Props for editable step rows
interface EditableStepRowsProps {
  step: RiskAssessmentCase["steps"][number];
  hazards: Hazard[];
  renderRiskPill: (severity?: string | null, likelihood?: string | null) => React.ReactNode;
  actionsByHazard: Record<string, RiskAssessmentCase["actions"]>;
  saving: boolean;
  actions: ReturnType<typeof useRaContext>["actions"];
  baselineDraft: Record<string, { severity: string; likelihood: string }>;
  residualDraft: Record<string, { severity: string; likelihood: string }>;
  onBaselineChange: (hazardId: string, patch: Partial<{ severity: string; likelihood: string }>) => Promise<void>;
  onResidualChange: (hazardId: string, patch: Partial<{ severity: string; likelihood: string }>) => Promise<void>;
}

// Component for rendering editable step and its hazards
const EditableStepRows = ({
  step,
  hazards,
  renderRiskPill,
  actionsByHazard,
  saving,
  actions,
  baselineDraft,
  residualDraft,
  onBaselineChange,
  onResidualChange
}: EditableStepRowsProps) => {
  // State for inline editing
  const [editingHazard, setEditingHazard] = useState<string | null>(null);
  const [hazardLabel, setHazardLabel] = useState("");
  const [hazardDescription, setHazardDescription] = useState("");
  const [addingAction, setAddingAction] = useState<string | null>(null);
  const [newActionText, setNewActionText] = useState("");

  // Handle hazard update
  const handleHazardSave = async (hazardId: string) => {
    await actions.updateHazard(hazardId, {
      label: hazardLabel,
      description: hazardDescription
    });
    setEditingHazard(null);
  };

  // Handle category change
  const handleCategoryChange = async (hazardId: string, categoryCode: string) => {
    await actions.updateHazard(hazardId, { categoryCode });
  };

  // Handle adding new action
  const handleAddAction = async (hazardId: string) => {
    if (!newActionText.trim()) return;
    await actions.addAction({ hazardId, description: newActionText.trim() });
    setNewActionText("");
    setAddingAction(null);
  };

  // Render step header row
  const renderStepRow = () => (
    <SheetRow className="step-row">
      <SheetCell colSpan={10} className="sheet-step-cell">
        <div className="sheet-step-heading">
          <span className="sheet-step-index">{step.orderIndex + 1}.</span>
          <div>
            <strong>{step.activity}</strong>
            {step.description && <p className="text-muted">{step.description}</p>}
            {(step.equipment?.length ?? 0) > 0 && (
              <p className="text-muted" style={{ fontSize: "0.8rem" }}>
                Equipment: {step.equipment?.join(", ")}
              </p>
            )}
          </div>
        </div>
      </SheetCell>
    </SheetRow>
  );

  // Render empty state for step with no hazards
  if (hazards.length === 0) {
    return (
      <>
        {renderStepRow()}
        <SheetRow className="hazard-row empty">
          <SheetCell colSpan={10} className="sheet-empty-cell">
            No hazards linked to this step.
          </SheetCell>
        </SheetRow>
      </>
    );
  }

  return (
    <>
      {renderStepRow()}
      {hazards.map((hazard) => {
        const isEditing = editingHazard === hazard.id;
        const isAddingAction = addingAction === hazard.id;
        const hazardActions = actionsByHazard[hazard.id] ?? [];
        const categoryLabel = hazard.categoryCode
          ? HAZARD_CATEGORIES.find((c) => c.code === hazard.categoryCode)?.label ?? hazard.categoryCode
          : "—";
        const baseline = baselineDraft[hazard.id] ?? { severity: hazard.baseline?.severity ?? "", likelihood: hazard.baseline?.likelihood ?? "" };
        const residual = residualDraft[hazard.id] ?? { severity: hazard.residual?.severity ?? "", likelihood: hazard.residual?.likelihood ?? "" };

        return (
          <SheetRow key={hazard.id} className="hazard-row">
            {/* Hazard label and description */}
            <SheetCell className="sheet-cell">
              {isEditing ? (
                <div className="sheet-inline-form">
                  <input
                    type="text"
                    className="sheet-input"
                    value={hazardLabel}
                    onChange={(e) => setHazardLabel(e.target.value)}
                    placeholder="Hazard label"
                    disabled={saving}
                  />
                  <textarea
                    className="sheet-textarea"
                    value={hazardDescription}
                    onChange={(e) => setHazardDescription(e.target.value)}
                    placeholder="Description"
                    disabled={saving}
                    rows={2}
                  />
                  <div className="sheet-actions-grid">
                    <button
                      type="button"
                      className="sheet-button sheet-button--primary"
                      onClick={() => handleHazardSave(hazard.id)}
                      disabled={saving}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="sheet-button"
                      onClick={() => setEditingHazard(null)}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="hazard-label"
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    setEditingHazard(hazard.id);
                    setHazardLabel(hazard.label);
                    setHazardDescription(hazard.description ?? "");
                  }}
                >
                  <strong>{hazard.label}</strong>
                  {hazard.description && <p>{hazard.description}</p>}
                </div>
              )}
            </SheetCell>

            {/* Category */}
            <SheetCell>
              <select
                className="sheet-select"
                value={hazard.categoryCode ?? ""}
                onChange={(e) => handleCategoryChange(hazard.id, e.target.value)}
                disabled={saving}
              >
                <option value="">—</option>
                {HAZARD_CATEGORIES.map((cat) => (
                  <option key={cat.code} value={cat.code}>
                    {cat.code}
                  </option>
                ))}
              </select>
            </SheetCell>

            {/* Baseline severity */}
            <SheetCell>
              <select
                className="sheet-select"
                value={baseline.severity}
                onChange={(e) => void onBaselineChange(hazard.id, { severity: e.target.value })}
                disabled={saving}
              >
                <option value="">—</option>
                {SEVERITY_OPTIONS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </SheetCell>

            {/* Baseline likelihood */}
            <SheetCell>
              <select
                className="sheet-select"
                value={baseline.likelihood}
                onChange={(e) => void onBaselineChange(hazard.id, { likelihood: e.target.value })}
                disabled={saving}
              >
                <option value="">—</option>
                {LIKELIHOOD_OPTIONS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </SheetCell>

            {/* Baseline risk pill */}
            <SheetCell>
              {renderRiskPill(baseline.severity, baseline.likelihood)}
            </SheetCell>

            {/* Controls */}
            <SheetCell>
              <ControlsCell hazard={hazard} saving={saving} actions={actions} />
            </SheetCell>

            {/* Residual severity */}
            <SheetCell>
              <select
                className="sheet-select"
                value={residual.severity}
                onChange={(e) => void onResidualChange(hazard.id, { severity: e.target.value })}
                disabled={saving}
              >
                <option value="">—</option>
                {SEVERITY_OPTIONS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </SheetCell>

            {/* Residual likelihood */}
            <SheetCell>
              <select
                className="sheet-select"
                value={residual.likelihood}
                onChange={(e) => void onResidualChange(hazard.id, { likelihood: e.target.value })}
                disabled={saving}
              >
                <option value="">—</option>
                {LIKELIHOOD_OPTIONS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </SheetCell>

            {/* Residual risk pill */}
            <SheetCell>
              {renderRiskPill(residual.severity, residual.likelihood)}
            </SheetCell>

            {/* Actions */}
            <SheetCell className="sheet-cell-actions">
              <ul className="monitoring-list">
                {hazardActions.map((action) => (
                  <ActionItem
                    key={action.id}
                    action={action}
                    saving={saving}
                    onUpdate={actions.updateAction}
                  />
                ))}
              </ul>
              {isAddingAction ? (
                <div className="sheet-control-add-form" style={{ marginTop: "0.5rem" }}>
                  <input
                    type="text"
                    className="sheet-input"
                    value={newActionText}
                    onChange={(e) => setNewActionText(e.target.value)}
                    placeholder="Action description"
                    disabled={saving}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddAction(hazard.id);
                      if (e.key === "Escape") setAddingAction(null);
                    }}
                  />
                  <button
                    type="button"
                    className="sheet-button sheet-button--primary"
                    onClick={() => handleAddAction(hazard.id)}
                    disabled={saving || !newActionText.trim()}
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    className="sheet-button"
                    onClick={() => setAddingAction(null)}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="sheet-button"
                  onClick={() => setAddingAction(hazard.id)}
                  disabled={saving}
                  style={{ marginTop: "0.5rem" }}
                >
                  + Add action
                </button>
              )}
            </SheetCell>
          </SheetRow>
        );
      })}
    </>
  );
};

// Component for editable controls cell
interface ControlsCellProps {
  hazard: Hazard;
  saving: boolean;
  actions: ReturnType<typeof useRaContext>["actions"];
}

const ControlsCell = ({ hazard, saving, actions }: ControlsCellProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [existingControls, setExistingControls] = useState("");
  const [newControl, setNewControl] = useState("");

  const existing = hazard.existingControls ?? [];
  const proposed = hazard.proposedControls ?? [];

  const handleSaveExisting = async () => {
    const controls = existingControls
      .split("\n")
      .map((c) => c.trim())
      .filter(Boolean);
    await actions.updateHazard(hazard.id, { existingControls: controls });
    setIsEditing(false);
  };

  const handleAddProposed = async () => {
    if (!newControl.trim()) return;
    await actions.addProposedControl(hazard.id, newControl.trim());
    setNewControl("");
  };

  if (isEditing) {
    return (
      <div className="sheet-inline-form">
        <label style={{ fontSize: "0.75rem" }}>Existing controls</label>
        <textarea
          className="sheet-textarea"
          value={existingControls}
          onChange={(e) => setExistingControls(e.target.value)}
          placeholder="One control per line"
          disabled={saving}
          rows={3}
        />
        <div className="sheet-actions-grid">
          <button
            type="button"
            className="sheet-button sheet-button--primary"
            onClick={handleSaveExisting}
            disabled={saving}
          >
            Save
          </button>
          <button
            type="button"
            className="sheet-button"
            onClick={() => setIsEditing(false)}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sheet-control-list">
      {existing.length === 0 && proposed.length === 0 ? (
        <span className="sheet-empty-cell">No controls</span>
      ) : (
        <>
          {existing.map((ctrl, idx) => (
            <div key={`ex-${idx}`} className="sheet-control-item">
              <span className="sheet-control-index">E{idx + 1}.</span>
              <span>{ctrl}</span>
            </div>
          ))}
          {proposed.map((ctrl, idx) => (
            <div key={ctrl.id} className="sheet-control-item">
              <span className="sheet-control-index">P{idx + 1}.</span>
              <span>{ctrl.description}</span>
              <button
                type="button"
                className="sheet-button sheet-button--icon sheet-button--danger"
                onClick={() => actions.deleteProposedControl(hazard.id, ctrl.id)}
                disabled={saving}
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </>
      )}
      <div className="sheet-actions-grid" style={{ marginTop: "0.4rem" }}>
        <button
          type="button"
          className="sheet-button"
          onClick={() => {
            setIsEditing(true);
            setExistingControls(existing.join("\n"));
          }}
          disabled={saving}
        >
          Edit existing
        </button>
      </div>
      <div className="sheet-control-add-form">
        <input
          type="text"
          className="sheet-input"
          value={newControl}
          onChange={(e) => setNewControl(e.target.value)}
          placeholder="New proposed control"
          disabled={saving}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAddProposed();
          }}
        />
        <button
          type="button"
          className="sheet-button sheet-button--primary"
          onClick={handleAddProposed}
          disabled={saving || !newControl.trim()}
        >
          +
        </button>
      </div>
    </div>
  );
};

// Component for editable action item
interface ActionItemProps {
  action: RiskAssessmentCase["actions"][number];
  saving: boolean;
  onUpdate: (actionId: string, patch: { description?: string; owner?: string | null; status?: string }) => Promise<void>;
}

const ActionItem = ({ action, saving, onUpdate }: ActionItemProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [description, setDescription] = useState(action.description);
  const [owner, setOwner] = useState(action.owner ?? "");

  const handleSave = async () => {
    await onUpdate(action.id, {
      description,
      owner: owner || null
    });
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <li className="action-item-editing">
        <input
          type="text"
          className="sheet-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description"
          disabled={saving}
        />
        <input
          type="text"
          className="sheet-input"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          placeholder="Owner"
          disabled={saving}
        />
        <div className="sheet-actions-grid">
          <button
            type="button"
            className="sheet-button sheet-button--primary"
            onClick={handleSave}
            disabled={saving}
          >
            Save
          </button>
          <button
            type="button"
            className="sheet-button"
            onClick={() => setIsEditing(false)}
            disabled={saving}
          >
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li onClick={() => setIsEditing(true)} style={{ cursor: "pointer" }}>
      <strong>{action.description}</strong>
      <span>
        {action.owner || "Unassigned"} ·{" "}
        {action.dueDate ? new Date(action.dueDate).toLocaleDateString() : "No due date"}
      </span>
    </li>
  );
};
