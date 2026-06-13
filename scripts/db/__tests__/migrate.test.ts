import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const runner = "scripts/db/migrate.ts";

async function makeSqlRoot(files: string[]): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "ssfw-y84-"));
  const sqlDir = join(root, "db", "sql");
  await mkdir(sqlDir, { recursive: true });

  for (const file of files) {
    await writeFile(join(sqlDir, file), "-- test\n", "utf8");
  }

  return root;
}

async function runDryPlan(root: string) {
  return execFileAsync(process.execPath, [
    "--experimental-strip-types",
    runner,
    "apply",
    "--dry-run",
    "--root",
    root,
  ]);
}

test("dry-run lists raw SQL files in lexicographic order", async () => {
  const root = await makeSqlRoot(["00020_b.sql", "00010_a.sql"]);

  try {
    const { stdout } = await runDryPlan(root);
    const first = stdout.indexOf("00010_a.sql");
    const second = stdout.indexOf("00020_b.sql");

    assert.ok(first > -1, "00010_a.sql should be listed");
    assert.ok(second > -1, "00020_b.sql should be listed");
    assert.ok(first < second, "raw SQL files should be sorted lexicographically");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("dry-run rejects SQL files without a leading sequence prefix", async () => {
  const root = await makeSqlRoot(["bad.sql"]);

  try {
    await assert.rejects(
      runDryPlan(root),
      /must start with a 5-digit sequence prefix/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reset refuses to run outside development", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [
      "--experimental-strip-types",
      runner,
      "reset",
    ]),
    /NODE_ENV=development/,
  );
});
