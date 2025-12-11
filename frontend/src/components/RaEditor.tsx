import { useCallback, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { GlobalLLMInput } from "@/components/GlobalLLMInput";
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
import type { Phase } from "@/types/riskAssessment";

type WorkspaceView = "phases" | "table" | "matrix" | "actions";

interface WorkspaceTopBarProps {
  activityName: string;
  location: string | null;
  team: string | null;
  caseId: string;
  saving: boolean;
  currentView: WorkspaceView;
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
  onRefresh,
  onNewCase,
  onLoadCase,
  onChangeView
}: WorkspaceTopBarProps) => {
  const handleLoad = () => {
    const id = window.prompt("Enter a case id to load");
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
        <p className="text-label">Risk assessment workspace</p>
        <h1>{activityName}</h1>
        <p>
          {location || "Location pending"} · {team || "Team pending"}
        </p>
        {saving && <p className="text-saving">Saving latest edits…</p>}
      </div>
      <div className="workspace-topbar__actions">
        <button type="button" className="btn-outline" onClick={onNewCase}>
          New
        </button>
        <button type="button" className="btn-outline" onClick={handleLoad}>
          Load
        </button>
        <button type="button" onClick={() => onRefresh()}>
          Save
        </button>
        {viewButton("phases", "Guided")}
        {viewButton("table", "Workspace")}
        {viewButton("matrix", "Risk matrix")}
        {viewButton("actions", "Action plan")}
        <button
          type="button"
          className="btn-outline"
          onClick={() => window.open(`/api/ra-cases/${caseId}/export/pdf`, "_blank", "noopener")}
        >
          Export
        </button>
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
  const viewIndex = PHASES.findIndex((phase) => phase.id === viewPhase);
  const prevPhase = viewIndex > 0 ? PHASES[viewIndex - 1]?.id : null;
  const nextPhase = viewIndex < PHASES.length - 1 ? PHASES[viewIndex + 1]?.id : null;
  const currentPhaseMeta = PHASES.find((phase) => phase.id === currentPhase);
  const chipPhases = PHASES.filter((phase) => !HIDDEN_PHASES.includes(phase.id));

  return (
    <footer className="phase-stepper">
      <div className="phase-stepper__nav">
        <button type="button" className="btn-outline" disabled={!prevPhase} onClick={() => prevPhase && onSelectPhase(prevPhase)}>
          ← Previous
        </button>
        <button type="button" className="btn-outline" disabled={!nextPhase} onClick={() => nextPhase && onSelectPhase(nextPhase)}>
          Next →
        </button>
        <span className="text-label">Viewing: {PHASES[viewIndex]?.label ?? viewPhase}</span>
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
              {phase.label}
            </button>
          );
        })}
      </div>
      <div className="phase-stepper__status">
        <p>
          Current phase: <strong>{currentPhaseMeta?.label ?? currentPhase}</strong>
        </p>
        <button type="button" disabled={saving} onClick={() => onAdvance()}>
          Move forward
        </button>
      </div>
    </footer>
  );
};

export const RaEditor = () => {
  const { raCase, saving, actions, refreshCase } = useRaContext();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const stepsSignature = raCase.steps
    .map((step) => `${step.id}:${step.orderIndex}:${step.activity}:${step.description ?? ""}`)
    .join("|");

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

  const setViewPhase = useCallback(
    (phase: Phase) => {
      setViewPhaseState(phase);
      updateSearchParams({ phase });
    },
    [updateSearchParams]
  );

  const setWorkspaceView = useCallback(
    (view: WorkspaceView) => {
      setWorkspaceViewState(view);
      updateSearchParams({ view: view === "phases" ? null : view });
    },
    [updateSearchParams]
  );

  const handleAdvancePhase = async () => {
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
            key={`phase-process-${raCase.id}-${stepsSignature}`}
            raCase={raCase}
            saving={saving}
            onExtractSteps={actions.extractSteps}
            onSaveSteps={actions.saveSteps}
            onNext={actions.advancePhase}
            canAdvance={canAdvance}
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
            mode="controls"
          />
        );
      case "RESIDUAL_RISK":
        return (
          <PhaseControls
            key={`phase-residual-${raCase.id}-${phase}`}
            raCase={raCase}
            saving={saving}
            onAddProposedControl={actions.addProposedControl}
            onDeleteProposedControl={actions.deleteProposedControl}
            onUpdateHazard={actions.updateHazard}
            onSaveResidualRisk={actions.saveResidualRisk}
            onExtractControls={actions.extractControls}
            onNext={actions.advancePhase}
            canAdvance={canAdvance}
            mode="residual"
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
        return <div className="p-4 text-sm text-red-600">Unknown phase {phase}</div>;
    }
  };

  const currentPhaseMeta = PHASES.find((phase) => phase.id === safeViewPhase);

  const renderWorkspace = () => {
    if (workspaceView === "phases") {
      return (
        <section className="workspace-phase-panel app-panel">
          <div className="workspace-phase-panel__header">
            <p className="text-label">Phase workspace</p>
            <h2>{currentPhaseMeta?.label ?? safeViewPhase}</h2>
            <p className="workspace-phase-panel__description">{currentPhaseMeta?.description}</p>
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
            <p className="text-label">Workspace view</p>
            <h2>Full editable worksheet</h2>
            <p className="workspace-phase-panel__description">
              Edit all fields inline. Click on any cell to modify it.
            </p>
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
            <p className="text-label">Risk matrix</p>
            <h2>Severity vs likelihood</h2>
            <p className="workspace-phase-panel__description">Customize axes, colours, and compare baseline vs residual.</p>
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
          <p className="text-label">Action plan</p>
          <h2>Corrective & monitoring tasks</h2>
          <p className="workspace-phase-panel__description">Track owners, due dates, and status for every hazard.</p>
        </div>
        <div className="workspace-phase-panel__body">
          <PhaseControlsActions
            raCase={raCase}
            saving={saving}
            onAddAction={actions.addAction}
            onUpdateAction={actions.updateAction}
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
          onRefresh={refreshCase}
          onNewCase={() => navigate("/")}
          onLoadCase={(id) => navigate(`/cases/${encodeURIComponent(id)}`)}
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
      <main className="workspace-main">
        <div className="workspace-main__inner">
          <GlobalLLMInput currentPhase={safeViewPhase} />
          {renderWorkspace()}
        </div>
      </main>
    </div>
  );
};
