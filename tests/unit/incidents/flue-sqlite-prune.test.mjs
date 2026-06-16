import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { pruneFlueSqlite } from "../../../scripts/agent-runtime/prune-flue-sqlite.mjs";

test("flue sqlite pruner deletes legacy timestamped stream telemetry and keeps sessions", () => {
	const dir = mkdtempSync(join(tmpdir(), "ssfw-flue-prune-"));

	try {
		const dbPath = join(dir, "flue.db");
		const db = new DatabaseSync(dbPath);
		db.exec(`
			CREATE TABLE flue_event_streams (
				path TEXT PRIMARY KEY,
				next_offset INTEGER NOT NULL DEFAULT 0,
				closed INTEGER NOT NULL DEFAULT 0,
				created_at TEXT NOT NULL
			);
			CREATE TABLE flue_event_stream_entries (
				path TEXT NOT NULL,
				seq INTEGER NOT NULL,
				data TEXT NOT NULL,
				PRIMARY KEY (path, seq)
			);
			CREATE TABLE flue_agent_stream_chunks (
				stream_key TEXT NOT NULL,
				segment_index INTEGER NOT NULL,
				body TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				PRIMARY KEY (stream_key, segment_index)
			);
			CREATE TABLE flue_session_entries (
				session_id TEXT NOT NULL,
				entry_id TEXT NOT NULL,
				position INTEGER NOT NULL,
				data TEXT NOT NULL,
				PRIMARY KEY (session_id, entry_id)
			);
		`);
		db.prepare(
			"INSERT INTO flue_event_streams (path, next_offset, closed, created_at) VALUES (?, ?, ?, ?)",
		).run("old-stream", 2, 1, "2026-06-15 09:00:00");
		db.prepare(
			"INSERT INTO flue_event_streams (path, next_offset, closed, created_at) VALUES (?, ?, ?, ?)",
		).run("new-stream", 1, 0, "2026-06-16 10:30:00");
		db.prepare(
			"INSERT INTO flue_event_stream_entries (path, seq, data) VALUES (?, ?, ?)",
		).run("old-stream", 0, '{"type":"message_update"}');
		db.prepare(
			"INSERT INTO flue_event_stream_entries (path, seq, data) VALUES (?, ?, ?)",
		).run("old-stream", 1, '{"type":"thinking_delta"}');
		db.prepare(
			"INSERT INTO flue_event_stream_entries (path, seq, data) VALUES (?, ?, ?)",
		).run("new-stream", 0, '{"type":"turn_result"}');
		db.prepare(
			"INSERT INTO flue_agent_stream_chunks (stream_key, segment_index, body, created_at) VALUES (?, ?, ?, ?)",
		).run("old-chunks", 0, "old", Date.parse("2026-06-15T09:00:00.000Z"));
		db.prepare(
			"INSERT INTO flue_agent_stream_chunks (stream_key, segment_index, body, created_at) VALUES (?, ?, ?, ?)",
		).run("new-chunks", 0, "new", Date.parse("2026-06-16T10:30:00.000Z"));
		db.prepare(
			"INSERT INTO flue_session_entries (session_id, entry_id, position, data) VALUES (?, ?, ?, ?)",
		).run("session-1", "entry-1", 1, '{"durable":true}');
		db.close();

		const result = pruneFlueSqlite({
			dbPath,
			now: new Date("2026-06-16T12:00:00.000Z"),
			retentionHours: 24,
			vacuum: false,
		});

		assert.equal(result.ok, true);
		assert.deepEqual(result.notes, [
			"legacy_event_stream_ttl_applied",
			"legacy_agent_stream_chunk_ttl_applied",
		]);
		assert.equal(result.deleted.eventStreamsMatched, 1);
		assert.equal(result.deleted.eventStreamEntries, 2);
		assert.equal(result.deleted.eventStreams, 1);
		assert.equal(result.deleted.agentStreamChunks, 1);

		const verified = new DatabaseSync(dbPath);
		try {
			assert.equal(countRows(verified, "flue_event_streams"), 1);
			assert.equal(countRows(verified, "flue_event_stream_entries"), 1);
			assert.equal(countRows(verified, "flue_agent_stream_chunks"), 1);
			assert.equal(countRows(verified, "flue_session_entries"), 1);
		} finally {
			verified.close();
		}
	} finally {
		rmSync(dir, { force: true, recursive: true });
	}
});

