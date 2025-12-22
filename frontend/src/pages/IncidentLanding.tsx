import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { UserMenu } from "@/components/common/UserMenu";
import { RecentCasesModal } from "@/components/common/RecentCasesModal";
import { apiFetch } from "@/lib/api";
import { isValidDateTimeInput } from "@/lib/dateInputs";
import type { IncidentCaseSummary, IncidentType } from "@/types/incident";
import { useI18n } from "@/i18n/I18nContext";

export const IncidentLanding = () => {
  const navigate = useNavigate();
  const { t, formatDateTime } = useI18n();
  const [loadId, setLoadId] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadModalOpen, setLoadModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const [recentCases, setRecentCases] = useState<IncidentCaseSummary[]>([]);
  const [casesError, setCasesError] = useState<string | null>(null);
  const [casesLoading, setCasesLoading] = useState(false);

  const createIncidentSchema = useMemo(
    () =>
      z.object({
        title: z.string().min(1, t("landing.incident.errors.titleRequired")),
        incidentAt: z
          .string()
          .optional()
          .refine((value) => !value || isValidDateTimeInput(value), {
            message: t("common.invalidDateTime")
          }),
        incidentTimeNote: z.string().optional(),
        location: z.string().optional(),
        incidentType: z.enum(["NEAR_MISS", "FIRST_AID", "LOST_TIME", "PROPERTY_DAMAGE"]),
        coordinatorRole: z.string().min(1, t("landing.incident.errors.coordinatorRequired")),
        coordinatorName: z.string().optional()
      }),
    [t]
  );

  type CreateIncidentForm = z.infer<typeof createIncidentSchema>;

  const incidentTypeLabels: Record<IncidentType, string> = {
    NEAR_MISS: t("incident.types.nearMiss"),
    FIRST_AID: t("incident.types.firstAid"),
    LOST_TIME: t("incident.types.lostTime"),
    PROPERTY_DAMAGE: t("incident.types.propertyDamage")
  };

  const titleSubtitle = useMemo(() => {
    if (!loadId) {
      return t("landing.incident.hero.subtitleDefault");
    }
    return t("landing.incident.hero.subtitleReady", { values: { id: loadId } });
  }, [loadId, t]);

  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<CreateIncidentForm>({
    resolver: zodResolver(createIncidentSchema),
    defaultValues: {
      title: "",
      incidentAt: "",
      incidentTimeNote: "",
      location: "",
      incidentType: "NEAR_MISS",
      coordinatorRole: "",
      coordinatorName: ""
    }
  });

  const handleLoad = (event: React.FormEvent) => {
    event.preventDefault();
    if (!loadId.trim()) {
      setLoadError(t("landing.incident.errors.missingId"));
      return;
    }
    navigate(`/incidents/${encodeURIComponent(loadId.trim())}`);
  };

  const onCreateIncident = handleSubmit(async (values) => {
    setCreating(true);
    setServerError(null);
    try {
      const response = await apiFetch("/api/incident-cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values)
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || t("landing.incident.errors.createFailed"));
      }
      const data = await response.json();
      navigate(`/incidents/${data.id}`);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : t("landing.incident.errors.createFailed"));
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
      const response = await apiFetch("/api/incident-cases?limit=20");
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const data = (await response.json()) as { cases: IncidentCaseSummary[] };
      setRecentCases(data.cases ?? []);
    } catch (error) {
      setCasesError(error instanceof Error ? error.message : t("landing.incident.errors.loadFailed"));
    } finally {
      setCasesLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void fetchRecentCases();
  }, [fetchRecentCases]);

  const handleLoadSaved = (id: string) => {
    navigate(`/incidents/${encodeURIComponent(id)}`);
  };

  const incidentAtHintId = "incident-at-hint";
  const incidentAtErrorId = errors.incidentAt ? "incident-at-error" : undefined;
  const incidentAtDescribedBy =
    [incidentAtHintId, incidentAtErrorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="landing-shell">
      <section className="landing-hero">
        <div className="landing-hero__inner">
          <div className="landing-hero__header">
            <p className="text-label">{t("common.appName")}</p>
            <div className="landing-hero__meta">
              <button type="button" className="btn-outline" onClick={() => window.location.assign("/tui/incidents")}>
                Switch to TUI
              </button>
              <ThemeToggle />
              <UserMenu />
            </div>
          </div>
          <h1>{t("landing.incident.hero.title")}</h1>
          <p>{titleSubtitle}</p>
          <div className="landing-hero__actions">
            <button type="button" onClick={() => scrollTo("create-card")}>
              {t("landing.incident.hero.primaryAction")}
            </button>
            <button type="button" className="btn-outline" onClick={() => scrollTo("load-card")}>
              {t("landing.incident.hero.secondaryAction")}
            </button>
          </div>
        </div>
      </section>

      <main className="landing-panels grid-auto-wide">
        <form id="load-card" className="landing-card app-panel card" onSubmit={handleLoad}>
          <div className="landing-card__header">
            <p className="text-label">{t("landing.incident.load.label")}</p>
            <h2>{t("landing.incident.load.title")}</h2>
            <p>{t("landing.incident.load.subtitle")}</p>
          </div>
          <div className="landing-card__body stack">
            <button type="button" onClick={() => setLoadModalOpen(true)}>
              {t("common.browseCases")}
            </button>
            <label htmlFor="load-id">{t("landing.incident.load.inputLabel")}</label>
            <input
              id="load-id"
              aria-invalid={Boolean(loadError)}
              value={loadId}
              onChange={(event) => {
                setLoadId(event.target.value);
                setLoadError(null);
              }}
              placeholder={t("landing.incident.load.inputPlaceholder")}
            />
            {loadError && <p className="form-error">{loadError}</p>}
          </div>
          <div className="landing-card__actions">
            <button type="submit" className="btn-outline" disabled={!loadId.trim()}>
              {t("landing.incident.load.action")}
            </button>
          </div>
        </form>

        <form id="create-card" className="landing-card app-panel card" onSubmit={onCreateIncident}>
          <div className="landing-card__header">
            <p className="text-label">{t("landing.incident.create.label")}</p>
            <h2>{t("landing.incident.create.title")}</h2>
            <p>{t("landing.incident.create.subtitle")}</p>
          </div>
          <div className="landing-card__body stack">
            <label htmlFor="incident-title">{t("landing.incident.create.titleLabel")}</label>
            <input
              id="incident-title"
              aria-invalid={Boolean(errors.title)}
              {...register("title")}
              placeholder={t("landing.incident.create.titlePlaceholder")}
            />
            {errors.title && <p className="form-error">{errors.title.message}</p>}

            <label htmlFor="incident-type">{t("landing.incident.create.typeLabel")}</label>
            <select id="incident-type" {...register("incidentType")}>
              {Object.entries(incidentTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <label htmlFor="coordinator-role">{t("landing.incident.create.coordinatorRoleLabel")}</label>
            <input
              id="coordinator-role"
              aria-invalid={Boolean(errors.coordinatorRole)}
              {...register("coordinatorRole")}
              placeholder={t("landing.incident.create.coordinatorRolePlaceholder")}
            />
            {errors.coordinatorRole && <p className="form-error">{errors.coordinatorRole.message}</p>}

            <details className="form-disclosure">
              <summary>{t("common.optionalDetails")}</summary>
              <div className="form-disclosure__body stack">
                <label htmlFor="incident-at">{t("landing.incident.create.whenLabel")}</label>
                <input
                  id="incident-at"
                  type="datetime-local"
                  aria-invalid={Boolean(errors.incidentAt)}
                  aria-describedby={incidentAtDescribedBy}
                  {...register("incidentAt")}
                  placeholder={t("landing.incident.create.whenPlaceholder")}
                />
                <p id={incidentAtHintId} className="form-helper">
                  {t("common.dateTimeHint")}
                </p>
                {errors.incidentAt && (
                  <p id={incidentAtErrorId} className="form-error">
                    {errors.incidentAt.message}
                  </p>
                )}

                <label htmlFor="incident-note">{t("landing.incident.create.whenNotesLabel")}</label>
                <input
                  id="incident-note"
                  {...register("incidentTimeNote")}
                  placeholder={t("landing.incident.create.whenNotesPlaceholder")}
                />

                <label htmlFor="incident-location">{t("landing.incident.create.locationLabel")}</label>
                <input
                  id="incident-location"
                  {...register("location")}
                  placeholder={t("landing.incident.create.locationPlaceholder")}
                />

                <label htmlFor="coordinator-name">{t("landing.incident.create.coordinatorNameLabel")}</label>
                <input
                  id="coordinator-name"
                  {...register("coordinatorName")}
                  placeholder={t("landing.incident.create.coordinatorNamePlaceholder")}
                />
              </div>
            </details>

            {serverError && <p className="form-error">{serverError}</p>}
          </div>
          <div className="landing-card__actions">
            <button type="submit" disabled={creating}>
              {creating ? t("landing.incident.create.creating") : t("landing.incident.create.action")}
            </button>
          </div>
        </form>

        <section className="landing-card app-panel card">
          <div className="landing-card__header">
            <p className="text-label">{t("landing.incident.recent.label")}</p>
            <h2>{t("landing.incident.recent.title")}</h2>
            <p>{t("landing.incident.recent.subtitle")}</p>
          </div>
          <div className="landing-card__body stack">
            {casesLoading && <p className="text-muted">{t("landing.incident.recent.loading")}</p>}
            {casesError && <p className="form-error">{casesError}</p>}
            {!casesLoading && recentCases.length === 0 && (
              <p className="text-muted">{t("landing.incident.recent.empty")}</p>
            )}
            {recentCases.length > 0 && (
              <ul className="saved-cases-list">
                {recentCases.map((entry) => (
                  <li key={entry.id} className="saved-case-item">
                    <div className="saved-case-meta">
                      <h3>{entry.title}</h3>
                      <p>
                        {entry.location || t("workspace.locationPending")} · {incidentTypeLabels[entry.incidentType]}
                      </p>
                      <span className="status-pill">
                        {t("landing.incident.recent.updated", {
                          values: { date: formatDateTime(entry.updatedAt) }
                        })}
                      </span>
                    </div>
                    <div className="saved-case-actions">
                      <button type="button" className="btn-outline" onClick={() => handleLoadSaved(entry.id)}>
                        {t("landing.incident.recent.load")}
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
        title={t("landing.incident.recent.title")}
        subtitle={t("landing.incident.recent.subtitle")}
        searchPlaceholder={t("common.searchPlaceholder")}
        items={recentCases}
        loading={casesLoading}
        error={casesError}
        emptyText={t("landing.incident.recent.empty")}
        loadingText={t("landing.incident.recent.loading")}
        loadLabel={t("landing.incident.recent.load")}
        onSelect={(item) => handleLoadSaved(item.id)}
        getTitle={(item) => item.title}
        getMeta={(item) =>
          `${item.location || t("workspace.locationPending")} · ${incidentTypeLabels[item.incidentType]}`
        }
        getSearchText={(item) =>
          `${item.title} ${item.location ?? ""} ${incidentTypeLabels[item.incidentType]} ${item.id}`.trim()
        }
        getUpdatedLabel={(item) =>
          t("landing.incident.recent.updated", { values: { date: formatDateTime(item.updatedAt) } })
        }
      />
    </div>
  );
};
