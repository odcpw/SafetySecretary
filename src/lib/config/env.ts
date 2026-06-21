export type EnvLike = Pick<NodeJS.ProcessEnv, string>;

export function readEnv(
	env: EnvLike,
	name: string,
	legacyName?: string,
): string | undefined {
	const value = env[name]?.trim();
	if (value) {
		return value;
	}

	if (!legacyName) {
		return undefined;
	}

	const legacyValue = env[legacyName]?.trim();
	return legacyValue || undefined;
}

export function readEnvRaw(
	env: EnvLike,
	name: string,
	legacyName?: string,
): string | undefined {
	const value = env[name];
	if (value !== undefined) {
		return value;
	}

	return legacyName ? env[legacyName] : undefined;
}

export function envFlag(
	env: EnvLike,
	name: string,
	legacyName?: string,
): boolean {
	return readEnvRaw(env, name, legacyName) === "1";
}
