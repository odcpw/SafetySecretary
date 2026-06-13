import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import process from "node:process";

type Command = "apply" | "reset" | "sql:apply";

type ParsedArgs = {
  command: Command;
  dryRun: boolean;
  rootDir: string;
  sqlFile?: string;
};

type RawSqlFile = {
  name: string;
  path: string;
};

const sqlNamePattern = /^\d{5}_.+\.sql$/;

function usage(): string {
  return [
    "Usage:",
    "  pnpm db:migrate [apply] [--dry-run]",
    "  pnpm db:reset",
    "  pnpm db:sql:apply <file>",
  ].join("\n");
}

function parseArgs(argv: string[]): ParsedArgs {
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

async function rawSqlFiles(rootDir: string): Promise<RawSqlFile[]> {
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

function assertSqlFilename(fileName: string): void {
  if (!sqlNamePattern.test(fileName)) {
    throw new Error(
      `Raw SQL file "${fileName}" must start with a 5-digit sequence prefix like 00010_name.sql`,
    );
  }
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

  for (const file of files) {
    await applySqlFile(rootDir, file.path);
  }
}

async function reset(rootDir: string): Promise<void> {
  if (process.env.NODE_ENV !== "development") {
    throw new Error("db:reset refuses to run unless NODE_ENV=development");
  }

  const files = await rawSqlFiles(rootDir);
  await run("pnpm", ["prisma", "migrate", "reset", "--force", "--skip-seed"], rootDir);

  for (const file of files) {
    await applySqlFile(rootDir, file.path);
  }
}

async function applySqlFile(rootDir: string, filePath: string): Promise<void> {
  assertSqlFilename(basename(filePath));
  await run(
    "pnpm",
    ["prisma", "db", "execute", "--file", filePath, "--schema", "prisma/schema.prisma"],
    rootDir,
  );
}

async function main(argv: string[]): Promise<void> {
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
    await applySqlFile(parsed.rootDir, parsed.sqlFile);
    return;
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
