import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiFetch } from "@/lib/api";
import { isValidDateTimeInput } from "@/lib/dateInputs";
import type { IncidentCaseSummary, IncidentType } from "@/types/incident";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { useI18n } from "@/i18n/I18nContext";
import { TuiAppNav } from "@/tui/components/TuiAppNav";
import { TuiEmptyState } from "@/tui/components/TuiEmptyState";
import { TuiFormField } from "@/tui/components/TuiFormField";
import { TuiHeader } from "@/tui/components/TuiHeader";
import { TuiPanel } from "@/tui/components/TuiPanel";
import { TuiShell } from "@/tui/components/TuiShell";

export const TuiIncidentLanding = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [loadId, setLoadId] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
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

  return (
    <TuiShell>
      <TuiHeader
        eyebrow={t("workspace.incidentWorkspace")}
        title={t("landing.incident.hero.title")}
        subtitle={t("landing.incident.hero.subtitleDefault")}
        actions={(
          <>
            <ThemeToggle className="tui-theme-toggle" />
            <button type="button" onClick={() => window.location.assign("/incidents")}>
              Switch to GUI
            </button>
          </>
        )}
      />
      <TuiAppNav />

      <div className="tui-content">
        <div className="tui-columns">
          <form onSubmit={handleLoad}>
            <TuiPanel
              eyebrow={t("landing.incident.load.label")}
              title={t("landing.incident.load.title")}
              subtitle={t("landing.incident.load.subtitle")}
              actions={(
                <button type="submit" disabled={!loadId.trim()}>
                  {t("landing.incident.load.action")}
                </button>
              )}
            >
              <TuiFormField label={t("landing.incident.load.inputLabel")} error={loadError}>
                <input
                  value={loadId}
                  onChange={(event) => {
                    setLoadId(event.target.value);
                    setLoadError(null);
                  }}
                  placeholder={t("landing.incident.load.inputPlaceholder")}
                />
              </TuiFormField>
            </TuiPanel>
          </form>

          <form onSubmit={onCreateIncident}>
            <TuiPanel
              eyebrow={t("landing.incident.create.label")}
              title={t("landing.incident.create.title")}
              subtitle={t("landing.incident.create.subtitle")}
              actions={(
                <button type="submit" disabled={creating}>
                  {creating ? t("landing.incident.create.creating") : t("landing.incident.create.action")}
                </button>
              )}
            >
              <div className="tui-form">
                <TuiFormField label={t("landing.incident.create.titleLabel")} error={errors.title?.message ?? null}>
                  <input {...register("title")} placeholder={t("landing.incident.create.titlePlaceholder")} />
                </TuiFormField>

                <TuiFormField label={t("landing.incident.create.typeLabel")}>
                  <select {...register("incidentType")}>
                    {Object.entries(incidentTypeLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </TuiFormField>

                <TuiFormField
                  label={t("landing.incident.create.whenLabel")}
                  error={errors.incidentAt?.message ?? null}
                >
                  <input
                    type="datetime-local"
                    {...register("incidentAt")}
                    placeholder={t("landing.incident.create.whenPlaceholder")}
                  />
                </TuiFormField>

                <TuiFormField label={t("landing.incident.create.locationLabel")}>
                  <input {...register("location")} placeholder={t("landing.incident.create.locationPlaceholder")} />
                </TuiFormField>

                <TuiFormField
                  label={t("landing.incident.create.coordinatorRoleLabel")}
                  error={errors.coordinatorRole?.message ?? null}
                >
                  <input {...register("coordinatorRole")} placeholder={t("landing.incident.create.coordinatorRolePlaceholder")} />
                </TuiFormField>
              </div>

              <details className="tui-details">
                <summary>{t("common.optionalDetails")}</summary>
                <div className="tui-form">
                  <TuiFormField label={t("landing.incident.create.whenNotesLabel")}>
                    <input {...register("incidentTimeNote")} placeholder={t("landing.incident.create.whenNotesPlaceholder")} />
                  </TuiFormField>
                  <TuiFormField label={t("landing.incident.create.coordinatorNameLabel")}>
                    <input {...register("coordinatorName")} placeholder={t("landing.incident.create.coordinatorNamePlaceholder")} />
                  </TuiFormField>
                </div>
              </details>

              {serverError && <p className="tui-muted">{serverError}</p>}
            </TuiPanel>
          </form>
        </div>

        <TuiPanel
          eyebrow={t("landing.incident.recent.label")}
          title={t("landing.incident.recent.title")}
          subtitle={t("landing.incident.recent.subtitle")}
          actions={(
            <button type="button" onClick={() => void fetchRecentCases()}>
              {t("common.refresh")}
            </button>
          )}
        >
          {casesLoading && <p className="tui-muted">{t("landing.incident.recent.loading")}</p>}
          {casesError && <p className="tui-muted">{casesError}</p>}
          {!casesLoading && recentCases.length === 0 && (
            <TuiEmptyState
              title={t("landing.incident.recent.empty")}
              description={t("landing.incident.create.subtitle")}
            />
          )}
          {recentCases.length > 0 && (
            <ul className="tui-case-list">
              {recentCases.map((entry) => (
                <li key={entry.id} className="tui-case-item">
                  <div>
                    <h3>{entry.title}</h3>
                    <p className="tui-muted">
                      {entry.location || t("workspace.locationPending")} · {incidentTypeLabels[entry.incidentType]}
                    </p>
                  </div>
                  <div className="tui-case-actions">
                    <button type="button" onClick={() => handleLoadSaved(entry.id)}>
                      {t("landing.incident.recent.load")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TuiPanel>
      </div>
    </TuiShell>
  );
};
