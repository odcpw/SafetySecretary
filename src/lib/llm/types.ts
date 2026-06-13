export const KindEnum = {
  Authoring: "authoring",
  Generation: "generation",
} as const;

export type KindEnum = (typeof KindEnum)[keyof typeof KindEnum];

export type RequiresVision = boolean;

interface LLMBaseOptions {
  readonly tenantId: string;
  readonly userId: string;
  readonly workflowId?: string;
  readonly locale: string;
  readonly promptPurpose: string;
  readonly kind: KindEnum;
}

export interface LLMTextOptions extends LLMBaseOptions {
  readonly requiresVision: false;
}

export interface LLMVisionOptions extends LLMBaseOptions {
  readonly requiresVision: true;
}

export type LLMOptions = LLMTextOptions | LLMVisionOptions;

interface LLMBaseRequest<Options extends LLMOptions> {
  readonly prompt: string;
  readonly options: Options;
}

export interface LLMTextRequest extends LLMBaseRequest<LLMTextOptions> {}

export interface LLMVisionImage {
  readonly mimeType: string;
  readonly data: string | Uint8Array | ArrayBuffer;
  readonly filename?: string;
}

export interface LLMVisionRequest extends LLMBaseRequest<LLMVisionOptions> {
  readonly photos: readonly LLMVisionImage[];
}

export type LLMRequest = LLMTextRequest | LLMVisionRequest;

export interface LLMTokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface LLMResponse {
  readonly text: string;
  readonly model?: string;
  readonly provider?: string;
  readonly usage?: LLMTokenUsage;
}

export interface LLMProvider {
  text(req: LLMTextRequest): Promise<LLMResponse>;
  vision(req: LLMVisionRequest): Promise<LLMResponse>;
}
