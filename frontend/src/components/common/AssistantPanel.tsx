import { useEffect, useRef } from "react";
import { useSpeechToText } from "@/lib/useSpeechToText";
import { useI18n } from "@/i18n/I18nContext";

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
  const { t } = useI18n();
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
      <div className="phase-llm-panel__field">
        <textarea value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
        <button type="button" className="btn-primary" disabled={submitDisabled} onClick={onSubmit}>
          {primaryLabel}
        </button>
        {enableVoice && (
          <button
            type="button"
            className="btn-outline"
            onClick={() => (speech.listening ? speech.stop() : speech.start())}
            disabled={disabled || !speech.supported}
            title={speech.supported ? t("assistant.voiceSupported") : t("assistant.voiceUnsupported")}
          >
            {speech.listening ? t("assistant.stopMic") : t("assistant.startMic")}
          </button>
        )}
      </div>
      <div className="phase-llm-panel__actions">
        <button type="button" className="btn-outline" disabled={!value} onClick={handleClear}>
          {t("common.clear")}
        </button>
        {status && <span className="text-sm text-slate-500">{status}</span>}
      </div>
      {enableVoice && speech.listening && speech.interimText && (
        <p className="text-sm text-slate-500">{t("assistant.listening", { values: { text: speech.interimText } })}</p>
      )}
      {enableVoice && speech.error && (
        <p className="text-sm text-slate-500">{speech.error}</p>
      )}
    </section>
  );
};
