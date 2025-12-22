import type { ReactNode } from "react";

interface TuiFormFieldProps {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}

export const TuiFormField = ({ label, hint, error, children }: TuiFormFieldProps) => (
  <label className="tui-field">
    <span className="tui-field__label">{label}</span>
    {children}
    {hint && <span className="tui-muted">{hint}</span>}
    {error && <span className="tui-field__error">{error}</span>}
  </label>
);
