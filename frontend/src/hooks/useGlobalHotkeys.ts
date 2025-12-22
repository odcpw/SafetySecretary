import { useEffect, useCallback, type RefObject } from "react";
import { useFocusMode } from "@/contexts/FocusModeContext";
import type { Phase } from "@/types/riskAssessment";

type WorkspaceView = "phases" | "table" | "matrix" | "actions";

interface UseGlobalHotkeysOptions {
  globalPromptRef?: RefObject<HTMLTextAreaElement | null>;
  onSave?: () => void;
  onChangeView?: (view: WorkspaceView) => void;
  onChangePhase?: (phase: Phase) => void;
  currentPhase?: Phase;
}

const PHASES: Phase[] = [
  "PROCESS_STEPS",
  "HAZARD_IDENTIFICATION",
  "RISK_RATING",
  "CONTROL_DISCUSSION",
  "ACTIONS",
  "COMPLETE"
];

const VIEW_KEYS: Record<string, WorkspaceView> = {
  "1": "phases",
  "2": "table",
  "3": "matrix",
  "4": "actions"
};

export const useGlobalHotkeys = ({
  globalPromptRef,
  onSave,
  onChangeView,
  onChangePhase,
  currentPhase
}: UseGlobalHotkeysOptions = {}) => {
  const { focusMode, toggleFocusMode } = useFocusMode();

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const isCtrlOrMeta = event.ctrlKey || event.metaKey;

      // Ctrl+F toggles focus mode from anywhere
      if (isCtrlOrMeta && event.key === "f") {
        event.preventDefault();
        toggleFocusMode();
        return;
      }

      // All other hotkeys only work in focus mode
      if (focusMode !== "focus") {
        return;
      }

      if (isCtrlOrMeta) {
        switch (event.key.toLowerCase()) {
          case "g":
            // Focus global prompt
            event.preventDefault();
            globalPromptRef?.current?.focus();
            break;

          case "s":
            // Save
            event.preventDefault();
            onSave?.();
            break;

          case "1":
          case "2":
          case "3":
          case "4":
          case "5": {
            // Switch views
            event.preventDefault();
            const view = VIEW_KEYS[event.key];
            if (view) {
              onChangeView?.(view);
            }
            break;
          }

          case "arrowright":
            // Next phase
            if (currentPhase && onChangePhase) {
              event.preventDefault();
              const currentIndex = PHASES.indexOf(currentPhase);
              const nextPhase = PHASES[Math.min(currentIndex + 1, PHASES.length - 1)];
              if (nextPhase) {
                onChangePhase(nextPhase);
              }
            }
            break;

          case "arrowleft":
            // Previous phase
            if (currentPhase && onChangePhase) {
              event.preventDefault();
              const currentIndex = PHASES.indexOf(currentPhase);
              const prevPhase = PHASES[Math.max(currentIndex - 1, 0)];
              if (prevPhase) {
                onChangePhase(prevPhase);
              }
            }
            break;
        }
      }

      // Escape blurs active input
      if (event.key === "Escape") {
        const activeElement = document.activeElement as HTMLElement | null;
        if (
          activeElement &&
          (activeElement.tagName === "INPUT" ||
            activeElement.tagName === "TEXTAREA" ||
            activeElement.tagName === "SELECT")
        ) {
          activeElement.blur();
        }
      }
    },
    [focusMode, toggleFocusMode, globalPromptRef, onSave, onChangeView, onChangePhase, currentPhase]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
};
