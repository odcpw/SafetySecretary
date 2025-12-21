import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useI18n } from "@/i18n/I18nContext";

type AuthState = "loading" | "authed" | "unauth";

export const AdminAuthGate = ({ children }: { children: React.ReactNode }) => {
  const [state, setState] = useState<AuthState>("loading");
  const location = useLocation();
  const { t } = useI18n();

  useEffect(() => {
    let active = true;
    const checkAuth = async () => {
      try {
        const response = await fetch("/api/admin/auth/me", { credentials: "include" });
        if (!active) return;
        setState(response.ok ? "authed" : "unauth");
      } catch {
        if (active) {
          setState("unauth");
        }
      }
    };
    void checkAuth();
    return () => {
      active = false;
    };
  }, []);

  if (state === "loading") {
    return <div className="app-loading">{t("admin.checkingAccess")}</div>;
  }
  if (state === "unauth") {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
};
