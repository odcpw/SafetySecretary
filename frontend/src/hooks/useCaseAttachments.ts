import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { CaseAttachment } from "@/types/attachments";

const jsonFetch = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const headers = new Headers(init?.headers ?? {});
  if (init?.body && !(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await apiFetch(path, { ...init, headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return (await response.json()) as T;
};

const voidFetch = async (path: string, init?: RequestInit): Promise<void> => {
  const headers = new Headers(init?.headers ?? {});
  if (init?.body && !(init?.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await apiFetch(path, { ...init, headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
};

export const useCaseAttachments = (caseId: string) => {
  const [attachments, setAttachments] = useState<CaseAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const data = await jsonFetch<CaseAttachment[]>(`/api/ra-cases/${caseId}/attachments`);
      setAttachments(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to load attachments");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const uploadToStep = useCallback(
    async (stepId: string, file: File) => {
      const body = new FormData();
      body.append("file", file);
      await jsonFetch(`/api/ra-cases/${caseId}/attachments/steps/${stepId}`, {
        method: "POST",
        body
      });
      await refresh();
    },
    [caseId, refresh]
  );

  const moveToStep = useCallback(
    async (attachmentId: string, stepId: string) => {
      await jsonFetch<CaseAttachment>(`/api/ra-cases/${caseId}/attachments/${attachmentId}`, {
        method: "PUT",
        body: JSON.stringify({ stepId, hazardId: null })
      });
      await refresh();
    },
    [caseId, refresh]
  );

  const reorderStepAttachments = useCallback(
    async (stepId: string, attachmentIds: string[]) => {
      await voidFetch(`/api/ra-cases/${caseId}/attachments/steps/${stepId}/order`, {
        method: "PUT",
        body: JSON.stringify({ attachmentIds })
      });
      await refresh();
    },
    [caseId, refresh]
  );

  const deleteAttachment = useCallback(
    async (attachmentId: string) => {
      await voidFetch(`/api/ra-cases/${caseId}/attachments/${attachmentId}`, { method: "DELETE" });
      await refresh();
    },
    [caseId, refresh]
  );

  return {
    attachments,
    loading,
    error,
    refresh,
    uploadToStep,
    moveToStep,
    reorderStepAttachments,
    deleteAttachment
  };
};
