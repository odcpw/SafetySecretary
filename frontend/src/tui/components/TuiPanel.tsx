import type { ReactNode } from "react";

interface TuiPanelProps {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export const TuiPanel = ({ eyebrow, title, subtitle, actions, children }: TuiPanelProps) => (
  <section className="tui-box" box-="square">
    {(title || actions || eyebrow) && (
      <div className="tui-box__header">
        <div>
          {eyebrow && <p className="tui-eyebrow">{eyebrow}</p>}
          {title && <h2>{title}</h2>}
          {subtitle && <p className="tui-muted">{subtitle}</p>}
        </div>
        {actions && <div className="tui-box__actions">{actions}</div>}
      </div>
    )}
    <div className="tui-box__body">{children}</div>
  </section>
);
