import { useEffect } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthGate } from "@/components/AuthGate";
import { useTheme } from "@/contexts/ThemeContext";
import { TuiHome } from "@/tui/pages/TuiHome";
import { TuiHiraLanding } from "@/tui/pages/TuiHiraLanding";
import { TuiCaseShell } from "@/tui/pages/TuiCaseShell";
import { TuiIncidentCaseShell } from "@/tui/pages/TuiIncidentCaseShell";
import { TuiIncidentLanding } from "@/tui/pages/TuiIncidentLanding";
import { TuiJhaCaseShell } from "@/tui/pages/TuiJhaCaseShell";
import { TuiJhaLanding } from "@/tui/pages/TuiJhaLanding";

const TuiThemeBridge = () => {
  const { theme } = useTheme();

  useEffect(() => {
    document.documentElement.setAttribute("data-webtui-theme", theme);
  }, [theme]);

  return null;
};

const TuiLoginRedirect = () => {
  const location = useLocation();

  useEffect(() => {
    const next = location.state && typeof location.state === "object" && "from" in location.state
      ? (location.state as { from?: string }).from
      : null;
    const target = next ? `/tui${next}` : "/tui";
    const redirect = `/login?from=${encodeURIComponent(target)}`;
    window.location.assign(redirect);
  }, [location.state]);

  return <div className="tui-loading">Redirecting to login...</div>;
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => (
  <AuthGate variant="tui">
    <TuiThemeBridge />
    {children}
  </AuthGate>
);

export const TuiApp = () => (
  <Routes>
    <Route path="/login" element={<TuiLoginRedirect />} />
    <Route path="/" element={<ProtectedRoute><TuiHome /></ProtectedRoute>} />
    <Route path="/hira" element={<ProtectedRoute><TuiHiraLanding /></ProtectedRoute>} />
    <Route path="/jha" element={<ProtectedRoute><TuiJhaLanding /></ProtectedRoute>} />
    <Route path="/incidents" element={<ProtectedRoute><TuiIncidentLanding /></ProtectedRoute>} />
    <Route path="/cases/:caseId/*" element={<ProtectedRoute><TuiCaseShell /></ProtectedRoute>} />
    <Route path="/jha/:caseId/*" element={<ProtectedRoute><TuiJhaCaseShell /></ProtectedRoute>} />
    <Route path="/incidents/:caseId/*" element={<ProtectedRoute><TuiIncidentCaseShell /></ProtectedRoute>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);
