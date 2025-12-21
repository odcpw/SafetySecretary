import authRouter from "../../src/routes/authRouter";
import { AppLocals } from "../../src/types/app";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "../../src/services/passwordHasher";
import { sessionTtlMs } from "../../src/middleware/sessionAuth";
import { env } from "../../src/config/env";

type HttpMethod = "post";

type MockResponse = {
  statusCode: number;
  body: any;
  cookies: Record<string, { value: string; options: any }>;
  clearedCookies: string[];
  status: (code: number) => MockResponse;
  json: (value: any) => MockResponse;
  send: (value?: any) => MockResponse;
  cookie: (name: string, value: string, options?: any) => void;
  clearCookie: (name: string, options?: any) => void;
};

const createMockResponse = (): MockResponse => {
  const res: MockResponse = {
    statusCode: 200,
    body: undefined,
    cookies: {},
    clearedCookies: [],
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
    cookie(name: string, value: string, options?: any) {
      res.cookies[name] = { value, options };
    },
    clearCookie(name: string) {
      res.clearedCookies.push(name);
    }
  };
  return res;
};

const findRouteHandler = (method: HttpMethod, path: string) => {
  const stack = (authRouter as any).stack as Array<any>;
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

const buildRegistryMock = (overrides: Partial<AppLocals["registryService"]> = {}) => {
  return {
    getOrganizationBySlug: vi.fn(),
    getOrgUserByUsername: vi.fn(),
    createOrgSession: vi.fn(),
    updateOrgUser: vi.fn(),
    deleteOrgSessionsForUser: vi.fn(),
    recordLoginAttempt: vi.fn(),
    ...overrides
  } as any;
};

const callRoute = async (opts: { body?: any; registry?: any }) => {
  const handler = findRouteHandler("post", "/login");
  const req: any = {
    body: opts.body ?? {},
    app: { locals: { registryService: opts.registry ?? buildRegistryMock() } },
    headers: { "user-agent": "vitest" },
    ip: "127.0.0.1"
  };
  const res = createMockResponse();
  await handler(req, res);
  return { req, res, registry: req.app.locals.registryService };
};

afterEach(() => {
  vi.clearAllMocks();
});

describe("authRouter /login", () => {
  it("issues a session cookie on successful login", async () => {
    const passwordHash = await hashPassword("secret");
    const registry = buildRegistryMock({
      getOrganizationBySlug: vi.fn().mockResolvedValue({
        id: "org-1",
        slug: "acme",
        name: "Acme",
        status: "ACTIVE",
        dbConnectionString: "postgres://tenant",
        storageRoot: "/tmp/acme"
      }),
      getOrgUserByUsername: vi.fn().mockResolvedValue({
        id: "user-1",
        orgId: "org-1",
        username: "sam",
        email: "sam@example.com",
        role: "ADMIN",
        status: "ACTIVE",
        passwordHash,
        failedAttempts: 0,
        lockedUntil: null,
        locale: "en"
      }),
      createOrgSession: vi.fn().mockResolvedValue({
        id: "sess-1",
        orgId: "org-1",
        orgUserId: "user-1",
        rememberMe: false,
        expiresAt: new Date(Date.now() + 60_000)
      })
    });

    const { res } = await callRoute({
      registry,
      body: { orgSlug: "acme", username: "sam", password: "secret", rememberMe: false }
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.user.username).toBe("sam");
    expect(Object.keys(res.cookies).length).toBe(1);
    expect(res.cookies[env.sessionCookieName]?.options.maxAge).toBe(sessionTtlMs(false));
  });

  it("uses extended TTL when remember me is selected", async () => {
    const passwordHash = await hashPassword("secret");
    const registry = buildRegistryMock({
      getOrganizationBySlug: vi.fn().mockResolvedValue({
        id: "org-1",
        slug: "acme",
        name: "Acme",
        status: "ACTIVE",
        dbConnectionString: "postgres://tenant",
        storageRoot: "/tmp/acme"
      }),
      getOrgUserByUsername: vi.fn().mockResolvedValue({
        id: "user-1",
        orgId: "org-1",
        username: "sam",
        email: "sam@example.com",
        role: "ADMIN",
        status: "ACTIVE",
        passwordHash,
        failedAttempts: 0,
        lockedUntil: null,
        locale: "en"
      }),
      createOrgSession: vi.fn().mockResolvedValue({
        id: "sess-1",
        orgId: "org-1",
        orgUserId: "user-1",
        rememberMe: true,
        expiresAt: new Date(Date.now() + sessionTtlMs(true))
      })
    });

    const { res } = await callRoute({
      registry,
      body: { orgSlug: "acme", username: "sam", password: "secret", rememberMe: true }
    });

    expect(res.statusCode).toBe(200);
    expect(res.cookies[env.sessionCookieName]?.options.maxAge).toBe(sessionTtlMs(true));
  });

  it("returns lockout metadata when attempts exceed limit", async () => {
    const passwordHash = await hashPassword("secret");
    const registry = buildRegistryMock({
      getOrganizationBySlug: vi.fn().mockResolvedValue({
        id: "org-1",
        slug: "acme",
        name: "Acme",
        status: "ACTIVE",
        dbConnectionString: "postgres://tenant",
        storageRoot: "/tmp/acme"
      }),
      getOrgUserByUsername: vi.fn().mockResolvedValue({
        id: "user-1",
        orgId: "org-1",
        username: "sam",
        email: "sam@example.com",
        role: "ADMIN",
        status: "ACTIVE",
        passwordHash,
        failedAttempts: 4,
        lockedUntil: null,
        locale: "en"
      })
    });

    const { res, registry: registryMock } = await callRoute({
      registry,
      body: { orgSlug: "acme", username: "sam", password: "wrong", rememberMe: false }
    });

    expect(res.statusCode).toBe(401);
    expect(res.body.remainingAttempts).toBe(0);
    expect(res.body.lockedUntil).toBeTruthy();
    expect(registryMock.updateOrgUser).toHaveBeenCalled();
  });

  it("blocks locked accounts with future lockout", async () => {
    const passwordHash = await hashPassword("secret");
    const registry = buildRegistryMock({
      getOrganizationBySlug: vi.fn().mockResolvedValue({
        id: "org-1",
        slug: "acme",
        name: "Acme",
        status: "ACTIVE",
        dbConnectionString: "postgres://tenant",
        storageRoot: "/tmp/acme"
      }),
      getOrgUserByUsername: vi.fn().mockResolvedValue({
        id: "user-1",
        orgId: "org-1",
        username: "sam",
        email: "sam@example.com",
        role: "ADMIN",
        status: "LOCKED",
        passwordHash,
        failedAttempts: 5,
        lockedUntil: new Date(Date.now() + 60_000),
        locale: "en"
      })
    });

    const { res } = await callRoute({
      registry,
      body: { orgSlug: "acme", username: "sam", password: "secret", rememberMe: false }
    });

    expect(res.statusCode).toBe(423);
    expect(res.body.error).toMatch(/locked/i);
  });
});
