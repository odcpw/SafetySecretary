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
import type { Hazard, RatingInput, RiskAssessmentCase } from "@/types/riskAssessment";
import { useRaContext } from "@/contexts/RaContext";
import { HAZARD_CATEGORIES } from "@/lib/hazardCategories";
import {
  buildDefaultMatrixLabels,
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
import { SaveStatus } from "@/components/common/SaveStatus";
import { useSaveStatus } from "@/hooks/useSaveStatus";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { useI18n } from "@/i18n/I18nContext";

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
  const { t } = useI18n();
  const { confirm, dialog } = useConfirmDialog();
  const { status, show, showSuccess, showError } = useSaveStatus();
  const defaultLabels = useMemo(() => buildDefaultMatrixLabels(t), [t]);
  const [settings, setSettings] = useState(() => loadMatrixSettings(defaultLabels));
  const [baselineDraft, setBaselineDraft] = useState<
    Record<string, { severity: RatingInput["severity"]; likelihood: RatingInput["likelihood"] }>
  >(() =>
    raCase.hazards.reduce<Record<string, { severity: RatingInput["severity"]; likelihood: RatingInput["likelihood"] }>>(
      (acc, hazard) => {
        acc[hazard.id] = {
          severity: hazard.baseline?.severity ?? "",
          likelihood: hazard.baseline?.likelihood ?? ""
        };
        return acc;
      },
      {}
    )
  );
  const [residualDraft, setResidualDraft] = useState<
    Record<string, { severity: RatingInput["severity"]; likelihood: RatingInput["likelihood"] }>
  >(() =>
    raCase.hazards.reduce<Record<string, { severity: RatingInput["severity"]; likelihood: RatingInput["likelihood"] }>>(
      (acc, hazard) => {
        acc[hazard.id] = {
          severity: hazard.residual?.severity ?? "",
          likelihood: hazard.residual?.likelihood ?? ""
        };
        return acc;
      },
      {}
    )
  );

  const grouped = useMemo(() => groupHazardsByStep(raCase), [raCase]);
  const actionsByHazard = useMemo(() => {
    const grouped = raCase.actions.reduce<Record<string, RiskAssessmentCase["actions"]>>((acc, action) => {
      if (!action.hazardId) return acc;
      acc[action.hazardId] = acc[action.hazardId] ?? [];
      acc[action.hazardId]!.push(action);
      return acc;
    }, {});
    Object.values(grouped).forEach((items) => items.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0)));
    return grouped;
  }, [raCase.actions]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setBaselineDraft(
      raCase.hazards.reduce<Record<string, { severity: RatingInput["severity"]; likelihood: RatingInput["likelihood"] }>>(
        (acc, hazard) => {
          acc[hazard.id] = {
            severity: hazard.baseline?.severity ?? "",
            likelihood: hazard.baseline?.likelihood ?? ""
          };
          return acc;
        },
        {}
      )
    );
    setResidualDraft(
      raCase.hazards.reduce<Record<string, { severity: RatingInput["severity"]; likelihood: RatingInput["likelihood"] }>>(
        (acc, hazard) => {
          acc[hazard.id] = {
            severity: hazard.residual?.severity ?? "",
            likelihood: hazard.residual?.likelihood ?? ""
          };
          return acc;
        },
        {}
      )
    );
  }, [raCase]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    setSettings(loadMatrixSettings(defaultLabels));
  }, [defaultLabels]);

  useEffect(() => {
    const syncSettings = () => setSettings(loadMatrixSettings(defaultLabels));
    window.addEventListener("storage", syncSettings);
    return () => window.removeEventListener("storage", syncSettings);
  }, [defaultLabels]);

  const notifySuccess = (message: string, duration = 1500) => {
    showSuccess(message, duration);
  };

  const notifyError = (message: string, retry?: () => void) => {
    showError(message, retry, undefined, t("common.retry"));
  };

  const saveBaselineRating = async (payload: RatingInput) => {
    const isClearing = !payload.severity && !payload.likelihood;
    show({ message: isClearing ? t("ra.workspace.clearingBaseline") : t("ra.workspace.savingBaseline"), tone: "info" });
    try {
      await actions.saveRiskRatings([payload]);
      notifySuccess(isClearing ? t("ra.workspace.baselineCleared") : t("ra.workspace.baselineSaved"));
    } catch (error) {
      console.error(error);
      notifyError(
        t("ra.workspace.baselineSaveFailed"),
        () => void saveBaselineRating(payload)
      );
    }
  };

  const saveResidualRating = async (payload: RatingInput) => {
    const isClearing = !payload.severity && !payload.likelihood;
    show({ message: isClearing ? t("ra.workspace.clearingResidual") : t("ra.workspace.savingResidual"), tone: "info" });
    try {
      await actions.saveResidualRisk([payload]);
      notifySuccess(isClearing ? t("ra.workspace.residualCleared") : t("ra.workspace.residualSaved"));
    } catch (error) {
      console.error(error);
      notifyError(
        t("ra.workspace.residualSaveFailed"),
        () => void saveResidualRating(payload)
      );
    }
  };

  const handleBaselineChange = async (
    hazardId: string,
    patch: Partial<{ severity: RatingInput["severity"]; likelihood: RatingInput["likelihood"] }>
  ) => {
    let nextRecord: { severity: RatingInput["severity"]; likelihood: RatingInput["likelihood"] } | undefined;
    setBaselineDraft((prev) => {
      const current = prev[hazardId] ?? { severity: "", likelihood: "" };
      nextRecord = { ...current, ...patch };
      return { ...prev, [hazardId]: nextRecord! };
    });
    const shouldSave =
      (nextRecord?.severity && nextRecord.likelihood) ||
      (!nextRecord?.severity && !nextRecord?.likelihood);
    if (shouldSave) {
      void saveBaselineRating({
        hazardId,
        severity: (nextRecord?.severity ?? "") as RatingInput["severity"],
        likelihood: (nextRecord?.likelihood ?? "") as RatingInput["likelihood"]
      });
    }
  };

  const handleResidualChange = async (
    hazardId: string,
    patch: Partial<{ severity: RatingInput["severity"]; likelihood: RatingInput["likelihood"] }>
  ) => {
    let nextRecord: { severity: RatingInput["severity"]; likelihood: RatingInput["likelihood"] } | undefined;
    setResidualDraft((prev) => {
      const current = prev[hazardId] ?? { severity: "", likelihood: "" };
      nextRecord = { ...current, ...patch };
      return { ...prev, [hazardId]: nextRecord! };
    });
    const shouldSave =
      (nextRecord?.severity && nextRecord.likelihood) ||
      (!nextRecord?.severity && !nextRecord?.likelihood);
    if (shouldSave) {
      void saveResidualRating({
        hazardId,
        severity: (nextRecord?.severity ?? "") as RatingInput["severity"],
        likelihood: (nextRecord?.likelihood ?? "") as RatingInput["likelihood"]
      });
    }
  };

  // Render colored risk pill based on matrix settings
  const renderRiskPill = (severity?: string | null, likelihood?: string | null) => {
    if (!severity || !likelihood) {
      return <span className="risk-pill muted">{t("common.noData")}</span>;
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
            <SheetHeaderCell className="sheet-col-step">{t("ra.workspace.table.processStep")}</SheetHeaderCell>
            <SheetHeaderCell>{t("ra.workspace.table.category")}</SheetHeaderCell>
            <SheetHeaderCell>{t("ra.workspace.table.severity")}</SheetHeaderCell>
            <SheetHeaderCell>{t("ra.workspace.table.likelihood")}</SheetHeaderCell>
            <SheetHeaderCell>{t("ra.workspace.table.risk")}</SheetHeaderCell>
            <SheetHeaderCell>{t("ra.workspace.table.controls")}</SheetHeaderCell>
            <SheetHeaderCell>{t("ra.workspace.table.residualSeverity")}</SheetHeaderCell>
            <SheetHeaderCell>{t("ra.workspace.table.residualLikelihood")}</SheetHeaderCell>
            <SheetHeaderCell>{t("ra.workspace.table.residualRisk")}</SheetHeaderCell>
            <SheetHeaderCell className="sheet-col-actions">{t("ra.workspace.table.actions")}</SheetHeaderCell>
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
              onSuccess={notifySuccess}
              onError={notifyError}
              baselineDraft={baselineDraft}
              residualDraft={residualDraft}
              onBaselineChange={handleBaselineChange}
              onResidualChange={handleResidualChange}
            />
          ))}
        </SheetBody>
      </SheetTable>
      <div style={{ marginTop: "0.6rem" }}>
        <SaveStatus status={status} />
      </div>
      {dialog}
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
  onSuccess: (message: string, duration?: number) => void;
  onError: (message: string, retry?: () => void) => void;
  baselineDraft: Record<string, { severity: RatingInput["severity"]; likelihood: RatingInput["likelihood"] }>;
  residualDraft: Record<string, { severity: RatingInput["severity"]; likelihood: RatingInput["likelihood"] }>;
  onBaselineChange: (
    hazardId: string,
    patch: Partial<{ severity: RatingInput["severity"]; likelihood: RatingInput["likelihood"] }>
  ) => Promise<void>;
  onResidualChange: (
    hazardId: string,
    patch: Partial<{ severity: RatingInput["severity"]; likelihood: RatingInput["likelihood"] }>
  ) => Promise<void>;
}

