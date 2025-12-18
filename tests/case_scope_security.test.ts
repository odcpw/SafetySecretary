import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { RiskAssessmentService } from "../src/services/raService";
import prisma from "../src/services/prismaClient";

const describeDb = describe.skipIf(process.env.SAFETYSECRETARY_RUN_DB_TESTS !== "1");

describeDb("Case scoping hardening (db)", () => {
  let service: RiskAssessmentService;
  let caseAId: string;
  let caseBId: string;
  let stepAId: string;
  let stepBId: string;
  let hazardAId: string;
  let hazardBId: string;

  beforeAll(async () => {
    service = new RiskAssessmentService(prisma);

    const caseA = await service.createCase({ activityName: "Case scope A" });
    const caseB = await service.createCase({ activityName: "Case scope B" });
    caseAId = caseA.id;
    caseBId = caseB.id;

    const updatedA = await service.updateSteps(caseAId, [{ activity: "A step", orderIndex: 0 }]);
    const updatedB = await service.updateSteps(caseBId, [{ activity: "B step", orderIndex: 0 }]);
    stepAId = updatedA!.steps[0]!.id;
    stepBId = updatedB!.steps[0]!.id;

    const hazardA = await service.addManualHazard(caseAId, {
      stepId: stepAId,
      label: "Hazard A",
      description: "Hazard for A"
    });
    hazardAId = hazardA!.id;

    const hazardB = await service.addManualHazard(caseBId, {
      stepId: stepBId,
      label: "Hazard B",
      description: "Hazard for B"
    });
    hazardBId = hazardB!.id;
  });

  afterAll(async () => {
    if (caseAId) {
      await service.deleteCase(caseAId);
    }
    if (caseBId) {
      await service.deleteCase(caseBId);
    }
    await prisma.$disconnect();
  });

  it("rejects updating steps with step IDs from another case", async () => {
    const result = await service.updateSteps(caseAId, [{ id: stepBId, activity: "Cross-case update" }]);
    expect(result).toBeNull();
  });

  it("rejects updating hazard stepIds with step IDs from another case", async () => {
    const result = await service.updateHazard(caseAId, hazardAId, { stepIds: [stepBId] });
    expect(result).toBeNull();
  });

  it("rejects setting baseline ratings for hazards outside the case", async () => {
    const result = await service.setHazardRiskRatings(caseAId, [
      { hazardId: hazardBId, severity: "HIGH", likelihood: "LIKELY" }
    ]);
    expect(result).toBeNull();
  });

  it("rejects setting residual ratings for hazards outside the case", async () => {
    const result = await service.setResidualRiskRatings(caseAId, [
      { hazardId: hazardBId, severity: "LOW", likelihood: "RARE" }
    ]);
    expect(result).toBeNull();
  });

  it("does not attach extracted hazards to steps outside the case", async () => {
    const label = "Cross-case hazard attachment attempt";
    const updated = await service.mergeExtractedHazards(caseAId, [
      {
        label,
        description: "Should not attach to other case",
        existingControls: [],
        stepIds: [stepBId]
      }
    ]);
    expect(updated).not.toBeNull();

    const created = updated!.hazards.find((hazard) => hazard.label === label);
    expect(created).toBeDefined();
    expect(created!.stepIds).toEqual([]);
  });
});
