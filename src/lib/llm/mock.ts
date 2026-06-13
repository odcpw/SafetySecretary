import type {
  LLMProvider,
  LLMResponse,
  LLMTextRequest,
  LLMVisionRequest,
} from "./types";

export type MockProviderChannel = "text" | "vision";

export interface MockProviderSeedEntry {
  readonly promptPurpose: string;
  readonly hashOfPrompt: string;
  readonly response: LLMResponse;
}

export interface MockProviderSeed {
  readonly text: readonly MockProviderSeedEntry[];
  readonly vision: readonly MockProviderSeedEntry[];
}

export interface MockProviderInvocationCounts {
  readonly text: number;
  readonly vision: number;
}

export const KNOWN_TEXT_PROMPT = "Mock text prompt for deterministic tests.";
export const KNOWN_VISION_PROMPT = "Mock vision prompt for deterministic tests.";

export const DEFAULT_MOCK_PROVIDER_SEED: MockProviderSeed = {
  text: [
    {
      promptPurpose: "mock.known-text",
      hashOfPrompt: hashOfPrompt(KNOWN_TEXT_PROMPT),
      response: {
        text: "mock text response",
        model: "mock-seed",
        provider: "mock",
      },
    },
  ],
  vision: [
    {
      promptPurpose: "mock.known-vision",
      hashOfPrompt: hashOfPrompt(KNOWN_VISION_PROMPT),
      response: {
        text: "mock vision response",
        model: "mock-seed",
        provider: "mock",
      },
    },
  ],
};

export class MockProviderUnknownInputError extends Error {
  readonly channel: MockProviderChannel;
  readonly promptPurpose: string;
  readonly hashOfPrompt: string;

  constructor(
    channel: MockProviderChannel,
    promptPurpose: string,
    hashOfPrompt: string,
  ) {
    super(
      `MockProvider has no canned ${channel} response for promptPurpose="${promptPurpose}" hashOfPrompt="${hashOfPrompt}". ADR-0005 D7 requires loud unknowns.`,
    );
    this.name = "MockProviderUnknownInputError";
    this.channel = channel;
    this.promptPurpose = promptPurpose;
    this.hashOfPrompt = hashOfPrompt;
  }
}

export class MockProvider implements LLMProvider {
  private readonly textResponses: ReadonlyMap<string, LLMResponse>;
  private readonly visionResponses: ReadonlyMap<string, LLMResponse>;
  private counts: MockProviderInvocationCounts = { text: 0, vision: 0 };

  constructor(seed: MockProviderSeed = DEFAULT_MOCK_PROVIDER_SEED) {
    this.textResponses = buildResponseMap("text", seed.text);
    this.visionResponses = buildResponseMap("vision", seed.vision);
  }

  get textInvocationCount(): number {
    return this.counts.text;
  }

  get visionInvocationCount(): number {
    return this.counts.vision;
  }

  get invocationCounts(): MockProviderInvocationCounts {
    return { ...this.counts };
  }

  resetInvocationCounters(): void {
    this.counts = { text: 0, vision: 0 };
  }

  async text(req: LLMTextRequest): Promise<LLMResponse> {
    this.counts = { ...this.counts, text: this.counts.text + 1 };
    return cloneResponse(
      lookupResponse("text", this.textResponses, req.options.promptPurpose, req.prompt),
    );
  }

  async vision(req: LLMVisionRequest): Promise<LLMResponse> {
    this.counts = { ...this.counts, vision: this.counts.vision + 1 };
    return cloneResponse(
      lookupResponse(
        "vision",
        this.visionResponses,
        req.options.promptPurpose,
        req.prompt,
      ),
    );
  }
}

export function hashOfPrompt(prompt: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < prompt.length; index += 1) {
    hash ^= prompt.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, "0");
}

function lookupResponse(
  channel: MockProviderChannel,
  responses: ReadonlyMap<string, LLMResponse>,
  promptPurpose: string,
  prompt: string,
): LLMResponse {
  const promptHash = hashOfPrompt(prompt);
  const response = responses.get(responseKey(promptPurpose, promptHash));

  if (!response) {
    throw new MockProviderUnknownInputError(channel, promptPurpose, promptHash);
  }

  return response;
}

function buildResponseMap(
  channel: MockProviderChannel,
  entries: readonly MockProviderSeedEntry[],
): ReadonlyMap<string, LLMResponse> {
  const responses = new Map<string, LLMResponse>();

  for (const entry of entries) {
    const key = responseKey(entry.promptPurpose, entry.hashOfPrompt);

    if (responses.has(key)) {
      throw new Error(
        `MockProvider seed has duplicate ${channel} response for promptPurpose="${entry.promptPurpose}" hashOfPrompt="${entry.hashOfPrompt}".`,
      );
    }

    responses.set(key, entry.response);
  }

  return responses;
}

function responseKey(promptPurpose: string, promptHash: string): string {
  return `${promptPurpose}:${promptHash}`;
}

function cloneResponse(response: LLMResponse): LLMResponse {
  return {
    ...response,
    usage: response.usage ? { ...response.usage } : undefined,
  };
}
