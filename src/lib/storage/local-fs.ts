import { randomUUID } from "node:crypto";
import {
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type {
  Storage,
  StorageBody,
  StorageListOptions,
  StorageListResult,
  StorageObject,
  StorageObjectMetadata,
  StoragePutOptions,
} from "./types";

export const keyPattern = /^[a-zA-Z0-9_/.-]+$/;

const metadataSuffix = ".metadata.json";
const maxListLimit = 100;
const defaultListLimit = 100;

export class StorageError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class InvalidStorageKeyError extends StorageError {
  constructor(key: string) {
    super(
      "invalid_storage_key",
      `Invalid storage key "${key}". Keys must match [a-zA-Z0-9_/.-], must be relative, and must not contain '..'.`,
    );
  }
}

export class StorageNotFoundError extends StorageError {
  constructor(key: string) {
    super("storage_not_found", `Storage object not found: ${key}`);
  }
}

export interface LocalFsStorageOptions {
  readonly rootDir: string;
}

interface PersistedMetadata {
  readonly key: string;
  readonly contentType?: string;
  readonly sizeBytes: number;
  readonly updatedAt: string;
  readonly customMetadata?: Readonly<Record<string, string>>;
}

export class LocalFsStorage implements Storage {
  readonly rootDir: string;

  private readonly writeLocks = new Map<string, Promise<unknown>>();

  constructor(options: LocalFsStorageOptions) {
    this.rootDir = resolve(options.rootDir);
  }

  async put(
    key: string,
    body: StorageBody,
    options: StoragePutOptions = {},
  ): Promise<StorageObjectMetadata> {
    return this.withWriteLock(key, async () => {
      const bodyBuffer = normalizeBody(body);

      if (
        options.sizeBytes !== undefined &&
        options.sizeBytes !== bodyBuffer.byteLength
      ) {
        throw new StorageError(
          "storage_size_mismatch",
          `sizeBytes ${options.sizeBytes} does not match body size ${bodyBuffer.byteLength}`,
        );
      }

      const targetPath = this.objectPath(key);
      const metadataPath = this.metadataPath(key);
      const targetDir = dirname(targetPath);
      const updatedAt = new Date();
      const metadata: PersistedMetadata = {
        key,
        contentType: options.contentType,
        sizeBytes: bodyBuffer.byteLength,
        updatedAt: updatedAt.toISOString(),
        customMetadata: options.customMetadata,
      };

      await mkdir(targetDir, { recursive: true });
      await writeTempThenRename(targetPath, bodyBuffer);
      await writeTempThenRename(
        metadataPath,
        Buffer.from(`${JSON.stringify(metadata, null, 2)}\n`),
      );

      return toObjectMetadata(metadata);
    });
  }

  async get(key: string): Promise<StorageObject> {
    const targetPath = this.objectPath(key);
    const [body, metadata] = await Promise.all([
      readFile(targetPath).catch((error: unknown) => {
        if (isNodeError(error, "ENOENT")) {
          throw new StorageNotFoundError(key);
        }
        throw error;
      }),
      this.head(key),
    ]);

    return { body, metadata };
  }

  async head(key: string): Promise<StorageObjectMetadata> {
    const targetPath = this.objectPath(key);
    const metadataPath = this.metadataPath(key);

    const [fileStat, persisted] = await Promise.all([
      stat(targetPath).catch((error: unknown) => {
        if (isNodeError(error, "ENOENT")) {
          throw new StorageNotFoundError(key);
        }
        throw error;
      }),
      readMetadata(metadataPath, key),
    ]);

    return {
      ...toObjectMetadata(persisted),
      sizeBytes: fileStat.size,
    };
  }

  async delete(key: string): Promise<void> {
    const targetPath = this.objectPath(key);
    const metadataPath = this.metadataPath(key);

    await Promise.all([
      rm(targetPath, { force: true }),
      rm(metadataPath, { force: true }),
    ]);
  }

  async list(
    prefix: string,
    options: StorageListOptions = {},
  ): Promise<StorageListResult> {
    validateStoragePrefix(prefix);
    const limit = resolveListLimit(options.limit);
    const keys = await this.collectKeys(this.rootDir);
    const matchingKeys = keys.filter((key) => key.startsWith(prefix)).sort();
    const limitedKeys = matchingKeys.slice(0, limit);
    const items = await Promise.all(limitedKeys.map((key) => this.head(key)));

    return {
      items,
      truncated: matchingKeys.length > limitedKeys.length,
    };
  }

  private objectPath(key: string): string {
    validateStorageKey(key);
    return safePathForKey(this.rootDir, key);
  }

  private metadataPath(key: string): string {
    return `${this.objectPath(key)}${metadataSuffix}`;
  }

  private async collectKeys(currentDir: string): Promise<string[]> {
    const entries = await readdir(currentDir, { withFileTypes: true }).catch(
      (error: unknown) => {
        if (isNodeError(error, "ENOENT")) {
          return [];
        }
        throw error;
      },
    );

    const keys: string[] = [];

    for (const entry of entries) {
      const entryPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        keys.push(...(await this.collectKeys(entryPath)));
        continue;
      }

      if (
        !entry.isFile() ||
        entry.name.endsWith(metadataSuffix) ||
        entry.name.endsWith(".tmp")
      ) {
        continue;
      }

      const key = relative(this.rootDir, entryPath).split("\\").join("/");
      validateStorageKey(key);
      keys.push(key);
    }

    return keys;
  }

  private async withWriteLock<T>(key: string, work: () => Promise<T>): Promise<T> {
    validateStorageKey(key);
    const previous = this.writeLocks.get(key) ?? Promise.resolve();
    const next = previous.then(work, work);
    this.writeLocks.set(key, next);

    try {
      return await next;
    } finally {
      if (this.writeLocks.get(key) === next) {
        this.writeLocks.delete(key);
      }
    }
  }
}

