import { useEffect, useId, useRef, useState } from "react";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { apiFetch } from "@/lib/api";
import { useI18n } from "@/i18n/I18nContext";

type SessionUser = {
  orgId: string;
  orgSlug: string;
  orgName: string;
  orgRole: string;
  userId: string;
  username: string;
  email: string;
  locale: string;
  isDemo?: boolean;
};

export const UserMenu = () => {
  const { t, locale, setLocale, localeLabels } = useI18n();
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [localeError, setLocaleError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    let active = true;
    const loadSession = async () => {
      try {
        const response = await apiFetch("/api/auth/me");
        const payload = await response.json().catch(() => ({}));
        if (!active) return;
        if (!response.ok) {
          setError(payload?.error || t("menu.loadFailed"));
          return;
        }
        setSession(payload.user as SessionUser);
        setError(null);
        if (payload.user?.locale && payload.user.locale in localeLabels && payload.user.locale !== locale) {
          setLocale(payload.user.locale as keyof typeof localeLabels);
        }
      } catch (err) {
        if (active) {
          setError(err instanceof Error ? err.message : t("menu.loadFailed"));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    void loadSession();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!open) return;
      const target = event.target as Node | null;
      if (panelRef.current && target && !panelRef.current.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleLogout = async () => {
    const isDemo = session?.isDemo ?? false;
    try {
      await apiFetch("/api/auth/logout", { method: "POST" });
    } finally {
      // Demo users go to public landing; regular users can also go there since it's public
      window.location.href = isDemo ? "/" : "/login";
    }
  };

  const handleLocaleChange = async (nextLocale: string) => {
    if (!session) {
      return;
    }
    if (!(nextLocale in localeLabels)) {
      return;
    }
    const previousLocale = locale;
    setLocale(nextLocale as keyof typeof localeLabels);
    setLocaleError(null);
    try {
      const response = await apiFetch("/api/auth/me/locale", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: nextLocale })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || t("menu.localeUpdateFailed"));
      }
      setSession((prev) => (prev ? { ...prev, locale: nextLocale } : prev));
    } catch (err) {
      setLocale(previousLocale);
      setLocaleError(err instanceof Error ? err.message : t("menu.localeUpdateFailed"));
    }
  };

  const initials = session?.username ? session.username.slice(0, 1).toUpperCase() : "U";
  const displayName = session?.username ?? t("menu.account");

  return (
    <div className="user-menu" ref={panelRef}>
      <button
        type="button"
        className="user-menu__button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span className="user-menu__avatar">{initials}</span>
        <span className="user-menu__label">{displayName}</span>
      </button>
      {open && (
        <div className="user-menu__panel" role="dialog" aria-modal="false" aria-label={t("menu.account")} id={panelId}>
          <header>
            <p className="text-label">{t("menu.signedIn")}</p>
            {loading ? (
              <p className="text-muted">{t("common.loading")}</p>
            ) : error ? (
              <p className="text-error">{error}</p>
            ) : (
              <>
                <h3>{session?.orgName}</h3>
                <p className="text-muted">
                  {session?.orgSlug} / {session?.username} / {session?.orgRole}
                </p>
              </>
            )}
          </header>

          <section>
            <h4>{t("menu.account")}</h4>
            <div className="user-menu__field">
              <label>{t("menu.displayName")}</label>
              <input value={session?.username ?? ""} disabled placeholder={t("menu.managedByAdmin")} />
            </div>
            <div className="user-menu__field">
              <label>{t("menu.email")}</label>
              <input value={session?.email ?? ""} disabled placeholder={t("menu.managedByAdmin")} />
            </div>
            <p className="text-muted">{t("menu.accountEdits")}</p>
          </section>

          <section>
            <h4>{t("menu.preferences")}</h4>
            <div className="user-menu__row">
              <span>{t("menu.theme")}</span>
              <ThemeToggle />
            </div>
            <div className="user-menu__row">
              <span>{t("menu.language")}</span>
              <select
                value={session?.locale ?? locale}
                onChange={(event) => void handleLocaleChange(event.target.value)}
                disabled={!session}
              >
                {Object.entries(localeLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            {localeError && <p className="text-error">{localeError}</p>}
          </section>

          <section>
            <h4>{t("menu.apiKey")}</h4>
            <div className="user-menu__field">
              <label>{t("menu.companyKey")}</label>
              <input disabled placeholder={t("menu.managedByAdmin")} />
            </div>
          </section>

          <section>
            <h4>{t("menu.subAccounts")}</h4>
            <p className="text-muted">{t("menu.subAccountsHint")}</p>
          </section>

          <section>
            <h4>{t("menu.needChanges")}</h4>
            <p className="text-muted">
              {t("menu.contactAdmin")}
            </p>
          </section>

          <footer>
            <button type="button" className="btn-outline" onClick={handleLogout}>
              {t("common.signOut")}
            </button>
          </footer>
        </div>
      )}
    </div>
  );
};
