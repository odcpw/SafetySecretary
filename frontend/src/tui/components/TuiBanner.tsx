import type { ReactNode } from "react";

type TuiBannerVariant = "info" | "warning" | "error";

interface TuiBannerProps {
  variant?: TuiBannerVariant;
  children: ReactNode;
  actions?: ReactNode;
}

export const TuiBanner = ({ variant = "info", children, actions }: TuiBannerProps) => (
  <div className={`tui-banner tui-banner--${variant}`} box-="square">
    <div>{children}</div>
    {actions && <div className="tui-banner__actions">{actions}</div>}
  </div>
);
