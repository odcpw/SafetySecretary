import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { GlobalLLMInput } from "@/components/GlobalLLMInput";
import { FocusModeToggle } from "@/components/common/FocusModeToggle";
import { HotkeysBar } from "@/components/common/HotkeysBar";
import { RecentCasesModal } from "@/components/common/RecentCasesModal";
import { OverflowMenu } from "@/components/common/OverflowMenu";
import { SaveStatus } from "@/components/common/SaveStatus";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { UserMenu } from "@/components/common/UserMenu";
import { WorkspaceTopBar } from "@/components/common/WorkspaceTopBar";
import { RiskMatrixPanel } from "@/components/overview/RiskMatrixPanel";
import { WorkspaceTableView } from "@/components/overview/WorkspaceTableView";
import { PhaseControls } from "@/components/phases/PhaseControls";
import { PhaseControlsActions } from "@/components/phases/PhaseControlsActions";
import { PhaseHazardNarrative } from "@/components/phases/PhaseHazardNarrative";
import { PhaseProcessSteps } from "@/components/phases/PhaseProcessSteps";
import { PhaseReviewPlaceholder } from "@/components/phases/PhaseReviewPlaceholder";
import { PhaseRiskRating } from "@/components/phases/PhaseRiskRating";
import { PHASES } from "@/lib/phases";
import { useRaContext } from "@/contexts/RaContext";
import { apiFetch } from "@/lib/api";
import { useGlobalHotkeys } from "@/hooks/useGlobalHotkeys";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { useSaveStatus } from "@/hooks/useSaveStatus";
import type { Phase, RiskAssessmentCaseSummary } from "@/types/riskAssessment";
import type { WorkspaceContext } from "@/types/workspace";
import { useI18n } from "@/i18n/I18nContext";

type WorkspaceView = "phases" | "table" | "matrix" | "actions";

interface PhaseStepperProps {
  currentPhase: Phase;
  viewPhase: Phase;
  saving: boolean;
  onSelectPhase: (phase: Phase) => void;
  onAdvance: () => Promise<void>;
  compact?: boolean;
}

const HIDDEN_PHASES: Phase[] = [];

const PhaseStepper = ({ currentPhase, viewPhase, saving, onSelectPhase, onAdvance, compact = false }: PhaseStepperProps) => {
  const { t, formatDateTime } = useI18n();
  const viewIndex = PHASES.findIndex((phase) => phase.id === viewPhase);
  const prevPhase = viewIndex > 0 ? PHASES[viewIndex - 1]?.id : null;
  const nextPhase = viewIndex < PHASES.length - 1 ? PHASES[viewIndex + 1]?.id : null;
  const currentPhaseMeta = PHASES.find((phase) => phase.id === currentPhase);
  const chipPhases = PHASES.filter((phase) => !HIDDEN_PHASES.includes(phase.id));

  return (
    <footer className={`phase-stepper${compact ? " phase-stepper--compact" : ""}`}>
      <div className="phase-stepper__nav">
        <button
          type="button"
          className={compact ? "btn-outline btn-small" : "btn-outline"}
          disabled={!prevPhase}
          onClick={() => prevPhase && void onSelectPhase(prevPhase)}
        >
          ← {t("ra.stepper.previous")}
        </button>
        <button
          type="button"
          className={compact ? "btn-outline btn-small" : "btn-outline"}
          disabled={!nextPhase}
          onClick={() => nextPhase && void onSelectPhase(nextPhase)}
        >
          {t("ra.stepper.next")} →
        </button>
        <span className={`text-label${compact ? " phase-stepper__label" : ""}`}>
          {t("ra.stepper.viewing")}: {t(PHASES[viewIndex]?.labelKey ?? "", { fallback: PHASES[viewIndex]?.label ?? viewPhase })}
        </span>
      </div>
      <div className={`phase-stepper__chips${compact ? " phase-stepper__chips--compact" : ""}`}>
        {chipPhases.map((phase) => {
          const state =
            phase.id === currentPhase
              ? "current"
              : PHASES.findIndex((p) => p.id === phase.id) < PHASES.findIndex((p) => p.id === currentPhase)
                ? "done"
                : "pending";
          const active = phase.id === viewPhase;
          const chipClass =
            state === "done"
              ? "phase-chip phase-chip--done"
              : active || state === "current"
                ? "phase-chip phase-chip--active"
                : "phase-chip";
          return (
            <button key={phase.id} type="button" className={chipClass} onClick={() => void onSelectPhase(phase.id)}>
              {t(phase.labelKey, { fallback: phase.label })}
            </button>
          );
        })}
      </div>
      <div className="phase-stepper__status">
        {!compact && (
          <p>
            {t("ra.stepper.currentPhase")}:{" "}
            <strong>{t(currentPhaseMeta?.labelKey ?? "", { fallback: currentPhaseMeta?.label ?? currentPhase })}</strong>
          </p>
        )}
        <button type="button" className={compact ? "btn-primary btn-small" : undefined} disabled={saving} onClick={() => void onAdvance()}>
          {t("ra.stepper.advance")}
        </button>
      </div>
    </footer>
  );
};

