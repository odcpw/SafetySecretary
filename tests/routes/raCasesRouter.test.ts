import request from "supertest";
import express from "express";
import raCasesRouter from "../../src/routes/raCasesRouter";
import { AppLocals } from "../../src/types/app";
import { afterEach, describe, expect, it, vi } from "vitest";

const createApp = (locals: Partial<AppLocals>) => {
  const app = express();
  app.use(express.json());
  const defaults: AppLocals = {
    raService: {
      createCase: vi.fn(),
      getCaseById: vi.fn(),
      updateCaseMeta: vi.fn(),
      advancePhase: vi.fn(),
      setStepsFromExtraction: vi.fn(),
      updateSteps: vi.fn(),
      mergeExtractedHazards: vi.fn(),
      addManualHazard: vi.fn(),
      updateHazard: vi.fn(),
      setHazardRiskRatings: vi.fn(),
      setHazardControls: vi.fn(),
      setResidualRiskRatings: vi.fn(),
      deleteHazard: vi.fn(),
      deleteProposedControl: vi.fn(),
      deleteAction: vi.fn(),
      addAction: vi.fn(),
      updateAction: vi.fn()
    } as any,
    llmService: {
      extractStepsFromDescription: vi.fn(),
      extractHazardsFromAnecdotes: vi.fn(),
      parseContextualUpdate: vi.fn()
    } as any,
    llmJobManager: {
      enqueueStepsExtraction: vi.fn().mockReturnValue({ id: "job-1", status: "queued", type: "steps" }),
      enqueueHazardExtraction: vi.fn().mockReturnValue({ id: "job-2", status: "queued", type: "hazards" }),
      getJob: vi.fn()
    } as any,
    reportService: {
      generatePdfForCase: vi.fn(),
      generateXlsxForCase: vi.fn()
    } as any
  };
  app.locals = { ...defaults, ...locals } as AppLocals;
  app.use("/api/ra-cases", raCasesRouter);
  return app;
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("raCasesRouter", () => {
  it("validates create case payload", async () => {
    const app = createApp({});
    const response = await request(app).post("/api/ra-cases").send({});
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/activityName/);
  });

  it("creates a new case", async () => {
    const raCase = { id: "case-1", activityName: "Inspect tank", steps: [], hazards: [], actions: [] };
    const raService = {
      createCase: vi.fn().mockResolvedValue(raCase)
    } as any;
    const app = createApp({ raService });
    const response = await request(app)
      .post("/api/ra-cases")
      .send({ activityName: "Inspect tank" });
    expect(response.status).toBe(201);
    expect(response.body.id).toBe("case-1");
    expect(raService.createCase).toHaveBeenCalledWith({ activityName: "Inspect tank" });
  });

  it("queues a steps extraction job", async () => {
    const raService = {
      getCaseById: vi.fn().mockResolvedValue({ id: "case-1" })
    } as any;
    const llmJobManager = {
      enqueueStepsExtraction: vi.fn().mockReturnValue({ id: "job-steps", status: "queued", type: "steps" })
    } as any;
    const app = createApp({ raService, llmJobManager });
    const response = await request(app)
      .post("/api/ra-cases/case-1/steps/extract")
      .send({ description: "Walk through" });
    expect(response.status).toBe(202);
    expect(response.body.id).toBe("job-steps");
    expect(llmJobManager.enqueueStepsExtraction).toHaveBeenCalledWith({ caseId: "case-1", description: "Walk through" });
  });

  it("exports xlsx", async () => {
    const raCase = { id: "case-1" };
    const raService = {
      getCaseById: vi.fn().mockResolvedValue(raCase)
    } as any;
    const reportService = {
      generateXlsxForCase: vi.fn().mockResolvedValue(Buffer.from("excel"))
    } as any;
    const app = createApp({ raService, reportService });
    const response = await request(app).get("/api/ra-cases/case-1/export/xlsx");
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/spreadsheetml/);
    expect(reportService.generateXlsxForCase).toHaveBeenCalledWith(raCase);
  });

  it("parses contextual update with summary", async () => {
    const raCase = {
      id: "case-1",
      phase: "PROCESS_STEPS",
      steps: [{ id: "step-1", activity: "Do work", equipment: [], substances: [], description: null, orderIndex: 0 }],
      hazards: [],
      actions: []
    };
    const raService = {
      getCaseById: vi.fn().mockResolvedValue(raCase)
    } as any;
    const llmService = {
      parseContextualUpdate: vi.fn().mockResolvedValue({
        commands: [{ intent: "add", target: "hazard", location: { stepId: "step-1" }, data: {}, explanation: "Add hazard" }],
        summary: "Add hazard"
      })
    } as any;
    const app = createApp({ raService, llmService });
    const response = await request(app)
      .post("/api/ra-cases/case-1/contextual-update/parse")
      .send({ userInput: "Add hazard" });
    expect(response.status).toBe(200);
    expect(response.body.summary).toBe("Add hazard");
    expect(response.body.commands).toHaveLength(1);
    expect(response.body.commands[0].intent).toBe("add");
    expect(llmService.parseContextualUpdate).toHaveBeenCalled();
  });

  it("applies delete hazard command", async () => {
    const initialCase = {
      id: "case-1",
      phase: "PROCESS_STEPS",
      steps: [],
      hazards: [{ id: "haz-1", stepIds: [], existingControls: [] }],
      actions: []
    };
    const updatedCase = { ...initialCase, hazards: [] };
    const raService = {
      getCaseById: vi.fn().mockResolvedValueOnce(initialCase).mockResolvedValueOnce(updatedCase),
      deleteHazard: vi.fn().mockResolvedValue(true)
    } as any;
    const app = createApp({ raService });
    const response = await request(app)
      .post("/api/ra-cases/case-1/contextual-update/apply")
      .send({
        command: {
          intent: "delete",
          target: "hazard",
          location: { hazardId: "haz-1" },
          data: {},
          explanation: "Remove hazard"
        }
      });
    expect(response.status).toBe(200);
    expect(raService.deleteHazard).toHaveBeenCalledWith("case-1", "haz-1");
    expect(response.body.hazards).toHaveLength(0);
  });

  it("applies assessment command as residual when phase is RESIDUAL_RISK", async () => {
    const raCase = {
      id: "case-1",
      phase: "RESIDUAL_RISK",
      steps: [],
      hazards: [{ id: "haz-1", stepIds: [], existingControls: [] }],
      actions: []
    };
    const updated = { ...raCase };
    const raService = {
      getCaseById: vi.fn().mockResolvedValueOnce(raCase).mockResolvedValueOnce(updated),
      setResidualRiskRatings: vi.fn().mockResolvedValue(updated)
    } as any;
    const app = createApp({ raService });
    const response = await request(app)
      .post("/api/ra-cases/case-1/contextual-update/apply")
      .send({
        command: {
          intent: "modify",
          target: "assessment",
          location: { hazardId: "haz-1" },
          data: { severity: "LOW", likelihood: "RARE" },
          explanation: "Set residual rating"
        }
      });
    expect(response.status).toBe(200);
    expect(raService.setResidualRiskRatings).toHaveBeenCalledWith("case-1", [
      { hazardId: "haz-1", severity: "LOW", likelihood: "RARE" }
    ]);
  });
});
