import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import type { NextRequest as NextRequestType } from "next/server";
import type { UserAcknowledgementStore } from "../../../src/app/api/legal/acknowledgement/route";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!context.parentURL || !specifier.startsWith(".")) {
      return nextResolve(specifier, context);
    }

    const candidates = [
      new URL(`${specifier}.ts`, context.parentURL),
      new URL(`${specifier}.tsx`, context.parentURL),
      new URL(`${specifier}.json`, context.parentURL),
      new URL(`${specifier}/index.ts`, context.parentURL),
    ];
    const resolved = candidates.find((candidate) => existsSync(candidate));

    if (resolved) {
      return {
        shortCircuit: true,
        url: resolved.href,
      };
    }

    return nextResolve(specifier, context);
  },
});

const proxyModulePath = pathToFileURL(path.resolve("src/proxy.ts")).href;
const acknowledgementRoutePath = pathToFileURL(
  path.resolve("src/app/api/legal/acknowledgement/route.ts"),
).href;
const { NextRequest } = (await import(
  "next/server.js"
)) as typeof import("next/server");
type NextRequestInit = ConstructorParameters<typeof NextRequest>[1];
const { authorizeRequest } = (await import(proxyModulePath)) as typeof import("../../../src/proxy");
const { mintCsrfToken } = (await import(
  pathToFileURL(path.resolve("src/lib/auth/csrf.ts")).href
)) as typeof import("../../../src/lib/auth/csrf");
const { handleAcknowledgementPost } = (await import(
  acknowledgementRoutePath
)) as typeof import("../../../src/app/api/legal/acknowledgement/route");

class MemoryAcknowledgementStore implements UserAcknowledgementStore {
  readonly rows: Array<{ disclaimerVersion: string; userId: string }> = [];

  async acknowledge(input: {
    disclaimerVersion: string;
    userId: string;
  }): Promise<void> {
    if (
      !this.rows.some(
        (row) =>
          row.userId === input.userId &&
          row.disclaimerVersion === input.disclaimerVersion,
      )
    ) {
      this.rows.push(input);
    }
  }
}

test("proxy redirects signed-in users without current acknowledgement", async () => {
  const session = validSession();
  const response = await authorizeRequest(
    request("/workspace?view=actions&locale=fr"),
    async () => session,
    async () => false,
  );

  assert.equal(response.status, 307);
  const location = response.headers.get("location");
  assert.ok(location);
  const redirected = new URL(location);
  assert.equal(redirected.pathname, "/disclaimer");
  assert.equal(redirected.searchParams.get("locale"), "fr");
  assert.equal(
    redirected.searchParams.get("returnTo"),
    "/workspace?view=actions&locale=fr",
  );
});

test("proxy derives disclaimer locale from persisted user locale when none is explicit", async () => {
  const session = validSession({
    userId: "11111111-1111-4111-8111-111111111113",
  });
  const response = await authorizeRequest(
    request("/workspace"),
    async () => session,
    async () => false,
    async (userId) => (userId === session.userId ? "it" : null),
  );
  const location = response.headers.get("location");
  assert.ok(location);

  const redirected = new URL(location);
  assert.equal(redirected.pathname, "/disclaimer");
  assert.equal(redirected.searchParams.get("locale"), "it");
});

test("proxy allows signed-in users with current acknowledgement", async () => {
  const session = validSession();
  const response = await authorizeRequest(
    request("/workspace"),
    async () => session,
    async (userId) => userId === session.userId,
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-middleware-next"), "1");
});

test("disclaimer page bypasses session validation", async () => {
  let validationCalls = 0;
  const validator = async () => {
    validationCalls += 1;
    return null;
  };

  assert.equal((await authorizeRequest(request("/disclaimer"), validator)).status, 200);
  assert.equal(validationCalls, 0);
});

test("acknowledgement API is authenticated and bypasses only the acknowledgement gate", async () => {
  const session = validSession();
  const csrfValue = mintCsrfToken(session.id);
  assert.equal(
    (
      await authorizeRequest(
        request("/api/legal/acknowledgement", {
          headers: {
            cookie: `ssfw_session=${randomUUID()}; ssfw_csrf=${csrfValue}`,
            "x-ssfw-csrf": csrfValue,
          },
          method: "POST",
        }),
        async () => session,
        async () => false,
      )
    ).status,
    200,
  );
});

test("acknowledgement API rejects requests without a session", async () => {
  const response = await handleAcknowledgementPost(
    request("/api/legal/acknowledgement", {
      body: JSON.stringify({ acknowledge: true }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
    new MemoryAcknowledgementStore(),
  );

  assert.equal(response.status, 401);
});

test("acknowledgement API records the current version and redirects to returnTo", async () => {
  const store = new MemoryAcknowledgementStore();
  const userId = randomUUID();
  const tenantId = randomUUID();
  const response = await handleAcknowledgementPost(
    request("/api/legal/acknowledgement?returnTo=/workspace/actions", {
      body: new URLSearchParams({ acknowledge: "true" }).toString(),
      headers: {
        accept: "text/html",
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    }),
    store,
    async () => ({ tenantId, userId }),
  );

  assert.equal(response.status, 303);
  assert.equal(new URL(response.headers.get("location") ?? "").pathname, "/workspace/actions");
  assert.equal(store.rows.length, 1);
  assert.equal(store.rows[0]?.userId, userId);
  assert.match(store.rows[0]?.disclaimerVersion ?? "", /^\d{4}\.\d+\.\d+\+/);
});

function request(pathname: string, init: NextRequestInit = {}): NextRequestType {
  return new NextRequest(`https://app.example.test${pathname}`, init);
}

function validSession(overrides: Partial<ReturnType<typeof validSessionBase>> = {}) {
  return {
    ...validSessionBase(),
    ...overrides,
  };
}

function validSessionBase() {
  return {
    deviceHint: "desktop" as const,
    expiresAt: new Date("2026-05-30T00:00:00.000Z"),
    id: randomUUID(),
    lastSeenAt: new Date("2026-04-30T00:00:00.000Z"),
    tenantId: randomUUID(),
    userId: randomUUID(),
  };
}
