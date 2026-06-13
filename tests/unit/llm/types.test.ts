import assert from "node:assert/strict";
import test from "node:test";
import type {
  LLMProvider,
  LLMTextRequest,
  LLMVisionRequest,
} from "../../../src/lib/llm";

const errorsModulePath = "../../../src/lib/llm/errors.ts";
const {
  MonthlyCapExceededError,
  VisionUnavailableCompanyError,
  VisionUnavailableWorkflowError,
} = (await import(errorsModulePath)) as typeof import("../../../src/lib/llm/errors");

const baseOptions = {
  tenantId: "tenant-1",
  userId: "user-1",
  workflowId: "workflow-1",
  locale: "en",
  promptPurpose: "unit-test",
  kind: "authoring",
} as const;

const textRequest: LLMTextRequest = {
  prompt: "Summarize the control proposal.",
  options: {
    ...baseOptions,
    requiresVision: false,
  },
};

const visionRequest: LLMVisionRequest = {
  prompt: "Find visible hazards.",
  photos: [
    {
      mimeType: "image/png",
      data: "base64-image-data",
      filename: "site-photo.png",
    },
  ],
  options: {
    ...baseOptions,
    kind: "generation",
    requiresVision: true,
  },
};

const generationTextRequest: LLMTextRequest = {
  prompt: "Draft the derived output from text data.",
  options: {
    ...baseOptions,
    kind: "generation",
    requiresVision: false,
  },
};

const authoringVisionRequest: LLMVisionRequest = {
  prompt: "Suggest hazards from the uploaded photo while editing.",
  photos: [],
  options: {
    ...baseOptions,
    kind: "authoring",
    requiresVision: true,
  },
};

function compileTimeContracts(provider: LLMProvider) {
  void provider.text(textRequest);
  void provider.vision(visionRequest);
  void provider.text(generationTextRequest);
  void provider.vision(authoringVisionRequest);

  void provider.text({
    prompt: "Invalid",
    options: {
      ...baseOptions,
      // @ts-expect-error text requests must not set requiresVision to true.
      requiresVision: true,
    },
  });

  void provider.vision({
    prompt: "Invalid",
    photos: [],
    options: {
      ...baseOptions,
      // @ts-expect-error vision requests must not set requiresVision to false.
      requiresVision: false,
    },
  });

  void provider.text({
    prompt: "Invalid",
    options: {
      ...baseOptions,
      // @ts-expect-error kind is authoring/generation only, never a vision discriminator.
      kind: "vision",
      requiresVision: false,
    },
  });
}

void compileTimeContracts;

test("LLM provider errors carry structured codes", () => {
  const companyError = new VisionUnavailableCompanyError();
  const workflowError = new VisionUnavailableWorkflowError();
  const capError = new MonthlyCapExceededError({ upgradePath: "byok" });

  assert.ok(companyError instanceof Error);
  assert.ok(workflowError instanceof Error);
  assert.ok(capError instanceof Error);

  assert.equal(companyError.code, "vision_unavailable_company");
  assert.equal(workflowError.code, "vision_unavailable_workflow");
  assert.equal(capError.code, "monthly_cap_exceeded");
  assert.equal(capError.upgradePath, "byok");
});
