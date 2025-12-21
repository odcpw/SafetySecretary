import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { RiskAssessmentCase } from "@/types/riskAssessment";
import {
  buildDefaultMatrixLabels,
  getRiskColorForAssessment,
  loadMatrixSettings
} from "@/lib/riskMatrixSettings";
import {
  SheetBody,
  SheetCell,
  SheetHead,
  SheetHeaderCell,
  SheetRow,
  SheetTable
} from "@/components/ui/SheetTable";
import { useI18n } from "@/i18n/I18nContext";

interface CaseTableViewProps {
  raCase: RiskAssessmentCase;
}

const groupHazardsByStep = (raCase: RiskAssessmentCase) => {
  return raCase.steps.map((step) => ({
    step,
    hazards: raCase.hazards
      .filter((hazard) => hazard.stepId === step.id)
      .sort((a, b) => a.orderIndex - b.orderIndex)
  }));
};

export const CaseTableView = ({ raCase }: CaseTableViewProps) => {
  const { t } = useI18n();
  const defaultLabels = useMemo(() => buildDefaultMatrixLabels(t), [t]);
  const [settings, setSettings] = useState(() => loadMatrixSettings(defaultLabels));

  useEffect(() => {
    setSettings(loadMatrixSettings(defaultLabels));
  }, [defaultLabels]);

  useEffect(() => {
    const syncSettings = () => setSettings(loadMatrixSettings(defaultLabels));
    window.addEventListener("storage", syncSettings);
    return () => window.removeEventListener("storage", syncSettings);
  }, [defaultLabels]);

  const grouped = useMemo(() => groupHazardsByStep(raCase), [raCase]);
  const actionsByHazard = useMemo(() => {
    return raCase.actions.reduce<Record<string, RiskAssessmentCase["actions"]>>((acc, action) => {
      if (!action.hazardId) {
        return acc;
      }
      acc[action.hazardId] = acc[action.hazardId] ?? [];
      acc[action.hazardId]!.push(action);
      return acc;
    }, {});
  }, [raCase.actions]);

  const renderRiskPill = (severity?: string | null, likelihood?: string | null) => {
    if (!severity || !likelihood) {
      return <span className="risk-pill muted">{t("common.noData")}</span>;
    }
    const color = getRiskColorForAssessment(severity, likelihood, settings);
    return (
      <span className="risk-pill" style={{ backgroundColor: color }}>
        {severity} × {likelihood}
      </span>
    );
  };

  return (
    <div className="case-table">
      <SheetTable>
        <SheetHead>
          <SheetRow>
            <SheetHeaderCell>{t("ra.caseTable.processStep")}</SheetHeaderCell>
            <SheetHeaderCell>{t("ra.caseTable.severity")}</SheetHeaderCell>
            <SheetHeaderCell>{t("ra.caseTable.likelihood")}</SheetHeaderCell>
            <SheetHeaderCell>{t("ra.caseTable.risk")}</SheetHeaderCell>
            <SheetHeaderCell>{t("ra.caseTable.controls")}</SheetHeaderCell>
            <SheetHeaderCell>{t("ra.caseTable.residualSeverity")}</SheetHeaderCell>
            <SheetHeaderCell>{t("ra.caseTable.residualLikelihood")}</SheetHeaderCell>
            <SheetHeaderCell>{t("ra.caseTable.residualRisk")}</SheetHeaderCell>
            <SheetHeaderCell>{t("ra.caseTable.monitoring")}</SheetHeaderCell>
          </SheetRow>
        </SheetHead>
        <SheetBody>
          {grouped.map(({ step, hazards }) => (
            <FragmentStepRows
              key={step.id}
              step={step}
              hazards={hazards}
              renderRiskPill={renderRiskPill}
              actionsByHazard={actionsByHazard}
            />
          ))}
        </SheetBody>
      </SheetTable>
    </div>
  );
};

interface FragmentProps {
  step: RiskAssessmentCase["steps"][number];
  hazards: RiskAssessmentCase["hazards"];
  renderRiskPill: (severity?: string | null, likelihood?: string | null) => ReactNode;
  actionsByHazard: Record<string, RiskAssessmentCase["actions"]>;
}

const FragmentStepRows = ({ step, hazards, renderRiskPill, actionsByHazard }: FragmentProps) => {
  const { t, formatDate } = useI18n();

  if (hazards.length === 0) {
    return (
      <>
        <SheetRow className="step-row">
          <SheetCell colSpan={9}>
            <strong>{step.activity}</strong>
            <p>{step.description || t("ra.caseTable.noDescription")}</p>
          </SheetCell>
        </SheetRow>
        <SheetRow className="hazard-row empty">
          <SheetCell colSpan={9}>{t("ra.caseTable.noHazards")}</SheetCell>
        </SheetRow>
      </>
    );
  }

  return (
    <>
      <SheetRow className="step-row">
        <SheetCell colSpan={9}>
          <strong>{step.activity}</strong>
          <p>{step.description || t("ra.caseTable.noDescription")}</p>
        </SheetCell>
      </SheetRow>
      {hazards.map((hazard) => (
        <SheetRow key={hazard.id} className="hazard-row">
          <SheetCell>
            <div className="hazard-label">
              <strong>{hazard.label}</strong>
              {hazard.description && <p>{hazard.description}</p>}
            </div>
          </SheetCell>
          <SheetCell>{hazard.baseline?.severity ?? t("common.noData")}</SheetCell>
          <SheetCell>{hazard.baseline?.likelihood ?? t("common.noData")}</SheetCell>
          <SheetCell>{renderRiskPill(hazard.baseline?.severity, hazard.baseline?.likelihood)}</SheetCell>
          <SheetCell>
            {(() => {
              const existing = hazard.existingControls ?? [];
              const proposed = hazard.proposedControls ?? [];
              if (existing.length === 0 && proposed.length === 0) {
                return t("ra.caseTable.noControls");
              }
              const allControls = [
                ...existing,
                ...proposed.map((c) => c.description)
              ];
              return allControls.join("; ");
            })()}
          </SheetCell>
          <SheetCell>{hazard.residual?.severity ?? t("common.noData")}</SheetCell>
          <SheetCell>{hazard.residual?.likelihood ?? t("common.noData")}</SheetCell>
          <SheetCell>{renderRiskPill(hazard.residual?.severity, hazard.residual?.likelihood)}</SheetCell>
          <SheetCell>
            <ul className="monitoring-list">
              {(actionsByHazard[hazard.id] ?? []).map((action) => (
                <li key={action.id}>
                  <strong>{action.description}</strong>
                  <span>
                    {action.owner || t("ra.caseTable.unassigned")} ·{" "}
                    {action.dueDate ? formatDate(action.dueDate) : t("ra.caseTable.noDueDate")}
                  </span>
                </li>
              ))}
              {(!actionsByHazard[hazard.id] || actionsByHazard[hazard.id]!.length === 0) && <li>{t("common.noData")}</li>}
            </ul>
          </SheetCell>
        </SheetRow>
      ))}
    </>
  );
};
