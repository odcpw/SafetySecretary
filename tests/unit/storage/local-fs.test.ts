import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import type { StorageObjectMetadata } from "../../../src/lib/storage";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier === "./keys" &&
      (context.parentURL?.endsWith("/src/lib/storage/index.ts") ||
        context.parentURL?.endsWith("/src/lib/storage/tenant.ts"))
    ) {
      return localModuleUrl("src/lib/storage/keys.ts");
    }

    if (
      specifier === "./local-fs" &&
      (context.parentURL?.endsWith("/src/lib/storage/index.ts") ||
        context.parentURL?.endsWith("/src/lib/storage/tenant.ts"))
    ) {
      return localModuleUrl("src/lib/storage/local-fs.ts");
    }

    if (
      specifier === "./tenant" &&
      context.parentURL?.endsWith("/src/lib/storage/index.ts")
    ) {
      return localModuleUrl("src/lib/storage/tenant.ts");
    }

    if (
      specifier === "./types" &&
      context.parentURL?.endsWith("/src/lib/storage/index.ts")
    ) {
      return localModuleUrl("src/lib/storage/types.ts");
    }

    return nextResolve(specifier, context);
  },
});

const storageModulePath = pathToFileURL(
  path.resolve("src/lib/storage/index.ts"),
).href;
const { InvalidStorageKeyError, LocalFsStorage, StorageNotFoundError } =
  (await import(storageModulePath)) as typeof import("../../../src/lib/storage");

async function withStorage<T>(
  work: (storage: InstanceType<typeof LocalFsStorage>, rootDir: string) => Promise<T>,
): Promise<T> {
  const rootDir = await mkdtemp(join(tmpdir(), "ssfw-o9u-storage-"));

  try {
    return await work(new LocalFsStorage({ rootDir }), rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

function keys(items: readonly StorageObjectMetadata[]): string[] {
  return items.map((item) => item.key).sort();
}

function localModuleUrl(relativePath: string) {
  return {
    shortCircuit: true,
    url: pathToFileURL(path.resolve(relativePath)).href,
  };
}

test("put/get/head round trip preserves body and metadata", async () => {
  await withStorage(async (storage) => {
    const body = Buffer.from("inspection photo bytes");
    const written = await storage.put("photos/site-a/image-001.txt", body, {
      contentType: "text/plain",
      sizeBytes: body.byteLength,
      customMetadata: {
        filename: "image-001.txt",
      },
    });

    assert.equal(written.key, "photos/site-a/image-001.txt");
    assert.equal(written.contentType, "text/plain");
    assert.equal(written.sizeBytes, body.byteLength);

    const read = await storage.get("photos/site-a/image-001.txt");
    assert.equal(read.body.toString(), "inspection photo bytes");
    assert.equal(read.metadata.contentType, "text/plain");
    assert.equal(read.metadata.sizeBytes, body.byteLength);
    assert.equal(read.metadata.customMetadata?.filename, "image-001.txt");

    const head = await storage.head("photos/site-a/image-001.txt");
    assert.equal(head.key, read.metadata.key);
    assert.equal(head.contentType, read.metadata.contentType);
    assert.equal(head.sizeBytes, body.byteLength);
  });
});

test("path traversal and invalid keys are rejected loudly", async () => {
  await withStorage(async (storage) => {
    for (const key of [
      "../../etc/passwd",
      "photos/../passwd",
      "/absolute/path",
      "photos/site a/image.txt",
      "photos/site-a/imageé.txt",
    ]) {
      await assert.rejects(
        () => storage.put(key, "body"),
        InvalidStorageKeyError,
      );
    }
  });
});

test("concurrent same-key puts do not leave partial writes", async () => {
  await withStorage(async (storage, rootDir) => {
    const key = "photos/site-a/concurrent.txt";
    const payloads = Array.from({ length: 12 }, (_, index) =>
      `payload-${index}-`.repeat(10_000),
    );

    await Promise.all(
      payloads.map((payload) =>
        storage.put(key, payload, {
          contentType: "text/plain",
          sizeBytes: Buffer.byteLength(payload),
        }),
      ),
    );

    const read = await storage.get(key);
    const finalBody = read.body.toString();
    assert.ok(payloads.includes(finalBody), "final body must be one complete put payload");
    assert.equal(read.metadata.sizeBytes, Buffer.byteLength(finalBody));

    const dirEntries = await readdir(join(rootDir, "photos/site-a"));
    assert.equal(
      dirEntries.some((entry) => entry.endsWith(".tmp")),
      false,
      "temp files must not remain after completed writes",
    );
  });
});

test("delete is idempotent", async () => {
  await withStorage(async (storage) => {
    await storage.put("exports/report.pdf", "pdf bytes");
    await storage.delete("exports/report.pdf");
    await storage.delete("exports/report.pdf");

    await assert.rejects(
      () => storage.head("exports/report.pdf"),
      StorageNotFoundError,
    );
  });
});

test("list filters by prefix, supports limits, and returns empty matches", async () => {
  await withStorage(async (storage) => {
    await storage.put("photos/site-a/001.jpg", "one");
    await storage.put("photos/site-a/002.jpg", "two");
    await storage.put("photos/site-b/001.jpg", "three");
    await storage.put("exports/report.pdf", "report");

    const siteA = await storage.list("photos/site-a/");
    assert.deepEqual(keys(siteA.items), [
      "photos/site-a/001.jpg",
      "photos/site-a/002.jpg",
    ]);
    assert.equal(siteA.truncated, false);

    const limited = await storage.list("photos/", { limit: 2 });
    assert.deepEqual(keys(limited.items), [
      "photos/site-a/001.jpg",
      "photos/site-a/002.jpg",
    ]);
    assert.equal(limited.truncated, true);

    const none = await storage.list("missing/");
    assert.deepEqual(none.items, []);
    assert.equal(none.truncated, false);
  });
});
