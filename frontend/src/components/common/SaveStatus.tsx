import type { SaveStatusState } from "@/hooks/useSaveStatus";

interface SaveStatusProps {
  status?: SaveStatusState | null;
}

export const SaveStatus = ({ status }: SaveStatusProps) => {
  if (!status) return null;

  const tone = status.tone ?? "info";
  const className = ["save-status", `save-status--${tone}`].join(" ");

  return (
    <div className={className} role={tone === "error" ? "alert" : "status"}>
      <span>{status.message}</span>
      {status.action && (
        <button type="button" className="save-status__action" onClick={status.action.onClick}>
          {status.action.label}
        </button>
      )}
    </div>
  );
};
