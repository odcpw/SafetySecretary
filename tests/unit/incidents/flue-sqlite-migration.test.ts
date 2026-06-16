import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { pathToFileURL } from "node:url";

type MigrationModule = {
	migrateLegacySqliteForFlue1(path: string): void;
};

test("flue sqlite startup migration rewrites old 0.11 tables for Flue 1.0 inserts", async () => {
	const dir = mkdtempSync(join(tmpdir(), "ssfw-flue-migrate-"));

	try {
		const dbPath = join(dir, "flue.db");
		const db = new DatabaseSync(dbPath);

		try {
			db.exec(`
				CREATE TABLE flue_event_streams (
					path TEXT PRIMARY KEY,
					next_offset INTEGER NOT NULL DEFAULT 0,
					closed INTEGER NOT NULL DEFAULT 0,
					created_at TEXT NOT NULL DEFAULT (datetime('now'))
				);
				CREATE TABLE flue_agent_stream_chunks (
					stream_key TEXT NOT NULL,
					segment_index INTEGER NOT NULL,
					body TEXT NOT NULL,
					created_at INTEGER NOT NULL,
					PRIMARY KEY (stream_key, segment_index)
				);
				CREATE TABLE flue_agent_dispatch_receipts (
					dispatch_id TEXT PRIMARY KEY,
					accepted_at INTEGER NOT NULL,
					settled_at INTEGER NOT NULL
				);
			`);
			db.prepare(
				"INSERT INTO flue_event_streams (path, next_offset, closed) VALUES (?, ?, ?)",
			).run("agents/incident", 7, 0);
			db.prepare(
				"INSERT INTO flue_agent_stream_chunks (stream_key, segment_index, body, created_at) VALUES (?, ?, ?, ?)",
			).run("legacy-stream", 0, "body-0", 1);
			db.prepare(
				"INSERT INTO flue_agent_dispatch_receipts (dispatch_id, accepted_at, settled_at) VALUES (?, ?, ?)",
			).run("dispatch-legacy", 2, 3);
		} finally {
			db.close();
		}

		const { migrateLegacySqliteForFlue1 } =
			(await import(
				pathToFileURL(join(process.cwd(), ".flue/db.ts")).href
			)) as MigrationModule;
		migrateLegacySqliteForFlue1(dbPath);

		const migrated = new DatabaseSync(dbPath);
		try {
			assert.deepEqual(columnNames(migrated, "flue_event_streams"), [
				"path",
				"next_offset",
				"closed",
			]);
			assert.deepEqual(columnNames(migrated, "flue_agent_stream_chunks"), [
				"stream_key",
				"segment_index",
				"body",
			]);
			assert.deepEqual(columnNames(migrated, "flue_agent_dispatch_receipts"), [
				"dispatch_id",
				"accepted_at",
			]);

			migrated
				.prepare(
					"INSERT INTO flue_agent_stream_chunks (stream_key, segment_index, body) VALUES (?, ?, ?)",
				)
				.run("v1-stream", 0, "body-1");
			migrated
				.prepare(
					"INSERT INTO flue_agent_dispatch_receipts (dispatch_id, accepted_at) VALUES (?, ?)",
				)
				.run("dispatch-v1", 4);

			assert.equal(countRows(migrated, "flue_event_streams"), 1);
			assert.equal(countRows(migrated, "flue_agent_stream_chunks"), 2);
			assert.equal(countRows(migrated, "flue_agent_dispatch_receipts"), 2);
		} finally {
			migrated.close();
		}
	} finally {
		rmSync(dir, { force: true, recursive: true });
	}
});

function columnNames(db: DatabaseSync, table: string): string[] {
	return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>)
		.map((row) => row.name);
}

function countRows(db: DatabaseSync, table: string): number {
	const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
		count: number | bigint;
	};

	return Number(row.count);
}
