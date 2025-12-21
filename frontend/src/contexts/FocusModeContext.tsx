import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type FocusMode = "normal" | "focus";

interface FocusModeContextValue {
  focusMode: FocusMode;
  setFocusMode: (mode: FocusMode) => void;
  toggleFocusMode: () => void;
}

const FocusModeContext = createContext<FocusModeContextValue | null>(null);

const STORAGE_KEY = "ss_focus_mode";

const getInitialFocusMode = (): FocusMode => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "normal" || stored === "focus") {
      return stored;
    }
  } catch {
    // localStorage not available
  }
  return "normal";
};

const applyFocusMode = (mode: FocusMode) => {
  if (mode === "focus") {
    document.documentElement.setAttribute("data-focus", "focus");
  } else {
    document.documentElement.removeAttribute("data-focus");
  }
};

export const FocusModeProvider = ({ children }: { children: ReactNode }) => {
  const [focusMode, setFocusModeState] = useState<FocusMode>(getInitialFocusMode);

  useEffect(() => {
    applyFocusMode(focusMode);
  }, [focusMode]);

  const setFocusMode = (newMode: FocusMode) => {
    setFocusModeState(newMode);
    try {
      localStorage.setItem(STORAGE_KEY, newMode);
    } catch {
      // localStorage not available
    }
  };

  const toggleFocusMode = () => {
    setFocusMode(focusMode === "normal" ? "focus" : "normal");
  };

  return (
    <FocusModeContext.Provider value={{ focusMode, setFocusMode, toggleFocusMode }}>
      {children}
    </FocusModeContext.Provider>
  );
};

export const useFocusMode = (): FocusModeContextValue => {
  const context = useContext(FocusModeContext);
  if (!context) {
    throw new Error("useFocusMode must be used within a FocusModeProvider");
  }
  return context;
};
