import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import type { LLMTextRequest, LLMVisionRequest } from "../../../src/lib/llm";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier === "./guardrail" &&
      context.parentURL?.endsWith("/src/lib/llm/openai.ts")
    ) {
      return localModuleUrl("src/lib/llm/guardrail.ts");
    }

    if (
      specifier === "./no-key" &&
      context.parentURL?.endsWith("/src/lib/llm/openai.ts")
    ) {
      return localModuleUrl("src/lib/llm/no-key.ts");
    }

    return nextResolve(specifier, context);
  },
});

const openAiModulePath = pathToFileURL(path.resolve("src/lib/llm/openai.ts")).href;
const noKeyModulePath = pathToFileURL(path.resolve("src/lib/llm/no-key.ts")).href;
const {
  LLMResponseError,
  OpenAIProvider,
  OpenAIProviderConfigurationError,
  createOpenAIProviderFromEnv,
} = (await import(openAiModulePath)) as typeof import("../../../src/lib/llm/openai");
const { NoKeyProvider, NoProviderConfiguredError } = (await import(
  noKeyModulePath
)) as typeof import("../../../src/lib/llm/no-key");

const originalNodeEnv = process.env.NODE_ENV;
const originalValidationFlag = process.env.LLM_VALIDATION_OK;
const originalOpenAiApiKey = process.env.OPENAI_API_KEY;
const originalTextModel = process.env.LLM_TEXT_MODEL;
const originalVisionModel = process.env.LLM_VISION_MODEL;
const fixtureValue = "fixture-value";
const firstFixtureValue = "fixture-value-first";
const secondFixtureValue = "fixture-value-second";

type CapturedRequest = {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
};

function restoreEnv() {
  setOptionalEnv("NODE_ENV", originalNodeEnv);
  setOptionalEnv("LLM_VALIDATION_OK", originalValidationFlag);
  setOptionalEnv("OPENAI_API_KEY", originalOpenAiApiKey);
  setOptionalEnv("LLM_TEXT_MODEL", originalTextModel);
  setOptionalEnv("LLM_VISION_MODEL", originalVisionModel);
}

function setOptionalEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function allowRealProviderInTest() {
  setOptionalEnv("NODE_ENV", "test");
  setOptionalEnv("LLM_VALIDATION_OK", "1");
}

function setOpenAiKey(value = fixtureValue) {
  setOptionalEnv("OPENAI_API_KEY", value);
}

test.afterEach(restoreEnv);

test("constructor is blocked in default test mode", () => {
  setOptionalEnv("NODE_ENV", "test");
  setOptionalEnv("LLM_VALIDATION_OK", undefined);

  assert.throws(
    () =>
      new OpenAIProvider({
        fetch: async () => jsonResponse({}),
      }),
    /OpenAIProvider blocked/,
  );
});

test("constructor ignores stray apiKey options and requires OPENAI_API_KEY env", () => {
  allowRealProviderInTest();
  setOptionalEnv("OPENAI_API_KEY", undefined);
  const optionsWithStrayApiKey = {
    apiKey: fixtureValue,
    fetch: async () => jsonResponse({}),
  } as unknown as ConstructorParameters<typeof OpenAIProvider>[0];

  assert.throws(
    () => new OpenAIProvider(optionsWithStrayApiKey),
    OpenAIProviderConfigurationError,
  );
});

test("text request posts chat completion body and parses response", async () => {
  allowRealProviderInTest();
  setOpenAiKey();
  const captured: CapturedRequest[] = [];
  const provider = new OpenAIProvider({
    textModel: "gpt-test-text",
    fetch: mockFetch(captured, {
      model: "gpt-test-text",
      choices: [{ message: { content: "Kontrollvorschlag" } }],
      usage: { prompt_tokens: 11, completion_tokens: 7 },
    }),
  });

  const response = await provider.text(textRequest());

  assert.equal(response.text, "Kontrollvorschlag");
  assert.equal(response.model, "gpt-test-text");
  assert.equal(response.provider, "openai");
  assert.deepEqual(response.usage, { inputTokens: 11, outputTokens: 7 });
  assert.equal(captured.length, 1);
  assert.equal(captured[0].url, "https://api.openai.com/v1/chat/completions");
  assert.equal(captured[0].headers.get("authorization"), `Bearer ${fixtureValue}`);
  assert.equal(captured[0].body.model, "gpt-test-text");
  assert.equal(JSON.stringify(captured[0].body).includes(fixtureValue), false);

  const messages = captured[0].body.messages as Array<{
    role: string;
    content: string;
  }>;
  assert.match(messages[0].content, /locale "de"/);
  assert.match(messages[0].content, /Request kind: authoring/);
  assert.match(messages[0].content, /Prompt purpose: openai.text/);
  assert.equal(messages[1].content, "Welche Massnahmen schlägst du vor?");
});

test("vision request sends text and image parts", async () => {
  allowRealProviderInTest();
  setOpenAiKey();
  const captured: CapturedRequest[] = [];
  const provider = new OpenAIProvider({
    visionModel: "gpt-test-vision",
    fetch: mockFetch(captured, {
      model: "gpt-test-vision",
      choices: [{ message: { content: "Visible hazard summary" } }],
    }),
  });

  const response = await provider.vision(visionRequest());

  assert.equal(response.text, "Visible hazard summary");
  assert.equal(captured[0].body.model, "gpt-test-vision");

  const messages = captured[0].body.messages as Array<{
    role: string;
    content: unknown;
  }>;
  assert.match(String(messages[0].content), /locale "en"/);
  assert.match(String(messages[0].content), /Request kind: generation/);

  const content = messages[1].content as Array<{
    type: string;
    text?: string;
    image_url?: { url: string };
  }>;
  assert.deepEqual(content[0], {
    type: "text",
    text: "Find visible hazards.",
  });
  assert.equal(content[1].type, "image_url");
  assert.equal(content[1].image_url?.url, "data:image/png;base64,cGhvdG8=");
});

