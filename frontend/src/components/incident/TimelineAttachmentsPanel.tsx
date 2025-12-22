import { useMemo, useState } from "react";
import type { IncidentTimelineEvent } from "@/types/incident";
import type { IncidentAttachment } from "@/types/incident";
import { useIncidentAttachments } from "@/hooks/useIncidentAttachments";
import { useI18n } from "@/i18n/I18nContext";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";
import { AttachmentPreviewDialog } from "@/components/common/AttachmentPreviewDialog";

type DragPayload = { attachmentId: string; fromEventId: string | null };

const DRAG_MIME = "application/x-safetysecretary-incident-attachment";

const parseDragPayload = (event: React.DragEvent): DragPayload | null => {
  const raw = event.dataTransfer.getData(DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<DragPayload>;
    if (typeof parsed.attachmentId !== "string") return null;
    const fromEventId = typeof parsed.fromEventId === "string" ? parsed.fromEventId : null;
    return { attachmentId: parsed.attachmentId, fromEventId };
  } catch {
    return null;
  }
};

export const TimelineAttachmentsPanel = ({ caseId, timeline }: { caseId: string; timeline: IncidentTimelineEvent[] }) => {
  const { t } = useI18n();
  const { attachments, loading, error, uploadToTimeline, moveToTimeline, reorderTimelineAttachments, deleteAttachment } =
    useIncidentAttachments(caseId);
  const [status, setStatus] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<IncidentAttachment | null>(null);
  const [activeDropEventId, setActiveDropEventId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const { confirm, dialog } = useConfirmDialog();

  const timelineAttachments = useMemo(() => {
    const grouped = new Map<string, IncidentAttachment[]>();
    for (const event of timeline) {
      grouped.set(event.id, []);
    }
    for (const attachment of attachments) {
      if (!attachment.timelineEventId) continue;
      const list = grouped.get(attachment.timelineEventId);
      if (!list) continue;
      list.push(attachment);
    }
    for (const [eventId, list] of grouped) {
      list.sort((a, b) => a.orderIndex - b.orderIndex);
      grouped.set(eventId, list);
    }
    return grouped;
  }, [attachments, timeline]);

  const handleUpload = async (eventId: string, file: File | null) => {
    if (!file) return;
    setStatus(t("incident.attachments.status.uploading"));
    try {
      await uploadToTimeline(eventId, file);
      setStatus(null);
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : t("incident.attachments.status.uploadFailed"));
      setTimeout(() => setStatus(null), 4000);
    }
  };

  const handleDropOnEvent = async (targetEventId: string, payload: DragPayload) => {
    if (payload.fromEventId === targetEventId) {
      return;
    }
    setStatus(t("incident.attachments.status.moving"));
    try {
      await moveToTimeline(payload.attachmentId, targetEventId);
      setStatus(null);
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : t("incident.attachments.status.moveFailed"));
      setTimeout(() => setStatus(null), 4000);
    } finally {
      setActiveDropEventId(null);
    }
  };

  const handleDropBefore = async (targetEventId: string, beforeId: string, payload: DragPayload) => {
    const current = timelineAttachments.get(targetEventId) ?? [];
    const order = current.map((a) => a.id).filter((id) => id !== payload.attachmentId);
    const insertIndex = order.indexOf(beforeId);
    const nextOrder =
      insertIndex >= 0
        ? [...order.slice(0, insertIndex), payload.attachmentId, ...order.slice(insertIndex)]
        : [...order, payload.attachmentId];

    setStatus(t("incident.attachments.status.reordering"));
    try {
      if (payload.fromEventId !== targetEventId) {
        await moveToTimeline(payload.attachmentId, targetEventId);
      }
      await reorderTimelineAttachments(targetEventId, nextOrder);
      setStatus(null);
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : t("incident.attachments.status.reorderFailed"));
      setTimeout(() => setStatus(null), 4000);
    } finally {
      setActiveDropEventId(null);
    }
  };

  const handleDelete = async (attachment: IncidentAttachment) => {
    const ok = await confirm({
      title: t("common.delete"),
      description: t("incident.attachments.confirmDelete", { values: { name: attachment.originalName } }),
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
      tone: "danger"
    });
    if (!ok) return;
    setStatus(t("incident.attachments.status.deleting"));
    try {
      await deleteAttachment(attachment.id);
      setStatus(null);
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : t("incident.attachments.status.deleteFailed"));
      setTimeout(() => setStatus(null), 4000);
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 p-4 space-y-3">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{t("incident.attachments.title")}</h3>
          <p className="text-sm text-slate-500">{t("incident.attachments.subtitle")}</p>
        </div>
        {loading && <span className="text-sm text-slate-500">{t("common.loading")}</span>}
      </header>

      {error && (
        <div className="bg-amber-50 text-amber-900 px-3 py-2 rounded text-sm">
          {t("incident.attachments.errorLabel", { values: { error } })}
        </div>
      )}
      {status && <div className="bg-slate-50 text-slate-700 px-3 py-2 rounded text-sm">{status}</div>}

      <div className="space-y-4">
        {timeline.map((event, index) => {
          const items = timelineAttachments.get(event.id) ?? [];
          return (
            <div
              key={event.id}
              className={`attachment-zone${activeDropEventId === event.id ? " attachment-zone--active" : ""}`}
              onDragEnter={() => setActiveDropEventId(event.id)}
              onDragLeave={(dragEvent) => {
                if (dragEvent.currentTarget.contains(dragEvent.relatedTarget as Node | null)) {
                  return;
                }
                setActiveDropEventId((prev) => (prev === event.id ? null : prev));
              }}
              onDragOver={(dragEvent) => {
                dragEvent.preventDefault();
                dragEvent.dataTransfer.dropEffect = "move";
                setActiveDropEventId(event.id);
              }}
              onDrop={(dragEvent) => {
                dragEvent.preventDefault();
                const payload = parseDragPayload(dragEvent);
                if (!payload) return;
                void handleDropOnEvent(event.id, payload);
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="text-sm font-medium text-slate-900">
                  {t("incident.attachments.eventHeading", { values: { index: index + 1, text: event.text } })}
                </div>
                <label className="btn-outline btn-small">
                  {t("common.upload")}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(eventInput) => void handleUpload(event.id, eventInput.target.files?.[0] ?? null)}
                  />
                </label>
              </div>

              {items.length === 0 ? (
                <div className="text-sm text-slate-500">{t("incident.attachments.empty")}</div>
              ) : (
                <div className="attachment-grid">
                  {items.map((item) => {
                    const isImage = item.mimeType?.startsWith("image/");
                    return (
                      <div
                        key={item.id}
                        className={`attachment-card${draggingId === item.id ? " attachment-card--dragging" : ""}`}
                        draggable
                        onDragStart={(dragEvent) => {
                          setDraggingId(item.id);
                          dragEvent.dataTransfer.setData(
                            DRAG_MIME,
                            JSON.stringify({ attachmentId: item.id, fromEventId: event.id } satisfies DragPayload)
                          );
                          dragEvent.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setDraggingId(null)}
                        onDragOver={(dragEvent) => {
                          dragEvent.preventDefault();
                          dragEvent.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={(dragEvent) => {
                          dragEvent.preventDefault();
                          const payload = parseDragPayload(dragEvent);
                          if (!payload) return;
                          if (payload.attachmentId === item.id && payload.fromEventId === event.id) return;
                          void handleDropBefore(event.id, item.id, payload);
                        }}
                      >
                        <div className="attachment-card__preview">
                          {isImage ? (
                            <button type="button" onClick={() => setPreviewAttachment(item)}>
                              <img src={item.url} alt={item.originalName} />
                            </button>
                          ) : (
                            <div className="attachment-card__file">{t("common.file")}</div>
                          )}
                          <button
                            type="button"
                            className="attachment-card__delete btn-icon"
                            onClick={() => void handleDelete(item)}
                            aria-label={t("common.delete")}
                          >
                            ✕
                          </button>
                        </div>
                        <div className="attachment-card__name" title={item.originalName}>
                          {item.originalName}
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
      {dialog}
    </section>
  );
};
