#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const DEFAULT_HOST = "root@100.84.128.74";
const DEFAULT_KEY = "~/.ssh/Hetzner_SafetySecretary";
const DEFAULT_REMOTE_DIR = "/home/safetysecretary/apps/safetysecretary-next";
const DEFAULT_OUT_DIR = ".tmp/case-corpus";
const DEFAULT_EVENT_LIMIT = 5000;

const args = parseArgs(process.argv.slice(2));

if (args.help) {
	printHelp();
	process.exit(0);
}

const selector = {
	case:
		args.caseId ??
		args.caseNumber ??
		args.case ??
		readEnv("SAFETYSECRETARY_EXPORT_CASE", "SSFW_EXPORT_CASE"),
	tenant:
		args.tenantId ??
		args.tenant ??
		readEnv("SAFETYSECRETARY_EXPORT_TENANT", "SSFW_EXPORT_TENANT"),
};

if (!selector.case && !selector.tenant) {
	throw new Error(
		"Provide --case, --case-id, --case-number, --tenant, or --tenant-id.",
	);
}

const startedAt = new Date();
const host =
	args.host ??
	readEnv("SAFETYSECRETARY_PROD_SSH_HOST", "SSFW_PROD_SSH_HOST") ??
	DEFAULT_HOST;
const keyPath = expandHome(
	args.key ??
		readEnv("SAFETYSECRETARY_PROD_SSH_KEY", "SSFW_PROD_SSH_KEY") ??
		DEFAULT_KEY,
);
const remoteDir =
	args.remoteDir ??
	readEnv("SAFETYSECRETARY_PROD_APP_DIR", "SSFW_PROD_APP_DIR") ??
	DEFAULT_REMOTE_DIR;
const outDir = resolve(
	args.outDir ??
		readEnv("SAFETYSECRETARY_CASE_CORPUS_OUT_DIR", "SSFW_CASE_CORPUS_OUT_DIR") ??
		DEFAULT_OUT_DIR,
);
const input = {
	eventLimit: positiveInteger(args.eventLimit, DEFAULT_EVENT_LIMIT),
	fullFlueStream: Boolean(args.fullFlueStream),
	includeFiles: !args.noFiles,
	selector,
};

const remotePayload = await runRemoteExport({
	host,
	input,
	keyPath,
	remoteDir,
});

const folder = materializeExport({
	host,
	outDir,
	remoteDir,
	report: {
		exportedAt: startedAt.toISOString(),
		source: {
			host,
			remoteDir,
		},
		...remotePayload,
	},
});

printSummary(folder, remotePayload);

async function runRemoteExport(input) {
	const encodedInput = Buffer.from(JSON.stringify(input.input), "utf8").toString(
		"base64url",
	);
	const remoteCommand = [
		`cd ${shellQuote(input.remoteDir)}`,
		"&&",
		"node --env-file=.env --input-type=module -",
		shellQuote(encodedInput),
	].join(" ");
	const child = spawn(
		"ssh",
		[
			"-i",
			input.keyPath,
			"-o",
			"BatchMode=yes",
			"-o",
			"IdentitiesOnly=yes",
			"-o",
			"ConnectTimeout=10",
			input.host,
			remoteCommand,
		],
		{ stdio: ["pipe", "pipe", "pipe"] },
	);

	let stdout = "";
	let stderr = "";
	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");
	child.stdout.on("data", (chunk) => {
		stdout += chunk;
	});
	child.stderr.on("data", (chunk) => {
		stderr += chunk;
	});

	child.stdin.end(remoteScriptSource());

	const exitCode = await new Promise((resolveExit) => {
		child.on("close", resolveExit);
	});

	if (exitCode !== 0) {
		throw new Error(
			`Remote case export failed with exit code ${exitCode}.\n${stderr.trim()}`,
		);
	}

	try {
		return JSON.parse(stdout);
	} catch (error) {
		throw new Error(
			`Remote case export did not return JSON: ${String(error)}\n${stdout.slice(
				0,
				1000,
			)}`,
		);
	}
}

function materializeExport(input) {
	const tenant = input.report.resolved?.tenant;
	const incident = input.report.resolved?.case;
	const folderName = [
		timestamp(new Date(input.report.exportedAt)),
		safePathSegment(tenant?.name ?? tenant?.id ?? "tenant"),
		safePathSegment(incident?.caseNumber ?? incident?.id ?? "case"),
	].join("-");
	const folder = join(input.outDir, folderName);
	const postgresDir = join(folder, "postgres");
	const flueDir = join(folder, "flue");
	const filesDir = join(folder, "files");

	mkdirSync(postgresDir, { recursive: true });
	mkdirSync(flueDir, { recursive: true });

	const postgres = structuredClone(input.report.postgres ?? {});
	const fileCount = materializeEmbeddedFiles(postgres.files ?? [], filesDir);

	const manifest = {
		exportedAt: input.report.exportedAt,
		source: input.report.source,
		selector: input.report.selector,
		resolved: input.report.resolved,
		environment: input.report.environment,
		counts: {
			filesWritten: fileCount,
			flueEventEntries: input.report.flue?.eventStreamEntries?.length ?? 0,
			flueSessionEntries: input.report.flue?.sessionEntries?.length ?? 0,
			flueSubmissions: input.report.flue?.submissions?.length ?? 0,
			postgresCoachMessages:
				input.report.postgres?.caseBundle?.coachMessages?.length ?? 0,
		},
	};

	writeJson(join(folder, "manifest.json"), manifest);
	writeJson(join(postgresDir, "case-bundle.json"), postgres.caseBundle ?? {});
	writeJson(join(postgresDir, "shared-context.json"), postgres.shared ?? {});
	writeJson(join(postgresDir, "table-counts.json"), postgres.tableCounts ?? {});
	writeJson(join(postgresDir, "file-refs.json"), postgres.files ?? []);
	writeJson(join(flueDir, "session-entries.json"), input.report.flue?.sessionEntries ?? []);
	writeJson(join(flueDir, "submissions.json"), input.report.flue?.submissions ?? []);
	writeJson(join(flueDir, "turn-journals.json"), input.report.flue?.turnJournals ?? []);
	writeJson(
		join(flueDir, "event-stream-entries.json"),
		input.report.flue?.eventStreamEntries ?? [],
	);
	writeJson(join(flueDir, "summary.json"), input.report.flue?.summary ?? {});
	writeFileSync(join(folder, "review.md"), reviewTemplate(manifest), "utf8");
	writeJson(join(folder, "bundle.json"), {
		...input.report,
		postgres,
	});

	return folder;
}

