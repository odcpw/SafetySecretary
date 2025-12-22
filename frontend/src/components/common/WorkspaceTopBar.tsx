import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useI18n } from "@/i18n/I18nContext";

interface WorkspaceTopBarProps {
  label: string;
  title: string;
  subtitle: ReactNode;
  saving?: boolean;
  actions?: ReactNode;
  prompt?: ReactNode;
  breadcrumbs?: { label: string; to?: string }[];
}

const resolveNavState = (pathname: string, to: string) => {
  if (to === "/") {
    return pathname === "/";
  }
  if (to === "/hira") {
    return pathname.startsWith("/hira") || pathname.startsWith("/cases");
  }
  return pathname.startsWith(to);
};

export const WorkspaceTopBar = ({
  label,
  title,
  subtitle,
  saving = false,
  actions,
  prompt,
  breadcrumbs
}: WorkspaceTopBarProps) => {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const navItems = [
    { to: "/", label: t("navigation.home") },
    { to: "/hira", label: t("navigation.hira") },
    { to: "/jha", label: t("navigation.jha") },
    { to: "/incidents", label: t("navigation.incidents") }
  ];

  return (
    <header className="workspace-topbar">
      <div className="workspace-topbar__summary">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="workspace-topbar__breadcrumbs" aria-label={t("navigation.breadcrumbs")}>
            {breadcrumbs.map((crumb, index) => (
              <span key={`${crumb.label}-${index}`} className="workspace-topbar__crumb">
                {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : <span>{crumb.label}</span>}
                {index < breadcrumbs.length - 1 && <span className="workspace-topbar__crumb-sep">/</span>}
              </span>
            ))}
          </nav>
        )}
        <p className="text-label">{label}</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
        {saving && <p className="text-saving">{t("workspace.saving")}</p>}
      </div>
      <div className="workspace-topbar__actions">{actions}</div>
      <nav className="workspace-topbar__nav" aria-label={t("navigation.primary")}>
        {navItems.map((item) => {
          const isActive = resolveNavState(pathname, item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`workspace-nav__link${isActive ? " workspace-nav__link--active" : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      {prompt && <div className="workspace-topbar__prompt">{prompt}</div>}
    </header>
  );
};
