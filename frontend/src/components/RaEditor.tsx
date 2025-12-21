import { useCallback, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { GlobalLLMInput } from "@/components/GlobalLLMInput";
import { FocusModeToggle } from "@/components/common/FocusModeToggle";
import { HotkeysBar } from "@/components/common/HotkeysBar";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { UserMenu } from "@/components/common/UserMenu";
import { RiskMatrixPanel } from "@/components/overview/RiskMatrixPanel";
import { BrowserTuiSpreadsheetView } from "@/components/overview/BrowserTuiSpreadsheetView";
import { WorkspaceTableView } from "@/components/overview/WorkspaceTableView";
import { PhaseControls } from "@/components/phases/PhaseControls";
import { PhaseControlsActions } from "@/components/phases/PhaseControlsActions";
import { PhaseHazardNarrative } from "@/components/phases/PhaseHazardNarrative";
import { PhaseProcessSteps } from "@/components/phases/PhaseProcessSteps";
import { PhaseReviewPlaceholder } from "@/components/phases/PhaseReviewPlaceholder";
import { PhaseRiskRating } from "@/components/phases/PhaseRiskRating";
import { PHASES } from "@/lib/phases";
import { useFocusMode } from "@/contexts/FocusModeContext";
import { useRaContext } from "@/contexts/RaContext";
import { useGlobalHotkeys } from "@/hooks/useGlobalHotkeys";
import type { Phase } from "@/types/riskAssessment";
import type { WorkspaceContext } from "@/types/workspace";
import { useI18n } from "@/i18n/I18nContext";

type WorkspaceView = "phases" | "table" | "matrix" | "actions" | "tui";

interface WorkspaceTopBarProps {
  activityName: string;
  location: string | null;
  team: string | null;
  caseId: string;
  saving: boolean;
  currentView: WorkspaceView;
  tuiEnabled?: boolean;
  onRefresh: () => Promise<void>;
  onNewCase: () => void;
  onLoadCase: (id: string) => void;
  onChangeView: (view: WorkspaceView) => void;
}

const WorkspaceTopBar = ({
  activityName,
  location,
  team,
  caseId,
  saving,
  currentView,
  tuiEnabled = false,
  onRefresh,
  onNewCase,
  onLoadCase,
  onChangeView
}: WorkspaceTopBarProps) => {
  const { t } = useI18n();
  const handleLoad = () => {
    const id = window.prompt(t("ra.topbar.loadPrompt"));
    if (id?.trim()) {
      onLoadCase(id.trim());
    }
  };

  const viewButton = (view: WorkspaceView, label: string) => (
    <button
      type="button"
      className={currentView === view ? "btn-outline active" : "btn-outline"}
      onClick={() => onChangeView(view)}
    >
      {label}
    </button>
  );

  return (
    <header className="workspace-topbar">
      <div className="workspace-topbar__summary">
        <p className="text-label">{t("workspace.hiraWorkspace")}</p>
        <h1>{activityName}</h1>
        <p>
          {location || t("workspace.locationPending")} · {team || t("workspace.teamPending")}
        </p>
        {saving && <p className="text-saving">{t("workspace.saving")}</p>}
      </div>
      <div className="workspace-topbar__actions">
        <button type="button" className="btn-outline" onClick={onNewCase}>
          {t("common.new")}
        </button>
        <button type="button" className="btn-outline" onClick={handleLoad}>
          {t("common.load")}
        </button>
        <button type="button" onClick={() => onRefresh()}>
          {t("common.refresh")}
        </button>
        {viewButton("phases", t("ra.topbar.viewGuided"))}
        {viewButton("table", t("ra.topbar.viewWorkspace"))}
        {viewButton("matrix", t("ra.topbar.viewMatrix"))}
        {viewButton("actions", t("ra.topbar.viewActions"))}
        {tuiEnabled && viewButton("tui", t("ra.topbar.viewTui"))}
        <button
          type="button"
          className="btn-outline"
          onClick={() => window.open(`/api/ra-cases/${caseId}/export/pdf`, "_blank", "noopener")}
        >
          {t("common.exportPdf")}
        </button>
        <button
          type="button"
          className="btn-outline"
          onClick={() => window.open(`/api/ra-cases/${caseId}/export/xlsx`, "_blank", "noopener")}
        >
          {t("common.exportXlsx")}
        </button>
        <ThemeToggle />
        <FocusModeToggle />
        <UserMenu />
      </div>
    </header>
  );
};

interface PhaseStepperProps {
  currentPhase: Phase;
  viewPhase: Phase;
  saving: boolean;
  onSelectPhase: (phase: Phase) => void;
  onAdvance: () => Promise<void>;
}

const HIDDEN_PHASES: Phase[] = [];

const PhaseStepper = ({ currentPhase, viewPhase, saving, onSelectPhase, onAdvance }: PhaseStepperProps) => {
  const { t } = useI18n();
  const viewIndex = PHASES.findIndex((phase) => phase.id === viewPhase);
  const prevPhase = viewIndex > 0 ? PHASES[viewIndex - 1]?.id : null;
  const nextPhase = viewIndex < PHASES.length - 1 ? PHASES[viewIndex + 1]?.id : null;
  const currentPhaseMeta = PHASES.find((phase) => phase.id === currentPhase);
  const chipPhases = PHASES.filter((phase) => !HIDDEN_PHASES.includes(phase.id));

  return (
    <footer className="phase-stepper">
      <div className="phase-stepper__nav">
        <button type="button" className="btn-outline" disabled={!prevPhase} onClick={() => prevPhase && onSelectPhase(prevPhase)}>
          ← {t("ra.stepper.previous")}
        </button>
        <button type="button" className="btn-outline" disabled={!nextPhase} onClick={() => nextPhase && onSelectPhase(nextPhase)}>
          {t("ra.stepper.next")} →
        </button>
        <span className="text-label">
          {t("ra.stepper.viewing")}: {t(PHASES[viewIndex]?.labelKey ?? "", { fallback: PHASES[viewIndex]?.label ?? viewPhase })}
        </span>
      </div>
      <div className="phase-stepper__chips">
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
            <button key={phase.id} type="button" className={chipClass} onClick={() => onSelectPhase(phase.id)}>
              {t(phase.labelKey, { fallback: phase.label })}
            </button>
          );
        })}
      </div>
      <div className="phase-stepper__status">
        <p>
          {t("ra.stepper.currentPhase")}:{" "}
          <strong>{t(currentPhaseMeta?.labelKey ?? "", { fallback: currentPhaseMeta?.label ?? currentPhase })}</strong>
        </p>
        <button type="button" disabled={saving} onClick={() => onAdvance()}>
          {t("ra.stepper.advance")}
        </button>
      </div>
    </footer>
  );
};

