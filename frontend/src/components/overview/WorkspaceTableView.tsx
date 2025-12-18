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
import { TEMPLATE_LIKELIHOOD_OPTIONS, TEMPLATE_SEVERITY_OPTIONS } from "@/lib/templateRiskScales";
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
import { useHazardDrafts } from "@/hooks/useHazardDrafts";

const SEVERITY_OPTIONS = TEMPLATE_SEVERITY_OPTIONS;
const LIKELIHOOD_OPTIONS = TEMPLATE_LIKELIHOOD_OPTIONS;

interface WorkspaceTableViewProps {
  raCase: RiskAssessmentCase;
}

// Group hazards by their associated step for display
const groupHazardsByStep = (raCase: RiskAssessmentCase) => {
  return raCase.steps.map((step) => ({
    step,
    hazards: raCase.hazards
      .filter((hazard) => hazard.stepId === step.id)
      .sort((a, b) => a.orderIndex - b.orderIndex)
  }));
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

  /* eslint-disable react-hooks/set-state-in-effect */
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
  /* eslint-enable react-hooks/set-state-in-effect */

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
  const [addingAction, setAddingAction] = useState<string | null>(null);
  const [newActionText, setNewActionText] = useState("");
  const { drafts, patchDraft, commitDraft } = useHazardDrafts(hazards);

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
        const isAddingAction = addingAction === hazard.id;
        const hazardActions = actionsByHazard[hazard.id] ?? [];
        const baseline = baselineDraft[hazard.id] ?? { severity: hazard.baseline?.severity ?? "", likelihood: hazard.baseline?.likelihood ?? "" };
        const residual = residualDraft[hazard.id] ?? { severity: hazard.residual?.severity ?? "", likelihood: hazard.residual?.likelihood ?? "" };
        const draft = drafts[hazard.id];

        return (
          <SheetRow key={hazard.id} className="hazard-row">
            {/* Hazard label and description */}
            <SheetCell className="sheet-cell">
              <div className="sheet-inline-form">
                <SheetInput
                  value={draft?.label ?? hazard.label}
                  onChange={(event) => patchDraft(hazard.id, { label: event.target.value })}
                  onBlur={() => void commitDraft(hazard.id, actions.updateHazard)}
                  placeholder="Hazard label"
                  disabled={saving}
                />
                <SheetTextarea
                  value={draft?.description ?? hazard.description ?? ""}
                  onChange={(event) => patchDraft(hazard.id, { description: event.target.value })}
                  onBlur={() => void commitDraft(hazard.id, actions.updateHazard)}
                  placeholder="Description"
                  disabled={saving}
                  rows={2}
                />
              </div>
            </SheetCell>

            {/* Category */}
            <SheetCell>
              <SheetSelect
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
              </SheetSelect>
            </SheetCell>

            {/* Baseline severity */}
            <SheetCell>
              <SheetSelect
                value={baseline.severity}
                onChange={(e) => void onBaselineChange(hazard.id, { severity: e.target.value })}
                disabled={saving}
              >
                <option value="">—</option>
                {SEVERITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.value}
                  </option>
                ))}
              </SheetSelect>
            </SheetCell>

            {/* Baseline likelihood */}
            <SheetCell>
              <SheetSelect
                value={baseline.likelihood}
                onChange={(e) => void onBaselineChange(hazard.id, { likelihood: e.target.value })}
                disabled={saving}
              >
                <option value="">—</option>
                {LIKELIHOOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.value}
                  </option>
                ))}
              </SheetSelect>
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
              <SheetSelect
                value={residual.severity}
                onChange={(e) => void onResidualChange(hazard.id, { severity: e.target.value })}
                disabled={saving}
              >
                <option value="">—</option>
                {SEVERITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.value}
                  </option>
                ))}
              </SheetSelect>
            </SheetCell>

            {/* Residual likelihood */}
            <SheetCell>
              <SheetSelect
                value={residual.likelihood}
                onChange={(e) => void onResidualChange(hazard.id, { likelihood: e.target.value })}
                disabled={saving}
              >
                <option value="">—</option>
                {LIKELIHOOD_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.value}
                  </option>
                ))}
              </SheetSelect>
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
                  <SheetInput
                    value={newActionText}
                    onChange={(e) => setNewActionText(e.target.value)}
                    placeholder="Action description"
                    disabled={saving}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddAction(hazard.id);
                      if (e.key === "Escape") setAddingAction(null);
                    }}
                  />
                  <SheetButton
                    variant="primary"
                    onClick={() => handleAddAction(hazard.id)}
                    disabled={saving || !newActionText.trim()}
                  >
                    Add
                  </SheetButton>
                  <SheetButton
                    onClick={() => setAddingAction(null)}
                    disabled={saving}
                  >
                    Cancel
                  </SheetButton>
                </div>
              ) : (
                <SheetButton
                  onClick={() => setAddingAction(hazard.id)}
                  disabled={saving}
                  style={{ marginTop: "0.5rem" }}
                >
                  + Add action
                </SheetButton>
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
