import { useFocusMode } from "@/contexts/FocusModeContext";
import type { WorkspaceContext } from "@/types/workspace";
import { useI18n } from "@/i18n/I18nContext";

interface HotkeyHint {
  keys: string;
  action: string;
}

interface HotkeysBarProps {
  context?: WorkspaceContext;
}

const getContextHints = (
  t: (key: string) => string,
  context: WorkspaceContext = "default"
): HotkeyHint[] => {
  const commonHints: HotkeyHint[] = [
    { keys: "^G", action: t("hotkeys.global") },
    { keys: "^S", action: t("hotkeys.save") },
    { keys: "^1-5", action: t("hotkeys.views") },
    { keys: "^F", action: t("hotkeys.focus") }
  ];

  switch (context) {
    case "table":
    case "tui":
      return [
        { keys: "↑↓←→", action: t("hotkeys.navigate") },
        { keys: "Enter", action: t("hotkeys.edit") },
        { keys: "Esc", action: t("hotkeys.cancel") },
        ...commonHints
      ];
    case "form":
      return [
        { keys: "Tab", action: t("hotkeys.next") },
        { keys: "S-Tab", action: t("hotkeys.prev") },
        { keys: "Esc", action: t("hotkeys.cancel") },
        ...commonHints
      ];
    case "prompt":
      return [
        { keys: "Enter", action: t("hotkeys.parse") },
        { keys: "Esc", action: t("hotkeys.blur") },
        ...commonHints.filter((h) => h.keys !== "^G")
      ];
    default:
      return [
        { keys: "Tab", action: t("hotkeys.next") },
        { keys: "Esc", action: t("hotkeys.cancel") },
        ...commonHints
      ];
  }
};

export const HotkeysBar = ({ context = "default" }: HotkeysBarProps) => {
  const { focusMode } = useFocusMode();
  const { t } = useI18n();

  // Only render in focus mode
  if (focusMode !== "focus") {
    return null;
  }

  const hints = getContextHints(t, context);

  return (
    <footer className="hotkeys-bar">
      {hints.map((hint) => (
        <span key={hint.keys} className="hotkey-hint">
          <kbd>{hint.keys}</kbd>
          <span>{hint.action}</span>
        </span>
      ))}
    </footer>
  );
};