function validateStorageKey(key: string): void {
  if (
    key.length === 0 ||
    key.startsWith("/") ||
    isAbsolute(key) ||
    !keyPattern.test(key) ||
    key.includes("..")
  ) {
    throw new InvalidStorageKeyError(key);
  }
}

function validateStoragePrefix(prefix: string): void {
  if (prefix.length === 0) {
    return;
  }

  validateStorageKey(prefix);
}

function safePathForKey(rootDir: string, key: string): string {
  const targetPath = resolve(rootDir, key);
  const rootRelativePath = relative(rootDir, targetPath);

  if (rootRelativePath.startsWith("..") || isAbsolute(rootRelativePath)) {
    throw new InvalidStorageKeyError(key);
  }

  return targetPath;
}

async function writeTempThenRename(targetPath: string, body: Buffer): Promise<void> {
  const targetDir = dirname(targetPath);
  const tempPath = join(
    targetDir,
    `.${basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`,
  );

  await writeFile(tempPath, body, { flag: "wx" });
  await rename(tempPath, targetPath);
}

async function readMetadata(
  metadataPath: string,
  key: string,
): Promise<PersistedMetadata> {
  try {
    return JSON.parse(await readFile(metadataPath, "utf8")) as PersistedMetadata;
  } catch (error) {
    if (isNodeError(error, "ENOENT")) {
      throw new StorageNotFoundError(key);
    }
    throw error;
  }
}

function normalizeBody(body: StorageBody): Buffer {
  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (typeof body === "string") {
    return Buffer.from(body);
  }

  if (body instanceof ArrayBuffer) {
    return Buffer.from(body);
  }

  return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
}

function toObjectMetadata(metadata: PersistedMetadata): StorageObjectMetadata {
  return {
    key: metadata.key,
    contentType: metadata.contentType,
    sizeBytes: metadata.sizeBytes,
    updatedAt: new Date(metadata.updatedAt),
    customMetadata: metadata.customMetadata,
  };
}

function resolveListLimit(limit: number | undefined): number {
  if (limit === undefined) {
    return defaultListLimit;
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > maxListLimit) {
    throw new StorageError(
      "invalid_storage_list_limit",
      `Storage list limit must be an integer between 1 and ${maxListLimit}`,
    );
  }

  return limit;
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === code;
}
