import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PhaseRiskRating } from "../PhaseRiskRating";
import type { RiskAssessmentCase } from "@/types/riskAssessment";

const buildCase = (): RiskAssessmentCase => ({
  id: "case-1",
  createdAt: new Date().toISOString(),
  createdBy: null,
  activityName: "Demo",
  location: null,
  team: null,
  phase: "RISK_RATING",
  steps: [
    { id: "step-1", activity: "Prep area", equipment: [], substances: [], description: null, orderIndex: 0 },
    { id: "step-2", activity: "Clean up", equipment: [], substances: [], description: null, orderIndex: 1 }
  ],
  hazards: [
    {
      id: "haz-1",
      label: "Slip on wet floor",
      description: "Water after wash",
      baseline: { severity: "MEDIUM", likelihood: "LIKELY", riskRating: "MEDIUM_LIKELY" },
      residual: undefined,
      existingControls: [],
      proposedControls: [],
      stepIds: ["step-1"],
      stepOrder: { "step-1": 0 }
    },
    {
      id: "haz-2",
      label: "Chemical splash",
      description: null,
      baseline: { severity: "HIGH", likelihood: "POSSIBLE", riskRating: "HIGH_POSSIBLE" },
      residual: undefined,
      existingControls: [],
      proposedControls: [],
      stepIds: ["step-2"],
      stepOrder: { "step-2": 0 }
    }
  ],
  actions: []
});

describe("PhaseRiskRating", () => {
  it("groups hazards by step", () => {
    const mockNext = vi.fn();
    render(
      <PhaseRiskRating
        raCase={buildCase()}
        saving={false}
        onSaveRiskRatings={vi.fn()}
        onNext={mockNext}
      />
    );

    expect(screen.getAllByText("Prep area").length).toBeGreaterThan(0); // activity name
    expect(screen.getByText(/Slip on wet floor/i)).toBeInTheDocument();
    expect(screen.getAllByText("Clean up").length).toBeGreaterThan(0);
    expect(screen.getByText(/Chemical splash/i)).toBeInTheDocument();
  });
});
