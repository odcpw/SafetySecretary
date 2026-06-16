#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";

const defaultDbPath = "./data/flue.db";
const defaultRetentionHours = 24;
const hourMs = 60 * 60 * 1000;

const statTables = {
	agentAttemptMarkers: ["flue_agent_attempt_markers", null],
	agentStreamChunks: ["flue_agent_stream_chunks", "body"],
	agentSubmissions: ["flue_agent_submissions", "payload"],
	eventStreamEntries: ["flue_event_stream_entries", "data"],
	eventStreams: ["flue_event_streams", null],
	meta: ["flue_meta", "value"],
	runs: ["flue_runs", null],
	sessionEntries: ["flue_session_entries", "data"],
	sessions: ["flue_sessions", "data"],
};

export function pruneFlueSqlite(options = {}) {
	const dbPath = resolve(options.dbPath ?? defaultDbPath);
	const retentionHours = retentionHoursFromValue(
		options.retentionHours ?? defaultRetentionHours,
	);
	const now = options.now ?? new Date();
	const cutoff = formatSqlDate(new Date(now.getTime() - retentionHours * hourMs));
	const vacuum = options.vacuum === true;

	if (!existsSync(dbPath)) {
		return {
			after: null,
			before: null,
			cutoff,
			dbPath,
			deleted: emptyDeletedStats(),
			notes: [],
			ok: true,
			retentionHours,
			skipped: "database_missing",
			vacuum: {
				attempted: false,
				checkpoint: { attempted: false, ok: null },
				ok: null,
			},
		};
	}

	const db = new DatabaseSync(dbPath);

	try {
		db.exec("PRAGMA busy_timeout = 5000");

		const before = collectStats(db);
		const deleted = emptyDeletedStats();
		const notes = [];

		db.exec("BEGIN IMMEDIATE");
		try {
			if (
				tableExists(db, "flue_event_streams") &&
				tableExists(db, "flue_event_stream_entries")
			) {
				if (columnExists(db, "flue_event_streams", "created_at")) {
					deleted.eventStreamsMatched = countRows(
						db,
						"SELECT COUNT(*) AS count FROM flue_event_streams WHERE datetime(created_at) < datetime(?)",
						cutoff,
					);
					deleted.eventStreamEntries = runDelete(
						db,
						`DELETE FROM flue_event_stream_entries
						 WHERE path IN (
							 SELECT path
							 FROM flue_event_streams
							 WHERE datetime(created_at) < datetime(?)
						 )`,
						cutoff,
					);
					deleted.eventStreams = runDelete(
						db,
						"DELETE FROM flue_event_streams WHERE datetime(created_at) < datetime(?)",
						cutoff,
					);
					notes.push("legacy_event_stream_ttl_applied");
				} else {
					notes.push("event_stream_ttl_skipped_no_created_at_column");
				}
			}

			if (tableExists(db, "flue_agent_stream_chunks")) {
				if (columnExists(db, "flue_agent_stream_chunks", "created_at")) {
					deleted.agentStreamChunks = runDelete(
						db,
						"DELETE FROM flue_agent_stream_chunks WHERE created_at < ?",
						new Date(`${cutoff}Z`).getTime(),
					);
					notes.push("legacy_agent_stream_chunk_ttl_applied");
				} else if (tableExists(db, "flue_agent_turn_journals")) {
					deleted.agentStreamChunksConsumed = runDelete(
						db,
						`DELETE FROM flue_agent_stream_chunks
						 WHERE stream_key IN (
							 SELECT stream_key
							 FROM flue_agent_turn_journals
							 WHERE stream_key IS NOT NULL
							   AND stream_consumed_at IS NOT NULL
						 )`,
					);
					deleted.agentStreamChunksOrphaned = runDelete(
						db,
						`DELETE FROM flue_agent_stream_chunks
						 WHERE stream_key NOT IN (
							 SELECT stream_key
							 FROM flue_agent_turn_journals
							 WHERE stream_key IS NOT NULL
						 )`,
					);
					deleted.agentStreamChunks =
						deleted.agentStreamChunksConsumed +
						deleted.agentStreamChunksOrphaned;
					notes.push("agent_stream_chunk_orphan_cleanup_applied");
				} else {
					notes.push("agent_stream_chunk_cleanup_skipped_no_timestamp_or_journal");
				}
			}

			db.exec("COMMIT");
		} catch (error) {
			db.exec("ROLLBACK");
			throw error;
		}

		const vacuumResult = runVacuumIfRequested(db, vacuum);
		const after = collectStats(db);

		return {
			after,
			before,
			cutoff,
			dbPath,
			deleted,
			notes,
			ok: true,
			retentionHours,
			vacuum: vacuumResult,
		};
	} finally {
		db.close();
	}
}

