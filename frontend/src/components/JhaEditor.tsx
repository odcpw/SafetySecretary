import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AssistantPanel } from "@/components/common/AssistantPanel";
import { UserMenu } from "@/components/common/UserMenu";
import { apiFetch } from "@/lib/api";
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
import type { JhaHazard, JhaStep } from "@/types/jha";
import { useI18n } from "@/i18n/I18nContext";

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

const formatDateInput = (value: string | null) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }
  return value;
};

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

const createKey = (prefix: string) => {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
};

export const JhaEditor = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const { jhaCase, saving, actions } = useJhaContext();
  const [caseDraft, setCaseDraft] = useState({
    jobTitle: jhaCase.jobTitle,
    site: jhaCase.site ?? "",
    supervisor: jhaCase.supervisor ?? "",
    workersInvolved: jhaCase.workersInvolved ?? "",
    jobDate: formatDateInput(jhaCase.jobDate),
    revision: jhaCase.revision ?? "",
    preparedBy: jhaCase.preparedBy ?? "",
    reviewedBy: jhaCase.reviewedBy ?? "",
    approvedBy: jhaCase.approvedBy ?? "",
    signoffDate: formatDateInput(jhaCase.signoffDate)
  });
  const [metaStatus, setMetaStatus] = useState<string | null>(null);
  const [assistantNotes, setAssistantNotes] = useState("");
  const [assistantStatus, setAssistantStatus] = useState<string | null>(null);
  const [tableStatus, setTableStatus] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<JhaStage>(() =>
    STAGE_ORDER.includes(jhaCase.workflowStage as JhaStage) ? (jhaCase.workflowStage as JhaStage) : "steps"
  );
  const [stageError, setStageError] = useState<string | null>(null);
  const [stepDrafts, setStepDrafts] = useState<StepDraft[]>([]);
  const [hazardDrafts, setHazardDrafts] = useState<HazardDraft[]>([]);
  const defaultStepLabel = (index: number) => t("jha.steps.defaultLabel", { values: { index: index + 1 } });

  useEffect(() => {
    setCaseDraft({
      jobTitle: jhaCase.jobTitle,
      site: jhaCase.site ?? "",
      supervisor: jhaCase.supervisor ?? "",
      workersInvolved: jhaCase.workersInvolved ?? "",
      jobDate: formatDateInput(jhaCase.jobDate),
      revision: jhaCase.revision ?? "",
      preparedBy: jhaCase.preparedBy ?? "",
      reviewedBy: jhaCase.reviewedBy ?? "",
      approvedBy: jhaCase.approvedBy ?? "",
      signoffDate: formatDateInput(jhaCase.signoffDate)
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
  }, [jhaCase]);

  const stepsByKey = useMemo(() => {
    const map = new Map<string, StepDraft>();
    stepDrafts.forEach((step) => map.set(step.key, step));
    return map;
  }, [stepDrafts]);

  const stepsComplete = stepDrafts.length > 0 && stepDrafts.every((step) => step.label.trim().length > 0);
  const hazardsComplete = hazardDrafts.length > 0 && hazardDrafts.every((hazard) => hazard.hazard.trim().length > 0);
  const controlsComplete =
    hazardDrafts.length > 0 && hazardDrafts.every((hazard) => parseControls(hazard.controls).length > 0);
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
    if (stage === "hazards" && !stepsComplete) {
      setStageError(t("jha.flow.errors.stepsIncomplete"));
      return false;
    }
    if (stage === "controls" && !hazardsComplete) {
      setStageError(t("jha.flow.errors.hazardsIncomplete"));
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
      setMetaStatus(t("jha.details.errors.jobTitleRequired"));
      return;
    }
    setMetaStatus(t("jha.details.status.saving"));
    try {
      await actions.updateCaseMeta({
        jobTitle: caseDraft.jobTitle.trim(),
        site: caseDraft.site.trim() || null,
        supervisor: caseDraft.supervisor.trim() || null,
        workersInvolved: caseDraft.workersInvolved.trim() || null,
        jobDate: caseDraft.jobDate || null,
        revision: caseDraft.revision.trim() || null,
        preparedBy: caseDraft.preparedBy.trim() || null,
        reviewedBy: caseDraft.reviewedBy.trim() || null,
        approvedBy: caseDraft.approvedBy.trim() || null,
        signoffDate: caseDraft.signoffDate || null
      });
      setMetaStatus(t("jha.details.status.saved"));
      setTimeout(() => setMetaStatus(null), 2500);
    } catch (error) {
      setMetaStatus(error instanceof Error ? error.message : t("jha.details.status.saveFailed"));
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

  const handleRemoveStep = (index: number) => {
    setStepDrafts((prevSteps) => {
      const step = prevSteps[index];
      if (!step) return prevSteps;
      const hazardsForStep = hazardDrafts.filter((hazard) => hazard.stepKey === step.key);
      if (hazardsForStep.length > 0 && !confirm(t("jha.steps.confirmRemove"))) {
        return prevSteps;
      }
      setHazardDrafts((prevHazards) => prevHazards.filter((hazard) => hazard.stepKey !== step.key));
      return prevSteps.filter((_, idx) => idx !== index);
    });
  };

  const handleAddHazard = () => {
    let stepKey = stepDrafts[stepDrafts.length - 1]?.key;
    if (!stepKey) {
      const key = createKey("step");
      stepKey = key;
      setStepDrafts([{ key, label: defaultStepLabel(0) }]);
    }
    const hazardKey = createKey("hazard");
    setHazardDrafts((prev) => [
      ...prev,
      {
        key: hazardKey,
        stepKey,
        hazard: "",
        consequence: "",
        controls: ""
      }
    ]);
  };

  const handleMoveHazard = (index: number, direction: "up" | "down") => {
    setHazardDrafts((prev) => {
      const next = [...prev];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };

  const handleRemoveHazard = (index: number) => {
    setHazardDrafts((prev) => prev.filter((_, idx) => idx !== index));
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
    const hazardsPayload = hazardDrafts.map((hazard, index) => ({
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
    setTableStatus(t("jha.table.status.saving"));
    try {
      await persistSteps();
      await actions.refreshCase();
      setTableStatus(t("jha.table.status.saved"));
      setTimeout(() => setTableStatus(null), 2500);
    } catch (error) {
      console.error(error);
      setTableStatus(error instanceof Error ? error.message : t("jha.table.status.saveFailed"));
    }
  };

  const handleSaveHazards = async () => {
    setTableStatus(t("jha.table.status.saving"));
    try {
      const stepIdByKey = await persistSteps();
      await persistHazards(stepIdByKey);
      await actions.refreshCase();
      setTableStatus(t("jha.table.status.saved"));
      setTimeout(() => setTableStatus(null), 2500);
    } catch (error) {
      console.error(error);
      setTableStatus(error instanceof Error ? error.message : t("jha.table.status.saveFailed"));
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

  const handleExtractRows = async () => {
    if (!assistantNotes.trim()) return;
    setAssistantStatus(t("jha.assistant.status.extracting"));
    try {
      await actions.extractRows(assistantNotes);
      setAssistantNotes("");
      setAssistantStatus(t("jha.assistant.status.updated"));
      setTimeout(() => setAssistantStatus(null), 2500);
    } catch (error) {
      setAssistantStatus(error instanceof Error ? error.message : t("jha.assistant.status.failed"));
    }
  };

  return (
    <div className="workspace-shell">
      <header className="workspace-topbar">
        <div className="workspace-topbar__summary">
          <p className="text-label">{t("workspace.jhaWorkspace")}</p>
          <h1>{jhaCase.jobTitle}</h1>
          <p>
            {jhaCase.site || t("workspace.sitePending")} - {jhaCase.supervisor || t("workspace.supervisorPending")}
          </p>
          {saving && <p className="text-saving">{t("workspace.saving")}</p>}
        </div>
        <div className="workspace-topbar__actions">
          <button type="button" className="btn-outline" onClick={() => navigate("/jha")}>
            {t("common.back")}
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={() => window.open(`/api/jha-cases/${jhaCase.id}/export/pdf`, "_blank", "noopener")}
          >
            {t("common.exportPdf")}
          </button>
          <button
            type="button"
            className="btn-outline"
            onClick={() => window.open(`/api/jha-cases/${jhaCase.id}/export/xlsx`, "_blank", "noopener")}
          >
            {t("common.exportXlsx")}
          </button>
          <UserMenu />
        </div>
      </header>

      <main className="workspace-main">
        <div className="workspace-main__inner">
          <section className="workspace-phase-panel">
            <h2>{t("jha.details.title")}</h2>
            <p className="text-muted">{t("jha.details.subtitle")}</p>
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
              <label>
                {t("jha.details.fields.jobDate")}
                <input
                  type="date"
                  className="sheet-input"
                  value={caseDraft.jobDate}
                  onChange={(event) => setCaseDraft((prev) => ({ ...prev, jobDate: event.target.value }))}
                />
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
                  value={caseDraft.signoffDate}
                  onChange={(event) => setCaseDraft((prev) => ({ ...prev, signoffDate: event.target.value }))}
                />
              </label>
            </div>
            <div className="flex items-center gap-3">
              <button type="button" className="btn-outline" onClick={handleSaveMeta}>
                {t("jha.details.save")}
              </button>
              {metaStatus && <span className="text-sm text-slate-500">{metaStatus}</span>}
            </div>
          </section>

          <section className="workspace-phase-panel">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2>{t("jha.flow.title")}</h2>
                <p className="text-muted">{t("jha.flow.subtitle")}</p>
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
                  title={t("jha.assistant.title")}
                  description={t("jha.assistant.description")}
                  value={assistantNotes}
                  placeholder={t("jha.assistant.placeholder")}
                  primaryLabel={t("jha.assistant.action")}
                  status={assistantStatus ?? undefined}
                  enableVoice
                  onChange={setAssistantNotes}
                  onSubmit={handleExtractRows}
                  onClear={() => setAssistantNotes("")}
                />
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
                            <SheetButton variant="danger" onClick={() => handleRemoveStep(index)}>
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
                    {tableStatus && <span className="text-sm text-slate-500">{tableStatus}</span>}
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
                    return (
                      <SheetRow key={hazard.key}>
                        <SheetCell>
                          <select
                            className="sheet-select"
                            value={hazard.stepKey}
                            onChange={(event) =>
                              setHazardDrafts((prev) =>
                                prev.map((item, idx) =>
                                  idx === index ? { ...item, stepKey: event.target.value } : item
                                )
                              )
                            }
                          >
                            {stepDrafts.map((stepOption) => (
                              <option key={stepOption.key} value={stepOption.key}>
                                {stepOption.label || t("jha.hazards.untitledStep")}
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
                              disabled={index === 0}
                              title={t("common.moveUp")}
                              aria-label={t("common.moveUp")}
                            >
                              ^
                            </SheetButton>
                            <SheetButton
                              variant="icon"
                              onClick={() => handleMoveHazard(index, "down")}
                              disabled={index === hazardDrafts.length - 1}
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
                  {tableStatus && <span className="text-sm text-slate-500">{tableStatus}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <button type="button" className="btn-outline" onClick={handlePrevStage}>
                    {t("jha.flow.actions.back")}
                  </button>
                  <button type="button" className="btn-primary" onClick={handleNextStage} disabled={!hazardsComplete}>
                    {t("jha.flow.actions.next")}
                  </button>
                </div>
              </div>
            </section>
          )}

          {activeStage === "controls" && (
            <section className="workspace-phase-panel">
              <div>
                <h2>{t("jha.controls.title")}</h2>
                <p className="text-muted">{t("jha.controls.subtitle")}</p>
              </div>

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
                    return (
                      <SheetRow key={hazard.key}>
                        <SheetCell>{step?.label || t("jha.hazards.untitledStep")}</SheetCell>
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
                  {tableStatus && <span className="text-sm text-slate-500">{tableStatus}</span>}
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
                      return (
                        <SheetRow key={hazard.key}>
                          <SheetCell>
                            <select
                              className="sheet-select"
                              value={hazard.stepKey}
                              onChange={(event) =>
                                setHazardDrafts((prev) =>
                                  prev.map((item, idx) =>
                                    idx === index ? { ...item, stepKey: event.target.value } : item
                                  )
                                )
                              }
                            >
                              {stepDrafts.map((stepOption) => (
                                <option key={stepOption.key} value={stepOption.key}>
                                  {stepOption.label || t("jha.hazards.untitledStep")}
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
                                disabled={index === 0}
                                title={t("common.moveUp")}
                                aria-label={t("common.moveUp")}
                              >
                                ^
                              </SheetButton>
                              <SheetButton
                                variant="icon"
                                onClick={() => handleMoveHazard(index, "down")}
                                disabled={index === hazardDrafts.length - 1}
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
                    {tableStatus && <span className="text-sm text-slate-500">{tableStatus}</span>}
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
    </div>
  );
};
