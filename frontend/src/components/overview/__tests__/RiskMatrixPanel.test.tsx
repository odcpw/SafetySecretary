import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RiskMatrixPanel } from "../RiskMatrixPanel";
import type { RiskAssessmentCase } from "@/types/riskAssessment";
import { getDefaultMatrixSettings } from "@/lib/riskMatrixSettings";

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
      label: "Hazard A",
      description: null,
      existingControls: [],
      proposedControls: [],
      stepIds: ["step-1"],
      stepOrder: { "step-1": 0 },
      baseline: { severity: "HIGH", likelihood: "LIKELY", riskRating: "HIGH_LIKELY" },
      residual: { severity: "LOW", likelihood: "UNLIKELY", riskRating: "LOW_UNLIKELY" }
    },
    {
      id: "haz-2",
      label: "Hazard B",
      description: null,
      existingControls: [],
      proposedControls: [],
      stepIds: [],
      stepOrder: {},
      baseline: { severity: "LOW", likelihood: "RARE", riskRating: "LOW_RARE" },
      residual: undefined
    },
    {
      id: "haz-3",
      label: "Hazard C",
      description: null,
      existingControls: [],
      proposedControls: [],
      stepIds: [],
      stepOrder: {},
      baseline: undefined,
      residual: { severity: "CRITICAL", likelihood: "ALMOST_CERTAIN", riskRating: "CRITICAL_ALMOST_CERTAIN" }
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
    const { container } = render(<RiskMatrixPanel raCase={buildCase()} />);

    expect(sumMatrixCounts(container)).toBe(2);

    await user.click(getCellButton(container, { row: 3, column: 3 })); // HIGH x LIKELY
    expect(screen.getByText("Hazard A")).toBeInTheDocument();

    await user.click(getCellButton(container, { row: 0, column: 0 })); // LOW x RARE
    expect(screen.getByText("Hazard B")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Residual risk" }));
    expect(sumMatrixCounts(container)).toBe(2);

    await user.click(getCellButton(container, { row: 1, column: 0 })); // LOW x UNLIKELY
    expect(screen.getByText("Hazard A")).toBeInTheDocument();

    await user.click(getCellButton(container, { row: 4, column: 4 })); // CRITICAL x ALMOST_CERTAIN
    expect(screen.getByText("Hazard C")).toBeInTheDocument();
  });
});
