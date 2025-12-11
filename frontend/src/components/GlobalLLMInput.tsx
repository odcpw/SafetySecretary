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
import { useState } from "react";
import { useRaContext } from "@/contexts/RaContext";
import type { ContextualUpdateCommand, ParsedContextualUpdate } from "@/contexts/RaContext";
import type { Phase } from "@/types/riskAssessment";

interface GlobalLLMInputProps {
  currentPhase: Phase;
}

export const GlobalLLMInput = ({ currentPhase }: GlobalLLMInputProps) => {
  const { saving, actions } = useRaContext();
  const [input, setInput] = useState("");
  const [parsing, setParsing] = useState(false);
  const [parsedResult, setParsedResult] = useState<ParsedContextualUpdate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  // Parse the user's natural language input
  const handleParse = async () => {
    if (!input.trim() || parsing) return;

    setError(null);
    setParsing(true);
    setParsedResult(null);

    try {
      const result = await actions.parseContextualUpdate(input.trim(), currentPhase);
      setParsedResult(result);
    } catch (err) {
      console.error("Parse error:", err);
      setError(err instanceof Error ? err.message : "Failed to parse input");
    } finally {
      setParsing(false);
    }
  };

  // Apply all parsed commands
  const handleApplyAll = async () => {
    if (!parsedResult || applying) return;

    setApplying(true);
    setError(null);

    try {
      for (const command of parsedResult.commands) {
        await actions.applyContextualUpdate(command);
      }
      // Clear input and results on success
      setInput("");
      setParsedResult(null);
    } catch (err) {
      console.error("Apply error:", err);
      setError(err instanceof Error ? err.message : "Failed to apply changes");
    } finally {
      setApplying(false);
    }
  };

  // Apply a single command
  const handleApplySingle = async (command: ContextualUpdateCommand) => {
    if (applying) return;

    setApplying(true);
    setError(null);

    try {
      await actions.applyContextualUpdate(command);
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
    } catch (err) {
      console.error("Apply error:", err);
      setError(err instanceof Error ? err.message : "Failed to apply change");
    } finally {
      setApplying(false);
    }
  };

  // Cancel and clear results
  const handleCancel = () => {
    setParsedResult(null);
    setError(null);
  };

  // Handle Enter key to submit
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleParse();
    }
  };

  const isDisabled = saving || parsing || applying;

  return (
    <div className="global-llm-input">
      <div className="global-llm-input__field">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Describe changes in natural language... (e.g., 'add ladder to step 3', 'insert step between 2 and 3')"
          disabled={isDisabled}
          rows={2}
        />
        <button
          type="button"
          onClick={handleParse}
          disabled={isDisabled || !input.trim()}
          className="btn-primary"
        >
          {parsing ? "Parsing…" : "Parse"}
        </button>
      </div>

      {error && (
        <div className="global-llm-input__error">
          {error}
        </div>
      )}

      {parsedResult && (
        <div className="global-llm-input__preview">
          <div className="global-llm-input__preview-header">
            <h4>Proposed Changes</h4>
            <p className="text-label">{parsedResult.summary}</p>
          </div>

          {parsedResult.needsClarification && parsedResult.clarificationPrompt && (
            <div className="global-llm-input__clarification">
              <p>{parsedResult.clarificationPrompt}</p>
            </div>
          )}

          <ul className="global-llm-input__commands">
            {parsedResult.commands.map((command, index) => (
              <li key={index} className="global-llm-input__command">
                <div className="global-llm-input__command-info">
                  <span className="command-badge">{command.intent}</span>
                  <span className="command-target">{command.target}</span>
                  <span className="command-explanation">{command.explanation}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleApplySingle(command)}
                  disabled={applying}
                  className="btn-small"
                >
                  Apply
                </button>
              </li>
            ))}
          </ul>

          <div className="global-llm-input__preview-actions">
            <button
              type="button"
              onClick={handleApplyAll}
              disabled={applying || parsedResult.commands.length === 0}
              className="btn-primary"
            >
              {applying ? "Applying…" : "Apply All"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={applying}
              className="btn-outline"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
