import type { ReactNode } from "react";

interface TuiStatusLineProps {
  status: "ready" | "saving" | "error" | "editing" | "parsing" | "applying";
  message?: string;
  primary?: ReactNode;
  secondary?: ReactNode;
  className?: string;
}

const statusLabels: Record<TuiStatusLineProps["status"], string> = {
  ready: "Ready",
  saving: "Saving",
  error: "Error",
  editing: "Editing",
  parsing: "Parsing",
  applying: "Applying"
};

export const TuiStatusLine = ({ status, message, primary, secondary, className }: TuiStatusLineProps) => {
  const left = primary ?? statusLabels[status];
  const right = secondary ?? message ?? null;
  const classes = ["tui-status", `tui-statusline--${status}`, className].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <span>{left}</span>
      {right && (typeof right === "string" ? <span className="tui-muted">{right}</span> : right)}
    </div>
  );
};
