import type {
  LLMProvider,
  LLMResponse,
  LLMTextRequest,
  LLMVisionRequest,
} from "./types";

export type NoProviderConfiguredUpgradePath = "byok" | "local" | "set_openai_key";

export class NoProviderConfiguredError extends Error {
  readonly code = "no_provider_configured";
  readonly upgradePath: NoProviderConfiguredUpgradePath;

  constructor(upgradePath: NoProviderConfiguredUpgradePath = "set_openai_key") {
    super("No LLM provider is configured.");
    this.name = "NoProviderConfiguredError";
    this.upgradePath = upgradePath;
  }
}

export interface NoKeyProviderOptions {
  readonly upgradePath?: NoProviderConfiguredUpgradePath;
}

export class NoKeyProvider implements LLMProvider {
  private readonly upgradePath: NoProviderConfiguredUpgradePath;

  constructor(options: NoKeyProviderOptions = {}) {
    this.upgradePath = options.upgradePath ?? "set_openai_key";
  }

  async text(_req: LLMTextRequest): Promise<LLMResponse> {
    throw new NoProviderConfiguredError(this.upgradePath);
  }

  async vision(_req: LLMVisionRequest): Promise<LLMResponse> {
    throw new NoProviderConfiguredError(this.upgradePath);
  }
}
