import { useNavigate, useParams } from "react-router-dom";
import { IncidentProvider } from "@/contexts/IncidentContext";
import { IncidentEditor } from "@/components/IncidentEditor";
import { useI18n } from "@/i18n/I18nContext";
import { useDemoMode } from "@/hooks/useDemoMode";
import { DemoCaseActions } from "@/components/common/DemoCaseActions";

export const IncidentShell = () => {
  const { caseId } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const isDemo = useDemoMode();
  if (!caseId) {
    return (
      <div className="p-6">
        <p className="text-red-600">{t("shell.missingIncidentId")}</p>
        {isDemo && <DemoCaseActions kind="incident" onCreated={(id) => navigate(`/incidents/${id}`)} />}
      </div>
    );
  }
  return (
    <IncidentProvider caseId={caseId}>
      <IncidentEditor />
    </IncidentProvider>
  );
};
