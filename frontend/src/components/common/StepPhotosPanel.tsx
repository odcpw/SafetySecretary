import { useMemo, useState } from "react";
import type { ProcessStep } from "@/types/riskAssessment";
import type { CaseAttachment } from "@/types/attachments";
import { useCaseAttachments } from "@/hooks/useCaseAttachments";
import { useI18n } from "@/i18n/I18nContext";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { AttachmentPreviewDialog } from "@/components/common/AttachmentPreviewDialog";

type DragPayload = { attachmentId: string; fromStepId: string | null };

const DRAG_MIME = "application/x-safetysecretary-attachment";

const parseDragPayload = (event: React.DragEvent): DragPayload | null => {
  const raw = event.dataTransfer.getData(DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DragPayload>;
    if (typeof parsed.attachmentId !== "string") return null;
    const fromStepId = typeof parsed.fromStepId === "string" ? parsed.fromStepId : null;
    return { attachmentId: parsed.attachmentId, fromStepId };
  } catch {
    return null;
  }
};

export const StepPhotosPanel = ({ caseId, steps }: { caseId: string; steps: ProcessStep[] }) => {
  const { attachments, loading, error, uploadToStep, moveToStep, reorderStepAttachments, deleteAttachment } =
    useCaseAttachments(caseId);
  const [status, setStatus] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CaseAttachment | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<CaseAttachment | null>(null);
  const [activeDropStepId, setActiveDropStepId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const { t } = useI18n();

  const stepAttachments = useMemo(() => {
    const grouped = new Map<string, CaseAttachment[]>();
    for (const step of steps) {
      grouped.set(step.id, []);
    }
    for (const attachment of attachments) {
      if (!attachment.stepId) continue;
      if (attachment.hazardId) continue;
      const list = grouped.get(attachment.stepId);
      if (!list) continue;
      list.push(attachment);
    }
    for (const [stepId, list] of grouped) {
      list.sort((a, b) => a.orderIndex - b.orderIndex);
      grouped.set(stepId, list);
    }
    return grouped;
  }, [attachments, steps]);

  const handleUpload = async (stepId: string, file: File | null) => {
    if (!file) return;
    setStatus(t("photos.uploading"));
    try {
      await uploadToStep(stepId, file);
      setStatus(null);
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : t("photos.uploadFailed"));
      setTimeout(() => setStatus(null), 4000);
    }
  };

  const handleDropOnStep = async (targetStepId: string, payload: DragPayload) => {
    if (payload.fromStepId === targetStepId) {
      return;
    }
    setStatus(t("photos.moving"));
    try {
      await moveToStep(payload.attachmentId, targetStepId);
      setStatus(null);
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : t("photos.moveFailed"));
      setTimeout(() => setStatus(null), 4000);
    } finally {
      setActiveDropStepId(null);
    }
  };

  const handleDropBefore = async (targetStepId: string, beforeId: string, payload: DragPayload) => {
    const current = stepAttachments.get(targetStepId) ?? [];
    const order = current.map((a) => a.id).filter((id) => id !== payload.attachmentId);
    const insertIndex = order.indexOf(beforeId);
    const nextOrder =
      insertIndex >= 0
        ? [...order.slice(0, insertIndex), payload.attachmentId, ...order.slice(insertIndex)]
        : [...order, payload.attachmentId];

    setStatus(t("photos.reordering"));
    try {
      if (payload.fromStepId !== targetStepId) {
        await moveToStep(payload.attachmentId, targetStepId);
      }
      await reorderStepAttachments(targetStepId, nextOrder);
      setStatus(null);
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : t("photos.reorderFailed"));
      setTimeout(() => setStatus(null), 4000);
    } finally {
      setActiveDropStepId(null);
    }
  };

  const handleDelete = (attachment: CaseAttachment) => {
    setPendingDelete(attachment);
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    setStatus(t("photos.deleting"));
    try {
      await deleteAttachment(pendingDelete.id);
      setStatus(null);
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : t("photos.deleteFailed"));
      setTimeout(() => setStatus(null), 4000);
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 p-4 space-y-3">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{t("photos.title")}</h3>
          <p className="text-sm text-slate-500">{t("photos.subtitle")}</p>
        </div>
        {loading && <span className="text-sm text-slate-500">{t("common.loading")}</span>}
      </header>

      {error && <div className="bg-amber-50 text-amber-900 px-3 py-2 rounded text-sm">{t("photos.errorLabel")}: {error}</div>}
      {status && <div className="bg-slate-50 text-slate-700 px-3 py-2 rounded text-sm">{status}</div>}

      <div className="space-y-4">
        {steps.map((step, index) => {
          const photos = stepAttachments.get(step.id) ?? [];
          return (
            <div
              key={step.id}
              className={`attachment-zone${activeDropStepId === step.id ? " attachment-zone--active" : ""}`}
              onDragEnter={() => setActiveDropStepId(step.id)}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  return;
                }
                setActiveDropStepId((prev) => (prev === step.id ? null : prev));
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setActiveDropStepId(step.id);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const payload = parseDragPayload(event);
                if (!payload) return;
                void handleDropOnStep(step.id, payload);
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="text-sm font-medium text-slate-900">
                  {t("photos.stepLabel", { values: { index: index + 1 } })}:{" "}
                  <span className="font-normal text-slate-700">{step.activity}</span>
                </div>
                <label className="btn-outline btn-small">
                  {t("common.upload")}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => void handleUpload(step.id, event.target.files?.[0] ?? null)}
                  />
                </label>
              </div>

              {photos.length === 0 ? (
                <div className="text-sm text-slate-500">{t("photos.empty")}</div>
              ) : (
                <div className="attachment-grid">
                  {photos.map((photo) => {
                    const isImage = photo.mimeType?.startsWith("image/");
                    return (
                      <div
                        key={photo.id}
                        className={`attachment-card${draggingId === photo.id ? " attachment-card--dragging" : ""}`}
                        draggable
                        onDragStart={(event) => {
                          setDraggingId(photo.id);
                          event.dataTransfer.setData(
                            DRAG_MIME,
                            JSON.stringify({ attachmentId: photo.id, fromStepId: step.id } satisfies DragPayload)
                          );
                          event.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setDraggingId(null)}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const payload = parseDragPayload(event);
                          if (!payload) return;
                          if (payload.attachmentId === photo.id && payload.fromStepId === step.id) return;
                          void handleDropBefore(step.id, photo.id, payload);
                        }}
                      >
                        <div className="attachment-card__preview">
                          {isImage ? (
                            <button type="button" onClick={() => setPreviewAttachment(photo)}>
                              <img src={photo.url} alt={photo.originalName} />
                            </button>
                          ) : (
                            <div className="attachment-card__file">{t("photos.fileLabel")}</div>
                          )}
                          <button
                            type="button"
                            className="attachment-card__delete btn-icon"
                            onClick={() => handleDelete(photo)}
                            aria-label={t("common.delete")}
                          >
                            ✕
                          </button>
                        </div>
                        <div className="attachment-card__name" title={photo.originalName}>
                          {photo.originalName}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <AttachmentPreviewDialog
        open={Boolean(previewAttachment)}
        title={previewAttachment?.originalName ?? ""}
        src={previewAttachment?.url ?? ""}
        onClose={() => setPreviewAttachment(null)}
      />
      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={t("common.delete")}
        description={
          pendingDelete
            ? t("photos.confirmDelete", { values: { name: pendingDelete.originalName } })
            : undefined
        }
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        tone="danger"
        onConfirm={() => void handleConfirmDelete()}
        onClose={() => setPendingDelete(null)}
      />
    </section>
  );
};
