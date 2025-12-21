import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { useI18n } from "@/i18n/I18nContext";

type LoginError = {
  message: string;
  remainingAttempts?: number;
  lockedUntil?: string | null;
};

export const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, formatDateTime, setLocale, localeLabels } = useI18n();
  const [orgSlug, setOrgSlug] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<LoginError | null>(null);
  const [demoSubmitting, setDemoSubmitting] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const sessionExpired = (location.state as any)?.reason === "expired";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          orgSlug: orgSlug.trim(),
          username: username.trim(),
          password,
          rememberMe
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError({
          message: payload?.error || t("auth.loginFailed"),
          remainingAttempts: payload?.remainingAttempts,
          lockedUntil: payload?.lockedUntil
        });
        return;
      }
      if (payload?.user?.locale && payload.user.locale in localeLabels) {
        setLocale(payload.user.locale as keyof typeof localeLabels);
      }
      const target = (location.state as any)?.from ?? "/";
      navigate(target, { replace: true });
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : t("auth.loginFailed") });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemoLogin = async () => {
    setDemoSubmitting(true);
    setDemoError(null);
    try {
      const response = await fetch("/api/auth/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include"
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setDemoError(payload?.error || t("auth.demoLoginFailed"));
        return;
      }
      if (payload?.user?.locale && payload.user.locale in localeLabels) {
        setLocale(payload.user.locale as keyof typeof localeLabels);
      }
      const target = (location.state as any)?.from ?? "/";
      navigate(target, { replace: true });
    } catch (err) {
      setDemoError(err instanceof Error ? err.message : t("auth.demoLoginFailed"));
    } finally {
      setDemoSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-header">
          <div>
            <p className="text-label">{t("common.appName")}</p>
            <h1>{t("auth.welcomeBack")}</h1>
            <p className="text-muted">{t("auth.signInSubtitle")}</p>
          </div>
          <ThemeToggle />
        </div>

        {sessionExpired && (
          <div className="auth-info">
            {t("auth.sessionExpired")}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            {t("auth.orgSlug")}
            <input
              type="text"
              value={orgSlug}
              onChange={(event) => setOrgSlug(event.target.value)}
              placeholder={t("auth.orgSlugPlaceholder")}
              autoComplete="organization"
              required
            />
          </label>
          <label>
            {t("auth.username")}
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder={t("auth.usernamePlaceholder")}
              autoComplete="username"
              required
            />
          </label>
          <label>
            {t("auth.password")}
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          <label className="auth-remember">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            {t("auth.rememberMe")}
          </label>

          {error && (
            <div className="auth-error">
              <p>{error.message}</p>
              {typeof error.remainingAttempts === "number" && (
                <p>{t("auth.remainingAttempts", { values: { count: error.remainingAttempts } })}</p>
              )}
              {error.lockedUntil && (
                <>
                  <p>{t("auth.lockedUntil", { values: { date: formatDateTime(error.lockedUntil) } })}</p>
                  <p>{t("auth.contactAdmin")}</p>
                </>
              )}
            </div>
          )}

          <button type="submit" disabled={submitting}>
            {submitting ? t("auth.signingIn") : t("common.signIn")}
          </button>
        </form>

        <div className="auth-divider">
          <span>{t("auth.demoDivider")}</span>
        </div>

        <div className="auth-demo">
          <p className="text-muted">{t("auth.demoSubtitle")}</p>
          <button type="button" className="btn-outline" onClick={handleDemoLogin} disabled={demoSubmitting}>
            {demoSubmitting ? t("auth.demoSigningIn") : t("auth.demoLogin")}
          </button>
          {demoError && <div className="auth-error">{demoError}</div>}
        </div>
      </div>
    </div>
  );
};
