import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { onSessionExpired } from "@/lib/sessionEvents";
import { onTenantUnavailable } from "@/lib/tenantEvents";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/i18n/I18nContext";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { TuiBanner } from "@/tui/components/TuiBanner";

type AuthState = "loading" | "authed" | "unauth";

export const AuthGate = ({ children, variant = "gui" }: { children: React.ReactNode; variant?: "gui" | "tui" }) => {
  const [state, setState] = useState<AuthState>("loading");
  const [expiredMessage, setExpiredMessage] = useState<string | null>(null);
  const [tenantMessage, setTenantMessage] = useState<string | null>(null);
  const [demoSession, setDemoSession] = useState(false);
  const [demoResetStatus, setDemoResetStatus] = useState<string | null>(null);
  const [demoResetting, setDemoResetting] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { t, setLocale, localeLabels } = useI18n();
  const { confirm, dialog } = useConfirmDialog();

  useEffect(() => {
    let active = true;
    const checkAuth = async () => {
      try {
        const response = await apiFetch("/api/auth/me");
        const payload = await response.json().catch(() => ({}));
        if (!active) return;
        if (response.ok) {
          setState("authed");
          const isDemo = Boolean(payload.user?.isDemo);
          setDemoSession(isDemo);
          if (typeof window !== "undefined") {
            try {
              if (isDemo) {
                window.sessionStorage.setItem("ss_demo", "true");
              } else {
                window.sessionStorage.removeItem("ss_demo");
              }
            } catch {
              // ignore storage errors
            }
          }
          if (payload.user?.locale && payload.user.locale in localeLabels) {
            setLocale(payload.user.locale);
          }
        } else {
          setState("unauth");
          setDemoSession(false);
          if (typeof window !== "undefined") {
            try {
              window.sessionStorage.removeItem("ss_demo");
            } catch {
              // ignore storage errors
            }
          }
        }
      } catch {
        if (active) {
          setState("unauth");
          setDemoSession(false);
          if (typeof window !== "undefined") {
            try {
              window.sessionStorage.removeItem("ss_demo");
            } catch {
              // ignore storage errors
            }
          }
        }
      }
    };
    void checkAuth();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return onSessionExpired((detail) => {
      setExpiredMessage(detail?.message ?? t("banners.sessionExpired"));
    });
  }, [t]);

  useEffect(() => {
    return onTenantUnavailable((detail) => {
      setTenantMessage(detail?.message ?? t("banners.tenantUnavailable"));
    });
  }, [t]);

  const handleDemoReset = async () => {
    const ok = await confirm({
      title: t("banners.demoReset"),
      description: t("banners.demoResetConfirm"),
      confirmLabel: t("banners.demoReset"),
      cancelLabel: t("common.cancel"),
      tone: "danger"
    });
    if (!ok) return;
    setDemoResetting(true);
    setDemoResetStatus(t("banners.demoResetting"));
    try {
      const response = await apiFetch("/api/demo/reset", { method: "POST" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || t("banners.demoResetFailed"));
      }
      setDemoResetStatus(t("banners.demoResetSuccess"));
    } catch (error) {
      setDemoResetStatus(error instanceof Error ? error.message : t("banners.demoResetFailed"));
    } finally {
      setDemoResetting(false);
    }
  };

  if (state === "loading") {
    return variant === "tui"
      ? <div className="tui-loading">{t("common.loading")}</div>
      : <div className="app-loading">{t("common.loading")}</div>;
  }
  if (state === "unauth") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return (
    <>
      {variant === "gui" && expiredMessage && (
        <div className="session-expired-banner">
          <span>{expiredMessage}</span>
          <button
            type="button"
            className="btn-outline"
            onClick={() => navigate("/login", { replace: true, state: { from: location.pathname, reason: "expired" } })}
          >
            {t("common.signInAgain")}
          </button>
        </div>
      )}
      {variant === "gui" && tenantMessage && (
        <div className="tenant-unavailable-banner">
          <span>{tenantMessage}</span>
          <span className="text-muted">{t("banners.tenantContactAdmin")}</span>
        </div>
      )}
      {variant === "gui" && demoSession && (
        <div className="demo-mode-banner">
          <span>{t("banners.demoMode")}</span>
          <div className="demo-mode-actions">
            <button type="button" className="btn-outline" onClick={handleDemoReset} disabled={demoResetting}>
              {demoResetting ? t("banners.demoResetting") : t("banners.demoReset")}
            </button>
            {demoResetStatus && <span className="text-muted">{demoResetStatus}</span>}
          </div>
        </div>
      )}
      {variant === "tui" && expiredMessage && (
        <div className="tui-auth-banner">
          <TuiBanner
            variant="warning"
            actions={(
              <button
                type="button"
                onClick={() => navigate("/login", { replace: true, state: { from: location.pathname, reason: "expired" } })}
              >
                {t("common.signInAgain")}
              </button>
            )}
          >
            {expiredMessage}
          </TuiBanner>
        </div>
      )}
      {variant === "tui" && tenantMessage && (
        <div className="tui-auth-banner">
          <TuiBanner variant="warning">
            <div>{tenantMessage}</div>
            <div className="tui-muted">{t("banners.tenantContactAdmin")}</div>
          </TuiBanner>
        </div>
      )}
      {variant === "tui" && demoSession && (
        <div className="tui-auth-banner">
          <TuiBanner
            actions={(
              <button type="button" onClick={handleDemoReset} disabled={demoResetting}>
                {demoResetting ? t("banners.demoResetting") : t("banners.demoReset")}
              </button>
            )}
          >
            <div>{t("banners.demoMode")}</div>
            {demoResetStatus && <div className="tui-muted">{demoResetStatus}</div>}
          </TuiBanner>
        </div>
      )}
      {children}
      {dialog}
    </>
  );
};
