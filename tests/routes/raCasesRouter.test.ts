import raCasesRouter from "../../src/routes/raCasesRouter";
import { AppLocals } from "../../src/types/app";
import { afterEach, describe, expect, it, vi } from "vitest";

type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

type MockResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  status: (code: number) => MockResponse;
  json: (value: any) => MockResponse;
  send: (value?: any) => MockResponse;
  setHeader: (key: string, value: string) => void;
};

const createMockResponse = (): MockResponse => {
  const res: MockResponse = {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(value: any) {
      res.body = value;
      return res;
    },
    send(value?: any) {
      res.body = value;
      return res;
    },
    setHeader(key: string, value: string) {
      res.headers[key.toLowerCase()] = value;
    }
  };
  return res;
};

const createLocals = (locals: Partial<AppLocals>): AppLocals => {
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
  return { ...defaults, ...locals } as AppLocals;
};

const findRouteHandler = (method: HttpMethod, path: string) => {
  const stack = (raCasesRouter as any).stack as Array<any>;
  const layer = stack.find((item) => item?.route?.path === path && item.route.methods?.[method]);
  if (!layer) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
  }
  const handlerLayer = layer.route.stack?.[0];
  if (!handlerLayer?.handle) {
    throw new Error(`No handler for route: ${method.toUpperCase()} ${path}`);
  }
  return handlerLayer.handle as (req: any, res: any) => unknown;
};

