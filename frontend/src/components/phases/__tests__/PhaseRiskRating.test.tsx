import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PhaseRiskRating } from "../PhaseRiskRating";
import type { RiskAssessmentCase } from "@/types/riskAssessment";
import { I18nProvider } from "@/i18n/I18nContext";

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
      stepId: "step-1",
      orderIndex: 0,
      label: "Slip on wet floor",
      description: "Water after wash",
      baseline: { severity: "C", likelihood: "2", riskRating: "Moderate Risk" },
      residual: undefined,
      existingControls: [],
      proposedControls: [],
      categoryCode: null
    },
    {
      id: "haz-2",
      stepId: "step-2",
      orderIndex: 0,
      label: "Chemical splash",
      description: null,
      baseline: { severity: "B", likelihood: "3", riskRating: "Moderate Risk" },
      residual: undefined,
      existingControls: [],
      proposedControls: [],
      categoryCode: null
    }
  ],
  actions: []
});

describe("PhaseRiskRating", () => {
  it("groups hazards by step", () => {
    const mockNext = vi.fn();
    render(
      <I18nProvider>
        <PhaseRiskRating
          raCase={buildCase()}
          saving={false}
          onSaveRiskRatings={vi.fn()}
          onUpdateHazard={vi.fn()}
          onNext={mockNext}
        />
      </I18nProvider>
    );

    expect(screen.getAllByText("Prep area").length).toBeGreaterThan(0); // activity name
    expect(screen.getByText(/Slip on wet floor/i)).toBeInTheDocument();
    expect(screen.getAllByText("Clean up").length).toBeGreaterThan(0);
    expect(screen.getByText(/Chemical splash/i)).toBeInTheDocument();
  });

  it("sends a clear payload when ratings are reset", async () => {
    const user = userEvent.setup();
    const onSaveRiskRatings = vi.fn().mockResolvedValue(undefined);
    render(
      <I18nProvider>
        <PhaseRiskRating
          raCase={buildCase()}
          saving={false}
          onSaveRiskRatings={onSaveRiskRatings}
          onUpdateHazard={vi.fn()}
          onNext={vi.fn()}
        />
      </I18nProvider>
    );

    const severitySelects = screen.getAllByLabelText("Severity");
    const likelihoodSelects = screen.getAllByLabelText("Likelihood");

    await user.selectOptions(severitySelects[0]!, "");
    await user.selectOptions(likelihoodSelects[0]!, "");

    await waitFor(() => {
      expect(onSaveRiskRatings).toHaveBeenCalledWith([
        { hazardId: "haz-1", severity: "", likelihood: "" }
      ]);
    });
  });
});
