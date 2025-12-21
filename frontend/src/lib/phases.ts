/**
 * Phase definitions for HIRA workflow.
 * Defines the ordered steps in the risk assessment process.
 */

import type { Phase } from "@/types/riskAssessment";

export interface PhaseMeta {
  id: Phase;
  label: string;
  description: string;
  labelKey: string;
  descriptionKey: string;
}

export const PHASES: PhaseMeta[] = [
  {
    id: "PROCESS_STEPS",
    label: "Process Description",
    description: "Describe the work process: activities, equipment, and substances involved.",
    labelKey: "phases.processDescription",
    descriptionKey: "phases.processDescriptionDetail"
  },
  {
    id: "HAZARD_IDENTIFICATION",
    label: "Hazard Identification",
    description: "Identify hazards for each step, including what can go wrong and existing controls.",
    labelKey: "phases.hazardIdentification",
    descriptionKey: "phases.hazardIdentificationDetail"
  },
  {
    id: "RISK_RATING",
    label: "Baseline Risk Assessment",
    description: "Rate current risk based on adherence to existing controls.",
    labelKey: "phases.baselineRisk",
    descriptionKey: "phases.baselineRiskDetail"
  },
  {
    id: "CONTROL_DISCUSSION",
    label: "Controls & Residual Risk",
    description: "Propose additional controls and rate the expected (residual) risk after they are implemented.",
    labelKey: "phases.controlsResidual",
    descriptionKey: "phases.controlsResidualDetail"
  },
  {
    id: "ACTIONS",
    label: "Action Plan",
    description: "Structure proposed controls into actionable tasks with owners and deadlines.",
    labelKey: "phases.actionPlan",
    descriptionKey: "phases.actionPlanDetail"
  },
  {
    id: "COMPLETE",
    label: "Complete",
    description: "Assessment complete. Read-only archive.",
    labelKey: "phases.complete",
    descriptionKey: "phases.completeDetail"
  }
];

/**
 * Get phase metadata by ID.
 */
export function getPhaseById(id: Phase): PhaseMeta | undefined {
  return PHASES.find((phase) => phase.id === id);
}

/**
 * Get the index of a phase in the workflow.
 */
export function getPhaseIndex(id: Phase): number {
  return PHASES.findIndex((phase) => phase.id === id);
}
