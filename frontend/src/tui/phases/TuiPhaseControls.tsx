import { useEffect, useMemo, useRef, useState } from "react";
import type { ControlHierarchy, Hazard, RatingInput } from "@/types/riskAssessment";
import { TEMPLATE_LIKELIHOOD_OPTIONS, TEMPLATE_SEVERITY_OPTIONS } from "@/lib/templateRiskScales";
import { useRaContext } from "@/contexts/RaContext";
import { useI18n } from "@/i18n/I18nContext";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { TuiBanner } from "@/tui/components/TuiBanner";
import { TuiEmptyState } from "@/tui/components/TuiEmptyState";
import { TuiFormField } from "@/tui/components/TuiFormField";
import { TuiPanel } from "@/tui/components/TuiPanel";
import { TuiPhaseLayout } from "@/tui/phases/TuiPhaseLayout";

type ProposedFormState = Record<string, { description: string; hierarchy: ControlHierarchy | "" }>;

const initialResidualFromHazards = (hazards: Hazard[]) =>
  hazards.reduce<Record<string, { severity: string; likelihood: string }>>((acc, hazard) => {
    acc[hazard.id] = {
      severity: hazard.residual?.severity ?? "",
      likelihood: hazard.residual?.likelihood ?? ""
    };
    return acc;
  }, {});

const showStatusWithTimeout = (setStatus: (value: string | null) => void, message: string, timeout = 2000) => {
  setStatus(message);
  window.setTimeout(() => setStatus(null), timeout);
};