function materializeEmbeddedFiles(files, filesDir) {
	let written = 0;

	for (const file of files) {
		if (!file.contentBase64) {
			continue;
		}
		const filename = safePathSegment(
			[
				file.source ?? "file",
				file.sourceId ? String(file.sourceId).slice(0, 8) : "",
				file.filename ?? "attachment.bin",
			]
				.filter(Boolean)
				.join("-"),
		);
		const localPath = join(filesDir, filename);
		mkdirSync(filesDir, { recursive: true });
		writeFileSync(localPath, Buffer.from(file.contentBase64, "base64"));
		file.localPath = localPath;
		delete file.contentBase64;
		written += 1;
	}

	return written;
}

function writeJson(path, value) {
	writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function reviewTemplate(manifest) {
	return `# Case Review

- Exported: ${manifest.exportedAt}
- Tenant: ${manifest.resolved?.tenant?.name ?? "unknown"} (${manifest.resolved?.tenant?.id ?? "unknown"})
- Case: ${manifest.resolved?.case?.caseNumber ?? "unknown"} (${manifest.resolved?.case?.id ?? "unknown"})

## Verdict


## What Worked


## What Failed


## Prompt/Tool Changes To Consider


## Regression Fixture Notes


`;
}

function printSummary(folder, report) {
	console.log(`Wrote ${folder}`);
	console.log(
		[
			`tenant=${report.resolved?.tenant?.name ?? "unknown"}`,
			`case=${report.resolved?.case?.caseNumber ?? report.resolved?.case?.id ?? "unknown"}`,
			`coachMessages=${report.postgres?.caseBundle?.coachMessages?.length ?? 0}`,
			`flueSessionEntries=${report.flue?.sessionEntries?.length ?? 0}`,
			`flueEvents=${report.flue?.eventStreamEntries?.length ?? 0}`,
			`files=${report.postgres?.files?.length ?? 0}`,
		].join("; "),
	);
}

function parseArgs(values) {
	const parsed = {};

	for (let index = 0; index < values.length; index += 1) {
		const value = values[index];

		if (value === "--") {
			continue;
		} else if (value === "--help" || value === "-h") {
			parsed.help = true;
		} else if (value === "--tenant") {
			parsed.tenant = requireValue(values, (index += 1), value);
		} else if (value.startsWith("--tenant=")) {
			parsed.tenant = value.slice("--tenant=".length);
		} else if (value === "--tenant-id") {
			parsed.tenantId = requireValue(values, (index += 1), value);
		} else if (value.startsWith("--tenant-id=")) {
			parsed.tenantId = value.slice("--tenant-id=".length);
		} else if (value === "--case") {
			parsed.case = requireValue(values, (index += 1), value);
		} else if (value.startsWith("--case=")) {
			parsed.case = value.slice("--case=".length);
		} else if (value === "--case-id") {
			parsed.caseId = requireValue(values, (index += 1), value);
		} else if (value.startsWith("--case-id=")) {
			parsed.caseId = value.slice("--case-id=".length);
		} else if (value === "--case-number") {
			parsed.caseNumber = requireValue(values, (index += 1), value);
		} else if (value.startsWith("--case-number=")) {
			parsed.caseNumber = value.slice("--case-number=".length);
		} else if (value === "--no-files") {
			parsed.noFiles = true;
		} else if (value === "--full-flue-stream") {
			parsed.fullFlueStream = true;
		} else if (value === "--event-limit") {
			parsed.eventLimit = requireValue(values, (index += 1), value);
		} else if (value.startsWith("--event-limit=")) {
			parsed.eventLimit = value.slice("--event-limit=".length);
		} else if (value === "--out-dir") {
			parsed.outDir = requireValue(values, (index += 1), value);
		} else if (value.startsWith("--out-dir=")) {
			parsed.outDir = value.slice("--out-dir=".length);
		} else if (value === "--host") {
			parsed.host = requireValue(values, (index += 1), value);
		} else if (value.startsWith("--host=")) {
			parsed.host = value.slice("--host=".length);
		} else if (value === "--key") {
			parsed.key = requireValue(values, (index += 1), value);
		} else if (value.startsWith("--key=")) {
			parsed.key = value.slice("--key=".length);
		} else if (value === "--remote-dir") {
			parsed.remoteDir = requireValue(values, (index += 1), value);
		} else if (value.startsWith("--remote-dir=")) {
			parsed.remoteDir = value.slice("--remote-dir=".length);
		} else {
			throw new Error(`Unknown argument: ${value}`);
		}
	}

	return parsed;
}

function requireValue(values, index, flag) {
	const value = values[index];
	if (!value || value.startsWith("--")) {
		throw new Error(`${flag} requires a value.`);
	}
	return value;
}

function positiveInteger(value, fallback) {
	if (value === undefined || value === null || value === "") {
		return fallback;
	}
	const number = Number(value);
	if (!Number.isInteger(number) || number < 1 || number > 1024 * 1024 * 1024) {
		throw new Error(`Expected a positive integer, got: ${value}`);
	}
	return number;
}

function expandHome(path) {
	return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

function readEnv(name, legacyName) {
	const value = process.env[name]?.trim();
	if (value) {
		return value;
	}

	return legacyName ? process.env[legacyName]?.trim() : undefined;
}

function shellQuote(value) {
	return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function safePathSegment(value) {
	const safe = String(value)
		.normalize("NFKD")
		.replace(/[^\w.-]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 120);
	return safe || "item";
}

function timestamp(date) {
	return date
		.toISOString()
		.replaceAll(":", "")
		.replace(/\.\d{3}Z$/, "Z");
}

function printHelp() {
	console.log(`Export one incident case into a local prompt/tool evaluation corpus folder.

Usage:
  pnpm operator:export-case -- --tenant siegfried.ch --case-number II-2026-001
  pnpm operator:export-case -- --tenant-id <uuid> --case-id <uuid>
  pnpm operator:export-case -- --case-id <uuid> --full-flue-stream

The export is read-only. It pulls:
  - shared tenant/user metadata needed for case attribution, excluding sessions and OAuth identities
  - selected incident record and related tenant tables
  - coach transcript, proposed operations, and operation decisions
  - local-storage file bodies referenced by the case, unless --no-files
  - Flue session entries, submissions, turn journals, and matching event entries

Defaults:
  host            ${DEFAULT_HOST}
  key             ${DEFAULT_KEY}
  remote dir      ${DEFAULT_REMOTE_DIR}
  out dir         ${DEFAULT_OUT_DIR}

Options:
  --tenant <value>         Tenant id, name, domain, or creator email.
  --tenant-id <uuid>       Tenant id.
  --case <value>           Case id, case number, exact title, or "latest".
  --case-id <uuid>         Case id.
  --case-number <value>    Case number, e.g. II-2026-001.
  --no-files               Keep file metadata but do not download file bodies.
  --full-flue-stream       Include the full matching Flue event stream path.
  --event-limit <n>        Max Flue event rows. Default: ${DEFAULT_EVENT_LIMIT}.
  --out-dir <path>         Local output directory.
  --host <ssh-host>        SSH host.
  --key <path>             SSH identity file.
  --remote-dir <path>      Remote app directory.
`);
}

function remoteScriptSource() {
	return String.raw`
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";

const input = JSON.parse(
	Buffer.from(process.argv[2] || "", "base64url").toString("utf8"),
);
const prisma = new PrismaClient();
const storageRoot = process.env.STORAGE_LOCAL_ROOT || "";

function isUuid(value) {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function quoteIdent(value) {
	if (!/^tenant_[0-9a-f_]{36}$/.test(value)) {
		throw new Error("Unexpected tenant schema: " + value);
	}
	return '"' + value.replaceAll('"', '""') + '"';
}

function iso(value) {
	return value instanceof Date ? value.toISOString() : value;
}

function jsonReplacer(_key, value) {
	if (typeof value === "bigint") {
		return Number.isSafeInteger(Number(value)) ? Number(value) : value.toString();
	}
	return value;
}

function normal(value) {
	return String(value ?? "").trim().toLowerCase();
}

function tenantSchemaName(tenantId) {
	return "tenant_" + tenantId.replaceAll("-", "_");
}

function encodeFlueIncidentInstanceId(value) {
	return "ii1_" + Buffer.from(JSON.stringify({ i: value.caseId, t: value.tenantId }), "utf8").toString("base64url");
}

function validateStorageKey(key) {
	return (
		typeof key === "string" &&
		key.length > 0 &&
		!key.startsWith("/") &&
		/^[a-zA-Z0-9_/.-]+$/.test(key) &&
		!key.includes("..")
	);
}

async function tableExists(schemaName, tableName) {
	const rows = await prisma.$queryRawUnsafe(
		"SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = $2) AS exists",
		schemaName,
		tableName,
	);
	return Boolean(rows[0] && rows[0].exists);
}

async function columnExists(schemaName, tableName, columnName) {
	const rows = await prisma.$queryRawUnsafe(
		"SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name = $3) AS exists",
		schemaName,
		tableName,
		columnName,
	);
	return Boolean(rows[0] && rows[0].exists);
}

async function optionalRows(schema, tableName, sql, ...parameters) {
	if (!(await tableExists(schema.name, tableName))) {
		return [];
	}
	return prisma.$queryRawUnsafe(sql, ...parameters);
}

async function countRows(schema, tableName, whereSql = "TRUE", ...parameters) {
	if (!(await tableExists(schema.name, tableName))) {
		return null;
	}
	const rows = await prisma.$queryRawUnsafe(
		"SELECT COUNT(*)::int AS count FROM " +
			schema.quoted +
			"." +
			tableName +
			" WHERE " +
			whereSql,
		...parameters,
	);
	return rows[0]?.count ?? 0;
}

async function readStorageFile(inputFile) {
	const key = inputFile.storageKey;
	if (!validateStorageKey(key)) {
		return { ...inputFile, skipped: true, reason: "invalid_storage_key" };
	}
	if (!storageRoot) {
		return { ...inputFile, skipped: true, reason: "storage_root_not_configured" };
	}
	const root = resolve(storageRoot);
	const filePath = resolve(root, key);
	const rootRelative = relative(root, filePath);
	if (rootRelative.startsWith("..") || rootRelative === "" || rootRelative.startsWith("/")) {
		return { ...inputFile, skipped: true, reason: "storage_path_outside_root" };
	}
	if (!existsSync(filePath)) {
		return { ...inputFile, skipped: true, reason: "file_missing" };
	}
	const fileStat = await stat(filePath);
	const metadataPath = filePath + ".metadata.json";
	const metadata = existsSync(metadataPath)
		? JSON.parse(await readFile(metadataPath, "utf8").catch(() => "null"))
		: null;
	const sizeBytes = fileStat.size;
	if (!input.includeFiles) {
		return { ...inputFile, metadata, sizeBytes, skipped: true, reason: "files_disabled" };
	}
	const body = await readFile(filePath);
	return {
		...inputFile,
		contentBase64: body.toString("base64"),
		metadata,
		sha256: createHash("sha256").update(body).digest("hex"),
		sizeBytes,
	};
}

async function resolveTenant(selector) {
	const tenants = await prisma.$queryRawUnsafe(
		"SELECT t.id::text AS id, t.name::text AS name, t.workspace_kind::text AS workspace_kind, t.created_at, t.deleted_at, t.created_by_user_id::text AS created_by_user_id, creator.email::text AS creator_email, COALESCE(array_remove(array_agg(DISTINCT td.domain::text), NULL), ARRAY[]::text[]) AS domains, shared.tenant_schema_name(t.id)::text AS schema_name FROM shared.tenants t LEFT JOIN shared.users creator ON creator.id = t.created_by_user_id LEFT JOIN shared.tenant_domains td ON td.tenant_id = t.id WHERE t.deleted_at IS NULL GROUP BY t.id, creator.email ORDER BY t.created_at ASC",
	);

	if (!selector) {
		return tenants;
	}

	const needle = normal(selector);
	return tenants.filter((tenant) => {
		if (normal(tenant.id) === needle) {
			return true;
		}
		if (normal(tenant.name) === needle) {
			return true;
		}
		if (normal(tenant.creator_email) === needle) {
			return true;
		}
		return (tenant.domains ?? []).some((domain) => normal(domain) === needle);
	});
}

async function findCandidateCases(tenants, selector) {
	const candidates = [];

	for (const tenant of tenants) {
		const schema = {
			name: tenant.schema_name ?? tenantSchemaName(tenant.id),
			quoted: quoteIdent(tenant.schema_name ?? tenantSchemaName(tenant.id)),
		};
		if (!(await tableExists(schema.name, "incident_case"))) {
			continue;
		}

		let rows;
		if (!selector || normal(selector) === "latest") {
			rows = await prisma.$queryRawUnsafe(
				"SELECT id::text AS id, case_number, title, created_at, updated_at FROM " +
					schema.quoted +
					".incident_case WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 1",
			);
		} else if (isUuid(selector)) {
			rows = await prisma.$queryRawUnsafe(
				"SELECT id::text AS id, case_number, title, created_at, updated_at FROM " +
					schema.quoted +
					".incident_case WHERE deleted_at IS NULL AND id = $1::uuid",
				selector,
			);
		} else {
			rows = await prisma.$queryRawUnsafe(
				"SELECT id::text AS id, case_number, title, created_at, updated_at FROM " +
					schema.quoted +
					".incident_case WHERE deleted_at IS NULL AND (lower(case_number) = lower($1) OR lower(title) = lower($1)) ORDER BY created_at DESC, id DESC",
				selector,
			);
		}

		for (const row of rows) {
			candidates.push({ case: row, schema, tenant });
		}
	}

	return candidates;
}

async function sharedContext(tenant, caseRecord) {
	const users = await prisma.$queryRawUnsafe(
		"SELECT u.id::text AS id, u.ui_locale::text AS ui_locale, u.created_at, CASE WHEN u.id = $2::uuid THEN 'case_creator' ELSE 'tenant_member' END AS relation_to_case FROM shared.tenant_memberships m JOIN shared.users u ON u.id = m.user_id WHERE m.tenant_id = $1::uuid ORDER BY u.created_at ASC",
		tenant.id,
		caseRecord.created_by ?? null,
	);
	const memberships = await prisma.$queryRawUnsafe(
		"SELECT m.id::text AS id, m.tenant_id::text AS tenant_id, m.user_id::text AS user_id, m.created_at FROM shared.tenant_memberships m WHERE m.tenant_id = $1::uuid ORDER BY m.created_at ASC",
		tenant.id,
	);

	return {
		excludedSharedTables: [
			"shared.sessions",
			"shared.oauth_identities",
			"shared.user_acknowledgements",
		],
		memberships,
		tenant: {
			domains: tenant.domains ?? [],
			id: tenant.id,
			name: tenant.name,
			workspaceKind: tenant.workspace_kind,
		},
		users,
		selectedCaseCreatedBy: caseRecord.created_by ?? null,
	};
}

async function caseBundle(schema, tenant, caseId) {
	const factCaseColumn = await columnExists(schema.name, "incident_fact", "case_id");
	const attachmentCaptionColumn = await columnExists(schema.name, "incident_attachment", "caption");
	const caseRows = await prisma.$queryRawUnsafe(
		"SELECT id::text AS id, case_number, suva_case_number, title, incident_at, incident_time_note, location, incident_type::text, actual_injury_outcome::text, actual_severity_code, actual_severity_reason, potential_outcome_text, potential_severity_code, potential_likelihood_code, potential_risk_band, hazard_category_code, department_text, area_text, shift_text, work_activity, work_type, event_type, process_involved, ppe_required, ppe_worn, injury_nature, body_part, lost_days, contractor_flag, time_in_role_band, reportable_uvg, control_failure, immediate_cause, contributing_causes, coordinator_role, coordinator_name, workflow_stage::text, cause_method::text, content_language::text, vision_consent::text, hira_followup_needed, hira_followup_text, created_by::text AS created_by, created_at, updated_at, closed_at, deleted_at FROM " +
			schema.quoted +
			".incident_case WHERE id = $1::uuid",
		caseId,
	);
	const caseRecord = caseRows[0];
	if (!caseRecord) {
		throw new Error("Incident case disappeared while exporting: " + caseId);
	}

	const persons = await optionalRows(
		schema,
		"incident_person",
		"SELECT id::text AS id, case_id::text AS case_id, role, name, other_info, years_with_company, created_at, updated_at FROM " +
			schema.quoted +
			".incident_person WHERE case_id = $1::uuid ORDER BY created_at ASC, id ASC",
		caseId,
	);
	const accounts = await optionalRows(
		schema,
		"incident_account",
		"SELECT id::text AS id, case_id::text AS case_id, person_id::text AS person_id, raw_statement, created_at, updated_at FROM " +
			schema.quoted +
			".incident_account WHERE case_id = $1::uuid ORDER BY created_at ASC, id ASC",
		caseId,
	);
	const factsSql = factCaseColumn
		? "SELECT fact.id::text AS id, fact.case_id::text AS case_id, fact.account_id::text AS account_id, fact.order_index, fact.text, fact.created_at, fact.updated_at FROM " +
			schema.quoted +
			".incident_fact fact WHERE fact.case_id = $1::uuid ORDER BY fact.order_index ASC, fact.created_at ASC, fact.id ASC"
		: "SELECT fact.id::text AS id, NULL::text AS case_id, fact.account_id::text AS account_id, fact.order_index, fact.text, fact.created_at, fact.updated_at FROM " +
			schema.quoted +
			".incident_fact fact INNER JOIN " +
			schema.quoted +
			".incident_account account ON account.id = fact.account_id WHERE account.case_id = $1::uuid ORDER BY fact.order_index ASC, fact.created_at ASC, fact.id ASC";
	const facts = await optionalRows(schema, "incident_fact", factsSql, caseId);
	const personalEvents = await optionalRows(
		schema,
		"incident_personal_event",
		"SELECT event.id::text AS id, event.account_id::text AS account_id, event.order_index, event.event_at, event.time_label, event.text, event.created_at, event.updated_at FROM " +
			schema.quoted +
			".incident_personal_event event INNER JOIN " +
			schema.quoted +
			".incident_account account ON account.id = event.account_id WHERE account.case_id = $1::uuid ORDER BY event.order_index ASC, event.event_at ASC NULLS LAST, event.created_at ASC",
		caseId,
	);
	const timelineEvents = await optionalRows(
		schema,
		"incident_timeline_event",
		"SELECT id::text AS id, case_id::text AS case_id, order_index, event_at, time_label, text, confidence::text, created_at, updated_at FROM " +
			schema.quoted +
			".incident_timeline_event WHERE case_id = $1::uuid ORDER BY order_index ASC, event_at ASC NULLS LAST, created_at ASC, id ASC",
		caseId,
	);
	const timelineSources = await optionalRows(
		schema,
		"incident_timeline_source",
		"SELECT source.id::text AS id, source.timeline_event_id::text AS timeline_event_id, source.account_id::text AS account_id, source.fact_id::text AS fact_id, source.personal_event_id::text AS personal_event_id, source.created_at, source.updated_at FROM " +
			schema.quoted +
			".incident_timeline_source source INNER JOIN " +
			schema.quoted +
			".incident_timeline_event event ON event.id = source.timeline_event_id WHERE event.case_id = $1::uuid ORDER BY source.created_at ASC, source.id ASC",
		caseId,
	);
	const deviations = await optionalRows(
		schema,
		"incident_deviation",
		"SELECT deviation.id::text AS id, deviation.event_id::text AS event_id, deviation.order_index, deviation.expected, deviation.actual, deviation.created_at, deviation.updated_at FROM " +
			schema.quoted +
			".incident_deviation deviation INNER JOIN " +
			schema.quoted +
			".incident_timeline_event event ON event.id = deviation.event_id WHERE event.case_id = $1::uuid ORDER BY event.order_index ASC, deviation.order_index ASC, deviation.created_at ASC",
		caseId,
	);
	const causeNodes = await optionalRows(
		schema,
		"incident_cause_node",
		"SELECT id::text AS id, case_id::text AS case_id, parent_id::text AS parent_id, timeline_event_id::text AS timeline_event_id, order_index, statement, question, is_root_cause, branch_status::text, created_at, updated_at FROM " +
			schema.quoted +
			".incident_cause_node WHERE case_id = $1::uuid ORDER BY parent_id NULLS FIRST, order_index ASC, created_at ASC, id ASC",
		caseId,
	);
	const causeActions = await optionalRows(
		schema,
		"incident_cause_action",
		"SELECT action.id::text AS id, action.cause_node_id::text AS cause_node_id, action.action_item_id::text AS action_item_id, action.order_index, action.description, action.owner_role, action.due_date, action.action_type::text, action.status::text, item.title AS action_item_title, item.description AS action_item_description, item.status::text AS action_item_status, item.owner_text AS action_item_owner_text, item.due_date AS action_item_due_date, item.priority::text AS action_item_priority, item.verification_status::text AS action_item_verification_status, item.effectiveness_result::text AS action_item_effectiveness_result, action.created_at, action.updated_at FROM " +
			schema.quoted +
			".incident_cause_action action INNER JOIN " +
			schema.quoted +
			".incident_cause_node cause ON cause.id = action.cause_node_id LEFT JOIN " +
			schema.quoted +
			".action_item item ON item.id = action.action_item_id WHERE cause.case_id = $1::uuid ORDER BY cause.order_index ASC, action.order_index ASC, action.created_at ASC",
		caseId,
	);
	const incidentAttachmentColumns = attachmentCaptionColumn
		? "attachment.caption,"
		: "NULL::text AS caption,";
	const incidentAttachments = await optionalRows(
		schema,
		"incident_attachment",
		"SELECT attachment.id::text AS id, attachment.event_id::text AS event_id, attachment.storage_key, attachment.filename, attachment.mime_type, attachment.size_bytes, " +
			incidentAttachmentColumns +
			" attachment.created_at, attachment.created_by::text AS created_by FROM " +
			schema.quoted +
			".incident_attachment attachment INNER JOIN " +
			schema.quoted +
			".incident_timeline_event event ON event.id = attachment.event_id WHERE event.case_id = $1::uuid ORDER BY attachment.created_at ASC, attachment.id ASC",
		caseId,
	);
	const actionItems = await optionalRows(
		schema,
		"action_item",
		"SELECT item.id::text AS id, item.tenant_id::text AS tenant_id, item.title, item.description, item.status::text, item.due_date, item.assignee_user_id::text AS assignee_user_id, item.owner_text, item.department_text, item.origin_type::text, item.origin_id::text, item.origin_label, item.origin_created_at, item.priority::text, item.is_safety_critical, item.verification_status::text, item.verification_note, item.verified_at, item.verified_by_user_id::text AS verified_by_user_id, item.effectiveness_result::text, item.assigned_at, item.escalated_at, item.notification_sent_at, item.completed_at, item.created_at, item.updated_at FROM " +
			schema.quoted +
			".action_item item WHERE item.id IN (SELECT action.action_item_id FROM " +
			schema.quoted +
			".incident_cause_action action INNER JOIN " +
			schema.quoted +
			".incident_cause_node cause ON cause.id = action.cause_node_id WHERE cause.case_id = $1::uuid AND action.action_item_id IS NOT NULL) OR (item.origin_type::text = 'ii' AND item.origin_id = $1::uuid) ORDER BY item.created_at ASC, item.id ASC",
		caseId,
	);
	const actionAttachments = await optionalRows(
		schema,
		"action_attachment",
		"SELECT attachment.id::text AS id, attachment.action_item_id::text AS action_item_id, attachment.storage_path, attachment.filename, attachment.mime_type, attachment.description, attachment.uploaded_at, attachment.uploaded_by_user_id::text AS uploaded_by_user_id FROM " +
			schema.quoted +
			".action_attachment attachment INNER JOIN " +
			schema.quoted +
			".action_item item ON item.id = attachment.action_item_id WHERE item.id IN (SELECT action.action_item_id FROM " +
			schema.quoted +
			".incident_cause_action action INNER JOIN " +
			schema.quoted +
			".incident_cause_node cause ON cause.id = action.cause_node_id WHERE cause.case_id = $1::uuid AND action.action_item_id IS NOT NULL) ORDER BY attachment.uploaded_at ASC, attachment.id ASC",
		caseId,
	);
	const approvalSnapshots = await optionalRows(
		schema,
		"approval_snapshot",
		"SELECT id::text AS id, workflow_type::text, version_label, approved_by::text AS approved_by, approved_at, schema_version, workflow_data, artifact_refs, attachment_refs FROM " +
			schema.quoted +
			".approval_snapshot WHERE ii_case_id = $1::uuid ORDER BY approved_at ASC, id ASC",
		caseId,
	);
	const generatedArtifacts = await optionalRows(
		schema,
		"generated_artifact",
		"SELECT id::text AS id, workflow_type::text, output_type, version_seq, snapshot_id::text AS snapshot_id, storage_key, filename, mime_type, size_bytes, generated_at, generated_by::text AS generated_by, source::text, is_snapshot_linked FROM " +
			schema.quoted +
			".generated_artifact WHERE ii_case_id = $1::uuid ORDER BY generated_at ASC, id ASC",
		caseId,
	);
	const coachMessages = await optionalRows(
		schema,
		"incident_coach_message",
		"SELECT id::text AS id, role, content, operations, operation_decisions, created_at FROM " +
			schema.quoted +
			".incident_coach_message WHERE case_id = $1::uuid ORDER BY created_at ASC, id ASC",
		caseId,
	);
	const coachFeedback = await optionalRows(
		schema,
		"incident_coach_feedback",
		"SELECT id::text AS id, case_id::text AS case_id, user_id::text AS user_id, rating::int AS rating, comment_text, created_at, updated_at FROM " +
			schema.quoted +
			".incident_coach_feedback WHERE case_id = $1::uuid ORDER BY updated_at ASC, id ASC",
		caseId,
	);
	const visionCallAudit = await optionalRows(
		schema,
		"vision_call_audit",
		"SELECT id::text AS id, tenant_id::text AS tenant_id, workflow_id::text AS workflow_id, user_id::text AS user_id, photo_hash, provider, model, prompt_purpose, called_at, latency_ms, token_cost_usd::text FROM " +
			schema.quoted +
			".vision_call_audit WHERE workflow_id = $1::uuid ORDER BY called_at ASC, id ASC",
		caseId,
	);
	const generatedAtTimes = [
		caseRecord.created_at,
		caseRecord.updated_at,
		...coachMessages.map((message) => message.created_at),
	].filter(Boolean);
	const minTime = generatedAtTimes.reduce((min, value) => value < min ? value : min, generatedAtTimes[0]);
	const maxTime = generatedAtTimes.reduce((max, value) => value > max ? value : max, generatedAtTimes[0]);
	const costLedger = await optionalRows(
		schema,
		"cost_ledger_entry",
		"SELECT id::text AS id, called_at, kind::text, provider, token_input, token_output, cost_usd::text FROM " +
			schema.quoted +
			".cost_ledger_entry WHERE called_at >= ($1::timestamptz - interval '10 minutes') AND called_at <= ($2::timestamptz + interval '10 minutes') ORDER BY called_at ASC, id ASC",
		minTime ?? caseRecord.created_at,
		maxTime ?? caseRecord.updated_at ?? caseRecord.created_at,
	);

	const fileRefs = [];
	for (const attachment of incidentAttachments) {
		fileRefs.push({
			source: "incident_attachment",
			sourceId: attachment.id,
			storageKey: attachment.storage_key,
			filename: attachment.filename,
			mimeType: attachment.mime_type,
		});
	}
	for (const attachment of actionAttachments) {
		fileRefs.push({
			source: "action_attachment",
			sourceId: attachment.id,
			storageKey: attachment.storage_path,
			filename: attachment.filename,
			mimeType: attachment.mime_type,
		});
	}
	for (const artifact of generatedArtifacts) {
		fileRefs.push({
			source: "generated_artifact",
			sourceId: artifact.id,
			storageKey: artifact.storage_key,
			filename: artifact.filename,
			mimeType: artifact.mime_type,
		});
	}
	const seen = new Set();
	const files = [];
	for (const ref of fileRefs) {
		const dedupeKey = ref.storageKey || "";
		if (!dedupeKey || seen.has(dedupeKey)) {
			continue;
		}
		seen.add(dedupeKey);
		files.push(await readStorageFile({ ...ref, tenantId: tenant.id }));
	}

	return {
		case: caseRecord,
		persons,
		accounts,
		facts,
		personalEvents,
		timelineEvents,
		timelineSources,
		deviations,
		causeNodes,
		causeActions,
		actionItems,
		incidentAttachments,
		actionAttachments,
		approvalSnapshots,
		generatedArtifacts,
		coachMessages,
		coachFeedback,
		visionCallAudit,
		costLedger,
		files,
	};
}

async function tableCounts(schema, caseId) {
	const names = [
		"incident_case",
		"incident_coach_message",
		"incident_coach_feedback",
		"incident_person",
		"incident_account",
		"incident_fact",
		"incident_personal_event",
		"incident_timeline_event",
		"incident_timeline_source",
		"incident_deviation",
		"incident_cause_node",
		"incident_cause_action",
		"incident_attachment",
		"approval_snapshot",
		"generated_artifact",
		"action_item",
		"vision_call_audit",
		"cost_ledger_entry",
	];
	const counts = {};
	for (const name of names) {
		counts[name] = await countRows(schema, name);
	}
	counts.selectedCase = {
		coachMessages: await countRows(schema, "incident_coach_message", "case_id = $1::uuid", caseId),
		facts: (await columnExists(schema.name, "incident_fact", "case_id"))
			? await countRows(schema, "incident_fact", "case_id = $1::uuid", caseId)
			: null,
		timelineEvents: await countRows(schema, "incident_timeline_event", "case_id = $1::uuid", caseId),
		causeNodes: await countRows(schema, "incident_cause_node", "case_id = $1::uuid", caseId),
	};
	return counts;
}

function parseJsonMaybe(value) {
	try {
		return JSON.parse(value);
	} catch {
		return value;
	}
}

function sqliteAll(database, sql, ...parameters) {
	return database.prepare(sql).all(...parameters);
}

function sqliteGet(database, sql, ...parameters) {
	return database.prepare(sql).get(...parameters);
}

function sqlitePlaceholders(values) {
	return values.map(() => "?").join(", ");
}

function parseSqliteRow(row, fields) {
	const parsed = { ...row };
	for (const field of fields) {
		if (typeof parsed[field] === "string") {
			parsed[field + "Parsed"] = parseJsonMaybe(parsed[field]);
		}
	}
	return parsed;
}

function flueRows(input) {
	const dbPath =
		process.env.SAFETYSECRETARY_FLUE_SQLITE_PATH ||
		process.env.SSFW_FLUE_SQLITE_PATH ||
		"data/flue.db";
	if (!existsSync(dbPath)) {
		return {
			summary: {
				databasePath: dbPath,
				error: "flue_db_missing",
			},
			eventStreamEntries: [],
			sessionEntries: [],
			submissions: [],
			turnJournals: [],
		};
	}

	let database;
	try {
		database = new DatabaseSync(dbPath, { readOnly: true });
	} catch (error) {
		return {
			summary: {
				databasePath: dbPath,
				error: String(error?.message ?? error),
			},
			eventStreamEntries: [],
			sessionEntries: [],
			submissions: [],
			turnJournals: [],
		};
	}

	try {
		const instanceId = encodeFlueIncidentInstanceId({
			caseId: input.caseId,
			tenantId: input.tenantId,
		});
		const sessionLike = "%"+instanceId+"%";
		const caseLike = "%"+input.caseId+"%";
		const path = "agents/incident-investigation/" + instanceId;
		const sessionIds = new Set();
		for (const row of sqliteAll(
			database,
			"SELECT DISTINCT session_id FROM flue_session_entries WHERE session_id LIKE ? OR data LIKE ?",
			sessionLike,
			caseLike,
		)) {
			sessionIds.add(row.session_id);
		}
		for (const row of sqliteAll(
			database,
			"SELECT DISTINCT session_key FROM flue_agent_submissions WHERE session_key LIKE ? OR payload LIKE ?",
			sessionLike,
			caseLike,
		)) {
			sessionIds.add(row.session_key);
		}

		const sessionIdList = [...sessionIds];
		const sessionEntries = sessionIdList.length
			? sqliteAll(
					database,
					"SELECT session_id, entry_id, position, data FROM flue_session_entries WHERE session_id IN (" +
						sqlitePlaceholders(sessionIdList) +
						") ORDER BY session_id ASC, position ASC",
					...sessionIdList,
				).map((row) => parseSqliteRow(row, ["data"]))
			: [];
		const submissions = sessionIdList.length
			? sqliteAll(
					database,
					"SELECT sequence, submission_id, session_key, kind, payload, status, accepted_at, attempt_id, input_applied_at, recovery_requested_at, started_at, settled_at, error, attempt_count, max_retry, timeout_at, owner_id, lease_expires_at FROM flue_agent_submissions WHERE session_key IN (" +
						sqlitePlaceholders(sessionIdList) +
						") OR payload LIKE ? ORDER BY accepted_at ASC, sequence ASC",
					...sessionIdList,
					caseLike,
				).map((row) => parseSqliteRow(row, ["payload", "error"]))
			: sqliteAll(
					database,
					"SELECT sequence, submission_id, session_key, kind, payload, status, accepted_at, attempt_id, input_applied_at, recovery_requested_at, started_at, settled_at, error, attempt_count, max_retry, timeout_at, owner_id, lease_expires_at FROM flue_agent_submissions WHERE payload LIKE ? ORDER BY accepted_at ASC, sequence ASC",
					caseLike,
				).map((row) => parseSqliteRow(row, ["payload", "error"]));
		const submissionIds = [...new Set(submissions.map((row) => row.submission_id))];
		const turnJournals = submissionIds.length
			? sqliteAll(
					database,
					"SELECT submission_id, session_key, kind, attempt_id, operation_id, turn_id, phase, revision, created_at, updated_at, checkpoint_leaf_id, tool_request_json, stream_key, stream_consumed_at, committed, committed_leaf_id FROM flue_agent_turn_journals WHERE submission_id IN (" +
						sqlitePlaceholders(submissionIds) +
						") ORDER BY created_at ASC, revision ASC",
					...submissionIds,
				).map((row) => parseSqliteRow(row, ["tool_request_json"]))
			: [];
		const eventRows = input.fullFlueStream
			? sqliteAll(
					database,
					"SELECT path, seq, data FROM flue_event_stream_entries WHERE path = ? ORDER BY seq ASC LIMIT ?",
					path,
					input.eventLimit,
				)
			: sqliteAll(
					database,
					"SELECT path, seq, data FROM flue_event_stream_entries WHERE path = ? AND data LIKE ? ORDER BY seq ASC LIMIT ?",
					path,
					caseLike,
					input.eventLimit,
				);
		const eventStreamEntries = eventRows.map((row) =>
			parseSqliteRow(row, ["data"]),
		);
		const stream = sqliteGet(
			database,
			"SELECT path, next_offset, closed FROM flue_event_streams WHERE path = ?",
			path,
		);

		return {
			eventStreamEntries,
			sessionEntries,
			submissions,
			summary: {
				databasePath: dbPath,
				eventLimit: input.eventLimit,
				fullFlueStream: input.fullFlueStream,
				instanceId,
				sessionIds: sessionIdList,
				stream,
			},
			turnJournals,
		};
	} finally {
		database.close();
	}
}

try {
	const tenantMatches = await resolveTenant(input.selector.tenant);
	if (input.selector.tenant && tenantMatches.length === 0) {
		throw new Error("No tenant matched selector: " + input.selector.tenant);
	}
	if (input.selector.tenant && tenantMatches.length > 1) {
		throw new Error(
			"Tenant selector matched multiple tenants: " +
				tenantMatches.map((tenant) => tenant.id + ":" + tenant.name).join(", "),
		);
	}
	const candidateTenants = input.selector.tenant ? tenantMatches : await resolveTenant();
	const candidateCases = await findCandidateCases(candidateTenants, input.selector.case);
	if (candidateCases.length === 0) {
		throw new Error("No incident case matched selector: " + (input.selector.case ?? "latest"));
	}
	if (candidateCases.length > 1 && !isUuid(input.selector.case)) {
		throw new Error(
			"Case selector matched multiple cases: " +
				candidateCases.map((candidate) => candidate.tenant.name + ":" + candidate.case.case_number + ":" + candidate.case.id).join(", "),
		);
	}
	const selected = candidateCases[0];
	const bundle = await caseBundle(selected.schema, selected.tenant, selected.case.id);
	const shared = await sharedContext(selected.tenant, bundle.case);
	const counts = await tableCounts(selected.schema, selected.case.id);
	const flue = flueRows({
		caseId: selected.case.id,
		eventLimit: input.eventLimit,
		fullFlueStream: input.fullFlueStream,
		tenantId: selected.tenant.id,
	});

	console.log(JSON.stringify(
		{
			checkedAt: new Date().toISOString(),
			environment: {
				cwd: process.cwd(),
				flueRuntime:
					process.env.SAFETYSECRETARY_II_COACH_RUNTIME ??
					process.env.SSFW_II_COACH_RUNTIME ??
					null,
				llmDebugLog: process.env.LLM_DEBUG_LOG ?? null,
				nodeVersion: process.version,
			},
			selector: input.selector,
			resolved: {
				case: {
					caseNumber: bundle.case.case_number,
					id: bundle.case.id,
					title: bundle.case.title,
				},
				tenant: {
					id: selected.tenant.id,
					name: selected.tenant.name,
					schemaName: selected.schema.name,
					workspaceKind: selected.tenant.workspace_kind,
				},
			},
			postgres: {
				caseBundle: bundle,
				files: bundle.files,
				shared,
				tableCounts: counts,
			},
			flue,
		},
		jsonReplacer,
	));
} finally {
	await prisma.$disconnect();
}
`;
}
