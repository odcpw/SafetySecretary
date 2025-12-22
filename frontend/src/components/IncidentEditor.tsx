import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AssistantPanel } from "@/components/common/AssistantPanel";
import { RecentCasesModal } from "@/components/common/RecentCasesModal";
import { SaveStatus } from "@/components/common/SaveStatus";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { UserMenu } from "@/components/common/UserMenu";
import { WorkspaceTopBar } from "@/components/common/WorkspaceTopBar";
import { OverflowMenu } from "@/components/common/OverflowMenu";
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
import { apiFetch } from "@/lib/api";
import { combineDateTimeInputs, formatDateInput, formatTimeInput } from "@/lib/dateInputs";
import type {
  IncidentActionType,
  IncidentAssistantDraft,
  IncidentCaseSummary,
  IncidentTimelineConfidence
} from "@/types/incident";
import { useI18n } from "@/i18n/I18nContext";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { useSaveStatus } from "@/hooks/useSaveStatus";

const CONFIDENCE_LEVELS: IncidentTimelineConfidence[] = ["CONFIRMED", "LIKELY", "UNCLEAR"];
const ACTION_TYPES: IncidentActionType[] = ["ENGINEERING", "ORGANISATIONAL", "PPE", "TRAINING"];

type IncidentStage = "facts" | "causes" | "root-causes" | "actions" | "review";

const STAGE_ORDER: IncidentStage[] = ["facts", "causes", "root-causes", "actions", "review"];

const buildTimeLabel = (dateInput: string, timeInput: string, fallback: string) => {
  if (!dateInput && !timeInput) return fallback;
  const label = `${dateInput} ${timeInput}`.trim();
  return label.trim();
};

const createKey = (prefix: string) => {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
};

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
        .map((event): IncidentAssistantDraft["timeline"][number] | null => {
          if (typeof (event as any)?.text !== "string") return null;
          const confidence = CONFIDENCE_LEVELS.includes((event as any).confidence)
            ? ((event as any).confidence as IncidentTimelineConfidence)
            : "LIKELY";
          return {
            eventAt: typeof (event as any)?.eventAt === "string" ? (event as any).eventAt : null,
            timeLabel: typeof (event as any)?.timeLabel === "string" ? (event as any).timeLabel : null,
            text: (event as any).text,
            confidence
          };
        })
        .filter((event): event is IncidentAssistantDraft["timeline"][number] => event !== null)
    : [];
  const clarifications = Array.isArray(raw.clarifications)
    ? raw.clarifications
        .map((item): IncidentAssistantDraft["clarifications"][number] | null => {
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
          (item): item is IncidentAssistantDraft["clarifications"][number] => item !== null
        )
    : [];

  if (!facts.length && !timeline.length && !clarifications.length) {
    return null;
  }
  return { facts, timeline, clarifications };
};

type TimelineDraft = {
  key: string;
  id?: string;
  eventAt: string | null;
  dateInput: string;
  timeInput: string;
  timeLabel: string;
  text: string;
  confidence: IncidentTimelineConfidence;
  needsTimeReview?: boolean;
};

type PersonalEventDraft = {
  key: string;
  id?: string;
  eventAt: string | null;
  dateInput: string;
  timeInput: string;
  timeLabel: string;
  text: string;
  needsTimeReview?: boolean;
};

type CauseNodeDraft = {
  key: string;
  id?: string;
  parentId: string | null;
  timelineEventId: string | null;
  statement: string;
  question: string;
  isRootCause: boolean;
  orderIndex?: number;
};

type CauseActionDraft = {
  key: string;
  id?: string;
  causeNodeId: string;
  description: string;
  ownerRole: string;
  dueDate: string;
  actionType: IncidentActionType | "";
};

type CauseActionSuggestion = {
  causeNodeId: string;
  description: string;
  category: "SUBSTITUTION" | "TECHNICAL" | "ORGANIZATIONAL" | "PPE";
};

const createTimelineDraft = (event?: {
  id?: string;
  eventAt?: string | null;
  timeLabel?: string | null;
  text?: string;
  confidence?: IncidentTimelineConfidence;
}): TimelineDraft => {
  const eventAt = event?.eventAt ?? null;
  return {
    key: event?.id ?? createKey("timeline"),
    id: event?.id,
    eventAt,
    dateInput: formatDateInput(eventAt),
    timeInput: formatTimeInput(eventAt),
    timeLabel: event?.timeLabel ?? "",
    text: event?.text ?? "",
    confidence: event?.confidence ?? "LIKELY",
    needsTimeReview: false
  };
};

const createPersonalEventDraft = (event?: {
  id?: string;
  eventAt?: string | null;
  timeLabel?: string | null;
  text?: string;
}): PersonalEventDraft => {
  const eventAt = event?.eventAt ?? null;
  return {
    key: event?.id ?? createKey("personal"),
    id: event?.id,
    eventAt,
    dateInput: formatDateInput(eventAt),
    timeInput: formatTimeInput(eventAt),
    timeLabel: event?.timeLabel ?? "",
    text: event?.text ?? "",
    needsTimeReview: false
  };
};

const resolveStopActionType = (category: CauseActionSuggestion["category"]): IncidentActionType => {
  switch (category) {
    case "ORGANIZATIONAL":
      return "ORGANISATIONAL";
    case "PPE":
      return "PPE";
    case "SUBSTITUTION":
    case "TECHNICAL":
    default:
      return "ENGINEERING";
  }
};

