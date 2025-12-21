import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RiskMatrixPanel } from "../RiskMatrixPanel";
import type { RiskAssessmentCase } from "@/types/riskAssessment";
import { getDefaultMatrixSettings } from "@/lib/riskMatrixSettings";
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
    { id: "step-1", activity: "Prep", equipment: [], substances: [], description: null, orderIndex: 0 }
  ],
  hazards: [
    {
      id: "haz-1",
      stepId: "step-1",
      orderIndex: 0,
      label: "Hazard A",
      description: null,
      existingControls: [],
      proposedControls: [],
      baseline: { severity: "B", likelihood: "2", riskRating: "High Risk" },
      residual: { severity: "E", likelihood: "4", riskRating: "Negligible Risk" }
    },
    {
      id: "haz-2",
      stepId: "step-1",
      orderIndex: 1,
      label: "Hazard B",
      description: null,
      existingControls: [],
      proposedControls: [],
      baseline: { severity: "D", likelihood: "5", riskRating: "Negligible Risk" },
      residual: undefined
    },
    {
      id: "haz-3",
      stepId: "step-1",
      orderIndex: 2,
      label: "Hazard C",
      description: null,
      existingControls: [],
      proposedControls: [],
      baseline: undefined,
      residual: { severity: "A", likelihood: "1", riskRating: "Extreme Risk" }
    }
  ],
  actions: []
});

const sumMatrixCounts = (container: HTMLElement) => {
  const counts = Array.from(container.querySelectorAll(".risk-cell-count")).map((node) =>
    Number(node.textContent ?? "0")
  );
  return counts.reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0);
};

const getCellButton = (container: HTMLElement, opts: { row: number; column: number }) => {
  const bodyRows = Array.from(container.querySelectorAll("table.risk-matrix-grid tbody tr"));
  const rowCount = getDefaultMatrixSettings().rows;
  const displayRowIndex = rowCount - 1 - opts.row;
  const rowEl = bodyRows[displayRowIndex];
  if (!rowEl) {
    throw new Error(`Row not found for row=${opts.row}`);
  }
  const cells = Array.from(rowEl.querySelectorAll("td"));
  const cellEl = cells[opts.column + 1];
  if (!cellEl) {
    throw new Error(`Cell not found for row=${opts.row} column=${opts.column}`);
  }
  const button = cellEl.querySelector("button");
  if (!button) {
    throw new Error(`Button not found for row=${opts.row} column=${opts.column}`);
  }
  return button as HTMLButtonElement;
};

beforeEach(() => {
  window.localStorage.clear();
});

describe("RiskMatrixPanel", () => {
  it("plots hazards into matrix cells (current vs residual) without losing counts", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <I18nProvider>
        <RiskMatrixPanel raCase={buildCase()} />
      </I18nProvider>
    );

    expect(sumMatrixCounts(container)).toBe(2);

    await user.click(getCellButton(container, { row: 1, column: 3 })); // B x 2
    expect(screen.getByText("Hazard A")).toBeInTheDocument();

    await user.click(getCellButton(container, { row: 4, column: 1 })); // D x 5
    expect(screen.getByText("Hazard B")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Residual risk" }));
    expect(sumMatrixCounts(container)).toBe(2);

    await user.click(getCellButton(container, { row: 3, column: 0 })); // E x 4
    expect(screen.getByText("Hazard A")).toBeInTheDocument();

    await user.click(getCellButton(container, { row: 0, column: 4 })); // A x 1
    expect(screen.getByText("Hazard C")).toBeInTheDocument();
  });
});
