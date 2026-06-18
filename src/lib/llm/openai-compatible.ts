import { assertRealProviderAllowed } from "./guardrail";
import type {
	LLMProvider,
	LLMResponse,
	LLMTextRequest,
	LLMTokenUsage,
	LLMVisionImage,
	LLMVisionRequest,
} from "./types";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_TEXT_MODEL = "gpt-5.5";
const DEFAULT_VISION_MODEL = "gpt-4o-mini";

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

type ChatCompletionMessage = {
	readonly role: "system" | "user";
	readonly content: ChatCompletionTextContent | ChatCompletionVisionContent;
};

type ChatCompletionRequestBody = {
	readonly model: string;
	readonly messages: readonly ChatCompletionMessage[];
};

type ChatCompletionResponseBody = {
	readonly model?: unknown;
	readonly choices?: unknown;
	readonly usage?: unknown;
};

export type OpenAICompatibleProviderConfig = {
	readonly baseUrl: string;
	readonly apiKey?: string;
	readonly textModel: string;
	readonly visionModel: string;
};

export type OpenAICompatibleProviderOptions =
	Partial<OpenAICompatibleProviderConfig> & {
		readonly config?: Partial<OpenAICompatibleProviderConfig>;
		readonly fetch?: Fetch;
	};

export type CreateOpenAICompatibleProviderFromEnvOptions = {
	readonly fetch?: Fetch;
};

export type OpenAICompatibleResponseErrorOptions = {
	readonly status?: number;
	readonly message?: string;
	readonly responseBody?: string;
	readonly cause?: unknown;
};

export class OpenAICompatibleProviderConfigurationError extends Error {
	readonly code = "openai_compatible_provider_not_configured";

	constructor(message: string) {
		super(message);
		this.name = "OpenAICompatibleProviderConfigurationError";
	}
}

export class OpenAICompatibleResponseError extends Error {
	readonly code = "llm_response_error";
	readonly provider = "openai-compatible";
	readonly status?: number;
	readonly responseBody?: string;

	constructor(options: OpenAICompatibleResponseErrorOptions = {}) {
		super(
			options.message ?? "OpenAI-compatible response could not be processed.",
			{ cause: options.cause },
		);
		this.name = "OpenAICompatibleResponseError";
		this.status = options.status;
		this.responseBody = options.responseBody;
	}
}

export class OpenAICompatibleProvider implements LLMProvider {
	private readonly apiKey?: string;
	private readonly textModel: string;
	private readonly visionModel: string;
	private readonly fetchFn: Fetch;
	private readonly chatCompletionsUrl: string;
	private readonly providerName: string;

	constructor(options: OpenAICompatibleProviderOptions = {}) {
		assertRealProviderAllowed("OpenAICompatibleProvider");

		const config = normalizeProviderConfig(
			{
				...options,
				...options.config,
			},
			true,
		);

		this.apiKey = config.apiKey;
		this.textModel = config.textModel;
		this.visionModel = config.visionModel;
		this.fetchFn = options.fetch ?? fetch;
		this.chatCompletionsUrl = chatCompletionsUrl(config.baseUrl);
		this.providerName = providerName(config.baseUrl);
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
			const headers: Record<string, string> = {
				"content-type": "application/json",
			};

			if (this.apiKey) {
				headers.authorization = `Bearer ${this.apiKey}`;
			}

			response = await this.fetchFn(this.chatCompletionsUrl, {
				method: "POST",
				headers,
				body: JSON.stringify(body),
			});
		} catch (error) {
			throw new OpenAICompatibleResponseError({
				message: "OpenAI-compatible request failed.",
				cause: error,
			});
		}

		const responseText = await response.text();

		if (!response.ok) {
			throw new OpenAICompatibleResponseError({
				status: response.status,
				message: `OpenAI-compatible request failed with status ${response.status}.`,
				responseBody: responseText,
			});
		}

		return parseChatCompletionResponse(responseText, this.providerName);
	}
}

export function createOpenAICompatibleProviderFromEnv(
	options: CreateOpenAICompatibleProviderFromEnvOptions = {},
): OpenAICompatibleProvider {
	return new OpenAICompatibleProvider({
		baseUrl: process.env.LLM_BASE_URL,
		apiKey: process.env.LLM_API_KEY,
		textModel: process.env.LLM_TEXT_MODEL,
		visionModel: process.env.LLM_VISION_MODEL,
		fetch: options.fetch,
	});
}

export function normalizeOpenAICompatibleConfig(
	config: Partial<OpenAICompatibleProviderConfig>,
): OpenAICompatibleProviderConfig {
	return normalizeProviderConfig(config, false);
}

