import { useMemo, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { RaProvider, useRaContext } from "@/contexts/RaContext";
import { useI18n } from "@/i18n/I18nContext";
import { PHASES } from "@/lib/phases";
import type { Phase } from "@/types/riskAssessment";
import { TuiEmptyState } from "@/tui/components/TuiEmptyState";
import { TuiBanner } from "@/tui/components/TuiBanner";
import { TuiHeader } from "@/tui/components/TuiHeader";
import { TuiPanel } from "@/tui/components/TuiPanel";
import { TuiShell } from "@/tui/components/TuiShell";
import { TuiStepper, type TuiStep } from "@/tui/components/TuiStepper";
import { TuiStatusLine } from "@/tui/components/TuiStatusLine";
import { TuiGlobalLLMInput } from "@/tui/components/TuiGlobalLLMInput";
import { TuiPhaseHazardIdentification } from "@/tui/phases/TuiPhaseHazardIdentification";
import { TuiPhaseProcessSteps } from "@/tui/phases/TuiPhaseProcessSteps";
import { TuiPhaseRiskRating } from "@/tui/phases/TuiPhaseRiskRating";
import { TuiPhaseControls } from "@/tui/phases/TuiPhaseControls";
import { TuiPhaseActions } from "@/tui/phases/TuiPhaseActions";
import { TuiPhaseReview } from "@/tui/phases/TuiPhaseReview";

const PHASE_ROUTES: Record<Phase, string> = {
  PROCESS_STEPS: "process",
  HAZARD_IDENTIFICATION: "hazards",
  RISK_RATING: "risk",
  CONTROL_DISCUSSION: "controls",
  ACTIONS: "actions",
  COMPLETE: "review"
};

const resolvePhaseFromRoute = (segment: string | null) => {
  if (!segment) {
    return null;
  }
  const match = (Object.entries(PHASE_ROUTES) as Array<[Phase, string]>).find(([, route]) => route === segment);
  return match ? match[0] : null;
};

const TuiCaseLayout = ({ caseId }: { caseId: string }) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const { raCase, saving, refreshCase, actions, loading, error } = useRaContext();
  const [llmStatus, setLlmStatus] = useState<{ state: "parsing" | "applying"; message: string } | null>(null);

  const viewPhase = useMemo(() => {
    const segments = location.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1] ?? null;
    const candidate = last && last !== caseId ? last : null;
    return resolvePhaseFromRoute(candidate) ?? raCase.phase;
  }, [caseId, location.pathname, raCase.phase]);

  const currentIndex = PHASES.findIndex((phase) => phase.id === raCase.phase);
  const viewIndex = PHASES.findIndex((phase) => phase.id === viewPhase);
  const prevPhase = viewIndex > 0 ? PHASES[viewIndex - 1] : null;
  const nextPhase = viewIndex < PHASES.length - 1 ? PHASES[viewIndex + 1] : null;

  const steps = useMemo<TuiStep[]>(
    () =>
      PHASES.map((phase, index) => ({
        id: phase.id,
        label: t(phase.labelKey, { fallback: phase.label }),
        state: phase.id === viewPhase ? "current" : index < currentIndex ? "done" : "pending"
      })),
    [currentIndex, t, viewPhase]
  );

  const goToPhase = (phaseId: Phase) => {
    navigate(`/cases/${encodeURIComponent(caseId)}/${PHASE_ROUTES[phaseId]}`);
  };

  const handleSelectPhase = (phaseId: string) => {
    if (phaseId in PHASE_ROUTES) {
      goToPhase(phaseId as Phase);
    }
  };

  const handleAdvancePhase = async () => {
    const next = PHASES[Math.min(currentIndex + 1, PHASES.length - 1)]?.id ?? raCase.phase;
    await actions.advancePhase();
    goToPhase(next);
  };

  return (
    <TuiShell>
      <TuiHeader
        eyebrow={t("workspace.hiraWorkspace")}
        title={raCase.activityName}
        subtitle={`${raCase.location || t("workspace.locationPending")} · ${raCase.team || t("workspace.teamPending")}`}
        meta={saving ? <p className="tui-muted">{t("workspace.saving")}</p> : null}
        actions={(
          <>
            <button type="button" onClick={() => void refreshCase()}>
              {t("common.refresh")}
            </button>
            <ThemeToggle className="tui-theme-toggle" />
            <button type="button" onClick={() => window.location.assign(`/cases/${encodeURIComponent(caseId)}`)}>
              Switch to GUI
            </button>
          </>
        )}
      />

      <nav className="tui-nav">
        <button type="button" onClick={() => navigate("/hira")}>
          {t("common.back")}
        </button>
      </nav>

      <TuiStepper
        steps={steps}
        onSelect={handleSelectPhase}
        actions={(
          <>
            <button type="button" onClick={() => prevPhase && goToPhase(prevPhase.id)} disabled={!prevPhase}>
              {t("ra.stepper.previous")}
            </button>
            <button type="button" onClick={() => nextPhase && goToPhase(nextPhase.id)} disabled={!nextPhase}>
              {t("ra.stepper.next")}
            </button>
            {viewPhase === raCase.phase && raCase.phase !== "COMPLETE" && (
              <button type="button" onClick={() => void handleAdvancePhase()}>
                {t("ra.stepper.advance")}
              </button>
            )}
          </>
        )}
      />

      <main className="tui-content">
        {loading && (
          <TuiBanner>
            {t("tui.refreshing")}
          </TuiBanner>
        )}
        {error && (
          <TuiBanner
            variant="warning"
            actions={(
              <button type="button" onClick={() => void refreshCase()}>
                {t("common.retry")}
              </button>
            )}
          >
            <div>{t("tui.refreshFailed")}</div>
            <div className="tui-muted">{error}</div>
          </TuiBanner>
        )}
        <TuiGlobalLLMInput currentPhase={viewPhase} onStatusChange={setLlmStatus} />
        <Routes>
          <Route index element={<Navigate to={PHASE_ROUTES[raCase.phase]} replace />} />
          <Route path={PHASE_ROUTES.PROCESS_STEPS} element={<TuiPhaseProcessSteps />} />
          <Route path={PHASE_ROUTES.HAZARD_IDENTIFICATION} element={<TuiPhaseHazardIdentification />} />
          <Route path={PHASE_ROUTES.RISK_RATING} element={<TuiPhaseRiskRating />} />
          <Route path={PHASE_ROUTES.CONTROL_DISCUSSION} element={<TuiPhaseControls />} />
          <Route path={PHASE_ROUTES.ACTIONS} element={<TuiPhaseActions />} />
          <Route path={PHASE_ROUTES.COMPLETE} element={<TuiPhaseReview />} />
          <Route path="*" element={<Navigate to={PHASE_ROUTES[raCase.phase]} replace />} />
        </Routes>
      </main>

      <TuiStatusLine
        status={llmStatus?.state ?? (error ? "error" : saving ? "saving" : "ready")}
        message={
          llmStatus?.message
            ?? (error
              ? t("tui.refreshFailed")
              : saving
                ? t("status.savingChanges")
                : t("tui.instructionsShort"))
        }
        className="tui-status--global"
      />
    </TuiShell>
  );
};

