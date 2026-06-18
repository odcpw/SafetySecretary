import { assertRealProviderAllowed } from "./guardrail";
import { NoKeyProvider, type NoProviderConfiguredUpgradePath } from "./no-key";
import type {
  LLMProvider,
  LLMResponse,
  LLMTextRequest,
  LLMTokenUsage,
  LLMVisionImage,
  LLMVisionRequest,
} from "./types";

const OPENAI_CHAT_COMPLETIONS_URL =
  "https://api.openai.com/v1/chat/completions";
const DEFAULT_OPENAI_TEXT_MODEL = "gpt-5.5";
const DEFAULT_OPENAI_VISION_MODEL = "gpt-4o-mini";

type Fetch = typeof fetch;

type ChatCompletionTextContent = string;

type ChatCompletionVisionContent = readonly (
  | {
      readonly type: "text";
      readonly text: string;
    }
  | {
      readonly type: "image_url";
      readonly image_url: {
        readonly url: string;
      };
    }
)[];

interface ChatCompletionMessage {
  readonly role: "system" | "user";
  readonly content: ChatCompletionTextContent | ChatCompletionVisionContent;
}

interface ChatCompletionRequestBody {
  readonly model: string;
  readonly messages: readonly ChatCompletionMessage[];
}

interface ChatCompletionResponseBody {
  readonly model?: unknown;
  readonly choices?: unknown;
  readonly usage?: unknown;
}

export interface OpenAIProviderOptions {
  readonly textModel?: string;
  readonly visionModel?: string;
  readonly fetch?: Fetch;
  readonly chatCompletionsUrl?: string;
}

export interface CreateOpenAIProviderFromEnvOptions
  extends OpenAIProviderOptions {
  readonly noKeyUpgradePath?: NoProviderConfiguredUpgradePath;
}

export interface LLMResponseErrorOptions {
  readonly status?: number;
  readonly message?: string;
  readonly responseBody?: string;
  readonly cause?: unknown;
}

export class LLMResponseError extends Error {
  readonly code = "llm_response_error";
  readonly provider = "openai";
  readonly status?: number;
  readonly responseBody?: string;

  constructor(options: LLMResponseErrorOptions = {}) {
    super(options.message ?? "OpenAI response could not be processed.", {
      cause: options.cause,
    });
    this.name = "LLMResponseError";
    this.status = options.status;
    this.responseBody = options.responseBody;
  }
}

export class OpenAIProviderConfigurationError extends Error {
  readonly code = "openai_provider_not_configured";

  constructor() {
    super("OPENAI_API_KEY is required to construct OpenAIProvider.");
    this.name = "OpenAIProviderConfigurationError";
  }
}

export class OpenAIProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly textModel: string;
  private readonly visionModel: string;
  private readonly fetchFn: Fetch;
  private readonly chatCompletionsUrl: string;

  constructor(options: OpenAIProviderOptions = {}) {
    assertRealProviderAllowed("OpenAIProvider");

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new OpenAIProviderConfigurationError();
    }

    this.apiKey = apiKey;
    this.textModel =
      options.textModel ?? process.env.LLM_TEXT_MODEL ?? DEFAULT_OPENAI_TEXT_MODEL;
    this.visionModel =
      options.visionModel ??
      process.env.LLM_VISION_MODEL ??
      process.env.LLM_TEXT_MODEL ??
      DEFAULT_OPENAI_VISION_MODEL;
    this.fetchFn = options.fetch ?? fetch;
    this.chatCompletionsUrl =
      options.chatCompletionsUrl ?? OPENAI_CHAT_COMPLETIONS_URL;
  }

  async text(req: LLMTextRequest): Promise<LLMResponse> {
    return this.postChatCompletion({
      model: this.textModel,
      messages: [
        {
          role: "system",
          content: buildLocaleSystemMessage(req),
        },
        {
          role: "user",
          content: req.prompt,
        },
      ],
    });
  }

  async vision(req: LLMVisionRequest): Promise<LLMResponse> {
    return this.postChatCompletion({
      model: this.visionModel,
      messages: [
        {
          role: "system",
          content: buildLocaleSystemMessage(req),
        },
        {
          role: "user",
          content: [
            { type: "text", text: req.prompt },
            ...req.photos.map((photo) => ({
              type: "image_url" as const,
              image_url: {
                url: imageToDataUrl(photo),
              },
            })),
          ],
        },
      ],
    });
  }

  private async postChatCompletion(
    body: ChatCompletionRequestBody,
  ): Promise<LLMResponse> {
    let response: Response;

    try {
      response = await this.fetchFn(this.chatCompletionsUrl, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new LLMResponseError({
        message: "OpenAI request failed.",
        cause: error,
      });
    }

    const responseText = await response.text();

    if (!response.ok) {
      throw new LLMResponseError({
        status: response.status,
        message: `OpenAI request failed with status ${response.status}.`,
        responseBody: responseText,
      });
    }

    return parseChatCompletionResponse(responseText);
  }
}

