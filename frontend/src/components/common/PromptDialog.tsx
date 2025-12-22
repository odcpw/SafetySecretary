import { useEffect, useId, useRef, useState } from "react";

interface PromptDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel: string;
  placeholder?: string;
  inputType?: "text" | "password";
  onConfirm: (value: string) => void;
  onClose: () => void;
}

export const PromptDialog = ({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  placeholder,
  inputType = "text",
  onConfirm,
  onClose
}: PromptDialogProps) => {
  const titleId = useId();
  const descriptionId = useId();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setValue("");
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    const timeout = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.clearTimeout(timeout);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const trimmed = value.trim();

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card prompt-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header prompt-modal__header">
          <div>
            <h2 id={titleId}>{title}</h2>
            {description && (
              <p id={descriptionId} className="text-muted">
                {description}
              </p>
            )}
          </div>
          <button type="button" className="btn-ghost btn-small" onClick={onClose}>
            {cancelLabel}
          </button>
        </header>

        <div className="prompt-modal__body">
          <label className="prompt-modal__label">
            <span className="text-label">{title}</span>
            <input
              ref={inputRef}
              type={inputType}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={placeholder}
              autoComplete={inputType === "password" ? "new-password" : "off"}
            />
          </label>
        </div>

        <div className="confirm-modal__actions">
          <button type="button" className="btn-outline" onClick={onClose}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!trimmed}
            onClick={() => {
              if (!trimmed) return;
              onConfirm(trimmed);
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
