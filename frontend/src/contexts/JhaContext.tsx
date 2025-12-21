/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { JhaCase, JhaHazard, JhaStep } from "@/types/jha";
import { pollJobUntilDone } from "@/lib/jobs";
import { apiFetch } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { useDemoMode } from "@/hooks/useDemoMode";
import { DemoCaseActions } from "@/components/common/DemoCaseActions";

interface JhaActions {
  refreshCase: () => Promise<void>;
  updateCaseMeta: (patch: Partial<JhaCase>) => Promise<void>;
  saveSteps: (steps: JhaStep[]) => Promise<void>;
  saveHazards: (hazards: JhaHazard[]) => Promise<void>;
  extractRows: (jobDescription: string) => Promise<void>;
}

interface JhaContextValue {
  jhaCase: JhaCase;
  loading: boolean;
  saving: boolean;
  actions: JhaActions;
}

const JhaContext = createContext<JhaContextValue | null>(null);

const jsonFetch = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const headers = new Headers(init?.headers ?? {});
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await apiFetch(path, { ...init, headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  return (await response.json()) as T;
};

export const JhaProvider = ({ caseId, children }: { caseId: string; children: ReactNode }) => {
  const [jhaCase, setJhaCase] = useState<JhaCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const isDemo = useDemoMode();

  const refreshCase = useCallback(async () => {
    setLoading(true);
    try {
      const data = await jsonFetch<JhaCase>(`/api/jha-cases/${caseId}`);
      setJhaCase(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to load JHA case");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void refreshCase();
  }, [refreshCase]);

  const mutate = async (action: () => Promise<void>) => {
    setSaving(true);
    try {
      await action();
      await refreshCase();
    } finally {
      setSaving(false);
    }
  };

  const actions: JhaActions = {
    refreshCase,
    updateCaseMeta: (patch) =>
      mutate(async () => {
        await jsonFetch(`/api/jha-cases/${caseId}`, {
          method: "PATCH",
          body: JSON.stringify(patch)
        });
      }),
    saveSteps: (steps) =>
      mutate(async () => {
        await jsonFetch(`/api/jha-cases/${caseId}/steps`, {
          method: "PUT",
          body: JSON.stringify({ steps })
        });
      }),
    saveHazards: (hazards) =>
      mutate(async () => {
        await jsonFetch(`/api/jha-cases/${caseId}/hazards`, {
          method: "PUT",
          body: JSON.stringify({ hazards })
        });
      }),
    extractRows: (jobDescription) =>
      mutate(async () => {
        const job = await jsonFetch<{ id: string }>(`/api/jha-cases/${caseId}/rows/extract`, {
          method: "POST",
          body: JSON.stringify({ jobDescription })
        });
        await pollJobUntilDone(job.id);
      })
  };

  if (!jhaCase) {
    if (error) {
      return (
        <div className="p-6">
          <p className="text-red-600">
            Failed to load case: {error}
            <button type="button" className="ml-3 bg-slate-800" onClick={() => refreshCase()}>
              Retry
            </button>
          </p>
          {isDemo && <DemoCaseActions kind="jha" onCreated={(id) => navigate(`/jha/${id}`)} />}
        </div>
      );
    }
    return <div className="p-6 text-slate-600">Loading JHA case…</div>;
  }

  return (
    <JhaContext.Provider value={{ jhaCase, loading, saving, actions }}>
      {loading && (
        <div className="bg-slate-50 text-slate-500 px-4 py-2 mb-4 rounded">Refreshing latest data…</div>
      )}
      {error && (
        <div className="bg-amber-50 text-amber-900 px-4 py-2 mb-4 rounded">
          Refresh failed: {error}{" "}
          <button type="button" className="underline" onClick={() => refreshCase()}>
            Retry
          </button>
        </div>
      )}
      {children}
    </JhaContext.Provider>
  );
};

export const useJhaContext = () => {
  const context = useContext(JhaContext);
  if (!context) {
    throw new Error("useJhaContext must be used within JhaProvider");
  }
  return context;
};
