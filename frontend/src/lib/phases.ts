/**
 * Phase definitions for HIRA workflow.
 * Defines the ordered steps in the risk assessment process.
 */

import type { Phase } from "@/types/riskAssessment";

export interface PhaseMeta {
  id: Phase;
  label: string;
  description: string;
}

export const PHASES: PhaseMeta[] = [
  {
    id: "PROCESS_STEPS",
    label: "Process Description",
    description: "Describe the work process: activities, equipment, and substances involved."
  },
  {
    id: "HAZARD_IDENTIFICATION",
    label: "Hazard Identification",
    description: "Identify hazards for each step, including what can go wrong and existing controls."
  },
  {
    id: "RISK_RATING",
    label: "Baseline Risk Assessment",
    description: "Rate current risk based on adherence to existing controls."
  },
  {
    id: "CONTROL_DISCUSSION",
    label: "Control Discussion",
    description: "Discuss and propose additional controls to reduce risk."
  },
  {
    id: "ACTIONS",
    label: "Action Plan",
    description: "Structure proposed controls into actionable tasks with owners and deadlines."
  },
  {
    id: "RESIDUAL_RISK",
    label: "Residual Risk",
    description: "Rate expected risk after proposed controls are implemented."
  },
  {
    id: "COMPLETE",
    label: "Complete",
    description: "Assessment complete. Read-only archive."
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
