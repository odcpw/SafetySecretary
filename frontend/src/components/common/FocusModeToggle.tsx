import { useFocusMode } from "@/contexts/FocusModeContext";
import { useI18n } from "@/i18n/I18nContext";

interface FocusModeToggleProps {
  className?: string;
}

export const FocusModeToggle = ({ className }: FocusModeToggleProps) => {
  const { focusMode, toggleFocusMode } = useFocusMode();
  const { t } = useI18n();

  return (
    <button
      type="button"
      className={className ?? "btn-outline"}
      onClick={toggleFocusMode}
      title={focusMode === "normal" ? t("focus.enterWithHotkey") : t("focus.exitWithHotkey")}
      aria-label={focusMode === "normal" ? t("focus.enter") : t("focus.exit")}
    >
      {focusMode === "normal" ? (
        // Keyboard icon for entering focus mode
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ display: "inline-block", verticalAlign: "middle" }}
        >
          <rect x="2" y="4" width="20" height="16" rx="2" ry="2" />
          <rect x="5" y="7" fill="currentColor" width="2" height="2" rx="0.5" />
          <rect x="9" y="7" fill="currentColor" width="2" height="2" rx="0.5" />
          <rect x="13" y="7" fill="currentColor" width="2" height="2" rx="0.5" />
          <rect x="17" y="7" fill="currentColor" width="2" height="2" rx="0.5" />
          <rect x="5" y="11" fill="currentColor" width="2" height="2" rx="0.5" />
          <rect x="9" y="11" fill="currentColor" width="2" height="2" rx="0.5" />
          <rect x="13" y="11" fill="currentColor" width="2" height="2" rx="0.5" />
          <rect x="17" y="11" fill="currentColor" width="2" height="2" rx="0.5" />
          <rect x="7" y="15" fill="currentColor" width="10" height="2" rx="0.5" />
        </svg>
      ) : (
        // Grid/expand icon for exiting focus mode
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ display: "inline-block", verticalAlign: "middle" }}
        >
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      )}
    </button>
  );
};
