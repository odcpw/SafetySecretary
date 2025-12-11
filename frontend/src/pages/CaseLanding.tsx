import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import type { RiskAssessmentCaseSummary } from "@/types/riskAssessment";

const createCaseSchema = z.object({
  activityName: z.string().min(1, "Activity name is required"),
  location: z.string().optional(),
  team: z.string().optional()
});

type CreateCaseForm = z.infer<typeof createCaseSchema>;

export const CaseLanding = () => {
  const navigate = useNavigate();
  const [loadId, setLoadId] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const [recentCases, setRecentCases] = useState<RiskAssessmentCaseSummary[]>([]);
  const [casesError, setCasesError] = useState<string | null>(null);
  const [casesLoading, setCasesLoading] = useState(false);

  const titleSubtitle = useMemo(() => {
    if (!loadId) {
      return "Start by creating a new case or load an existing case ID.";
    }
    return `Ready to open ${loadId}?`;
  }, [loadId]);

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<CreateCaseForm>({
    resolver: zodResolver(createCaseSchema),
    defaultValues: {
      activityName: "",
      location: "",
      team: ""
    }
  });

  const handleLoad = (event: React.FormEvent) => {
    event.preventDefault();
    if (!loadId.trim()) {
      setLoadError("Enter a case ID");
      return;
    }
    navigate(`/cases/${encodeURIComponent(loadId.trim())}`);
  };

  const onCreateCase = handleSubmit(async (values) => {
    setCreating(true);
    setServerError(null);
    try {
      const response = await fetch("/api/ra-cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to create case");
      }
      const data = await response.json();
      navigate(`/cases/${data.id}`);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Unable to create case");
    } finally {
      setCreating(false);
    }
  });

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const fetchRecentCases = useCallback(async () => {
    setCasesLoading(true);
    setCasesError(null);
    try {
      const response = await fetch("/api/ra-cases?limit=20");
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as { cases: RiskAssessmentCaseSummary[] };
      setRecentCases(data.cases ?? []);
    } catch (error) {
      setCasesError(error instanceof Error ? error.message : "Unable to load cases");
    } finally {
      setCasesLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRecentCases();
  }, [fetchRecentCases]);

  const handleRemoveSaved = async (id: string) => {
    if (!window.confirm("Delete this case? This will remove it from the workspace.")) {
      return;
    }
    const response = await fetch(`/api/ra-cases/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok && response.status !== 404) {
      setCasesError("Unable to delete case.");
      return;
    }
    void fetchRecentCases();
  };

  const handleLoadSaved = (id: string) => {
    navigate(`/cases/${encodeURIComponent(id)}`);
  };

  return (
    <div className="landing-shell">
      <section className="landing-hero">
        <div className="landing-hero__inner">
          <p className="text-label">SafetySecretary</p>
          <h1>AI-assisted risk assessments for teams who care about detail.</h1>
          <p>{titleSubtitle}</p>
          <div className="landing-hero__actions">
            <button type="button" onClick={() => scrollTo("create-card")}>
              Start new case
            </button>
            <button type="button" className="btn-outline" onClick={() => scrollTo("load-card")}>
              Load existing case
            </button>
          </div>
        </div>
      </section>

      <main className="landing-panels">
        <form id="load-card" className="landing-card app-panel" onSubmit={handleLoad}>
          <div className="landing-card__header">
            <p className="text-label">Existing work</p>
            <h2>Load an in-progress case</h2>
            <p>Paste the RiskAssessmentCase ID from the API or PDF export.</p>
          </div>
          <div className="landing-card__body">
            <label htmlFor="load-id">RiskAssessmentCase ID</label>
            <input
              id="load-id"
              value={loadId}
              onChange={(event) => {
                setLoadId(event.target.value);
                setLoadError(null);
              }}
              placeholder="e.g. 9b03b61e-..."
            />
            {loadError && <p className="text-error">{loadError}</p>}
          </div>
          <div className="landing-card__actions">
            <button type="submit" className="btn-outline" disabled={!loadId.trim()}>
              Jump back in
            </button>
          </div>
        </form>

        <form id="create-card" className="landing-card app-panel" onSubmit={onCreateCase}>
          <div className="landing-card__header">
            <p className="text-label">New activity</p>
            <h2>Create a fresh assessment</h2>
            <p>Describe the work, then walk through the phases with your team.</p>
          </div>
          <div className="landing-card__body">
            <label htmlFor="activity-name">Activity name</label>
            <input id="activity-name" {...register("activityName")} placeholder="Inspect mixing tank" />
            {errors.activityName && <p className="text-error">{errors.activityName.message}</p>}

            <label htmlFor="location">Location (optional)</label>
            <input id="location" {...register("location")} placeholder="Plant 3 mezzanine" />

            <label htmlFor="team">Team (optional)</label>
            <input id="team" {...register("team")} placeholder="Maintenance" />
            {serverError && <p className="text-error">{serverError}</p>}
          </div>
          <div className="landing-card__actions">
            <button type="submit" disabled={creating}>
              {creating ? "Creating…" : "Create case"}
            </button>
          </div>
        </form>

        <section className="landing-card app-panel">
          <div className="landing-card__header">
            <p className="text-label">Recently opened</p>
            <h2>Your saved cases</h2>
            <p>Pick up where you left off. These entries stay in your browser.</p>
          </div>
          <div className="landing-card__body">
            {casesLoading && <p className="text-muted">Loading latest cases…</p>}
            {casesError && <p className="text-error">{casesError}</p>}
            {!casesLoading && recentCases.length === 0 && (
              <p className="text-muted">No cases yet. Create one to see it here.</p>
            )}
            {recentCases.length > 0 && (
              <ul className="saved-cases-list">
                {recentCases.map((entry) => (
                  <li key={entry.id} className="saved-case-item">
                    <div className="saved-case-meta">
                      <h3>{entry.activityName}</h3>
                      <p>
                        {entry.location || "Location pending"} · {entry.team || "Team pending"}
                      </p>
                      <span className="status-pill">
                        Updated {new Date(entry.updatedAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="saved-case-actions">
                      <button type="button" className="btn-outline" onClick={() => handleLoadSaved(entry.id)}>
                        Load
                      </button>
                      <button type="button" className="btn-danger" onClick={() => handleRemoveSaved(entry.id)}>
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};
