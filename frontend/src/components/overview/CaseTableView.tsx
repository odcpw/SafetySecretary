import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { RiskAssessmentCase } from "@/types/riskAssessment";
import {
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
  const [settings] = useState(() => loadMatrixSettings());

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
      return <span className="risk-pill muted">—</span>;
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
            <SheetHeaderCell>Process step / Hazard</SheetHeaderCell>
            <SheetHeaderCell>Severity</SheetHeaderCell>
            <SheetHeaderCell>Likelihood</SheetHeaderCell>
            <SheetHeaderCell>Risk</SheetHeaderCell>
            <SheetHeaderCell>Controls</SheetHeaderCell>
            <SheetHeaderCell>Residual severity</SheetHeaderCell>
            <SheetHeaderCell>Residual likelihood</SheetHeaderCell>
            <SheetHeaderCell>Residual risk</SheetHeaderCell>
            <SheetHeaderCell>Monitoring</SheetHeaderCell>
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
  if (hazards.length === 0) {
    return (
      <>
        <SheetRow className="step-row">
          <SheetCell colSpan={9}>
            <strong>{step.activity}</strong>
            <p>{step.description || "No description provided."}</p>
          </SheetCell>
        </SheetRow>
        <SheetRow className="hazard-row empty">
          <SheetCell colSpan={9}>No hazards linked to this step.</SheetCell>
        </SheetRow>
      </>
    );
  }

  return (
    <>
      <SheetRow className="step-row">
        <SheetCell colSpan={9}>
          <strong>{step.activity}</strong>
          <p>{step.description || "No description provided."}</p>
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
          <SheetCell>{hazard.baseline?.severity ?? "—"}</SheetCell>
          <SheetCell>{hazard.baseline?.likelihood ?? "—"}</SheetCell>
          <SheetCell>{renderRiskPill(hazard.baseline?.severity, hazard.baseline?.likelihood)}</SheetCell>
          <SheetCell>
            {(() => {
              const existing = hazard.existingControls ?? [];
              const proposed = hazard.proposedControls ?? [];
              if (existing.length === 0 && proposed.length === 0) {
                return "No controls captured.";
              }
              const allControls = [
                ...existing,
                ...proposed.map((c) => c.description)
              ];
              return allControls.join("; ");
            })()}
          </SheetCell>
          <SheetCell>{hazard.residual?.severity ?? "—"}</SheetCell>
          <SheetCell>{hazard.residual?.likelihood ?? "—"}</SheetCell>
          <SheetCell>{renderRiskPill(hazard.residual?.severity, hazard.residual?.likelihood)}</SheetCell>
          <SheetCell>
            <ul className="monitoring-list">
              {(actionsByHazard[hazard.id] ?? []).map((action) => (
                <li key={action.id}>
                  <strong>{action.description}</strong>
                  <span>
                    {action.owner || "Unassigned"} ·{" "}
                    {action.dueDate ? new Date(action.dueDate).toLocaleDateString() : "No due date"}
                  </span>
                </li>
              ))}
              {(!actionsByHazard[hazard.id] || actionsByHazard[hazard.id]!.length === 0) && <li>—</li>}
            </ul>
          </SheetCell>
        </SheetRow>
      ))}
    </>
  );
};
