import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { RiskAssessmentService } from "../src/services/raService";
import prisma from "../src/services/prismaClient";

describe("RiskAssessmentService Persistence Repro", () => {
    let service: RiskAssessmentService;
    let caseId: string;

    beforeAll(async () => {
        service = new RiskAssessmentService(prisma);
        const raCase = await service.createCase({
            activityName: "Repro Test",
            location: "Lab",
            team: "QA"
        });
        caseId = raCase.id;
    });

    afterAll(async () => {
        if (caseId) {
            await service.deleteCase(caseId);
        }
        await prisma.$disconnect();
    });

    it("should persist risk ratings and residual risk", async () => {
        // 1. Add Step
        const updatedWithStep = await service.updateSteps(caseId, [
            { title: "Step 1", orderIndex: 0 }
        ]);
        const stepId = updatedWithStep!.steps[0].id;

        // 2. Add Hazard
        const hazard = await service.addManualHazard(caseId, {
            stepId,
            label: "Hazard 1",
            description: "Test Hazard"
        });
        const hazardId = hazard!.id;

        // 3. Set Risk Rating (Baseline)
        await service.setHazardRiskRatings(caseId, [
            { hazardId, severity: "HIGH", likelihood: "LIKELY" }
        ]);

        // 4. Verify Baseline
        let raCase = await service.getCaseById(caseId);
        let h = raCase!.hazards.find(h => h.id === hazardId)!;
        expect(h.baselineAssessment).toBeDefined();
        expect(h.baselineAssessment?.severity).toBe("HIGH");
        expect(h.baselineAssessment?.likelihood).toBe("LIKELY");

        // 5. Set Residual Risk
        await service.setResidualRiskRatings(caseId, [
            { hazardId, severity: "LOW", likelihood: "UNLIKELY" }
        ]);

        // 6. Verify Residual
        raCase = await service.getCaseById(caseId);
        h = raCase!.hazards.find(h => h.id === hazardId)!;

        // Check Baseline still exists
        expect(h.baselineAssessment?.severity).toBe("HIGH");

        // Check Residual exists
        expect(h.residualAssessment).toBeDefined();
        expect(h.residualAssessment?.severity).toBe("LOW");
        expect(h.residualAssessment?.likelihood).toBe("UNLIKELY");
    });
});