function normalizeProviderConfig(
	config: Partial<OpenAICompatibleProviderConfig>,
	useEnv: boolean,
): OpenAICompatibleProviderConfig {
	const baseUrl = normalizeBaseUrl(
		config.baseUrl ?? (useEnv ? process.env.LLM_BASE_URL : undefined),
	);
	const textModel = nonEmpty(
		config.textModel ??
			(useEnv ? process.env.LLM_TEXT_MODEL : undefined) ??
			DEFAULT_TEXT_MODEL,
		"LLM_TEXT_MODEL",
	);
	const visionModel = nonEmpty(
		config.visionModel ??
			(useEnv ? process.env.LLM_VISION_MODEL : undefined) ??
			config.textModel ??
			(useEnv ? process.env.LLM_TEXT_MODEL : undefined) ??
			DEFAULT_VISION_MODEL,
		"LLM_VISION_MODEL",
	);
	const apiKey = optionalNonEmpty(
		config.apiKey ?? (useEnv ? process.env.LLM_API_KEY : undefined),
	);

	return {
		baseUrl,
		apiKey,
		textModel,
		visionModel,
	};
}

function normalizeBaseUrl(value: string | undefined): string {
	const raw = nonEmpty(value ?? DEFAULT_BASE_URL, "LLM_BASE_URL");
	let parsed: URL;

	try {
		parsed = new URL(raw);
	} catch {
		throw new OpenAICompatibleProviderConfigurationError(
			"LLM_BASE_URL must be an absolute http(s) URL.",
		);
	}

	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new OpenAICompatibleProviderConfigurationError(
			"LLM_BASE_URL must use http or https.",
		);
	}

	parsed.pathname = parsed.pathname.replace(/\/+$/, "");
	parsed.search = "";
	parsed.hash = "";

	return parsed.toString().replace(/\/$/, "");
}

function chatCompletionsUrl(baseUrl: string): string {
	if (baseUrl.endsWith("/chat/completions")) {
		return baseUrl;
	}

	return `${baseUrl}/chat/completions`;
}

function providerName(baseUrl: string): string {
	return `compatible:${new URL(baseUrl).host}`;
}

function nonEmpty(value: string | undefined, name: string): string {
	const normalized = value?.trim();

	if (!normalized) {
		throw new OpenAICompatibleProviderConfigurationError(
			`${name} is required.`,
		);
	}

	return normalized;
}

function optionalNonEmpty(value: string | undefined): string | undefined {
	const normalized = value?.trim();
	return normalized ? normalized : undefined;
}

function buildLocaleSystemMessage(
	req: LLMTextRequest | LLMVisionRequest,
): string {
	return [
		"You are Safety Secretary's OpenAI-compatible provider adapter.",
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
			: Buffer.from(
					photo.data.buffer,
					photo.data.byteOffset,
					photo.data.byteLength,
				);

	return `data:${photo.mimeType};base64,${bytes.toString("base64")}`;
}

function parseChatCompletionResponse(
	responseText: string,
	provider: string,
): LLMResponse {
	let body: ChatCompletionResponseBody;

	try {
		body = JSON.parse(responseText) as ChatCompletionResponseBody;
	} catch (error) {
		throw new OpenAICompatibleResponseError({
			message: "OpenAI-compatible response was not valid JSON.",
			responseBody: responseText,
			cause: error,
		});
	}

	const content = firstChoiceContent(body.choices);
	if (typeof content !== "string") {
		throw new OpenAICompatibleResponseError({
			message: "OpenAI-compatible response did not include message content.",
			responseBody: responseText,
		});
	}

	return {
		text: jsonExtractionFallback(content),
		model: typeof body.model === "string" ? body.model : undefined,
		provider,
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

function jsonExtractionFallback(content: string): string {
	const trimmed = content.trim();

	if (isJson(trimmed)) {
		return trimmed;
	}

	for (const [open, close] of [
		["{", "}"],
		["[", "]"],
	] as const) {
		const start = trimmed.indexOf(open);
		const end = trimmed.lastIndexOf(close);

		if (start >= 0 && end > start) {
			const candidate = trimmed.slice(start, end + 1);
			if (isJson(candidate)) {
				return candidate;
			}
		}
	}

	return trimmed;
}

function isJson(value: string): boolean {
	try {
		JSON.parse(value);
		return true;
	} catch {
		return false;
	}
}

function parseUsage(usage: unknown): LLMTokenUsage | undefined {
	if (!isRecord(usage)) {
		return undefined;
	}

	const promptTokens = usage.prompt_tokens;
	const completionTokens = usage.completion_tokens;

	if (
		typeof promptTokens !== "number" ||
		typeof completionTokens !== "number"
	) {
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
