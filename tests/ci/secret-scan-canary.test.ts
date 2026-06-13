import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { chmod, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(testFile), "../..");
const hookPath = path.join(repoRoot, ".husky/pre-commit");
const configPath = path.join(repoRoot, ".gitleaks.toml");
const packageJsonPath = path.join(repoRoot, "package.json");
const gitleaksVersion = readPinnedGitleaksVersion();

test("pre-commit hook blocks a staged fake secret", async () => {
  const sandbox = mkdtempSync(path.join(tmpdir(), "ssfw-secret-scan-"));

  try {
    mkdirSync(path.join(sandbox, ".husky"), { recursive: true });
    mkdirSync(path.join(sandbox, "bin"), { recursive: true });
    await copyFile(hookPath, path.join(sandbox, ".husky/pre-commit"));
    await copyFile(configPath, path.join(sandbox, ".gitleaks.toml"));
    await copyFile(packageJsonPath, path.join(sandbox, "package.json"));
    await chmod(path.join(sandbox, ".husky/pre-commit"), 0o755);

    const invocationLog = path.join(sandbox, "gitleaks-invocation.log");
    writeFileSync(
      path.join(sandbox, "bin/gitleaks"),
      fakeGitleaksBinary(gitleaksVersion),
      { mode: 0o755 },
    );

    git(sandbox, ["init"]);
    git(sandbox, ["config", "user.email", "canary@example.invalid"]);
    git(sandbox, ["config", "user.name", "Secret Scan Canary"]);
    git(sandbox, ["config", "core.hooksPath", ".husky"]);
    git(sandbox, ["add", ".gitleaks.toml", ".husky/pre-commit", "package.json"]);
    git(sandbox, ["commit", "--no-verify", "-m", "baseline"]);

    const fakeSecret = ["OPENAI_API_KEY", "sk-fake-canary"].join("=");
    writeFileSync(path.join(sandbox, "canary.env"), `${fakeSecret}\n`);
    git(sandbox, ["add", "canary.env"]);

    const commit = spawnSync("git", ["commit", "-m", "canary"], {
      cwd: sandbox,
      env: {
        ...process.env,
        GITLEAKS_CANARY_LOG: invocationLog,
        PATH: `${path.join(sandbox, "bin")}:${process.env.PATH ?? ""}`,
      },
      encoding: "utf8",
    });

    assert.notEqual(commit.status, 0, "commit should be blocked by pre-commit");
    assert.match(
      `${commit.stdout}\n${commit.stderr}`,
      /Secret scanning failed|fake secret found/,
    );
    assert.match(readFileSync(invocationLog, "utf8"), /protect --staged/);
    assert.match(git(sandbox, ["status", "--short"]).stdout, /^A  canary\.env/m);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

function git(cwd: string, args: string[]) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });

  if (result.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
    );
  }

  return result;
}

function fakeGitleaksBinary(version: string): string {
  return `#!/usr/bin/env node
const { execFileSync } = require("node:child_process");
const { appendFileSync } = require("node:fs");

const args = process.argv.slice(2);
if (args[0] === "version") {
  console.log("${version}");
  process.exit(0);
}

if (process.env.GITLEAKS_CANARY_LOG) {
  appendFileSync(process.env.GITLEAKS_CANARY_LOG, args.join(" ") + "\\n");
}

if (args[0] !== "protect" || !args.includes("--staged")) {
  console.error("unexpected gitleaks invocation: " + args.join(" "));
  process.exit(2);
}

const diff = execFileSync("git", ["diff", "--cached", "--"], { encoding: "utf8" });
const fakeSecret = ["OPENAI_API_KEY", "sk-fake-canary"].join("=");
if (diff.includes(fakeSecret)) {
  console.error("fake secret found");
  process.exit(1);
}

process.exit(0);
`;
}

function readPinnedGitleaksVersion(): string {
  let parsed: unknown;

  try {
    parsed = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  } catch (error) {
    throw new Error(`Could not parse package.json: ${String(error)}`);
  }

  if (!isRecord(parsed)) {
    throw new Error("package.json must parse to an object");
  }

  const config = parsed.config;
  if (!isRecord(config)) {
    throw new Error("package.json must define config");
  }

  const secretScan = config.secretScan;
  if (!isRecord(secretScan)) {
    throw new Error("package.json must define config.secretScan");
  }

  const version = secretScan.gitleaksVersion;
  if (typeof version !== "string" || version.length === 0) {
    throw new Error("package.json must define config.secretScan.gitleaksVersion");
  }

  return version;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
