/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type {
  IncidentAssistantDraft,
  IncidentCase,
  IncidentCauseActionInput,
  IncidentCauseNodeInput,
  IncidentPersonalEventInput,
  IncidentTimelineConfidence,
  IncidentTimelineEventInput,
  IncidentDeviationInput,
  IncidentCauseInput,
  IncidentActionInput
} from "@/types/incident";
import { pollJobUntilDone } from "@/lib/jobs";
import { apiFetch } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { useDemoMode } from "@/hooks/useDemoMode";
import { DemoCaseActions } from "@/components/common/DemoCaseActions";

interface IncidentActions {
  refreshCase: () => Promise<void>;
  updateCaseMeta: (patch: Partial<IncidentCase>) => Promise<void>;
  addPerson: (role: string, name?: string | null, otherInfo?: string | null) => Promise<void>;
  updatePerson: (personId: string, role: string, name?: string | null, otherInfo?: string | null) => Promise<void>;
  addAccount: (personId: string, rawStatement?: string | null) => Promise<void>;
  updateAccount: (accountId: string, rawStatement?: string | null) => Promise<void>;
  savePersonalEvents: (accountId: string, events: IncidentPersonalEventInput[]) => Promise<void>;
  extractAccount: (accountId: string, statement: string) => Promise<void>;
  extractNarrative: (narrative: string) => Promise<void>;
  updateAssistantDraft: (draft: IncidentAssistantDraft | null, narrative?: string | null) => Promise<void>;
  applyAssistantDraft: (
    timeline?: Array<{
      eventAt?: string | null;
      timeLabel?: string | null;
      text: string;
      confidence?: IncidentTimelineConfidence;
    }>
  ) => Promise<void>;
  assistFacts: (narrative: string) => Promise<unknown>;
  assistCauses: () => Promise<unknown>;
  assistRootCauses: (causeNodeIds?: string[]) => Promise<unknown>;
  assistActions: (causeNodeIds?: string[]) => Promise<unknown>;
  mergeTimeline: () => Promise<void>;
  checkConsistency: () => Promise<unknown>;
  saveTimeline: (events: IncidentTimelineEventInput[]) => Promise<void>;
  saveDeviations: (deviations: IncidentDeviationInput[]) => Promise<void>;
  saveCauses: (causes: IncidentCauseInput[]) => Promise<void>;
  saveActions: (actions: IncidentActionInput[]) => Promise<void>;
  saveCauseNodes: (nodes: IncidentCauseNodeInput[]) => Promise<void>;
  saveCauseActions: (actions: IncidentCauseActionInput[]) => Promise<void>;
}

interface IncidentContextValue {
  incidentCase: IncidentCase;
  loading: boolean;
  saving: boolean;
  actions: IncidentActions;
}

const IncidentContext = createContext<IncidentContextValue | null>(null);

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