const callRoute = async (opts: {
  method: HttpMethod;
  path: string;
  locals?: Partial<AppLocals>;
  params?: Record<string, string>;
  query?: Record<string, any>;
  body?: any;
}) => {
  const handler = findRouteHandler(opts.method, opts.path);
  const locals = createLocals(opts.locals ?? {});
  const req: any = {
    params: opts.params ?? {},
    query: opts.query ?? {},
    body: opts.body ?? {},
    app: { locals }
  };
  const res = createMockResponse();
  await handler(req, res);
  return { req, res, locals };
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("raCasesRouter", () => {
  it("validates create case payload", async () => {
    const { res } = await callRoute({ method: "post", path: "/", body: {} });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/activityName/);
  });

  it("creates a new case", async () => {
    const raCase = { id: "case-1", activityName: "Inspect tank", steps: [], hazards: [], actions: [] };
    const raService = {
      createCase: vi.fn().mockResolvedValue(raCase)
    } as any;
    const { res } = await callRoute({
      method: "post",
      path: "/",
      locals: { raService },
      body: { activityName: "Inspect tank" }
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBe("case-1");
    expect(raService.createCase).toHaveBeenCalledWith({ activityName: "Inspect tank", location: undefined, team: undefined });
  });

  it("queues a steps extraction job", async () => {
    const raService = {
      getCaseById: vi.fn().mockResolvedValue({ id: "case-1" })
    } as any;
    const llmJobManager = {
      enqueueStepsExtraction: vi.fn().mockReturnValue({ id: "job-steps", status: "queued", type: "steps" })
    } as any;
    const { res } = await callRoute({
      method: "post",
      path: "/:id/steps/extract",
      locals: { raService, llmJobManager },
      params: { id: "case-1" },
      body: { description: "Walk through" }
    });
    expect(res.statusCode).toBe(202);
    expect(res.body.id).toBe("job-steps");
    expect(llmJobManager.enqueueStepsExtraction).toHaveBeenCalledWith({ caseId: "case-1", description: "Walk through" });
  });

  it("exports xlsx", async () => {
    const raCase = { id: "case-1" };
    const raService = {
      getCaseById: vi.fn().mockResolvedValue(raCase),
      listAttachments: vi.fn().mockResolvedValue([])
    } as any;
    const reportService = {
      generateXlsxForCase: vi.fn().mockResolvedValue(Buffer.from("excel"))
    } as any;
    const { res } = await callRoute({
      method: "get",
      path: "/:id/export/xlsx",
      locals: { raService, reportService },
      params: { id: "case-1" }
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/spreadsheetml/);
    expect(raService.listAttachments).toHaveBeenCalledWith("case-1");
    expect(reportService.generateXlsxForCase).toHaveBeenCalledWith(raCase, { attachments: [] });
  });

  it("rejects reorderHazardsForStep when hazardIds includes hazards from another step/case", async () => {
    const raCase = {
      id: "case-1",
      phase: "HAZARD_IDENTIFICATION",
      steps: [
        { id: "step-1", activity: "Step 1", equipment: [], substances: [], description: null, orderIndex: 0 },
        { id: "step-2", activity: "Step 2", equipment: [], substances: [], description: null, orderIndex: 1 }
      ],
      hazards: [
        { id: "haz-1", stepIds: ["step-1"], existingControls: [] },
        { id: "haz-2", stepIds: ["step-2"], existingControls: [] }
      ],
      actions: []
    };

    const raService = {
      getCaseById: vi.fn().mockResolvedValue(raCase),
      reorderHazardsForStep: vi.fn().mockResolvedValue(true)
    } as any;

    const { res } = await callRoute({
      method: "put",
      path: "/:id/steps/:stepId/hazards/order",
      locals: { raService },
      params: { id: "case-1", stepId: "step-1" },
      body: { hazardIds: ["haz-1", "haz-2"] }
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/Invalid hazardIds/);
    expect(raService.reorderHazardsForStep).not.toHaveBeenCalled();
  });

  it("reorders hazards for step when hazardIds are valid for that step", async () => {
    const raCase = {
      id: "case-1",
      phase: "HAZARD_IDENTIFICATION",
      steps: [{ id: "step-1", activity: "Step 1", equipment: [], substances: [], description: null, orderIndex: 0 }],
      hazards: [
        { id: "haz-1", stepIds: ["step-1"], existingControls: [] },
        { id: "haz-2", stepIds: ["step-1"], existingControls: [] }
      ],
      actions: []
    };

    const raService = {
      getCaseById: vi.fn().mockResolvedValue(raCase),
      reorderHazardsForStep: vi.fn().mockResolvedValue(true)
    } as any;

    const { res } = await callRoute({
      method: "put",
      path: "/:id/steps/:stepId/hazards/order",
      locals: { raService },
      params: { id: "case-1", stepId: "step-1" },
      body: { hazardIds: ["haz-2", "haz-1"] }
    });

    expect(res.statusCode).toBe(204);
    expect(raService.reorderHazardsForStep).toHaveBeenCalledWith("case-1", "step-1", ["haz-2", "haz-1"]);
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
    const { res } = await callRoute({
      method: "post",
      path: "/:id/contextual-update/parse",
      locals: { raService, llmService },
      params: { id: "case-1" },
      body: { userInput: "Add hazard" }
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.summary).toBe("Add hazard");
    expect(res.body.commands).toHaveLength(1);
    expect(res.body.commands[0].intent).toBe("add");
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
    const { res } = await callRoute({
      method: "post",
      path: "/:id/contextual-update/apply",
      locals: { raService },
      params: { id: "case-1" },
      body: {
        command: {
          intent: "delete",
          target: "hazard",
          location: { hazardId: "haz-1" },
          data: {},
          explanation: "Remove hazard"
        }
      }
    });
    expect(res.statusCode).toBe(200);
    expect(raService.deleteHazard).toHaveBeenCalledWith("case-1", "haz-1");
    expect(res.body.hazards).toHaveLength(0);
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
    const { res } = await callRoute({
      method: "post",
      path: "/:id/contextual-update/apply",
      locals: { raService },
      params: { id: "case-1" },
      body: {
        command: {
          intent: "modify",
          target: "assessment",
          location: { hazardId: "haz-1" },
          data: { severity: "LOW", likelihood: "RARE" },
          explanation: "Set residual rating"
        }
      }
    });
    expect(res.statusCode).toBe(200);
    expect(raService.setResidualRiskRatings).toHaveBeenCalledWith("case-1", [
      { hazardId: "haz-1", severity: "LOW", likelihood: "RARE" }
    ]);
  });
});
