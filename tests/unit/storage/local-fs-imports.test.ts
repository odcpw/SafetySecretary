import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const repoRoot = process.cwd();
const storageDir = path.join(repoRoot, "src", "lib", "storage");
const storageLocalFsPath = path.join(storageDir, "local-fs");
const scannedExtensions = new Set([".ts", ".tsx"]);
const skippedDirs = new Set([".git", ".next", "node_modules"]);

test("local-fs implementation is imported only inside src/lib/storage", async () => {
  const offenders: string[] = [];

  for (const filePath of await tsFiles(repoRoot)) {
    const source = await readFile(filePath, "utf8");
    const importSpecifiers = moduleSpecifiers(source);

    for (const specifier of importSpecifiers) {
      if (!isLocalFsImport(filePath, specifier)) {
        continue;
      }

      if (!isInside(filePath, storageDir)) {
        offenders.push(path.relative(repoRoot, filePath));
      }
    }
  }

  assert.deepEqual(offenders.sort(), []);
});

async function tsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!skippedDirs.has(entry.name)) {
        files.push(...(await tsFiles(entryPath)));
      }
      continue;
    }

    if (entry.isFile() && scannedExtensions.has(path.extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}

function moduleSpecifiers(source: string): string[] {
  const specifiers: string[] = [];
  const importExportPattern =
    /\b(?:import|export)\s+(?:type\s+)?(?:[^'";]*?\s+from\s+)?["']([^"']+)["']/g;
  const dynamicImportPattern = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of source.matchAll(importExportPattern)) {
    const specifier = match[1];
    if (specifier) {
      specifiers.push(specifier);
    }
  }

  for (const match of source.matchAll(dynamicImportPattern)) {
    const specifier = match[1];
    if (specifier) {
      specifiers.push(specifier);
    }
  }

  return specifiers;
}

function isLocalFsImport(importerPath: string, specifier: string): boolean {
  if (!specifier.startsWith(".")) {
    return false;
  }

  const resolved = path.resolve(path.dirname(importerPath), specifier);
  return stripTsExtension(resolved) === storageLocalFsPath;
}

function stripTsExtension(filePath: string): string {
  return filePath.replace(/\.tsx?$/, "");
}

function isInside(filePath: string, parentDir: string): boolean {
  const relativePath = path.relative(parentDir, filePath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}
