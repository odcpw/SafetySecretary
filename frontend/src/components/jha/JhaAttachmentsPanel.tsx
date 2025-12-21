import { useMemo, useState } from "react";
import type { JhaHazard, JhaStep, JhaAttachment } from "@/types/jha";
import { useJhaAttachments } from "@/hooks/useJhaAttachments";
import { useI18n } from "@/i18n/I18nContext";

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

const sortByOrder = (items: JhaAttachment[]) => [...items].sort((a, b) => a.orderIndex - b.orderIndex);

export const JhaAttachmentsPanel = ({
  caseId,
  steps,
  hazards
}: {
  caseId: string;
  steps: JhaStep[];
  hazards: JhaHazard[];
}) => {
  const { t } = useI18n();
  const {
    attachments,
    loading,
    error,
    uploadToStep,
    uploadToHazard,
    moveToStep,
    reorderStepAttachments,
    deleteAttachment
  } = useJhaAttachments(caseId);
  const [status, setStatus] = useState<string | null>(null);

  const stepAttachments = useMemo(() => {
    const grouped = new Map<string, JhaAttachment[]>();
    steps.forEach((step) => grouped.set(step.id, []));
    attachments.forEach((attachment) => {
      if (!attachment.stepId || attachment.hazardId) return;
      const list = grouped.get(attachment.stepId);
      if (!list) return;
      list.push(attachment);
    });
    grouped.forEach((list, key) => grouped.set(key, sortByOrder(list)));
    return grouped;
  }, [attachments, steps]);

  const hazardAttachments = useMemo(() => {
    const grouped = new Map<string, JhaAttachment[]>();
    hazards.forEach((hazard) => grouped.set(hazard.id, []));
    attachments.forEach((attachment) => {
      if (!attachment.hazardId) return;
      const list = grouped.get(attachment.hazardId);
      if (!list) return;
      list.push(attachment);
    });
    grouped.forEach((list, key) => grouped.set(key, sortByOrder(list)));
    return grouped;
  }, [attachments, hazards]);

  const stepLabels = useMemo(() => {
    const map = new Map<string, string>();
    steps.forEach((step, index) => {
      map.set(step.id, t("jha.attachments.stepLabel", { values: { index: index + 1, label: step.label } }));
    });
    return map;
  }, [steps, t]);

  const handleUpload = async (target: "step" | "hazard", id: string, file: File | null) => {
    if (!file) return;
    setStatus(t("jha.attachments.status.uploading"));
    try {
      if (target === "step") {
        await uploadToStep(id, file);
      } else {
        await uploadToHazard(id, file);
      }
      setStatus(null);
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : t("jha.attachments.status.uploadFailed"));
      setTimeout(() => setStatus(null), 4000);
    }
  };

  const handleDropOnStep = async (targetStepId: string, payload: DragPayload) => {
    if (payload.fromStepId === targetStepId) return;
    setStatus(t("jha.attachments.status.moving"));
    try {
      await moveToStep(payload.attachmentId, targetStepId);
      setStatus(null);
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : t("jha.attachments.status.moveFailed"));
      setTimeout(() => setStatus(null), 4000);
    }
  };

  const handleDropBefore = async (targetStepId: string, beforeId: string, payload: DragPayload) => {
    const current = stepAttachments.get(targetStepId) ?? [];
    const order = current.map((item) => item.id).filter((id) => id !== payload.attachmentId);
    const insertIndex = order.indexOf(beforeId);
    const nextOrder =
      insertIndex >= 0
        ? [...order.slice(0, insertIndex), payload.attachmentId, ...order.slice(insertIndex)]
        : [...order, payload.attachmentId];

    setStatus(t("jha.attachments.status.reordering"));
    try {
      if (payload.fromStepId !== targetStepId) {
        await moveToStep(payload.attachmentId, targetStepId);
      }
      await reorderStepAttachments(targetStepId, nextOrder);
      setStatus(null);
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : t("jha.attachments.status.reorderFailed"));
      setTimeout(() => setStatus(null), 4000);
    }
  };

  const handleDelete = async (attachmentId: string) => {
    if (!confirm(t("jha.attachments.confirmDelete"))) return;
    setStatus(t("jha.attachments.status.deleting"));
    try {
      await deleteAttachment(attachmentId);
      setStatus(null);
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : t("jha.attachments.status.deleteFailed"));
      setTimeout(() => setStatus(null), 4000);
    }
  };

  return (
    <section className="workspace-phase-panel">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h2>{t("jha.attachments.title")}</h2>
          <p className="text-muted">{t("jha.attachments.subtitle")}</p>
        </div>
        {loading && <span className="text-muted">{t("common.loading")}</span>}
      </header>

      {error && (
        <div className="bg-amber-50 text-amber-900 px-3 py-2 rounded text-sm">
          {t("jha.attachments.errorLabel", { values: { error } })}
        </div>
      )}
      {status && <div className="bg-slate-50 text-slate-700 px-3 py-2 rounded text-sm">{status}</div>}

      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{t("jha.attachments.section.steps")}</h3>
          <div className="space-y-4 mt-3">
            {steps.map((step, index) => {
              const items = stepAttachments.get(step.id) ?? [];
              return (
                <div
                  key={step.id}
                  className="rounded border border-slate-200 p-3"
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
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
                      {t("jha.attachments.stepHeading", { values: { index: index + 1, label: step.label } })}
                    </div>
                    <label className="text-sm px-3 py-1 rounded bg-slate-900 text-white cursor-pointer">
                      {t("common.upload")}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) => void handleUpload("step", step.id, event.target.files?.[0] ?? null)}
                      />
                    </label>
                  </div>

                  {items.length === 0 ? (
                    <div className="text-sm text-slate-500">{t("jha.attachments.emptyStep")}</div>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      {items.map((photo) => {
                        const isImage = photo.mimeType?.startsWith("image/");
                        return (
                          <div
                            key={photo.id}
                            className="w-32"
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.setData(
                                DRAG_MIME,
                                JSON.stringify({ attachmentId: photo.id, fromStepId: step.id } satisfies DragPayload)
                              );
                              event.dataTransfer.effectAllowed = "move";
                            }}
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
                            <div className="relative rounded border border-slate-200 overflow-hidden bg-slate-50">
                              {isImage ? (
                                <img src={photo.url} alt={photo.originalName} className="h-20 w-full object-cover" />
                              ) : (
                                <div className="h-20 w-full flex items-center justify-center text-slate-500 text-sm">
                                  {t("common.file")}
                                </div>
                              )}
                              <button
                                type="button"
                                className="absolute top-1 right-1 bg-white/90 hover:bg-white text-slate-700 rounded px-1.5 py-0.5 text-xs"
                                aria-label={t("common.delete")}
                                onClick={() => void handleDelete(photo.id)}
                              >
                                X
                              </button>
                            </div>
                            <div className="mt-1 text-xs text-slate-600 line-clamp-2" title={photo.originalName}>
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
        </div>

        <div>
          <h3 className="text-lg font-semibold text-slate-900">{t("jha.attachments.section.hazards")}</h3>
          <div className="space-y-4 mt-3">
            {hazards.map((hazard) => {
              const items = hazardAttachments.get(hazard.id) ?? [];
              const label = stepLabels.get(hazard.stepId) ?? t("jha.attachments.stepFallback");
              return (
                <div key={hazard.id} className="rounded border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="text-sm font-medium text-slate-900">
                      {t("jha.attachments.hazardHeading", { values: { step: label, hazard: hazard.hazard } })}
                    </div>
                    <label className="text-sm px-3 py-1 rounded bg-slate-900 text-white cursor-pointer">
                      {t("common.upload")}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) =>
                          void handleUpload("hazard", hazard.id, event.target.files?.[0] ?? null)
                        }
                      />
                    </label>
                  </div>

                  {items.length === 0 ? (
                    <div className="text-sm text-slate-500">{t("jha.attachments.emptyHazard")}</div>
                  ) : (
                    <div className="flex flex-wrap gap-3">
                      {items.map((photo) => {
                        const isImage = photo.mimeType?.startsWith("image/");
                        return (
                          <div key={photo.id} className="w-32">
                            <div className="relative rounded border border-slate-200 overflow-hidden bg-slate-50">
                              {isImage ? (
                                <img src={photo.url} alt={photo.originalName} className="h-20 w-full object-cover" />
                              ) : (
                                <div className="h-20 w-full flex items-center justify-center text-slate-500 text-sm">
                                  {t("common.file")}
                                </div>
                              )}
                              <button
                                type="button"
                                className="absolute top-1 right-1 bg-white/90 hover:bg-white text-slate-700 rounded px-1.5 py-0.5 text-xs"
                                aria-label={t("common.delete")}
                                onClick={() => void handleDelete(photo.id)}
                              >
                                X
                              </button>
                            </div>
                            <div className="mt-1 text-xs text-slate-600 line-clamp-2" title={photo.originalName}>
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
        </div>
      </div>
    </section>
  );
};
