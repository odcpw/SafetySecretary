import assert from "node:assert/strict";
import test from "node:test";
import type { LLMTextRequest, LLMVisionRequest } from "../../../src/lib/llm";

const mockModulePath = "../../../src/lib/llm/mock.ts";
const {
  DEFAULT_MOCK_PROVIDER_SEED,
  KNOWN_TEXT_PROMPT,
  KNOWN_VISION_PROMPT,
  MockProvider,
  MockProviderUnknownInputError,
  hashOfPrompt,
} = (await import(mockModulePath)) as typeof import("../../../src/lib/llm/mock");

const baseOptions = {
  tenantId: "tenant-1",
  userId: "user-1",
  workflowId: "workflow-1",
  locale: "en",
  kind: "authoring",
} as const;

function textRequest(prompt = KNOWN_TEXT_PROMPT): LLMTextRequest {
  return {
    prompt,
    options: {
      ...baseOptions,
      promptPurpose: "mock.known-text",
      requiresVision: false,
    },
  };
}

function visionRequest(prompt = KNOWN_VISION_PROMPT): LLMVisionRequest {
  return {
    prompt,
    photos: [
      {
        mimeType: "image/png",
        data: "synthetic-fixture-image",
        filename: "synthetic.png",
      },
    ],
    options: {
      ...baseOptions,
      promptPurpose: "mock.known-vision",
      requiresVision: true,
    },
  };
}

test("known text response succeeds from the seed table", async () => {
  const provider = new MockProvider();

  const response = await provider.text(textRequest());

  assert.equal(response.text, "mock text response");
  assert.equal(provider.textInvocationCount, 1);
  assert.deepEqual(provider.invocationCounts, { text: 1, vision: 0 });
});

test("unknown text input throws loudly", async () => {
  const provider = new MockProvider();
  const prompt = "A prompt without a seeded mock response.";

  await assert.rejects(
    provider.text(textRequest(prompt)),
    (error) =>
      error instanceof MockProviderUnknownInputError &&
      error.message.includes("no canned text response") &&
      error.message.includes("ADR-0005 D7") &&
      error.message.includes(hashOfPrompt(prompt)),
  );

  assert.equal(provider.textInvocationCount, 1);
});

test("unknown vision input throws loudly", async () => {
  const provider = new MockProvider();
  const prompt = "An image prompt without a seeded mock response.";

  await assert.rejects(
    provider.vision(visionRequest(prompt)),
    (error) =>
      error instanceof MockProviderUnknownInputError &&
      error.message.includes("no canned vision response") &&
      error.message.includes("ADR-0005 D7") &&
      error.message.includes(hashOfPrompt(prompt)),
  );

  assert.equal(provider.visionInvocationCount, 1);
});

test("vision counter increments when vision is invoked", async () => {
  const provider = new MockProvider();

  assert.equal(provider.visionInvocationCount, 0);
  const response = await provider.vision(visionRequest());

  assert.equal(response.text, "mock vision response");
  assert.equal(provider.visionInvocationCount, 1);
  assert.deepEqual(provider.invocationCounts, { text: 0, vision: 1 });
});

test("vision counter can prove a later Step 0 short-circuit did not invoke vision", () => {
  const provider = new MockProvider();

  assert.equal(provider.visionInvocationCount, 0);
  assert.deepEqual(provider.invocationCounts, { text: 0, vision: 0 });
});

test("seed table is keyed by promptPurpose and hashOfPrompt", () => {
  const textSeed = DEFAULT_MOCK_PROVIDER_SEED.text[0];
  const visionSeed = DEFAULT_MOCK_PROVIDER_SEED.vision[0];

  assert.equal(textSeed.promptPurpose, "mock.known-text");
  assert.equal(textSeed.hashOfPrompt, hashOfPrompt(KNOWN_TEXT_PROMPT));
  assert.equal(visionSeed.promptPurpose, "mock.known-vision");
  assert.equal(visionSeed.hashOfPrompt, hashOfPrompt(KNOWN_VISION_PROMPT));
});
