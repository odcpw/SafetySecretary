import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiFetch } from "@/lib/api";
import { isValidDateInput } from "@/lib/dateInputs";
import type { JhaCaseSummary } from "@/types/jha";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { useI18n } from "@/i18n/I18nContext";
import { TuiAppNav } from "@/tui/components/TuiAppNav";
import { TuiEmptyState } from "@/tui/components/TuiEmptyState";
import { TuiFormField } from "@/tui/components/TuiFormField";
import { TuiHeader } from "@/tui/components/TuiHeader";
import { TuiPanel } from "@/tui/components/TuiPanel";
import { TuiShell } from "@/tui/components/TuiShell";

export const TuiJhaLanding = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
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
        jobDate: z
          .string()
          .optional()
          .refine((value) => !value || isValidDateInput(value), {
            message: t("common.invalidDate")
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
          })
      }),
    [t]
  );

  type CreateJhaForm = z.infer<typeof createJhaSchema>;

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

  const onCreateJha = handleSubmit(async (values) => {
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
    <TuiShell>
      <TuiHeader
        eyebrow={t("workspace.jhaWorkspace")}
        title={t("landing.jha.hero.title")}
        subtitle={t("landing.jha.hero.subtitleDefault")}
        actions={(
          <>
            <ThemeToggle className="tui-theme-toggle" />
            <button type="button" onClick={() => window.location.assign("/jha")}>
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
              eyebrow={t("landing.jha.load.label")}
              title={t("landing.jha.load.title")}
              subtitle={t("landing.jha.load.subtitle")}
              actions={(
                <button type="submit" disabled={!loadId.trim()}>
                  {t("landing.jha.load.action")}
                </button>
              )}
            >
              <TuiFormField label={t("landing.jha.load.inputLabel")} error={loadError}>
                <input
                  value={loadId}
                  onChange={(event) => {
                    setLoadId(event.target.value);
                    setLoadError(null);
                  }}
                  placeholder={t("landing.jha.load.inputPlaceholder")}
                />
              </TuiFormField>
            </TuiPanel>
          </form>

          <form onSubmit={onCreateJha}>
            <TuiPanel
              eyebrow={t("landing.jha.create.label")}
              title={t("landing.jha.create.title")}
              subtitle={t("landing.jha.create.subtitle")}
              actions={(
                <button type="submit" disabled={creating}>
                  {creating ? t("landing.jha.create.creating") : t("landing.jha.create.action")}
                </button>
              )}
            >
              <div className="tui-form">
                <TuiFormField
                  label={t("landing.jha.create.jobTitleLabel")}
                  error={errors.jobTitle?.message ?? null}
                >
                  <input {...register("jobTitle")} placeholder={t("landing.jha.create.jobTitlePlaceholder")} />
                </TuiFormField>

                <TuiFormField label={t("landing.jha.create.siteLabel")}>
                  <input {...register("site")} placeholder={t("landing.jha.create.sitePlaceholder")} />
                </TuiFormField>

                <TuiFormField label={t("landing.jha.create.supervisorLabel")}>
                  <input {...register("supervisor")} placeholder={t("landing.jha.create.supervisorPlaceholder")} />
                </TuiFormField>
              </div>

              <details className="tui-details">
                <summary>{t("common.optionalDetails")}</summary>
                <div className="tui-form">
                  <TuiFormField label={t("landing.jha.create.workersLabel")}>
                    <input {...register("workersInvolved")} placeholder={t("landing.jha.create.workersPlaceholder")} />
                  </TuiFormField>
                  <TuiFormField label={t("landing.jha.create.jobDateLabel")} error={errors.jobDate?.message ?? null}>
                    <input
                      type="date"
                      {...register("jobDate")}
                      placeholder={t("landing.jha.create.jobDatePlaceholder")}
                    />
                  </TuiFormField>
                  <TuiFormField label={t("landing.jha.create.revisionLabel")}>
                    <input {...register("revision")} placeholder={t("landing.jha.create.revisionPlaceholder")} />
                  </TuiFormField>
                  <TuiFormField label={t("landing.jha.create.preparedByLabel")}>
                    <input {...register("preparedBy")} placeholder={t("landing.jha.create.preparedByPlaceholder")} />
                  </TuiFormField>
                  <TuiFormField label={t("landing.jha.create.reviewedByLabel")}>
                    <input {...register("reviewedBy")} placeholder={t("landing.jha.create.reviewedByPlaceholder")} />
                  </TuiFormField>
                  <TuiFormField label={t("landing.jha.create.approvedByLabel")}>
                    <input {...register("approvedBy")} placeholder={t("landing.jha.create.approvedByPlaceholder")} />
                  </TuiFormField>
                  <TuiFormField label={t("landing.jha.create.signoffLabel")} error={errors.signoffDate?.message ?? null}>
                    <input
                      type="date"
                      {...register("signoffDate")}
                      placeholder={t("landing.jha.create.signoffPlaceholder")}
                    />
                  </TuiFormField>
                </div>
              </details>

              {serverError && <p className="tui-muted">{serverError}</p>}
            </TuiPanel>
          </form>
        </div>

        <TuiPanel
          eyebrow={t("landing.jha.recent.label")}
          title={t("landing.jha.recent.title")}
          subtitle={t("landing.jha.recent.subtitle")}
          actions={(
            <button type="button" onClick={() => void fetchRecentCases()}>
              {t("common.refresh")}
            </button>
          )}
        >
          {casesLoading && <p className="tui-muted">{t("landing.jha.recent.loading")}</p>}
          {casesError && <p className="tui-muted">{casesError}</p>}
          {!casesLoading && recentCases.length === 0 && (
            <TuiEmptyState
              title={t("landing.jha.recent.empty")}
              description={t("landing.jha.create.subtitle")}
            />
          )}
          {recentCases.length > 0 && (
            <ul className="tui-case-list">
              {recentCases.map((entry) => (
                <li key={entry.id} className="tui-case-item">
                  <div>
                    <h3>{entry.jobTitle}</h3>
                    <p className="tui-muted">
                      {entry.site || t("workspace.sitePending")} · {entry.supervisor || t("workspace.supervisorPending")}
                    </p>
                  </div>
                  <div className="tui-case-actions">
                    <button type="button" onClick={() => handleLoadSaved(entry.id)}>
                      {t("landing.jha.recent.load")}
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
