const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const extensionPattern = /^[a-z0-9]+$/;

export class InvalidStoragePathComponentError extends Error {
  readonly code = "invalid_storage_path_component";

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export function tenantPrefix(tenantId: string): string {
  return `tenants/${normalizeUuid(tenantId, "tenantId")}`;
}

export function attachmentKey(
  tenantId: string,
  attachmentId: string,
  ext: string,
): string {
  return `${tenantPrefix(tenantId)}/attachments/${normalizeUuid(
    attachmentId,
    "attachmentId",
  )}.${normalizeExtension(ext)}`;
}

export function artifactKey(
  tenantId: string,
  artifactId: string,
  ext: string,
): string {
  return `${tenantPrefix(tenantId)}/artifacts/${normalizeUuid(
    artifactId,
    "artifactId",
  )}.${normalizeExtension(ext)}`;
}

export function normalizeUuid(value: string, label: string): string {
  const normalized = value.toLowerCase();

  if (!uuidPattern.test(normalized)) {
    throw new InvalidStoragePathComponentError(`${label} must be a UUID`);
  }

  return normalized;
}

function normalizeExtension(ext: string): string {
  const normalized = (ext.startsWith(".") ? ext.slice(1) : ext).toLowerCase();

  if (!extensionPattern.test(normalized)) {
    throw new InvalidStoragePathComponentError(
      "Storage key extension must contain only lowercase letters and digits",
    );
  }

  return normalized;
}
