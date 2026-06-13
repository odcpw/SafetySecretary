export const LLMProviderErrorCode = {
  VisionUnavailableCompany: "vision_unavailable_company",
  VisionUnavailableWorkflow: "vision_unavailable_workflow",
  MonthlyCapExceeded: "monthly_cap_exceeded",
} as const;

export type LLMProviderErrorCode =
  (typeof LLMProviderErrorCode)[keyof typeof LLMProviderErrorCode];

export class LLMProviderError<
  Code extends LLMProviderErrorCode = LLMProviderErrorCode,
> extends Error {
  readonly code: Code;

  constructor(code: Code, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class VisionUnavailableCompanyError extends LLMProviderError<
  typeof LLMProviderErrorCode.VisionUnavailableCompany
> {
  constructor(message = "Vision is unavailable for this company.") {
    super(LLMProviderErrorCode.VisionUnavailableCompany, message);
  }
}

export class VisionUnavailableWorkflowError extends LLMProviderError<
  typeof LLMProviderErrorCode.VisionUnavailableWorkflow
> {
  constructor(message = "Vision is unavailable for this workflow.") {
    super(LLMProviderErrorCode.VisionUnavailableWorkflow, message);
  }
}

export type MonthlyCapUpgradePath = "byok" | "local";

export interface MonthlyCapExceededErrorOptions {
  readonly message?: string;
  readonly upgradePath?: MonthlyCapUpgradePath;
}

export class MonthlyCapExceededError extends LLMProviderError<
  typeof LLMProviderErrorCode.MonthlyCapExceeded
> {
  readonly upgradePath?: MonthlyCapUpgradePath;

  constructor(options: MonthlyCapExceededErrorOptions = {}) {
    super(
      LLMProviderErrorCode.MonthlyCapExceeded,
      options.message ?? "Monthly LLM usage cap exceeded.",
    );
    this.upgradePath = options.upgradePath;
  }
}
