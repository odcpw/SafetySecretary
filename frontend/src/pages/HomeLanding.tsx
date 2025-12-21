import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { UserMenu } from "@/components/common/UserMenu";
import { useI18n } from "@/i18n/I18nContext";

export const HomeLanding = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
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

  return (
    <div className="landing-shell">
      <section className="landing-hero">
        <div className="landing-hero__inner">
          <div className="landing-hero__header">
            <p className="text-label">{t("common.appName")}</p>
            <div className="landing-hero__meta">
              <ThemeToggle />
              <UserMenu />
            </div>
          </div>
          <h1>{t("landing.home.heroTitle")}</h1>
          <p>{t("landing.home.heroSubtitle")}</p>
        </div>
      </section>

      <main className="home-tiles">
        {tiles.map((tile) => (
          <section key={tile.key} className={`home-tile home-tile--${tile.key} app-panel`}>
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
              <button type="button" onClick={() => navigate(tile.path)}>
                {tile.cta}
              </button>
            </div>
          </section>
        ))}
      </main>
    </div>
  );
};