export const IncidentProvider = ({ caseId, children }: { caseId: string; children: ReactNode }) => {
  const [incidentCase, setIncidentCase] = useState<IncidentCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const isDemo = useDemoMode();

  const refreshCase = useCallback(async () => {
    setLoading(true);
    try {
      const data = await jsonFetch<IncidentCase>(`/api/incident-cases/${caseId}`);
      setIncidentCase(data);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to load incident");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void refreshCase();
  }, [refreshCase]);

  const mutate = async <T,>(action: () => Promise<T>): Promise<T> => {
    setSaving(true);
    try {
      const result = await action();
      await refreshCase();
      return result;
    } finally {
      setSaving(false);
    }
  };

  const actions: IncidentActions = {
    refreshCase,
    updateCaseMeta: (patch) =>
      mutate(async () => {
        await jsonFetch(`/api/incident-cases/${caseId}`, {
          method: "PATCH",
          body: JSON.stringify(patch)
        });
      }),
    addPerson: (role, name, otherInfo) =>
      mutate(async () => {
        await jsonFetch(`/api/incident-cases/${caseId}/persons`, {
          method: "POST",
          body: JSON.stringify({ role, name, otherInfo })
        });
      }),
    updatePerson: (personId, role, name, otherInfo) =>
      mutate(async () => {
        await jsonFetch(`/api/incident-cases/${caseId}/persons/${personId}`, {
          method: "PUT",
          body: JSON.stringify({ role, name, otherInfo })
        });
      }),
    addAccount: (personId, rawStatement) =>
      mutate(async () => {
        await jsonFetch(`/api/incident-cases/${caseId}/accounts`, {
          method: "POST",
          body: JSON.stringify({ personId, rawStatement })
        });
      }),
    updateAccount: (accountId, rawStatement) =>
      mutate(async () => {
        await jsonFetch(`/api/incident-cases/${caseId}/accounts/${accountId}`, {
          method: "PUT",
          body: JSON.stringify({ rawStatement })
        });
      }),
    savePersonalEvents: (accountId, events) =>
      mutate(async () => {
        await jsonFetch(`/api/incident-cases/${caseId}/accounts/${accountId}/personal-events`, {
          method: "PUT",
          body: JSON.stringify({ events })
        });
      }),
    extractAccount: (accountId, statement) =>
      mutate(async () => {
        const job = await jsonFetch<{ id: string }>(`/api/incident-cases/${caseId}/accounts/${accountId}/extract`, {
          method: "POST",
          body: JSON.stringify({ statement })
        });
        await pollJobUntilDone(job.id);
      }),
    extractNarrative: (narrative) =>
      mutate(async () => {
        const job = await jsonFetch<{ id: string }>(`/api/incident-cases/${caseId}/narrative/extract`, {
          method: "POST",
          body: JSON.stringify({ narrative })
        });
        await pollJobUntilDone(job.id);
      }),
    updateAssistantDraft: (draft, narrative) =>
      mutate(async () => {
        await jsonFetch(`/api/incident-cases/${caseId}/assistant-draft`, {
          method: "PUT",
          body: JSON.stringify({ draft, narrative })
        });
      }),
    applyAssistantDraft: (timeline) =>
      mutate(async () => {
        await jsonFetch(`/api/incident-cases/${caseId}/assistant-draft/apply`, {
          method: "POST",
          body: JSON.stringify({ timeline })
        });
      }),
    assistFacts: (narrative) =>
      mutate(async () => {
        const job = await jsonFetch<{ id: string }>(`/api/incident-cases/${caseId}/assistant/facts`, {
          method: "POST",
          body: JSON.stringify({ narrative })
        });
        return (await pollJobUntilDone(job.id)).result;
      }),
    assistCauses: () =>
      mutate(async () => {
        const job = await jsonFetch<{ id: string }>(`/api/incident-cases/${caseId}/assistant/causes`, {
          method: "POST"
        });
        return (await pollJobUntilDone(job.id)).result;
      }),
    assistRootCauses: (causeNodeIds) =>
      mutate(async () => {
        const job = await jsonFetch<{ id: string }>(`/api/incident-cases/${caseId}/assistant/root-causes`, {
          method: "POST",
          body: JSON.stringify({ causeNodeIds })
        });
        return (await pollJobUntilDone(job.id)).result;
      }),
    assistActions: (causeNodeIds) =>
      mutate(async () => {
        const job = await jsonFetch<{ id: string }>(`/api/incident-cases/${caseId}/assistant/actions`, {
          method: "POST",
          body: JSON.stringify({ causeNodeIds })
        });
        return (await pollJobUntilDone(job.id)).result;
      }),
    mergeTimeline: () =>
      mutate(async () => {
        const job = await jsonFetch<{ id: string }>(`/api/incident-cases/${caseId}/timeline/merge`, {
          method: "POST"
        });
        await pollJobUntilDone(job.id);
      }),
    checkConsistency: async () => {
      const job = await jsonFetch<{ id: string }>(`/api/incident-cases/${caseId}/timeline/check`, {
        method: "POST"
      });
      const result = await pollJobUntilDone(job.id);
      return result.result;
    },
    saveTimeline: (events) =>
      mutate(async () => {
        await jsonFetch(`/api/incident-cases/${caseId}/timeline`, {
          method: "PUT",
          body: JSON.stringify({ events })
        });
      }),
    saveDeviations: (deviations) =>
      mutate(async () => {
        await jsonFetch(`/api/incident-cases/${caseId}/deviations`, {
          method: "PUT",
          body: JSON.stringify({ deviations })
        });
      }),
    saveCauses: (causes) =>
      mutate(async () => {
        await jsonFetch(`/api/incident-cases/${caseId}/causes`, {
          method: "PUT",
          body: JSON.stringify({ causes })
        });
      }),
    saveActions: (actions) =>
      mutate(async () => {
        await jsonFetch(`/api/incident-cases/${caseId}/actions`, {
          method: "PUT",
          body: JSON.stringify({ actions })
        });
      }),
    saveCauseNodes: (nodes) =>
      mutate(async () => {
        await jsonFetch(`/api/incident-cases/${caseId}/cause-nodes`, {
          method: "PUT",
          body: JSON.stringify({ nodes })
        });
      }),
    saveCauseActions: (actions) =>
      mutate(async () => {
        await jsonFetch(`/api/incident-cases/${caseId}/cause-actions`, {
          method: "PUT",
          body: JSON.stringify({ actions })
        });
      })
  };

  if (!incidentCase) {
    if (error) {
      return (
        <div className="p-6">
          <p className="text-red-600">
            Failed to load incident: {error}
            <button type="button" className="ml-3 btn-outline btn-small" onClick={() => refreshCase()}>
              Retry
            </button>
          </p>
          {isDemo && <DemoCaseActions kind="incident" onCreated={(id) => navigate(`/incidents/${id}`)} />}
        </div>
      );
    }
    return <div className="p-6 text-slate-600">Loading incident...</div>;
  }

  return (
    <IncidentContext.Provider value={{ incidentCase, loading, saving, actions }}>
      {loading && (
        <div className="bg-slate-50 text-slate-500 px-4 py-2 mb-4 rounded">Refreshing latest data...</div>
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
    </IncidentContext.Provider>
  );
};

export const useIncidentContext = () => {
  const context = useContext(IncidentContext);
  if (!context) {
    throw new Error("useIncidentContext must be used within IncidentProvider");
  }
  return context;
};
