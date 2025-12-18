/**
 * Frontend types for risk assessment workflow.
 * Mirrors the backend data model for the HIRA process.
 */

// Phase progression for HIRA workflow
export type Phase =
  | "PROCESS_STEPS"           // 1. Describe process: activity + equipment + substances
  | "HAZARD_IDENTIFICATION"   // 2. Identify hazards per step + existing controls
  | "RISK_RATING"             // 3. Baseline risk assessment (adherence to existing controls)
  | "CONTROL_DISCUSSION"      // 4. Discuss possible additional controls
  | "ACTIONS"                 // 5. Structure controls into action plan
  | "RESIDUAL_RISK"           // 6. Rate risk after proposed controls
  | "COMPLETE";               // Final state

// S-T-O-P control hierarchy (effectiveness: high to low)
export type ControlHierarchy = "SUBSTITUTION" | "TECHNICAL" | "ORGANIZATIONAL" | "PPE";

// Process step with HIRA triad: activity + equipment + substances
export interface ProcessStep {
  id: string;
  activity: string;           // What is being done
  equipment: string[];        // Tools/machines used
  substances: string[];       // Materials/chemicals involved
  description: string | null;
  orderIndex: number;
}

export interface EditableProcessStep extends Partial<ProcessStep> {
  activity: string;
  equipment?: string[];
  substances?: string[];
  description?: string | null;
  orderIndex?: number;
}

export interface HazardAssessmentSnapshot {
  severity?: SeverityChoice;
  likelihood?: LikelihoodChoice;
  riskRating?: string | null;
}

// Proposed control from control discussion phase
export interface ProposedControl {
  id: string;
  description: string;
  hierarchy?: ControlHierarchy | null;
}

// Hazard with category classification and existing controls
export interface Hazard {
  id: string;
  stepId: string;
  orderIndex: number;
  label: string;
  description: string | null;
  categoryCode?: string | null;         // Category code (e.g., "MECHANICAL", "FALLS")
  existingControls: string[];           // Controls already in place
  proposedControls: ProposedControl[];  // New controls from discussion phase
  baseline?: HazardAssessmentSnapshot;
  residual?: HazardAssessmentSnapshot;
}

export type SeverityChoice = "A" | "B" | "C" | "D" | "E";
export type LikelihoodChoice = "1" | "2" | "3" | "4" | "5";

export type ActionStatus = "OPEN" | "IN_PROGRESS" | "COMPLETE";

export interface CorrectiveAction {
  id: string;
  hazardId: string | null;
  description: string;
  owner: string | null;
  dueDate: string | null;
  status: ActionStatus;
}

export interface RiskAssessmentCase {
  id: string;
  createdAt: string;
  createdBy: string | null;
  activityName: string;
  location: string | null;
  team: string | null;
  phase: Phase;
  steps: ProcessStep[];
  hazards: Hazard[];
  actions: CorrectiveAction[];
}

export interface RiskAssessmentCaseSummary {
  id: string;
  activityName: string;
  location: string | null;
  team: string | null;
  phase: Phase;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}
