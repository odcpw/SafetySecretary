import type { ReactNode } from "react";

interface TuiHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  meta?: ReactNode;
}

export const TuiHeader = ({ eyebrow, title, subtitle, actions, meta }: TuiHeaderProps) => (
  <header className="tui-header">
    <div className="tui-header__summary">
      {eyebrow && <p className="tui-eyebrow">{eyebrow}</p>}
      <h1 className="tui-title">{title}</h1>
      {subtitle && <p className="tui-muted">{subtitle}</p>}
      {meta}
    </div>
    {actions && <div className="tui-header__actions">{actions}</div>}
  </header>
);
