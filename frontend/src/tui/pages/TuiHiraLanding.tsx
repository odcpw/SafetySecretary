import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiFetch } from "@/lib/api";
import type { RiskAssessmentCaseSummary } from "@/types/riskAssessment";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { useI18n } from "@/i18n/I18nContext";
import { TuiAppNav } from "@/tui/components/TuiAppNav";
import { TuiEmptyState } from "@/tui/components/TuiEmptyState";
import { TuiFormField } from "@/tui/components/TuiFormField";
import { TuiHeader } from "@/tui/components/TuiHeader";
import { TuiPanel } from "@/tui/components/TuiPanel";
import { TuiShell } from "@/tui/components/TuiShell";
import { useConfirmDialog } from "@/hooks/useConfirmDialog";

export const TuiHiraLanding = () => {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [loadId, setLoadId] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const [recentCases, setRecentCases] = useState<RiskAssessmentCaseSummary[]>([]);
  const [casesError, setCasesError] = useState<string | null>(null);
  const [casesLoading, setCasesLoading] = useState(false);
  const { confirm, dialog } = useConfirmDialog();

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

  const handleRemoveSaved = async (entry: RiskAssessmentCaseSummary) => {
    const ok = await confirm({
      title: t("common.delete"),
      description: t("landing.hira.confirmDelete", { values: { name: entry.activityName } }),
      confirmLabel: t("common.delete"),
      cancelLabel: t("common.cancel"),
      tone: "danger"
    });
    if (!ok) return;
    const response = await apiFetch(`/api/ra-cases/${encodeURIComponent(entry.id)}`, { method: "DELETE" });
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
    <TuiShell>
      <TuiHeader
        eyebrow={t("workspace.hiraWorkspace")}
        title={t("landing.hira.hero.title")}
        subtitle={t("landing.hira.hero.subtitleDefault")}
        actions={(
          <>
            <ThemeToggle className="tui-theme-toggle" />
            <button type="button" onClick={() => window.location.assign("/hira")}>
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
              eyebrow={t("landing.hira.load.label")}
              title={t("landing.hira.load.title")}
              subtitle={t("landing.hira.load.subtitle")}
              actions={(
                <button type="submit" disabled={!loadId.trim()}>
                  {t("landing.hira.load.action")}
                </button>
              )}
            >
              <TuiFormField label={t("landing.hira.load.inputLabel")} error={loadError}>
                <input
                  value={loadId}
                  onChange={(event) => {
                    setLoadId(event.target.value);
                    setLoadError(null);
                  }}
                  placeholder={t("landing.hira.load.inputPlaceholder")}
                />
              </TuiFormField>
            </TuiPanel>
          </form>

          <form onSubmit={onCreateCase}>
            <TuiPanel
              eyebrow={t("landing.hira.create.label")}
              title={t("landing.hira.create.title")}
              subtitle={t("landing.hira.create.subtitle")}
              actions={(
                <button type="submit" disabled={creating}>
                  {creating ? t("landing.hira.create.creating") : t("landing.hira.create.action")}
                </button>
              )}
            >
              <div className="tui-form">
                <TuiFormField
                  label={t("landing.hira.create.activityLabel")}
                  error={errors.activityName?.message ?? null}
                >
                  <input {...register("activityName")} placeholder={t("landing.hira.create.activityPlaceholder")} />
                </TuiFormField>

                <TuiFormField label={t("landing.hira.create.locationLabel")}>
                  <input {...register("location")} placeholder={t("landing.hira.create.locationPlaceholder")} />
                </TuiFormField>

                <TuiFormField label={t("landing.hira.create.teamLabel")} error={serverError}>
                  <input {...register("team")} placeholder={t("landing.hira.create.teamPlaceholder")} />
                </TuiFormField>
              </div>
            </TuiPanel>
          </form>
        </div>

        <TuiPanel
          eyebrow={t("landing.hira.recent.label")}
          title={t("landing.hira.recent.title")}
          subtitle={t("landing.hira.recent.subtitle")}
          actions={(
            <button type="button" onClick={() => void fetchRecentCases()}>
              {t("common.refresh")}
            </button>
          )}
        >
          {casesLoading && <p className="tui-muted">{t("landing.hira.recent.loading")}</p>}
          {casesError && <p className="tui-muted">{casesError}</p>}
          {!casesLoading && recentCases.length === 0 && (
            <TuiEmptyState
              title={t("landing.hira.recent.empty")}
              description={t("landing.hira.create.subtitle")}
            />
          )}
          {recentCases.length > 0 && (
            <ul className="tui-case-list">
              {recentCases.map((entry) => (
                <li key={entry.id} className="tui-case-item">
                  <div>
                    <h3>{entry.activityName}</h3>
                    <p className="tui-muted">
                      {entry.location || t("workspace.locationPending")} · {entry.team || t("workspace.teamPending")}
                    </p>
                  </div>
                  <div className="tui-case-actions">
                    <button type="button" onClick={() => handleLoadSaved(entry.id)}>
                      {t("landing.hira.recent.load")}
                    </button>
                    <button type="button" className="tui-danger" onClick={() => void handleRemoveSaved(entry)}>
                      {t("landing.hira.recent.delete")}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TuiPanel>
      </div>
      {dialog}
    </TuiShell>
  );
};
