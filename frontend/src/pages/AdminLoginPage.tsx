import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { useI18n } from "@/i18n/I18nContext";

type AdminLoginError = {
  message: string;
};

export const AdminLoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<AdminLoginError | null>(null);

  const [bootstrapOpen, setBootstrapOpen] = useState(false);
  const [bootstrapToken, setBootstrapToken] = useState("");
  const [bootstrapEmail, setBootstrapEmail] = useState("");
  const [bootstrapUsername, setBootstrapUsername] = useState("");
  const [bootstrapPassword, setBootstrapPassword] = useState("");
  const [bootstrapStatus, setBootstrapStatus] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username: username.trim(), password })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError({ message: payload?.error || t("auth.loginFailed") });
        return;
      }
      const target = (location.state as any)?.from ?? "/admin";
      navigate(target, { replace: true });
    } catch (err) {
      setError({ message: err instanceof Error ? err.message : t("auth.loginFailed") });
    } finally {
      setSubmitting(false);
    }
  };

  const handleBootstrap = async (event: React.FormEvent) => {
    event.preventDefault();
    setBootstrapStatus(t("admin.bootstrapCreating"));
    try {
      const response = await fetch("/api/admin/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: bootstrapToken.trim(),
          username: bootstrapUsername.trim(),
          email: bootstrapEmail.trim(),
          password: bootstrapPassword
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || t("admin.bootstrapFailed"));
      }
      setBootstrapStatus(t("admin.bootstrapSuccess"));
      setBootstrapOpen(false);
    } catch (err) {
      setBootstrapStatus(err instanceof Error ? err.message : t("admin.bootstrapFailed"));
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-header">
          <div>
            <p className="text-label">{t("common.appName")}</p>
            <h1>{t("auth.adminTitle")}</h1>
            <p className="text-muted">{t("auth.adminSubtitle")}</p>
          </div>
          <ThemeToggle />
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            {t("admin.username")}
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
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

          {error && (
            <div className="auth-error">
              <p>{error.message}</p>
            </div>
          )}

          <button type="submit" disabled={submitting}>
            {submitting ? t("auth.signingIn") : t("common.signIn")}
          </button>
        </form>

        <details className="auth-bootstrap" open={bootstrapOpen} onToggle={(event) => setBootstrapOpen(event.currentTarget.open)}>
          <summary>{t("auth.bootstrapTitle")}</summary>
          <form onSubmit={handleBootstrap} className="auth-form">
            <label>
              {t("auth.bootstrapToken")}
              <input
                type="text"
                value={bootstrapToken}
                onChange={(event) => setBootstrapToken(event.target.value)}
                placeholder={t("admin.bootstrapTokenPlaceholder")}
                required
              />
            </label>
            <label>
              {t("auth.bootstrapEmail")}
              <input
                type="email"
                value={bootstrapEmail}
                onChange={(event) => setBootstrapEmail(event.target.value)}
                required
              />
            </label>
            <label>
              {t("auth.bootstrapUsername")}
              <input
                type="text"
                value={bootstrapUsername}
                onChange={(event) => setBootstrapUsername(event.target.value)}
                required
              />
            </label>
            <label>
              {t("auth.bootstrapPassword")}
              <input
                type="password"
                value={bootstrapPassword}
                onChange={(event) => setBootstrapPassword(event.target.value)}
                required
              />
            </label>
            {bootstrapStatus && <p className="text-muted">{bootstrapStatus}</p>}
            <button type="submit">{t("auth.createAdmin")}</button>
          </form>
        </details>
      </div>
    </div>
  );
};
