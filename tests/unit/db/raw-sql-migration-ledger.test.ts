import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const {
	assertSqlFilename,
	legacyBootstrapFiles,
	parseArgs,
	rawSqlFiles,
} = (await import(moduleUrl("scripts/db/migrate.ts"))) as typeof import("../../../scripts/db/migrate");

test("raw SQL files are sorted and ignore non-migration files", async () => {
	const root = await mkdtemp(join(tmpdir(), "ssfw-raw-sql-"));
	try {
		await mkdir(join(root, "db", "sql"), { recursive: true });
		await writeFile(join(root, "db", "sql", "README.md"), "# docs\n");
		await writeFile(join(root, "db", "sql", "00020_second.sql"), "SELECT 2;\n");
		await writeFile(join(root, "db", "sql", "00010_first.sql"), "SELECT 1;\n");

		assert.deepEqual(
			(await rawSqlFiles(root)).map((file) => file.name),
			["00010_first.sql", "00020_second.sql"],
		);
	} finally {
		await rm(root, { force: true, recursive: true });
	}
});

test("raw SQL file names must be ordered migration names", () => {
	assert.doesNotThrow(() => assertSqlFilename("00450_name.sql"));
	assert.throws(
		() => assertSqlFilename("450_name.sql"),
		/must start with a 5-digit sequence prefix/,
	);
	assert.throws(
		() => assertSqlFilename("00450.sql"),
		/must start with a 5-digit sequence prefix/,
	);
});

test("legacy bootstrap imports only the known pre-ledger migration range", () => {
	const files = [
		{ name: "00440_tenant_db_roles.sql", path: "/x/00440_tenant_db_roles.sql" },
		{
			name: "00450_incident_case_number_unique.sql",
			path: "/x/00450_incident_case_number_unique.sql",
		},
		{ name: "00460_future.sql", path: "/x/00460_future.sql" },
	];

	assert.deepEqual(
		legacyBootstrapFiles(files).map((file) => file.name),
		["00440_tenant_db_roles.sql", "00450_incident_case_number_unique.sql"],
	);
});

test("migration CLI arguments preserve existing command shape", () => {
	assert.deepEqual(parseArgs([]), {
		command: "apply",
		dryRun: false,
		rootDir: process.cwd(),
		sqlFile: undefined,
	});
	assert.deepEqual(parseArgs(["apply", "--dry-run", "--root", "/tmp/app"]), {
		command: "apply",
		dryRun: true,
		rootDir: "/tmp/app",
		sqlFile: undefined,
	});
	assert.deepEqual(parseArgs(["sql:apply", "db/sql/00450_x.sql"]), {
		command: "sql:apply",
		dryRun: false,
		rootDir: process.cwd(),
		sqlFile: "db/sql/00450_x.sql",
	});
	assert.deepEqual(parseArgs(["--", "--dry-run"]), {
		command: "apply",
		dryRun: true,
		rootDir: process.cwd(),
		sqlFile: undefined,
	});
});

function moduleUrl(relativePath: string): string {
	return pathToFileURL(`${process.cwd()}/${relativePath}`).href;
}