export const TuiCaseShell = () => {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const { t } = useI18n();

  if (!caseId) {
    return (
      <TuiShell>
        <TuiPanel
          title={t("landing.hira.load.title")}
          subtitle={t("landing.hira.load.subtitle")}
        >
          <TuiEmptyState title={t("landing.hira.errors.missingId")} />
          <div className="tui-nav">
            <button type="button" onClick={() => navigate("/hira")}>
              {t("common.back")}
            </button>
            <button type="button" onClick={() => window.location.assign("/hira")}>
              Switch to GUI
            </button>
          </div>
        </TuiPanel>
      </TuiShell>
    );
  }

  return (
    <RaProvider
      caseId={caseId}
      statusVariant="tui"
      renderLoading={() => (
        <TuiShell>
          <TuiPanel title={t("common.loading")}>
            <TuiEmptyState title={t("common.loading")} />
          </TuiPanel>
        </TuiShell>
      )}
      renderError={(message, retry) => (
        <TuiShell>
          <TuiPanel title={t("landing.hira.load.title")} subtitle={t("landing.hira.load.subtitle")}>
            <TuiBanner
              variant="error"
              actions={(
                <button type="button" onClick={() => void retry()}>
                  {t("common.retry")}
                </button>
              )}
            >
              <div>{t("tui.loadFailed")}</div>
              <div className="tui-muted">{message}</div>
            </TuiBanner>
          </TuiPanel>
        </TuiShell>
      )}
    >
      <TuiCaseLayout caseId={caseId} />
    </RaProvider>
  );
};
