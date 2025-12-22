import { useNavigate } from "react-router-dom";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { useI18n } from "@/i18n/I18nContext";
import { TuiAppNav } from "@/tui/components/TuiAppNav";
import { TuiHeader } from "@/tui/components/TuiHeader";
import { TuiPanel } from "@/tui/components/TuiPanel";
import { TuiShell } from "@/tui/components/TuiShell";

export const TuiHome = () => {
  const navigate = useNavigate();
  const { t } = useI18n();

  return (
    <TuiShell>
      <TuiHeader
        eyebrow={t("common.appName")}
        title={t("landing.home.heroTitle")}
        subtitle={t("landing.home.heroSubtitle")}
        actions={(
          <>
            <ThemeToggle className="tui-theme-toggle" />
            <button type="button" onClick={() => window.location.assign("/")}>
              Switch to GUI
            </button>
          </>
        )}
      />
      <TuiAppNav />

      <TuiPanel
        eyebrow={t("landing.home.tiles.hira.badge")}
        title={t("landing.home.tiles.hira.title")}
        subtitle={t("landing.home.tiles.hira.description")}
        actions={(
          <button type="button" onClick={() => navigate("/hira")}>
            {t("landing.home.tiles.hira.cta")}
          </button>
        )}  
      >
        <ul className="tui-list">
          <li>{t("landing.home.tiles.hira.bulletOne")}</li>
          <li>{t("landing.home.tiles.hira.bulletTwo")}</li>
          <li>{t("landing.home.tiles.hira.bulletThree")}</li>
        </ul>
      </TuiPanel>

      <TuiPanel
        eyebrow={t("landing.home.tiles.jha.badge")}
        title={t("landing.home.tiles.jha.title")}
        subtitle={t("landing.home.tiles.jha.description")}
        actions={(
          <button type="button" onClick={() => navigate("/jha")}>
            {t("landing.home.tiles.jha.cta")}
          </button>
        )}
      >
        <ul className="tui-list">
          <li>{t("landing.home.tiles.jha.bulletOne")}</li>
          <li>{t("landing.home.tiles.jha.bulletTwo")}</li>
          <li>{t("landing.home.tiles.jha.bulletThree")}</li>
        </ul>
      </TuiPanel>

      <TuiPanel
        eyebrow={t("landing.home.tiles.incident.badge")}
        title={t("landing.home.tiles.incident.title")}
        subtitle={t("landing.home.tiles.incident.description")}
        actions={(
          <button type="button" onClick={() => navigate("/incidents")}>
            {t("landing.home.tiles.incident.cta")}
          </button>
        )}
      >
        <ul className="tui-list">
          <li>{t("landing.home.tiles.incident.bulletOne")}</li>
          <li>{t("landing.home.tiles.incident.bulletTwo")}</li>
          <li>{t("landing.home.tiles.incident.bulletThree")}</li>
        </ul>
      </TuiPanel>
    </TuiShell>
  );
};