test("flue sqlite pruner keeps Flue 1.0 durable streams and prunes only dead recovery chunks", () => {
	const dir = mkdtempSync(join(tmpdir(), "ssfw-flue-prune-v1-"));

	try {
		const dbPath = join(dir, "flue.db");
		const db = new DatabaseSync(dbPath);
		db.exec(`
			CREATE TABLE flue_event_streams (
				path TEXT PRIMARY KEY,
				next_offset INTEGER NOT NULL DEFAULT 0,
				closed INTEGER NOT NULL DEFAULT 0
			);
			CREATE TABLE flue_event_stream_entries (
				path TEXT NOT NULL,
				seq INTEGER NOT NULL,
				data TEXT NOT NULL,
				PRIMARY KEY (path, seq)
			);
			CREATE TABLE flue_agent_turn_journals (
				submission_id TEXT PRIMARY KEY,
				session_key TEXT NOT NULL,
				kind TEXT NOT NULL,
				attempt_id TEXT NOT NULL,
				operation_id TEXT NOT NULL,
				turn_id TEXT NOT NULL,
				phase TEXT NOT NULL,
				revision INTEGER NOT NULL,
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL,
				checkpoint_leaf_id TEXT,
				tool_request_json TEXT,
				stream_key TEXT,
				stream_consumed_at INTEGER,
				committed INTEGER NOT NULL DEFAULT 0,
				committed_leaf_id TEXT
			);
			CREATE TABLE flue_agent_stream_chunks (
				stream_key TEXT NOT NULL,
				segment_index INTEGER NOT NULL,
				body TEXT NOT NULL,
				PRIMARY KEY (stream_key, segment_index)
			);
		`);
		db.prepare(
			"INSERT INTO flue_event_streams (path, next_offset, closed) VALUES (?, ?, ?)",
		).run("agents/incident/old", 1, 1);
		db.prepare(
			"INSERT INTO flue_event_stream_entries (path, seq, data) VALUES (?, ?, ?)",
		).run(
			"agents/incident/old",
			0,
			'{"type":"message_end","timestamp":"2026-06-15T09:00:00.000Z"}',
		);
		db.prepare(
			`INSERT INTO flue_agent_turn_journals (
				submission_id, session_key, kind, attempt_id, operation_id, turn_id,
				phase, revision, created_at, updated_at, stream_key, stream_consumed_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"submission-active",
			"session-1",
			"direct",
			"attempt-1",
			"operation-1",
			"turn-1",
			"provider_started",
			1,
			1,
			1,
			"active-stream",
			null,
		);
		db.prepare(
			`INSERT INTO flue_agent_turn_journals (
				submission_id, session_key, kind, attempt_id, operation_id, turn_id,
				phase, revision, created_at, updated_at, stream_key, stream_consumed_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			"submission-consumed",
			"session-1",
			"direct",
			"attempt-2",
			"operation-2",
			"turn-2",
			"committed",
			1,
			1,
			1,
			"consumed-stream",
			2,
		);
		db.prepare(
			"INSERT INTO flue_agent_stream_chunks (stream_key, segment_index, body) VALUES (?, ?, ?)",
		).run("active-stream", 0, "active");
		db.prepare(
			"INSERT INTO flue_agent_stream_chunks (stream_key, segment_index, body) VALUES (?, ?, ?)",
		).run("consumed-stream", 0, "consumed");
		db.prepare(
			"INSERT INTO flue_agent_stream_chunks (stream_key, segment_index, body) VALUES (?, ?, ?)",
		).run("orphan-stream", 0, "orphan");
		db.close();

		const result = pruneFlueSqlite({
			dbPath,
			now: new Date("2026-06-16T12:00:00.000Z"),
			retentionHours: 24,
			vacuum: false,
		});

		assert.equal(result.ok, true);
		assert.deepEqual(result.notes, [
			"event_stream_ttl_skipped_no_created_at_column",
			"agent_stream_chunk_orphan_cleanup_applied",
		]);
		assert.equal(result.deleted.eventStreams, 0);
		assert.equal(result.deleted.eventStreamEntries, 0);
		assert.equal(result.deleted.agentStreamChunksConsumed, 1);
		assert.equal(result.deleted.agentStreamChunksOrphaned, 1);
		assert.equal(result.deleted.agentStreamChunks, 2);

		const verified = new DatabaseSync(dbPath);
		try {
			assert.equal(countRows(verified, "flue_event_streams"), 1);
			assert.equal(countRows(verified, "flue_event_stream_entries"), 1);
			assert.equal(countRows(verified, "flue_agent_stream_chunks"), 1);
		} finally {
			verified.close();
		}
	} finally {
		rmSync(dir, { force: true, recursive: true });
	}
});

test("flue sqlite pruner no-ops when the database is missing", () => {
	const result = pruneFlueSqlite({
		dbPath: join(tmpdir(), `missing-flue-${Date.now()}.db`),
		now: new Date("2026-06-16T12:00:00.000Z"),
		retentionHours: 24,
	});

	assert.equal(result.ok, true);
	assert.equal(result.skipped, "database_missing");
	assert.equal(result.deleted.eventStreamEntries, 0);
});

function countRows(db, table) {
	return db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
}
