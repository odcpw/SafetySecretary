import { useMemo, useState } from "react";
import type { ProcessStep } from "@/types/riskAssessment";
import type { CaseAttachment } from "@/types/attachments";
import { useCaseAttachments } from "@/hooks/useCaseAttachments";

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
    setStatus("Uploading photo…");
    try {
      await uploadToStep(stepId, file);
      setStatus(null);
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : "Upload failed");
      setTimeout(() => setStatus(null), 4000);
    }
  };

  const handleDropOnStep = async (targetStepId: string, payload: DragPayload) => {
    if (payload.fromStepId === targetStepId) {
      return;
    }
    setStatus("Moving photo…");
    try {
      await moveToStep(payload.attachmentId, targetStepId);
      setStatus(null);
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : "Move failed");
      setTimeout(() => setStatus(null), 4000);
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

    setStatus("Reordering photos…");
    try {
      if (payload.fromStepId !== targetStepId) {
        await moveToStep(payload.attachmentId, targetStepId);
      }
      await reorderStepAttachments(targetStepId, nextOrder);
      setStatus(null);
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : "Reorder failed");
      setTimeout(() => setStatus(null), 4000);
    }
  };

  const handleDelete = async (attachmentId: string) => {
    if (!confirm("Delete this attachment?")) return;
    setStatus("Deleting…");
    try {
      await deleteAttachment(attachmentId);
      setStatus(null);
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : "Delete failed");
      setTimeout(() => setStatus(null), 4000);
    }
  };

  return (
    <section className="rounded-lg border border-slate-200 p-4 space-y-3">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Photos by step</h3>
          <p className="text-sm text-slate-500">Upload, reorder, or drag photos between steps.</p>
        </div>
        {loading && <span className="text-sm text-slate-500">Loading…</span>}
      </header>

      {error && <div className="bg-amber-50 text-amber-900 px-3 py-2 rounded text-sm">Photos: {error}</div>}
      {status && <div className="bg-slate-50 text-slate-700 px-3 py-2 rounded text-sm">{status}</div>}

      <div className="space-y-4">
        {steps.map((step, index) => {
          const photos = stepAttachments.get(step.id) ?? [];
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
                  Step {index + 1}: <span className="font-normal text-slate-700">{step.activity}</span>
                </div>
                <label className="text-sm px-3 py-1 rounded bg-slate-900 text-white cursor-pointer">
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => void handleUpload(step.id, event.target.files?.[0] ?? null)}
                  />
                </label>
              </div>

              {photos.length === 0 ? (
                <div className="text-sm text-slate-500">No photos yet. Drop a photo here or upload one.</div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {photos.map((photo) => {
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
                              File
                            </div>
                          )}
                          <button
                            type="button"
                            className="absolute top-1 right-1 bg-white/90 hover:bg-white text-slate-700 rounded px-1.5 py-0.5 text-xs"
                            onClick={() => void handleDelete(photo.id)}
                          >
                            ✕
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
    </section>
  );
};

