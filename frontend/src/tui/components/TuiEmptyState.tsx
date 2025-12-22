import type { ReactNode } from "react";

interface TuiEmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export const TuiEmptyState = ({ title, description, action }: TuiEmptyStateProps) => (
  <div className="tui-empty-state">
    <strong>{title}</strong>
    {description && <p className="tui-muted">{description}</p>}
    {action}
  </div>
);
