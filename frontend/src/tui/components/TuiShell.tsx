import type { ReactNode } from "react";

interface TuiShellProps {
  children: ReactNode;
}

export const TuiShell = ({ children }: TuiShellProps) => (
  <div className="tui-shell">
    {children}
  </div>
);