export const TuiPhaseControls = () => {
  const { t } = useI18n();
  const { raCase, saving, actions } = useRaContext();

  const [assistantNotes, setAssistantNotes] = useState("");
  const [assistantStatus, setAssistantStatus] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [existingDrafts, setExistingDrafts] = useState<Record<string, string>>({});
  const [proposedForms, setProposedForms] = useState<ProposedFormState>({});
  const { confirm, dialog } = useConfirmDialog();

  const [residualRatings, setResidualRatings] = useState(() => initialResidualFromHazards(raCase.hazards));
  const residualRef = useRef<Record<string, { severity: string; likelihood: string }>>(residualRatings);

  useEffect(() => {
    const next = initialResidualFromHazards(raCase.hazards);
    residualRef.current = next;
    setResidualRatings(next);
  }, [raCase.hazards]);

  const severityOptions = useMemo(
    () =>
      TEMPLATE_SEVERITY_OPTIONS.map((option) => ({
        value: option.value,
        label: t(`domain.severity.${option.value}`, { fallback: option.label })
      })),
    [t]
  );

  const likelihoodOptions = useMemo(
    () =>
      TEMPLATE_LIKELIHOOD_OPTIONS.map((option) => ({
        value: option.value,
        label: t(`domain.likelihood.${option.value}`, { fallback: option.label })
      })),
    [t]
  );

  const hazardsByStep = useMemo(
    () =>
      raCase.steps.map((step, index) => ({
        step,
        index,
        hazards: raCase.hazards
          .filter((hazard) => hazard.stepId === step.id)
          .sort((a, b) => a.orderIndex - b.orderIndex)
      })),
    [raCase.hazards, raCase.steps]
  );

  const getExistingValue = (hazard: Hazard) =>
    existingDrafts[hazard.id] ?? (hazard.existingControls ?? []).join("\n");

  const handleExistingBlur = async (hazardId: string) => {
    if (existingDrafts[hazardId] === undefined) {
      return;
    }
    const controls = (existingDrafts[hazardId] ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    try {
      await actions.updateHazard(hazardId, { existingControls: controls });
      setExistingDrafts((prev) => {
        const next = { ...prev };
        delete next[hazardId];
        return next;
      });
      setErrorMessage(null);
      showStatusWithTimeout(setActionStatus, t("ra.controls.existingUpdated"));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t("ra.controls.existingUpdateFailed"));
    }
  };

  const handleAddProposed = async (hazardId: string) => {
    const form = proposedForms[hazardId] ?? { description: "", hierarchy: "" };
    if (!form.description.trim()) {
      setErrorMessage(t("ra.controls.addFailed"));
      return;
    }
    try {
      await actions.addProposedControl(hazardId, form.description, form.hierarchy || undefined);
      setProposedForms((prev) => ({ ...prev, [hazardId]: { description: "", hierarchy: "" } }));
      setErrorMessage(null);
      showStatusWithTimeout(setActionStatus, t("ra.controls.proposedAdded"));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t("ra.controls.addFailed"));
    }
  };

  const handleRemoveProposed = async (hazardId: string, controlId: string) => {
    const ok = await confirm({
      title: t("common.delete"),
      description: t("ra.controls.confirmRemove"),
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
      tone: "danger"
    });
    if (!ok) return;
    try {
      await actions.deleteProposedControl(hazardId, controlId);
      setErrorMessage(null);
      showStatusWithTimeout(setActionStatus, t("ra.controls.removed"));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t("ra.controls.removeFailed"));
    }
  };

  const handleResidualChange = (hazardId: string, patch: Partial<{ severity: string; likelihood: string }>) => {
    const current = residualRef.current[hazardId] ?? { severity: "", likelihood: "" };
    const next = { ...current, ...patch };
    residualRef.current = { ...residualRef.current, [hazardId]: next };
    setResidualRatings((prev) => ({ ...prev, [hazardId]: next }));
    void commitResidual(hazardId, next);
  };

  const commitResidual = async (hazardId: string, value: { severity: string; likelihood: string }) => {
    const shouldSave = (value.severity && value.likelihood) || (!value.severity && !value.likelihood);
    if (!shouldSave) {
      return;
    }
    const isClearing = !value.severity && !value.likelihood;
    try {
      await actions.saveResidualRisk([
        {
          hazardId,
          severity: value.severity as RatingInput["severity"],
          likelihood: value.likelihood as RatingInput["likelihood"]
        }
      ]);
      setErrorMessage(null);
      showStatusWithTimeout(setActionStatus, isClearing ? t("ra.controls.residualCleared") : t("ra.controls.residualSaved"));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t("ra.controls.residualSaveFailed"));
    }
  };

  const handleExtractControls = async () => {
    if (!assistantNotes.trim()) {
      return;
    }
    setAssistantStatus(t("ra.controls.requestingSuggestions"));
    try {
      await actions.extractControls(assistantNotes);
      setAssistantNotes("");
      showStatusWithTimeout(setAssistantStatus, t("ra.controls.suggestionsRequested"));
    } catch (err) {
      setAssistantStatus(err instanceof Error ? err.message : t("ra.controls.suggestionsFailed"));
    }
  };

  const updateProposedForm = (hazardId: string, patch: { description?: string; hierarchy?: ControlHierarchy | "" }) => {
    setProposedForms((prev) => ({
      ...prev,
      [hazardId]: {
        ...(prev[hazardId] ?? { description: "", hierarchy: "" }),
        ...patch
      }
    }));
  };

  const disableInputs = saving;

  return (
    <TuiPhaseLayout phase="CONTROL_DISCUSSION">
      <div className="tui-columns">
        <TuiPanel
          eyebrow={t("ra.controls.assistantTitle")}
          title={t("ra.controls.assistantTitle")}
          subtitle={t("ra.controls.assistantDescription")}
          actions={(
            <button type="button" onClick={() => void handleExtractControls()} disabled={!assistantNotes.trim() || disableInputs}>
              {t("ra.controls.assistantAction")}
            </button>
          )}
        >
          <TuiFormField label={t("ra.controls.assistantTitle")} hint={t("ra.controls.assistantDescription")}>
            <textarea
              rows={6}
              value={assistantNotes}
              onChange={(event) => setAssistantNotes(event.target.value)}
              placeholder={t("ra.controls.assistantPlaceholder")}
              disabled={disableInputs}
            />
          </TuiFormField>
          {assistantStatus && <p className="tui-muted">{assistantStatus}</p>}
        </TuiPanel>

        <TuiPanel
          eyebrow={t("ra.controls.proposedLabel")}
          title={t("ra.controls.proposedLabel")}
          subtitle={t("ra.controls.residualHint")}
        >
          {errorMessage && (
            <TuiBanner variant="error">
              {errorMessage}
            </TuiBanner>
          )}
          {actionStatus && <p className="tui-muted">{actionStatus}</p>}

          {raCase.hazards.length === 0 ? (
            <TuiEmptyState title={t("ra.controls.noHazards")} />
          ) : (
            <div className="tui-hazard-list">
              {hazardsByStep.map(({ step, index, hazards }) => (
                <div key={step.id} className="tui-hazard-step">
                  <div className="tui-hazard-step__header">
                    <strong>{t("ra.steps.newStep", { values: { index: index + 1 } })}</strong>
                    <span className="tui-muted">{step.activity}</span>
                  </div>

                  {hazards.length === 0 ? (
                    <TuiEmptyState title={t("ra.controls.noHazards")} />
                  ) : (
                    <div className="tui-hazard-items">
                      {hazards.map((hazard) => {
                        const residual = residualRatings[hazard.id] ?? { severity: "", likelihood: "" };
                        const proposedForm = proposedForms[hazard.id] ?? { description: "", hierarchy: "" };
                        return (
                          <div key={hazard.id} className="tui-hazard-item">
                            <div className="tui-hazard-item__header">
                              <strong>{hazard.label}</strong>
                            </div>
                            <div className="tui-hazard-item__fields">
                              <TuiFormField label={t("ra.controls.existingLabel")} hint={t("ra.controls.controlsHint")}>
                                <textarea
                                  rows={3}
                                  value={getExistingValue(hazard)}
                                  onChange={(event) =>
                                    setExistingDrafts((prev) => ({ ...prev, [hazard.id]: event.target.value }))
                                  }
                                  onBlur={() => void handleExistingBlur(hazard.id)}
                                  placeholder={t("ra.controls.controlsHint")}
                                  disabled={disableInputs}
                                />
                              </TuiFormField>

                              <div className="tui-control-list">
                                {hazard.proposedControls.length === 0 && (
                                  <p className="tui-muted">{t("ra.controls.noControls")}</p>
                                )}
                                {hazard.proposedControls.map((control) => (
                                  <div key={control.id} className="tui-control-item">
                                    <div>
                                      <strong>{control.description}</strong>
                                      {control.hierarchy && (
                                        <span className="tui-muted"> · {t(`ra.controls.hierarchy.${control.hierarchy.toLowerCase()}`)}</span>
                                      )}
                                    </div>
                                    <button
                                      type="button"
                                      className="tui-danger"
                                      onClick={() => void handleRemoveProposed(hazard.id, control.id)}
                                      disabled={disableInputs}
                                    >
                                      {t("common.remove")}
                                    </button>
                                  </div>
                                ))}
                              </div>

                              <div className="tui-control-add">
                                <TuiFormField label={t("ra.controls.proposedPlaceholder")}>
                                  <input
                                    value={proposedForm.description}
                                    onChange={(event) => updateProposedForm(hazard.id, { description: event.target.value })}
                                    placeholder={t("ra.controls.proposedPlaceholder")}
                                    disabled={disableInputs}
                                  />
                                </TuiFormField>
                                <TuiFormField label={t("ra.controls.hierarchySelect")}>
                                  <select
                                    value={proposedForm.hierarchy}
                                    onChange={(event) =>
                                      updateProposedForm(hazard.id, { hierarchy: event.target.value as ControlHierarchy | "" })
                                    }
                                    disabled={disableInputs}
                                  >
                                    <option value="">{t("ra.controls.selectOption")}</option>
                                    <option value="SUBSTITUTION">{t("ra.controls.hierarchy.substitution")}</option>
                                    <option value="TECHNICAL">{t("ra.controls.hierarchy.technical")}</option>
                                    <option value="ORGANIZATIONAL">{t("ra.controls.hierarchy.organizational")}</option>
                                    <option value="PPE">{t("ra.controls.hierarchy.ppe")}</option>
                                  </select>
                                </TuiFormField>
                                <button type="button" onClick={() => void handleAddProposed(hazard.id)} disabled={disableInputs}>
                                  {t("common.add")}
                                </button>
                              </div>

                              <div className="tui-control-residual">
                                <TuiFormField label={t("ra.controls.severity")}>
                                  <select
                                    value={residual.severity}
                                    onChange={(event) => handleResidualChange(hazard.id, { severity: event.target.value })}
                                    disabled={disableInputs}
                                  >
                                    <option value="">{t("ra.controls.selectOption")}</option>
                                    {severityOptions.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </TuiFormField>
                                <TuiFormField label={t("ra.controls.likelihood")}>
                                  <select
                                    value={residual.likelihood}
                                    onChange={(event) => handleResidualChange(hazard.id, { likelihood: event.target.value })}
                                    disabled={disableInputs}
                                  >
                                    <option value="">{t("ra.controls.selectOption")}</option>
                                    {likelihoodOptions.map((option) => (
                                      <option key={option.value} value={option.value}>
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                </TuiFormField>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TuiPanel>
      </div>
      {dialog}
    </TuiPhaseLayout>
  );
};
