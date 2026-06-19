import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

type Command = "apply" | "reset" | "sql:apply";

type ParsedArgs = {
  command: Command;
  dryRun: boolean;
  rootDir: string;
  sqlFile?: string;
};

export type RawSqlFile = {
  name: string;
  path: string;
};

type LedgerRow = {
  checksumSha256: string;
  name: string;
};

const sqlNamePattern = /^\d{5}_.+\.sql$/;
const rawSqlLedgerBootstrapCutoff = "00450_incident_case_number_unique.sql";

function usage(): string {
  return [
    "Usage:",
    "  pnpm db:migrate [apply] [--dry-run]",
    "  pnpm db:reset",
    "  pnpm db:sql:apply <file>",
  ].join("\n");
}

export function parseArgs(argv: string[]): ParsedArgs {
  const args = [...argv];
  let command: Command = "apply";
  let dryRun = false;
  let rootDir = process.cwd();
  let sqlFile: string | undefined;

  const first = args[0];
  if (first === "apply" || first === "reset" || first === "sql:apply") {
    command = first;
    args.shift();
  }

  while (args.length > 0) {
    const arg = args.shift();

    if (arg === "--") {
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg === "--root") {
      const next = args.shift();
      if (!next) {
        throw new Error("--root requires a directory");
      }
      rootDir = next;
      continue;
    }

    if (command === "sql:apply" && !sqlFile && arg) {
      sqlFile = arg;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}\n\n${usage()}`);
  }

  if (command === "sql:apply" && !sqlFile) {
    throw new Error(`sql:apply requires a SQL file\n\n${usage()}`);
  }

  return { command, dryRun, rootDir, sqlFile };
}

export async function rawSqlFiles(rootDir: string): Promise<RawSqlFile[]> {
  const sqlDir = join(rootDir, "db", "sql");
  let entries;

  try {
    entries = await readdir(sqlDir, { withFileTypes: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const sqlFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const file of sqlFiles) {
    assertSqlFilename(file.name);
  }

  return sqlFiles.map((file) => ({
    name: file.name,
    path: join(sqlDir, file.name),
  }));
}

export function assertSqlFilename(fileName: string): void {
  if (!sqlNamePattern.test(fileName)) {
    throw new Error(
      `Raw SQL file "${fileName}" must start with a 5-digit sequence prefix like 00010_name.sql`,
    );
  }
}

export function legacyBootstrapFiles(files: RawSqlFile[]): RawSqlFile[] {
  return files.filter((file) => file.name <= rawSqlLedgerBootstrapCutoff);
}

async function printPlan(rootDir: string): Promise<void> {
  const files = await rawSqlFiles(rootDir);

  console.log("Migration plan:");
  console.log("1. Prisma migrations: pnpm prisma migrate deploy");
  console.log("2. Raw SQL files from db/sql:");

  if (files.length === 0) {
    console.log("   - none");
    return;
  }

  for (const file of files) {
    console.log(`   - ${file.name}`);
  }
}

async function run(command: string, args: string[], cwd: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: process.platform === "win32",
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with ${code ?? "unknown status"}`));
    });
  });
}

