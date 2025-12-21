import { useNavigate, useParams } from "react-router-dom";
import { JhaProvider } from "@/contexts/JhaContext";
import { JhaEditor } from "@/components/JhaEditor";
import { useI18n } from "@/i18n/I18nContext";
import { useDemoMode } from "@/hooks/useDemoMode";
import { DemoCaseActions } from "@/components/common/DemoCaseActions";

export const JhaShell = () => {
  const { caseId } = useParams();
  const { t } = useI18n();
  const navigate = useNavigate();
  const isDemo = useDemoMode();
  if (!caseId) {
    return (
      <div className="p-6">
        <p className="text-red-600">{t("shell.missingJhaId")}</p>
        {isDemo && <DemoCaseActions kind="jha" onCreated={(id) => navigate(`/jha/${id}`)} />}
      </div>
    );
  }
  return (
    <JhaProvider caseId={caseId}>
      <JhaEditor />
    </JhaProvider>
  );
};
