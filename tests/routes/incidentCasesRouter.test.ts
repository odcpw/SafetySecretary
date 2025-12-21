import incidentCasesRouter from "../../src/routes/incidentCasesRouter";
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
    raService: {} as any,
    jhaService: {} as any,
    incidentService: {} as any,
    llmService: {} as any,
    llmJobManager: {
      enqueueIncidentWitnessExtraction: vi.fn().mockReturnValue({ id: "job-1", status: "queued", type: "incident-witness" }),
      enqueueIncidentTimelineMerge: vi.fn().mockReturnValue({ id: "job-2", status: "queued", type: "incident-merge" }),
      enqueueIncidentConsistencyCheck: vi.fn().mockReturnValue({ id: "job-3", status: "queued", type: "incident-consistency" }),
      enqueueIncidentNarrativeExtraction: vi.fn().mockReturnValue({ id: "job-4", status: "queued", type: "incident-narrative" })
    } as any,
    reportService: {
      generateIncidentPdf: vi.fn()
    } as any
  };
  return { ...defaults, ...locals } as AppLocals;
};

const createTenantServices = (overrides: Partial<{ incidentService: any }> = {}) => ({
  incidentService: {
    listCases: vi.fn(),
    createCase: vi.fn(),
    getCaseById: vi.fn(),
    updateCaseMeta: vi.fn(),
    deleteCase: vi.fn(),
    addPerson: vi.fn(),
    updatePerson: vi.fn(),
    addAccount: vi.fn(),
    updateAccount: vi.fn(),
    updateAssistantDraft: vi.fn(),
    updateTimelineEvents: vi.fn(),
    updateDeviations: vi.fn(),
    updateCauses: vi.fn(),
    updateActions: vi.fn()
  },
  ...overrides
});