test("HTTP errors and network failures are typed LLMResponseError instances", async () => {
  allowRealProviderInTest();
  setOpenAiKey();
  const httpProvider = new OpenAIProvider({
    fetch: async () =>
      new Response(JSON.stringify({ error: { message: "rate limited" } }), {
        status: 429,
      }),
  });
  const networkProvider = new OpenAIProvider({
    fetch: async () => {
      throw new TypeError("socket closed");
    },
  });

  await assert.rejects(
    httpProvider.text(textRequest()),
    (error) =>
      error instanceof LLMResponseError &&
      error.code === "llm_response_error" &&
      error.status === 429,
  );
  await assert.rejects(
    networkProvider.text(textRequest()),
    (error) =>
      error instanceof LLMResponseError &&
      error.code === "llm_response_error" &&
      error.status === undefined,
  );
});

test("env key is read once at construction and not included in request body", async () => {
  allowRealProviderInTest();
  setOpenAiKey(firstFixtureValue);
  setOptionalEnv("LLM_TEXT_MODEL", "gpt-env-text");
  setOptionalEnv("LLM_VISION_MODEL", undefined);
  const captured: CapturedRequest[] = [];
  const provider = new OpenAIProvider({
    fetch: mockFetch(captured, {
      choices: [{ message: { content: "ok" } }],
    }),
  });
  setOpenAiKey(secondFixtureValue);

  await provider.text(textRequest());

  assert.equal(captured[0].headers.get("authorization"), `Bearer ${firstFixtureValue}`);
  assert.equal(JSON.stringify(captured[0].body).includes(firstFixtureValue), false);
  assert.equal(JSON.stringify(captured[0].body).includes(secondFixtureValue), false);
});

test("NoKeyProvider returns typed no-provider errors", async () => {
  const byokProvider = new NoKeyProvider({ upgradePath: "byok" });
  const localProvider = new NoKeyProvider({ upgradePath: "local" });

  await assert.rejects(
    byokProvider.text(textRequest()),
    (error) =>
      error instanceof NoProviderConfiguredError &&
      error.code === "no_provider_configured" &&
      error.upgradePath === "byok",
  );
  await assert.rejects(
    localProvider.vision(visionRequest()),
    (error) =>
      error instanceof NoProviderConfiguredError &&
      error.code === "no_provider_configured" &&
      error.upgradePath === "local",
  );
});

test("factory returns NoKeyProvider when OPENAI_API_KEY is unset", async () => {
  setOptionalEnv("OPENAI_API_KEY", undefined);
  setOptionalEnv("LLM_TEXT_MODEL", "gpt-env-text");
  setOptionalEnv("LLM_VISION_MODEL", undefined);
  const provider = createOpenAIProviderFromEnv({
    noKeyUpgradePath: "set_openai_key",
  });

  await assert.rejects(
    provider.text(textRequest()),
    (error) =>
      error instanceof NoProviderConfiguredError &&
      error.code === "no_provider_configured" &&
      error.upgradePath === "set_openai_key",
  );
});

test("provider calls do not write default logs", async () => {
  allowRealProviderInTest();
  setOpenAiKey();
  const calls: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    calls.push(JSON.stringify(args));
  };
  console.warn = (...args: unknown[]) => {
    calls.push(JSON.stringify(args));
  };
  console.error = (...args: unknown[]) => {
    calls.push(JSON.stringify(args));
  };

  try {
    const provider = new OpenAIProvider({
      fetch: mockFetch([], {
        choices: [{ message: { content: "ok" } }],
      }),
    });

    await provider.text(textRequest());
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }

  assert.deepEqual(calls, []);
});

function textRequest(): LLMTextRequest {
  return {
    prompt: "Welche Massnahmen schlägst du vor?",
    options: {
      tenantId: "tenant-1",
      userId: "user-1",
      workflowId: "workflow-1",
      locale: "de",
      promptPurpose: "openai.text",
      kind: "authoring",
      requiresVision: false,
    },
  };
}

function visionRequest(): LLMVisionRequest {
  return {
    prompt: "Find visible hazards.",
    photos: [
      {
        mimeType: "image/png",
        data: "cGhvdG8=",
        filename: "photo.png",
      },
    ],
    options: {
      tenantId: "tenant-1",
      userId: "user-1",
      workflowId: "workflow-1",
      locale: "en",
      promptPurpose: "openai.vision",
      kind: "generation",
      requiresVision: true,
    },
  };
}

function mockFetch(
  captured: CapturedRequest[],
  responseBody: Record<string, unknown>,
): typeof fetch {
  return async (url, init) => {
    const headers = new Headers(init?.headers);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    } catch (error) {
      throw new Error("Test mock received invalid JSON request body.", {
        cause: error,
      });
    }

    captured.push({
      url: String(url),
      headers,
      body,
    });
    return jsonResponse(responseBody);
  };
}

function jsonResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function localModuleUrl(relativePath: string) {
  return {
    shortCircuit: true,
    url: pathToFileURL(path.resolve(relativePath)).href,
  };
}
