interface AssistantPanelProps {
  title: string;
  description: string;
  value: string;
  placeholder: string;
  primaryLabel: string;
  status?: string | null;
  disabled?: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClear?: () => void;
}

export const AssistantPanel = ({
  title,
  description,
  value,
  placeholder,
  primaryLabel,
  status,
  disabled = false,
  onChange,
  onSubmit,
  onClear
}: AssistantPanelProps) => {
  const handleClear = () => {
    onClear?.();
  };
  const submitDisabled = disabled || !value.trim();

  return (
    <section className="phase-llm-panel">
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="text-sm text-slate-600">{description}</p>
      <textarea value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      <div className="phase-llm-panel__actions">
        <button type="button" disabled={submitDisabled} onClick={onSubmit}>
          {primaryLabel}
        </button>
        <button type="button" className="btn-outline" disabled={!value} onClick={handleClear}>
          Clear
        </button>
        {status && <span className="text-sm text-slate-500">{status}</span>}
      </div>
    </section>
  );
};
