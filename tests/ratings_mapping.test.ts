import { describe, expect, it, vi } from "vitest";
import { HazardAssessmentType } from "@prisma/client";
import { RiskAssessmentService } from "../src/services/raService";

describe("RiskAssessmentService ratings save/load mapping", () => {
  it("maps baseline/residual assessments onto hazard snapshots", async () => {
    const mockDb: any = {
      riskAssessmentCase: {
        findUnique: vi.fn().mockResolvedValue({
          id: "case-1",
          createdAt: new Date("2025-01-01T00:00:00Z"),
          updatedAt: new Date("2025-01-01T00:00:00Z"),
          createdBy: null,
          activityName: "Demo",
          location: null,
          team: null,
          phase: "RISK_RATING",
          steps: [{ id: "step-1", caseId: "case-1", createdAt: new Date(), updatedAt: new Date(), orderIndex: 0, activity: "Work", equipment: [], substances: [], description: null }],
          hazards: [
            {
              id: "haz-1",
              createdAt: new Date("2025-01-01T00:00:00Z"),
              updatedAt: new Date("2025-01-01T00:00:00Z"),
              caseId: "case-1",
              stepId: "step-1",
              orderIndex: 0,
              label: "Slip",
              description: null,
              categoryCode: null,
              existingControls: [],
              assessments: [
                {
                  id: "assess-1",
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  hazardId: "haz-1",
                  type: HazardAssessmentType.BASELINE,
                  severity: "B",
                  likelihood: "2",
                  riskRating: "High Risk"
                },
                {
                  id: "assess-2",
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  hazardId: "haz-1",
                  type: HazardAssessmentType.RESIDUAL,
                  severity: "E",
                  likelihood: "4",
                  riskRating: "Negligible Risk"
                }
              ],
              proposedControls: []
            }
          ],
          actions: []
        })
      }
    };

    const service = new RiskAssessmentService(mockDb);
    const raCase = await service.getCaseById("case-1");

    expect(raCase).not.toBeNull();
    expect(raCase!.hazards).toHaveLength(1);
    const hazard = raCase!.hazards[0]!;

    expect(hazard.baseline?.severity).toBe("B");
    expect(hazard.baseline?.likelihood).toBe("2");
    expect(hazard.baseline?.riskRating).toBe("High Risk");

    expect(hazard.residual?.severity).toBe("E");
    expect(hazard.residual?.likelihood).toBe("4");
    expect(hazard.residual?.riskRating).toBe("Negligible Risk");
  });

  it("upserts baseline ratings with computed riskRating", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const mockDb: any = {
      hazard: { count: vi.fn().mockResolvedValue(1) },
      $transaction: vi.fn(async (fn: any) => fn({ hazardAssessment: { upsert } }))
    };

    const service = new RiskAssessmentService(mockDb);
    vi.spyOn(service, "getCaseById").mockResolvedValue({ id: "case-1", hazards: [], steps: [], actions: [] } as any);

    await service.setHazardRiskRatings("case-1", [{ hazardId: "haz-1", severity: "B", likelihood: "2" }]);

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith({
      where: { hazardId_type: { hazardId: "haz-1", type: HazardAssessmentType.BASELINE } },
      update: { severity: "B", likelihood: "2", riskRating: "High Risk" },
      create: {
        hazardId: "haz-1",
        type: HazardAssessmentType.BASELINE,
        severity: "B",
        likelihood: "2",
        riskRating: "High Risk"
      }
    });
  });

  it("upserts residual ratings with computed riskRating", async () => {
    const upsert = vi.fn().mockResolvedValue(undefined);
    const mockDb: any = {
      hazard: { count: vi.fn().mockResolvedValue(1) },
      $transaction: vi.fn(async (fn: any) => fn({ hazardAssessment: { upsert } }))
    };

    const service = new RiskAssessmentService(mockDb);
    vi.spyOn(service, "getCaseById").mockResolvedValue({ id: "case-1", hazards: [], steps: [], actions: [] } as any);

    await service.setResidualRiskRatings("case-1", [{ hazardId: "haz-1", severity: "E", likelihood: "5" }]);

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith({
      where: { hazardId_type: { hazardId: "haz-1", type: HazardAssessmentType.RESIDUAL } },
      update: { severity: "E", likelihood: "5", riskRating: "Negligible Risk" },
      create: {
        hazardId: "haz-1",
        type: HazardAssessmentType.RESIDUAL,
        severity: "E",
        likelihood: "5",
        riskRating: "Negligible Risk"
      }
    });
  });
});
