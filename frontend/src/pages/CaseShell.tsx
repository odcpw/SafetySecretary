import { useParams } from "react-router-dom";
import { RaProvider } from "@/contexts/RaContext";
import { RaEditor } from "@/components/RaEditor";

export const CaseShell = () => {
  const { caseId } = useParams();
  if (!caseId) {
    return <div className="p-6 text-red-600">Missing case id.</div>;
  }
  return (
    <RaProvider caseId={caseId}>
      <RaEditor />
    </RaProvider>
  );
};
