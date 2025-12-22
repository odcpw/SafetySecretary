import { useState } from "react";
import type { Phase } from "@/types/riskAssessment";
import { useRaContext } from "@/contexts/RaContext";
import type { ContextualUpdateCommand, ParsedContextualUpdate } from "@/contexts/RaContext";
import { useI18n } from "@/i18n/I18nContext";
import { TuiBanner } from "@/tui/components/TuiBanner";
import { TuiFormField } from "@/tui/components/TuiFormField";
import { TuiPanel } from "@/tui/components/TuiPanel";

type LlmStatusState = { state: "parsing" | "applying"; message: string };

interface TuiGlobalLLMInputProps {
  currentPhase: Phase;
  onStatusChange?: (status: LlmStatusState | null) => void;
}

export const TuiGlobalLLMInput = ({ currentPhase, onStatusChange }: TuiGlobalLLMInputProps) => {
  const { saving, actions, lastContextualUpdate } = useRaContext();
  const { t } = useI18n();
  const [input, setInput] = useState("");
  const [clarification, setClarification] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsedResult, setParsedResult] = useState<ParsedContextualUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [undoStatus, setUndoStatus] = useState<string | null>(null);
  const [undoError, setUndoError] = useState<string | null>(null);

  const setStatus = (state: LlmStatusState | null) => {
    onStatusChange?.(state);
  };

  const handleParse = async () => {
    if (!input.trim() || parsing) {
      return;
    }
    setError(null);
    setUndoStatus(null);
    setUndoError(null);
    setParsing(true);
    setParsedResult(null);
    setClarification("");
    setStatus({ state: "parsing", message: t("llm.parsing") });

    try {
      const result = await actions.parseContextualUpdate(input.trim(), currentPhase);
      setParsedResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("llm.parseFailed"));
    } finally {
      setParsing(false);
      setStatus(null);
    }
  };

  const handleClarify = async () => {
    if (!parsedResult?.needsClarification || parsing) {
      return;
    }
    if (!input.trim() || !clarification.trim()) {
      return;
    }

    setError(null);
    setUndoStatus(null);
    setUndoError(null);
    setParsing(true);
    setStatus({ state: "parsing", message: t("llm.reparsing") });

    try {
      const combined = `${input.trim()}\n\n${t("llm.clarificationPrefix")}: ${clarification.trim()}`;
      const result = await actions.parseContextualUpdate(combined, currentPhase);
      setParsedResult(result);
      if (!result.needsClarification) {
        setClarification("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("llm.reparseFailed"));
    } finally {
      setParsing(false);
      setStatus(null);
    }
  };

  const handleApplyAll = async () => {
    if (!parsedResult || parsedResult.needsClarification || applying) {
      return;
    }

    setApplying(true);
    setError(null);
    setUndoStatus(null);
    setUndoError(null);
    setStatus({ state: "applying", message: t("llm.applying") });

    try {
      await actions.applyContextualUpdates(parsedResult.commands, parsedResult.summary);
      setInput("");
      setParsedResult(null);
      setUndoStatus(t("llm.undoAvailable"));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("llm.applyFailed"));
    } finally {
      setApplying(false);
      setStatus(null);
    }
  };

  const handleApplySingle = async (command: ContextualUpdateCommand) => {
    if (parsedResult?.needsClarification || applying) {
      return;
    }
    setApplying(true);
    setError(null);
    setUndoStatus(null);
    setUndoError(null);
    setStatus({ state: "applying", message: t("llm.applying") });

    try {
      await actions.applyContextualUpdates([command], parsedResult?.summary);
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
      setError(err instanceof Error ? err.message : t("llm.applySingleFailed"));
    } finally {
      setApplying(false);
      setStatus(null);
    }
  };

  const handleCancel = () => {
    setParsedResult(null);
    setError(null);
    setClarification("");
  };

  const handleUndo = async () => {
    if (!lastContextualUpdate) {
      return;
    }
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

  const isDisabled = saving || parsing || applying;

  return (
    <TuiPanel
      eyebrow={t("llm.proposedChanges")}
      title={t("llm.proposedChanges")}
      subtitle={t("llm.inputPlaceholder")}
    >
      <TuiFormField label={t("llm.inputPlaceholder")}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={t("llm.inputPlaceholder")}
          rows={3}
          disabled={isDisabled}
        />
      </TuiFormField>
      <div className="tui-llm-actions">
        <button type="button" onClick={() => void handleParse()} disabled={isDisabled || !input.trim()}>
          {parsing ? t("llm.parsing") : t("llm.parse")}
        </button>
        <button type="button" onClick={handleCancel} disabled={isDisabled}>
          {t("common.cancel")}
        </button>
      </div>

      {error && (
        <TuiBanner variant="error">
          {error}
        </TuiBanner>
      )}

      {lastContextualUpdate && (
        <div className="tui-llm-undo">
          <div>
            <p className="tui-muted">{t("llm.lastApplied")}</p>
            <p className="tui-muted">{lastContextualUpdate.summary ?? t("llm.undoAvailable")}</p>
          </div>
          <button type="button" onClick={() => void handleUndo()} disabled={isDisabled}>
            {t("llm.undo")}
          </button>
        </div>
      )}

      {undoStatus && <p className="tui-muted">{undoStatus}</p>}
      {undoError && (
        <TuiBanner variant="error">
          {undoError}
        </TuiBanner>
      )}

      {parsedResult && (
        <div className="tui-llm-preview">
          {parsedResult.summary && <p className="tui-muted">{parsedResult.summary}</p>}
          {parsedResult.needsClarification ? (
            <>
              {parsedResult.clarificationPrompt && (
                <TuiBanner variant="warning">
                  {parsedResult.clarificationPrompt}
                </TuiBanner>
              )}
              <TuiFormField label={t("llm.clarificationPlaceholder")}>
                <textarea
                  value={clarification}
                  onChange={(event) => setClarification(event.target.value)}
                  placeholder={t("llm.clarificationPlaceholder")}
                  rows={2}
                  disabled={isDisabled}
                />
              </TuiFormField>
              <div className="tui-llm-actions">
                <button type="button" onClick={() => void handleClarify()} disabled={isDisabled || !clarification.trim()}>
                  {parsing ? t("llm.reparsing") : t("llm.reparse")}
                </button>
                <button type="button" onClick={handleCancel} disabled={isDisabled}>
                  {t("common.cancel")}
                </button>
              </div>
            </>
          ) : (
            <>
              <ul className="tui-llm-commands">
                {parsedResult.commands.map((command, index) => {
                  const fields = formatCommandFields(command);
                  return (
                    <li key={`${command.intent}-${index}`} className="tui-llm-command">
                      <div className="tui-llm-command__meta">
                        <span className="tui-llm-command__tag">{command.intent}</span>
                        <span className="tui-llm-command__target">{command.target}</span>
                        <span className="tui-llm-command__explanation">{command.explanation}</span>
                        {fields && (
                          <span className="tui-llm-command__fields">
                            {t("llm.affectedFields", { values: { fields } })}
                          </span>
                        )}
                      </div>
                      <button type="button" onClick={() => void handleApplySingle(command)} disabled={applying}>
                        {t("llm.apply")}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="tui-llm-actions">
                <button
                  type="button"
                  onClick={() => void handleApplyAll()}
                  disabled={applying || parsedResult.commands.length === 0}
                >
                  {applying ? t("llm.applying") : t("llm.applyAll")}
                </button>
                <button type="button" onClick={handleCancel} disabled={applying}>
                  {t("common.cancel")}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </TuiPanel>
  );
};
