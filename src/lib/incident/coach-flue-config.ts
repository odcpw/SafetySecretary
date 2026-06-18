export const DEFAULT_FLUE_MODEL = "openai/gpt-5.5";

export function resolveFlueModel(
	env: Readonly<Record<string, string | undefined>>,
): string {
	const model = env.SSFW_FLUE_MODEL?.trim();
	return model ? model : DEFAULT_FLUE_MODEL;
}
