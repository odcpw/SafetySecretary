import { useEffect, useRef } from "react";
import { useSpeechToText } from "@/lib/useSpeechToText";

interface AssistantPanelProps {
  title: string;
  description: string;
  value: string;
  placeholder: string;
  primaryLabel: string;
  status?: string | null;
  disabled?: boolean;
  enableVoice?: boolean;
  voiceLang?: string;
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
  enableVoice = false,
  voiceLang,
  onChange,
  onSubmit,
  onClear
}: AssistantPanelProps) => {
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const speech = useSpeechToText({
    onFinalText: (text) => {
      const current = valueRef.current.trim();
      onChange(current ? `${current} ${text}` : text);
    },
    lang: voiceLang ?? "en-US"
  });

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
        {enableVoice && (
          <button
            type="button"
            className="btn-outline"
            onClick={() => (speech.listening ? speech.stop() : speech.start())}
            disabled={disabled || !speech.supported}
            title={speech.supported ? "Dictate using your microphone" : "Speech recognition not supported"}
          >
            {speech.listening ? "Stop mic" : "Start mic"}
          </button>
        )}
        <button type="button" className="btn-outline" disabled={!value} onClick={handleClear}>
          Clear
        </button>
        {status && <span className="text-sm text-slate-500">{status}</span>}
      </div>
      {enableVoice && speech.listening && speech.interimText && (
        <p className="text-sm text-slate-500">Listening… {speech.interimText}</p>
      )}
      {enableVoice && speech.error && (
        <p className="text-sm text-slate-500">{speech.error}</p>
      )}
    </section>
  );
};
