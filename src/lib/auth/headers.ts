export const CSRF_HEADER_NAME = "x-safetysecretary-csrf";
export const LEGACY_CSRF_HEADER_NAME = "x-ssfw-csrf";
export const CSRF_HEADER_NAMES = [
	CSRF_HEADER_NAME,
	LEGACY_CSRF_HEADER_NAME,
] as const;

export const USER_ID_HEADER_NAME = "x-safetysecretary-user-id";
export const LEGACY_USER_ID_HEADER_NAME = "x-ssfw-user-id";
export const USER_ID_HEADER_NAMES = [
	USER_ID_HEADER_NAME,
	LEGACY_USER_ID_HEADER_NAME,
] as const;

export const TENANT_ID_HEADER_NAME = "x-safetysecretary-tenant-id";
export const LEGACY_TENANT_ID_HEADER_NAME = "x-ssfw-tenant-id";
export const TENANT_ID_HEADER_NAMES = [
	TENANT_ID_HEADER_NAME,
	LEGACY_TENANT_ID_HEADER_NAME,
] as const;

export const VISION_MODAL_GRANTED_HEADER_NAME =
	"x-safetysecretary-vision-modal-granted";
export const LEGACY_VISION_MODAL_GRANTED_HEADER_NAME =
	"x-ssfw-vision-modal-granted";
export const VISION_MODAL_GRANTED_HEADER_NAMES = [
	VISION_MODAL_GRANTED_HEADER_NAME,
	LEGACY_VISION_MODAL_GRANTED_HEADER_NAME,
] as const;

export function readNamedHeader(
	headers: Pick<Headers, "get">,
	names: readonly string[],
): string | null {
	for (const name of names) {
		const value = headers.get(name);
		if (value) {
			return value;
		}
	}

	return null;
}

export function deleteNamedHeaders(
	headers: Pick<Headers, "delete">,
	names: readonly string[],
): void {
	for (const name of names) {
		headers.delete(name);
	}
}
