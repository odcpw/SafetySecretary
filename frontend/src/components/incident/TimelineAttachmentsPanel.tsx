import { useMemo, useState } from "react";
import type { IncidentTimelineEvent } from "@/types/incident";
import type { IncidentAttachment } from "@/types/incident";
import { useIncidentAttachments } from "@/hooks/useIncidentAttachments";
import { useI18n } from "@/i18n/I18nContext";

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
    }
  };

  const handleDelete = async (attachmentId: string) => {
    if (!confirm(t("incident.attachments.confirmDelete"))) return;
    setStatus(t("incident.attachments.status.deleting"));
    try {
      await deleteAttachment(attachmentId);
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
              className="rounded border border-slate-200 p-3"
              onDragOver={(dragEvent) => {
                dragEvent.preventDefault();
                dragEvent.dataTransfer.dropEffect = "move";
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
                <label className="text-sm px-3 py-1 rounded bg-slate-900 text-white cursor-pointer">
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
                <div className="flex flex-wrap gap-3">
                  {items.map((item) => {
                    const isImage = item.mimeType?.startsWith("image/");
                    return (
                      <div
                        key={item.id}
                        className="w-32"
                        draggable
                        onDragStart={(dragEvent) => {
                          dragEvent.dataTransfer.setData(
                            DRAG_MIME,
                            JSON.stringify({ attachmentId: item.id, fromEventId: event.id } satisfies DragPayload)
                          );
                          dragEvent.dataTransfer.effectAllowed = "move";
                        }}
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
                        <div className="relative rounded border border-slate-200 overflow-hidden bg-slate-50">
                          {isImage ? (
                            <img src={item.url} alt={item.originalName} className="h-20 w-full object-cover" />
                          ) : (
                            <div className="h-20 w-full flex items-center justify-center text-slate-500 text-sm">
                              {t("common.file")}
                            </div>
                          )}
                          <button
                            type="button"
                            className="absolute top-1 right-1 bg-white/90 hover:bg-white text-slate-700 rounded px-1.5 py-0.5 text-xs"
                            onClick={() => void handleDelete(item.id)}
                            aria-label={t("common.delete")}
                          >
                            ✕
                          </button>
                        </div>
                        <div className="text-xs text-slate-500 mt-1 truncate" title={item.originalName}>
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
    </section>
  );
};
