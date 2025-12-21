import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AssistantPanel } from "@/components/common/AssistantPanel";
import { UserMenu } from "@/components/common/UserMenu";
import {
  SheetAddRow,
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
import { useIncidentContext } from "@/contexts/IncidentContext";
import { TimelineAttachmentsPanel } from "@/components/incident/TimelineAttachmentsPanel";
import type {
  IncidentActionType,
  IncidentAssistantDraft,
  IncidentTimelineConfidence
} from "@/types/incident";
import { useI18n } from "@/i18n/I18nContext";

const CONFIDENCE_LEVELS: IncidentTimelineConfidence[] = ["CONFIRMED", "LIKELY", "UNCLEAR"];
const ACTION_TYPES: IncidentActionType[] = ["ENGINEERING", "ORGANISATIONAL", "PPE", "TRAINING"];

const normalizeAssistantDraft = (draft: unknown): IncidentAssistantDraft | null => {
  if (!draft || typeof draft !== "object") return null;
  const raw = draft as Record<string, unknown>;
  const facts = Array.isArray(raw.facts)
    ? raw.facts
        .map((fact) => (typeof (fact as any)?.text === "string" ? { text: (fact as any).text } : null))
        .filter((fact): fact is { text: string } => Boolean(fact))
    : [];
  const timeline = Array.isArray(raw.timeline)
    ? raw.timeline
        .map((event) => {
          if (typeof (event as any)?.text !== "string") return null;
          const confidence = CONFIDENCE_LEVELS.includes((event as any).confidence)
            ? ((event as any).confidence as IncidentTimelineConfidence)
            : "LIKELY";
          return {
            timeLabel: typeof (event as any)?.timeLabel === "string" ? (event as any).timeLabel : null,
            text: (event as any).text,
            confidence
          };
        })
        .filter(
          (event): event is { timeLabel?: string | null; text: string; confidence?: IncidentTimelineConfidence } =>
            Boolean(event)
        )
    : [];
  const clarifications = Array.isArray(raw.clarifications)
    ? raw.clarifications
        .map((item) => {
          if (typeof item === "string") {
            return { question: item, rationale: null, answer: null, targetField: null };
          }
          if (typeof (item as any)?.question !== "string") return null;
          return {
            question: (item as any).question,
            rationale: typeof (item as any)?.rationale === "string" ? (item as any).rationale : null,
            answer: typeof (item as any)?.answer === "string" ? (item as any).answer : null,
            targetField: typeof (item as any)?.targetField === "string" ? (item as any).targetField : null
          };
        })
        .filter(
          (item): item is IncidentAssistantDraft["clarifications"][number] => Boolean(item)
        )
    : [];

  if (!facts.length && !timeline.length && !clarifications.length) {
    return null;
  }
  return { facts, timeline, clarifications };
};

type DraftDeviation = {
  id?: string;
  timelineEventId?: string | null;
  expected?: string | null;
  actual?: string | null;
  changeObserved?: string | null;
};

type DraftCause = {
  id?: string;
  deviationId: string;
  statement: string;
};

type DraftAction = {
  id?: string;
  causeId: string;
  description: string;
  ownerRole?: string | null;
  dueDate?: string | null;
  actionType?: IncidentActionType | null;
};

export const IncidentEditor = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { incidentCase, saving, actions } = useIncidentContext();
  const [personRole, setPersonRole] = useState("");
  const [personName, setPersonName] = useState("");
  const [accountDrafts, setAccountDrafts] = useState<Record<string, string>>({});
  const [accountStatus, setAccountStatus] = useState<string | null>(null);
  const [timelineDrafts, setTimelineDrafts] = useState(
    incidentCase.timelineEvents.map((event) => ({
      id: event.id,
      timeLabel: event.timeLabel ?? "",
      text: event.text,
      confidence: event.confidence
    }))
  );
  const [timelineStatus, setTimelineStatus] = useState<string | null>(null);
  const [assistantNarrative, setAssistantNarrative] = useState(incidentCase.assistantNarrative ?? "");
  const [assistantDraft, setAssistantDraft] = useState<IncidentAssistantDraft | null>(
    normalizeAssistantDraft(incidentCase.assistantDraft)
  );
  const [assistantStatus, setAssistantStatus] = useState<string | null>(null);
  const [assistantSaveStatus, setAssistantSaveStatus] = useState<string | null>(null);
  const [assistantApplyStatus, setAssistantApplyStatus] = useState<string | null>(null);
  const [consistencyIssues, setConsistencyIssues] = useState<string[]>([]);
  const [deviationDrafts, setDeviationDrafts] = useState<DraftDeviation[]>([]);
  const [causeDrafts, setCauseDrafts] = useState<DraftCause[]>([]);
  const [actionDrafts, setActionDrafts] = useState<DraftAction[]>([]);
  const incidentTypeLabels = {
    NEAR_MISS: t("incident.types.nearMiss"),
    FIRST_AID: t("incident.types.firstAid"),
    LOST_TIME: t("incident.types.lostTime"),
    PROPERTY_DAMAGE: t("incident.types.propertyDamage")
  } as const;
  const confidenceLabels = {
    CONFIRMED: t("incident.timeline.confidence.confirmed"),
    LIKELY: t("incident.timeline.confidence.likely"),
    UNCLEAR: t("incident.timeline.confidence.unclear")
  } as const;
  const actionTypeLabels = {
    ENGINEERING: t("incident.actions.types.engineering"),
    ORGANISATIONAL: t("incident.actions.types.organizational"),
    PPE: t("incident.actions.types.ppe"),
    TRAINING: t("incident.actions.types.training")
  } as const;
  const assistantDraftUpdatedLabel = incidentCase.assistantDraftUpdatedAt
    ? new Date(incidentCase.assistantDraftUpdatedAt).toLocaleString()
    : null;

  const accountsByPerson = useMemo(() => {
    const grouped = new Map<string, typeof incidentCase.accounts>();
    incidentCase.persons.forEach((person) => grouped.set(person.id, []));
    incidentCase.accounts.forEach((account) => {
      const list = grouped.get(account.personId) ?? [];
      list.push(account);
      grouped.set(account.personId, list);
    });
    return grouped;
  }, [incidentCase.accounts, incidentCase.persons]);

  useEffect(() => {
    setTimelineDrafts(
      incidentCase.timelineEvents.map((event) => ({
        id: event.id,
        timeLabel: event.timeLabel ?? "",
        text: event.text,
        confidence: event.confidence
      }))
    );

    setDeviationDrafts(
      incidentCase.deviations.map((deviation) => ({
        id: deviation.id,
        timelineEventId: deviation.timelineEventId,
        expected: deviation.expected,
        actual: deviation.actual,
        changeObserved: deviation.changeObserved
      }))
    );

    setCauseDrafts(
      incidentCase.deviations.flatMap((deviation) =>
        deviation.causes.map((cause) => ({
          id: cause.id,
          deviationId: deviation.id,
          statement: cause.statement
        }))
      )
    );

    setActionDrafts(
      incidentCase.deviations.flatMap((deviation) =>
        deviation.causes.flatMap((cause) =>
          cause.actions.map((action) => ({
            id: action.id,
            causeId: cause.id,
            description: action.description,
            ownerRole: action.ownerRole,
            dueDate: action.dueDate,
            actionType: action.actionType
          }))
        )
      )
    );
    setAssistantNarrative(incidentCase.assistantNarrative ?? "");
    setAssistantDraft(normalizeAssistantDraft(incidentCase.assistantDraft));
  }, [incidentCase]);

  const handleAddPerson = async () => {
    if (!personRole.trim()) return;
    await actions.addPerson(personRole.trim(), personName.trim() || null);
    setPersonRole("");
    setPersonName("");
  };

  const handleAddAccount = async (personId: string) => {
    await actions.addAccount(personId, "");
  };

  const handleSaveStatement = async (accountId: string) => {
    const draft = accountDrafts[accountId] ?? "";
    setAccountStatus(t("incident.witness.status.saving"));
    await actions.updateAccount(accountId, draft);
    setAccountStatus(null);
  };

  const handleExtractAccount = async (accountId: string) => {
    const draft = accountDrafts[accountId] ?? "";
    if (!draft.trim()) return;
    setAccountStatus(t("incident.witness.status.extracting"));
    await actions.extractAccount(accountId, draft);
    setAccountStatus(null);
  };

  const ensureAssistantDraft = (draft: IncidentAssistantDraft | null) =>
    draft ?? { facts: [], timeline: [], clarifications: [] };

  const updateAssistantDraftState = (
    updater: (draft: IncidentAssistantDraft) => IncidentAssistantDraft
  ) => {
    setAssistantDraft((prev) => updater(ensureAssistantDraft(prev)));
  };

  const handleExtractNarrative = async () => {
    if (!assistantNarrative.trim()) return;
    setAssistantStatus(t("incident.assistant.status.extracting"));
    try {
      await actions.extractNarrative(assistantNarrative.trim());
      setAssistantStatus(t("incident.assistant.status.extracted"));
      setTimeout(() => setAssistantStatus(null), 2500);
    } catch (error) {
      setAssistantStatus(error instanceof Error ? error.message : t("incident.assistant.status.failed"));
    }
  };

  const handleSaveAssistantDraft = async () => {
    setAssistantSaveStatus(t("incident.assistant.status.savingDraft"));
    try {
      await actions.updateAssistantDraft(assistantDraft, assistantNarrative.trim() || null);
      setAssistantSaveStatus(t("incident.assistant.status.savedDraft"));
      setTimeout(() => setAssistantSaveStatus(null), 2500);
    } catch (error) {
      setAssistantSaveStatus(error instanceof Error ? error.message : t("incident.assistant.status.saveFailed"));
    }
  };

  const handleApplyAssistantDraft = async () => {
    if (!assistantDraft || assistantDraft.timeline.length === 0) return;
    if (!confirm(t("incident.assistant.confirmApply"))) return;
    setAssistantApplyStatus(t("incident.assistant.status.applying"));
    try {
      await actions.applyAssistantDraft(
        assistantDraft.timeline.map((event, index) => ({
          orderIndex: index,
          timeLabel: event.timeLabel ?? null,
          text: event.text,
          confidence: event.confidence ?? "LIKELY"
        }))
      );
      setAssistantApplyStatus(t("incident.assistant.status.applied"));
      setTimeout(() => setAssistantApplyStatus(null), 2500);
    } catch (error) {
      setAssistantApplyStatus(error instanceof Error ? error.message : t("incident.assistant.status.applyFailed"));
    }
  };

  const handleAddAssistantFact = () => {
    updateAssistantDraftState((draft) => ({
      ...draft,
      facts: [...draft.facts, { text: "" }]
    }));
  };

  const handleUpdateAssistantFact = (index: number, value: string) => {
    updateAssistantDraftState((draft) => ({
      ...draft,
      facts: draft.facts.map((fact, idx) => (idx === index ? { text: value } : fact))
    }));
  };

  const handleRemoveAssistantFact = (index: number) => {
    updateAssistantDraftState((draft) => ({
      ...draft,
      facts: draft.facts.filter((_, idx) => idx !== index)
    }));
  };

  const handleAddAssistantTimeline = () => {
    updateAssistantDraftState((draft) => ({
      ...draft,
      timeline: [...draft.timeline, { timeLabel: "", text: "", confidence: "LIKELY" }]
    }));
  };

  const handleUpdateAssistantTimeline = (
    index: number,
    field: "timeLabel" | "text" | "confidence",
    value: string
  ) => {
    updateAssistantDraftState((draft) => ({
      ...draft,
      timeline: draft.timeline.map((event, idx) =>
        idx === index
          ? {
              ...event,
              [field]: field === "confidence" ? (value as IncidentTimelineConfidence) : value
            }
          : event
      )
    }));
  };

  const handleRemoveAssistantTimeline = (index: number) => {
    updateAssistantDraftState((draft) => ({
      ...draft,
      timeline: draft.timeline.filter((_, idx) => idx !== index)
    }));
  };

  const handleMoveAssistantTimeline = (index: number, direction: "up" | "down") => {
    updateAssistantDraftState((draft) => {
      const next = [...draft.timeline];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) {
        return draft;
      }
      [next[index], next[target]] = [next[target]!, next[index]!];
      return { ...draft, timeline: next };
    });
  };

  const handleUpdateClarification = (index: number, answer: string) => {
    updateAssistantDraftState((draft) => ({
      ...draft,
      clarifications: draft.clarifications.map((item, idx) =>
        idx === index ? { ...item, answer } : item
      )
    }));
  };

  const handleMergeTimeline = async () => {
    setTimelineStatus(t("incident.timeline.status.merging"));
    await actions.mergeTimeline();
    setTimelineStatus(null);
  };

  const handleSaveTimeline = async () => {
    setTimelineStatus(t("incident.timeline.status.saving"));
    await actions.saveTimeline(
      timelineDrafts.map((event, index) => ({
        id: event.id,
        orderIndex: index,
        timeLabel: event.timeLabel || null,
        text: event.text,
        confidence: event.confidence
      }))
    );
    setTimelineStatus(null);
  };

  const handleCheckConsistency = async () => {
    setTimelineStatus(t("incident.timeline.status.checking"));
    const result = await actions.checkConsistency();
    const issues = Array.isArray((result as any)?.issues)
      ? (result as any).issues.map((issue: any) => issue.description).filter(Boolean)
      : [];
    setConsistencyIssues(issues);
    setTimelineStatus(null);
  };

  const handleSaveDeviations = async () => {
    await actions.saveDeviations(
      deviationDrafts.map((deviation, index) => ({
        id: deviation.id,
        timelineEventId: deviation.timelineEventId ?? null,
        orderIndex: index,
        expected: deviation.expected ?? null,
        actual: deviation.actual ?? null,
        changeObserved: deviation.changeObserved ?? null
      }))
    );
  };

  const handleSaveCauses = async () => {
    await actions.saveCauses(
      causeDrafts.map((cause, index) => ({
        id: cause.id,
        deviationId: cause.deviationId,
        orderIndex: index,
        statement: cause.statement
      }))
    );
  };

  const handleSaveActions = async () => {
    await actions.saveActions(
      actionDrafts.map((action, index) => ({
        id: action.id,
        causeId: action.causeId,
        orderIndex: index,
        description: action.description,
        ownerRole: action.ownerRole ?? null,
        dueDate: action.dueDate ?? null,
        actionType: action.actionType ?? null
      }))
    );
  };

  const timelineOptions = incidentCase.timelineEvents.map((event) => {
    const timeLabel = event.timeLabel
      ? event.timeLabel
      : t("incident.timeline.untimedLabel", { values: { index: event.orderIndex + 1 } });
    return {
      id: event.id,
      label: t("incident.timeline.optionLabel", { values: { time: timeLabel, text: event.text } })
    };
  });

  const deviationOptions = incidentCase.deviations.map((deviation, index) => ({
    id: deviation.id,
    label: deviation.changeObserved
      ? deviation.changeObserved
      : t("incident.deviations.defaultLabel", { values: { index: index + 1 } })
  }));

  const causeOptions = incidentCase.deviations.flatMap((deviation) =>
    deviation.causes.map((cause) => ({
      id: cause.id,
      label: cause.statement
    }))
  );

  return (
    <div className="workspace-shell">
      <header className="workspace-topbar">
        <div className="workspace-topbar__summary">
          <p className="text-label">{t("workspace.incidentWorkspace")}</p>
          <h1>{incidentCase.title}</h1>
          <p>
            {incidentCase.location || t("workspace.locationPending")} · {incidentTypeLabels[incidentCase.incidentType]}
          </p>
          {saving && <p className="text-saving">{t("workspace.saving")}</p>}
        </div>
        <div className="workspace-topbar__actions">
          <button type="button" className="btn-outline" onClick={() => navigate("/incidents")}>
            {t("common.back")}
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={() => window.open(`/api/incident-cases/${incidentCase.id}/export/pdf`, "_blank", "noopener")}
          >
            {t("common.exportPdf")}
          </button>
          <UserMenu />
        </div>
      </header>

      <main className="workspace-main">
        <div className="workspace-main__inner">
          <section className="workspace-phase-panel">
            <AssistantPanel
              title={t("incident.assistant.title")}
              description={t("incident.assistant.subtitle")}
              value={assistantNarrative}
              placeholder={t("incident.assistant.placeholder")}
              primaryLabel={t("incident.assistant.extract")}
              status={assistantStatus ?? undefined}
              enableVoice
              onChange={setAssistantNarrative}
              onSubmit={handleExtractNarrative}
              onClear={() => setAssistantNarrative("")}
            />
          </section>

          {assistantDraft && (
            <>
              <section className="workspace-phase-panel">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2>{t("incident.assistant.facts.title")}</h2>
                    <p className="text-sm text-slate-600">{t("incident.assistant.facts.subtitle")}</p>
                  </div>
                  <button type="button" className="btn-outline" onClick={handleAddAssistantFact}>
                    {t("incident.assistant.facts.add")}
                  </button>
                </div>
                {assistantDraftUpdatedLabel && (
                  <p className="text-xs text-slate-500">
                    {t("incident.assistant.draftUpdated", {
                      values: {
                        date: assistantDraftUpdatedLabel
                      }
                    })}
                  </p>
                )}

                <SheetTable>
                  <SheetHead>
                    <SheetRow>
                      <SheetHeaderCell>{t("incident.assistant.facts.table.fact")}</SheetHeaderCell>
                      <SheetHeaderCell>{t("incident.assistant.facts.table.actions")}</SheetHeaderCell>
                    </SheetRow>
                  </SheetHead>
                  <SheetBody>
                    {assistantDraft.facts.map((fact, index) => (
                      <SheetRow key={`fact-${index}`}>
                        <SheetCell>
                          <SheetTextarea
                            value={fact.text}
                            onChange={(event) => handleUpdateAssistantFact(index, event.target.value)}
                            placeholder={t("incident.assistant.facts.placeholder")}
                          />
                        </SheetCell>
                        <SheetCell className="sheet-cell-actions">
                          <SheetButton variant="danger" onClick={() => handleRemoveAssistantFact(index)}>
                            {t("common.remove")}
                          </SheetButton>
                        </SheetCell>
                      </SheetRow>
                    ))}
                    {assistantDraft.facts.length === 0 && (
                      <SheetRow>
                        <SheetCell colSpan={2} className="sheet-empty-cell">
                          {t("incident.assistant.facts.empty")}
                        </SheetCell>
                      </SheetRow>
                    )}
                  </SheetBody>
                </SheetTable>
              </section>

              <section className="workspace-phase-panel">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2>{t("incident.assistant.timeline.title")}</h2>
                    <p className="text-sm text-slate-600">{t("incident.assistant.timeline.subtitle")}</p>
                  </div>
                  <button type="button" className="btn-outline" onClick={handleAddAssistantTimeline}>
                    {t("incident.assistant.timeline.add")}
                  </button>
                </div>

                <SheetTable>
                  <SheetHead>
                    <SheetRow>
                      <SheetHeaderCell>{t("incident.timeline.table.time")}</SheetHeaderCell>
                      <SheetHeaderCell>{t("incident.timeline.table.event")}</SheetHeaderCell>
                      <SheetHeaderCell>{t("incident.timeline.table.confidence")}</SheetHeaderCell>
                      <SheetHeaderCell>{t("incident.timeline.table.actions")}</SheetHeaderCell>
                    </SheetRow>
                  </SheetHead>
                  <SheetBody>
                    {assistantDraft.timeline.map((event, index) => (
                      <SheetRow key={`assistant-event-${index}`}>
                        <SheetCell>
                          <SheetInput
                            value={event.timeLabel ?? ""}
                            onChange={(eventInput) =>
                              handleUpdateAssistantTimeline(index, "timeLabel", eventInput.target.value)
                            }
                            placeholder={t("incident.timeline.timePlaceholder")}
                          />
                        </SheetCell>
                        <SheetCell>
                          <SheetTextarea
                            value={event.text}
                            onChange={(eventInput) =>
                              handleUpdateAssistantTimeline(index, "text", eventInput.target.value)
                            }
                            placeholder={t("incident.timeline.eventPlaceholder")}
                          />
                        </SheetCell>
                        <SheetCell>
                          <SheetSelect
                            value={event.confidence ?? "LIKELY"}
                            onChange={(eventInput) =>
                              handleUpdateAssistantTimeline(index, "confidence", eventInput.target.value)
                            }
                          >
                            {CONFIDENCE_LEVELS.map((level) => (
                              <option key={level} value={level}>
                                {confidenceLabels[level]}
                              </option>
                            ))}
                          </SheetSelect>
                        </SheetCell>
                        <SheetCell className="sheet-cell-actions">
                          <div className="sheet-actions-grid">
                            <SheetButton
                              variant="icon"
                              onClick={() => handleMoveAssistantTimeline(index, "up")}
                              disabled={index === 0}
                              title={t("common.moveUp")}
                              aria-label={t("common.moveUp")}
                            >
                              ^
                            </SheetButton>
                            <SheetButton
                              variant="icon"
                              onClick={() => handleMoveAssistantTimeline(index, "down")}
                              disabled={index === assistantDraft.timeline.length - 1}
                              title={t("common.moveDown")}
                              aria-label={t("common.moveDown")}
                            >
                              v
                            </SheetButton>
                            <SheetButton variant="danger" onClick={() => handleRemoveAssistantTimeline(index)}>
                              {t("common.remove")}
                            </SheetButton>
                          </div>
                        </SheetCell>
                      </SheetRow>
                    ))}
                    {assistantDraft.timeline.length === 0 && (
                      <SheetRow>
                        <SheetCell colSpan={4} className="sheet-empty-cell">
                          {t("incident.assistant.timeline.empty")}
                        </SheetCell>
                      </SheetRow>
                    )}
                  </SheetBody>
                </SheetTable>

                <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {t("incident.assistant.timeline.currentTitle")}
                  </h3>
                  {incidentCase.timelineEvents.length > 0 ? (
                    <>
                      <p className="text-sm text-slate-600">
                        {t("incident.assistant.timeline.currentSubtitle", {
                          values: { count: incidentCase.timelineEvents.length }
                        })}
                      </p>
                      <SheetTable>
                        <SheetHead>
                          <SheetRow>
                            <SheetHeaderCell>{t("incident.timeline.table.time")}</SheetHeaderCell>
                            <SheetHeaderCell>{t("incident.timeline.table.event")}</SheetHeaderCell>
                            <SheetHeaderCell>{t("incident.timeline.table.confidence")}</SheetHeaderCell>
                          </SheetRow>
                        </SheetHead>
                        <SheetBody>
                          {incidentCase.timelineEvents.map((event) => (
                            <SheetRow key={`current-event-${event.id}`}>
                              <SheetCell>
                                {event.timeLabel ??
                                  t("incident.timeline.untimedLabel", { values: { index: event.orderIndex + 1 } })}
                              </SheetCell>
                              <SheetCell>{event.text}</SheetCell>
                              <SheetCell>{confidenceLabels[event.confidence]}</SheetCell>
                            </SheetRow>
                          ))}
                        </SheetBody>
                      </SheetTable>
                    </>
                  ) : (
                    <p className="text-sm text-slate-500">{t("incident.assistant.timeline.currentEmpty")}</p>
                  )}
                </div>
              </section>

              <section className="workspace-phase-panel">
                <div>
                  <h2>{t("incident.assistant.clarifications.title")}</h2>
                  <p className="text-sm text-slate-600">{t("incident.assistant.clarifications.subtitle")}</p>
                </div>

                <SheetTable>
                  <SheetHead>
                    <SheetRow>
                      <SheetHeaderCell>{t("incident.assistant.clarifications.table.question")}</SheetHeaderCell>
                      <SheetHeaderCell>{t("incident.assistant.clarifications.table.answer")}</SheetHeaderCell>
                    </SheetRow>
                  </SheetHead>
                  <SheetBody>
                    {assistantDraft.clarifications.map((item, index) => (
                      <SheetRow key={`clarification-${index}`}>
                        <SheetCell>
                          <div className="text-sm font-medium text-slate-900">{item.question}</div>
                          {item.rationale && <p className="text-xs text-slate-500">{item.rationale}</p>}
                        </SheetCell>
                        <SheetCell>
                          <SheetInput
                            value={item.answer ?? ""}
                            onChange={(eventInput) => handleUpdateClarification(index, eventInput.target.value)}
                            placeholder={t("incident.assistant.clarifications.placeholder")}
                          />
                        </SheetCell>
                      </SheetRow>
                    ))}
                    {assistantDraft.clarifications.length === 0 && (
                      <SheetRow>
                        <SheetCell colSpan={2} className="sheet-empty-cell">
                          {t("incident.assistant.clarifications.empty")}
                        </SheetCell>
                      </SheetRow>
                    )}
                  </SheetBody>
                </SheetTable>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <button type="button" className="btn-outline" onClick={handleSaveAssistantDraft}>
                      {t("incident.assistant.actions.saveDraft")}
                    </button>
                    {assistantSaveStatus && <span className="text-sm text-slate-500">{assistantSaveStatus}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleApplyAssistantDraft}
                      disabled={assistantDraft.timeline.length === 0}
                    >
                      {t("incident.assistant.actions.applyTimeline")}
                    </button>
                    {assistantApplyStatus && <span className="text-sm text-slate-500">{assistantApplyStatus}</span>}
                  </div>
                </div>
              </section>
            </>
          )}

          <section className="workspace-phase-panel">
            <h2>{t("incident.witness.title")}</h2>
            <p className="text-sm text-slate-600">{t("incident.witness.subtitle")}</p>

            <div className="flex flex-wrap gap-3 mb-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm text-slate-600">{t("incident.witness.roleLabel")}</label>
                <input
                  className="sheet-input"
                  value={personRole}
                  onChange={(event) => setPersonRole(event.target.value)}
                  placeholder={t("incident.witness.rolePlaceholder")}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm text-slate-600">{t("incident.witness.nameLabel")}</label>
                <input
                  className="sheet-input"
                  value={personName}
                  onChange={(event) => setPersonName(event.target.value)}
                  placeholder={t("incident.witness.namePlaceholder")}
                />
              </div>
              <div className="flex items-end">
                <button type="button" className="btn-primary" onClick={handleAddPerson}>
                  {t("incident.witness.addPerson")}
                </button>
              </div>
            </div>

            {accountStatus && <p className="text-sm text-slate-500">{accountStatus}</p>}

            <div className="space-y-4">
              {incidentCase.persons.map((person) => {
                const accounts = accountsByPerson.get(person.id) ?? [];
                return (
                  <div key={person.id} className="rounded-lg border border-slate-200 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-slate-900">{person.role}</h3>
                        {person.name && <p className="text-sm text-slate-500">{person.name}</p>}
                      </div>
                      <button type="button" className="btn-outline" onClick={() => handleAddAccount(person.id)}>
                        {t("incident.witness.addAccount")}
                      </button>
                    </div>

                    {accounts.length === 0 && (
                      <p className="text-sm text-slate-500">{t("incident.witness.emptyAccount")}</p>
                    )}
                    {accounts.map((account) => {
                      const draftValue = accountDrafts[account.id] ?? account.rawStatement ?? "";
                      return (
                        <div key={account.id} className="rounded border border-slate-200 p-3 space-y-2">
                          <label className="text-sm font-medium text-slate-700">
                            {t("incident.witness.statementLabel")}
                          </label>
                          <textarea
                            className="sheet-textarea"
                            rows={4}
                            value={draftValue}
                            onChange={(event) =>
                              setAccountDrafts((prev) => ({ ...prev, [account.id]: event.target.value }))
                            }
                            placeholder={t("incident.witness.statementPlaceholder")}
                          />
                          <div className="flex flex-wrap gap-2">
                            <button type="button" className="btn-outline" onClick={() => handleSaveStatement(account.id)}>
                              {t("incident.witness.saveStatement")}
                            </button>
                            <button
                              type="button"
                              className="btn-primary"
                              onClick={() => handleExtractAccount(account.id)}
                            >
                              {t("incident.witness.extractFacts")}
                            </button>
                          </div>

                          {account.facts.length > 0 && (
                            <div>
                              <p className="text-sm font-medium text-slate-700">{t("incident.witness.factsTitle")}</p>
                              <ul className="list-disc pl-5 text-sm text-slate-600">
                                {account.facts.map((fact) => (
                                  <li key={fact.id}>{fact.text}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {account.personalEvents.length > 0 && (
                            <div>
                              <p className="text-sm font-medium text-slate-700">
                                {t("incident.witness.personalTimelineTitle")}
                              </p>
                              <ul className="list-disc pl-5 text-sm text-slate-600">
                                {account.personalEvents.map((event) => (
                                  <li key={event.id}>
                                    {event.timeLabel ? `${event.timeLabel}: ` : ""}
                                    {event.text}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="workspace-phase-panel">
            <TimelineAttachmentsPanel caseId={incidentCase.id} timeline={incidentCase.timelineEvents} />
          </section>

          <section className="workspace-phase-panel">
            <div className="flex items-center justify-between">
              <div>
                <h2>{t("incident.timeline.title")}</h2>
                <p className="text-sm text-slate-600">{t("incident.timeline.subtitle")}</p>
              </div>
              <div className="flex gap-2">
                <button type="button" className="btn-outline" onClick={handleMergeTimeline}>
                  {t("incident.timeline.merge")}
                </button>
                <button type="button" className="btn-outline" onClick={handleCheckConsistency}>
                  {t("incident.timeline.checkConsistency")}
                </button>
              </div>
            </div>

            {timelineStatus && <p className="text-sm text-slate-500">{timelineStatus}</p>}

            <SheetTable>
              <colgroup>
                <col className="sheet-col-number" />
                <col className="sheet-col-label" />
                <col className="sheet-col-description" />
                <col className="sheet-col-label" />
                <col className="sheet-col-label" />
                <col className="sheet-col-actions" />
              </colgroup>
              <SheetHead>
                <SheetRow>
                  <SheetHeaderCell>#</SheetHeaderCell>
                  <SheetHeaderCell>{t("incident.timeline.table.time")}</SheetHeaderCell>
                  <SheetHeaderCell>{t("incident.timeline.table.event")}</SheetHeaderCell>
                  <SheetHeaderCell>{t("incident.timeline.table.confidence")}</SheetHeaderCell>
                  <SheetHeaderCell>{t("incident.timeline.table.sources")}</SheetHeaderCell>
                  <SheetHeaderCell>{t("incident.timeline.table.actions")}</SheetHeaderCell>
                </SheetRow>
              </SheetHead>
              <SheetBody>
                {timelineDrafts.map((event, index) => (
                  <SheetRow key={event.id ?? `timeline-${index}`}>
                    <SheetCell className="sheet-cell-number">{index + 1}</SheetCell>
                    <SheetCell>
                      <SheetInput
                        value={event.timeLabel}
                        onChange={(e) =>
                          setTimelineDrafts((prev) =>
                            prev.map((row, idx) => (idx === index ? { ...row, timeLabel: e.target.value } : row))
                          )
                        }
                        placeholder={t("incident.timeline.timePlaceholder")}
                      />
                    </SheetCell>
                    <SheetCell>
                      <SheetTextarea
                        value={event.text}
                        onChange={(e) =>
                          setTimelineDrafts((prev) =>
                            prev.map((row, idx) => (idx === index ? { ...row, text: e.target.value } : row))
                          )
                        }
                        placeholder={t("incident.timeline.eventPlaceholder")}
                      />
                    </SheetCell>
                    <SheetCell>
                      <SheetSelect
                        value={event.confidence}
                        onChange={(e) =>
                          setTimelineDrafts((prev) =>
                            prev.map((row, idx) =>
                              idx === index ? { ...row, confidence: e.target.value as IncidentTimelineConfidence } : row
                            )
                          )
                        }
                      >
                        {CONFIDENCE_LEVELS.map((level) => (
                          <option key={level} value={level}>
                            {confidenceLabels[level]}
                          </option>
                        ))}
                      </SheetSelect>
                    </SheetCell>
                    <SheetCell>
                      {incidentCase.timelineEvents
                        .find((item) => item.id === event.id)
                        ?.sources?.map((source) => source.account?.role || source.accountId)
                        .join(", ") || t("common.noData")}
                    </SheetCell>
                    <SheetCell>
                      <SheetButton
                        variant="danger"
                        onClick={() =>
                          setTimelineDrafts((prev) => prev.filter((_, idx) => idx !== index))
                        }
                      >
                        {t("common.remove")}
                      </SheetButton>
                    </SheetCell>
                  </SheetRow>
                ))}
                <SheetAddRow>
                  <SheetCell colSpan={6}>
                    <SheetButton
                      variant="primary"
                      onClick={() =>
                        setTimelineDrafts((prev) => [
                          ...prev,
                          { timeLabel: "", text: "", confidence: "LIKELY" }
                        ])
                      }
                    >
                      {t("incident.timeline.addRow")}
                    </SheetButton>
                    <SheetButton variant="default" onClick={handleSaveTimeline}>
                      {t("incident.timeline.save")}
                    </SheetButton>
                  </SheetCell>
                </SheetAddRow>
              </SheetBody>
            </SheetTable>

            {consistencyIssues.length > 0 && (
              <div className="bg-amber-50 text-amber-900 px-4 py-3 rounded mt-4">
                <h4 className="font-semibold mb-2">{t("incident.timeline.consistency.title")}</h4>
                <ul className="list-disc pl-5 text-sm">
                  {consistencyIssues.map((issue, index) => (
                    <li key={`${issue}-${index}`}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="workspace-phase-panel">
            <h2>{t("incident.deviations.title")}</h2>
            <SheetTable>
              <colgroup>
                <col className="sheet-col-number" />
                <col className="sheet-col-label" />
                <col className="sheet-col-label" />
                <col className="sheet-col-label" />
                <col className="sheet-col-actions" />
              </colgroup>
              <SheetHead>
                <SheetRow>
                  <SheetHeaderCell>#</SheetHeaderCell>
                  <SheetHeaderCell>{t("incident.deviations.table.event")}</SheetHeaderCell>
                  <SheetHeaderCell>{t("incident.deviations.table.expected")}</SheetHeaderCell>
                  <SheetHeaderCell>{t("incident.deviations.table.actual")}</SheetHeaderCell>
                  <SheetHeaderCell>{t("incident.deviations.table.actions")}</SheetHeaderCell>
                </SheetRow>
              </SheetHead>
              <SheetBody>
                {deviationDrafts.map((deviation, index) => (
                  <SheetRow key={deviation.id ?? `dev-${index}`}>
                    <SheetCell className="sheet-cell-number">{index + 1}</SheetCell>
                    <SheetCell>
                      <SheetSelect
                        value={deviation.timelineEventId ?? ""}
                        onChange={(e) =>
                          setDeviationDrafts((prev) =>
                            prev.map((row, idx) =>
                              idx === index ? { ...row, timelineEventId: e.target.value || null } : row
                            )
                          )
                        }
                      >
                        <option value="">{t("incident.deviations.unlinked")}</option>
                        {timelineOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </SheetSelect>
                    </SheetCell>
                    <SheetCell>
                      <SheetTextarea
                        value={deviation.expected ?? ""}
                        onChange={(e) =>
                          setDeviationDrafts((prev) =>
                            prev.map((row, idx) => (idx === index ? { ...row, expected: e.target.value } : row))
                          )
                        }
                        placeholder={t("incident.deviations.placeholders.expected")}
                      />
                    </SheetCell>
                    <SheetCell>
                      <SheetTextarea
                        value={deviation.changeObserved ?? deviation.actual ?? ""}
                        onChange={(e) =>
                          setDeviationDrafts((prev) =>
                            prev.map((row, idx) =>
                              idx === index ? { ...row, changeObserved: e.target.value } : row
                            )
                          )
                        }
                        placeholder={t("incident.deviations.placeholders.actual")}
                      />
                    </SheetCell>
                    <SheetCell>
                      <SheetButton variant="danger" onClick={() => setDeviationDrafts((prev) => prev.filter((_, idx) => idx !== index))}>
                        {t("common.remove")}
                      </SheetButton>
                    </SheetCell>
                  </SheetRow>
                ))}
                <SheetAddRow>
                  <SheetCell colSpan={5}>
                    <SheetButton
                      variant="primary"
                      onClick={() => setDeviationDrafts((prev) => [...prev, {}])}
                    >
                      {t("incident.deviations.add")}
                    </SheetButton>
                    <SheetButton variant="default" onClick={handleSaveDeviations}>
                      {t("incident.deviations.save")}
                    </SheetButton>
                  </SheetCell>
                </SheetAddRow>
              </SheetBody>
            </SheetTable>
          </section>

          <section className="workspace-phase-panel">
            <h2>{t("incident.causes.title")}</h2>
            <SheetTable>
              <colgroup>
                <col className="sheet-col-number" />
                <col className="sheet-col-label" />
                <col className="sheet-col-description" />
                <col className="sheet-col-actions" />
              </colgroup>
              <SheetHead>
                <SheetRow>
                  <SheetHeaderCell>#</SheetHeaderCell>
                  <SheetHeaderCell>{t("incident.causes.table.deviation")}</SheetHeaderCell>
                  <SheetHeaderCell>{t("incident.causes.table.statement")}</SheetHeaderCell>
                  <SheetHeaderCell>{t("incident.causes.table.actions")}</SheetHeaderCell>
                </SheetRow>
              </SheetHead>
              <SheetBody>
                {causeDrafts.map((cause, index) => (
                  <SheetRow key={cause.id ?? `cause-${index}`}>
                    <SheetCell className="sheet-cell-number">{index + 1}</SheetCell>
                    <SheetCell>
                      <SheetSelect
                        value={cause.deviationId}
                        onChange={(e) =>
                          setCauseDrafts((prev) =>
                            prev.map((row, idx) =>
                              idx === index ? { ...row, deviationId: e.target.value } : row
                            )
                          )
                        }
                      >
                        {deviationOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </SheetSelect>
                    </SheetCell>
                    <SheetCell>
                      <SheetTextarea
                        value={cause.statement}
                        onChange={(e) =>
                          setCauseDrafts((prev) =>
                            prev.map((row, idx) => (idx === index ? { ...row, statement: e.target.value } : row))
                          )
                        }
                        placeholder={t("incident.causes.placeholders.statement")}
                      />
                    </SheetCell>
                    <SheetCell>
                      <SheetButton
                        variant="danger"
                        onClick={() => setCauseDrafts((prev) => prev.filter((_, idx) => idx !== index))}
                      >
                        {t("common.remove")}
                      </SheetButton>
                    </SheetCell>
                  </SheetRow>
                ))}
                <SheetAddRow>
                  <SheetCell colSpan={4}>
                    <SheetButton
                      variant="primary"
                      onClick={() =>
                        setCauseDrafts((prev) => [
                          ...prev,
                          { deviationId: deviationOptions[0]?.id ?? "", statement: "" }
                        ])
                      }
                    >
                      {t("incident.causes.add")}
                    </SheetButton>
                    <SheetButton variant="default" onClick={handleSaveCauses}>
                      {t("incident.causes.save")}
                    </SheetButton>
                  </SheetCell>
                </SheetAddRow>
              </SheetBody>
            </SheetTable>
          </section>

          <section className="workspace-phase-panel">
            <h2>{t("incident.actions.title")}</h2>
            <SheetTable>
              <colgroup>
                <col className="sheet-col-number" />
                <col className="sheet-col-label" />
                <col className="sheet-col-description" />
                <col className="sheet-col-label" />
                <col className="sheet-col-label" />
                <col className="sheet-col-label" />
                <col className="sheet-col-actions" />
              </colgroup>
              <SheetHead>
                <SheetRow>
                  <SheetHeaderCell>#</SheetHeaderCell>
                  <SheetHeaderCell>{t("incident.actions.table.cause")}</SheetHeaderCell>
                  <SheetHeaderCell>{t("incident.actions.table.action")}</SheetHeaderCell>
                  <SheetHeaderCell>{t("incident.actions.table.type")}</SheetHeaderCell>
                  <SheetHeaderCell>{t("incident.actions.table.ownerRole")}</SheetHeaderCell>
                  <SheetHeaderCell>{t("incident.actions.table.dueDate")}</SheetHeaderCell>
                  <SheetHeaderCell>{t("incident.actions.table.actions")}</SheetHeaderCell>
                </SheetRow>
              </SheetHead>
              <SheetBody>
                {actionDrafts.map((action, index) => (
                  <SheetRow key={action.id ?? `action-${index}`}>
                    <SheetCell className="sheet-cell-number">{index + 1}</SheetCell>
                    <SheetCell>
                      <SheetSelect
                        value={action.causeId}
                        onChange={(e) =>
                          setActionDrafts((prev) =>
                            prev.map((row, idx) => (idx === index ? { ...row, causeId: e.target.value } : row))
                          )
                        }
                      >
                        {causeOptions.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </SheetSelect>
                    </SheetCell>
                    <SheetCell>
                      <SheetTextarea
                        value={action.description}
                        onChange={(e) =>
                          setActionDrafts((prev) =>
                            prev.map((row, idx) => (idx === index ? { ...row, description: e.target.value } : row))
                          )
                        }
                        placeholder={t("incident.actions.placeholders.action")}
                      />
                    </SheetCell>
                    <SheetCell>
                      <SheetSelect
                        value={action.actionType ?? ""}
                        onChange={(e) =>
                          setActionDrafts((prev) =>
                            prev.map((row, idx) =>
                              idx === index ? { ...row, actionType: (e.target.value as IncidentActionType) || null } : row
                            )
                          )
                        }
                      >
                        <option value="">{t("incident.actions.selectType")}</option>
                        {ACTION_TYPES.map((option) => (
                          <option key={option} value={option}>
                            {actionTypeLabels[option]}
                          </option>
                        ))}
                      </SheetSelect>
                    </SheetCell>
                    <SheetCell>
                      <SheetInput
                        value={action.ownerRole ?? ""}
                        onChange={(e) =>
                          setActionDrafts((prev) =>
                            prev.map((row, idx) => (idx === index ? { ...row, ownerRole: e.target.value } : row))
                          )
                        }
                        placeholder={t("incident.actions.placeholders.ownerRole")}
                      />
                    </SheetCell>
                    <SheetCell>
                      <SheetInput
                        type="date"
                        value={action.dueDate ?? ""}
                        onChange={(e) =>
                          setActionDrafts((prev) =>
                            prev.map((row, idx) => (idx === index ? { ...row, dueDate: e.target.value } : row))
                          )
                        }
                      />
                    </SheetCell>
                    <SheetCell>
                      <SheetButton variant="danger" onClick={() => setActionDrafts((prev) => prev.filter((_, idx) => idx !== index))}>
                        {t("common.remove")}
                      </SheetButton>
                    </SheetCell>
                  </SheetRow>
                ))}
                <SheetAddRow>
                  <SheetCell colSpan={7}>
                    <SheetButton
                      variant="primary"
                      onClick={() =>
                        setActionDrafts((prev) => [
                          ...prev,
                          { causeId: causeOptions[0]?.id ?? "", description: "" }
                        ])
                      }
                    >
                      {t("incident.actions.add")}
                    </SheetButton>
                    <SheetButton variant="default" onClick={handleSaveActions}>
                      {t("incident.actions.save")}
                    </SheetButton>
                  </SheetCell>
                </SheetAddRow>
              </SheetBody>
            </SheetTable>
          </section>
        </div>
      </main>
    </div>
  );
};