function runVacuumIfRequested(db, vacuum) {
	if (!vacuum) {
		return {
			attempted: false,
			checkpoint: { attempted: false, ok: null },
			ok: null,
		};
	}

	try {
		db.exec("VACUUM");
		return {
			attempted: true,
			checkpoint: runWalCheckpoint(db),
			ok: true,
		};
	} catch (error) {
		return {
			attempted: true,
			checkpoint: { attempted: false, ok: null },
			error: error instanceof Error ? error.message : String(error),
			ok: false,
		};
	}
}

function runWalCheckpoint(db) {
	try {
		db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
		return { attempted: true, ok: true };
	} catch (error) {
		return {
			attempted: true,
			error: error instanceof Error ? error.message : String(error),
			ok: false,
		};
	}
}

function collectStats(db) {
	return Object.fromEntries(
		Object.entries(statTables).map(([name, [table, textColumn]]) => [
			name,
			tableStats(db, table, textColumn),
		]),
	);
}

function tableStats(db, table, textColumn) {
	if (!tableExists(db, table)) {
		return null;
	}

	return {
		bytes: textColumn
			? countRows(
					db,
					`SELECT COALESCE(SUM(length(${textColumn})), 0) AS count FROM ${table}`,
				)
			: null,
		rows: countRows(db, `SELECT COUNT(*) AS count FROM ${table}`),
	};
}

function tableExists(db, table) {
	return (
		countRows(
			db,
			"SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = ?",
			table,
		) > 0
	);
}

function columnExists(db, table, column) {
	if (!tableExists(db, table)) {
		return false;
	}

	return db
		.prepare(`PRAGMA table_info(${table})`)
		.all()
		.some((row) => row.name === column);
}

function runDelete(db, sql, ...bindings) {
	const result = db.prepare(sql).run(...bindings);
	return Number(result.changes ?? 0);
}

function countRows(db, sql, ...bindings) {
	const row = db.prepare(sql).get(...bindings);
	const value = row?.count;
	return typeof value === "bigint" ? Number(value) : Number(value ?? 0);
}

function emptyDeletedStats() {
	return {
		agentStreamChunks: 0,
		agentStreamChunksConsumed: 0,
		agentStreamChunksOrphaned: 0,
		eventStreamEntries: 0,
		eventStreams: 0,
		eventStreamsMatched: 0,
	};
}

function formatSqlDate(date) {
	return date.toISOString().slice(0, 19).replace("T", " ");
}

function retentionHoursFromValue(value) {
	const hours = Number(value);

	if (!Number.isFinite(hours) || hours < 0) {
		throw new Error("SSFW_FLUE_STREAM_RETENTION_HOURS must be a number >= 0.");
	}

	return hours;
}

function optionsFromEnv(env) {
	const dbPath = env.SSFW_FLUE_SQLITE_PATH?.trim() || defaultDbPath;
	const retentionHours = env.SSFW_FLUE_STREAM_RETENTION_HOURS?.trim()
		? retentionHoursFromValue(env.SSFW_FLUE_STREAM_RETENTION_HOURS)
		: defaultRetentionHours;
	const vacuum = /^(1|true|yes)$/i.test(
		env.SSFW_FLUE_PRUNE_VACUUM?.trim() ?? "",
	);

	return { dbPath, retentionHours, vacuum };
}

function isDirectRun() {
	return (
		process.argv[1] !== undefined &&
		import.meta.url === pathToFileURL(resolve(process.argv[1])).href
	);
}

if (isDirectRun()) {
	try {
		const result = pruneFlueSqlite(optionsFromEnv(process.env));
		console.log(JSON.stringify(result, null, 2));
	} catch (error) {
		console.error(
			JSON.stringify(
				{
					error: error instanceof Error ? error.message : String(error),
					ok: false,
				},
				null,
				2,
			),
		);
		process.exitCode = 1;
	}
}
