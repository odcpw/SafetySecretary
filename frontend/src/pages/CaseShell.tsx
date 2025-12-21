import { useNavigate, useParams } from "react-router-dom";
import { RaProvider } from "@/contexts/RaContext";
import { RaEditor } from "@/components/RaEditor";
import { useI18n } from "@/i18n/I18nContext";
import { useDemoMode } from "@/hooks/useDemoMode";
import { DemoCaseActions } from "@/components/common/DemoCaseActions";

export const CaseShell = () => {
  const { caseId } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const isDemo = useDemoMode();
  if (!caseId) {
    return (
      <div className="p-6">
        <p className="text-red-600">{t("shell.missingCaseId")}</p>
        {isDemo && <DemoCaseActions kind="ra" onCreated={(id) => navigate(`/cases/${id}`)} />}
      </div>
    );
  }
  return (
    <RaProvider caseId={caseId}>
      <RaEditor />
    </RaProvider>
  );
};
