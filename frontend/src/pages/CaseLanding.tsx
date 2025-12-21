import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { UserMenu } from "@/components/common/UserMenu";
import { apiFetch } from "@/lib/api";
import type { RiskAssessmentCaseSummary } from "@/types/riskAssessment";
import { useI18n } from "@/i18n/I18nContext";

export const CaseLanding = () => {
  const navigate = useNavigate();
  const { t, formatDateTime } = useI18n();
  const [loadId, setLoadId] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const [recentCases, setRecentCases] = useState<RiskAssessmentCaseSummary[]>([]);
  const [casesError, setCasesError] = useState<string | null>(null);
  const [casesLoading, setCasesLoading] = useState(false);

  const createCaseSchema = useMemo(
    () =>
      z.object({
        activityName: z.string().min(1, t("landing.hira.errors.activityRequired")),
        location: z.string().optional(),
        team: z.string().optional()
      }),
    [t]
  );

  type CreateCaseForm = z.infer<typeof createCaseSchema>;

  const titleSubtitle = useMemo(() => {
    if (!loadId) {
      return t("landing.hira.hero.subtitleDefault");
    }
    return t("landing.hira.hero.subtitleReady", { values: { id: loadId } });
  }, [loadId, t]);

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
      setLoadError(t("landing.hira.errors.missingId"));
      return;
    }
    navigate(`/cases/${encodeURIComponent(loadId.trim())}`);
  };

  const onCreateCase = handleSubmit(async (values) => {
    setCreating(true);
    setServerError(null);
    try {
      const response = await apiFetch("/api/ra-cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || t("landing.hira.errors.createFailed"));
      }
      const data = await response.json();
      navigate(`/cases/${data.id}`);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : t("landing.hira.errors.createFailed"));
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
      const response = await apiFetch("/api/ra-cases?limit=20");
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as { cases: RiskAssessmentCaseSummary[] };
      setRecentCases(data.cases ?? []);
    } catch (error) {
      setCasesError(error instanceof Error ? error.message : t("landing.hira.errors.loadFailed"));
    } finally {
      setCasesLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchRecentCases();
  }, [fetchRecentCases]);

  const handleRemoveSaved = async (id: string) => {
    if (!window.confirm(t("landing.hira.confirmDelete"))) {
      return;
    }
    const response = await apiFetch(`/api/ra-cases/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok && response.status !== 404) {
      setCasesError(t("landing.hira.errors.deleteFailed"));
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
          <div className="landing-hero__header">
            <p className="text-label">{t("common.appName")}</p>
            <div className="landing-hero__meta">
              <ThemeToggle />
              <UserMenu />
            </div>
          </div>
          <h1>{t("landing.hira.hero.title")}</h1>
          <p>{titleSubtitle}</p>
          <div className="landing-hero__actions">
            <button type="button" onClick={() => scrollTo("create-card")}>
              {t("landing.hira.hero.primaryAction")}
            </button>
            <button type="button" className="btn-outline" onClick={() => scrollTo("load-card")}>
              {t("landing.hira.hero.secondaryAction")}
            </button>
          </div>
        </div>
      </section>

      <main className="landing-panels">
        <form id="load-card" className="landing-card app-panel" onSubmit={handleLoad}>
          <div className="landing-card__header">
            <p className="text-label">{t("landing.hira.load.label")}</p>
            <h2>{t("landing.hira.load.title")}</h2>
            <p>{t("landing.hira.load.subtitle")}</p>
          </div>
          <div className="landing-card__body">
            <label htmlFor="load-id">{t("landing.hira.load.inputLabel")}</label>
            <input
              id="load-id"
              value={loadId}
              onChange={(event) => {
                setLoadId(event.target.value);
                setLoadError(null);
              }}
              placeholder={t("landing.hira.load.inputPlaceholder")}
            />
            {loadError && <p className="text-error">{loadError}</p>}
          </div>
          <div className="landing-card__actions">
            <button type="submit" className="btn-outline" disabled={!loadId.trim()}>
              {t("landing.hira.load.action")}
            </button>
          </div>
        </form>

        <form id="create-card" className="landing-card app-panel" onSubmit={onCreateCase}>
          <div className="landing-card__header">
            <p className="text-label">{t("landing.hira.create.label")}</p>
            <h2>{t("landing.hira.create.title")}</h2>
            <p>{t("landing.hira.create.subtitle")}</p>
          </div>
          <div className="landing-card__body">
            <label htmlFor="activity-name">{t("landing.hira.create.activityLabel")}</label>
            <input
              id="activity-name"
              {...register("activityName")}
              placeholder={t("landing.hira.create.activityPlaceholder")}
            />
            {errors.activityName && <p className="text-error">{errors.activityName.message}</p>}

            <label htmlFor="location">{t("landing.hira.create.locationLabel")}</label>
            <input id="location" {...register("location")} placeholder={t("landing.hira.create.locationPlaceholder")} />

            <label htmlFor="team">{t("landing.hira.create.teamLabel")}</label>
            <input id="team" {...register("team")} placeholder={t("landing.hira.create.teamPlaceholder")} />
            {serverError && <p className="text-error">{serverError}</p>}
          </div>
          <div className="landing-card__actions">
            <button type="submit" disabled={creating}>
              {creating ? t("landing.hira.create.creating") : t("landing.hira.create.action")}
            </button>
          </div>
        </form>

        <section className="landing-card app-panel">
          <div className="landing-card__header">
            <p className="text-label">{t("landing.hira.recent.label")}</p>
            <h2>{t("landing.hira.recent.title")}</h2>
            <p>{t("landing.hira.recent.subtitle")}</p>
          </div>
          <div className="landing-card__body">
            {casesLoading && <p className="text-muted">{t("landing.hira.recent.loading")}</p>}
            {casesError && <p className="text-error">{casesError}</p>}
            {!casesLoading && recentCases.length === 0 && (
              <p className="text-muted">{t("landing.hira.recent.empty")}</p>
            )}
            {recentCases.length > 0 && (
              <ul className="saved-cases-list">
                {recentCases.map((entry) => (
                  <li key={entry.id} className="saved-case-item">
                    <div className="saved-case-meta">
                      <h3>{entry.activityName}</h3>
                      <p>
                        {entry.location || t("workspace.locationPending")} · {entry.team || t("workspace.teamPending")}
                      </p>
                      <span className="status-pill">
                        {t("landing.hira.recent.updated", {
                          values: { date: formatDateTime(entry.updatedAt) }
                        })}
                      </span>
                    </div>
                    <div className="saved-case-actions">
                      <button type="button" className="btn-outline" onClick={() => handleLoadSaved(entry.id)}>
                        {t("landing.hira.recent.load")}
                      </button>
                      <button type="button" className="btn-danger" onClick={() => handleRemoveSaved(entry.id)}>
                        {t("landing.hira.recent.delete")}
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
