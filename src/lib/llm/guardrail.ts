export const REAL_PROVIDER_GUARDRAIL_MESSAGE =
  "ADR-0005 D7: real LLM providers must not be constructed in NODE_ENV=test. Use MockProvider for default tests; only the manual validation harness may set LLM_VALIDATION_OK=1.";

export function assertRealProviderAllowed(
  providerName = "real LLM provider",
): void {
  if (process.env.NODE_ENV === "test" && process.env.LLM_VALIDATION_OK !== "1") {
    throw new Error(`${providerName} blocked. ${REAL_PROVIDER_GUARDRAIL_MESSAGE}`);
  }
}
