/**
 * GlobalLLMInput - Natural language input for contextual table updates
 *
 * Provides a text input that allows users to describe changes in natural language:
 * - "forgot to mention we use a ladder in step 3"
 * - "insert a step between 3 and 4: clean up work area"
 * - "the slip hazard was due to tools lying around"
 * - "add PPE requirement for step 2: safety glasses"
 *
 * The LLM parses the input and generates structured commands to update the table.
 */
import { useState, type RefObject } from "react";
import { useRaContext } from "@/contexts/RaContext";
import type { ContextualUpdateCommand, ParsedContextualUpdate } from "@/contexts/RaContext";
import type { Phase } from "@/types/riskAssessment";
import { useSpeechToText } from "@/lib/useSpeechToText";
import { useI18n } from "@/i18n/I18nContext";

interface GlobalLLMInputProps {
  currentPhase: Phase;
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
}

export const GlobalLLMInput = ({ currentPhase, textareaRef }: GlobalLLMInputProps) => {
  const { saving, actions, lastContextualUpdate } = useRaContext();
  const { t, locale } = useI18n();
  const [input, setInput] = useState("");
  const [clarification, setClarification] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsedResult, setParsedResult] = useState<ParsedContextualUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [undoStatus, setUndoStatus] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);

  const voiceLang = locale === "fr" ? "fr-FR" : locale === "de" ? "de-DE" : "en-US";
  const speech = useSpeechToText({
    onFinalText: (text) =>
      setInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text)),
    lang: voiceLang
  });

  // Parse the user's natural language input
  const handleParse = async () => {
    if (!input.trim() || parsing) return;

    if (speech.listening) {
      speech.stop();
    }

    setError(null);
    setParsing(true);
    setParsedResult(null);
    setClarification("");
    setUndoStatus(null);
    setUndoError(null);

    try {
      const result = await actions.parseContextualUpdate(input.trim(), currentPhase);
      setParsedResult(result);
    } catch (err) {
      console.error("Parse error:", err);
      setError(err instanceof Error ? err.message : t("llm.parseFailed"));
    } finally {
      setParsing(false);
    }
  };

  const handleClarify = async () => {
    if (!parsedResult?.needsClarification || parsing) return;
    if (!input.trim() || !clarification.trim()) return;

    setError(null);
    setParsing(true);
    setUndoStatus(null);
    setUndoError(null);

    try {
      const combined = `${input.trim()}\n\n${t("llm.clarificationPrefix")}: ${clarification.trim()}`;
      const result = await actions.parseContextualUpdate(combined, currentPhase);
      setParsedResult(result);
      if (!result.needsClarification) {
        setClarification("");
      }
    } catch (err) {
      console.error("Clarification parse error:", err);
      setError(err instanceof Error ? err.message : t("llm.reparseFailed"));
    } finally {
      setParsing(false);
    }
  };

  // Apply all parsed commands
  const handleApplyAll = async () => {
    if (!parsedResult || parsedResult.needsClarification || applying) return;

    setApplying(true);
    setError(null);
    setUndoStatus(null);
    setUndoError(null);

    try {
      await actions.applyContextualUpdates(parsedResult.commands, parsedResult.summary);
      // Clear input and results on success
      setInput("");
      setParsedResult(null);
      setUndoStatus(t("llm.undoAvailable"));
    } catch (err) {
      console.error("Apply error:", err);
      setError(err instanceof Error ? err.message : t("llm.applyFailed"));
    } finally {
      setApplying(false);
    }
  };

  // Apply a single command
  const handleApplySingle = async (command: ContextualUpdateCommand) => {
    if (parsedResult?.needsClarification || applying) return;

    setApplying(true);
    setError(null);
    setUndoStatus(null);
    setUndoError(null);

    try {
      await actions.applyContextualUpdates([command], parsedResult?.summary);
      // Remove this command from the list
      if (parsedResult) {
        const remaining = parsedResult.commands.filter((c) => c !== command);
        if (remaining.length === 0) {
          setInput("");
          setParsedResult(null);
        } else {
          setParsedResult({ ...parsedResult, commands: remaining });
        }
      }
      setUndoStatus(t("llm.undoAvailable"));
    } catch (err) {
      console.error("Apply error:", err);
      setError(err instanceof Error ? err.message : t("llm.applySingleFailed"));
    } finally {
      setApplying(false);
    }
  };

  // Cancel and clear results
  const handleCancel = () => {
    setParsedResult(null);
    setError(null);
    setClarification("");
  };

  const handleUndo = async () => {
    if (!lastContextualUpdate) return;
    setUndoStatus(null);
    setUndoError(null);
    try {
      await actions.undoLastContextualUpdate();
      setUndoStatus(t("llm.undoSuccess"));
    } catch (err) {
      setUndoError(err instanceof Error ? err.message : t("llm.undoFailed"));
    }
  };

  const formatCommandFields = (command: ContextualUpdateCommand) => {
    const fields = Object.keys(command.data ?? {}).filter((key) => key.trim().length > 0);
    return fields.length ? fields.join(", ") : null;
  };

  // Handle Enter key to submit
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleParse();
    }
  };

  const handleClarificationKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleClarify();
    }
  };

  const isDisabled = saving || parsing || applying;

  return (
    <div className="global-llm-input">
      <div className="global-llm-input__field">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("llm.inputPlaceholder")}
          disabled={isDisabled}
          rows={2}
        />
        <button
          type="button"
          onClick={handleParse}
          disabled={isDisabled || !input.trim()}
          className="btn-primary"
        >
          {parsing ? t("llm.parsing") : t("llm.parse")}
        </button>
        <button
          type="button"
          className="btn-outline"
          onClick={() => (speech.listening ? speech.stop() : speech.start())}
          disabled={isDisabled || !speech.supported}
          title={speech.supported ? t("assistant.voiceSupported") : t("assistant.voiceUnsupported")}
        >
          {speech.listening ? t("assistant.stopMic") : t("assistant.startMic")}
        </button>
      </div>

      {speech.listening && speech.interimText && (
        <div className="global-llm-input__clarification">
          <p>{t("assistant.listening", { values: { text: speech.interimText } })}</p>
        </div>
      )}

      {speech.error && (
        <div className="global-llm-input__error">
          {speech.error}
        </div>
      )}

      {error && (
        <div className="global-llm-input__error">
          {error}
        </div>
      )}

      {lastContextualUpdate && (
        <div className="global-llm-input__undo">
          <div>
            <p className="text-label">{t("llm.lastApplied")}</p>
            <p className="text-muted">{lastContextualUpdate.summary ?? t("llm.undoAvailable")}</p>
          </div>
          <button type="button" className="btn-ghost" onClick={() => void handleUndo()} disabled={isDisabled}>
            {t("llm.undo")}
          </button>
        </div>
      )}

      {undoStatus && <div className="global-llm-input__status">{undoStatus}</div>}
      {undoError && <div className="global-llm-input__error">{undoError}</div>}

      {parsedResult && (
          <div className="global-llm-input__preview">
            <div className="global-llm-input__preview-header">
            <h4>{t("llm.proposedChanges")}</h4>
            <p className="text-label">{parsedResult.summary}</p>
          </div>

          {parsedResult.needsClarification ? (
            <>
              {parsedResult.clarificationPrompt && (
                <div className="global-llm-input__clarification">
                  <p>{parsedResult.clarificationPrompt}</p>
                </div>
              )}

              <div className="global-llm-input__field">
                <textarea
                  value={clarification}
                  onChange={(e) => setClarification(e.target.value)}
                  onKeyDown={handleClarificationKeyDown}
                  placeholder={t("llm.clarificationPlaceholder")}
                  disabled={isDisabled}
                  rows={2}
                />
                <button
                  type="button"
                  onClick={handleClarify}
                  disabled={isDisabled || !clarification.trim()}
                  className="btn-primary"
                >
                  {parsing ? t("llm.reparsing") : t("llm.reparse")}
                </button>
              </div>

              <div className="global-llm-input__preview-actions">
                <button type="button" onClick={handleCancel} disabled={applying || parsing} className="btn-outline">
                  {t("common.cancel")}
                </button>
              </div>
            </>
          ) : (
            <>
              <ul className="global-llm-input__commands">
                {parsedResult.commands.map((command, index) => {
                  const fields = formatCommandFields(command);
                  return (
                    <li key={index} className="global-llm-input__command">
                      <div className="global-llm-input__command-info">
                        <span className="command-badge">{command.intent}</span>
                        <span className="command-target">{command.target}</span>
                        <span className="command-explanation">{command.explanation}</span>
                        {fields && (
                          <span className="command-fields">
                            {t("llm.affectedFields", { values: { fields } })}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleApplySingle(command)}
                        disabled={applying}
                        className="btn-small"
                      >
                        {t("llm.apply")}
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="global-llm-input__preview-actions">
                <button
                  type="button"
                  onClick={handleApplyAll}
                  disabled={applying || parsedResult.commands.length === 0}
                  className="btn-primary"
                >
                  {applying ? t("llm.applying") : t("llm.applyAll")}
                </button>
                <button type="button" onClick={handleCancel} disabled={applying} className="btn-outline">
                  {t("common.cancel")}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
