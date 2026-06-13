import { isAbsolute } from "node:path";
import { tenantPrefix } from "./keys";
import { LocalFsStorage } from "./local-fs";
import type {
  Storage,
  StorageBody,
  StorageListOptions,
  StorageListResult,
  StorageObject,
  StorageObjectMetadata,
  StoragePutOptions,
} from "./types";

const relativeKeyPattern = /^[a-zA-Z0-9_/.-]+$/;

export class InvalidTenantStorageKeyError extends Error {
  readonly code = "invalid_tenant_storage_key";

  constructor(key: string) {
    super(
      `Invalid tenant storage key "${key}". Pass a tenant-relative key without tenants/, shared/, empty segments, absolute paths, or path traversal.`,
    );
    this.name = new.target.name;
  }
}

export interface TenantStorage extends Omit<Storage, "list"> {
  list(
    prefix?: string,
    options?: StorageListOptions,
  ): Promise<StorageListResult>;
}

export interface TenantStorageOptions {
  readonly storage?: Storage;
  readonly env?: NodeJS.ProcessEnv;
}

export class TenantScopedStorage implements TenantStorage {
  private readonly prefix: string;
  private readonly storage: Storage;

  constructor(tenantId: string, storage: Storage) {
    this.storage = storage;
    this.prefix = `${tenantPrefix(tenantId)}/`;
  }

  async put(
    key: string,
    body: StorageBody,
    options?: StoragePutOptions,
  ): Promise<StorageObjectMetadata> {
    return this.storage.put(this.scopedKey(key), body, options);
  }

  async get(key: string): Promise<StorageObject> {
    return this.storage.get(this.scopedKey(key));
  }

  async head(key: string): Promise<StorageObjectMetadata> {
    return this.storage.head(this.scopedKey(key));
  }

  async delete(key: string): Promise<void> {
    await this.storage.delete(this.scopedKey(key));
  }

  async list(
    prefix = "",
    options?: StorageListOptions,
  ): Promise<StorageListResult> {
    return this.storage.list(this.scopedPrefix(prefix), options);
  }

  private scopedKey(key: string): string {
    validateTenantRelativeKey(key, {
      allowEmpty: false,
      allowTrailingSlash: false,
    });
    return `${this.prefix}${key}`;
  }

  private scopedPrefix(prefix: string): string {
    validateTenantRelativeKey(prefix, {
      allowEmpty: true,
      allowTrailingSlash: true,
    });
    return `${this.prefix}${prefix}`;
  }
}

export function tenantStorage(
  tenantId: string,
  options: TenantStorageOptions = {},
): TenantStorage {
  const storage = options.storage ?? createStorageFromEnv(options.env);
  return new TenantScopedStorage(tenantId, storage);
}

export function createStorageFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): Storage {
  const driver = env.STORAGE_DRIVER ?? "local-fs";

  if (driver !== "local-fs") {
    throw new Error(`Unsupported storage driver: ${driver}`);
  }

  const rootDir = env.STORAGE_LOCAL_ROOT;

  if (!rootDir) {
    throw new Error("STORAGE_LOCAL_ROOT is required for local-fs storage");
  }

  return new LocalFsStorage({ rootDir });
}

interface TenantKeyValidationOptions {
  readonly allowEmpty: boolean;
  readonly allowTrailingSlash: boolean;
}

function validateTenantRelativeKey(
  key: string,
  options: TenantKeyValidationOptions,
): void {
  if (options.allowEmpty && key.length === 0) {
    return;
  }

  const keyToValidate =
    options.allowTrailingSlash && key.endsWith("/") ? key.slice(0, -1) : key;

  if (
    keyToValidate.length === 0 ||
    key.startsWith("/") ||
    isAbsolute(key) ||
    !relativeKeyPattern.test(key) ||
    key.includes("..") ||
    key === "tenants" ||
    key.startsWith("tenants/") ||
    key === "shared" ||
    key.startsWith("shared/")
  ) {
    throw new InvalidTenantStorageKeyError(key);
  }

  const segments = keyToValidate.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === ".")) {
    throw new InvalidTenantStorageKeyError(key);
  }
}
