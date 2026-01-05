import type { ProcessStep, Hazard } from "@/types/riskAssessment";

export interface HazardNumber {
  stepNum: number;
  hazardNum: number;
  display: string; // "1.1", "2.3", etc.
}

// Build a map from hazardId to its display number
export function buildHazardNumberMap(
  steps: ProcessStep[],
  hazards: Hazard[]
): Map<string, HazardNumber> {
  const map = new Map<string, HazardNumber>();

  // Sort steps by orderIndex
  const sortedSteps = [...steps].sort((a, b) => a.orderIndex - b.orderIndex);

  for (let stepIdx = 0; stepIdx < sortedSteps.length; stepIdx++) {
    const step = sortedSteps[stepIdx];
    const stepNum = stepIdx + 1;

    // Get hazards for this step, sorted by orderIndex
    const stepHazards = hazards
      .filter(h => h.stepId === step.id)
      .sort((a, b) => a.orderIndex - b.orderIndex);

    for (let hazardIdx = 0; hazardIdx < stepHazards.length; hazardIdx++) {
      const hazard = stepHazards[hazardIdx];
      const hazardNum = hazardIdx + 1;
      map.set(hazard.id, {
        stepNum,
        hazardNum,
        display: `${stepNum}.${hazardNum}`
      });
    }
  }

  return map;
}

// Get display number for a single hazard
export function getHazardNumber(
  hazardId: string,
  numberMap: Map<string, HazardNumber>
): string {
  return numberMap.get(hazardId)?.display ?? "?";
}
