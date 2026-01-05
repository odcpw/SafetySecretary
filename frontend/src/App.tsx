import { Navigate, Route, Routes } from "react-router-dom";
import { CaseLanding } from "@/pages/CaseLanding";
import { HomeLanding } from "@/pages/HomeLanding";
import { IncidentLanding } from "@/pages/IncidentLanding";
import { JhaLanding } from "@/pages/JhaLanding";
import { CaseShell } from "@/pages/CaseShell";
import { IncidentShell } from "@/pages/IncidentShell";
import { JhaShell } from "@/pages/JhaShell";
import { LoginPage } from "@/pages/LoginPage";
import { AuthGate } from "@/components/AuthGate";
import { AdminAuthGate } from "@/components/AdminAuthGate";
import { AdminLoginPage } from "@/pages/AdminLoginPage";
import { AdminPortal } from "@/pages/AdminPortal";

const App = () => (
  <Routes>
    <Route path="/login" element={<LoginPage />} />
    <Route path="/admin/login" element={<AdminLoginPage />} />
    <Route
      path="/admin"
      element={
        <AdminAuthGate>
          <AdminPortal />
        </AdminAuthGate>
      }
    />
    <Route path="/" element={<HomeLanding />} />
    <Route
      path="/hira"
      element={
        <AuthGate>
          <CaseLanding />
        </AuthGate>
      }
    />
    <Route
      path="/jha"
      element={
        <AuthGate>
          <JhaLanding />
        </AuthGate>
      }
    />
    <Route
      path="/incidents"
      element={
        <AuthGate>
          <IncidentLanding />
        </AuthGate>
      }
    />
    <Route
      path="/cases/:caseId/*"
      element={
        <AuthGate>
          <CaseShell />
        </AuthGate>
      }
    />
    <Route
      path="/incidents/:caseId/*"
      element={
        <AuthGate>
          <IncidentShell />
        </AuthGate>
      }
    />
    <Route
      path="/jha/:caseId/*"
      element={
        <AuthGate>
          <JhaShell />
        </AuthGate>
      }
    />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);

export default App;
