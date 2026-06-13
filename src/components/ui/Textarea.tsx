import { forwardRef, useId } from "react";
import type { TextareaProps } from "./types";

const baseTextareaClasses =
  "block min-h-24 w-full resize-y rounded-md border bg-[var(--color-surface)] px-3 py-2 text-[length:var(--text-sm)] text-[var(--color-text)] shadow-sm transition-colors duration-150 placeholder:text-[var(--color-muted)] focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 read-only:cursor-default";

const normalTextareaClasses =
  "border-[var(--color-border)] hover:border-[var(--color-accent)] focus:border-[var(--color-accent)] focus:ring-[var(--color-accent)]";

const errorTextareaClasses =
  "border-[var(--color-accent)] focus:border-[var(--color-accent)] focus:ring-[var(--color-accent)]";

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function joinIds(...ids: Array<string | undefined>) {
  const describedBy = ids.filter(Boolean).join(" ");

  return describedBy.length > 0 ? describedBy : undefined;
}

const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea(
    {
      "aria-describedby": ariaDescribedBy,
      "aria-invalid": ariaInvalid,
      className,
      disabled = false,
      error,
      id,
      label,
      readOnly = false,
      required,
      ...textareaProps
    },
    ref,
  ) {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    const hasError = Boolean(error);
    const errorId = hasError ? `${fieldId}-error` : undefined;
    const describedBy = joinIds(ariaDescribedBy, errorId);

    return (
      <div className="grid gap-1.5">
        {label ? (
          <label
            className="text-[length:var(--text-xs)] font-medium text-[var(--color-muted)]"
            htmlFor={fieldId}
          >
            {label}
          </label>
        ) : null}
        <textarea
          {...textareaProps}
          aria-describedby={describedBy}
          aria-disabled={disabled ? true : undefined}
          aria-errormessage={errorId}
          aria-invalid={hasError ? true : ariaInvalid}
          aria-multiline="true"
          aria-readonly={readOnly ? true : undefined}
          aria-required={required ? true : undefined}
          className={joinClasses(
            baseTextareaClasses,
            hasError ? errorTextareaClasses : normalTextareaClasses,
            className,
          )}
          disabled={disabled}
          id={fieldId}
          readOnly={readOnly}
          ref={ref}
          required={required}
        />
        {hasError ? (
          <p
            className="text-[length:var(--text-xs)] text-[var(--color-accent)]"
            id={errorId}
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>
    );
  },
);

Textarea.displayName = "Textarea";

export default Textarea;
