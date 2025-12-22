/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type {
  ControlHierarchy,
  CorrectiveAction,
  EditableProcessStep,
  Hazard,
  LikelihoodChoice,
  ProposedControl,
  RatingInput,
  RiskAssessmentCase,
  SeverityChoice
} from "@/types/riskAssessment";
import { pollJobUntilDone } from "@/lib/jobs";
import { apiFetch } from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { useDemoMode } from "@/hooks/useDemoMode";
import { DemoCaseActions } from "@/components/common/DemoCaseActions";

// Types for contextual update parsing (LLM-assisted natural language input)
export type ContextualUpdateIntent = "add" | "modify" | "delete" | "insert" | "reorder" | "clarify";
export type ContextualUpdateTarget = "step" | "hazard" | "control" | "action" | "assessment" | "multiple";

export interface ContextualUpdateCommand {
  intent: ContextualUpdateIntent;
  target: ContextualUpdateTarget;
  location: {
    stepId?: string;
    stepIndex?: number;
    hazardId?: string;
    actionId?: string;
    controlId?: string;
    insertAfter?: string;
  };
  data: Record<string, unknown>;
  explanation: string;
}

export interface ParsedContextualUpdate {
  commands: ContextualUpdateCommand[];
  summary?: string;
  needsClarification?: boolean;
  clarificationPrompt?: string;
  rawResponse?: string;
}

type ContextualUpdateSnapshot = {
  beforeCase: RiskAssessmentCase;
  summary?: string;
  appliedAt: string;
};

interface RaActions {
  extractSteps: (description: string) => Promise<void>;
  saveSteps: (steps: EditableProcessStep[]) => Promise<void>;
  extractHazards: (narrative: string) => Promise<void>;
  extractControls: (notes: string) => Promise<void>;
  extractActions: (notes: string) => Promise<void>;
  addManualHazard: (stepId: string, label: string, description: string) => Promise<void>;
  updateHazard: (hazardId: string, patch: { label?: string; description?: string; stepId?: string; existingControls?: string[]; categoryCode?: string }) => Promise<void>;
  deleteHazard: (hazardId: string) => Promise<void>;
  reorderHazards: (stepId: string, hazardIds: string[]) => Promise<void>;
  saveRiskRatings: (ratings: RatingInput[]) => Promise<void>;
  addProposedControl: (hazardId: string, description: string, hierarchy?: ControlHierarchy) => Promise<void>;
  deleteProposedControl: (hazardId: string, controlId: string) => Promise<void>;
  saveResidualRisk: (ratings: RatingInput[]) => Promise<void>;
  addAction: (payload: { hazardId: string; description: string; owner?: string; dueDate?: string }) => Promise<void>;
  updateAction: (
    actionId: string,
    patch: { description?: string; owner?: string | null; dueDate?: string | null; status?: string }
  ) => Promise<void>;
  deleteAction: (actionId: string) => Promise<void>;
  reorderActionsForHazard: (hazardId: string, actionIds: string[]) => Promise<void>;
  advancePhase: () => Promise<void>;
  // Contextual update actions for natural language input
  parseContextualUpdate: (userInput: string, currentPhase: string) => Promise<ParsedContextualUpdate>;
  applyContextualUpdate: (command: ContextualUpdateCommand) => Promise<void>;
  applyContextualUpdates: (commands: ContextualUpdateCommand[], summary?: string) => Promise<void>;
  undoLastContextualUpdate: () => Promise<void>;
}

interface RaContextValue {
  raCase: RiskAssessmentCase;
  saving: boolean;
  loading: boolean;
  error: string | null;
  refreshCase: () => Promise<RiskAssessmentCase | null>;
  actions: RaActions;
  lastContextualUpdate: ContextualUpdateSnapshot | null;
}

const RaContext = createContext<RaContextValue | null>(null);

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

