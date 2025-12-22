import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AssistantPanel } from "@/components/common/AssistantPanel";
import { RecentCasesModal } from "@/components/common/RecentCasesModal";
import { SaveStatus } from "@/components/common/SaveStatus";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { UserMenu } from "@/components/common/UserMenu";
import { WorkspaceTopBar } from "@/components/common/WorkspaceTopBar";
import { OverflowMenu } from "@/components/common/OverflowMenu";
import { apiFetch } from "@/lib/api";
import { combineDateTimeInputs, formatDateInput, formatTimeInput } from "@/lib/dateInputs";
import {
  SheetBody,
  SheetButton,
  SheetCell,
  SheetHead,
  SheetHeaderCell,
  SheetInput,
  SheetRow,
  SheetTable,
  SheetTextarea
} from "@/components/ui/SheetTable";
import { useJhaContext } from "@/contexts/JhaContext";
import { JhaAttachmentsPanel } from "@/components/jha/JhaAttachmentsPanel";
import type { JhaCaseSummary, JhaHazard, JhaPatchCommand, JhaStep } from "@/types/jha";
import { useI18n } from "@/i18n/I18nContext";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { useSaveStatus } from "@/hooks/useSaveStatus";

type StepDraft = {
  key: string;
  id?: string;
  label: string;
};

type HazardDraft = {
  key: string;
  id?: string;
  stepKey: string;
  hazard: string;
  consequence: string;
  controls: string;
};

type JhaStage = "steps" | "hazards" | "controls" | "review";

const STAGE_ORDER: JhaStage[] = ["steps", "hazards", "controls", "review"];