export const RaEditor = () => {
  const { raCase, saving, actions, refreshCase } = useRaContext();
  const navigate = useNavigate();
  const { t, formatDateTime } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [stepsDirty, setStepsDirty] = useState(false);
  const [loadModalOpen, setLoadModalOpen] = useState(false);
  const [recentCases, setRecentCases] = useState<RiskAssessmentCaseSummary[]>([]);
  const [casesLoading, setCasesLoading] = useState(false);
  const [casesError, setCasesError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirmDialog();
  const { status: exportStatus, show: showExportStatus, showSuccess: showExportSuccess, showError: showExportError } =
    useSaveStatus();

  const globalPromptRef = useRef<HTMLTextAreaElement>(null);


  const getPhaseFromParam = useCallback((param: string | null): Phase | null => {
    if (!param) {
      return null;
    }
    return PHASES.some((phase) => phase.id === param) ? (param as Phase) : null;
  }, []);

  const getWorkspaceFromParam = useCallback((param: string | null): WorkspaceView | null => {
    if (!param) {
      return null;
    }
    return ["phases", "table", "matrix", "actions"].includes(param) ? (param as WorkspaceView) : null;
  }, []);

  const [viewPhaseState, setViewPhaseState] = useState<Phase>(
    () => getPhaseFromParam(searchParams.get("phase")) ?? raCase.phase
  );
  const [workspaceViewState, setWorkspaceViewState] = useState<WorkspaceView>(
    () => getWorkspaceFromParam(searchParams.get("view")) ?? "phases"
  );
  const paramPhase = getPhaseFromParam(searchParams.get("phase"));
  const viewPhase = paramPhase ?? viewPhaseState;
  const safeViewPhase = PHASES.some((phase) => phase.id === viewPhase) ? viewPhase : raCase.phase;
  const paramWorkspaceView = getWorkspaceFromParam(searchParams.get("view"));
  const workspaceView = paramWorkspaceView ?? workspaceViewState;

  const updateSearchParams = useCallback(
    (patch: Record<string, string | null>) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        Object.entries(patch).forEach(([key, value]) => {
          if (value === null) {
            next.delete(key);
          } else {
            next.set(key, value);
          }
        });
        return next;
      });
    },
    [setSearchParams]
  );

  const fetchRecentCases = useCallback(async () => {
    setCasesLoading(true);
    setCasesError(null);
    try {
      const response = await apiFetch("/api/ra-cases?limit=20");
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as { cases: RiskAssessmentCaseSummary[] };
      setRecentCases(data.cases ?? []);
    } catch (error) {
      setCasesError(error instanceof Error ? error.message : t("landing.hira.errors.loadFailed"));
    } finally {
      setCasesLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (loadModalOpen) {
      void fetchRecentCases();
    }
  }, [fetchRecentCases, loadModalOpen]);

  const confirmLeaveSteps = useCallback(
    async (message?: string) => {
      if (!stepsDirty || safeViewPhase !== "PROCESS_STEPS") {
        return true;
      }
      return confirm({
        title: t("common.continue"),
        description: message ?? t("ra.confirmLeaveSteps"),
        confirmLabel: t("common.continue"),
        cancelLabel: t("common.cancel")
      });
    },
    [confirm, stepsDirty, safeViewPhase, t]
  );

  const setViewPhase = useCallback(
    async (phase: Phase) => {
      if (phase !== safeViewPhase && !(await confirmLeaveSteps())) {
        return;
      }
      setViewPhaseState(phase);
      updateSearchParams({ phase });
    },
    [confirmLeaveSteps, safeViewPhase, updateSearchParams]
  );

  const setWorkspaceView = useCallback(
    async (view: WorkspaceView) => {
      if (view !== workspaceView && !(await confirmLeaveSteps())) {
        return;
      }
      setWorkspaceViewState(view);
      updateSearchParams({ view: view === "phases" ? null : view });
    },
    [confirmLeaveSteps, updateSearchParams, workspaceView]
  );

  const handleNewCase = async () => {
    if (await confirmLeaveSteps()) {
      navigate("/hira");
    }
  };

  const handleLoadCase = () => {
    setLoadModalOpen(true);
  };

  const handleLoadById = async (id: string) => {
    if (await confirmLeaveSteps()) {
      navigate(`/cases/${encodeURIComponent(id)}`);
    }
  };

  const viewButton = (view: WorkspaceView, label: string) => (
    <button
      type="button"
      className={workspaceView === view ? "btn-outline active" : "btn-outline"}
      onClick={() => void setWorkspaceView(view)}
    >
      {label}
    </button>
  );

  // Global hotkeys for focus mode
  useGlobalHotkeys({
    globalPromptRef,
    onSave: refreshCase,
    onChangeView: (view) => void setWorkspaceView(view),
    onChangePhase: (phase) => void setViewPhase(phase),
    currentPhase: safeViewPhase
  });

  // Determine workspace context for hotkeys bar hints
  const getWorkspaceContext = (): WorkspaceContext => {
    if (workspaceView === "table") return "table";
    return "default";
  };

  const handleAdvancePhase = async () => {
    if (!(await confirmLeaveSteps(t("ra.confirmAdvanceSteps")))) {
      return;
    }
    const currentIndex = PHASES.findIndex((phase) => phase.id === raCase.phase);
    const nextPhase = PHASES[Math.min(currentIndex + 1, PHASES.length - 1)]?.id ?? raCase.phase;
    await actions.advancePhase();
    void setViewPhase(nextPhase);
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

  const renderPhase = (phase: Phase) => {
    const canAdvance = phase === raCase.phase;
    switch (phase) {
      case "PROCESS_STEPS":
        return (
          <PhaseProcessSteps
            key={`phase-process-${raCase.id}`}
            raCase={raCase}
            saving={saving}
            onExtractSteps={actions.extractSteps}
            onSaveSteps={actions.saveSteps}
            onNext={actions.advancePhase}
            canAdvance={canAdvance}
            onDirtyChange={setStepsDirty}
          />
        );
      case "HAZARD_IDENTIFICATION":
        return (
          <PhaseHazardNarrative
            key={`phase-hazards-${raCase.id}`}
            raCase={raCase}
            saving={saving}
            onExtractHazards={actions.extractHazards}
            onAddHazard={actions.addManualHazard}
            onUpdateHazard={actions.updateHazard}
            onDeleteHazard={actions.deleteHazard}
            onReorderHazards={actions.reorderHazards}
            onNext={actions.advancePhase}
            canAdvance={canAdvance}
          />
        );
      case "RISK_RATING":
        return (
          <PhaseRiskRating
            key={`phase-risk-${raCase.id}`}
            raCase={raCase}
            saving={saving}
            onSaveRiskRatings={actions.saveRiskRatings}
            onUpdateHazard={actions.updateHazard}
            onNext={actions.advancePhase}
            canAdvance={canAdvance}
          />
        );
      case "CONTROL_DISCUSSION":
        return (
          <PhaseControls
            key={`phase-controls-${raCase.id}-${phase}`}
            raCase={raCase}
            saving={saving}
            onAddProposedControl={actions.addProposedControl}
            onDeleteProposedControl={actions.deleteProposedControl}
            onUpdateHazard={actions.updateHazard}
            onSaveResidualRisk={actions.saveResidualRisk}
            onExtractControls={actions.extractControls}
            onNext={actions.advancePhase}
            canAdvance={canAdvance}
          />
        );
      case "ACTIONS":
        return (
          <PhaseControlsActions
            key={`phase-actions-${raCase.id}-${raCase.actions.length}`}
            raCase={raCase}
            saving={saving}
            onAddAction={actions.addAction}
            onUpdateAction={actions.updateAction}
            onDeleteAction={actions.deleteAction}
            onExtractActions={actions.extractActions}
            onNext={actions.advancePhase}
            canAdvance={canAdvance}
          />
        );
      case "COMPLETE":
        return (
          <PhaseReviewPlaceholder
            key={`phase-review-${raCase.id}-${phase}`}
            raCase={raCase}
            phase={phase}
            canAdvance={canAdvance}
            onNext={actions.advancePhase}
          />
        );
      default:
        return <div className="p-4 text-sm text-red-600">{t("ra.unknownPhase", { values: { phase } })}</div>;
    }
  };

  const currentPhaseMeta = PHASES.find((phase) => phase.id === safeViewPhase);

  const renderWorkspace = () => {
    if (workspaceView === "phases") {
      return (
        <section className="workspace-phase-panel app-panel">
          <div className="workspace-phase-panel__header">
            <p className="text-label">{t("ra.workspace.phaseTitle")}</p>
            <h2>
              {t(currentPhaseMeta?.labelKey ?? "", { fallback: currentPhaseMeta?.label ?? safeViewPhase })}
            </h2>
            <p className="workspace-phase-panel__description">
              {t(currentPhaseMeta?.descriptionKey ?? "", { fallback: currentPhaseMeta?.description ?? "" })}
            </p>
          </div>
          <div className="workspace-phase-panel__body">
            <div className="phase-workspace">{renderPhase(safeViewPhase)}</div>
          </div>
        </section>
      );
    }

    if (workspaceView === "table") {
      return (
        <section className="workspace-phase-panel app-panel">
          <div className="workspace-phase-panel__header">
            <p className="text-label">{t("ra.workspace.tableTitle")}</p>
            <h2>{t("ra.workspace.tableHeadline")}</h2>
            <p className="workspace-phase-panel__description">{t("ra.workspace.tableDescription")}</p>
          </div>
          <div className="workspace-phase-panel__body">
            <WorkspaceTableView raCase={raCase} />
          </div>
        </section>
      );
    }

    if (workspaceView === "matrix") {
      return (
        <section className="workspace-phase-panel app-panel">
          <div className="workspace-phase-panel__header">
            <p className="text-label">{t("ra.workspace.matrixTitle")}</p>
            <h2>{t("ra.workspace.matrixHeadline")}</h2>
            <p className="workspace-phase-panel__description">{t("ra.workspace.matrixDescription")}</p>
          </div>
          <div className="workspace-phase-panel__body">
            <RiskMatrixPanel raCase={raCase} />
          </div>
        </section>
      );
    }

    return (
      <section className="workspace-phase-panel app-panel">
        <div className="workspace-phase-panel__header">
          <p className="text-label">{t("ra.workspace.actionsTitle")}</p>
          <h2>{t("ra.workspace.actionsHeadline")}</h2>
          <p className="workspace-phase-panel__description">{t("ra.workspace.actionsDescription")}</p>
        </div>
        <div className="workspace-phase-panel__body">
          <PhaseControlsActions
            raCase={raCase}
            saving={saving}
            onAddAction={actions.addAction}
            onUpdateAction={actions.updateAction}
            onDeleteAction={actions.deleteAction}
            onExtractActions={actions.extractActions}
            onNext={async () => undefined}
            canAdvance={false}
          />
        </div>
      </section>
    );
  };

  return (
    <div className="workspace-shell">
      <div className="workspace-menus">
        <WorkspaceTopBar
          label={t("workspace.hiraWorkspace")}
          title={raCase.activityName}
          subtitle={`${raCase.location || t("workspace.locationPending")} · ${raCase.team || t("workspace.teamPending")}`}
          breadcrumbs={[
            { label: t("navigation.home"), to: "/" },
            { label: t("navigation.hira"), to: "/hira" },
            { label: raCase.activityName || t("hira.create.label") }
          ]}
          saving={saving}
          actions={
            <>
              <div className="workspace-topbar__group">
                <button type="button" className="btn-outline" onClick={() => void handleNewCase()}>
                  {t("common.new")}
                </button>
                <button type="button" className="btn-outline" onClick={handleLoadCase}>
                  {t("common.load")}
                </button>
                <button type="button" className="btn-outline" onClick={() => void refreshCase()}>
                  {t("common.refresh")}
                </button>
              </div>
              <div className="workspace-topbar__group">
                {viewButton("phases", t("ra.topbar.viewGuided"))}
                {viewButton("table", t("ra.topbar.viewWorkspace"))}
                {viewButton("matrix", t("ra.topbar.viewMatrix"))}
                {viewButton("actions", t("ra.topbar.viewActions"))}
              </div>
              <div className="workspace-topbar__group">
                <OverflowMenu label={t("common.more")}>
                  <button
                    type="button"
                    className="btn-outline btn-small overflow-menu__item"
                    onClick={() => handleExport(`/api/ra-cases/${raCase.id}/export/pdf`, t("common.exportPdf"))}
                  >
                    {t("common.exportPdf")}
                  </button>
                  <button
                    type="button"
                    className="btn-outline btn-small overflow-menu__item"
                    onClick={() => handleExport(`/api/ra-cases/${raCase.id}/export/xlsx`, t("common.exportXlsx"))}
                  >
                    {t("common.exportXlsx")}
                  </button>
                  <button
                    type="button"
                    className="btn-outline btn-small overflow-menu__item"
                    onClick={() => window.location.assign(`/tui/cases/${raCase.id}`)}
                  >
                    {t("ra.topbar.viewTui")}
                  </button>
                </OverflowMenu>
              </div>
              <div className="workspace-topbar__group">
                <SaveStatus status={exportStatus} />
              </div>
              <div className="workspace-topbar__group">
                <ThemeToggle />
                <FocusModeToggle />
                <UserMenu />
              </div>
            </>
          }
          prompt={(
            <div className={`workspace-topbar__prompt-grid${workspaceView === "phases" ? "" : " workspace-topbar__prompt-grid--solo"}`}>
              <GlobalLLMInput currentPhase={safeViewPhase} textareaRef={globalPromptRef} />
              {workspaceView === "phases" && (
                <PhaseStepper
                  currentPhase={raCase.phase}
                  viewPhase={safeViewPhase}
                  saving={saving}
                  onSelectPhase={(phase) => void setViewPhase(phase)}
                  onAdvance={handleAdvancePhase}
                  compact
                />
              )}
            </div>
          )}
        />
      </div>
      <main className="workspace-main">
        <div className="workspace-main__inner">
          {renderWorkspace()}
        </div>
      </main>
      <HotkeysBar context={getWorkspaceContext()} />
      <RecentCasesModal
        open={loadModalOpen}
        onClose={() => setLoadModalOpen(false)}
        title={t("landing.hira.recent.title")}
        subtitle={t("landing.hira.recent.subtitle")}
        searchPlaceholder={t("common.searchPlaceholder")}
        items={recentCases}
        loading={casesLoading}
        error={casesError}
        emptyText={t("landing.hira.recent.empty")}
        loadingText={t("landing.hira.recent.loading")}
        loadLabel={t("common.load")}
        onSelect={(item) => handleLoadById(item.id)}
        getTitle={(item) => item.activityName}
        getMeta={(item) =>
          `${item.location || t("workspace.locationPending")} · ${item.team || t("workspace.teamPending")}`
        }
        getSearchText={(item) =>
          `${item.activityName} ${item.location ?? ""} ${item.team ?? ""} ${item.id}`.trim()
        }
        getUpdatedLabel={(item) =>
          t("landing.hira.recent.updated", { values: { date: formatDateTime(item.updatedAt) } })
        }
        loadById={{
          label: t("common.loadById"),
          placeholder: t("landing.hira.load.inputPlaceholder"),
          actionLabel: t("common.load"),
          onLoad: handleLoadById
        }}
      />
      {dialog}
    </div>
  );
};