export const IncidentEditor = () => {
  const navigate = useNavigate();
  const { t, formatDateTime } = useI18n();
  const { incidentCase, saving, actions } = useIncidentContext();
  const [personRole, setPersonRole] = useState("");
  const [personName, setPersonName] = useState("");
  const [personOtherInfo, setPersonOtherInfo] = useState("");
  const [personDrafts, setPersonDrafts] = useState<Record<string, { role: string; name: string; otherInfo: string }>>({});
  const [accountDrafts, setAccountDrafts] = useState<Record<string, string>>({});
  const [witnessStatus, setWitnessStatus] = useState<string | null>(null);
  const [timelineDrafts, setTimelineDrafts] = useState<TimelineDraft[]>([]);
  const [personalTimelineDrafts, setPersonalTimelineDrafts] = useState<Record<string, PersonalEventDraft[]>>({});
  const [activeTimelineView, setActiveTimelineView] = useState<string>("merged");
  const {
    status: timelineStatus,
    show: showTimelineStatus,
    showSuccess: showTimelineSuccess,
    showError: showTimelineError
  } = useSaveStatus();
  const [assistantNarrative, setAssistantNarrative] = useState(incidentCase.assistantNarrative ?? "");
  const [assistantDraft, setAssistantDraft] = useState<IncidentAssistantDraft | null>(
    normalizeAssistantDraft(incidentCase.assistantDraft)
  );
  const [assistantTimelineDrafts, setAssistantTimelineDrafts] = useState<TimelineDraft[]>([]);
  const [assistantStatus, setAssistantStatus] = useState<string | null>(null);
  const {
    status: assistantSaveStatus,
    show: showAssistantStatus,
    showSuccess: showAssistantSuccess,
    showError: showAssistantError
  } = useSaveStatus();
  const {
    status: assistantApplyStatus,
    show: showApplyStatus,
    showSuccess: showApplySuccess,
    showError: showApplyError
  } = useSaveStatus();
  const [consistencyIssues, setConsistencyIssues] = useState<string[]>([]);
  const [causeNodeDrafts, setCauseNodeDrafts] = useState<CauseNodeDraft[]>([]);
  const [causeStatus, setCauseStatus] = useState<string | null>(null);
  const [causeQuestions, setCauseQuestions] = useState<string[]>([]);
  const [causeQuestionStatus, setCauseQuestionStatus] = useState<string | null>(null);
  const [rootCauseQuestions, setRootCauseQuestions] = useState<Record<string, string>>({});
  const [rootCauseStatus, setRootCauseStatus] = useState<string | null>(null);
  const [actionDrafts, setActionDrafts] = useState<CauseActionDraft[]>([]);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [actionSuggestions, setActionSuggestions] = useState<CauseActionSuggestion[]>([]);
  const [actionSuggestionStatus, setActionSuggestionStatus] = useState<string | null>(null);
  const [loadModalOpen, setLoadModalOpen] = useState(false);
  const [recentCases, setRecentCases] = useState<IncidentCaseSummary[]>([]);
  const [casesLoading, setCasesLoading] = useState(false);
  const [casesError, setCasesError] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<IncidentStage>(() =>
    STAGE_ORDER.includes(incidentCase.workflowStage as IncidentStage)
      ? (incidentCase.workflowStage as IncidentStage)
      : "facts"
  );
  const [stageError, setStageError] = useState<string | null>(null);
  const { status: exportStatus, show: showExportStatus, showSuccess: showExportSuccess, showError: showExportError } =
    useSaveStatus();
  const { confirm, dialog } = useConfirmDialog();

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
  const stopCategoryLabels = {
    SUBSTITUTION: t("incident.actions.stopCategories.substitution"),
    TECHNICAL: t("incident.actions.stopCategories.technical"),
    ORGANIZATIONAL: t("incident.actions.stopCategories.organizational"),
    PPE: t("incident.actions.stopCategories.ppe")
  } as const;
  const stageLabels: Record<IncidentStage, string> = {
    facts: t("incident.flow.stages.facts"),
    causes: t("incident.flow.stages.causes"),
    "root-causes": t("incident.flow.stages.rootCauses"),
    actions: t("incident.flow.stages.actions"),
    review: t("incident.flow.stages.review")
  };

  const assistantDraftUpdatedLabel = incidentCase.assistantDraftUpdatedAt
    ? new Date(incidentCase.assistantDraftUpdatedAt).toLocaleString()
    : null;

  const fetchRecentCases = useCallback(async () => {
    setCasesLoading(true);
    setCasesError(null);
    try {
      const response = await apiFetch("/api/incident-cases?limit=20");
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as { cases: IncidentCaseSummary[] };
      setRecentCases(data.cases ?? []);
    } catch (error) {
      setCasesError(error instanceof Error ? error.message : t("landing.incident.errors.loadFailed"));
    } finally {
      setCasesLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (loadModalOpen) {
      void fetchRecentCases();
    }
  }, [fetchRecentCases, loadModalOpen]);

  useEffect(() => {
    setTimelineDrafts(
      incidentCase.timelineEvents.map((event) =>
        createTimelineDraft({
          id: event.id,
          eventAt: event.eventAt ?? null,
          timeLabel: event.timeLabel ?? null,
          text: event.text,
          confidence: event.confidence
        })
      )
    );

    const personalDrafts: Record<string, PersonalEventDraft[]> = {};
    incidentCase.accounts.forEach((account) => {
      personalDrafts[account.id] = account.personalEvents.map((event) =>
        createPersonalEventDraft({
          id: event.id,
          eventAt: event.eventAt ?? null,
          timeLabel: event.timeLabel ?? null,
          text: event.text
        })
      );
    });
    setPersonalTimelineDrafts(personalDrafts);

    setPersonDrafts((prev) => {
      const next: Record<string, { role: string; name: string; otherInfo: string }> = { ...prev };
      incidentCase.persons.forEach((person) => {
        next[person.id] = {
          role: person.role,
          name: person.name ?? "",
          otherInfo: person.otherInfo ?? ""
        };
      });
      return next;
    });

    const nextAssistantDraft = normalizeAssistantDraft(incidentCase.assistantDraft);
    setAssistantNarrative(incidentCase.assistantNarrative ?? "");
    setAssistantDraft(nextAssistantDraft);
    setAssistantTimelineDrafts(
      (nextAssistantDraft?.timeline ?? []).map((event) =>
        createTimelineDraft({
          eventAt: event.eventAt ?? null,
          timeLabel: event.timeLabel ?? null,
          text: event.text,
          confidence: event.confidence ?? "LIKELY"
        })
      )
    );

    const nextCauseNodes = (incidentCase.causeNodes ?? []).map((node) => ({
      key: node.id,
      id: node.id,
      parentId: node.parentId ?? null,
      timelineEventId: node.timelineEventId ?? null,
      statement: node.statement,
      question: node.question ?? "",
      isRootCause: node.isRootCause,
      orderIndex: node.orderIndex
    }));
    setCauseNodeDrafts(nextCauseNodes);

    const nextActions = (incidentCase.causeNodes ?? []).flatMap((node) =>
      node.actions.map((action) => ({
        key: action.id,
        id: action.id,
        causeNodeId: node.id,
        description: action.description,
        ownerRole: action.ownerRole ?? "",
        dueDate: action.dueDate ?? "",
        actionType: action.actionType ?? ""
      }))
    );
    setActionDrafts(nextActions);

    setActiveStage((prev) => {
      const nextStage = STAGE_ORDER.includes(incidentCase.workflowStage as IncidentStage)
        ? (incidentCase.workflowStage as IncidentStage)
        : "facts";
      return prev === nextStage ? prev : nextStage;
    });

    setActiveTimelineView((prev) => {
      if (prev === "merged") return "merged";
      const hasAccount = incidentCase.accounts.some((account) => account.id === prev);
      return hasAccount ? prev : "merged";
    });
  }, [incidentCase]);

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

  const timelineSourceLabels = useMemo(() => {
    const accountMap = new Map(incidentCase.accounts.map((account) => [account.id, account]));
    const map = new Map<string, string[]>();
    incidentCase.timelineEvents.forEach((event) => {
      const labels = event.sources
        .map((source) => {
          const account = accountMap.get(source.accountId);
          return account?.person?.name || account?.person?.role || source.accountId;
        })
        .filter(Boolean) as string[];
      map.set(event.id, labels);
    });
    return map;
  }, [incidentCase.accounts, incidentCase.timelineEvents]);

  const timelineEventMap = useMemo(() => {
    const map = new Map<string, { index: number; label: string }>();
    incidentCase.timelineEvents.forEach((event, index) => {
      const label = event.timeLabel
        ? event.timeLabel
        : t("incident.timeline.untimedLabel", { values: { index: index + 1 } });
      map.set(event.id, { index, label });
    });
    return map;
  }, [incidentCase.timelineEvents, t]);

  const proximateCauseNodes = useMemo(() =>
    causeNodeDrafts.filter((node) => node.parentId === null && node.timelineEventId)
  , [causeNodeDrafts]);

  const rootCauseNodes = useMemo(() => causeNodeDrafts.filter((node) => node.isRootCause), [causeNodeDrafts]);

  const factsComplete = timelineDrafts.length > 0;
  const causesComplete = proximateCauseNodes.length > 0;
  const rootCausesComplete = rootCauseNodes.length > 0;
  const actionsComplete = actionDrafts.length > 0;

  const stageComplete: Record<IncidentStage, boolean> = {
    facts: factsComplete,
    causes: causesComplete,
    "root-causes": rootCausesComplete,
    actions: actionsComplete,
    review: actionsComplete
  };

  const persistStage = async (stage: IncidentStage) => {
    try {
      await actions.updateCaseMeta({ workflowStage: stage });
    } catch (error) {
      console.error("[IncidentEditor] Unable to persist workflow stage", error);
    }
  };

  const canEnterStage = (stage: IncidentStage) => {
    if (stage === "causes" && !factsComplete) {
      setStageError(t("incident.flow.errors.factsIncomplete"));
      return false;
    }
    if (stage === "root-causes" && !causesComplete) {
      setStageError(t("incident.flow.errors.causesIncomplete"));
      return false;
    }
    if (stage === "actions" && !rootCausesComplete) {
      setStageError(t("incident.flow.errors.rootCausesIncomplete"));
      return false;
    }
    if (stage === "review" && !actionsComplete) {
      setStageError(t("incident.flow.errors.actionsIncomplete"));
      return false;
    }
    return true;
  };

  const handleStageChange = (stage: IncidentStage) => {
    const currentIndex = STAGE_ORDER.indexOf(activeStage);
    const nextIndex = STAGE_ORDER.indexOf(stage);
    if (nextIndex > currentIndex && !canEnterStage(stage)) {
      return;
    }
    setStageError(null);
    setActiveStage(stage);
    void persistStage(stage);
  };

  const handleNextStage = () => {
    const index = STAGE_ORDER.indexOf(activeStage);
    const nextStage = STAGE_ORDER[index + 1];
    if (nextStage) {
      handleStageChange(nextStage);
    }
  };

  const handlePrevStage = () => {
    const index = STAGE_ORDER.indexOf(activeStage);
    const prevStage = STAGE_ORDER[index - 1];
    if (prevStage) {
      handleStageChange(prevStage);
    }
  };

  const handleAddPerson = async () => {
    if (!personRole.trim()) return;
    await actions.addPerson(personRole.trim(), personName.trim() || null, personOtherInfo.trim() || null);
    setPersonRole("");
    setPersonName("");
    setPersonOtherInfo("");
  };

  const handleSavePerson = async (personId: string) => {
    const draft = personDrafts[personId];
    if (!draft?.role.trim()) return;
    setWitnessStatus(t("incident.witness.status.saving"));
    await actions.updatePerson(personId, draft.role.trim(), draft.name.trim() || null, draft.otherInfo.trim() || null);
    setWitnessStatus(null);
  };

  const handleAddAccount = async (personId: string) => {
    await actions.addAccount(personId, "");
  };

  const handleSaveStatement = async (accountId: string) => {
    const draft = accountDrafts[accountId] ?? "";
    setWitnessStatus(t("incident.witness.status.saving"));
    await actions.updateAccount(accountId, draft);
    setWitnessStatus(null);
  };

  const handleExtractAccount = async (accountId: string) => {
    const draft = accountDrafts[accountId] ?? "";
    if (!draft.trim()) return;
    setWitnessStatus(t("incident.witness.status.extracting"));
    await actions.extractAccount(accountId, draft);
    setWitnessStatus(null);
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
      await actions.assistFacts(assistantNarrative.trim());
      setAssistantStatus(t("incident.assistant.status.extracted"));
      setTimeout(() => setAssistantStatus(null), 2500);
    } catch (error) {
      setAssistantStatus(error instanceof Error ? error.message : t("incident.assistant.status.failed"));
    }
  };

  const handleSaveAssistantDraft = async () => {
    showAssistantStatus({ message: t("incident.assistant.status.savingDraft"), tone: "info" });
    try {
      const draft = ensureAssistantDraft(assistantDraft);
      const timeline = assistantTimelineDrafts.map((event) => ({
        eventAt: event.eventAt ?? null,
        timeLabel: event.timeLabel || null,
        text: event.text,
        confidence: event.confidence
      }));
      await actions.updateAssistantDraft({ ...draft, timeline }, assistantNarrative.trim() || null);
      showAssistantSuccess(t("incident.assistant.status.savedDraft"), 2500);
    } catch (error) {
      showAssistantError(error instanceof Error ? error.message : t("incident.assistant.status.saveFailed"));
    }
  };

  const handleApplyAssistantDraft = async () => {
    if (assistantTimelineDrafts.length === 0) return;
    const ok = await confirm({
      title: t("common.continue"),
      description: t("incident.assistant.confirmApply"),
      confirmLabel: t("common.continue"),
      cancelLabel: t("common.cancel")
    });
    if (!ok) return;
    showApplyStatus({ message: t("incident.assistant.status.applying"), tone: "info" });
    try {
      await actions.applyAssistantDraft(
        assistantTimelineDrafts.map((event, index) => ({
          orderIndex: index,
          eventAt: event.eventAt ?? null,
          timeLabel: event.timeLabel || null,
          text: event.text,
          confidence: event.confidence
        }))
      );
      showApplySuccess(t("incident.assistant.status.applied"), 2500);
    } catch (error) {
      showApplyError(error instanceof Error ? error.message : t("incident.assistant.status.applyFailed"));
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
    setAssistantTimelineDrafts((prev) => [...prev, createTimelineDraft()]);
  };

  const handleUpdateAssistantTimeline = (
    index: number,
    field: "date" | "time" | "text" | "confidence",
    value: string
  ) => {
    setAssistantTimelineDrafts((prev) =>
      prev.map((event, idx) => {
        if (idx !== index) return event;
        if (field === "text") {
          return { ...event, text: value };
        }
        if (field === "confidence") {
          return { ...event, confidence: value as IncidentTimelineConfidence };
        }
        const dateInput = field === "date" ? value : event.dateInput;
        const timeInput = field === "time" ? value : event.timeInput;
        const eventAt = combineDateTimeInputs(dateInput, timeInput);
        const timeLabel = buildTimeLabel(dateInput, timeInput, event.timeLabel);
        return { ...event, dateInput, timeInput, eventAt, timeLabel, needsTimeReview: false };
      })
    );
  };

  const handleRemoveAssistantTimeline = (index: number) => {
    setAssistantTimelineDrafts((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleMoveAssistantTimeline = (index: number, direction: "up" | "down") => {
    setAssistantTimelineDrafts((prev) => {
      const next = [...prev];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      next[index] = { ...next[index], needsTimeReview: true };
      next[target] = { ...next[target], needsTimeReview: true };
      return next;
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
    showTimelineStatus({ message: t("incident.timeline.status.merging"), tone: "info" });
    try {
      await actions.mergeTimeline();
      showTimelineSuccess(t("incident.timeline.status.merged"), 2000);
    } catch (error) {
      showTimelineError(error instanceof Error ? error.message : t("incident.timeline.status.mergeFailed"));
    }
  };

  const handleCheckConsistency = async () => {
    showTimelineStatus({ message: t("incident.timeline.status.checking"), tone: "info" });
    try {
      const result = await actions.checkConsistency();
      const issues = Array.isArray((result as any)?.issues)
        ? (result as any).issues.map((issue: any) => issue.description).filter(Boolean)
        : [];
      setConsistencyIssues(issues);
      showTimelineSuccess(t("incident.timeline.status.checked"), 2000);
    } catch (error) {
      showTimelineError(error instanceof Error ? error.message : t("incident.timeline.status.checkFailed"));
    }
  };

  const handleSaveTimeline = async () => {
    showTimelineStatus({ message: t("incident.timeline.status.saving"), tone: "info" });
    try {
      await actions.saveTimeline(
        timelineDrafts.map((event, index) => ({
          id: event.id,
          orderIndex: index,
          eventAt: event.eventAt ?? null,
          timeLabel: event.timeLabel || null,
          text: event.text,
          confidence: event.confidence
        }))
      );
      showTimelineSuccess(t("status.saved"), 2000);
    } catch (error) {
      showTimelineError(error instanceof Error ? error.message : t("status.saveFailed"));
    }
  };

  const handleSortTimeline = () => {
    setTimelineDrafts((prev) => {
      const sorted = [...prev].sort((a, b) => {
        const aTime = a.eventAt ? new Date(a.eventAt).getTime() : Number.MAX_VALUE;
        const bTime = b.eventAt ? new Date(b.eventAt).getTime() : Number.MAX_VALUE;
        return aTime - bTime;
      });
      return sorted.map((event) => ({ ...event, needsTimeReview: false }));
    });
  };

  const handleUpdateTimeline = (
    index: number,
    field: "date" | "time" | "text" | "confidence",
    value: string
  ) => {
    setTimelineDrafts((prev) =>
      prev.map((event, idx) => {
        if (idx !== index) return event;
        if (field === "text") {
          return { ...event, text: value };
        }
        if (field === "confidence") {
          return { ...event, confidence: value as IncidentTimelineConfidence };
        }
        const dateInput = field === "date" ? value : event.dateInput;
        const timeInput = field === "time" ? value : event.timeInput;
        const eventAt = combineDateTimeInputs(dateInput, timeInput);
        const timeLabel = buildTimeLabel(dateInput, timeInput, event.timeLabel);
        return { ...event, dateInput, timeInput, eventAt, timeLabel, needsTimeReview: false };
      })
    );
  };

  const handleMoveTimeline = (index: number, direction: "up" | "down") => {
    setTimelineDrafts((prev) => {
      const next = [...prev];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) {
        return prev;
      }
      [next[index], next[target]] = [next[target]!, next[index]!];
      next[index] = { ...next[index], needsTimeReview: true };
      next[target] = { ...next[target], needsTimeReview: true };
      return next;
    });
  };

  const handleAddTimelineRow = () => {
    setTimelineDrafts((prev) => [...prev, createTimelineDraft()]);
  };

  const handleRemoveTimelineRow = (index: number) => {
    setTimelineDrafts((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdatePersonalEvent = (
    accountId: string,
    index: number,
    field: "date" | "time" | "text",
    value: string
  ) => {
    setPersonalTimelineDrafts((prev) => {
      const current = prev[accountId] ?? [];
      const next = current.map((event, idx) => {
        if (idx !== index) return event;
        if (field === "text") {
          return { ...event, text: value };
        }
        const dateInput = field === "date" ? value : event.dateInput;
        const timeInput = field === "time" ? value : event.timeInput;
        const eventAt = combineDateTimeInputs(dateInput, timeInput);
        const timeLabel = buildTimeLabel(dateInput, timeInput, event.timeLabel);
        return { ...event, dateInput, timeInput, eventAt, timeLabel, needsTimeReview: false };
      });
      return { ...prev, [accountId]: next };
    });
  };

  const handleMovePersonalEvent = (accountId: string, index: number, direction: "up" | "down") => {
    setPersonalTimelineDrafts((prev) => {
      const current = prev[accountId] ?? [];
      const next = [...current];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      next[index] = { ...next[index], needsTimeReview: true };
      next[target] = { ...next[target], needsTimeReview: true };
      return { ...prev, [accountId]: next };
    });
  };

  const handleAddPersonalEvent = (accountId: string) => {
    setPersonalTimelineDrafts((prev) => {
      const current = prev[accountId] ?? [];
      return { ...prev, [accountId]: [...current, createPersonalEventDraft()] };
    });
  };

  const handleRemovePersonalEvent = (accountId: string, index: number) => {
    setPersonalTimelineDrafts((prev) => {
      const current = prev[accountId] ?? [];
      return { ...prev, [accountId]: current.filter((_, idx) => idx !== index) };
    });
  };

  const handleSortPersonalEvents = (accountId: string) => {
    setPersonalTimelineDrafts((prev) => {
      const current = prev[accountId] ?? [];
      const sorted = [...current].sort((a, b) => {
        const aTime = a.eventAt ? new Date(a.eventAt).getTime() : Number.MAX_VALUE;
        const bTime = b.eventAt ? new Date(b.eventAt).getTime() : Number.MAX_VALUE;
        return aTime - bTime;
      });
      return { ...prev, [accountId]: sorted.map((event) => ({ ...event, needsTimeReview: false })) };
    });
  };

  const handleSavePersonalEvents = async (accountId: string) => {
    const events = personalTimelineDrafts[accountId] ?? [];
    showTimelineStatus({ message: t("incident.timeline.status.saving"), tone: "info" });
    try {
      await actions.savePersonalEvents(
        accountId,
        events.map((event, index) => ({
          id: event.id,
          orderIndex: index,
          eventAt: event.eventAt ?? null,
          timeLabel: event.timeLabel || null,
          text: event.text
        }))
      );
      showTimelineSuccess(t("status.saved"), 2000);
    } catch (error) {
      showTimelineError(error instanceof Error ? error.message : t("status.saveFailed"));
    }
  };

  const handleAssistCauses = async () => {
    setCauseQuestionStatus(t("incident.coaching.status.generating"));
    try {
      const result = await actions.assistCauses();
      const questions = Array.isArray((result as any)?.questions)
        ? (result as any).questions.filter((item: unknown) => typeof item === "string")
        : [];
      setCauseQuestions(questions);
      setCauseQuestionStatus(t("incident.coaching.status.ready"));
      setTimeout(() => setCauseQuestionStatus(null), 2500);
    } catch (error) {
      setCauseQuestionStatus(error instanceof Error ? error.message : t("incident.coaching.status.failed"));
    }
  };

  const handleAssistRootCauses = async () => {
    if (proximateCauseNodes.length === 0) return;
    setRootCauseStatus(t("incident.coaching.status.generating"));
    try {
      const causeNodeIds = proximateCauseNodes
        .map((node) => node.id)
        .filter((value): value is string => Boolean(value));
      const result = await actions.assistRootCauses(causeNodeIds);
      const questions = Array.isArray((result as any)?.questions) ? (result as any).questions : [];
      const mapped: Record<string, string> = {};
      questions.forEach((item: any) => {
        if (typeof item?.causeNodeId === "string" && typeof item?.question === "string") {
          mapped[item.causeNodeId] = item.question;
        }
      });
      setRootCauseQuestions(mapped);
      setRootCauseStatus(t("incident.coaching.status.ready"));
      setTimeout(() => setRootCauseStatus(null), 2500);
    } catch (error) {
      setRootCauseStatus(error instanceof Error ? error.message : t("incident.coaching.status.failed"));
    }
  };

  const handleAssistActions = async () => {
    setActionSuggestionStatus(t("incident.coaching.status.generating"));
    try {
      const result = await actions.assistActions();
      const suggestions = Array.isArray((result as any)?.suggestions)
        ? (result as any).suggestions
            .map((item: any) => {
              if (
                typeof item?.causeNodeId !== "string" ||
                typeof item?.description !== "string" ||
                typeof item?.category !== "string"
              ) {
                return null;
              }
              const category = item.category.toUpperCase();
              if (!stopCategoryLabels[category as CauseActionSuggestion["category"]]) return null;
              return {
                causeNodeId: item.causeNodeId,
                description: item.description,
                category: category as CauseActionSuggestion["category"]
              };
            })
            .filter(Boolean)
        : [];
      setActionSuggestions(suggestions as CauseActionSuggestion[]);
      setActionSuggestionStatus(t("incident.coaching.status.ready"));
      setTimeout(() => setActionSuggestionStatus(null), 2500);
    } catch (error) {
      setActionSuggestionStatus(error instanceof Error ? error.message : t("incident.coaching.status.failed"));
    }
  };

  const handleToggleProximateCause = (timelineEventId: string, label: string) => {
    setCauseNodeDrafts((prev) => {
      const existing = prev.find((node) => node.timelineEventId === timelineEventId && node.parentId === null);
      if (existing) {
        const removeIds = new Set<string>();
        const removeKeys = new Set<string>();
        const collect = (nodeId: string) => {
          removeIds.add(nodeId);
          const children = prev.filter((node) => node.parentId === nodeId);
          children.forEach((child) => {
            removeKeys.add(child.key);
            if (child.id) {
              collect(child.id);
            }
          });
        };
        removeKeys.add(existing.key);
        if (existing.id) {
          collect(existing.id);
        }
        const filtered = prev.filter(
          (node) => !removeKeys.has(node.key) && (!node.id || !removeIds.has(node.id))
        );
        setActionDrafts((actionsPrev) =>
          actionsPrev.filter((action) => !removeIds.has(action.causeNodeId))
        );
        return filtered;
      }
      const orderIndex = prev.filter((node) => node.parentId === null).length;
      return [
        ...prev,
        {
          key: createKey("cause"),
          parentId: null,
          timelineEventId,
          statement: label,
          question: "",
          isRootCause: false,
          orderIndex
        }
      ];
    });
  };

  const handleUpdateCauseNode = (key: string, field: keyof Omit<CauseNodeDraft, "key" | "id" | "orderIndex">, value: string | boolean | null) => {
    setCauseNodeDrafts((prev) =>
      prev.map((node) =>
        node.key === key
          ? {
              ...node,
              [field]: value
            }
          : node
      )
    );
  };

  const handleAddChildCause = (parentId: string) => {
    setCauseNodeDrafts((prev) => {
      const orderIndex = prev.filter((node) => node.parentId === parentId).length;
      return [
        ...prev,
        {
          key: createKey("cause"),
          parentId,
          timelineEventId: null,
          statement: "",
          question: "",
          isRootCause: false,
          orderIndex
        }
      ];
    });
  };

  const handleRemoveCauseNode = (node: CauseNodeDraft) => {
    if (!node.id) {
      setCauseNodeDrafts((prev) => prev.filter((item) => item.key !== node.key));
      return;
    }
    setCauseNodeDrafts((prev) => {
      const removeIds = new Set<string>();
      const removeKeys = new Set<string>();
      const collect = (nodeId: string) => {
        removeIds.add(nodeId);
        const children = prev.filter((child) => child.parentId === nodeId);
        children.forEach((child) => {
          removeKeys.add(child.key);
          if (child.id) {
            collect(child.id);
          }
        });
      };
      removeKeys.add(node.key);
      collect(node.id!);
      setActionDrafts((actionsPrev) => actionsPrev.filter((action) => !removeIds.has(action.causeNodeId)));
      return prev.filter(
        (item) => !removeKeys.has(item.key) && (!item.id || !removeIds.has(item.id))
      );
    });
  };

  const handleSaveCauseNodes = async () => {
    setCauseStatus(t("incident.causes.status.saving"));
    const grouped = new Map<string | null, CauseNodeDraft[]>();
    causeNodeDrafts.forEach((node) => {
      const key = node.parentId ?? null;
      const list = grouped.get(key) ?? [];
      list.push(node);
      grouped.set(key, list);
    });
    const inputs = Array.from(grouped.values()).flatMap((nodes) =>
      [...nodes]
        .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
        .map((node, index) => ({
          id: node.id,
          parentId: node.parentId,
          timelineEventId: node.timelineEventId,
          orderIndex: index,
          statement: node.statement,
          question: node.question || null,
          isRootCause: node.isRootCause
        }))
    );
    await actions.saveCauseNodes(inputs);
    setCauseStatus(t("incident.causes.status.saved"));
    setTimeout(() => setCauseStatus(null), 2500);
  };

  const handleAddAction = (causeNodeId: string) => {
    setActionDrafts((prev) => [
      ...prev,
      {
        key: createKey("action"),
        causeNodeId,
        description: "",
        ownerRole: "",
        dueDate: "",
        actionType: ""
      }
    ]);
  };

  const handleUpdateAction = (key: string, field: keyof Omit<CauseActionDraft, "key" | "id" | "causeNodeId">, value: string) => {
    setActionDrafts((prev) =>
      prev.map((action) => (action.key === key ? { ...action, [field]: value } : action))
    );
  };

  const handleRemoveAction = (key: string) => {
    setActionDrafts((prev) => prev.filter((action) => action.key !== key));
  };

  const handleApplySuggestion = (suggestion: CauseActionSuggestion) => {
    setActionDrafts((prev) => [
      ...prev,
      {
        key: createKey("action"),
        causeNodeId: suggestion.causeNodeId,
        description: suggestion.description,
        ownerRole: "",
        dueDate: "",
        actionType: resolveStopActionType(suggestion.category)
      }
    ]);
    setActionSuggestions((prev) =>
      prev.filter((item) =>
        !(item.causeNodeId === suggestion.causeNodeId && item.description === suggestion.description)
      )
    );
  };

  const handleSaveActions = async () => {
    setActionStatus(t("incident.actions.status.saving"));
    const grouped = new Map<string, CauseActionDraft[]>();
    actionDrafts.forEach((action) => {
      const list = grouped.get(action.causeNodeId) ?? [];
      list.push(action);
      grouped.set(action.causeNodeId, list);
    });
    const inputs = Array.from(grouped.values()).flatMap((actions) =>
      actions
        .map((action, index) => ({
          id: action.id,
          causeNodeId: action.causeNodeId,
          orderIndex: index,
          description: action.description,
          ownerRole: action.ownerRole.trim() || null,
          dueDate: action.dueDate || null,
          actionType: action.actionType ? (action.actionType as IncidentActionType) : null
        }))
    );
    await actions.saveCauseActions(inputs);
    setActionStatus(t("incident.actions.status.saved"));
    setTimeout(() => setActionStatus(null), 2500);
  };

  const timelineViewOptions = useMemo(() => {
    const options = [
      { id: "merged", label: t("incident.timeline.views.merged") }
    ];
    incidentCase.accounts.forEach((account, index) => {
      const label = account.person?.name || account.person?.role || t("incident.timeline.views.witness", { values: { index: index + 1 } });
      options.push({ id: account.id, label });
    });
    return options;
  }, [incidentCase.accounts, t]);

  const nodesByParent = useMemo(() => {
    const grouped = new Map<string | null, CauseNodeDraft[]>();
    causeNodeDrafts.forEach((node) => {
      const key = node.parentId ?? null;
      const list = grouped.get(key) ?? [];
      list.push(node);
      grouped.set(key, list);
    });
    return grouped;
  }, [causeNodeDrafts]);

  const renderCauseTree = (
    parentId: string | null,
    depth: number,
    allowEdit: boolean,
    showActions: boolean
  ) => {
    const nodes = nodesByParent.get(parentId) ?? [];
    if (!nodes.length) return null;
    return (
      <div className={depth > 0 ? "ml-6 border-l border-slate-200 pl-4 space-y-3" : "space-y-3"}>
        {nodes.map((node) => {
          const timelineLabel = node.timelineEventId ? timelineEventMap.get(node.timelineEventId) : null;
          const actionItems = actionDrafts.filter((action) => action.causeNodeId === node.id);
          return (
            <div key={node.key} className="rounded border border-slate-200 bg-white p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  {timelineLabel && (
                    <p className="text-xs text-slate-500">
                      {t("incident.causes.proximateLabel", {
                        values: { index: timelineLabel.index + 1, time: timelineLabel.label }
                      })}
                    </p>
                  )}
                  {allowEdit ? (
                    <SheetTextarea
                      value={node.statement}
                      onChange={(event) => handleUpdateCauseNode(node.key, "statement", event.target.value)}
                      placeholder={t("incident.causes.placeholders.statement")}
                    />
                  ) : (
                    <p className="text-sm text-slate-700">{node.statement}</p>
                  )}
                </div>
                {allowEdit && (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={node.isRootCause}
                        onChange={(event) => handleUpdateCauseNode(node.key, "isRootCause", event.target.checked)}
                      />
                      {t("incident.rootCauses.markRoot")}
                    </label>
                    <SheetButton variant="danger" onClick={() => handleRemoveCauseNode(node)}>
                      {t("common.remove")}
                    </SheetButton>
                  </div>
                )}
              </div>

              {allowEdit && (
                <div>
                  <label className="text-xs text-slate-600">{t("incident.rootCauses.questionLabel")}</label>
                  <SheetInput
                    value={node.question}
                    onChange={(event) => handleUpdateCauseNode(node.key, "question", event.target.value)}
                    placeholder={t("incident.rootCauses.questionPlaceholder")}
                  />
                </div>
              )}

              {showActions && node.id && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-700">{t("incident.actions.linkedTitle")}</p>
                    <SheetButton variant="primary" onClick={() => handleAddAction(node.id!)}>
                      {t("incident.actions.add")}
                    </SheetButton>
                  </div>
                  {actionItems.length === 0 && (
                    <p className="text-xs text-slate-500">{t("incident.actions.empty")}</p>
                  )}
                  {actionItems.map((action) => (
                    <div key={action.key} className="rounded border border-slate-200 p-2 space-y-2">
                      <SheetTextarea
                        value={action.description}
                        onChange={(event) => handleUpdateAction(action.key, "description", event.target.value)}
                        placeholder={t("incident.actions.placeholders.action")}
                      />
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <SheetSelect
                          value={action.actionType}
                          onChange={(event) => handleUpdateAction(action.key, "actionType", event.target.value)}
                        >
                          <option value="">{t("incident.actions.selectType")}</option>
                          {ACTION_TYPES.map((option) => (
                            <option key={option} value={option}>
                              {actionTypeLabels[option]}
                            </option>
                          ))}
                        </SheetSelect>
                        <SheetInput
                          value={action.ownerRole}
                          onChange={(event) => handleUpdateAction(action.key, "ownerRole", event.target.value)}
                          placeholder={t("incident.actions.placeholders.ownerRole")}
                        />
                        <SheetInput
                          type="date"
                          value={action.dueDate}
                          onChange={(event) => handleUpdateAction(action.key, "dueDate", event.target.value)}
                        />
                      </div>
                      <div className="flex justify-end">
                        <SheetButton variant="danger" onClick={() => handleRemoveAction(action.key)}>
                          {t("common.remove")}
                        </SheetButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {allowEdit && node.id && (
                <div className="flex justify-end">
                  <SheetButton variant="default" onClick={() => handleAddChildCause(node.id!)}>
                    {t("incident.rootCauses.addChild")}
                  </SheetButton>
                </div>
              )}

              {node.id ? renderCauseTree(node.id, depth + 1, allowEdit, showActions) : null}
            </div>
          );
        })}
      </div>
    );
  };

  const handleLoadById = (id: string) => {
    navigate(`/incidents/${encodeURIComponent(id)}`);
  };

  const handleExport = (url: string, label: string) => {
    showExportStatus({ message: t("common.exportPreparing", { values: { label } }), tone: "info" });
    const popup = window.open(url, "_blank", "noopener");
    if (!popup) {
      showExportError(t("common.exportBlocked"), () => handleExport(url, label), undefined, t("common.retry"));
      return;
    }
    window.setTimeout(() => {
      showExportSuccess(t("common.exportReady", { values: { label } }), 2000);
    }, 800);
  };

  return (
    <div className="workspace-shell">
      <div className="workspace-menus">
        <WorkspaceTopBar
          label={t("workspace.incidentWorkspace")}
          title={incidentCase.title}
          subtitle={`${incidentCase.location || t("workspace.locationPending")} · ${incidentTypeLabels[incidentCase.incidentType]}`}
          breadcrumbs={[
            { label: t("navigation.home"), to: "/" },
            { label: t("navigation.incidents"), to: "/incidents" },
            { label: incidentCase.title || t("incident.create.label") }
          ]}
          saving={saving}
          actions={
            <>
              <div className="workspace-topbar__group">
                <button type="button" className="btn-outline" onClick={() => setLoadModalOpen(true)}>
                  {t("common.load")}
                </button>
              </div>
              <div className="workspace-topbar__group">
                <OverflowMenu label={t("common.more")}>
                  <button
                    type="button"
                    className="btn-outline btn-small overflow-menu__item"
                    onClick={() =>
                      handleExport(`/api/incident-cases/${incidentCase.id}/export/pdf`, t("common.exportPdf"))
                    }
                  >
                    {t("common.exportPdf")}
                  </button>
                </OverflowMenu>
              </div>
              <div className="workspace-topbar__group">
                <SaveStatus status={exportStatus} />
              </div>
              <div className="workspace-topbar__group">
                <ThemeToggle />
                <UserMenu />
              </div>
            </>
          }
        />
      </div>

      <main className="workspace-main">
        <div className="workspace-main__inner">
          <section className="workspace-phase-panel">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2>{t("incident.flow.title")}</h2>
                <p className="workspace-phase-panel__description">{t("incident.flow.subtitle")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {STAGE_ORDER.map((stage) => (
                  <button
                    key={stage}
                    type="button"
                    className={stage === activeStage ? "btn-primary" : "btn-outline"}
                    onClick={() => handleStageChange(stage)}
                    aria-current={stage === activeStage ? "step" : undefined}
                  >
                    {stageLabels[stage]}
                    {stageComplete[stage] ? " ✓" : ""}
                  </button>
                ))}
              </div>
            </div>
            {stageError && <p className="text-sm text-amber-700">{stageError}</p>}
          </section>

          {activeStage === "facts" && (
            <>
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
                  <section className="workspace-phase-panel assistant-draft-status">
                    <div className="assistant-draft-status__header">
                      <div>
                        <h2>{t("incident.assistant.draftStatusTitle")}</h2>
                        <p className="text-sm text-slate-600">
                          {assistantDraftUpdatedLabel
                            ? t("incident.assistant.draftUpdated", { values: { date: assistantDraftUpdatedLabel } })
                            : t("incident.assistant.draftStatusEmpty")}
                        </p>
                      </div>
                      <div className="assistant-draft-status__summary">
                        {t("incident.assistant.draftSummary", {
                          values: {
                            facts: assistantDraft.facts.length,
                            timeline: assistantTimelineDrafts.length,
                            clarifications: assistantDraft.clarifications.length
                          }
                        })}
                      </div>
                    </div>
                  </section>
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
                        {assistantTimelineDrafts.map((event, index) => (
                          <SheetRow key={event.key}>
                            <SheetCell>
                              <div className="space-y-2">
                                <div className="grid grid-cols-1 gap-2">
                                  <SheetInput
                                    type="date"
                                    className={event.needsTimeReview ? "sheet-input--warning" : ""}
                                    value={event.dateInput}
                                    onChange={(eventInput) =>
                                      handleUpdateAssistantTimeline(index, "date", eventInput.target.value)
                                    }
                                  />
                                  <SheetInput
                                    type="time"
                                    className={event.needsTimeReview ? "sheet-input--warning" : ""}
                                    value={event.timeInput}
                                    onChange={(eventInput) =>
                                      handleUpdateAssistantTimeline(index, "time", eventInput.target.value)
                                    }
                                  />
                                </div>
                                <div className="text-xs text-slate-500">{event.timeLabel || t("incident.timeline.previewPlaceholder")}</div>
                              </div>
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
                                value={event.confidence}
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
                                  disabled={index === assistantTimelineDrafts.length - 1}
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
                        {assistantTimelineDrafts.length === 0 && (
                          <SheetRow>
                            <SheetCell colSpan={4} className="sheet-empty-cell">
                              {t("incident.assistant.timeline.empty")}
                            </SheetCell>
                          </SheetRow>
                        )}
                      </SheetBody>
                    </SheetTable>
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
                        <SaveStatus status={assistantSaveStatus} />
                      </div>
                      <div className="assistant-apply-stack">
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            className="btn-primary"
                            onClick={handleApplyAssistantDraft}
                            disabled={assistantTimelineDrafts.length === 0}
                          >
                            {t("incident.assistant.actions.applyTimeline")}
                          </button>
                          <SaveStatus status={assistantApplyStatus} />
                        </div>
                        <p className="text-xs text-slate-500">{t("incident.assistant.applyHint")}</p>
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
                  <div className="flex flex-col gap-2">
                    <label className="text-sm text-slate-600">{t("incident.witness.otherInfoLabel")}</label>
                    <input
                      className="sheet-input"
                      value={personOtherInfo}
                      onChange={(event) => setPersonOtherInfo(event.target.value)}
                      placeholder={t("incident.witness.otherInfoPlaceholder")}
                    />
                  </div>
                  <div className="flex items-end">
                    <button type="button" className="btn-primary" onClick={handleAddPerson}>
                      {t("incident.witness.addPerson")}
                    </button>
                  </div>
                </div>

                {witnessStatus && <p className="text-sm text-slate-500">{witnessStatus}</p>}

                <div className="space-y-4">
                  {incidentCase.persons.map((person) => {
                    const accounts = accountsByPerson.get(person.id) ?? [];
                    const personDraft = personDrafts[person.id] ?? {
                      role: person.role,
                      name: person.name ?? "",
                      otherInfo: person.otherInfo ?? ""
                    };
                    return (
                      <div key={person.id} className="rounded-lg border border-slate-200 p-4 space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 flex-1">
                            <label className="text-sm text-slate-600">
                              {t("incident.witness.roleLabel")}
                              <SheetInput
                                value={personDraft.role}
                                onChange={(event) =>
                                  setPersonDrafts((prev) => ({
                                    ...prev,
                                    [person.id]: { ...personDraft, role: event.target.value }
                                  }))
                                }
                              />
                            </label>
                            <label className="text-sm text-slate-600">
                              {t("incident.witness.nameLabel")}
                              <SheetInput
                                value={personDraft.name}
                                onChange={(event) =>
                                  setPersonDrafts((prev) => ({
                                    ...prev,
                                    [person.id]: { ...personDraft, name: event.target.value }
                                  }))
                                }
                              />
                            </label>
                            <label className="text-sm text-slate-600">
                              {t("incident.witness.otherInfoLabel")}
                              <SheetInput
                                value={personDraft.otherInfo}
                                onChange={(event) =>
                                  setPersonDrafts((prev) => ({
                                    ...prev,
                                    [person.id]: { ...personDraft, otherInfo: event.target.value }
                                  }))
                                }
                              />
                            </label>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button type="button" className="btn-outline" onClick={() => handleSavePerson(person.id)}>
                              {t("incident.witness.savePerson")}
                            </button>
                            <button type="button" className="btn-outline" onClick={() => handleAddAccount(person.id)}>
                              {t("incident.witness.addAccount")}
                            </button>
                          </div>
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
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="workspace-phase-panel">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2>{t("incident.timeline.title")}</h2>
                    <p className="text-sm text-slate-600">{t("incident.timeline.subtitle")}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {timelineViewOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={option.id === activeTimelineView ? "btn-primary" : "btn-outline"}
                        onClick={() => setActiveTimelineView(option.id)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <SaveStatus status={timelineStatus} />

                {activeTimelineView === "merged" ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="btn-outline" onClick={handleMergeTimeline}>
                          {t("incident.timeline.merge")}
                        </button>
                        <button type="button" className="btn-outline" onClick={handleSortTimeline}>
                          {t("incident.timeline.sort")}
                        </button>
                        <button type="button" className="btn-outline" onClick={handleCheckConsistency}>
                          {t("incident.timeline.checkConsistency")}
                        </button>
                      </div>
                    </div>

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
                          <SheetRow key={event.key}>
                            <SheetCell className="sheet-cell-number">{index + 1}</SheetCell>
                            <SheetCell>
                              <div className="space-y-2">
                                <SheetInput
                                  type="date"
                                  className={event.needsTimeReview ? "sheet-input--warning" : ""}
                                  value={event.dateInput}
                                  onChange={(eventInput) =>
                                    handleUpdateTimeline(index, "date", eventInput.target.value)
                                  }
                                />
                                <SheetInput
                                  type="time"
                                  className={event.needsTimeReview ? "sheet-input--warning" : ""}
                                  value={event.timeInput}
                                  onChange={(eventInput) =>
                                    handleUpdateTimeline(index, "time", eventInput.target.value)
                                  }
                                />
                                <div className="text-xs text-slate-500">
                                  {event.timeLabel || t("incident.timeline.previewPlaceholder")}
                                </div>
                              </div>
                            </SheetCell>
                            <SheetCell>
                              <SheetTextarea
                                value={event.text}
                                onChange={(eventInput) =>
                                  handleUpdateTimeline(index, "text", eventInput.target.value)
                                }
                                placeholder={t("incident.timeline.eventPlaceholder")}
                              />
                            </SheetCell>
                            <SheetCell>
                              <SheetSelect
                                value={event.confidence}
                                onChange={(eventInput) =>
                                  handleUpdateTimeline(index, "confidence", eventInput.target.value)
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
                              {(timelineSourceLabels.get(event.id ?? "") ?? []).join(", ") || t("common.noData")}
                            </SheetCell>
                            <SheetCell className="sheet-cell-actions">
                              <div className="sheet-actions-grid">
                                <SheetButton
                                  variant="icon"
                                  onClick={() => handleMoveTimeline(index, "up")}
                                  disabled={index === 0}
                                  title={t("common.moveUp")}
                                  aria-label={t("common.moveUp")}
                                >
                                  ^
                                </SheetButton>
                                <SheetButton
                                  variant="icon"
                                  onClick={() => handleMoveTimeline(index, "down")}
                                  disabled={index === timelineDrafts.length - 1}
                                  title={t("common.moveDown")}
                                  aria-label={t("common.moveDown")}
                                >
                                  v
                                </SheetButton>
                                <SheetButton variant="danger" onClick={() => handleRemoveTimelineRow(index)}>
                                  {t("common.remove")}
                                </SheetButton>
                              </div>
                            </SheetCell>
                          </SheetRow>
                        ))}
                        <SheetAddRow>
                          <SheetCell colSpan={6}>
                            <SheetButton variant="primary" onClick={handleAddTimelineRow}>
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
                  </>
                ) : (
                  <>
                    {(() => {
                      const account = incidentCase.accounts.find((item) => item.id === activeTimelineView);
                      if (!account) {
                        return <p className="text-sm text-slate-500">{t("incident.timeline.noWitnessSelected")}</p>;
                      }
                      const events = personalTimelineDrafts[account.id] ?? [];
                      return (
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-sm font-semibold text-slate-800">
                              {t("incident.timeline.witnessHeading", {
                                values: {
                                  name: account.person?.name || account.person?.role || t("incident.timeline.witnessFallback")
                                }
                              })}
                            </h3>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="btn-outline"
                                onClick={() => handleSortPersonalEvents(account.id)}
                              >
                                {t("incident.timeline.sort")}
                              </button>
                              <button
                                type="button"
                                className="btn-outline"
                                onClick={() => handleSavePersonalEvents(account.id)}
                              >
                                {t("incident.timeline.savePersonal")}
                              </button>
                            </div>
                          </div>
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
                                <SheetHeaderCell>{t("incident.timeline.table.time")}</SheetHeaderCell>
                                <SheetHeaderCell>{t("incident.timeline.table.event")}</SheetHeaderCell>
                                <SheetHeaderCell>{t("incident.timeline.table.actions")}</SheetHeaderCell>
                              </SheetRow>
                            </SheetHead>
                            <SheetBody>
                              {events.map((event, index) => (
                                <SheetRow key={event.key}>
                                  <SheetCell className="sheet-cell-number">{index + 1}</SheetCell>
                                  <SheetCell>
                                    <div className="space-y-2">
                                      <SheetInput
                                        type="date"
                                        className={event.needsTimeReview ? "sheet-input--warning" : ""}
                                        value={event.dateInput}
                                        onChange={(eventInput) =>
                                          handleUpdatePersonalEvent(account.id, index, "date", eventInput.target.value)
                                        }
                                      />
                                      <SheetInput
                                        type="time"
                                        className={event.needsTimeReview ? "sheet-input--warning" : ""}
                                        value={event.timeInput}
                                        onChange={(eventInput) =>
                                          handleUpdatePersonalEvent(account.id, index, "time", eventInput.target.value)
                                        }
                                      />
                                      <div className="text-xs text-slate-500">
                                        {event.timeLabel || t("incident.timeline.previewPlaceholder")}
                                      </div>
                                    </div>
                                  </SheetCell>
                                  <SheetCell>
                                    <SheetTextarea
                                      value={event.text}
                                      onChange={(eventInput) =>
                                        handleUpdatePersonalEvent(account.id, index, "text", eventInput.target.value)
                                      }
                                      placeholder={t("incident.timeline.eventPlaceholder")}
                                    />
                                  </SheetCell>
                                  <SheetCell className="sheet-cell-actions">
                                    <div className="sheet-actions-grid">
                                      <SheetButton
                                        variant="icon"
                                        onClick={() => handleMovePersonalEvent(account.id, index, "up")}
                                        disabled={index === 0}
                                        title={t("common.moveUp")}
                                        aria-label={t("common.moveUp")}
                                      >
                                        ^
                                      </SheetButton>
                                      <SheetButton
                                        variant="icon"
                                        onClick={() => handleMovePersonalEvent(account.id, index, "down")}
                                        disabled={index === events.length - 1}
                                        title={t("common.moveDown")}
                                        aria-label={t("common.moveDown")}
                                      >
                                        v
                                      </SheetButton>
                                      <SheetButton
                                        variant="danger"
                                        onClick={() => handleRemovePersonalEvent(account.id, index)}
                                      >
                                        {t("common.remove")}
                                      </SheetButton>
                                    </div>
                                  </SheetCell>
                                </SheetRow>
                              ))}
                              <SheetAddRow>
                                <SheetCell colSpan={4}>
                                  <SheetButton variant="primary" onClick={() => handleAddPersonalEvent(account.id)}>
                                    {t("incident.timeline.addPersonal")}
                                  </SheetButton>
                                </SheetCell>
                              </SheetAddRow>
                            </SheetBody>
                          </SheetTable>
                        </div>
                      );
                    })()}
                  </>
                )}
              </section>

              {activeTimelineView === "merged" && (
                <section className="workspace-phase-panel">
                  <TimelineAttachmentsPanel caseId={incidentCase.id} timeline={incidentCase.timelineEvents} />
                </section>
              )}

              <section className="workspace-phase-panel">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <button type="button" className="btn-outline" onClick={handleSaveTimeline}>
                      {t("incident.flow.actions.saveFacts")}
                    </button>
                    <SaveStatus status={timelineStatus} />
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="button" className="btn-outline" onClick={handlePrevStage} disabled>
                      {t("incident.flow.actions.back")}
                    </button>
                    <button type="button" className="btn-primary" onClick={handleNextStage} disabled={!factsComplete}>
                      {t("incident.flow.actions.next")}
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}

          {activeStage === "causes" && (
            <>
              <section className="workspace-phase-panel">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2>{t("incident.causes.title")}</h2>
                    <p className="text-sm text-slate-600">{t("incident.causes.subtitle")}</p>
                  </div>
                  <button type="button" className="btn-outline" onClick={handleAssistCauses}>
                    {t("incident.coaching.causes.action")}
                  </button>
                </div>
                {causeQuestionStatus && <p className="text-sm text-slate-500">{causeQuestionStatus}</p>}
                {causeQuestions.length > 0 && (
                  <ul className="list-disc pl-5 text-sm text-slate-600">
                    {causeQuestions.map((question, index) => (
                      <li key={`${question}-${index}`}>{question}</li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="workspace-phase-panel">
                <SheetTable>
                  <colgroup>
                    <col className="sheet-col-number" />
                    <col className="sheet-col-description" />
                    <col className="sheet-col-label" />
                    <col className="sheet-col-actions" />
                  </colgroup>
                  <SheetHead>
                    <SheetRow>
                      <SheetHeaderCell>#</SheetHeaderCell>
                      <SheetHeaderCell>{t("incident.causes.table.event")}</SheetHeaderCell>
                      <SheetHeaderCell>{t("incident.causes.table.statement")}</SheetHeaderCell>
                      <SheetHeaderCell>{t("incident.causes.table.actions")}</SheetHeaderCell>
                    </SheetRow>
                  </SheetHead>
                  <SheetBody>
                    {timelineDrafts.map((event, index) => {
                      const selected = proximateCauseNodes.find((node) => node.timelineEventId === event.id);
                      return (
                        <SheetRow key={event.key}>
                          <SheetCell className="sheet-cell-number">{index + 1}</SheetCell>
                          <SheetCell>
                            <div className="text-sm text-slate-700">
                              <div className="text-xs text-slate-500">{event.timeLabel || t("incident.timeline.previewPlaceholder")}</div>
                              {event.text}
                            </div>
                          </SheetCell>
                          <SheetCell>
                            <SheetTextarea
                              value={selected?.statement ?? ""}
                              onChange={(eventInput) =>
                                selected
                                  ? handleUpdateCauseNode(selected.key, "statement", eventInput.target.value)
                                  : undefined
                              }
                              placeholder={t("incident.causes.placeholders.statement")}
                              disabled={!selected}
                            />
                          </SheetCell>
                          <SheetCell>
                            <SheetButton
                              variant={selected ? "danger" : "primary"}
                              onClick={() => handleToggleProximateCause(event.id ?? "", event.text)}
                              disabled={!event.id}
                            >
                              {selected ? t("incident.causes.remove") : t("incident.causes.select")}
                            </SheetButton>
                          </SheetCell>
                        </SheetRow>
                      );
                    })}
                  </SheetBody>
                </SheetTable>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <button type="button" className="btn-outline" onClick={handleSaveCauseNodes}>
                      {t("incident.causes.save")}
                    </button>
                    {causeStatus && <span className="text-sm text-slate-500">{causeStatus}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="button" className="btn-outline" onClick={handlePrevStage}>
                      {t("incident.flow.actions.back")}
                    </button>
                    <button type="button" className="btn-primary" onClick={handleNextStage} disabled={!causesComplete}>
                      {t("incident.flow.actions.next")}
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}

          {activeStage === "root-causes" && (
            <>
              <section className="workspace-phase-panel">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2>{t("incident.rootCauses.title")}</h2>
                    <p className="text-sm text-slate-600">{t("incident.rootCauses.subtitle")}</p>
                  </div>
                  <button type="button" className="btn-outline" onClick={handleAssistRootCauses}>
                    {t("incident.coaching.rootCauses.action")}
                  </button>
                </div>
                {rootCauseStatus && <p className="text-sm text-slate-500">{rootCauseStatus}</p>}
                {Object.keys(rootCauseQuestions).length > 0 && (
                  <div className="space-y-2 text-sm text-slate-600">
                    {Object.entries(rootCauseQuestions).map(([causeNodeId, question]) => {
                      const node = causeNodeDrafts.find((item) => item.id === causeNodeId);
                      return (
                        <div key={causeNodeId} className="rounded border border-slate-200 p-2">
                          <p className="text-xs text-slate-500">{node?.statement}</p>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p>{question}</p>
                            {node && (
                              <button
                                type="button"
                                className="btn-outline btn-small"
                                onClick={() => handleUpdateCauseNode(node.key, "question", question)}
                              >
                                {t("incident.rootCauses.useQuestion")}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="workspace-phase-panel">
                {renderCauseTree(null, 0, true, false)}
                <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
                  <div className="flex items-center gap-3">
                    <button type="button" className="btn-outline" onClick={handleSaveCauseNodes}>
                      {t("incident.rootCauses.save")}
                    </button>
                    {causeStatus && <span className="text-sm text-slate-500">{causeStatus}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="button" className="btn-outline" onClick={handlePrevStage}>
                      {t("incident.flow.actions.back")}
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleNextStage}
                      disabled={!rootCausesComplete}
                    >
                      {t("incident.flow.actions.next")}
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}

          {activeStage === "actions" && (
            <>
              <section className="workspace-phase-panel">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2>{t("incident.actions.title")}</h2>
                    <p className="text-sm text-slate-600">{t("incident.actions.subtitle")}</p>
                  </div>
                  <button type="button" className="btn-outline" onClick={handleAssistActions}>
                    {t("incident.coaching.actions.action")}
                  </button>
                </div>
                <p className="text-xs text-slate-500">{t("incident.actions.aidNotice")}</p>
                {actionSuggestionStatus && <p className="text-sm text-slate-500">{actionSuggestionStatus}</p>}
                {actionSuggestions.length > 0 && (
                  <div className="space-y-2 text-sm text-slate-600">
                    {actionSuggestions.map((suggestion, index) => {
                      const node = causeNodeDrafts.find((item) => item.id === suggestion.causeNodeId);
                      return (
                        <div key={`${suggestion.causeNodeId}-${index}`} className="rounded border border-slate-200 p-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="text-xs text-slate-500">{node?.statement}</p>
                              <p>{suggestion.description}</p>
                              <p className="text-xs text-slate-500">{stopCategoryLabels[suggestion.category]}</p>
                            </div>
                            <button
                              type="button"
                              className="btn-outline btn-small"
                              onClick={() => handleApplySuggestion(suggestion)}
                            >
                              {t("incident.actions.addSuggested")}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="workspace-phase-panel">
                {renderCauseTree(null, 0, false, true)}
                <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
                  <div className="flex items-center gap-3">
                    <button type="button" className="btn-outline" onClick={handleSaveActions}>
                      {t("incident.actions.save")}
                    </button>
                    {actionStatus && <span className="text-sm text-slate-500">{actionStatus}</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="button" className="btn-outline" onClick={handlePrevStage}>
                      {t("incident.flow.actions.back")}
                    </button>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleNextStage}
                      disabled={!actionsComplete}
                    >
                      {t("incident.flow.actions.next")}
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}

          {activeStage === "review" && (
            <section className="workspace-phase-panel">
              <div>
                <h2>{t("incident.review.title")}</h2>
                <p className="text-sm text-slate-600">{t("incident.review.subtitle")}</p>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">{t("incident.review.timelineTitle")}</h3>
                  {timelineDrafts.length === 0 ? (
                    <p className="text-sm text-slate-500">{t("incident.review.emptyTimeline")}</p>
                  ) : (
                    <ul className="list-disc pl-5 text-sm text-slate-600">
                      {timelineDrafts.map((event) => (
                        <li key={event.key}>
                          {event.timeLabel || t("incident.timeline.previewPlaceholder")}: {event.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">{t("incident.review.causesTitle")}</h3>
                  {causeNodeDrafts.length === 0 ? (
                    <p className="text-sm text-slate-500">{t("incident.review.emptyCauses")}</p>
                  ) : (
                    <ul className="list-disc pl-5 text-sm text-slate-600">
                      {causeNodeDrafts.map((node) => (
                        <li key={node.key}>{node.statement}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-700">{t("incident.review.actionsTitle")}</h3>
                  {actionDrafts.length === 0 ? (
                    <p className="text-sm text-slate-500">{t("incident.review.emptyActions")}</p>
                  ) : (
                    <ul className="list-disc pl-5 text-sm text-slate-600">
                      {actionDrafts.map((action) => (
                        <li key={action.key}>{action.description}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 mt-4">
                <button type="button" className="btn-outline" onClick={handlePrevStage}>
                  {t("incident.flow.actions.back")}
                </button>
              </div>
            </section>
          )}
        </div>
      </main>
      <RecentCasesModal
        open={loadModalOpen}
        onClose={() => setLoadModalOpen(false)}
        title={t("landing.incident.recent.title")}
        subtitle={t("landing.incident.recent.subtitle")}
        searchPlaceholder={t("common.searchPlaceholder")}
        items={recentCases}
        loading={casesLoading}
        error={casesError}
        emptyText={t("landing.incident.recent.empty")}
        loadingText={t("landing.incident.recent.loading")}
        loadLabel={t("common.load")}
        onSelect={(item) => handleLoadById(item.id)}
        getTitle={(item) => item.title}
        getMeta={(item) =>
          `${item.location || t("workspace.locationPending")} · ${incidentTypeLabels[item.incidentType]}`
        }
        getSearchText={(item) =>
          `${item.title} ${item.location ?? ""} ${incidentTypeLabels[item.incidentType]} ${item.id}`.trim()
        }
        getUpdatedLabel={(item) =>
          t("landing.incident.recent.updated", { values: { date: formatDateTime(item.updatedAt) } })
        }
        loadById={{
          label: t("common.loadById"),
          placeholder: t("landing.incident.load.inputPlaceholder"),
          actionLabel: t("common.load"),
          onLoad: handleLoadById
        }}
      />
      {dialog}
    </div>
  );
};