export function createOpenAIProviderFromEnv(
  options: CreateOpenAIProviderFromEnvOptions = {},
): LLMProvider {
  if (!process.env.OPENAI_API_KEY) {
    return new NoKeyProvider({
      upgradePath: options.noKeyUpgradePath ?? "set_openai_key",
    });
  }

  return new OpenAIProvider(options);
}

function buildLocaleSystemMessage(req: LLMTextRequest | LLMVisionRequest): string {
  return [
    "You are Safety Secretary's LLM provider adapter.",
    `Respond in locale "${req.options.locale}" per ADR-0003 D6.`,
    `Request kind: ${req.options.kind}.`,
    `Prompt purpose: ${req.options.promptPurpose}.`,
    `Requires vision: ${String(req.options.requiresVision)}.`,
  ].join(" ");
}

function imageToDataUrl(photo: LLMVisionImage): string {
  if (typeof photo.data === "string") {
    if (photo.data.startsWith("data:")) {
      return photo.data;
    }

    return `data:${photo.mimeType};base64,${photo.data}`;
  }

  const bytes =
    photo.data instanceof ArrayBuffer
      ? Buffer.from(photo.data)
      : Buffer.from(photo.data.buffer, photo.data.byteOffset, photo.data.byteLength);

  return `data:${photo.mimeType};base64,${bytes.toString("base64")}`;
}

function parseChatCompletionResponse(responseText: string): LLMResponse {
  let body: ChatCompletionResponseBody;

  try {
    body = JSON.parse(responseText) as ChatCompletionResponseBody;
  } catch (error) {
    throw new LLMResponseError({
      message: "OpenAI response was not valid JSON.",
      responseBody: responseText,
      cause: error,
    });
  }

  const content = firstChoiceContent(body.choices);
  if (typeof content !== "string") {
    throw new LLMResponseError({
      message: "OpenAI response did not include message content.",
      responseBody: responseText,
    });
  }

  return {
    text: content,
    model: typeof body.model === "string" ? body.model : undefined,
    provider: "openai",
    usage: parseUsage(body.usage),
  };
}

function firstChoiceContent(choices: unknown): unknown {
  if (!Array.isArray(choices)) {
    return undefined;
  }

  const [first] = choices;
  if (!isRecord(first)) {
    return undefined;
  }

  const message = first.message;
  if (!isRecord(message)) {
    return undefined;
  }

  return message.content;
}

function parseUsage(usage: unknown): LLMTokenUsage | undefined {
  if (!isRecord(usage)) {
    return undefined;
  }

  const promptTokens = usage.prompt_tokens;
  const completionTokens = usage.completion_tokens;

  if (typeof promptTokens !== "number" || typeof completionTokens !== "number") {
    return undefined;
  }

  return {
    inputTokens: promptTokens,
    outputTokens: completionTokens,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
