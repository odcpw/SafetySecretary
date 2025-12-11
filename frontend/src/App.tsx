import { Navigate, Route, Routes } from "react-router-dom";
import { CaseLanding } from "@/pages/CaseLanding";
import { CaseShell } from "@/pages/CaseShell";

const App = () => (
  <Routes>
    <Route path="/" element={<CaseLanding />} />
    <Route path="/cases/:caseId/*" element={<CaseShell />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

export default App;
