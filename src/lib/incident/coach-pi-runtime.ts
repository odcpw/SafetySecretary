import { pathToFileURL } from "node:url";
import { createOpenAIProviderFromEnv } from "../llm/openai";
import type {
	LLMProvider,
	LLMResponse,
	LLMTextRequest,
	LLMVisionRequest,
} from "../llm/types";

/**
 * Runs the coach prompt through the Pi agent runtime (@earendil-works/pi-coding-agent)
 * with tools off, so Pi is a pure skills/chat runtime. The OpenAI provider is
 * registered IN-PROCESS from env — Pi's global ~/.pi config is never touched.
 *
 * This is wired in as an LLMProvider (PiCoachProvider) so the existing dispatch
 * cost-cap / consent / logging rails wrap it unchanged, and it falls back to the
 * normal OpenAI provider if Pi is unavailable.
 */

// Resolved from node_modules by default. Set SSFW_PI_SDK_MODULE_PATH to an
// absolute path on hosts where the Pi SDK is installed elsewhere (e.g. a global
// npm prefix); a bare specifier here keeps any host-specific path out of the repo.
const defaultPiModuleSpecifier = "@earendil-works/pi-coding-agent";
const defaultPiModel = "openai/gpt-5.5";

async function runtimeImport<Module>(specifier: string): Promise<Module> {
	return import(/* webpackIgnore: true */ specifier) as Promise<Module>;
}

interface PiSdk {
	readonly AuthStorage: { create(): unknown };
	readonly ModelRegistry: {
		create(auth: unknown): {
			registerProvider(name: string, config: unknown): void;
			find(provider: string, modelId: string): unknown;
		};
	};
	createAgentSession(options: {
		readonly noTools: "all";
		readonly model: unknown;
		readonly modelRegistry: unknown;
		readonly authStorage: unknown;
	}): Promise<{ session: PiSession }>;
}

interface PiMessage {
	readonly role?: string;
	readonly content?: ReadonlyArray<{ type?: string; text?: string }>;
	readonly stopReason?: string;
	readonly errorMessage?: string;
	readonly model?: string;
}

interface PiSession {
	prompt(text: string): Promise<void>;
	dispose?(): void;
	readonly messages?: PiMessage[];
	readonly state?: { readonly messages?: PiMessage[] };
}

export class CoachPiUnavailableError extends Error {
	constructor(reason: string) {
		super(`Pi coach runtime unavailable: ${reason}`);
		this.name = "CoachPiUnavailableError";
	}
}

export async function runCoachPromptViaPi(
	prompt: string,
	options: { readonly env?: Pick<NodeJS.ProcessEnv, string> } = {},
): Promise<LLMResponse> {
	const env = options.env ?? process.env;
	const apiKey = env.OPENAI_API_KEY?.trim();

	if (!apiKey) {
		throw new CoachPiUnavailableError("OPENAI_API_KEY is not set");
	}

	const [provider, modelId] = splitModel(env.SSFW_PI_MODEL ?? defaultPiModel);
	const importSpecifier = resolvePiSdkImportSpecifier(
		env.SSFW_PI_SDK_MODULE_PATH,
	);
	const sdk = await runtimeImport<PiSdk>(importSpecifier).catch((error) => {
		throw new CoachPiUnavailableError(
			`SDK import failed: ${error instanceof Error ? error.message : "unknown"}`,
		);
	});

	const authStorage = sdk.AuthStorage.create();
	const modelRegistry = sdk.ModelRegistry.create(authStorage);
	modelRegistry.registerProvider(provider, {
		api: "openai-completions",
		apiKey,
		baseUrl: env.SSFW_PI_OPENAI_BASE_URL ?? "https://api.openai.com/v1",
		models: [
			{
				contextWindow: 256000,
				cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
				id: modelId,
				input: ["text"],
				maxTokens: 8192,
				name: modelId,
				reasoning: false,
			},
		],
	});

	const model = modelRegistry.find(provider, modelId);
	if (!model) {
		throw new CoachPiUnavailableError(
			`model not found: ${provider}/${modelId}`,
		);
	}

	const { session } = await sdk.createAgentSession({
		authStorage,
		model,
		modelRegistry,
		noTools: "all",
	});

	try {
		await session.prompt(prompt);
	} finally {
		// dispose after reading messages below
	}

	const messages = session.messages ?? session.state?.messages ?? [];
	const last = [...messages].reverse().find((m) => m.role === "assistant");
	const text = (last?.content ?? [])
		.filter((part) => part.type === "text" && typeof part.text === "string")
		.map((part) => part.text)
		.join("");
	session.dispose?.();

	if (last?.stopReason === "error" || !text.trim()) {
		throw new CoachPiUnavailableError(last?.errorMessage ?? "empty response");
	}

	return { model: last?.model ?? modelId, provider: "pi", text };
}

/**
 * LLMProvider that runs text generation through Pi, falling back to the normal
 * OpenAI provider if Pi errors — so a Pi hiccup never fails a coach turn.
 */
export class PiCoachProvider implements LLMProvider {
	private readonly env: Pick<NodeJS.ProcessEnv, string>;
	private readonly fallback: LLMProvider | null;

	constructor(options: { env?: Pick<NodeJS.ProcessEnv, string> } = {}) {
		this.env = options.env ?? process.env;
		this.fallback = createOpenAIProviderFromEnv({ noKeyUpgradePath: "byok" });
	}

	async text(req: LLMTextRequest): Promise<LLMResponse> {
		try {
			return await runCoachPromptViaPi(req.prompt, { env: this.env });
		} catch (error) {
			if (!this.fallback) {
				throw error;
			}
			console.warn(
				"[ii-coach] !! RUNTIME DOWNGRADE: Pi runtime unavailable; falling back to the direct OpenAI provider. The coach is no longer running on the intended Pi path:",
				error instanceof Error ? error.message : error,
			);
			return this.fallback.text(req);
		}
	}

	async vision(req: LLMVisionRequest): Promise<LLMResponse> {
		if (!this.fallback) {
			throw new CoachPiUnavailableError("vision is not supported via Pi");
		}
		return this.fallback.vision(req);
	}
}

function splitModel(value: string): [string, string] {
	const slash = value.indexOf("/");
	if (slash < 0) {
		return ["openai", value];
	}
	return [
		value.slice(0, slash) || "openai",
		value.slice(slash + 1) || "gpt-5.5",
	];
}

export function resolvePiSdkImportSpecifier(
	override: string | undefined,
): string {
	const moduleTarget = override?.trim();

	if (!moduleTarget) {
		return defaultPiModuleSpecifier;
	}

	if (moduleTarget === defaultPiModuleSpecifier) {
		return moduleTarget;
	}

	if (moduleTarget.startsWith("file://")) {
		return moduleTarget;
	}

	if (moduleTarget.startsWith("/")) {
		return pathToFileURL(moduleTarget).href;
	}

	throw new CoachPiUnavailableError(
		"SSFW_PI_SDK_MODULE_PATH must be the default package name, a file:// URL, or an absolute filesystem path",
	);
}
