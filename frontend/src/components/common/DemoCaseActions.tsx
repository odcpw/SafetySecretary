import { useState } from "react";
import { useI18n } from "@/i18n/I18nContext";
import { apiFetch } from "@/lib/api";

type DemoCaseKind = "ra" | "jha" | "incident";

const createPayloads: Record<DemoCaseKind, Record<string, unknown>> = {
  ra: {
    activityName: "Demo risk assessment",
    location: "Test area",
    team: "Demo team"
  },
  jha: {
    jobTitle: "Demo JHA walkthrough",
    site: "Test site"
  },
  incident: {
    title: "Demo incident case",
    incidentType: "NEAR_MISS",
    coordinatorRole: "Supervisor"
  }
};

const createEndpoints: Record<DemoCaseKind, string> = {
  ra: "/api/ra-cases",
  jha: "/api/jha-cases",
  incident: "/api/incident-cases"
};

const seedEndpoints: Record<DemoCaseKind, string> = {
  ra: "/api/demo/seed/ra",
  jha: "/api/demo/seed/jha",
  incident: "/api/demo/seed/incident"
};

type DemoCaseActionsProps = {
  kind: DemoCaseKind;
  onCreated: (id: string) => void;
};

export const DemoCaseActions = ({ kind, onCreated }: DemoCaseActionsProps) => {
  const { t } = useI18n();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const runAction = async (mode: "create" | "seed") => {
    setBusy(true);
    setStatus(mode === "seed" ? t("shell.demoSeeding") : t("shell.demoCreating"));
    try {
      const endpoint = mode === "seed" ? seedEndpoints[kind] : createEndpoints[kind];
      const payload = mode === "seed" ? null : createPayloads[kind];
      const response = await apiFetch(endpoint, {
        method: "POST",
        headers: payload ? { "Content-Type": "application/json" } : undefined,
        body: payload ? JSON.stringify(payload) : undefined
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || t("shell.demoFailed"));
      }
      const caseId = typeof data?.id === "string" ? data.id : null;
      if (!caseId) {
        throw new Error(t("shell.demoFailed"));
      }
      onCreated(caseId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t("shell.demoFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="demo-case-actions">
      <p className="text-sm text-slate-600">{t("shell.demoHint")}</p>
      <div className="demo-case-actions__buttons">
        <button type="button" className="btn-outline" onClick={() => runAction("create")} disabled={busy}>
          {t("shell.demoCreate")}
        </button>
        <button type="button" className="btn-primary" onClick={() => runAction("seed")} disabled={busy}>
          {t("shell.demoSeed")}
        </button>
      </div>
      {status && <span className="text-sm text-slate-500">{status}</span>}
    </div>
  );
};
