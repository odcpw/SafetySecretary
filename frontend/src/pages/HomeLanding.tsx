import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { UserMenu } from "@/components/common/UserMenu";
import { useI18n } from "@/i18n/I18nContext";

export const HomeLanding = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [loadingTile, setLoadingTile] = useState<string | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);
  const tiles = useMemo(
    () => [
      {
        key: "hira",
        badge: t("landing.home.tiles.hira.badge"),
        title: t("landing.home.tiles.hira.title"),
        description: t("landing.home.tiles.hira.description"),
        bullets: [
          t("landing.home.tiles.hira.bulletOne"),
          t("landing.home.tiles.hira.bulletTwo"),
          t("landing.home.tiles.hira.bulletThree")
        ],
        path: "/hira",
        cta: t("landing.home.tiles.hira.cta")
      },
      {
        key: "jha",
        badge: t("landing.home.tiles.jha.badge"),
        title: t("landing.home.tiles.jha.title"),
        description: t("landing.home.tiles.jha.description"),
        bullets: [
          t("landing.home.tiles.jha.bulletOne"),
          t("landing.home.tiles.jha.bulletTwo"),
          t("landing.home.tiles.jha.bulletThree")
        ],
        path: "/jha",
        cta: t("landing.home.tiles.jha.cta")
      },
      {
        key: "incident",
        badge: t("landing.home.tiles.incident.badge"),
        title: t("landing.home.tiles.incident.title"),
        description: t("landing.home.tiles.incident.description"),
        bullets: [
          t("landing.home.tiles.incident.bulletOne"),
          t("landing.home.tiles.incident.bulletTwo"),
          t("landing.home.tiles.incident.bulletThree")
        ],
        path: "/incidents",
        cta: t("landing.home.tiles.incident.cta")
      }
    ],
    [t]
  );

  const handleTileClick = async (tileKey: string, path: string) => {
    setDemoError(null);
    setLoadingTile(tileKey);
    try {
      // Check if user is already authenticated
      const authResponse = await fetch("/api/auth/me", {
        method: "GET",
        credentials: "include"
      });

      if (authResponse.ok) {
        // Already authenticated, navigate directly
        navigate(path);
        return;
      }

      // Not authenticated, perform demo login
      const demoResponse = await fetch("/api/auth/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include"
      });

      if (!demoResponse.ok) {
        const payload = await demoResponse.json().catch(() => ({}));
        setDemoError(payload?.error || t("auth.demoLoginFailed"));
        return;
      }

      // Demo login successful
      sessionStorage.setItem("ss_demo", "true");
      navigate(path);
    } catch (err) {
      setDemoError(err instanceof Error ? err.message : t("auth.demoLoginFailed"));
    } finally {
      setLoadingTile(null);
    }
  };

  return (
    <div className="landing-shell">
      <section className="landing-hero">
        <div className="landing-hero__inner">
          <div className="landing-hero__header">
            <p className="text-label">{t("common.appName")}</p>
            <div className="landing-hero__meta">
              <button type="button" className="btn-outline" onClick={() => window.location.assign("/tui")}>
                Switch to TUI
              </button>
              <ThemeToggle />
              <UserMenu />
            </div>
          </div>
          <h1>{t("landing.home.heroTitle")}</h1>
          <p>{t("landing.home.heroSubtitle")}</p>
        </div>
      </section>

      {demoError && (
        <div className="auth-error" style={{ margin: "0 auto 1rem", maxWidth: "40rem", textAlign: "center" }}>
          {demoError}
        </div>
      )}

      <main className="home-tiles grid-auto">
        {tiles.map((tile) => (
          <section key={tile.key} className={`home-tile home-tile--${tile.key} app-panel card`}>
            <div>
              <span className="home-tile__badge">{tile.badge}</span>
              <h2>{tile.title}</h2>
              <p className="text-muted">{tile.description}</p>
              <ul className="home-tile__list">
                {tile.bullets.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="home-tile__actions">
              <button
                type="button"
                onClick={() => handleTileClick(tile.key, tile.path)}
                disabled={loadingTile !== null}
              >
                {loadingTile === tile.key ? t("auth.demoSigningIn") : tile.cta}
              </button>
            </div>
          </section>
        ))}
      </main>
    </div>
  );
};
