import type { TemplateLikelihoodLevel, TemplateSeverityLevel } from "./templateRisk";

// Phase progression for HIRA workflow
export enum RiskAssessmentPhase {
  PROCESS_STEPS = "PROCESS_STEPS",           // 1. Describe process: activity + equipment + substances
  HAZARD_IDENTIFICATION = "HAZARD_IDENTIFICATION", // 2. Identify hazards per step + existing controls
  RISK_RATING = "RISK_RATING",               // 3. Baseline risk assessment
  CONTROL_DISCUSSION = "CONTROL_DISCUSSION", // 4. Discuss possible additional controls
  ACTIONS = "ACTIONS",                       // 5. Structure controls into action plan
  RESIDUAL_RISK = "RESIDUAL_RISK",           // 6. Rate risk after proposed controls
  COMPLETE = "COMPLETE"                      // Final state
}

// S-T-O-P control hierarchy (effectiveness: high to low)
export enum ControlHierarchy {
  SUBSTITUTION = "SUBSTITUTION",     // S - Replace the hazard entirely
  TECHNICAL = "TECHNICAL",           // T - Engineering controls
  ORGANIZATIONAL = "ORGANIZATIONAL", // O - Procedures, training, supervision
  PPE = "PPE"                        // P - Personal protective equipment
}

export type SeverityLevel = TemplateSeverityLevel;
export type LikelihoodLevel = TemplateLikelihoodLevel;

// Process step input with HIRA triad: activity + equipment + substances
export interface ProcessStepInput {
  id?: string;
  activity: string;           // What is being done
  equipment?: string[];       // Tools/machines used
  substances?: string[];      // Materials/chemicals involved
  description?: string | null;
  orderIndex?: number;
}

// Hazard input with category and existing controls
export interface HazardInput {
  label: string;
  description?: string | null;
  categoryCode?: string | null;      // Category code (e.g., "MECHANICAL", "FALLS")
  existingControls?: string[];       // Controls already in place
  stepId?: string;
}

export interface HazardRatingInput {
  hazardId: string;
  severity: SeverityLevel;
  likelihood: LikelihoodLevel;
}

// Proposed control input (from control discussion phase)
export interface ProposedControlInput {
  hazardId: string;
  description: string;
  hierarchy?: ControlHierarchy | null;
}

export interface ResidualRiskInput {
  hazardId: string;
  severity: SeverityLevel;
  likelihood: LikelihoodLevel;
}

export interface ActionInput {
  hazardId: string;
  description: string;
  owner?: string;
  dueDate?: string;
}

export interface CreateRiskAssessmentInput {
  activityName: string;
  location?: string;
  team?: string;
  createdBy?: string;
}

export interface HazardAssessmentSnapshot {
  severity: SeverityLevel;
  likelihood: LikelihoodLevel;
  riskRating: string;
}
