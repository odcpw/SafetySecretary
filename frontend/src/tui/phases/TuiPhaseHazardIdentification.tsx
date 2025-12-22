import { useMemo, useState } from "react";
import { HAZARD_CATEGORIES } from "@/lib/hazardCategories";
import { useHazardDrafts } from "@/hooks/useHazardDrafts";
import { useRaContext } from "@/contexts/RaContext";
import { useI18n } from "@/i18n/I18nContext";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { TuiBanner } from "@/tui/components/TuiBanner";
import { TuiEmptyState } from "@/tui/components/TuiEmptyState";
import { TuiFormField } from "@/tui/components/TuiFormField";
import { TuiPanel } from "@/tui/components/TuiPanel";
import { TuiPhaseLayout } from "@/tui/phases/TuiPhaseLayout";

type HazardFormState = Record<string, { label: string; description: string }>;

const showStatusWithTimeout = (setStatus: (value: string | null) => void, message: string, timeout = 2000) => {
  setStatus(message);
  window.setTimeout(() => setStatus(null), timeout);
};

export const TuiPhaseHazardIdentification = () => {
  const { t } = useI18n();
  const { raCase, saving, actions } = useRaContext();
  const { drafts, patchDraft, commitDraft } = useHazardDrafts(raCase.hazards);

  const [narrative, setNarrative] = useState("");
  const [assistantStatus, setAssistantStatus] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [forms, setForms] = useState<HazardFormState>({});
  const { confirm, dialog } = useConfirmDialog();

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

  const handleExtract = async () => {
    if (!narrative.trim()) {
      return;
    }
    setAssistantStatus(t("ra.hazards.extracting"));
    try {
      await actions.extractHazards(narrative);
      setNarrative("");
      showStatusWithTimeout(setAssistantStatus, t("ra.hazards.extracted"));
    } catch (err) {
      setAssistantStatus(err instanceof Error ? err.message : t("ra.hazards.extractFailed"));
      window.setTimeout(() => setAssistantStatus(null), 4000);
    }
  };

  const handleAddHazard = async (stepId: string) => {
    const form = forms[stepId] ?? { label: "", description: "" };
    if (!form.label.trim()) {
      setErrorMessage(t("ra.hazards.addFailed"));
      return;
    }
    try {
      await actions.addManualHazard(stepId, form.label, form.description);
      setForms((prev) => ({ ...prev, [stepId]: { label: "", description: "" } }));
      setErrorMessage(null);
      showStatusWithTimeout(setActionStatus, t("ra.hazards.added"));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t("ra.hazards.addFailed"));
    }
  };

  const handleDelete = async (hazardId: string) => {
    const ok = await confirm({
      title: t("common.delete"),
      description: t("ra.hazards.confirmDelete"),
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
      tone: "danger"
    });
    if (!ok) return;
    try {
      await actions.deleteHazard(hazardId);
      setErrorMessage(null);
      showStatusWithTimeout(setActionStatus, t("ra.hazards.deleted"));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t("ra.hazards.deleteFailed"));
    }
  };

  const handleReorder = async (stepId: string, hazardId: string, direction: "up" | "down") => {
    const hazards = hazardsByStep.find((group) => group.step.id === stepId)?.hazards;
    if (!hazards) {
      return;
    }
    const order = hazards.map((hazard) => hazard.id);
    const index = order.indexOf(hazardId);
    if (index === -1) {
      return;
    }
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= order.length) {
      return;
    }
    [order[index], order[target]] = [order[target], order[index]];
    try {
      await actions.reorderHazards(stepId, order);
      setErrorMessage(null);
      showStatusWithTimeout(setActionStatus, t("ra.hazards.orderUpdated"));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t("ra.hazards.reorderFailed"));
    }
  };

  const handleMoveToStep = async (hazardId: string, stepId: string) => {
    try {
      await actions.updateHazard(hazardId, { stepId });
      setErrorMessage(null);
      showStatusWithTimeout(setActionStatus, t("ra.hazards.moved"));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t("ra.hazards.moveFailed"));
    }
  };

  const handleCategoryChange = async (hazardId: string, currentCategory: string | null | undefined, next: string) => {
    if ((currentCategory ?? "") === next) {
      return;
    }
    try {
      await actions.updateHazard(hazardId, { categoryCode: next || undefined });
      setErrorMessage(null);
      showStatusWithTimeout(setActionStatus, t("ra.risk.categoryUpdated"));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t("ra.risk.categoryUpdateFailed"));
    }
  };

  const handleCommitDraft = async (hazardId: string) => {
    try {
      await commitDraft(hazardId, actions.updateHazard);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t("ra.risk.hazardSaveFailed"));
    }
  };

  const updateForm = (stepId: string, patch: { label?: string; description?: string }) => {
    setForms((prev) => ({
      ...prev,
      [stepId]: {
        ...(prev[stepId] ?? { label: "", description: "" }),
        ...patch
      }
    }));
  };

  const disableInputs = saving;

  return (
    <TuiPhaseLayout phase="HAZARD_IDENTIFICATION">
      <div className="tui-columns">
        <TuiPanel
          eyebrow={t("ra.hazards.assistantTitle")}
          title={t("ra.hazards.assistantTitle")}
          subtitle={t("ra.hazards.assistantDescription")}
          actions={(
            <button type="button" onClick={() => void handleExtract()} disabled={!narrative.trim() || disableInputs}>
              {t("ra.hazards.assistantAction")}
            </button>
          )}
        >
          <TuiFormField label={t("ra.hazards.assistantTitle")} hint={t("ra.hazards.assistantDescription")}>
            <textarea
              rows={6}
              value={narrative}
              onChange={(event) => setNarrative(event.target.value)}
              placeholder={t("ra.hazards.assistantPlaceholder")}
              disabled={disableInputs}
            />
          </TuiFormField>
          {assistantStatus && <p className="tui-muted">{assistantStatus}</p>}
        </TuiPanel>

        <TuiPanel
          eyebrow={t("ra.hazards.table.processStep")}
          title={t("ra.hazards.table.processStep")}
          subtitle={t("ra.hazards.table.hazard")}
        >
          {errorMessage && (
            <TuiBanner variant="error">
              {errorMessage}
            </TuiBanner>
          )}
          {actionStatus && <p className="tui-muted">{actionStatus}</p>}

          {hazardsByStep.length === 0 ? (
            <TuiEmptyState title={t("ra.steps.empty")} />
          ) : (
            <div className="tui-hazard-list">
              {hazardsByStep.map(({ step, index, hazards }) => (
                <div key={step.id} className="tui-hazard-step">
                  <div className="tui-hazard-step__header">
                    <strong>{t("ra.steps.newStep", { values: { index: index + 1 } })}</strong>
                    <span className="tui-muted">{step.activity}</span>
                  </div>

                  {hazards.length === 0 ? (
                    <TuiEmptyState title={t("ra.risk.noHazardsForStep")} />
                  ) : (
                    <div className="tui-hazard-items">
                      {hazards.map((hazard, hazardIndex) => {
                        const draft = drafts[hazard.id];
                        return (
                          <div key={hazard.id} className="tui-hazard-item">
                            <div className="tui-hazard-item__header">
                              <strong>{draft?.label ?? hazard.label}</strong>
                              <div className="tui-hazard-item__actions">
                                <button
                                  type="button"
                                  onClick={() => handleReorder(step.id, hazard.id, "up")}
                                  disabled={disableInputs || hazardIndex === 0}
                                >
                                  {t("common.moveUp")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleReorder(step.id, hazard.id, "down")}
                                  disabled={disableInputs || hazardIndex === hazards.length - 1}
                                >
                                  {t("common.moveDown")}
                                </button>
                                <button
                                  type="button"
                                  className="tui-danger"
                                  onClick={() => void handleDelete(hazard.id)}
                                  disabled={disableInputs}
                                >
                                  {t("common.delete")}
                                </button>
                              </div>
                            </div>
                            <div className="tui-hazard-item__fields">
                              <TuiFormField label={t("ra.hazards.table.hazard")}>
                                <input
                                  value={draft?.label ?? hazard.label}
                                  onChange={(event) => patchDraft(hazard.id, { label: event.target.value })}
                                  onBlur={() => void handleCommitDraft(hazard.id)}
                                  placeholder={t("ra.hazards.form.labelPlaceholder")}
                                  disabled={disableInputs}
                                />
                              </TuiFormField>
                              <TuiFormField label={t("ra.hazards.table.description")}>
                                <textarea
                                  rows={3}
                                  value={draft?.description ?? hazard.description ?? ""}
                                  onChange={(event) => patchDraft(hazard.id, { description: event.target.value })}
                                  onBlur={() => void handleCommitDraft(hazard.id)}
                                  placeholder={t("ra.hazards.form.descriptionPlaceholder")}
                                  disabled={disableInputs}
                                />
                              </TuiFormField>
                              <TuiFormField label={t("ra.hazards.table.category")}>
                                <select
                                  value={hazard.categoryCode ?? ""}
                                  onChange={(event) =>
                                    void handleCategoryChange(hazard.id, hazard.categoryCode, event.target.value)
                                  }
                                  disabled={disableInputs}
                                >
                                  <option value="">{t("common.noData")}</option>
                                  {HAZARD_CATEGORIES.map((cat) => (
                                    <option key={cat.code} value={cat.code}>
                                      {t(`domain.hazardCategories.${cat.code}`, { fallback: cat.label ?? cat.code })}
                                    </option>
                                  ))}
                                </select>
                              </TuiFormField>
                              <TuiFormField label={t("ra.hazards.table.processStep")}>
                                <select
                                  value={hazard.stepId}
                                  onChange={(event) => void handleMoveToStep(hazard.id, event.target.value)}
                                  disabled={disableInputs}
                                >
                                  {raCase.steps.map((stepOption, stepIndex) => (
                                    <option key={stepOption.id} value={stepOption.id}>
                                      {t("ra.steps.newStep", { values: { index: stepIndex + 1 } })}: {stepOption.activity}
                                    </option>
                                  ))}
                                </select>
                              </TuiFormField>
                              <TuiFormField label={t("ra.hazards.table.existingControls")}>
                                <textarea
                                  rows={3}
                                  value={draft?.existingControls ?? ""}
                                  onChange={(event) => patchDraft(hazard.id, { existingControls: event.target.value })}
                                  onBlur={() => void handleCommitDraft(hazard.id)}
                                  placeholder={t("ra.risk.controlsPlaceholder")}
                                  disabled={disableInputs}
                                />
                              </TuiFormField>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="tui-hazard-add">
                    <TuiFormField label={t("ra.hazards.form.labelPlaceholder")}>
                      <input
                        value={forms[step.id]?.label ?? ""}
                        onChange={(event) => updateForm(step.id, { label: event.target.value })}
                        placeholder={t("ra.hazards.form.labelPlaceholder")}
                        disabled={disableInputs}
                      />
                    </TuiFormField>
                    <TuiFormField label={t("ra.hazards.form.descriptionPlaceholder")}>
                      <textarea
                        rows={2}
                        value={forms[step.id]?.description ?? ""}
                        onChange={(event) => updateForm(step.id, { description: event.target.value })}
                        placeholder={t("ra.hazards.form.descriptionPlaceholder")}
                        disabled={disableInputs}
                      />
                    </TuiFormField>
                    <button type="button" onClick={() => void handleAddHazard(step.id)} disabled={disableInputs}>
                      {`${t("common.add")} ${t("ra.hazards.table.hazard")}`}
                    </button>
                  </div>
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
