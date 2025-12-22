import { useEffect, useMemo, useState } from "react";
import type { CorrectiveAction } from "@/types/riskAssessment";
import { useRaContext } from "@/contexts/RaContext";
import { useI18n } from "@/i18n/I18nContext";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { TuiBanner } from "@/tui/components/TuiBanner";
import { TuiEmptyState } from "@/tui/components/TuiEmptyState";
import { TuiFormField } from "@/tui/components/TuiFormField";
import { TuiPanel } from "@/tui/components/TuiPanel";
import { TuiPhaseLayout } from "@/tui/phases/TuiPhaseLayout";

type ActionDraft = { description: string; owner: string; dueDate: string; status: string };
type DraftMap = Record<string, ActionDraft>;
type InlineDraftMap = Record<string, { description: string; owner: string; dueDate: string }>;

const buildActionDrafts = (actions: CorrectiveAction[]): DraftMap =>
  actions.reduce<DraftMap>((acc, action) => {
    acc[action.id] = {
      description: action.description ?? "",
      owner: action.owner ?? "",
      dueDate: action.dueDate ? action.dueDate.slice(0, 10) : "",
      status: action.status
    };
    return acc;
  }, {});

const showStatusWithTimeout = (setStatus: (value: string | null) => void, message: string, timeout = 2000) => {
  setStatus(message);
  window.setTimeout(() => setStatus(null), timeout);
};

