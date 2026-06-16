import { sqlite } from "@flue/runtime/node";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const dbPath = process.env.SSFW_FLUE_SQLITE_PATH ?? "./data/flue.db";
const adapter = sqlite(dbPath);

export default {
	async migrate() {
		migrateLegacySqliteForFlue1(dbPath);
		await adapter.migrate?.();
	},
	connect() {
		return adapter.connect();
	},
	close() {
		adapter.close?.();
	},
};

export function migrateLegacySqliteForFlue1(path: string): void {
	if (!path || path === ":memory:" || !existsSync(path)) {
		return;
	}

	const db = new DatabaseSync(path);

	try {
		db.exec("PRAGMA busy_timeout = 5000");
		db.exec("BEGIN IMMEDIATE");

		try {
			rebuildEventStreamsIfNeeded(db);
			rebuildStreamChunksIfNeeded(db);
			rebuildDispatchReceiptsIfNeeded(db);
			db.exec("COMMIT");
		} catch (error) {
			db.exec("ROLLBACK");
			throw error;
		}
	} finally {
		db.close();
	}
}

function rebuildEventStreamsIfNeeded(db: DatabaseSync): void {
	if (!columnExists(db, "flue_event_streams", "created_at")) {
		return;
	}

	db.exec("DROP TABLE IF EXISTS flue_event_streams_v011_backup");
	db.exec(
		"ALTER TABLE flue_event_streams RENAME TO flue_event_streams_v011_backup",
	);
	db.exec(`CREATE TABLE flue_event_streams (
		path TEXT PRIMARY KEY,
		next_offset INTEGER NOT NULL DEFAULT 0,
		closed INTEGER NOT NULL DEFAULT 0
	)`);
	db.exec(`INSERT OR IGNORE INTO flue_event_streams
		(path, next_offset, closed)
		SELECT path, next_offset, closed
		FROM flue_event_streams_v011_backup`);
	db.exec("DROP TABLE flue_event_streams_v011_backup");
}

function rebuildStreamChunksIfNeeded(db: DatabaseSync): void {
	if (!columnExists(db, "flue_agent_stream_chunks", "created_at")) {
		return;
	}

	db.exec("DROP TABLE IF EXISTS flue_agent_stream_chunks_v011_backup");
	db.exec(
		"ALTER TABLE flue_agent_stream_chunks RENAME TO flue_agent_stream_chunks_v011_backup",
	);
	db.exec(`CREATE TABLE flue_agent_stream_chunks (
		stream_key TEXT NOT NULL,
		segment_index INTEGER NOT NULL,
		body TEXT NOT NULL,
		PRIMARY KEY (stream_key, segment_index)
	)`);
	db.exec(`INSERT OR IGNORE INTO flue_agent_stream_chunks
		(stream_key, segment_index, body)
		SELECT stream_key, segment_index, body
		FROM flue_agent_stream_chunks_v011_backup`);
	db.exec("DROP TABLE flue_agent_stream_chunks_v011_backup");
}

function rebuildDispatchReceiptsIfNeeded(db: DatabaseSync): void {
	if (!columnExists(db, "flue_agent_dispatch_receipts", "settled_at")) {
		return;
	}

	db.exec("DROP TABLE IF EXISTS flue_agent_dispatch_receipts_v011_backup");
	db.exec(
		"ALTER TABLE flue_agent_dispatch_receipts RENAME TO flue_agent_dispatch_receipts_v011_backup",
	);
	db.exec(`CREATE TABLE flue_agent_dispatch_receipts (
		dispatch_id TEXT PRIMARY KEY,
		accepted_at INTEGER NOT NULL
	)`);
	db.exec(`INSERT OR IGNORE INTO flue_agent_dispatch_receipts
		(dispatch_id, accepted_at)
		SELECT dispatch_id, accepted_at
		FROM flue_agent_dispatch_receipts_v011_backup`);
	db.exec("DROP TABLE flue_agent_dispatch_receipts_v011_backup");
}

function columnExists(db: DatabaseSync, table: string, column: string): boolean {
	if (!tableExists(db, table)) {
		return false;
	}

	const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{
		name?: string;
	}>;

	return rows.some((row) => row.name === column);
}

function tableExists(db: DatabaseSync, table: string): boolean {
	const row = db
		.prepare(
			"SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?",
		)
		.get(table) as { count?: number | bigint } | undefined;
	const count = row?.count;

	return Number(count ?? 0) > 0;
}
