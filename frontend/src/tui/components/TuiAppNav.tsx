import { NavLink } from "react-router-dom";
import { useI18n } from "@/i18n/I18nContext";

export const TuiAppNav = () => {
  const { t } = useI18n();
  const navItems = [
    { to: "/", label: t("navigation.home") },
    { to: "/hira", label: t("navigation.hira") },
    { to: "/jha", label: t("navigation.jha") },
    { to: "/incidents", label: t("navigation.incidents") }
  ];

  return (
    <nav className="tui-nav tui-app-nav" aria-label={t("navigation.primary")}>
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `tui-nav__link${isActive ? " tui-nav__link--active" : ""}`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
};