const voidFetch = async (path: string, init?: RequestInit): Promise<void> => {
  const headers = new Headers(init?.headers ?? {});
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await apiFetch(path, { ...init, headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
};

interface RaProviderProps {
  caseId: string;
  children: ReactNode;
  statusVariant?: "gui" | "tui";
  renderLoading?: () => ReactNode;
  renderError?: (error: string, retry: () => Promise<RiskAssessmentCase | null>) => ReactNode;
}

export const RaProvider = ({
  caseId,
  children,
  statusVariant = "gui",
  renderLoading,
  renderError
}: RaProviderProps) => {
  const [raCase, setRaCase] = useState<RiskAssessmentCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastContextualUpdate, setLastContextualUpdate] = useState<ContextualUpdateSnapshot | null>(null);
  const navigate = useNavigate();
  const isDemo = useDemoMode();

  const refreshCase = useCallback(async (): Promise<RiskAssessmentCase | null> => {
    try {
      setLoading(true);
      const data = await jsonFetch<RiskAssessmentCase>(`/api/ra-cases/${caseId}`);
      setRaCase(data);
      setError(null);
      return data;
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Unable to load case");
      return null;
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    void refreshCase();
  }, [refreshCase]);

  useEffect(() => {
    setLastContextualUpdate(null);
  }, [caseId]);

  const mutate = async (action: () => Promise<void>) => {
    setSaving(true);
    try {
      await action();
      await refreshCase();
    } finally {
      setSaving(false);
    }
  };

  const actions: RaActions = {
    extractSteps: (description) =>
      mutate(async () => {
        const job = await jsonFetch<{ id: string }>(`/api/ra-cases/${caseId}/steps/extract`, {
          method: "POST",
          body: JSON.stringify({ description })
        });
        await pollJobUntilDone(job.id);
      }),
    saveSteps: (steps) =>
      mutate(async () => {
        const payload = steps.map((step, index) => ({
          ...step,
          orderIndex: step.orderIndex ?? index,
          description: step.description ?? null
        }));
        await jsonFetch(`/api/ra-cases/${caseId}/steps`, {
          method: "PUT",
          body: JSON.stringify({ steps: payload })
        });
      }),
    extractHazards: (narrative) =>
      mutate(async () => {
        const job = await jsonFetch<{ id: string }>(`/api/ra-cases/${caseId}/hazards/extract`, {
          method: "POST",
          body: JSON.stringify({ narrative })
        });
        await pollJobUntilDone(job.id);
      }),
    extractControls: (notes) =>
      mutate(async () => {
        const job = await jsonFetch<{ id: string }>(`/api/ra-cases/${caseId}/controls/extract`, {
          method: "POST",
          body: JSON.stringify({ notes })
        });
        await pollJobUntilDone(job.id);
      }),
    extractActions: (notes) =>
      mutate(async () => {
        const job = await jsonFetch<{ id: string }>(`/api/ra-cases/${caseId}/actions/extract`, {
          method: "POST",
          body: JSON.stringify({ notes })
        });
        await pollJobUntilDone(job.id);
      }),
    addManualHazard: (stepId, label, description) =>
      mutate(async () => {
        await jsonFetch<Hazard>(`/api/ra-cases/${caseId}/hazards`, {
          method: "POST",
          body: JSON.stringify({ stepId, label, description })
        });
      }),
    updateHazard: (hazardId, patch) =>
      mutate(async () => {
        await jsonFetch<Hazard>(`/api/ra-cases/${caseId}/hazards/${hazardId}`, {
          method: "PUT",
          body: JSON.stringify(patch)
        });
      }),
    deleteHazard: (hazardId) =>
      mutate(async () => {
        await voidFetch(`/api/ra-cases/${caseId}/hazards/${hazardId}`, { method: "DELETE" });
      }),
    reorderHazards: (stepId, hazardIds) =>
      mutate(async () => {
        await voidFetch(`/api/ra-cases/${caseId}/steps/${stepId}/hazards/order`, {
          method: "PUT",
          body: JSON.stringify({ hazardIds })
        });
      }),
    saveRiskRatings: (ratings) =>
      mutate(async () => {
        if (raCase) {
          const byHazardId = new Map(ratings.map((item) => [item.hazardId, item]));
          setRaCase((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              hazards: prev.hazards.map((hazard) => {
                const next = byHazardId.get(hazard.id);
                if (!next) return hazard;
                const severity = next.severity ? (next.severity as SeverityChoice) : undefined;
                const likelihood = next.likelihood ? (next.likelihood as LikelihoodChoice) : undefined;
                const isClearing = !severity && !likelihood;
                return {
                  ...hazard,
                  baseline: isClearing
                    ? undefined
                    : {
                        severity,
                        likelihood,
                        riskRating: hazard.baseline?.riskRating ?? null
                      }
                };
              })
            };
          });
        }

        await jsonFetch(`/api/ra-cases/${caseId}/hazards/risk`, {
          method: "PUT",
          body: JSON.stringify({ ratings })
        });
      }),
    addProposedControl: (hazardId, description, hierarchy) =>
      mutate(async () => {
        await jsonFetch<ProposedControl>(`/api/ra-cases/${caseId}/hazards/${hazardId}/proposed-controls`, {
          method: "POST",
          body: JSON.stringify({ description, hierarchy })
        });
      }),
    deleteProposedControl: (hazardId, controlId) =>
      mutate(async () => {
        await voidFetch(`/api/ra-cases/${caseId}/hazards/${hazardId}/proposed-controls/${controlId}`, {
          method: "DELETE"
        });
      }),
    saveResidualRisk: (ratings) =>
      mutate(async () => {
        if (raCase) {
          const byHazardId = new Map(ratings.map((item) => [item.hazardId, item]));
          setRaCase((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              hazards: prev.hazards.map((hazard) => {
                const next = byHazardId.get(hazard.id);
                if (!next) return hazard;
                const severity = next.severity ? (next.severity as SeverityChoice) : undefined;
                const likelihood = next.likelihood ? (next.likelihood as LikelihoodChoice) : undefined;
                const isClearing = !severity && !likelihood;
                return {
                  ...hazard,
                  residual: isClearing
                    ? undefined
                    : {
                        severity,
                        likelihood,
                        riskRating: hazard.residual?.riskRating ?? null
                      }
                };
              })
            };
          });
        }

        await jsonFetch(`/api/ra-cases/${caseId}/hazards/residual-risk`, {
          method: "PUT",
          body: JSON.stringify({ ratings })
        });
      }),
    addAction: (payload) =>
      mutate(async () => {
        await jsonFetch<CorrectiveAction>(`/api/ra-cases/${caseId}/actions`, {
          method: "POST",
          body: JSON.stringify(payload)
        });
      }),
    updateAction: (actionId, patch) =>
      mutate(async () => {
        await jsonFetch<CorrectiveAction>(`/api/ra-cases/${caseId}/actions/${actionId}`, {
          method: "PUT",
          body: JSON.stringify(patch)
        });
      }),
    deleteAction: (actionId) =>
      mutate(async () => {
        await voidFetch(`/api/ra-cases/${caseId}/actions/${actionId}`, { method: "DELETE" });
      }),
    reorderActionsForHazard: (hazardId, actionIds) =>
      mutate(async () => {
        await voidFetch(`/api/ra-cases/${caseId}/hazards/${hazardId}/actions/order`, {
          method: "PUT",
          body: JSON.stringify({ actionIds })
        });
      }),
    advancePhase: () =>
      mutate(async () => {
        await jsonFetch(`/api/ra-cases/${caseId}/advance-phase`, { method: "POST" });
      }),
    // Parse natural language input into structured commands
    parseContextualUpdate: async (userInput: string, currentPhase: string) => {
      // Build table state from current raCase for LLM context
      const tableState = {
        steps: raCase?.steps.map((s) => ({
          id: s.id,
          activity: s.activity,
          equipment: s.equipment ?? [],
          substances: s.substances ?? []
        })) ?? [],
        hazards: raCase?.hazards.map((h) => ({
          id: h.id,
          label: h.label,
          description: h.description ?? "",
          stepId: h.stepId,
          categoryCode: h.categoryCode ?? null,
          baseline: h.baseline ?? null,
          residual: h.residual ?? null,
          existingControls: h.existingControls ?? [],
          proposedControls: h.proposedControls ?? []
        })) ?? [],
        actions: raCase?.actions.map((a) => ({
          id: a.id,
          hazardId: a.hazardId,
          description: a.description,
          owner: a.owner ?? null,
          dueDate: a.dueDate ?? null,
          status: a.status
        })) ?? []
      };

      return jsonFetch<ParsedContextualUpdate>(`/api/ra-cases/${caseId}/contextual-update/parse`, {
        method: "POST",
        body: JSON.stringify({ userInput, currentPhase, tableState })
      });
    },
    // Apply a single contextual update command to the case
    applyContextualUpdate: (command: ContextualUpdateCommand) =>
      actions.applyContextualUpdates([command]),
    applyContextualUpdates: async (commands, summary) => {
      if (!raCase || commands.length === 0) {
        return;
      }
      const beforeCase = raCase;
      setSaving(true);
      try {
        for (const command of commands) {
          await voidFetch(`/api/ra-cases/${caseId}/contextual-update/apply`, {
            method: "POST",
            body: JSON.stringify({ command })
          });
        }
        await refreshCase();
        setLastContextualUpdate({
          beforeCase,
          summary,
          appliedAt: new Date().toISOString()
        });
      } finally {
        setSaving(false);
      }
    },
    undoLastContextualUpdate: async () => {
      if (!lastContextualUpdate) {
        return;
      }
      setSaving(true);
      try {
        await jsonFetch(`/api/ra-cases/${caseId}/contextual-update/undo`, {
          method: "POST",
          body: JSON.stringify({ snapshot: lastContextualUpdate.beforeCase })
        });
        await refreshCase();
        setLastContextualUpdate(null);
      } finally {
        setSaving(false);
      }
    }
  };

  if (!raCase) {
    if (error) {
      if (renderError) {
        return <>{renderError(error, refreshCase)}</>;
      }
      return (
        <div className="p-6">
          <p className="text-red-600">
            Failed to load case: {error}
            <button type="button" className="ml-3 btn-outline btn-small" onClick={() => refreshCase()}>
              Retry
            </button>
          </p>
          {isDemo && <DemoCaseActions kind="ra" onCreated={(id) => navigate(`/cases/${id}`)} />}
        </div>
      );
    }
    if (renderLoading) {
      return <>{renderLoading()}</>;
    }
    return <div className="p-6 text-slate-600">Loading case…</div>;
  }

  return (
    <RaContext.Provider value={{ raCase, saving, refreshCase, actions, loading, error, lastContextualUpdate }}>
      {statusVariant !== "tui" && loading && (
        <div className="bg-slate-50 text-slate-500 px-4 py-2 mb-4 rounded">
          Refreshing latest data…
        </div>
      )}
      {statusVariant !== "tui" && error && (
        <div className="bg-amber-50 text-amber-900 px-4 py-2 mb-4 rounded">
          Refresh failed: {error}{" "}
          <button type="button" className="underline" onClick={() => refreshCase()}>
            Retry
          </button>
        </div>
      )}
      {children}
    </RaContext.Provider>
  );
};

export const useRaContext = () => {
  const context = useContext(RaContext);
  if (!context) {
    throw new Error("useRaContext must be used within RaProvider");
  }
  return context;
};
