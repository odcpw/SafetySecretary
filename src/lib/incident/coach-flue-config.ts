import { readEnv } from "../config/env";

export const DEFAULT_FLUE_MODEL = "openai/gpt-5.5";

export function resolveFlueModel(
	env: Readonly<Record<string, string | undefined>>,
): string {
	const model = readEnv(env, "SAFETYSECRETARY_FLUE_MODEL", "SSFW_FLUE_MODEL");
	return model ? model : DEFAULT_FLUE_MODEL;
}
