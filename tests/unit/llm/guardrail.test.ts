import assert from "node:assert/strict";
import test from "node:test";

const guardrailModulePath = "../../../src/lib/llm/guardrail.ts";
const { REAL_PROVIDER_GUARDRAIL_MESSAGE, assertRealProviderAllowed } =
  (await import(guardrailModulePath)) as typeof import("../../../src/lib/llm/guardrail");

const originalNodeEnv = process.env.NODE_ENV;
const originalValidationFlag = process.env.LLM_VALIDATION_OK;

function restoreEnv() {
  setOptionalEnv("NODE_ENV", originalNodeEnv);
  setOptionalEnv("LLM_VALIDATION_OK", originalValidationFlag);
}

function setOptionalEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

test.afterEach(restoreEnv);

test("guardrail throws in test mode without LLM_VALIDATION_OK=1", () => {
  setOptionalEnv("NODE_ENV", "test");
  setOptionalEnv("LLM_VALIDATION_OK", undefined);

  assert.throws(
    () => assertRealProviderAllowed("OpenAIProvider"),
    (error) =>
      error instanceof Error &&
      error.message.includes("OpenAIProvider blocked") &&
      error.message.includes("ADR-0005 D7") &&
      error.message.includes("LLM_VALIDATION_OK=1"),
  );
});

test("guardrail allows the documented test escape with LLM_VALIDATION_OK=1", () => {
  setOptionalEnv("NODE_ENV", "test");
  setOptionalEnv("LLM_VALIDATION_OK", "1");

  assert.doesNotThrow(() => assertRealProviderAllowed("OpenAIProvider"));
});

test("guardrail is a no-op outside test mode", () => {
  setOptionalEnv("NODE_ENV", "development");
  setOptionalEnv("LLM_VALIDATION_OK", undefined);

  assert.doesNotThrow(() => assertRealProviderAllowed("OpenAIProvider"));
});

test("guardrail exports the ADR-0005 D7 message for evidence capture", () => {
  assert.match(REAL_PROVIDER_GUARDRAIL_MESSAGE, /ADR-0005 D7/);
  assert.match(REAL_PROVIDER_GUARDRAIL_MESSAGE, /MockProvider/);
  assert.match(REAL_PROVIDER_GUARDRAIL_MESSAGE, /LLM_VALIDATION_OK=1/);
});