const findRouteHandler = (method: HttpMethod, path: string) => {
  const stack = (incidentCasesRouter as any).stack as Array<any>;
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
  tenantServices?: any;
  params?: Record<string, string>;
  query?: Record<string, any>;
  body?: any;
  auth?: { dbConnectionString: string };
}) => {
  const handler = findRouteHandler(opts.method, opts.path);
  const locals = createLocals(opts.locals ?? {});
  const req: any = {
    params: opts.params ?? {},
    query: opts.query ?? {},
    body: opts.body ?? {},
    app: { locals },
    tenantServices: opts.tenantServices ?? createTenantServices(),
    auth: opts.auth
  };
  const res = createMockResponse();
  await handler(req, res);
  return { req, res, locals };
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("incidentCasesRouter", () => {
  it("validates create case payload", async () => {
    const { res } = await callRoute({ method: "post", path: "/", body: {} });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/title/);
  });

  it("creates a new incident case", async () => {
    const incidentCase = { id: "incident-1" };
    const tenantServices = createTenantServices({
      incidentService: {
        createCase: vi.fn().mockResolvedValue(incidentCase)
      }
    });
    const { res } = await callRoute({
      method: "post",
      path: "/",
      tenantServices,
      body: {
        title: "Forklift near miss",
        incidentType: "NEAR_MISS",
        coordinatorRole: "Supervisor"
      }
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBe("incident-1");
    expect(tenantServices.incidentService.createCase).toHaveBeenCalled();
  });

  it("queues witness extraction", async () => {
    const tenantServices = createTenantServices({
      incidentService: {
        updateAccount: vi.fn().mockResolvedValue({ id: "acct-1" })
      }
    });
    const llmJobManager = {
      enqueueIncidentWitnessExtraction: vi.fn().mockReturnValue({ id: "job-1", status: "queued" })
    } as any;
    const { res } = await callRoute({
      method: "post",
      path: "/:id/accounts/:accountId/extract",
      locals: { llmJobManager },
      tenantServices,
      params: { id: "incident-1", accountId: "acct-1" },
      body: { statement: "I saw the forklift reverse" },
      auth: { dbConnectionString: "postgres://tenant" }
    });
    expect(res.statusCode).toBe(202);
    expect(res.body.id).toBe("job-1");
    expect(llmJobManager.enqueueIncidentWitnessExtraction).toHaveBeenCalledWith({
      caseId: "incident-1",
      accountId: "acct-1",
      statement: "I saw the forklift reverse",
      tenantDbUrl: "postgres://tenant"
    });
  });

  it("queues timeline merge", async () => {
    const llmJobManager = {
      enqueueIncidentTimelineMerge: vi.fn().mockReturnValue({ id: "job-merge", status: "queued" })
    } as any;
    const { res } = await callRoute({
      method: "post",
      path: "/:id/timeline/merge",
      locals: { llmJobManager },
      params: { id: "incident-1" },
      auth: { dbConnectionString: "postgres://tenant" }
    });
    expect(res.statusCode).toBe(202);
    expect(res.body.id).toBe("job-merge");
  });

  it("exports PDF", async () => {
    const incidentCase = { id: "incident-1" };
    const tenantServices = createTenantServices({
      incidentService: {
        getCaseById: vi.fn().mockResolvedValue(incidentCase)
      }
    });
    const reportService = {
      generateIncidentPdf: vi.fn().mockResolvedValue(Buffer.from("pdf"))
    } as any;
    const { res } = await callRoute({
      method: "get",
      path: "/:id/export/pdf",
      tenantServices,
      locals: { reportService },
      params: { id: "incident-1" }
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/pdf/);
    expect(reportService.generateIncidentPdf).toHaveBeenCalledWith(incidentCase);
  });

  it("queues incident narrative extraction", async () => {
    const llmJobManager = {
      enqueueIncidentNarrativeExtraction: vi.fn().mockReturnValue({ id: "job-narrative", status: "queued" })
    } as any;
    const { res } = await callRoute({
      method: "post",
      path: "/:id/narrative/extract",
      locals: { llmJobManager },
      params: { id: "incident-1" },
      body: { narrative: "A worker slipped near the loading dock." },
      auth: { dbConnectionString: "postgres://tenant" }
    });
    expect(res.statusCode).toBe(202);
    expect(res.body.id).toBe("job-narrative");
    expect(llmJobManager.enqueueIncidentNarrativeExtraction).toHaveBeenCalledWith({
      caseId: "incident-1",
      narrative: "A worker slipped near the loading dock.",
      tenantDbUrl: "postgres://tenant"
    });
  });

  it("updates assistant draft", async () => {
    const incidentCase = { id: "incident-1", assistantDraft: { facts: [] } };
    const tenantServices = createTenantServices({
      incidentService: {
        updateAssistantDraft: vi.fn().mockResolvedValue(incidentCase)
      }
    });
    const { res } = await callRoute({
      method: "put",
      path: "/:id/assistant-draft",
      tenantServices,
      params: { id: "incident-1" },
      body: { narrative: "Short narrative", draft: { facts: [{ text: "Fact" }], timeline: [], clarifications: [] } }
    });
    expect(res.statusCode).toBe(200);
    expect(tenantServices.incidentService.updateAssistantDraft).toHaveBeenCalledWith("incident-1", {
      narrative: "Short narrative",
      draft: { facts: [{ text: "Fact" }], timeline: [], clarifications: [] }
    });
  });

  it("rejects invalid assistant draft payload", async () => {
    const { res } = await callRoute({
      method: "put",
      path: "/:id/assistant-draft",
      params: { id: "incident-1" },
      body: { draft: "invalid" }
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/draft must be an object/i);
  });

  it("applies assistant timeline", async () => {
    const incidentCase = { id: "incident-1", assistantDraft: null };
    const tenantServices = createTenantServices({
      incidentService: {
        getCaseById: vi.fn().mockResolvedValue(incidentCase),
        updateTimelineEvents: vi.fn().mockResolvedValue(incidentCase)
      }
    });
    const { res } = await callRoute({
      method: "post",
      path: "/:id/assistant-draft/apply",
      tenantServices,
      params: { id: "incident-1" },
      body: {
        timeline: [
          {
            timeLabel: "09:00",
            text: "Incident reported",
            confidence: "CONFIRMED"
          }
        ]
      }
    });
    expect(res.statusCode).toBe(200);
    expect(tenantServices.incidentService.updateTimelineEvents).toHaveBeenCalledWith("incident-1", [
      {
        orderIndex: 0,
        timeLabel: "09:00",
        text: "Incident reported",
        confidence: "CONFIRMED"
      }
    ]);
  });
});
