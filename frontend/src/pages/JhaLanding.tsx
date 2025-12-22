import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { UserMenu } from "@/components/common/UserMenu";
import { RecentCasesModal } from "@/components/common/RecentCasesModal";
import { apiFetch } from "@/lib/api";
import { combineDateTimeInputs, isValidDateInput, isValidTimeInput } from "@/lib/dateInputs";
import type { JhaCaseSummary } from "@/types/jha";
import { useI18n } from "@/i18n/I18nContext";

export const JhaLanding = () => {
  const navigate = useNavigate();
  const { t, formatDateTime } = useI18n();
  const [loadId, setLoadId] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadModalOpen, setLoadModalOpen] = useState(false);
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
        jobDate: z
          .string()
          .optional()
          .refine((value) => !value || isValidDateInput(value), {
            message: t("common.invalidDate")
          }),
        jobTime: z
          .string()
          .optional()
          .refine((value) => !value || isValidTimeInput(value), {
            message: t("common.invalidTime")
          }),
        revision: z.string().optional(),
        preparedBy: z.string().optional(),
        reviewedBy: z.string().optional(),
        approvedBy: z.string().optional(),
        signoffDate: z
          .string()
          .optional()
          .refine((value) => !value || isValidDateInput(value), {
            message: t("common.invalidDate")
          }),
        signoffTime: z
          .string()
          .optional()
          .refine((value) => !value || isValidTimeInput(value), {
            message: t("common.invalidTime")
          })
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
      jobTime: "",
      revision: "",
      preparedBy: "",
      reviewedBy: "",
      approvedBy: "",
      signoffDate: "",
      signoffTime: ""
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
      const { jobDate, jobTime, signoffDate, signoffTime, ...rest } = values;
      const payload = {
        ...rest,
        jobDate: combineDateTimeInputs(jobDate, jobTime),
        signoffDate: combineDateTimeInputs(signoffDate, signoffTime)
      };
      const response = await apiFetch("/api/jha-cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
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

  const jobDateHintId = "job-date-hint";
  const jobDateErrorId = errors.jobDate ? "job-date-error" : undefined;
  const jobDateDescribedBy = [jobDateHintId, jobDateErrorId].filter(Boolean).join(" ") || undefined;
  const jobTimeHintId = "job-time-hint";
  const jobTimeErrorId = errors.jobTime ? "job-time-error" : undefined;
  const jobTimeDescribedBy = [jobTimeHintId, jobTimeErrorId].filter(Boolean).join(" ") || undefined;
  const signoffDateHintId = "signoff-date-hint";
  const signoffDateErrorId = errors.signoffDate ? "signoff-date-error" : undefined;
  const signoffDateDescribedBy = [signoffDateHintId, signoffDateErrorId].filter(Boolean).join(" ") || undefined;
  const signoffTimeHintId = "signoff-time-hint";
  const signoffTimeErrorId = errors.signoffTime ? "signoff-time-error" : undefined;
  const signoffTimeDescribedBy = [signoffTimeHintId, signoffTimeErrorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="landing-shell">
      <section className="landing-hero">
        <div className="landing-hero__inner">
          <div className="landing-hero__header">
            <p className="text-label">{t("common.appName")}</p>
            <div className="landing-hero__meta">
              <button type="button" className="btn-outline" onClick={() => window.location.assign("/tui/jha")}>
                Switch to TUI
              </button>
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

      <main className="landing-panels grid-auto-wide">
        <form id="load-card" className="landing-card app-panel card" onSubmit={handleLoad}>
          <div className="landing-card__header">
            <p className="text-label">{t("landing.jha.load.label")}</p>
            <h2>{t("landing.jha.load.title")}</h2>
            <p>{t("landing.jha.load.subtitle")}</p>
          </div>
          <div className="landing-card__body stack">
            <button type="button" onClick={() => setLoadModalOpen(true)}>
              {t("common.browseCases")}
            </button>
            <label htmlFor="load-id">{t("landing.jha.load.inputLabel")}</label>
            <input
              id="load-id"
              aria-invalid={Boolean(loadError)}
              value={loadId}
              onChange={(event) => {
                setLoadId(event.target.value);
                setLoadError(null);
              }}
              placeholder={t("landing.jha.load.inputPlaceholder")}
            />
            {loadError && <p className="form-error">{loadError}</p>}
          </div>
          <div className="landing-card__actions">
            <button type="submit" className="btn-outline" disabled={!loadId.trim()}>
              {t("landing.jha.load.action")}
            </button>
          </div>
        </form>

        <form id="create-card" className="landing-card app-panel card" onSubmit={onCreateCase}>
          <div className="landing-card__header">
            <p className="text-label">{t("landing.jha.create.label")}</p>
            <h2>{t("landing.jha.create.title")}</h2>
            <p>{t("landing.jha.create.subtitle")}</p>
          </div>
          <div className="landing-card__body stack">
            <label htmlFor="job-title">{t("landing.jha.create.jobTitleLabel")}</label>
            <input
              id="job-title"
              aria-invalid={Boolean(errors.jobTitle)}
              {...register("jobTitle")}
              placeholder={t("landing.jha.create.jobTitlePlaceholder")}
            />
            {errors.jobTitle && <p className="form-error">{errors.jobTitle.message}</p>}

            <details className="form-disclosure">
              <summary>{t("common.optionalDetails")}</summary>
              <div className="form-disclosure__body stack">
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
                <input
                  id="job-date"
                  type="date"
                  aria-invalid={Boolean(errors.jobDate)}
                  aria-describedby={jobDateDescribedBy}
                  {...register("jobDate")}
                  placeholder={t("landing.jha.create.jobDatePlaceholder")}
                />
                <p id={jobDateHintId} className="form-helper">
                  {t("common.dateHint")}
                </p>
                {errors.jobDate && (
                  <p id={jobDateErrorId} className="form-error">
                    {errors.jobDate.message}
                  </p>
                )}

                <label htmlFor="job-time">{t("landing.jha.create.jobTimeLabel")}</label>
                <input
                  id="job-time"
                  type="time"
                  aria-invalid={Boolean(errors.jobTime)}
                  aria-describedby={jobTimeDescribedBy}
                  {...register("jobTime")}
                  placeholder={t("landing.jha.create.jobTimePlaceholder")}
                />
                <p id={jobTimeHintId} className="form-helper">
                  {t("common.timeHint")}
                </p>
                {errors.jobTime && (
                  <p id={jobTimeErrorId} className="form-error">
                    {errors.jobTime.message}
                  </p>
                )}

                <label htmlFor="revision">{t("landing.jha.create.revisionLabel")}</label>
                <input
                  id="revision"
                  {...register("revision")}
                  placeholder={t("landing.jha.create.revisionPlaceholder")}
                />

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
                  type="date"
                  aria-invalid={Boolean(errors.signoffDate)}
                  aria-describedby={signoffDateDescribedBy}
                  {...register("signoffDate")}
                  placeholder={t("landing.jha.create.signoffPlaceholder")}
                />
                <p id={signoffDateHintId} className="form-helper">
                  {t("common.dateHint")}
                </p>
                {errors.signoffDate && (
                  <p id={signoffDateErrorId} className="form-error">
                    {errors.signoffDate.message}
                  </p>
                )}

                <label htmlFor="signoff-time">{t("landing.jha.create.signoffTimeLabel")}</label>
                <input
                  id="signoff-time"
                  type="time"
                  aria-invalid={Boolean(errors.signoffTime)}
                  aria-describedby={signoffTimeDescribedBy}
                  {...register("signoffTime")}
                  placeholder={t("landing.jha.create.signoffTimePlaceholder")}
                />
                <p id={signoffTimeHintId} className="form-helper">
                  {t("common.timeHint")}
                </p>
                {errors.signoffTime && (
                  <p id={signoffTimeErrorId} className="form-error">
                    {errors.signoffTime.message}
                  </p>
                )}
              </div>
            </details>

            {serverError && <p className="form-error">{serverError}</p>}
          </div>
          <div className="landing-card__actions">
            <button type="submit" disabled={creating}>
              {creating ? t("landing.jha.create.creating") : t("landing.jha.create.action")}
            </button>
          </div>
        </form>

        <section className="landing-card app-panel card">
          <div className="landing-card__header">
            <p className="text-label">{t("landing.jha.recent.label")}</p>
            <h2>{t("landing.jha.recent.title")}</h2>
            <p>{t("landing.jha.recent.subtitle")}</p>
          </div>
          <div className="landing-card__body stack">
            {casesLoading && <p className="text-muted">{t("landing.jha.recent.loading")}</p>}
            {casesError && <p className="form-error">{casesError}</p>}
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
      <RecentCasesModal
        open={loadModalOpen}
        onClose={() => setLoadModalOpen(false)}
        title={t("landing.jha.recent.title")}
        subtitle={t("landing.jha.recent.subtitle")}
        searchPlaceholder={t("common.searchPlaceholder")}
        items={recentCases}
        loading={casesLoading}
        error={casesError}
        emptyText={t("landing.jha.recent.empty")}
        loadingText={t("landing.jha.recent.loading")}
        loadLabel={t("landing.jha.recent.load")}
        onSelect={(item) => handleLoadSaved(item.id)}
        getTitle={(item) => item.jobTitle}
        getMeta={(item) => `${item.site || t("workspace.sitePending")} · ${item.supervisor || t("workspace.supervisorPending")}`}
        getSearchText={(item) =>
          `${item.jobTitle} ${item.site ?? ""} ${item.supervisor ?? ""} ${item.id}`.trim()
        }
        getUpdatedLabel={(item) =>
          t("landing.jha.recent.updated", { values: { date: formatDateTime(item.updatedAt) } })
        }
      />
    </div>
  );
};
