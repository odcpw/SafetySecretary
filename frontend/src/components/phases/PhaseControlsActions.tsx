import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { RiskAssessmentCase } from "@/types/riskAssessment";
import { AssistantPanel } from "@/components/common/AssistantPanel";
import { SaveStatus } from "@/components/common/SaveStatus";
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
import type { ControlHierarchy } from "@/types/riskAssessment";
import { useRaContext } from "@/contexts/RaContext";
import { useSaveStatus } from "@/hooks/useSaveStatus";
import { useI18n } from "@/i18n/I18nContext";

interface PhaseControlsActionsProps {
  raCase: RiskAssessmentCase;
  saving: boolean;
  onAddAction: (payload: { hazardId: string; description: string; owner?: string; dueDate?: string }) => Promise<void>;
  onUpdateAction: (
    actionId: string,
    patch: { description?: string; owner?: string | null; dueDate?: string | null; status?: string }
  ) => Promise<void>;
  onDeleteAction: (actionId: string) => Promise<void>;
  onExtractActions: (notes: string) => Promise<void>;
  onNext: () => Promise<void>;
  canAdvance?: boolean;
}

const buildActionDrafts = (caseData: RiskAssessmentCase) =>
  caseData.actions.reduce<Record<string, { description: string; owner: string; dueDate: string }>>((acc, action) => {
    acc[action.id] = {
      description: action.description ?? "",
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
  onDeleteAction,
  onExtractActions,
  onNext,
  canAdvance = true
}: PhaseControlsActionsProps) => {
  const { actions } = useRaContext();
  const [form, setForm] = useState({
    hazardId: raCase.hazards[0]?.id ?? "",
    description: "",
    owner: "",
    dueDate: ""
  });
  const [actionDrafts, setActionDrafts] = useState<Record<string, { description: string; owner: string; dueDate: string }>>(() =>
    buildActionDrafts(raCase)
  );
  const [inlineDrafts, setInlineDrafts] = useState<Record<string, { description: string; owner: string; dueDate: string }>>({});
  const [assistantNotes, setAssistantNotes] = useState("");
  const [assistantStatus, setAssistantStatus] = useState<string | null>(null);
  const { t, locale, formatDate } = useI18n();
  const { status, show, showSuccess, showError } = useSaveStatus();

  const stepNumberById = useMemo(() => new Map(raCase.steps.map((step, index) => [step.id, index + 1])), [raCase.steps]);
  const hazardsByStep = useMemo(() => {
    return raCase.steps.map((step) => ({
      step,
      hazards: raCase.hazards
        .filter((hazard) => hazard.stepId === step.id)
        .sort((a, b) => a.orderIndex - b.orderIndex)
    }));
  }, [raCase.hazards, raCase.steps]);

  const actionsByHazard = useMemo(() => {
    return raCase.actions.reduce<Record<string, RiskAssessmentCase["actions"]>>((acc, action) => {
      if (!action.hazardId) return acc;
      const hazardId = action.hazardId;
      acc[hazardId] = acc[hazardId] ?? [];
      acc[hazardId]!.push(action);
      return acc;
    }, {});
  }, [raCase.actions]);

  useEffect(() => {
    setActionDrafts(buildActionDrafts(raCase));
  }, [raCase]);

  const voiceLang = locale === "fr" ? "fr-FR" : locale === "de" ? "de-DE" : "en-US";

  const handleActionPatch = async (
    actionId: string,
    patch: { description?: string; owner?: string | null; dueDate?: string | null; status?: string },
    message = t("ra.actions.updated")
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
    show({ message: t("ra.actions.saving"), tone: "info" });
    try {
      await onUpdateAction(actionId, patch);
      showSuccess(message);
    } catch (err) {
      console.error(err);
      showError(
        err instanceof Error ? err.message : t("ra.actions.updateFailed"),
        () => void handleActionPatch(actionId, patch, message),
        undefined,
        t("common.retry")
      );
    }
  };

  const handleExtractActions = async () => {
    if (!assistantNotes.trim()) {
      return;
    }
    setAssistantStatus(t("ra.actions.requestingSuggestions"));
    try {
      await onExtractActions(assistantNotes);
      setAssistantNotes("");
      setAssistantStatus(t("ra.actions.suggestionsRequested"));
      setTimeout(() => setAssistantStatus(null), 2000);
    } catch (err) {
      console.error(err);
      setAssistantStatus(err instanceof Error ? err.message : t("ra.actions.suggestionsFailed"));
      setTimeout(() => setAssistantStatus(null), 5000);
    }
  };

  const submitAction = async (payload: { hazardId: string; description: string; owner?: string; dueDate?: string }) => {
    show({ message: t("ra.actions.adding"), tone: "info" });
    try {
      await onAddAction(payload);
      setForm((prev) => ({ ...prev, description: "", owner: "", dueDate: "" }));
      showSuccess(t("ra.actions.added"), 2000);
    } catch (err) {
      console.error(err);
      showError(
        err instanceof Error ? err.message : t("ra.actions.addFailed"),
        () => void submitAction(payload),
        undefined,
        t("common.retry")
      );
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.hazardId || !form.description.trim()) {
      return;
    }
    const payload = {
      hazardId: form.hazardId,
      description: form.description,
      owner: form.owner || undefined,
      dueDate: form.dueDate || undefined
    };
    await submitAction(payload);
  };

  const handleDeleteAction = async (actionId: string) => {
    show({ message: t("ra.actions.deleting"), tone: "info" });
    try {
      await onDeleteAction(actionId);
      showSuccess(t("ra.actions.deleted"));
    } catch (err) {
      console.error(err);
      showError(
        err instanceof Error ? err.message : t("ra.actions.deleteFailed"),
        () => void handleDeleteAction(actionId),
        undefined,
        t("common.retry")
      );
    }
  };

  const handleInlineAdd = async (
    hazardId: string,
    draft: { description: string; owner: string; dueDate: string }
  ) => {
    const payload = {
      hazardId,
      description: draft.description,
      owner: draft.owner || undefined,
      dueDate: draft.dueDate || undefined
    };
    show({ message: t("ra.actions.adding"), tone: "info" });
    try {
      await onAddAction(payload);
      setInlineDrafts((prev) => ({
        ...prev,
        [hazardId]: { description: "", owner: "", dueDate: "" }
      }));
      showSuccess(t("ra.actions.added"), 2000);
    } catch (err) {
      console.error(err);
      showError(
        err instanceof Error ? err.message : t("ra.actions.addFailed"),
        () => void handleInlineAdd(hazardId, draft),
        undefined,
        t("common.retry")
      );
    }
  };

  return (
    <div className="space-y-6">
      <AssistantPanel
        title={t("ra.actions.assistantTitle")}
        description={t("ra.actions.assistantDescription")}
        value={assistantNotes}
        placeholder={t("ra.actions.assistantPlaceholder")}
        primaryLabel={t("ra.actions.assistantAction")}
        status={assistantStatus}
        disabled={saving}
        enableVoice
        voiceLang={voiceLang}
        onChange={setAssistantNotes}
        onSubmit={handleExtractActions}
        onClear={() => setAssistantNotes("")}
      />

      <section className="rounded-lg border border-slate-200 p-4 space-y-3">
        <header className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">{t("ra.actions.title")}</h3>
          <SaveStatus status={status} />
        </header>
        {raCase.hazards.length === 0 ? (
          <div className="text-sm text-slate-500">{t("ra.actions.noHazards")}</div>
        ) : (
          <div className="space-y-6">
            {raCase.actions.length === 0 && (
              <div className="text-sm text-slate-500">{t("ra.actions.noActions")}</div>
            )}
            {hazardsByStep.map(({ step, hazards }) => {
              const stepIndex = stepNumberById.get(step.id) ?? 0;
              return (
                <section key={step.id} className="space-y-3">
                  <header>
                    <h4 className="text-base font-semibold text-slate-900">
                      {stepIndex ? `${stepIndex}. ` : ""}{step.activity}
                    </h4>
                    {step.description && <p className="text-sm text-slate-500">{step.description}</p>}
                  </header>
                  {hazards.map((hazard, hazardIndex) => {
                    const hazardNumber = stepIndex ? `${stepIndex}.${hazardIndex + 1}` : `${hazardIndex + 1}`;
                    const hazardActions = [...(actionsByHazard[hazard.id] ?? [])].sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));
                    const inlineDraft = inlineDrafts[hazard.id] ?? { description: "", owner: "", dueDate: "" };

                    const hierarchyBadge: Record<ControlHierarchy, string> = {
                      SUBSTITUTION: "S",
                      TECHNICAL: "T",
                      ORGANIZATIONAL: "O",
                      PPE: "P"
                    };

                    const handleMove = async (actionId: string, direction: -1 | 1) => {
                      const idx = hazardActions.findIndex((a) => a.id === actionId);
                      const nextIdx = idx + direction;
                      if (idx < 0 || nextIdx < 0 || nextIdx >= hazardActions.length) {
                        return;
                      }
                      const reordered = [...hazardActions];
                      const [moved] = reordered.splice(idx, 1);
                      reordered.splice(nextIdx, 0, moved!);
                      show({ message: t("ra.actions.reordering"), tone: "info" });
                      try {
                        await actions.reorderActionsForHazard(hazard.id, reordered.map((a) => a.id));
                        showSuccess(t("ra.actions.reordered"));
                      } catch (err) {
                        console.error(err);
                        showError(
                          err instanceof Error ? err.message : t("ra.actions.reorderFailed"),
                          () => void handleMove(actionId, direction),
                          undefined,
                          t("common.retry")
                        );
                      }
                    };

                    return (
                      <div key={hazard.id} className="rounded-lg border border-slate-200 p-3">
                        <div className="mb-3">
                          <div className="font-semibold text-slate-900">{hazardNumber} {hazard.label}</div>
                          {hazard.description && <div className="text-sm text-slate-600">{hazard.description}</div>}
                        </div>
                        {hazardActions.length === 0 && (
                          <div className="text-sm text-slate-500 mb-3">{t("ra.actions.noActionsForHazard")}</div>
                        )}
                        <div className="sheet-table-wrapper">
                          <SheetTable>
                            <colgroup>
                              <col className="sheet-col-label" />
                              <col className="sheet-col-label" />
                              <col className="sheet-col-description" />
                              <col className="sheet-col-label" />
                              <col className="sheet-col-label" />
                              <col className="sheet-col-label" />
                              <col className="sheet-col-label" />
                              <col className="sheet-col-label" />
                            </colgroup>
                            <SheetHead>
                              <SheetRow>
                                <SheetHeaderCell>{t("ra.common.number")}</SheetHeaderCell>
                                <SheetHeaderCell>{t("ra.actions.table.move")}</SheetHeaderCell>
                                <SheetHeaderCell>{t("ra.actions.table.action")}</SheetHeaderCell>
                                <SheetHeaderCell>{t("ra.actions.table.hierarchy")}</SheetHeaderCell>
                                <SheetHeaderCell>{t("ra.actions.table.owner")}</SheetHeaderCell>
                                <SheetHeaderCell>{t("ra.actions.table.dueDate")}</SheetHeaderCell>
                                <SheetHeaderCell>{t("ra.actions.table.status")}</SheetHeaderCell>
                                <SheetHeaderCell>{t("ra.actions.table.remove")}</SheetHeaderCell>
                              </SheetRow>
                            </SheetHead>
                            <SheetBody>
                              {hazardActions.map((action, actionIndex) => {
                                const actionNumber = `${hazardNumber}.${actionIndex + 1}`;
                                const drafts = actionDrafts[action.id] ?? {
                                  description: action.description ?? "",
                                  owner: action.owner ?? "",
                                  dueDate: action.dueDate ?? ""
                                };
                                const linkedControl = action.controlId
                                  ? hazard.proposedControls.find((control) => control.id === action.controlId) ?? null
                                  : null;
                                return (
                                  <SheetRow key={action.id}>
                                    <SheetCell>
                                      <span className="text-sm text-slate-600">{actionNumber}</span>
                                    </SheetCell>
                                    <SheetCell>
                                      <div className="flex flex-col gap-1">
                                        <button type="button" className="btn-outline" disabled={saving || actionIndex === 0} onClick={() => void handleMove(action.id, -1)}>
                                          ↑
                                        </button>
                                        <button type="button" className="btn-outline" disabled={saving || actionIndex === hazardActions.length - 1} onClick={() => void handleMove(action.id, 1)}>
                                          ↓
                                        </button>
                                      </div>
                                    </SheetCell>
                                    <SheetCell>
                                      <SheetInput
                                        value={drafts.description}
                                        onChange={(event) =>
                                          setActionDrafts((prev) => ({
                                            ...prev,
                                            [action.id]: { ...(prev[action.id] ?? drafts), description: event.target.value }
                                          }))
                                        }
                                        onBlur={() =>
                                          handleActionPatch(action.id, {
                                            description: (actionDrafts[action.id]?.description ?? "").trim()
                                          })
                                        }
                                        placeholder={t("ra.actions.form.actionPlaceholder")}
                                      />
                                      {action.status === "COMPLETE" && (action.updatedAt || action.createdAt) && (
                                        <div className="text-xs text-slate-500">
                                          {t("ra.actions.doneOn", {
                                            values: { date: formatDate(action.updatedAt ?? action.createdAt ?? "") }
                                          })}
                                        </div>
                                      )}
                                    </SheetCell>
                                    <SheetCell>
                                      {linkedControl?.hierarchy ? (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-slate-200 text-slate-700">
                                          {hierarchyBadge[linkedControl.hierarchy]}
                                        </span>
                                      ) : (
                                        <span className="text-slate-400">{t("common.noData")}</span>
                                      )}
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
                                        placeholder={t("ra.actions.form.ownerPlaceholder")}
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
                                        <option value="OPEN">{t("ra.actions.status.open")}</option>
                                        <option value="IN_PROGRESS">{t("ra.actions.status.inProgress")}</option>
                                        <option value="COMPLETE">{t("ra.actions.status.complete")}</option>
                                      </SheetSelect>
                                    </SheetCell>
                                    <SheetCell>
                                      <SheetButton
                                        variant="danger"
                                        onClick={() => {
                                          if (window.confirm(t("ra.actions.confirmDelete"))) {
                                            void handleDeleteAction(action.id);
                                          }
                                        }}
                                        disabled={saving}
                                      >
                                        {t("common.delete")}
                                      </SheetButton>
                                    </SheetCell>
                                  </SheetRow>
                                );
                              })}
                            </SheetBody>
                          </SheetTable>
                        </div>
                        <div className="mt-3">
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                            {t("ra.actions.addInline")}
                          </div>
                          <div className="grid gap-2 md:grid-cols-[2fr_1fr_1fr_auto]">
                            <SheetInput
                              value={inlineDraft.description}
                              onChange={(event) =>
                                setInlineDrafts((prev) => ({
                                  ...prev,
                                  [hazard.id]: {
                                    ...(prev[hazard.id] ?? inlineDraft),
                                    description: event.target.value
                                  }
                                }))
                              }
                              placeholder={t("ra.actions.form.inlinePlaceholder")}
                            />
                            <SheetInput
                              value={inlineDraft.owner}
                              onChange={(event) =>
                                setInlineDrafts((prev) => ({
                                  ...prev,
                                  [hazard.id]: {
                                    ...(prev[hazard.id] ?? inlineDraft),
                                    owner: event.target.value
                                  }
                                }))
                              }
                              placeholder={t("ra.actions.form.ownerPlaceholder")}
                            />
                            <SheetInput
                              type="date"
                              value={inlineDraft.dueDate}
                              onChange={(event) =>
                                setInlineDrafts((prev) => ({
                                  ...prev,
                                  [hazard.id]: {
                                    ...(prev[hazard.id] ?? inlineDraft),
                                    dueDate: event.target.value
                                  }
                                }))
                              }
                            />
                            <SheetButton
                              variant="primary"
                              disabled={saving || !inlineDraft.description.trim()}
                              onClick={() => void handleInlineAdd(hazard.id, { ...inlineDraft })}
                            >
                              {t("common.add")}
                            </SheetButton>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </div>
        )}

        <div className="mt-6 sheet-table-wrapper">
          <SheetTable>
            <colgroup>
              <col className="sheet-col-description" />
              <col className="sheet-col-label" />
              <col className="sheet-col-label" />
              <col className="sheet-col-label" />
            </colgroup>
            <SheetHead>
              <SheetRow>
                <SheetHeaderCell>{t("ra.actions.footer.newAction")}</SheetHeaderCell>
                <SheetHeaderCell>{t("ra.actions.table.owner")}</SheetHeaderCell>
                <SheetHeaderCell>{t("ra.actions.table.dueDate")}</SheetHeaderCell>
                <SheetHeaderCell />
              </SheetRow>
            </SheetHead>
            <SheetFooter>
              <SheetAddRow>
                <SheetCell>
                  <div className="space-y-2">
                    <SheetSelect
                      value={form.hazardId}
                      onChange={(event) => setForm((prev) => ({ ...prev, hazardId: event.target.value }))}
                    >
                      <option value="">{t("ra.actions.form.selectHazard")}</option>
                      {raCase.hazards.map((hazard) => {
                        const stepIndex = stepNumberById.get(hazard.stepId) ?? 0;
                        const hazardIndex = (raCase.hazards
                          .filter((h) => h.stepId === hazard.stepId)
                          .sort((a, b) => a.orderIndex - b.orderIndex)
                          .findIndex((h) => h.id === hazard.id)) + 1;
                        const prefix = stepIndex ? `${stepIndex}.${hazardIndex} ` : "";
                        return (
                          <option key={hazard.id} value={hazard.id}>
                            {prefix}{hazard.label}
                          </option>
                        );
                      })}
                    </SheetSelect>
                    <SheetInput
                      value={form.description}
                      onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                      placeholder={t("ra.actions.form.descriptionPlaceholder")}
                    />
                  </div>
                </SheetCell>
                <SheetCell>
                  <SheetInput
                    value={form.owner}
                    onChange={(event) => setForm((prev) => ({ ...prev, owner: event.target.value }))}
                    placeholder={t("ra.actions.form.ownerPlaceholder")}
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
                    {t("ra.actions.footer.addAction")}
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
            {t("common.continue")}
          </button>
        </div>
      )}
    </div>
  );
};
