import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { RiskAssessmentService } from "../src/services/raService";

const describeDb = describe.skipIf(process.env.SAFETYSECRETARY_RUN_TENANT_DB_TESTS !== "1");

const tenantUrlA = process.env.SAFETYSECRETARY_TENANT_DB_URL_A;
const tenantUrlB = process.env.SAFETYSECRETARY_TENANT_DB_URL_B;

describeDb("Tenant DB isolation (db)", () => {
  let clientA: PrismaClient;
  let clientB: PrismaClient;
  let serviceA: RiskAssessmentService;
  let serviceB: RiskAssessmentService;
  let caseId: string;

  beforeAll(async () => {
    if (!tenantUrlA || !tenantUrlB) {
      throw new Error("Set SAFETYSECRETARY_TENANT_DB_URL_A and SAFETYSECRETARY_TENANT_DB_URL_B for tenant isolation tests.");
    }
    clientA = new PrismaClient({ datasources: { db: { url: tenantUrlA } } });
    clientB = new PrismaClient({ datasources: { db: { url: tenantUrlB } } });
    serviceA = new RiskAssessmentService(clientA);
    serviceB = new RiskAssessmentService(clientB);

    const created = await serviceA.createCase({ activityName: "Tenant A case" });
    caseId = created.id;
  });

  afterAll(async () => {
    if (caseId) {
      await serviceA.deleteCase(caseId);
    }
    await clientA.$disconnect();
    await clientB.$disconnect();
  });

  it("does not leak case data between tenant databases", async () => {
    const caseA = await serviceA.getCaseById(caseId);
    const caseB = await serviceB.getCaseById(caseId);

    expect(caseA).not.toBeNull();
    expect(caseB).toBeNull();
  });
});