const jsonFetch = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const headers = new Headers(init?.headers ?? {});
  if (init?.body && !(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await apiFetch(path, { ...init, headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return (await response.json()) as T;
};

const parseControls = (value: string) =>
  value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

const isBlankHazard = (hazard: HazardDraft) =>
  hazard.hazard.trim().length === 0 &&
  hazard.consequence.trim().length === 0 &&
  hazard.controls.trim().length === 0;

const hasHazardContent = (hazard: HazardDraft) =>
  hazard.hazard.trim().length > 0 ||
  hazard.consequence.trim().length > 0 ||
  parseControls(hazard.controls).length > 0;

const createKey = (prefix: string) => {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
};

const createBlankHazard = (stepKey: string): HazardDraft => ({
  key: createKey("hazard"),
  stepKey,
  hazard: "",
  consequence: "",
  controls: ""
});

export const JhaEditor = () => {
  const navigate = useNavigate();
  const { t, formatDateTime } = useI18n();
  const { jhaCase, saving, actions } = useJhaContext();
  const [caseDraft, setCaseDraft] = useState({
    jobTitle: jhaCase.jobTitle,
    site: jhaCase.site ?? "",
    supervisor: jhaCase.supervisor ?? "",
    workersInvolved: jhaCase.workersInvolved ?? "",
    jobDate: formatDateInput(jhaCase.jobDate),
    jobTime: formatTimeInput(jhaCase.jobDate),
    revision: jhaCase.revision ?? "",
    preparedBy: jhaCase.preparedBy ?? "",
    reviewedBy: jhaCase.reviewedBy ?? "",
    approvedBy: jhaCase.approvedBy ?? "",
    signoffDate: formatDateInput(jhaCase.signoffDate),
    signoffTime: formatTimeInput(jhaCase.signoffDate)
  });
  const [stepAssistantNotes, setStepAssistantNotes] = useState("");
  const [stepAssistantStatus, setStepAssistantStatus] = useState<string | null>(null);
  const [stepAssistantClarification, setStepAssistantClarification] = useState<string | null>(null);
  const [stepAssistantSummary, setStepAssistantSummary] = useState<string | null>(null);
  const [stepSuggestions, setStepSuggestions] = useState<Array<{ id: string; command: JhaPatchCommand; selected: boolean }>>([]);
  const [hazardAssistantNotes, setHazardAssistantNotes] = useState("");
  const [hazardAssistantStatus, setHazardAssistantStatus] = useState<string | null>(null);
  const [hazardAssistantClarification, setHazardAssistantClarification] = useState<string | null>(null);
  const [hazardAssistantSummary, setHazardAssistantSummary] = useState<string | null>(null);
  const [hazardSuggestions, setHazardSuggestions] = useState<
    Array<{ id: string; command: JhaPatchCommand; selected: boolean }>
  >([]);
  const [controlSuggestionStatus, setControlSuggestionStatus] = useState<string | null>(null);
  const [controlSuggestions, setControlSuggestions] = useState<Record<string, string[]>>({});
  const [loadModalOpen, setLoadModalOpen] = useState(false);
  const [recentCases, setRecentCases] = useState<JhaCaseSummary[]>([]);
  const [casesLoading, setCasesLoading] = useState(false);
  const [casesError, setCasesError] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<JhaStage>(() =>
    STAGE_ORDER.includes(jhaCase.workflowStage as JhaStage) ? (jhaCase.workflowStage as JhaStage) : "steps"
  );
  const [stageError, setStageError] = useState<string | null>(null);
  const [stepDrafts, setStepDrafts] = useState<StepDraft[]>([]);
  const [hazardDrafts, setHazardDrafts] = useState<HazardDraft[]>([]);
  const { confirm, dialog } = useConfirmDialog();
  const { status: metaStatus, show: showMetaStatus, showSuccess: showMetaSuccess, showError: showMetaError } =
    useSaveStatus();
  const { status: tableStatus, show: showTableStatus, showSuccess: showTableSuccess, showError: showTableError } =
    useSaveStatus();
  const { status: exportStatus, show: showExportStatus, showSuccess: showExportSuccess, showError: showExportError } =
    useSaveStatus();
  const defaultStepLabel = (index: number) => t("jha.steps.defaultLabel", { values: { index: index + 1 } });

  const fetchRecentCases = useCallback(async () => {
    setCasesLoading(true);
    setCasesError(null);
    try {
      const response = await apiFetch("/api/jha-cases?limit=20");
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as { cases: JhaCaseSummary[] };
      setRecentCases(data.cases ?? []);
    } catch (error) {
      setCasesError(error instanceof Error ? error.message : t("landing.jha.errors.loadFailed"));
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
    setCaseDraft({
      jobTitle: jhaCase.jobTitle,
      site: jhaCase.site ?? "",
      supervisor: jhaCase.supervisor ?? "",
      workersInvolved: jhaCase.workersInvolved ?? "",
      jobDate: formatDateInput(jhaCase.jobDate),
      jobTime: formatTimeInput(jhaCase.jobDate),
      revision: jhaCase.revision ?? "",
      preparedBy: jhaCase.preparedBy ?? "",
      reviewedBy: jhaCase.reviewedBy ?? "",
      approvedBy: jhaCase.approvedBy ?? "",
      signoffDate: formatDateInput(jhaCase.signoffDate),
      signoffTime: formatTimeInput(jhaCase.signoffDate)
    });

    setStepDrafts(
      jhaCase.steps.map((step) => ({
        key: step.id,
        id: step.id,
        label: step.label
      }))
    );

    const sortedHazards = [...jhaCase.hazards].sort((a, b) => a.orderIndex - b.orderIndex);
    setHazardDrafts(
      sortedHazards.map((hazard) => ({
        key: hazard.id,
        id: hazard.id,
        stepKey: hazard.stepId,
        hazard: hazard.hazard,
        consequence: hazard.consequence ?? "",
        controls: (hazard.controls ?? []).join("\n")
      }))
    );

    const nextStage = STAGE_ORDER.includes(jhaCase.workflowStage as JhaStage)
      ? (jhaCase.workflowStage as JhaStage)
      : "steps";
    setActiveStage((prev) => (prev === nextStage ? prev : nextStage));
    setControlSuggestions({});
    setControlSuggestionStatus(null);
    setStepAssistantClarification(null);
    setHazardAssistantClarification(null);
    setStepAssistantSummary(null);
    setHazardAssistantSummary(null);
    setStepSuggestions([]);
    setHazardSuggestions([]);
  }, [jhaCase]);

  const stepsByKey = useMemo(() => {
    const map = new Map<string, StepDraft>();
    stepDrafts.forEach((step) => map.set(step.key, step));
    return map;
  }, [stepDrafts]);

  const stepNumberByKey = useMemo(() => {
    const map = new Map<string, number>();
    stepDrafts.forEach((step, index) => map.set(step.key, index + 1));
    return map;
  }, [stepDrafts]);

  const stepOrderKey = useMemo(() => stepDrafts.map((step) => step.key).join("|"), [stepDrafts]);

  const formatStepLabel = (stepKey: string) => {
    const step = stepsByKey.get(stepKey);
    const number = stepNumberByKey.get(stepKey);
    const label = step?.label || t("jha.hazards.untitledStep");
    return number ? `${number}. ${label}` : label;
  };

  const normalizeHazardDrafts = useCallback(
    (hazards: HazardDraft[]) => {
      const stepKeys = stepDrafts.map((step) => step.key);
      const stepKeySet = new Set(stepKeys);
      const hazardsByStep = new Map<string, HazardDraft[]>();
      stepKeys.forEach((key) => hazardsByStep.set(key, []));

      hazards.forEach((hazard) => {
        if (!stepKeySet.has(hazard.stepKey)) {
          return;
        }
        const list = hazardsByStep.get(hazard.stepKey);
        if (list) {
          list.push(hazard);
        }
      });

      const normalized: HazardDraft[] = [];
      stepKeys.forEach((stepKey) => {
        const list = hazardsByStep.get(stepKey) ?? [];
        if (list.length === 0) {
          normalized.push(createBlankHazard(stepKey));
        } else {
          normalized.push(...list);
        }
      });

      return normalized;
    },
    [stepDrafts]
  );

  useEffect(() => {
    if (stepDrafts.length === 0) {
      setHazardDrafts([]);
      return;
    }
    setHazardDrafts((prev) => normalizeHazardDrafts(prev));
  }, [normalizeHazardDrafts, stepOrderKey, stepDrafts.length]);

  const stepsComplete = stepDrafts.length > 0 && stepDrafts.every((step) => step.label.trim().length > 0);
  const hazardsWithContent = hazardDrafts.filter((hazard) => hasHazardContent(hazard));
  const hazardsWithDefinition = hazardsWithContent.filter((hazard) => hazard.hazard.trim().length > 0);
  const hazardsComplete =
    hazardsWithContent.length > 0 && hazardsWithContent.every((hazard) => hazard.hazard.trim().length > 0);
  const controlsComplete =
    hazardsWithDefinition.length === 0 ||
    hazardsWithDefinition.every((hazard) => parseControls(hazard.controls).length > 0);
  const stageComplete: Record<JhaStage, boolean> = {
    steps: stepsComplete,
    hazards: hazardsComplete,
    controls: controlsComplete,
    review: controlsComplete
  };

  const persistStage = async (stage: JhaStage) => {
    try {
      await jsonFetch(`/api/jha-cases/${jhaCase.id}`, {
        method: "PATCH",
        body: JSON.stringify({ workflowStage: stage })
      });
    } catch (error) {
      console.error("[JhaEditor] Unable to persist workflow stage", error);
    }
  };

  const canEnterStage = (stage: JhaStage) => {
    if (stage !== "steps" && !stepsComplete) {
      setStageError(t("jha.flow.errors.stepsIncomplete"));
      return false;
    }
    if (stage === "review" && !controlsComplete) {
      setStageError(t("jha.flow.errors.controlsIncomplete"));
      return false;
    }
    return true;
  };

  const handleStageChange = (stage: JhaStage) => {
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
      setStageError(null);
      setActiveStage(prevStage);
      void persistStage(prevStage);
    }
  };

  const handleSaveMeta = async () => {
    if (!caseDraft.jobTitle.trim()) {
      showMetaError(t("jha.details.errors.jobTitleRequired"));
      return;
    }
    showMetaStatus({ message: t("jha.details.status.saving"), tone: "info" });
    try {
      await actions.updateCaseMeta({
        jobTitle: caseDraft.jobTitle.trim(),
        site: caseDraft.site.trim() || null,
        supervisor: caseDraft.supervisor.trim() || null,
        workersInvolved: caseDraft.workersInvolved.trim() || null,
        jobDate: combineDateTimeInputs(caseDraft.jobDate, caseDraft.jobTime),
        revision: caseDraft.revision.trim() || null,
        preparedBy: caseDraft.preparedBy.trim() || null,
        reviewedBy: caseDraft.reviewedBy.trim() || null,
        approvedBy: caseDraft.approvedBy.trim() || null,
        signoffDate: combineDateTimeInputs(caseDraft.signoffDate, caseDraft.signoffTime)
      });
      showMetaSuccess(t("jha.details.status.saved"), 2500);
    } catch (error) {
      showMetaError(error instanceof Error ? error.message : t("jha.details.status.saveFailed"));
    }
  };

  const handleAddStep = () => {
    const key = createKey("step");
    setStepDrafts((prev) => [
      ...prev,
      {
        key,
        label: defaultStepLabel(prev.length)
      }
    ]);
  };

  const handleMoveStep = (index: number, direction: "up" | "down") => {
    setStepDrafts((prev) => {
      const next = [...prev];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };

  const handleRemoveStep = async (index: number) => {
    const step = stepDrafts[index];
    if (!step) return;
    const hazardsForStep = hazardDrafts.filter((hazard) => hazard.stepKey === step.key);
    if (hazardsForStep.length > 0) {
      const ok = await confirm({
        title: t("common.delete"),
        description: t("jha.steps.confirmRemove"),
        confirmLabel: t("common.delete"),
        cancelLabel: t("common.cancel"),
        tone: "danger"
      });
      if (!ok) return;
    }
    setHazardDrafts((prevHazards) => prevHazards.filter((hazard) => hazard.stepKey !== step.key));
    setStepDrafts((prevSteps) => prevSteps.filter((_, idx) => idx !== index));
  };

  const handleAddHazard = () => {
    let stepKey = stepDrafts[stepDrafts.length - 1]?.key;
    if (!stepKey) {
      const key = createKey("step");
      stepKey = key;
      setStepDrafts([{ key, label: defaultStepLabel(0) }]);
    }
    const hazardKey = createKey("hazard");
    const draft: HazardDraft = {
      key: hazardKey,
      stepKey,
      hazard: "",
      consequence: "",
      controls: ""
    };
    setHazardDrafts((prev) => {
      const next = normalizeHazardDrafts(prev);
      const hasBlank = next.some((item) => item.stepKey === stepKey && isBlankHazard(item));
      if (hasBlank) {
        return next;
      }
      const lastIndex = [...next]
        .map((item, idx) => (item.stepKey === stepKey ? idx : -1))
        .filter((idx) => idx >= 0)
        .pop();
      const insertIndex = lastIndex !== undefined ? lastIndex + 1 : next.length;
      next.splice(insertIndex, 0, draft);
      return next;
    });
  };

  const handleMoveHazard = (index: number, direction: "up" | "down") => {
    setHazardDrafts((prev) => {
      const next = [...prev];
      const current = next[index];
      if (!current) return prev;
      const stepKey = current.stepKey;
      let target = -1;
      if (direction === "up") {
        for (let i = index - 1; i >= 0; i -= 1) {
          if (next[i]?.stepKey === stepKey) {
            target = i;
            break;
          }
        }
      } else {
        for (let i = index + 1; i < next.length; i += 1) {
          if (next[i]?.stepKey === stepKey) {
            target = i;
            break;
          }
        }
      }
      if (target < 0) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };

  const handleRemoveHazard = (index: number) => {
    setHazardDrafts((prev) => normalizeHazardDrafts(prev.filter((_, idx) => idx !== index)));
  };

  const handleMoveHazardToStep = (index: number, nextStepKey: string) => {
    setHazardDrafts((prev) => {
      const current = prev[index];
      if (!current) return prev;
      if (current.stepKey === nextStepKey) return prev;
      const remaining = prev.filter((_, idx) => idx !== index);
      const normalized = normalizeHazardDrafts(remaining);
      const targetIndices = normalized
        .map((item, idx) => (item.stepKey === nextStepKey ? idx : -1))
        .filter((idx) => idx >= 0);
      if (targetIndices.length === 1 && isBlankHazard(normalized[targetIndices[0]]!)) {
        normalized.splice(targetIndices[0]!, 1);
      }
      const moved: HazardDraft = { ...current, stepKey: nextStepKey };
      const lastIndex = [...normalized]
        .map((item, idx) => (item.stepKey === nextStepKey ? idx : -1))
        .filter((idx) => idx >= 0)
        .pop();
      const insertIndex = lastIndex !== undefined ? lastIndex + 1 : normalized.length;
      normalized.splice(insertIndex, 0, moved);
      return normalized;
    });
  };

  const handleApplyControlSuggestion = (index: number, hazardId: string | undefined, control: string) => {
    const nextControl = control.trim();
    if (!nextControl) return;
    setHazardDrafts((prev) =>
      prev.map((item, idx) => {
        if (idx !== index) return item;
        const existing = parseControls(item.controls);
        if (existing.some((value) => value.toLowerCase() === nextControl.toLowerCase())) {
          return item;
        }
        return {
          ...item,
          controls: [...existing, nextControl].join("\n")
        };
      })
    );
    if (!hazardId) return;
    setControlSuggestions((prev) => {
      const next = { ...prev };
      const list = next[hazardId];
      if (!list) return prev;
      const filtered = list.filter((entry) => entry !== control);
      if (filtered.length) {
        next[hazardId] = filtered;
      } else {
        delete next[hazardId];
      }
      return next;
    });
  };

  const persistSteps = async () => {
    const stepsPayload = stepDrafts.map((step, index) => ({
      id: step.id,
      label: step.label.trim() || defaultStepLabel(index),
      orderIndex: index
    }));
    const savedSteps = await jsonFetch<{ steps: JhaStep[] }>(`/api/jha-cases/${jhaCase.id}/steps`, {
      method: "PUT",
      body: JSON.stringify({ steps: stepsPayload })
    });

    const stepIdByKey = new Map<string, string>();
    const stepsById = new Map(savedSteps.steps.map((step) => [step.id, step]));
    const stepsByOrder = [...savedSteps.steps].sort((a, b) => a.orderIndex - b.orderIndex);

    const nextStepDrafts = stepDrafts.map((step, index) => {
      if (step.id && stepsById.has(step.id)) {
        stepIdByKey.set(step.key, step.id);
        return { ...step, label: step.label.trim() || defaultStepLabel(index) };
      }
      const fallback = stepsByOrder[index];
      if (fallback) {
        stepIdByKey.set(step.key, fallback.id);
        return { ...step, id: fallback.id, label: fallback.label };
      }
      return step;
    });

    setStepDrafts(nextStepDrafts);
    return stepIdByKey;
  };

  const persistHazards = async (stepIdByKey: Map<string, string>) => {
    const hazardsToPersist = hazardDrafts.filter((hazard) => hasHazardContent(hazard));
    const hazardsPayload = hazardsToPersist.map((hazard, index) => ({
      id: hazard.id,
      stepId: stepIdByKey.get(hazard.stepKey) ?? hazard.stepKey,
      orderIndex: index,
      hazard: hazard.hazard.trim(),
      consequence: hazard.consequence.trim() || null,
      controls: parseControls(hazard.controls)
    }));

    await jsonFetch<{ hazards: JhaHazard[] }>(`/api/jha-cases/${jhaCase.id}/hazards`, {
      method: "PUT",
      body: JSON.stringify({ hazards: hazardsPayload })
    });
  };

  const handleSaveSteps = async () => {
    showTableStatus({ message: t("jha.table.status.saving"), tone: "info" });
    try {
      await persistSteps();
      await actions.refreshCase();
      showTableSuccess(t("jha.table.status.saved"), 2500);
    } catch (error) {
      console.error(error);
      showTableError(error instanceof Error ? error.message : t("jha.table.status.saveFailed"));
    }
  };

  const handleSaveHazards = async () => {
    showTableStatus({ message: t("jha.table.status.saving"), tone: "info" });
    try {
      const stepIdByKey = await persistSteps();
      await persistHazards(stepIdByKey);
      await actions.refreshCase();
      showTableSuccess(t("jha.table.status.saved"), 2500);
    } catch (error) {
      console.error(error);
      showTableError(error instanceof Error ? error.message : t("jha.table.status.saveFailed"));
    }
  };

  const handleSaveControls = async () => {
    await handleSaveHazards();
  };

  const handleSaveReview = async () => {
    await handleSaveHazards();
  };

  const stageLabels: Record<JhaStage, string> = {
    steps: t("jha.flow.stages.steps"),
    hazards: t("jha.flow.stages.hazards"),
    controls: t("jha.flow.stages.controls"),
    review: t("jha.flow.stages.review")
  };

  const handleAssistSteps = async () => {
    const notes = stepAssistantNotes.trim();
    if (!notes) return;
    setStepAssistantStatus(t("jha.assistant.status.updatingSteps"));
    setStepAssistantClarification(null);
    setStepAssistantSummary(null);
    setStepSuggestions([]);
    try {
      await persistSteps();
      const result = await actions.assistSteps(notes);
      if (result?.needsClarification) {
        setStepAssistantStatus(t("jha.assistant.status.needsClarification"));
        setStepAssistantClarification(
          result.clarificationPrompt || t("jha.assistant.status.clarificationFallback")
        );
        return;
      }
      const commands = (result?.commands ?? []).filter((command) => command.target === "step");
      if (!commands.length) {
        setStepAssistantStatus(t("jha.assistant.status.noChanges"));
        setTimeout(() => setStepAssistantStatus(null), 2500);
        return;
      }
      setStepAssistantSummary(result?.summary ?? null);
      setStepSuggestions(commands.map((command) => ({ id: createKey("step-suggestion"), command, selected: true })));
      setStepAssistantNotes("");
      setStepAssistantStatus(t("jha.assistant.status.reviewReady", { values: { count: commands.length } }));
    } catch (error) {
      setStepAssistantStatus(error instanceof Error ? error.message : t("jha.assistant.status.failed"));
    }
  };

  const handleAssistHazards = async () => {
    const notes = hazardAssistantNotes.trim();
    if (!notes) return;
    setHazardAssistantStatus(t("jha.assistant.status.updatingHazards"));
    setHazardAssistantClarification(null);
    setHazardAssistantSummary(null);
    setHazardSuggestions([]);
    try {
      const stepIdByKey = await persistSteps();
      await persistHazards(stepIdByKey);
      const result = await actions.assistHazards(notes);
      if (result?.needsClarification) {
        setHazardAssistantStatus(t("jha.assistant.status.needsClarification"));
        setHazardAssistantClarification(
          result.clarificationPrompt || t("jha.assistant.status.clarificationFallback")
        );
        return;
      }
      const commands = (result?.commands ?? []).filter((command) => command.target === "hazard");
      if (!commands.length) {
        setHazardAssistantStatus(t("jha.assistant.status.noChanges"));
        setTimeout(() => setHazardAssistantStatus(null), 2500);
        return;
      }
      setHazardAssistantSummary(result?.summary ?? null);
      setHazardSuggestions(commands.map((command) => ({ id: createKey("hazard-suggestion"), command, selected: true })));
      setHazardAssistantNotes("");
      setHazardAssistantStatus(t("jha.assistant.status.reviewReady", { values: { count: commands.length } }));
    } catch (error) {
      setHazardAssistantStatus(error instanceof Error ? error.message : t("jha.assistant.status.failed"));
    }
  };

  const handleSuggestControls = async () => {
    setControlSuggestionStatus(t("jha.controls.suggestions.status.thinking"));
    try {
      const result = await actions.suggestControls();
      const grouped = (result?.suggestions ?? []).reduce<Record<string, string[]>>((acc, item) => {
        if (!acc[item.hazardId]) {
          acc[item.hazardId] = [];
        }
        acc[item.hazardId]!.push(item.control);
        return acc;
      }, {});
      setControlSuggestions(grouped);
      if (result?.suggestions?.length) {
        setControlSuggestionStatus(
          t("jha.controls.suggestions.status.ready", { values: { count: result.suggestions.length } })
        );
      } else {
        setControlSuggestionStatus(t("jha.controls.suggestions.status.empty"));
      }
    } catch (error) {
      setControlSuggestionStatus(error instanceof Error ? error.message : t("jha.controls.suggestions.status.failed"));
    }
  };

  const describePatchCommand = (command: JhaPatchCommand) => {
    if (command.explanation && command.explanation.trim()) {
      return command.explanation;
    }
    return t("jha.assistant.review.itemFallback");
  };

  const handleToggleStepSuggestion = (id: string) => {
    setStepSuggestions((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  };

  const handleToggleHazardSuggestion = (id: string) => {
    setHazardSuggestions((prev) =>
      prev.map((item) => (item.id === id ? { ...item, selected: !item.selected } : item))
    );
  };

  const handleApplyStepSuggestions = async () => {
    const selected = stepSuggestions.filter((item) => item.selected).map((item) => item.command);
    if (!selected.length) {
      setStepAssistantStatus(t("jha.assistant.status.noSelection"));
      setTimeout(() => setStepAssistantStatus(null), 2500);
      return;
    }
    setStepAssistantStatus(t("jha.assistant.status.applying"));
    try {
      await actions.applyStepCommands(selected);
      setStepSuggestions([]);
      setStepAssistantSummary(null);
      setStepAssistantStatus(t("jha.assistant.status.applied"));
      setTimeout(() => setStepAssistantStatus(null), 2500);
    } catch (error) {
      setStepAssistantStatus(error instanceof Error ? error.message : t("jha.assistant.status.failed"));
    }
  };

  const handleApplyHazardSuggestions = async () => {
    const selected = hazardSuggestions.filter((item) => item.selected).map((item) => item.command);
    if (!selected.length) {
      setHazardAssistantStatus(t("jha.assistant.status.noSelection"));
      setTimeout(() => setHazardAssistantStatus(null), 2500);
      return;
    }
    setHazardAssistantStatus(t("jha.assistant.status.applying"));
    try {
      await actions.applyHazardCommands(selected);
      setHazardSuggestions([]);
      setHazardAssistantSummary(null);
      setHazardAssistantStatus(t("jha.assistant.status.applied"));
      setTimeout(() => setHazardAssistantStatus(null), 2500);
    } catch (error) {
      setHazardAssistantStatus(error instanceof Error ? error.message : t("jha.assistant.status.failed"));
    }
  };

  const handleDiscardStepSuggestions = () => {
    setStepSuggestions([]);
    setStepAssistantSummary(null);
    setStepAssistantStatus(t("jha.assistant.status.discarded"));
    setTimeout(() => setStepAssistantStatus(null), 2500);
  };

  const handleDiscardHazardSuggestions = () => {
    setHazardSuggestions([]);
    setHazardAssistantSummary(null);
    setHazardAssistantStatus(t("jha.assistant.status.discarded"));
    setTimeout(() => setHazardAssistantStatus(null), 2500);
  };

  const handleLoadById = (id: string) => {
    navigate(`/jha/${encodeURIComponent(id)}`);
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

  const jobDateHintId = "jha-job-date-hint";
  const jobTimeHintId = "jha-job-time-hint";
  const signoffDateHintId = "jha-signoff-date-hint";
  const signoffTimeHintId = "jha-signoff-time-hint";

  return (
    <div className="workspace-shell">
      <div className="workspace-menus">
        <WorkspaceTopBar
          label={t("workspace.jhaWorkspace")}
          title={jhaCase.jobTitle}
          subtitle={`${jhaCase.site || t("workspace.sitePending")} - ${jhaCase.supervisor || t("workspace.supervisorPending")}`}
          breadcrumbs={[
            { label: t("navigation.home"), to: "/" },
            { label: t("navigation.jha"), to: "/jha" },
            { label: jhaCase.jobTitle || t("jha.create.label") }
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
                    onClick={() => handleExport(`/api/jha-cases/${jhaCase.id}/export/pdf`, t("common.exportPdf"))}
                  >
                    {t("common.exportPdf")}
                  </button>
                  <button
                    type="button"
                    className="btn-outline btn-small overflow-menu__item"
                    onClick={() => handleExport(`/api/jha-cases/${jhaCase.id}/export/xlsx`, t("common.exportXlsx"))}
                  >
                    {t("common.exportXlsx")}
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
            <h2>{t("jha.details.title")}</h2>
            <p className="workspace-phase-panel__description">{t("jha.details.subtitle")}</p>
            <div className="workspace-form-grid">
              <label>
                {t("jha.details.fields.jobTitle")}
                <input
                  className="sheet-input"
                  value={caseDraft.jobTitle}
                  onChange={(event) => setCaseDraft((prev) => ({ ...prev, jobTitle: event.target.value }))}
                />
              </label>
              <label>
                {t("jha.details.fields.site")}
                <input
                  className="sheet-input"
                  value={caseDraft.site}
                  onChange={(event) => setCaseDraft((prev) => ({ ...prev, site: event.target.value }))}
                />
              </label>
              <label>
                {t("jha.details.fields.supervisor")}
                <input
                  className="sheet-input"
                  value={caseDraft.supervisor}
                  onChange={(event) => setCaseDraft((prev) => ({ ...prev, supervisor: event.target.value }))}
                />
              </label>
              <label>
                {t("jha.details.fields.workers")}
                <input
                  className="sheet-input"
                  value={caseDraft.workersInvolved}
                  onChange={(event) => setCaseDraft((prev) => ({ ...prev, workersInvolved: event.target.value }))}
                />
              </label>
            </div>
            <details className="form-disclosure">
              <summary>{t("common.optionalDetails")}</summary>
              <div className="form-disclosure__body workspace-form-grid">
                <label>
                  {t("jha.details.fields.jobDate")}
                  <input
                    type="date"
                    className="sheet-input"
                    aria-describedby={jobDateHintId}
                    value={caseDraft.jobDate}
                    onChange={(event) => setCaseDraft((prev) => ({ ...prev, jobDate: event.target.value }))}
                  />
                  <p id={jobDateHintId} className="form-helper">
                    {t("common.dateHint")}
                  </p>
                </label>
                <label>
                  {t("jha.details.fields.jobTime")}
                  <input
                    type="time"
                    className="sheet-input"
                    aria-describedby={jobTimeHintId}
                    value={caseDraft.jobTime}
                    onChange={(event) => setCaseDraft((prev) => ({ ...prev, jobTime: event.target.value }))}
                  />
                  <p id={jobTimeHintId} className="form-helper">
                    {t("common.timeHint")}
                  </p>
                </label>
                <label>
                  {t("jha.details.fields.revision")}
                  <input
                    className="sheet-input"
                    value={caseDraft.revision}
                    onChange={(event) => setCaseDraft((prev) => ({ ...prev, revision: event.target.value }))}
                  />
                </label>
                <label>
                  {t("jha.details.fields.preparedBy")}
                  <input
                    className="sheet-input"
                    value={caseDraft.preparedBy}
                    onChange={(event) => setCaseDraft((prev) => ({ ...prev, preparedBy: event.target.value }))}
                  />
                </label>
                <label>
                  {t("jha.details.fields.reviewedBy")}
                  <input
                    className="sheet-input"
                    value={caseDraft.reviewedBy}
                    onChange={(event) => setCaseDraft((prev) => ({ ...prev, reviewedBy: event.target.value }))}
                  />
                </label>
                <label>
                  {t("jha.details.fields.approvedBy")}
                  <input
                    className="sheet-input"
                    value={caseDraft.approvedBy}
                    onChange={(event) => setCaseDraft((prev) => ({ ...prev, approvedBy: event.target.value }))}
                  />
                </label>
                <label>
                  {t("jha.details.fields.signoffDate")}
                  <input
                    type="date"
                    className="sheet-input"
                    aria-describedby={signoffDateHintId}
                    value={caseDraft.signoffDate}
                    onChange={(event) => setCaseDraft((prev) => ({ ...prev, signoffDate: event.target.value }))}
                  />
                  <p id={signoffDateHintId} className="form-helper">
                    {t("common.dateHint")}
                  </p>
                </label>
                <label>
                  {t("jha.details.fields.signoffTime")}
                  <input
                    type="time"
                    className="sheet-input"
                    aria-describedby={signoffTimeHintId}
                    value={caseDraft.signoffTime}
                    onChange={(event) => setCaseDraft((prev) => ({ ...prev, signoffTime: event.target.value }))}
                  />
                  <p id={signoffTimeHintId} className="form-helper">
                    {t("common.timeHint")}
                  </p>
                </label>
              </div>
            </details>
            <div className="flex items-center gap-3">
              <button type="button" className="btn-outline" onClick={handleSaveMeta}>
                {t("jha.details.save")}
              </button>
              <SaveStatus status={metaStatus} />
            </div>
          </section>

          <section className="workspace-phase-panel">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2>{t("jha.flow.title")}</h2>
                <p className="workspace-phase-panel__description">{t("jha.flow.subtitle")}</p>
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

          {activeStage === "steps" && (
            <>
              <section className="workspace-phase-panel">
                <AssistantPanel
                  title={t("jha.assistant.steps.title")}
                  description={t("jha.assistant.steps.description")}
                  value={stepAssistantNotes}
                  placeholder={t("jha.assistant.steps.placeholder")}
                  primaryLabel={t("jha.assistant.steps.action")}
                  status={stepAssistantStatus ?? undefined}
                  enableVoice
                  onChange={setStepAssistantNotes}
                  onSubmit={handleAssistSteps}
                  onClear={() => setStepAssistantNotes("")}
                />
                {stepAssistantClarification && (
                  <div className="mt-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <span className="font-semibold">{t("jha.assistant.clarificationLabel")}</span>{" "}
                    {stepAssistantClarification}
                  </div>
                )}
                <p className="mt-3 text-xs text-slate-500">{t("jha.assistant.responsibility")}</p>
                {stepSuggestions.length > 0 && (
                  <div className="mt-4 rounded border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900">{t("jha.assistant.review.title")}</h4>
                        {stepAssistantSummary && (
                          <p className="text-sm text-slate-600">{stepAssistantSummary}</p>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">
                        {t("jha.assistant.review.count", { values: { count: stepSuggestions.length } })}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-col gap-2">
                      {stepSuggestions.map((item) => (
                        <label key={item.id} className="flex items-start gap-3 rounded border border-slate-100 p-2">
                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={() => handleToggleStepSuggestion(item.id)}
                          />
                          <span className="text-sm text-slate-700">{describePatchCommand(item.command)}</span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="btn-primary" onClick={handleApplyStepSuggestions}>
                        {t("jha.assistant.review.apply")}
                      </button>
                      <button type="button" className="btn-outline" onClick={handleDiscardStepSuggestions}>
                        {t("jha.assistant.review.discard")}
                      </button>
                    </div>
                  </div>
                )}
              </section>

              <section className="workspace-phase-panel">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2>{t("jha.steps.title")}</h2>
                    <p className="text-muted">{t("jha.steps.subtitle")}</p>
                  </div>
                  <button type="button" className="btn-outline" onClick={handleAddStep}>
                    {t("jha.steps.add")}
                  </button>
                </div>

                <SheetTable>
                  <SheetHead>
                    <SheetRow>
                      <SheetHeaderCell>{t("jha.steps.table.order")}</SheetHeaderCell>
                      <SheetHeaderCell>{t("jha.steps.table.label")}</SheetHeaderCell>
                      <SheetHeaderCell>{t("jha.steps.table.actions")}</SheetHeaderCell>
                    </SheetRow>
                  </SheetHead>
                  <SheetBody>
                    {stepDrafts.map((step, index) => (
                      <SheetRow key={step.key}>
                        <SheetCell>{index + 1}</SheetCell>
                        <SheetCell>
                          <SheetInput
                            value={step.label}
                            onChange={(event) =>
                              setStepDrafts((prev) =>
                                prev.map((item, idx) => (idx === index ? { ...item, label: event.target.value } : item))
                              )
                            }
                            placeholder={t("jha.steps.placeholder")}
                          />
                        </SheetCell>
                        <SheetCell className="sheet-cell-actions">
                          <div className="sheet-actions-grid">
                            <SheetButton
                              variant="icon"
                              onClick={() => handleMoveStep(index, "up")}
                              disabled={index === 0}
                              title={t("common.moveUp")}
                              aria-label={t("common.moveUp")}
                            >
                              ^
                            </SheetButton>
                            <SheetButton
                              variant="icon"
                              onClick={() => handleMoveStep(index, "down")}
                              disabled={index === stepDrafts.length - 1}
                              title={t("common.moveDown")}
                              aria-label={t("common.moveDown")}
                            >
                              v
                            </SheetButton>
                            <SheetButton variant="danger" onClick={() => void handleRemoveStep(index)}>
                              {t("common.remove")}
                            </SheetButton>
                          </div>
                        </SheetCell>
                      </SheetRow>
                    ))}
                    {stepDrafts.length === 0 && (
                      <SheetRow>
                        <SheetCell colSpan={3} className="sheet-empty-cell">
                          {t("jha.steps.empty")}
                        </SheetCell>
                      </SheetRow>
                    )}
                  </SheetBody>
                </SheetTable>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <button type="button" className="btn-outline" onClick={handleSaveSteps}>
                      {t("jha.flow.actions.saveSteps")}
                    </button>
                    <SaveStatus status={tableStatus} />
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="button" className="btn-outline" onClick={handlePrevStage} disabled>
                      {t("jha.flow.actions.back")}
                    </button>
                    <button type="button" className="btn-primary" onClick={handleNextStage} disabled={!stepsComplete}>
                      {t("jha.flow.actions.next")}
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}

          {activeStage === "hazards" && (
            <>
              <section className="workspace-phase-panel">
                <AssistantPanel
                  title={t("jha.assistant.hazards.title")}
                  description={t("jha.assistant.hazards.description")}
                  value={hazardAssistantNotes}
                  placeholder={t("jha.assistant.hazards.placeholder")}
                  primaryLabel={t("jha.assistant.hazards.action")}
                  status={hazardAssistantStatus ?? undefined}
                  enableVoice
                  onChange={setHazardAssistantNotes}
                  onSubmit={handleAssistHazards}
                  onClear={() => setHazardAssistantNotes("")}
                />
                {hazardAssistantClarification && (
                  <div className="mt-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    <span className="font-semibold">{t("jha.assistant.clarificationLabel")}</span>{" "}
                    {hazardAssistantClarification}
                  </div>
                )}
                <p className="mt-3 text-xs text-slate-500">{t("jha.assistant.responsibility")}</p>
                {hazardSuggestions.length > 0 && (
                  <div className="mt-4 rounded border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900">{t("jha.assistant.review.title")}</h4>
                        {hazardAssistantSummary && (
                          <p className="text-sm text-slate-600">{hazardAssistantSummary}</p>
                        )}
                      </div>
                      <span className="text-xs text-slate-500">
                        {t("jha.assistant.review.count", { values: { count: hazardSuggestions.length } })}
                      </span>
                    </div>
                    <div className="mt-3 flex flex-col gap-2">
                      {hazardSuggestions.map((item) => (
                        <label key={item.id} className="flex items-start gap-3 rounded border border-slate-100 p-2">
                          <input
                            type="checkbox"
                            checked={item.selected}
                            onChange={() => handleToggleHazardSuggestion(item.id)}
                          />
                          <span className="text-sm text-slate-700">{describePatchCommand(item.command)}</span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className="btn-primary" onClick={handleApplyHazardSuggestions}>
                        {t("jha.assistant.review.apply")}
                      </button>
                      <button type="button" className="btn-outline" onClick={handleDiscardHazardSuggestions}>
                        {t("jha.assistant.review.discard")}
                      </button>
                    </div>
                  </div>
                )}
              </section>

              <section className="workspace-phase-panel">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2>{t("jha.hazards.title")}</h2>
                    <p className="text-muted">{t("jha.hazards.subtitle")}</p>
                  </div>
                  <button type="button" className="btn-outline" onClick={handleAddHazard}>
                    {t("jha.hazards.addRow")}
                  </button>
                </div>

                <SheetTable>
                  <SheetHead>
                    <SheetRow>
                      <SheetHeaderCell>{t("jha.hazards.table.step")}</SheetHeaderCell>
                      <SheetHeaderCell>{t("jha.hazards.table.hazard")}</SheetHeaderCell>
                      <SheetHeaderCell>{t("jha.hazards.table.consequence")}</SheetHeaderCell>
                      <SheetHeaderCell>{t("jha.hazards.table.actions")}</SheetHeaderCell>
                    </SheetRow>
                  </SheetHead>
                  <SheetBody>
                  {hazardDrafts.map((hazard, index) => {
                    const step = stepsByKey.get(hazard.stepKey);
                    const hasPrevInStep = hazardDrafts
                      .slice(0, index)
                      .some((item) => item.stepKey === hazard.stepKey);
                    const hasNextInStep = hazardDrafts
                      .slice(index + 1)
                      .some((item) => item.stepKey === hazard.stepKey);
                    return (
                      <SheetRow key={hazard.key}>
                          <SheetCell>
                            <select
                              className="sheet-select"
                              value={hazard.stepKey}
                              onChange={(event) => handleMoveHazardToStep(index, event.target.value)}
                            >
                              {stepDrafts.map((stepOption, stepIndex) => (
                                <option key={stepOption.key} value={stepOption.key}>
                                  {`${stepIndex + 1}. ${stepOption.label || t("jha.hazards.untitledStep")}`}
                                </option>
                              ))}
                              {!step && <option value={hazard.stepKey}>{t("jha.hazards.unassignedStep")}</option>}
                            </select>
                          </SheetCell>
                          <SheetCell>
                            <SheetInput
                              value={hazard.hazard}
                              onChange={(event) =>
                                setHazardDrafts((prev) =>
                                  prev.map((item, idx) =>
                                    idx === index ? { ...item, hazard: event.target.value } : item
                                  )
                                )
                              }
                              placeholder={t("jha.hazards.placeholders.hazard")}
                            />
                          </SheetCell>
                          <SheetCell>
                            <SheetInput
                              value={hazard.consequence}
                              onChange={(event) =>
                                setHazardDrafts((prev) =>
                                  prev.map((item, idx) =>
                                    idx === index ? { ...item, consequence: event.target.value } : item
                                  )
                                )
                              }
                              placeholder={t("jha.hazards.placeholders.consequence")}
                            />
                          </SheetCell>
                          <SheetCell className="sheet-cell-actions">
                            <div className="sheet-actions-grid">
                            <SheetButton
                              variant="icon"
                              onClick={() => handleMoveHazard(index, "up")}
                              disabled={!hasPrevInStep}
                              title={t("common.moveUp")}
                              aria-label={t("common.moveUp")}
                            >
                              ^
                            </SheetButton>
                            <SheetButton
                              variant="icon"
                              onClick={() => handleMoveHazard(index, "down")}
                              disabled={!hasNextInStep}
                              title={t("common.moveDown")}
                              aria-label={t("common.moveDown")}
                            >
                              v
                              </SheetButton>
                              <SheetButton variant="danger" onClick={() => handleRemoveHazard(index)}>
                                {t("common.remove")}
                              </SheetButton>
                            </div>
                          </SheetCell>
                        </SheetRow>
                      );
                    })}
                    {hazardDrafts.length === 0 && (
                      <SheetRow>
                        <SheetCell colSpan={4} className="sheet-empty-cell">
                          {t("jha.hazards.empty")}
                        </SheetCell>
                      </SheetRow>
                    )}
                  </SheetBody>
                </SheetTable>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <button type="button" className="btn-outline" onClick={handleSaveHazards}>
                      {t("jha.flow.actions.saveHazards")}
                    </button>
                    <button type="button" className="btn-outline" onClick={handleAddHazard}>
                      {t("jha.hazards.addRowAction")}
                    </button>
                    <SaveStatus status={tableStatus} />
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="button" className="btn-outline" onClick={handlePrevStage}>
                      {t("jha.flow.actions.back")}
                    </button>
                    <button type="button" className="btn-primary" onClick={handleNextStage} disabled={!stepsComplete}>
                      {t("jha.flow.actions.next")}
                    </button>
                  </div>
                </div>
              </section>
            </>
          )}

          {activeStage === "controls" && (
            <section className="workspace-phase-panel">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2>{t("jha.controls.title")}</h2>
                  <p className="text-muted">{t("jha.controls.subtitle")}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <button type="button" className="btn-outline" onClick={handleSuggestControls}>
                    {t("jha.controls.suggestions.action")}
                  </button>
                  {controlSuggestionStatus && <span className="text-sm text-slate-500">{controlSuggestionStatus}</span>}
                </div>
              </div>
              <p className="text-sm text-slate-500">{t("jha.controls.suggestions.hint")}</p>

              <SheetTable>
                <SheetHead>
                  <SheetRow>
                    <SheetHeaderCell>{t("jha.controls.table.step")}</SheetHeaderCell>
                    <SheetHeaderCell>{t("jha.controls.table.hazard")}</SheetHeaderCell>
                    <SheetHeaderCell>{t("jha.controls.table.controls")}</SheetHeaderCell>
                  </SheetRow>
                </SheetHead>
                <SheetBody>
                  {hazardDrafts.map((hazard, index) => {
                    const step = stepsByKey.get(hazard.stepKey);
                    const suggestions = hazard.id ? controlSuggestions[hazard.id] ?? [] : [];
                    return (
                      <SheetRow key={hazard.key}>
                        <SheetCell>
                          {step ? formatStepLabel(hazard.stepKey) : t("jha.hazards.unassignedStep")}
                        </SheetCell>
                        <SheetCell>
                          <div className="text-sm font-medium text-slate-900">{hazard.hazard || t("jha.controls.untitled")}</div>
                          <div className="text-xs text-slate-500">
                            {t("jha.controls.consequenceLabel")}: {hazard.consequence || t("jha.controls.none")}
                          </div>
                        </SheetCell>
                        <SheetCell>
                          <SheetTextarea
                            value={hazard.controls}
                            onChange={(event) =>
                              setHazardDrafts((prev) =>
                                prev.map((item, idx) =>
                                  idx === index ? { ...item, controls: event.target.value } : item
                                )
                              )
                            }
                            placeholder={t("jha.controls.placeholders.controls")}
                          />
                          {suggestions.length > 0 && (
                            <div className="mt-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                                {t("jha.controls.suggestions.title")}
                              </div>
                              <div className="mt-2 flex flex-col gap-2">
                                {suggestions.map((suggestion) => (
                                  <div key={`${hazard.key}-${suggestion}`} className="flex items-start justify-between gap-2">
                                    <span>{suggestion}</span>
                                    <button
                                      type="button"
                                      className="btn-outline btn-small"
                                      onClick={() => handleApplyControlSuggestion(index, hazard.id, suggestion)}
                                    >
                                      {t("jha.controls.suggestions.add")}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </SheetCell>
                      </SheetRow>
                    );
                  })}
                  {hazardDrafts.length === 0 && (
                    <SheetRow>
                      <SheetCell colSpan={3} className="sheet-empty-cell">
                        {t("jha.controls.empty")}
                      </SheetCell>
                    </SheetRow>
                  )}
                </SheetBody>
              </SheetTable>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <button type="button" className="btn-outline" onClick={handleSaveControls}>
                    {t("jha.flow.actions.saveControls")}
                  </button>
                  <SaveStatus status={tableStatus} />
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" className="btn-outline" onClick={handlePrevStage}>
                    {t("jha.flow.actions.back")}
                  </button>
                  <button type="button" className="btn-primary" onClick={handleNextStage} disabled={!controlsComplete}>
                    {t("jha.flow.actions.next")}
                  </button>
                </div>
              </div>
            </section>
          )}

          {activeStage === "review" && (
            <>
              <section className="workspace-phase-panel">
                <div>
                  <h2>{t("jha.review.title")}</h2>
                  <p className="text-muted">{t("jha.review.subtitle")}</p>
                </div>

                <SheetTable>
                  <SheetHead>
                    <SheetRow>
                      <SheetHeaderCell>{t("jha.hazards.table.step")}</SheetHeaderCell>
                      <SheetHeaderCell>{t("jha.hazards.table.hazard")}</SheetHeaderCell>
                      <SheetHeaderCell>{t("jha.hazards.table.consequence")}</SheetHeaderCell>
                      <SheetHeaderCell>{t("jha.hazards.table.controls")}</SheetHeaderCell>
                      <SheetHeaderCell>{t("jha.hazards.table.actions")}</SheetHeaderCell>
                    </SheetRow>
                  </SheetHead>
                  <SheetBody>
                    {hazardDrafts.map((hazard, index) => {
                      const step = stepsByKey.get(hazard.stepKey);
                      const hasPrevInStep = hazardDrafts
                        .slice(0, index)
                        .some((item) => item.stepKey === hazard.stepKey);
                      const hasNextInStep = hazardDrafts
                        .slice(index + 1)
                        .some((item) => item.stepKey === hazard.stepKey);
                      return (
                        <SheetRow key={hazard.key}>
                          <SheetCell>
                            <select
                              className="sheet-select"
                              value={hazard.stepKey}
                              onChange={(event) => handleMoveHazardToStep(index, event.target.value)}
                            >
                            {stepDrafts.map((stepOption, stepIndex) => (
                              <option key={stepOption.key} value={stepOption.key}>
                                {`${stepIndex + 1}. ${stepOption.label || t("jha.hazards.untitledStep")}`}
                              </option>
                            ))}
                              {!step && <option value={hazard.stepKey}>{t("jha.hazards.unassignedStep")}</option>}
                            </select>
                          </SheetCell>
                          <SheetCell>
                            <SheetInput
                              value={hazard.hazard}
                              onChange={(event) =>
                                setHazardDrafts((prev) =>
                                  prev.map((item, idx) =>
                                    idx === index ? { ...item, hazard: event.target.value } : item
                                  )
                                )
                              }
                              placeholder={t("jha.hazards.placeholders.hazard")}
                            />
                          </SheetCell>
                          <SheetCell>
                            <SheetInput
                              value={hazard.consequence}
                              onChange={(event) =>
                                setHazardDrafts((prev) =>
                                  prev.map((item, idx) =>
                                    idx === index ? { ...item, consequence: event.target.value } : item
                                  )
                                )
                              }
                              placeholder={t("jha.hazards.placeholders.consequence")}
                            />
                          </SheetCell>
                          <SheetCell>
                            <SheetTextarea
                              value={hazard.controls}
                              onChange={(event) =>
                                setHazardDrafts((prev) =>
                                  prev.map((item, idx) =>
                                    idx === index ? { ...item, controls: event.target.value } : item
                                  )
                                )
                              }
                              placeholder={t("jha.hazards.placeholders.controls")}
                            />
                          </SheetCell>
                          <SheetCell className="sheet-cell-actions">
                            <div className="sheet-actions-grid">
                              <SheetButton
                                variant="icon"
                                onClick={() => handleMoveHazard(index, "up")}
                                disabled={!hasPrevInStep}
                                title={t("common.moveUp")}
                                aria-label={t("common.moveUp")}
                              >
                                ^
                              </SheetButton>
                              <SheetButton
                                variant="icon"
                                onClick={() => handleMoveHazard(index, "down")}
                                disabled={!hasNextInStep}
                                title={t("common.moveDown")}
                                aria-label={t("common.moveDown")}
                              >
                                v
                              </SheetButton>
                              <SheetButton variant="danger" onClick={() => handleRemoveHazard(index)}>
                                {t("common.remove")}
                              </SheetButton>
                            </div>
                          </SheetCell>
                        </SheetRow>
                      );
                    })}
                    {hazardDrafts.length === 0 && (
                      <SheetRow>
                        <SheetCell colSpan={5} className="sheet-empty-cell">
                          {t("jha.hazards.empty")}
                        </SheetCell>
                      </SheetRow>
                    )}
                  </SheetBody>
                </SheetTable>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <button type="button" className="btn-outline" onClick={handleSaveReview}>
                      {t("jha.flow.actions.saveReview")}
                    </button>
                    <SaveStatus status={tableStatus} />
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="button" className="btn-outline" onClick={handlePrevStage}>
                      {t("jha.flow.actions.back")}
                    </button>
                  </div>
                </div>
              </section>

              <JhaAttachmentsPanel caseId={jhaCase.id} steps={jhaCase.steps} hazards={jhaCase.hazards} />
            </>
          )}
        </div>
      </main>
      <RecentCasesModal
        open={loadModalOpen}
        onClose={() => setLoadModalOpen(false)}
        title={t("landing.jha.recent.title")}
        subtitle={t("landing.jha.recent.subtitle")}
        searchPlaceholder={t("common.searchPlaceholder")}
        items={recentCases}
        loading={casesLoading}
        error={casesError}
        emptyText={t("landing.jha.recent.empty")}
        loadingText={t("landing.jha.recent.loading")}
        loadLabel={t("common.load")}
        onSelect={(item) => handleLoadById(item.id)}
        getTitle={(item) => item.jobTitle}
        getMeta={(item) =>
          `${item.site || t("workspace.sitePending")} · ${item.supervisor || t("workspace.supervisorPending")}`
        }
        getSearchText={(item) =>
          `${item.jobTitle} ${item.site ?? ""} ${item.supervisor ?? ""} ${item.id}`.trim()
        }
        getUpdatedLabel={(item) =>
          t("landing.jha.recent.updated", { values: { date: formatDateTime(item.updatedAt) } })
        }
        loadById={{
          label: t("common.loadById"),
          placeholder: t("landing.jha.load.inputPlaceholder"),
          actionLabel: t("common.load"),
          onLoad: handleLoadById
        }}
      />
      {dialog}
    </div>
  );
};
