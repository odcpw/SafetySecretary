import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { IncidentProvider, useIncidentContext } from "@/contexts/IncidentContext";
import { useI18n } from "@/i18n/I18nContext";
import { TuiAppNav } from "@/tui/components/TuiAppNav";
import { TuiPanel } from "@/tui/components/TuiPanel";

const TuiIncidentWorkspace = ({ caseId }: { caseId: string }) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { incidentCase, saving, actions } = useIncidentContext();

  const incidentTypeLabels = {
    NEAR_MISS: t("incident.types.nearMiss"),
    FIRST_AID: t("incident.types.firstAid"),
    LOST_TIME: t("incident.types.lostTime"),
    PROPERTY_DAMAGE: t("incident.types.propertyDamage")
  } as const;

  return (
    <div className="tui-shell">
      <header className="tui-header">
        <div>
          <p className="tui-eyebrow">{t("workspace.incidentWorkspace")}</p>
          <h1 className="tui-title">{incidentCase.title}</h1>
          <p className="tui-muted">
            {incidentCase.location || t("workspace.locationPending")} · {incidentTypeLabels[incidentCase.incidentType]}
          </p>
          {saving && <p className="tui-muted">{t("workspace.saving")}</p>}
        </div>
        <div className="tui-header__actions">
          <button type="button" onClick={() => void actions.refreshCase()}>
            {t("common.refresh")}
          </button>
          <ThemeToggle className="tui-theme-toggle" />
          <button type="button" onClick={() => window.location.assign(`/incidents/${encodeURIComponent(caseId)}`)}>
            Switch to GUI
          </button>
        </div>
      </header>

      <TuiAppNav />

      <nav className="tui-nav">
        <button type="button" onClick={() => navigate("/incidents")}>
          {t("common.back")}
        </button>
        <span className="tui-muted">{incidentCase.coordinatorRole}</span>
      </nav>

      <main className="tui-content">
        <TuiPanel
          eyebrow={t("incident.assistant.title")}
          title={t("incident.timeline.title")}
          subtitle={t("incident.timeline.subtitle")}
        >
          <div className="tui-columns">
            <div>
              <p className="tui-eyebrow">{t("incident.witness.title")}</p>
              <h3>{incidentCase.persons.length}</h3>
            </div>
            <div>
              <p className="tui-eyebrow">{t("incident.timeline.title")}</p>
              <h3>{incidentCase.timelineEvents.length}</h3>
            </div>
            <div>
              <p className="tui-eyebrow">{t("incident.deviations.title")}</p>
              <h3>{incidentCase.deviations.length}</h3>
            </div>
            <div>
              <p className="tui-eyebrow">{t("incident.causes.title")}</p>
              <h3>{incidentCase.causeNodes?.length ?? 0}</h3>
            </div>
          </div>
        </TuiPanel>
      </main>
    </div>
  );
};

export const TuiIncidentCaseShell = () => {
  const { caseId } = useParams();
  const navigate = useNavigate();

  const guiPath = useMemo(() => (caseId ? `/incidents/${encodeURIComponent(caseId)}` : "/incidents"), [caseId]);

  if (!caseId) {
    return (
      <div className="tui-shell">
        <p className="tui-muted">Missing case ID.</p>
        <button type="button" onClick={() => navigate("/incidents")}>
          Back to incidents
        </button>
        <button type="button" onClick={() => window.location.assign(guiPath)}>
          Switch to GUI
        </button>
      </div>
    );
  }

  return (
    <IncidentProvider caseId={caseId}>
      <TuiIncidentWorkspace caseId={caseId} />
    </IncidentProvider>
  );
};
