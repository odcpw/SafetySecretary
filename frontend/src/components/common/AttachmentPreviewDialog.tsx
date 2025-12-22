import { useId } from "react";
import { useI18n } from "@/i18n/I18nContext";

interface AttachmentPreviewDialogProps {
  open: boolean;
  title: string;
  src: string;
  onClose: () => void;
}

export const AttachmentPreviewDialog = ({ open, title, src, onClose }: AttachmentPreviewDialogProps) => {
  const { t } = useI18n();
  const titleId = useId();

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal-card attachment-preview"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header attachment-preview__header">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="btn-ghost btn-small" onClick={onClose}>
            {t("common.cancel")}
          </button>
        </header>
        <div className="attachment-preview__body">
          <img src={src} alt={title} />
        </div>
      </div>
    </div>
  );
};