export const TuiPhaseActions = () => {
  const { t } = useI18n();
  const { raCase, saving, actions } = useRaContext();

  const [assistantNotes, setAssistantNotes] = useState("");
  const [assistantStatus, setAssistantStatus] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionDrafts, setActionDrafts] = useState<DraftMap>(() => buildActionDrafts(raCase.actions));
  const [inlineDrafts, setInlineDrafts] = useState<InlineDraftMap>({});
  const { confirm, dialog } = useConfirmDialog();

  useEffect(() => {
    setActionDrafts(buildActionDrafts(raCase.actions));
  }, [raCase.actions]);

  const hazardsByStep = useMemo(() => {
    return raCase.steps.map((step, index) => ({
      step,
      index,
      hazards: raCase.hazards
        .filter((hazard) => hazard.stepId === step.id)
        .sort((a, b) => a.orderIndex - b.orderIndex)
    }));
  }, [raCase.hazards, raCase.steps]);

  const actionsByHazard = useMemo(() => {
    const grouped = raCase.actions.reduce<Record<string, CorrectiveAction[]>>((acc, action) => {
      if (!action.hazardId) {
        return acc;
      }
      acc[action.hazardId] = acc[action.hazardId] ?? [];
      acc[action.hazardId]!.push(action);
      return acc;
    }, {});
    Object.values(grouped).forEach((list) => {
      list.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
    });
    return grouped;
  }, [raCase.actions]);

  const handleExtractActions = async () => {
    if (!assistantNotes.trim()) {
      return;
    }
    setAssistantStatus(t("ra.actions.requestingSuggestions"));
    try {
      await actions.extractActions(assistantNotes);
      setAssistantNotes("");
      showStatusWithTimeout(setAssistantStatus, t("ra.actions.suggestionsRequested"));
    } catch (err) {
      setAssistantStatus(err instanceof Error ? err.message : t("ra.actions.suggestionsFailed"));
    }
  };

  const handleUpdateAction = async (actionId: string) => {
    const draft = actionDrafts[actionId];
    if (!draft) {
      return;
    }
    const patch = {
      description: draft.description.trim(),
      owner: draft.owner.trim() || null,
      dueDate: draft.dueDate.trim() || null,
      status: draft.status
    };
    try {
      await actions.updateAction(actionId, patch);
      setErrorMessage(null);
      showStatusWithTimeout(setActionStatus, t("ra.actions.updated"));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t("ra.actions.updateFailed"));
    }
  };

  const handleStatusChange = async (actionId: string, status: string) => {
    updateActionDraft(actionId, { status });
    try {
      await actions.updateAction(actionId, { status });
      setErrorMessage(null);
      showStatusWithTimeout(setActionStatus, t("ra.actions.updated"));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t("ra.actions.updateFailed"));
    }
  };

  const handleDeleteAction = async (actionId: string) => {
    const ok = await confirm({
      title: t("common.delete"),
      description: t("ra.actions.confirmDelete"),
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
      tone: "danger"
    });
    if (!ok) return;
    try {
      await actions.deleteAction(actionId);
      setErrorMessage(null);
      showStatusWithTimeout(setActionStatus, t("ra.actions.deleted"));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t("ra.actions.deleteFailed"));
    }
  };

  const handleAddAction = async (hazardId: string) => {
    const draft = inlineDrafts[hazardId] ?? { description: "", owner: "", dueDate: "" };
    if (!draft.description.trim()) {
      setErrorMessage(t("ra.actions.addFailed"));
      return;
    }
    try {
      await actions.addAction({
        hazardId,
        description: draft.description,
        owner: draft.owner || undefined,
        dueDate: draft.dueDate || undefined
      });
      setInlineDrafts((prev) => ({ ...prev, [hazardId]: { description: "", owner: "", dueDate: "" } }));
      setErrorMessage(null);
      showStatusWithTimeout(setActionStatus, t("ra.actions.added"));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t("ra.actions.addFailed"));
    }
  };

  const handleReorder = async (hazardId: string, actionId: string, direction: "up" | "down") => {
    const actionsForHazard = actionsByHazard[hazardId] ?? [];
    const order = actionsForHazard.map((action) => action.id);
    const index = order.indexOf(actionId);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index === -1 || target < 0 || target >= order.length) {
      return;
    }
    [order[index], order[target]] = [order[target], order[index]];
    try {
      await actions.reorderActionsForHazard(hazardId, order);
      setErrorMessage(null);
      showStatusWithTimeout(setActionStatus, t("ra.actions.reordered"));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : t("ra.actions.reorderFailed"));
    }
  };

  const updateActionDraft = (actionId: string, patch: Partial<ActionDraft>) => {
    setActionDrafts((prev) => ({
      ...prev,
      [actionId]: {
        ...(prev[actionId] ?? { description: "", owner: "", dueDate: "", status: "OPEN" }),
        ...patch
      }
    }));
  };

  const updateInlineDraft = (hazardId: string, patch: { description?: string; owner?: string; dueDate?: string }) => {
    setInlineDrafts((prev) => ({
      ...prev,
      [hazardId]: {
        ...(prev[hazardId] ?? { description: "", owner: "", dueDate: "" }),
        ...patch
      }
    }));
  };

  const disableInputs = saving;

  return (
    <TuiPhaseLayout phase="ACTIONS">
      <div className="tui-columns">
        <TuiPanel
          eyebrow={t("ra.actions.assistantTitle")}
          title={t("ra.actions.assistantTitle")}
          subtitle={t("ra.actions.assistantDescription")}
          actions={(
            <button type="button" onClick={() => void handleExtractActions()} disabled={!assistantNotes.trim() || disableInputs}>
              {t("ra.actions.assistantAction")}
            </button>
          )}
        >
          <TuiFormField label={t("ra.actions.assistantTitle")} hint={t("ra.actions.assistantDescription")}>
            <textarea
              rows={6}
              value={assistantNotes}
              onChange={(event) => setAssistantNotes(event.target.value)}
              placeholder={t("ra.actions.assistantPlaceholder")}
              disabled={disableInputs}
            />
          </TuiFormField>
          {assistantStatus && <p className="tui-muted">{assistantStatus}</p>}
        </TuiPanel>

        <TuiPanel
          eyebrow={t("ra.actions.title")}
          title={t("ra.actions.title")}
          subtitle={t("ra.workspace.actionsDescription")}
        >
          {errorMessage && (
            <TuiBanner variant="error">
              {errorMessage}
            </TuiBanner>
          )}
          {actionStatus && <p className="tui-muted">{actionStatus}</p>}

          {raCase.hazards.length === 0 ? (
            <TuiEmptyState title={t("ra.actions.noHazards")} />
          ) : (
            <div className="tui-hazard-list">
              {hazardsByStep.map(({ step, index, hazards }) => (
                <div key={step.id} className="tui-hazard-step">
                  <div className="tui-hazard-step__header">
                    <strong>{t("ra.steps.newStep", { values: { index: index + 1 } })}</strong>
                    <span className="tui-muted">{step.activity}</span>
                  </div>

                  {hazards.map((hazard) => {
                    const actionsForHazard = actionsByHazard[hazard.id] ?? [];
                    const inlineDraft = inlineDrafts[hazard.id] ?? { description: "", owner: "", dueDate: "" };
                    return (
                      <div key={hazard.id} className="tui-hazard-item">
                        <div className="tui-hazard-item__header">
                          <strong>{hazard.label}</strong>
                        </div>
                        <div className="tui-action-list">
                          {actionsForHazard.length === 0 && (
                            <p className="tui-muted">{t("ra.actions.noActionsForHazard")}</p>
                          )}
                          {actionsForHazard.map((action, actionIndex) => {
                            const draft = actionDrafts[action.id] ?? {
                              description: action.description,
                              owner: action.owner ?? "",
                              dueDate: action.dueDate ? action.dueDate.slice(0, 10) : "",
                              status: action.status
                            };
                            return (
                              <div key={action.id} className="tui-action-item">
                                <div className="tui-action-item__header">
                                  <strong>{draft.description || action.description}</strong>
                                  <div className="tui-action-item__actions">
                                    <button
                                      type="button"
                                      onClick={() => handleReorder(hazard.id, action.id, "up")}
                                      disabled={disableInputs || actionIndex === 0}
                                    >
                                      {t("common.moveUp")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleReorder(hazard.id, action.id, "down")}
                                      disabled={disableInputs || actionIndex === actionsForHazard.length - 1}
                                    >
                                      {t("common.moveDown")}
                                    </button>
                                    <button
                                      type="button"
                                      className="tui-danger"
                                      onClick={() => void handleDeleteAction(action.id)}
                                      disabled={disableInputs}
                                    >
                                      {t("common.delete")}
                                    </button>
                                  </div>
                                </div>
                                <div className="tui-action-item__fields">
                                  <TuiFormField label={t("ra.actions.table.action")}>
                                    <input
                                      value={draft.description}
                                      onChange={(event) => updateActionDraft(action.id, { description: event.target.value })}
                                      onBlur={() => void handleUpdateAction(action.id)}
                                      placeholder={t("ra.actions.form.actionPlaceholder")}
                                      disabled={disableInputs}
                                    />
                                  </TuiFormField>
                                  <TuiFormField label={t("ra.actions.table.owner")}>
                                    <input
                                      value={draft.owner}
                                      onChange={(event) => updateActionDraft(action.id, { owner: event.target.value })}
                                      onBlur={() => void handleUpdateAction(action.id)}
                                      placeholder={t("ra.actions.form.ownerPlaceholder")}
                                      disabled={disableInputs}
                                    />
                                  </TuiFormField>
                                  <TuiFormField label={t("ra.actions.table.dueDate")}>
                                    <input
                                      type="date"
                                      value={draft.dueDate}
                                      onChange={(event) => updateActionDraft(action.id, { dueDate: event.target.value })}
                                      onBlur={() => void handleUpdateAction(action.id)}
                                      disabled={disableInputs}
                                    />
                                  </TuiFormField>
                                  <TuiFormField label={t("ra.actions.table.status")}>
                                    <select
                                      value={draft.status}
                                      onChange={(event) => void handleStatusChange(action.id, event.target.value)}
                                      disabled={disableInputs}
                                    >
                                      <option value="OPEN">{t("ra.actions.status.open")}</option>
                                      <option value="IN_PROGRESS">{t("ra.actions.status.inProgress")}</option>
                                      <option value="COMPLETE">{t("ra.actions.status.complete")}</option>
                                    </select>
                                  </TuiFormField>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="tui-action-add">
                          <TuiFormField label={t("ra.actions.footer.newAction")}>
                            <input
                              value={inlineDraft.description}
                              onChange={(event) => updateInlineDraft(hazard.id, { description: event.target.value })}
                              placeholder={t("ra.actions.form.inlinePlaceholder")}
                              disabled={disableInputs}
                            />
                          </TuiFormField>
                          <TuiFormField label={t("ra.actions.table.owner")}>
                            <input
                              value={inlineDraft.owner}
                              onChange={(event) => updateInlineDraft(hazard.id, { owner: event.target.value })}
                              placeholder={t("ra.actions.form.ownerPlaceholder")}
                              disabled={disableInputs}
                            />
                          </TuiFormField>
                          <TuiFormField label={t("ra.actions.table.dueDate")}>
                            <input
                              type="date"
                              value={inlineDraft.dueDate}
                              onChange={(event) => updateInlineDraft(hazard.id, { dueDate: event.target.value })}
                              disabled={disableInputs}
                            />
                          </TuiFormField>
                          <button type="button" onClick={() => void handleAddAction(hazard.id)} disabled={disableInputs}>
                            {t("ra.actions.footer.addAction")}
                          </button>
                        </div>
                      </div>
                    );
                  })}
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