async function apply(rootDir: string, dryRun: boolean): Promise<void> {
  if (dryRun) {
    await printPlan(rootDir);
    return;
  }

  const files = await rawSqlFiles(rootDir);
  await run("pnpm", ["prisma", "migrate", "deploy"], rootDir);

  const prisma = new PrismaClient();
  try {
    await ensureRawSqlLedger(prisma);
    await bootstrapLegacyRawSqlLedger(prisma, files);

    for (const file of files) {
      await applyRawSqlFile(rootDir, prisma, file);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function reset(rootDir: string): Promise<void> {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("db:reset refuses to run unless NODE_ENV=development");
  }

  const files = await rawSqlFiles(rootDir);
  await run("pnpm", ["prisma", "migrate", "reset", "--force", "--skip-seed"], rootDir);

  const prisma = new PrismaClient();
  try {
    await ensureRawSqlLedger(prisma);

    for (const file of files) {
      await applyRawSqlFile(rootDir, prisma, file);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function applySingleSqlFile(rootDir: string, filePath: string): Promise<void> {
  const file = {
    name: basename(filePath),
    path: filePath,
  };
  assertSqlFilename(file.name);

  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe('CREATE SCHEMA IF NOT EXISTS "shared"');
    await ensureRawSqlLedger(prisma);
    await bootstrapLegacyRawSqlLedger(prisma, await rawSqlFiles(rootDir));
    await applyRawSqlFile(rootDir, prisma, file);
  } finally {
    await prisma.$disconnect();
  }
}

async function applyRawSqlFile(
  rootDir: string,
  prisma: PrismaClient,
  file: RawSqlFile,
): Promise<void> {
  const checksumSha256 = await checksumFile(file.path);
  const applied = await ledgerRow(prisma, file.name);

  if (applied) {
    if (applied.checksumSha256 !== checksumSha256) {
      throw new Error(
        `Raw SQL migration "${file.name}" changed after it was recorded in shared.raw_sql_migrations`,
      );
    }
    console.log(`Raw SQL skipped: ${file.name}`);
    return;
  }

  await executeSqlFile(rootDir, file.path);
  await recordLedgerRow(prisma, file.name, checksumSha256, "applied");
}

async function executeSqlFile(rootDir: string, filePath: string): Promise<void> {
  assertSqlFilename(basename(filePath));
  await run(
    "pnpm",
    ["prisma", "db", "execute", "--file", filePath, "--schema", "prisma/schema.prisma"],
    rootDir,
  );
}

async function ensureRawSqlLedger(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "shared"."raw_sql_migrations" (
      name text PRIMARY KEY,
      checksum_sha256 text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now(),
      applied_by text NOT NULL DEFAULT current_user,
      mode text NOT NULL DEFAULT 'applied',
      historical_checksum_verified boolean NOT NULL DEFAULT true,
      CONSTRAINT raw_sql_migrations_name_check
        CHECK (name ~ '^\\d{5}_.+\\.sql$'),
      CONSTRAINT raw_sql_migrations_checksum_check
        CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$'),
      CONSTRAINT raw_sql_migrations_mode_check
        CHECK (mode IN ('applied', 'legacy_imported'))
    )
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "shared"."raw_sql_migrations"
      ADD COLUMN IF NOT EXISTS historical_checksum_verified boolean NOT NULL DEFAULT true
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE "shared"."raw_sql_migrations"
    SET historical_checksum_verified = false
    WHERE mode = 'legacy_imported'
  `);
}

async function bootstrapLegacyRawSqlLedger(
  prisma: PrismaClient,
  files: RawSqlFile[],
): Promise<void> {
  if (!(await hasLegacyRawSqlMarker(prisma))) {
    return;
  }

  const legacyFiles = legacyBootstrapFiles(files);
  let imported = 0;
  for (const file of legacyFiles) {
    const applied = await ledgerRow(prisma, file.name);
    if (applied) {
      continue;
    }
    await recordLedgerRow(prisma, file.name, await checksumFile(file.path), "legacy_imported");
    imported += 1;
  }

  if (imported > 0) {
    console.log(
      `Raw SQL ledger bootstrapped ${imported} legacy migrations through ${rawSqlLedgerBootstrapCutoff}.`,
    );
  }
}

async function hasLegacyRawSqlMarker(prisma: PrismaClient): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT to_regprocedure('shared.apply_incident_case_number_unique_schema(name)') IS NOT NULL AS exists
  `;
  return rows[0]?.exists ?? false;
}

async function ledgerRow(
  prisma: PrismaClient,
  name: string,
): Promise<LedgerRow | null> {
  const rows = await prisma.$queryRaw<Array<LedgerRow>>`
    SELECT name, checksum_sha256 AS "checksumSha256"
    FROM "shared"."raw_sql_migrations"
    WHERE name = ${name}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function recordLedgerRow(
  prisma: PrismaClient,
  name: string,
  checksumSha256: string,
  mode: "applied" | "legacy_imported",
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "shared"."raw_sql_migrations" (
      name,
      checksum_sha256,
      mode,
      historical_checksum_verified
    )
    VALUES (${name}, ${checksumSha256}, ${mode}, ${mode === "applied"})
    ON CONFLICT (name) DO NOTHING
  `;
}

async function checksumFile(filePath: string): Promise<string> {
  const content = await readFile(filePath);
  return createHash("sha256").update(content).digest("hex");
}

export async function main(argv: string[]): Promise<void> {
  const parsed = parseArgs(argv);

  if (parsed.command === "apply") {
    await apply(parsed.rootDir, parsed.dryRun);
    return;
  }

  if (parsed.command === "reset") {
    await reset(parsed.rootDir);
    return;
  }

  if (parsed.command === "sql:apply") {
    if (!parsed.sqlFile) {
      throw new Error("sql:apply requires a SQL file");
    }
    await applySingleSqlFile(parsed.rootDir, parsed.sqlFile);
    return;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
