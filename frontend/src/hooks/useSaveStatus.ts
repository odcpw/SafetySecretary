import { useEffect, useRef, useState } from "react";

export type SaveStatusTone = "info" | "success" | "error";

export type SaveStatusAction = {
  label: string;
  onClick: () => void;
};

export type SaveStatusState = {
  message: string;
  tone?: SaveStatusTone;
  action?: SaveStatusAction;
};

export const useSaveStatus = () => {
  const [status, setStatus] = useState<SaveStatusState | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const clear = () => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setStatus(null);
  };

  const show = (next: SaveStatusState, durationMs?: number) => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setStatus(next);
    if (durationMs && durationMs > 0) {
      timeoutRef.current = window.setTimeout(() => {
        setStatus(null);
        timeoutRef.current = null;
      }, durationMs);
    }
  };

  const showInfo = (message: string, durationMs = 1500) => {
    show({ message, tone: "info" }, durationMs);
  };

  const showSuccess = (message: string, durationMs = 1500) => {
    show({ message, tone: "success" }, durationMs);
  };

  const showError = (message: string, retry?: () => void, durationMs?: number, actionLabel = "Retry") => {
    show(
      { message, tone: "error", action: retry ? { label: actionLabel, onClick: retry } : undefined },
      durationMs
    );
  };

  return {
    status,
    show,
    showInfo,
    showSuccess,
    showError,
    clear
  };
};
