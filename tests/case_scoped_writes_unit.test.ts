import { describe, expect, it, vi } from "vitest";
import { RiskAssessmentService } from "../src/services/raService";

describe("RiskAssessmentService case-scoped writes (unit)", () => {
  it("rejects addProposedControls when any hazardId is outside the case", async () => {
    const mockDb: any = {
      hazard: {
        findMany: vi.fn().mockResolvedValue([{ id: "haz-a" }])
      },
      hazardControl: {
        createMany: vi.fn()
      }
    };

    const service = new RiskAssessmentService(mockDb);

    const result = await service.addProposedControls("case-a", [
      { hazardId: "haz-a", description: "Valid", hierarchy: null },
      { hazardId: "haz-other-case", description: "Invalid", hierarchy: null }
    ]);

    expect(result).toBeNull();
    expect(mockDb.hazardControl.createMany).not.toHaveBeenCalled();
  });
});