// Component for rendering editable step and its hazards
const EditableStepRows = ({
  step,
  hazards,
  renderRiskPill,
  actionsByHazard,
  saving,
  actions,
  onSuccess,
  onError,
  baselineDraft,
  residualDraft,
  onBaselineChange,
  onResidualChange
}: EditableStepRowsProps) => {
  const [addingAction, setAddingAction] = useState<string | null>(null);
  const [newActionText, setNewActionText] = useState("");
  const { drafts, patchDraft, commitDraft } = useHazardDrafts(hazards);
  const { t } = useI18n();

  // Handle category change
  const handleCategoryChange = async (
    hazardId: string,
    currentCategory: string | null | undefined,
    categoryCode: string
  ) => {
    if ((currentCategory ?? "") === categoryCode) {
      return;
    }
    try {
      await actions.updateHazard(hazardId, { categoryCode });
      onSuccess(t("ra.workspace.categoryUpdated"));
    } catch (error) {
      console.error(error);
      onError(
        t("ra.workspace.categoryUpdateFailed"),
        () => void handleCategoryChange(hazardId, currentCategory, categoryCode)
      );
    }
  };

  // Handle adding new action
  const handleAddAction = async (hazardId: string) => {
    if (!newActionText.trim()) return;
    try {
      await actions.addAction({ hazardId, description: newActionText.trim() });
      setNewActionText("");
      setAddingAction(null);
      onSuccess(t("ra.workspace.actionAdded"));
    } catch (error) {
      console.error(error);
      onError(t("ra.workspace.actionAddFailed"), () => void handleAddAction(hazardId));
    }
  };

  const handleHazardSave = async (hazardId: string) => {
    try {
      const saved = await commitDraft(hazardId, actions.updateHazard);
      if (saved) {
        onSuccess(t("ra.workspace.hazardSaved"));
      }
    } catch (error) {
      console.error(error);
      onError(t("ra.workspace.hazardSaveFailed"), () => void handleHazardSave(hazardId));
    }
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
                {t("ra.workspace.equipmentLabel")}: {step.equipment?.join(", ")}
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
            {t("ra.workspace.noHazardsForStep")}
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
                  onBlur={() => void handleHazardSave(hazard.id)}
                  placeholder={t("ra.workspace.hazardLabelPlaceholder")}
                  disabled={saving}
                />
                <SheetTextarea
                  value={draft?.description ?? hazard.description ?? ""}
                  onChange={(event) => patchDraft(hazard.id, { description: event.target.value })}
                  onBlur={() => void handleHazardSave(hazard.id)}
                  placeholder={t("ra.workspace.hazardDescriptionPlaceholder")}
                  disabled={saving}
                  rows={2}
                />
              </div>
            </SheetCell>

            {/* Category */}
            <SheetCell>
              <SheetSelect
                value={hazard.categoryCode ?? ""}
                onChange={(e) => handleCategoryChange(hazard.id, hazard.categoryCode, e.target.value)}
                disabled={saving}
                title={hazard.categoryCode ?? ""}
              >
                <option value="">{t("common.noData")}</option>
                {HAZARD_CATEGORIES.map((cat) => (
                  <option key={cat.code} value={cat.code}>
                    {t(`domain.hazardCategories.${cat.code}`, { fallback: cat.label ?? cat.code })}
                  </option>
                ))}
              </SheetSelect>
            </SheetCell>

            {/* Baseline severity */}
            <SheetCell>
              <SheetSelect
                value={baseline.severity}
                onChange={(e) =>
                  void onBaselineChange(hazard.id, { severity: e.target.value as RatingInput["severity"] })
                }
                disabled={saving}
              >
                <option value="">{t("common.noData")}</option>
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
                onChange={(e) =>
                  void onBaselineChange(hazard.id, { likelihood: e.target.value as RatingInput["likelihood"] })
                }
                disabled={saving}
              >
                <option value="">{t("common.noData")}</option>
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
            <ControlsCell hazard={hazard} saving={saving} actions={actions} onSuccess={onSuccess} onError={onError} />
            </SheetCell>

            {/* Residual severity */}
            <SheetCell>
              <SheetSelect
                value={residual.severity}
                onChange={(e) =>
                  void onResidualChange(hazard.id, { severity: e.target.value as RatingInput["severity"] })
                }
                disabled={saving}
              >
                <option value="">{t("common.noData")}</option>
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
                onChange={(e) =>
                  void onResidualChange(hazard.id, { likelihood: e.target.value as RatingInput["likelihood"] })
                }
                disabled={saving}
              >
                <option value="">{t("common.noData")}</option>
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
                    onDelete={actions.deleteAction}
                    onSuccess={onSuccess}
                    onError={onError}
                    onConfirmDelete={confirm}
                  />
                ))}
              </ul>
              {isAddingAction ? (
                <div className="sheet-control-add-form" style={{ marginTop: "0.5rem" }}>
                  <SheetInput
                    value={newActionText}
                    onChange={(e) => setNewActionText(e.target.value)}
                    placeholder={t("ra.workspace.actionDescriptionPlaceholder")}
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
                    {t("common.add")}
                  </SheetButton>
                  <SheetButton
                    onClick={() => setAddingAction(null)}
                    disabled={saving}
                  >
                    {t("common.cancel")}
                  </SheetButton>
                </div>
              ) : (
                <SheetButton
                  onClick={() => setAddingAction(hazard.id)}
                  disabled={saving}
                  style={{ marginTop: "0.5rem" }}
                >
                  + {t("ra.workspace.addAction")}
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
  onSuccess: (message: string, duration?: number) => void;
  onError: (message: string, retry?: () => void) => void;
}

const ControlsCell = ({ hazard, saving, actions, onSuccess, onError }: ControlsCellProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [existingControls, setExistingControls] = useState("");
  const [newControl, setNewControl] = useState("");
  const { t } = useI18n();

  const existing = hazard.existingControls ?? [];
  const proposed = hazard.proposedControls ?? [];

  const handleSaveExisting = async () => {
    const controls = existingControls
      .split("\n")
      .map((c) => c.trim())
      .filter(Boolean);
    try {
      await actions.updateHazard(hazard.id, { existingControls: controls });
      setIsEditing(false);
      onSuccess(t("ra.workspace.controlsUpdated"));
    } catch (error) {
      console.error(error);
      onError(t("ra.workspace.controlsUpdateFailed"), () => void handleSaveExisting());
    }
  };

  const handleAddProposed = async () => {
    if (!newControl.trim()) return;
    try {
      await actions.addProposedControl(hazard.id, newControl.trim());
      setNewControl("");
      onSuccess(t("ra.workspace.proposedAdded"));
    } catch (error) {
      console.error(error);
      onError(t("ra.workspace.proposedAddFailed"), () => void handleAddProposed());
    }
  };

  const handleDeleteProposed = async (controlId: string) => {
    try {
      await actions.deleteProposedControl(hazard.id, controlId);
      onSuccess(t("ra.workspace.proposedRemoved"));
    } catch (error) {
      console.error(error);
      onError(t("ra.workspace.proposedRemoveFailed"), () => void handleDeleteProposed(controlId));
    }
  };

  if (isEditing) {
    return (
      <div className="sheet-inline-form">
        <label style={{ fontSize: "0.75rem" }}>{t("ra.workspace.existingControlsLabel")}</label>
        <textarea
          className="sheet-textarea"
          value={existingControls}
          onChange={(e) => setExistingControls(e.target.value)}
          placeholder={t("ra.workspace.controlsPlaceholder")}
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
            {t("common.save")}
          </button>
          <button
            type="button"
            className="sheet-button"
            onClick={() => setIsEditing(false)}
            disabled={saving}
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="sheet-control-list">
      {existing.length === 0 && proposed.length === 0 ? (
        <span className="sheet-empty-cell">{t("ra.workspace.noControls")}</span>
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
                onClick={() => {
                  void handleDeleteProposed(ctrl.id);
                }}
                disabled={saving}
                title={t("common.delete")}
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
          {t("ra.workspace.editExisting")}
        </button>
      </div>
      <div className="sheet-control-add-form">
        <input
          type="text"
          className="sheet-input"
          value={newControl}
          onChange={(e) => setNewControl(e.target.value)}
          placeholder={t("ra.workspace.proposedPlaceholder")}
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
  onUpdate: (
    actionId: string,
    patch: { description?: string; owner?: string | null; dueDate?: string | null; status?: string }
  ) => Promise<void>;
  onDelete: (actionId: string) => Promise<void>;
  onConfirmDelete: (options: {
    title: string;
    description?: string;
    confirmLabel: string;
    cancelLabel: string;
    tone?: "default" | "danger";
  }) => Promise<boolean>;
  onSuccess: (message: string, duration?: number) => void;
  onError: (message: string, retry?: () => void) => void;
}

const ActionItem = ({
  action,
  saving,
  onUpdate,
  onDelete,
  onConfirmDelete,
  onSuccess,
  onError
}: ActionItemProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [description, setDescription] = useState(action.description);
  const [owner, setOwner] = useState(action.owner ?? "");
  const [dueDate, setDueDate] = useState(action.dueDate ? action.dueDate.slice(0, 10) : "");
  const [status, setStatus] = useState(action.status ?? "OPEN");
  const { t, formatDate } = useI18n();

  useEffect(() => {
    setDescription(action.description);
    setOwner(action.owner ?? "");
    setDueDate(action.dueDate ? action.dueDate.slice(0, 10) : "");
    setStatus(action.status ?? "OPEN");
  }, [action.description, action.owner, action.dueDate, action.status]);

  const handleSave = async () => {
    try {
      await onUpdate(action.id, {
        description,
        owner: owner || null,
        dueDate: dueDate || null,
        status
      });
      setIsEditing(false);
      onSuccess(t("ra.workspace.actionUpdated"));
    } catch (error) {
      console.error(error);
      onError(t("ra.workspace.actionUpdateFailed"), () => void handleSave());
    }
  };

  const handleDelete = async () => {
    try {
      await onDelete(action.id);
      onSuccess(t("ra.workspace.actionDeleted"));
      setIsEditing(false);
    } catch (error) {
      console.error(error);
      onError(t("ra.workspace.actionDeleteFailed"), () => void handleDelete());
    }
  };

  const handleConfirmDelete = async () => {
    const ok = await onConfirmDelete({
      title: t("common.delete"),
      description: t("ra.actions.confirmDelete"),
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
      tone: "danger"
    });
    if (!ok) return;
    await handleDelete();
  };

  if (isEditing) {
    return (
      <li className="action-item-editing">
        <input
          type="text"
          className="sheet-input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t("ra.workspace.actionDescriptionPlaceholder")}
          disabled={saving}
        />
        <input
          type="text"
          className="sheet-input"
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
          placeholder={t("ra.workspace.ownerPlaceholder")}
          disabled={saving}
        />
        <input
          type="date"
          className="sheet-input"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          disabled={saving}
        />
        <select
          className="sheet-input"
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          disabled={saving}
        >
          <option value="OPEN">{t("ra.actions.status.open")}</option>
          <option value="IN_PROGRESS">{t("ra.actions.status.inProgress")}</option>
          <option value="COMPLETE">{t("ra.actions.status.complete")}</option>
        </select>
        <div className="sheet-actions-grid">
          <button
            type="button"
            className="sheet-button sheet-button--primary"
            onClick={handleSave}
            disabled={saving}
          >
            {t("common.save")}
          </button>
          <button
            type="button"
            className="sheet-button sheet-button--danger"
            onClick={() => void handleConfirmDelete()}
            disabled={saving}
          >
            {t("common.delete")}
          </button>
          <button
            type="button"
            className="sheet-button"
            onClick={() => setIsEditing(false)}
            disabled={saving}
          >
            {t("common.cancel")}
          </button>
        </div>
      </li>
    );
  }

  return (
    <li onClick={() => setIsEditing(true)} style={{ cursor: "pointer" }}>
      <strong>{action.description}</strong>
      <span>
        {action.owner || t("ra.workspace.unassigned")} ·{" "}
        {action.dueDate ? formatDate(action.dueDate) : t("ra.workspace.noDueDate")}
        {" · "}
        {action.status === "COMPLETE"
          ? t("ra.actions.status.complete")
          : action.status === "IN_PROGRESS"
          ? t("ra.actions.status.inProgress")
          : t("ra.actions.status.open")}
      </span>
    </li>
  );
};
