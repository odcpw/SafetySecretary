import jhaCasesRouter from "../../src/routes/jhaCasesRouter";
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
    reportService: {
      generateJhaPdf: vi.fn(),
      generateJhaXlsx: vi.fn()
    } as any,
    llmJobManager: {
      enqueueJhaRowExtraction: vi.fn().mockReturnValue({ id: "job-1", status: "queued", type: "jha-rows" })
    } as any,
    registryService: {} as any,
    tenantDbManager: {} as any,
    tenantServiceFactory: {} as any
  };
  return { ...defaults, ...locals } as AppLocals;
};

const createTenantServices = (overrides: Partial<{ jhaService: any }> = {}) => ({
  jhaService: {
    listCases: vi.fn(),
    createCase: vi.fn(),
    getCaseById: vi.fn(),
    updateCaseMeta: vi.fn(),
    deleteCase: vi.fn(),
    updateSteps: vi.fn(),
    updateHazards: vi.fn(),
    replaceRowsFromExtraction: vi.fn()
  },
  ...overrides
});

const findRouteHandler = (method: HttpMethod, path: string) => {
  const stack = (jhaCasesRouter as any).stack as Array<any>;
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

describe("jhaCasesRouter", () => {
  it("validates create case payload", async () => {
    const { res } = await callRoute({ method: "post", path: "/", body: {} });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/jobTitle/i);
  });

  it("creates a new JHA case", async () => {
    const jhaCase = { id: "jha-1" };
    const tenantServices = createTenantServices({
      jhaService: {
        createCase: vi.fn().mockResolvedValue(jhaCase)
      }
    });
    const { res } = await callRoute({
      method: "post",
      path: "/",
      tenantServices,
      body: { jobTitle: "Concrete delivery" }
    });
    expect(res.statusCode).toBe(201);
    expect(res.body.id).toBe("jha-1");
  });

  it("queues row extraction", async () => {
    const tenantServices = createTenantServices({
      jhaService: {
        getCaseById: vi.fn().mockResolvedValue({ id: "jha-1" })
      }
    });
    const llmJobManager = {
      enqueueJhaRowExtraction: vi.fn().mockReturnValue({ id: "job-1", status: "queued" })
    } as any;
    const { res } = await callRoute({
      method: "post",
      path: "/:id/rows/extract",
      tenantServices,
      locals: { llmJobManager },
      params: { id: "jha-1" },
      body: { jobDescription: "Concrete delivery with pump" },
      auth: { dbConnectionString: "postgres://tenant" }
    });
    expect(res.statusCode).toBe(202);
    expect(res.body.id).toBe("job-1");
    expect(llmJobManager.enqueueJhaRowExtraction).toHaveBeenCalledWith({
      caseId: "jha-1",
      jobDescription: "Concrete delivery with pump",
      tenantDbUrl: "postgres://tenant"
    });
  });

  it("exports PDF", async () => {
    const tenantServices = createTenantServices({
      jhaService: {
        getCaseById: vi.fn().mockResolvedValue({ id: "jha-1" })
      }
    });
    const reportService = {
      generateJhaPdf: vi.fn().mockResolvedValue(Buffer.from("pdf"))
    } as any;
    const { res } = await callRoute({
      method: "get",
      path: "/:id/export/pdf",
      tenantServices,
      locals: { reportService },
      params: { id: "jha-1" }
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/pdf/);
    expect(reportService.generateJhaPdf).toHaveBeenCalled();
  });
});
