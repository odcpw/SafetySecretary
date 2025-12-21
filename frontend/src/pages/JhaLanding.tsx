import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { UserMenu } from "@/components/common/UserMenu";
import { apiFetch } from "@/lib/api";
import type { JhaCaseSummary } from "@/types/jha";
import { useI18n } from "@/i18n/I18nContext";

export const JhaLanding = () => {
  const navigate = useNavigate();
  const { t, formatDateTime } = useI18n();
  const [loadId, setLoadId] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const [recentCases, setRecentCases] = useState<JhaCaseSummary[]>([]);
  const [casesError, setCasesError] = useState<string | null>(null);
  const [casesLoading, setCasesLoading] = useState(false);

  const createJhaSchema = useMemo(
    () =>
      z.object({
        jobTitle: z.string().min(1, t("landing.jha.errors.jobTitleRequired")),
        site: z.string().optional(),
        supervisor: z.string().optional(),
        workersInvolved: z.string().optional(),
        jobDate: z.string().optional(),
        revision: z.string().optional(),
        preparedBy: z.string().optional(),
        reviewedBy: z.string().optional(),
        approvedBy: z.string().optional(),
        signoffDate: z.string().optional()
      }),
    [t]
  );

  type CreateJhaForm = z.infer<typeof createJhaSchema>;

  const titleSubtitle = useMemo(() => {
    if (!loadId) {
      return t("landing.jha.hero.subtitleDefault");
    }
    return t("landing.jha.hero.subtitleReady", { values: { id: loadId } });
  }, [loadId, t]);

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<CreateJhaForm>({
    resolver: zodResolver(createJhaSchema),
    defaultValues: {
      jobTitle: "",
      site: "",
      supervisor: "",
      workersInvolved: "",
      jobDate: "",
      revision: "",
      preparedBy: "",
      reviewedBy: "",
      approvedBy: "",
      signoffDate: ""
    }
  });

  const handleLoad = (event: React.FormEvent) => {
    event.preventDefault();
    if (!loadId.trim()) {
      setLoadError(t("landing.jha.errors.missingId"));
      return;
    }
    navigate(`/jha/${encodeURIComponent(loadId.trim())}`);
  };

  const onCreateCase = handleSubmit(async (values) => {
    setCreating(true);
    setServerError(null);
    try {
      const response = await apiFetch("/api/jha-cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || t("landing.jha.errors.createFailed"));
      }
      const data = await response.json();
      navigate(`/jha/${data.id}`);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : t("landing.jha.errors.createFailed"));
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
      const response = await apiFetch("/api/jha-cases?limit=20");
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as { cases: JhaCaseSummary[] };
      setRecentCases(data.cases ?? []);
    } catch (error) {
      setCasesError(error instanceof Error ? error.message : t("landing.jha.errors.loadFailed"));
    } finally {
      setCasesLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchRecentCases();
  }, [fetchRecentCases]);

  const handleLoadSaved = (id: string) => {
    navigate(`/jha/${encodeURIComponent(id)}`);
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
          <h1>{t("landing.jha.hero.title")}</h1>
          <p>{titleSubtitle}</p>
          <div className="landing-hero__actions">
            <button type="button" onClick={() => scrollTo("create-card")}>
              {t("landing.jha.hero.primaryAction")}
            </button>
            <button type="button" className="btn-outline" onClick={() => scrollTo("load-card")}>
              {t("landing.jha.hero.secondaryAction")}
            </button>
          </div>
        </div>
      </section>

      <main className="landing-panels">
        <form id="load-card" className="landing-card app-panel" onSubmit={handleLoad}>
          <div className="landing-card__header">
            <p className="text-label">{t("landing.jha.load.label")}</p>
            <h2>{t("landing.jha.load.title")}</h2>
            <p>{t("landing.jha.load.subtitle")}</p>
          </div>
          <div className="landing-card__body">
            <label htmlFor="load-id">{t("landing.jha.load.inputLabel")}</label>
            <input
              id="load-id"
              value={loadId}
              onChange={(event) => {
                setLoadId(event.target.value);
                setLoadError(null);
              }}
              placeholder={t("landing.jha.load.inputPlaceholder")}
            />
            {loadError && <p className="text-error">{loadError}</p>}
          </div>
          <div className="landing-card__actions">
            <button type="submit" className="btn-outline" disabled={!loadId.trim()}>
              {t("landing.jha.load.action")}
            </button>
          </div>
        </form>

        <form id="create-card" className="landing-card app-panel" onSubmit={onCreateCase}>
          <div className="landing-card__header">
            <p className="text-label">{t("landing.jha.create.label")}</p>
            <h2>{t("landing.jha.create.title")}</h2>
            <p>{t("landing.jha.create.subtitle")}</p>
          </div>
          <div className="landing-card__body">
            <label htmlFor="job-title">{t("landing.jha.create.jobTitleLabel")}</label>
            <input
              id="job-title"
              {...register("jobTitle")}
              placeholder={t("landing.jha.create.jobTitlePlaceholder")}
            />
            {errors.jobTitle && <p className="text-error">{errors.jobTitle.message}</p>}

            <label htmlFor="site">{t("landing.jha.create.siteLabel")}</label>
            <input id="site" {...register("site")} placeholder={t("landing.jha.create.sitePlaceholder")} />

            <label htmlFor="supervisor">{t("landing.jha.create.supervisorLabel")}</label>
            <input
              id="supervisor"
              {...register("supervisor")}
              placeholder={t("landing.jha.create.supervisorPlaceholder")}
            />

            <label htmlFor="workers">{t("landing.jha.create.workersLabel")}</label>
            <input
              id="workers"
              {...register("workersInvolved")}
              placeholder={t("landing.jha.create.workersPlaceholder")}
            />

            <label htmlFor="job-date">{t("landing.jha.create.jobDateLabel")}</label>
            <input id="job-date" {...register("jobDate")} placeholder={t("landing.jha.create.jobDatePlaceholder")} />

            <label htmlFor="revision">{t("landing.jha.create.revisionLabel")}</label>
            <input id="revision" {...register("revision")} placeholder={t("landing.jha.create.revisionPlaceholder")} />

            <label htmlFor="prepared-by">{t("landing.jha.create.preparedByLabel")}</label>
            <input
              id="prepared-by"
              {...register("preparedBy")}
              placeholder={t("landing.jha.create.preparedByPlaceholder")}
            />

            <label htmlFor="reviewed-by">{t("landing.jha.create.reviewedByLabel")}</label>
            <input
              id="reviewed-by"
              {...register("reviewedBy")}
              placeholder={t("landing.jha.create.reviewedByPlaceholder")}
            />

            <label htmlFor="approved-by">{t("landing.jha.create.approvedByLabel")}</label>
            <input
              id="approved-by"
              {...register("approvedBy")}
              placeholder={t("landing.jha.create.approvedByPlaceholder")}
            />

            <label htmlFor="signoff">{t("landing.jha.create.signoffLabel")}</label>
            <input
              id="signoff"
              {...register("signoffDate")}
              placeholder={t("landing.jha.create.signoffPlaceholder")}
            />

            {serverError && <p className="text-error">{serverError}</p>}
          </div>
          <div className="landing-card__actions">
            <button type="submit" disabled={creating}>
              {creating ? t("landing.jha.create.creating") : t("landing.jha.create.action")}
            </button>
          </div>
        </form>

        <section className="landing-card app-panel">
          <div className="landing-card__header">
            <p className="text-label">{t("landing.jha.recent.label")}</p>
            <h2>{t("landing.jha.recent.title")}</h2>
            <p>{t("landing.jha.recent.subtitle")}</p>
          </div>
          <div className="landing-card__body">
            {casesLoading && <p className="text-muted">{t("landing.jha.recent.loading")}</p>}
            {casesError && <p className="text-error">{casesError}</p>}
            {!casesLoading && recentCases.length === 0 && (
              <p className="text-muted">{t("landing.jha.recent.empty")}</p>
            )}
            {recentCases.length > 0 && (
              <ul className="saved-cases-list">
                {recentCases.map((entry) => (
                  <li key={entry.id} className="saved-case-item">
                    <div className="saved-case-meta">
                      <h3>{entry.jobTitle}</h3>
                      <p>
                        {entry.site || t("workspace.sitePending")} -{" "}
                        {entry.supervisor || t("workspace.supervisorPending")}
                      </p>
                      <span className="status-pill">
                        {t("landing.jha.recent.updated", { values: { date: formatDateTime(entry.updatedAt) } })}
                      </span>
                    </div>
                    <div className="saved-case-actions">
                      <button type="button" className="btn-outline" onClick={() => handleLoadSaved(entry.id)}>
                        {t("landing.jha.recent.load")}
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
