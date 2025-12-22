import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { JhaProvider, useJhaContext } from "@/contexts/JhaContext";
import { useI18n } from "@/i18n/I18nContext";
import { TuiAppNav } from "@/tui/components/TuiAppNav";
import { TuiPanel } from "@/tui/components/TuiPanel";

const TuiJhaWorkspace = ({ caseId }: { caseId: string }) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { jhaCase, saving, actions } = useJhaContext();

  const workflowLabel = jhaCase.workflowStage
    ? t(`jha.flow.stages.${jhaCase.workflowStage}`, { fallback: jhaCase.workflowStage })
    : t("jha.flow.title");

  return (
    <div className="tui-shell">
      <header className="tui-header">
        <div>
          <p className="tui-eyebrow">{t("workspace.jhaWorkspace")}</p>
          <h1 className="tui-title">{jhaCase.jobTitle}</h1>
          <p className="tui-muted">
            {jhaCase.site || t("workspace.sitePending")} · {jhaCase.supervisor || t("workspace.supervisorPending")}
          </p>
          {saving && <p className="tui-muted">{t("workspace.saving")}</p>}
        </div>
        <div className="tui-header__actions">
          <button type="button" onClick={() => void actions.refreshCase()}>
            {t("common.refresh")}
          </button>
          <ThemeToggle className="tui-theme-toggle" />
          <button type="button" onClick={() => window.location.assign(`/jha/${encodeURIComponent(caseId)}`)}>
            Switch to GUI
          </button>
        </div>
      </header>

      <TuiAppNav />

      <nav className="tui-nav">
        <button type="button" onClick={() => navigate("/jha")}>
          {t("common.back")}
        </button>
        <span className="tui-muted">{workflowLabel}</span>
      </nav>

      <main className="tui-content">
        <TuiPanel
          eyebrow={t("jha.details.title")}
          title={t("jha.review.title")}
          subtitle={t("jha.review.subtitle")}
        >
          <div className="tui-columns">
            <div>
              <p className="tui-eyebrow">{t("jha.steps.title")}</p>
              <h3>{jhaCase.steps.length}</h3>
            </div>
            <div>
              <p className="tui-eyebrow">{t("jha.hazards.title")}</p>
              <h3>{jhaCase.hazards.length}</h3>
            </div>
            <div>
              <p className="tui-eyebrow">{t("jha.attachments.title")}</p>
              <h3>{jhaCase.attachments.length}</h3>
            </div>
          </div>
        </TuiPanel>
      </main>
    </div>
  );
};

export const TuiJhaCaseShell = () => {
  const { caseId } = useParams();
  const navigate = useNavigate();

  const guiPath = useMemo(() => (caseId ? `/jha/${encodeURIComponent(caseId)}` : "/jha"), [caseId]);

  if (!caseId) {
    return (
      <div className="tui-shell">
        <p className="tui-muted">Missing case ID.</p>
        <button type="button" onClick={() => navigate("/jha")}>
          Back to JHA
        </button>
        <button type="button" onClick={() => window.location.assign(guiPath)}>
          Switch to GUI
        </button>
      </div>
    );
  }

  return (
    <JhaProvider caseId={caseId}>
      <TuiJhaWorkspace caseId={caseId} />
    </JhaProvider>
  );
};
