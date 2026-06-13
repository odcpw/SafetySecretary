import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import type {
  Storage,
  StorageBody,
  StorageListOptions,
  StorageListResult,
  StorageObject,
  StorageObjectMetadata,
  StoragePutOptions,
} from "../../../src/lib/storage";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier === "./keys" &&
      context.parentURL?.endsWith("/src/lib/storage/tenant.ts")
    ) {
      return localModuleUrl("src/lib/storage/keys.ts");
    }

    if (
      specifier === "./local-fs" &&
      context.parentURL?.endsWith("/src/lib/storage/tenant.ts")
    ) {
      return localModuleUrl("src/lib/storage/local-fs.ts");
    }

    return nextResolve(specifier, context);
  },
});

const keysModulePath = pathToFileURL(
  path.resolve("src/lib/storage/keys.ts"),
).href;
const tenantModulePath = pathToFileURL(
  path.resolve("src/lib/storage/tenant.ts"),
).href;
const {
  artifactKey,
  attachmentKey,
  InvalidStoragePathComponentError,
  tenantPrefix,
} = (await import(keysModulePath)) as typeof import("../../../src/lib/storage/keys");
const { InvalidTenantStorageKeyError, tenantStorage } = (await import(
  tenantModulePath
)) as typeof import("../../../src/lib/storage/tenant");

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";
const attachmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const artifactId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

class MemoryStorage implements Storage {
  readonly objects = new Map<string, StorageObject>();

  async put(
    key: string,
    body: StorageBody,
    options: StoragePutOptions = {},
  ): Promise<StorageObjectMetadata> {
    const bodyBuffer = normalizeBody(body);
    const metadata: StorageObjectMetadata = {
      key,
      contentType: options.contentType,
      sizeBytes: bodyBuffer.byteLength,
      updatedAt: new Date("2026-04-30T00:00:00.000Z"),
      customMetadata: options.customMetadata,
    };
    this.objects.set(key, { body: bodyBuffer, metadata });
    return metadata;
  }

  async get(key: string): Promise<StorageObject> {
    const object = this.objects.get(key);
    assert.ok(object, `expected ${key} to exist`);
    return object;
  }

  async head(key: string): Promise<StorageObjectMetadata> {
    return (await this.get(key)).metadata;
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }

  async list(
    prefix: string,
    options: StorageListOptions = {},
  ): Promise<StorageListResult> {
    const limit = options.limit ?? Number.POSITIVE_INFINITY;
    const matchingItems = [...this.objects.values()]
      .map((object) => object.metadata)
      .filter((metadata) => metadata.key.startsWith(prefix))
      .sort((left, right) => left.key.localeCompare(right.key));

    return {
      items: matchingItems.slice(0, limit),
      truncated: matchingItems.length > limit,
    };
  }
}

test("tenantStorage prepends the tenant prefix for every storage operation", async () => {
  const rawStorage = new MemoryStorage();
  const storage = tenantStorage(tenantA, { storage: rawStorage });

  const written = await storage.put("photos/foo.png", "body", {
    contentType: "image/png",
  });
  assert.equal(written.key, `${tenantPrefix(tenantA)}/photos/foo.png`);
  assert.ok(rawStorage.objects.has(`${tenantPrefix(tenantA)}/photos/foo.png`));

  const read = await storage.get("photos/foo.png");
  assert.equal(read.body.toString(), "body");
  assert.equal(read.metadata.key, `${tenantPrefix(tenantA)}/photos/foo.png`);

  const head = await storage.head("photos/foo.png");
  assert.equal(head.contentType, "image/png");

  await storage.delete("photos/foo.png");
  assert.equal(rawStorage.objects.has(`${tenantPrefix(tenantA)}/photos/foo.png`), false);
});

test("tenantStorage list returns only keys inside the current tenant prefix", async () => {
  const rawStorage = new MemoryStorage();
  await rawStorage.put(`${tenantPrefix(tenantA)}/photos/a.png`, "a");
  await rawStorage.put(`${tenantPrefix(tenantA)}/artifacts/report.pdf`, "report");
  await rawStorage.put(`${tenantPrefix(tenantB)}/photos/b.png`, "b");

  const storage = tenantStorage(tenantA, { storage: rawStorage });

  const allTenantA = await storage.list();
  assert.deepEqual(
    allTenantA.items.map((item) => item.key),
    [
      `${tenantPrefix(tenantA)}/artifacts/report.pdf`,
      `${tenantPrefix(tenantA)}/photos/a.png`,
    ],
  );

  const photos = await storage.list("photos/");
  assert.deepEqual(
    photos.items.map((item) => item.key),
    [`${tenantPrefix(tenantA)}/photos/a.png`],
  );
});

test("tenantStorage rejects absolute, prefixed, empty, and escaping keys", async () => {
  const storage = tenantStorage(tenantA, { storage: new MemoryStorage() });

  for (const key of [
    "",
    "/photos/foo.png",
    "../photos/foo.png",
    "photos/../foo.png",
    "photos//foo.png",
    "photos/./foo.png",
    "tenants",
    `${tenantPrefix(tenantA)}/photos/foo.png`,
    `${tenantPrefix(tenantB)}/photos/foo.png`,
    "shared/photos/foo.png",
    "photos\\foo.png",
  ]) {
    await assert.rejects(
      () => storage.put(key, "body"),
      InvalidTenantStorageKeyError,
      `${key} should be rejected`,
    );
  }
});

test("key constructors derive tenant-scoped UUID paths without filenames", () => {
  assert.equal(
    attachmentKey(tenantA, attachmentId, ".PNG"),
    `${tenantPrefix(tenantA)}/attachments/${attachmentId}.png`,
  );
  assert.equal(
    artifactKey(tenantA, artifactId, "pdf"),
    `${tenantPrefix(tenantA)}/artifacts/${artifactId}.pdf`,
  );

  for (const invalid of [
    () => attachmentKey("not-a-uuid", attachmentId, "png"),
    () => attachmentKey(tenantA, "not-a-uuid", "png"),
    () => attachmentKey(tenantA, attachmentId, "../png"),
    () => artifactKey(tenantA, artifactId, "report.pdf"),
  ]) {
    assert.throws(invalid, InvalidStoragePathComponentError);
  }
});

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

function localModuleUrl(relativePath: string) {
  return {
    shortCircuit: true,
    url: pathToFileURL(path.resolve(relativePath)).href,
  };
}
