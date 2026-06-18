// The incident register is the real authenticated home; /workspace is a stub.
const DEFAULT_RETURN_TO = "/incidents";

export function normalizeLocalReturnTo(
	value: string | null | undefined,
	fallback = DEFAULT_RETURN_TO,
): string {
	if (!value) {
		return fallback;
	}

	const trimmed = value.trim();
	if (
		!trimmed.startsWith("/") ||
		trimmed.startsWith("//") ||
		trimmed.includes("\\") ||
		hasControlCharacter(trimmed)
	) {
		return fallback;
	}

	return trimmed;
}

function hasControlCharacter(value: string): boolean {
	for (let index = 0; index < value.length; index += 1) {
		const charCode = value.charCodeAt(index);
		if (charCode <= 31 || charCode === 127) {
			return true;
		}
	}

	return false;
}
