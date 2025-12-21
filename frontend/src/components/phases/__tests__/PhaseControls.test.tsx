import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PhaseControls } from "../PhaseControls";
import type { RiskAssessmentCase } from "@/types/riskAssessment";
import { I18nProvider } from "@/i18n/I18nContext";

const buildCase = (): RiskAssessmentCase => ({
  id: "case-1",
  createdAt: new Date().toISOString(),
  createdBy: null,
  activityName: "Demo",
  location: null,
  team: null,
  phase: "CONTROLS",
  steps: [
    { id: "step-1", activity: "Prep area", equipment: [], substances: [], description: null, orderIndex: 0 }
  ],
  hazards: [
    {
      id: "haz-1",
      stepId: "step-1",
      orderIndex: 0,
      label: "Slip on wet floor",
      description: "Water after wash",
      baseline: { severity: "C", likelihood: "2", riskRating: "Moderate Risk" },
      residual: { severity: "B", likelihood: "1", riskRating: "Low Risk" },
      existingControls: [],
      proposedControls: [],
      categoryCode: null
    }
  ],
  actions: []
});

describe("PhaseControls", () => {
  it("sends a clear payload when residual ratings are reset", async () => {
    const user = userEvent.setup();
    const onSaveResidualRisk = vi.fn().mockResolvedValue(undefined);

    render(
      <I18nProvider>
        <PhaseControls
          raCase={buildCase()}
          saving={false}
          onAddProposedControl={vi.fn()}
          onDeleteProposedControl={vi.fn()}
          onUpdateHazard={vi.fn()}
          onSaveResidualRisk={onSaveResidualRisk}
          onExtractControls={vi.fn()}
          onNext={vi.fn()}
          canAdvance={false}
          mode="residual"
        />
      </I18nProvider>
    );

    const severitySelects = screen.getAllByLabelText("Severity");
    const likelihoodSelects = screen.getAllByLabelText("Likelihood");

    await user.selectOptions(severitySelects[0]!, "");
    await user.selectOptions(likelihoodSelects[0]!, "");

    await waitFor(() => {
      expect(onSaveResidualRisk).toHaveBeenCalledWith([
        { hazardId: "haz-1", severity: "", likelihood: "" }
      ]);
    });
  });
});