export const RaEditor = () => {
  const { raCase, saving, actions, refreshCase } = useRaContext();
  const { focusMode } = useFocusMode();
  const navigate = useNavigate();
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [stepsDirty, setStepsDirty] = useState(false);

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
    return ["phases", "table", "matrix", "actions", "tui"].includes(param) ? (param as WorkspaceView) : null;
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
  const requestedWorkspaceView = paramWorkspaceView ?? workspaceViewState;
  const tuiEnabled = (() => {
    try {
      return searchParams.get("tui") === "1" || window.localStorage.getItem("ss_tui") === "1";
    } catch {
      return false;
    }
  })();
  const workspaceView: WorkspaceView = requestedWorkspaceView === "tui" && !tuiEnabled ? "table" : requestedWorkspaceView;

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

  const confirmLeaveSteps = useCallback(
    (message?: string) => {
      if (!stepsDirty || safeViewPhase !== "PROCESS_STEPS") {
        return true;
      }
      return window.confirm(message ?? t("ra.confirmLeaveSteps"));
    },
    [stepsDirty, safeViewPhase]
  );

  const setViewPhase = useCallback(
    (phase: Phase) => {
      if (phase !== safeViewPhase && !confirmLeaveSteps()) {
        return;
      }
      setViewPhaseState(phase);
      updateSearchParams({ phase });
    },
    [confirmLeaveSteps, safeViewPhase, updateSearchParams]
  );

  const setWorkspaceView = useCallback(
    (view: WorkspaceView) => {
      if (view !== workspaceView && !confirmLeaveSteps()) {
        return;
      }
      setWorkspaceViewState(view);
      updateSearchParams({ view: view === "phases" ? null : view });
    },
    [confirmLeaveSteps, updateSearchParams, workspaceView]
  );

  // Global hotkeys for focus mode
  useGlobalHotkeys({
    globalPromptRef,
    onSave: refreshCase,
    onChangeView: setWorkspaceView,
    onChangePhase: setViewPhase,
    currentPhase: safeViewPhase
  });

  // Determine workspace context for hotkeys bar hints
  const getWorkspaceContext = (): WorkspaceContext => {
    if (workspaceView === "tui") return "tui";
    if (workspaceView === "table") return "table";
    return "default";
  };

  const handleAdvancePhase = async () => {
    if (!confirmLeaveSteps(t("ra.confirmAdvanceSteps"))) {
      return;
    }
    const currentIndex = PHASES.findIndex((phase) => phase.id === raCase.phase);
    const nextPhase = PHASES[Math.min(currentIndex + 1, PHASES.length - 1)]?.id ?? raCase.phase;
    await actions.advancePhase();
    setViewPhase(nextPhase);
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

    if (workspaceView === "tui") {
      return (
        <section className="workspace-phase-panel app-panel">
          <div className="workspace-phase-panel__header">
            <p className="text-label">{t("ra.workspace.tuiTitle")}</p>
            <h2>{t("ra.workspace.tuiHeadline")}</h2>
            <p className="workspace-phase-panel__description">
              {t("ra.workspace.tuiDescription")}
            </p>
          </div>
          <div className="workspace-phase-panel__body">
            <BrowserTuiSpreadsheetView raCase={raCase} />
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
          activityName={raCase.activityName}
          location={raCase.location}
          team={raCase.team}
          caseId={raCase.id}
          saving={saving}
          currentView={workspaceView}
          tuiEnabled={tuiEnabled}
          onRefresh={refreshCase}
          onNewCase={() => {
            if (confirmLeaveSteps()) {
              navigate("/hira");
            }
          }}
          onLoadCase={(id) => {
            if (confirmLeaveSteps()) {
              navigate(`/cases/${encodeURIComponent(id)}`);
            }
          }}
          onChangeView={setWorkspaceView}
        />
        {workspaceView === "phases" && (
          <PhaseStepper
            currentPhase={raCase.phase}
            viewPhase={safeViewPhase}
            saving={saving}
            onSelectPhase={setViewPhase}
            onAdvance={handleAdvancePhase}
          />
        )}
      </div>
      <div className="workspace-prompt-pinned">
        <GlobalLLMInput currentPhase={safeViewPhase} textareaRef={globalPromptRef} />
      </div>
      <main className="workspace-main">
        <div className="workspace-main__inner">
          {renderWorkspace()}
        </div>
      </main>
      <HotkeysBar context={getWorkspaceContext()} />
    </div>
  );
};
