#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const DEFAULT_HOST = "root@100.68.3.14";
const DEFAULT_KEY = "~/.ssh/Hetzner_SafetySecretary";
const DEFAULT_REMOTE_DIR = "/opt/safetysecretary-next";
const DEFAULT_OUT_DIR = ".tmp/prod-case-pulls";

const args = parseArgs(process.argv.slice(2));

if (args.help) {
	printHelp();
	process.exit(0);
}

const mode = args.summary ? "summary" : "full";
const limit = positiveInteger(args.limit ?? process.env.SSFW_CASE_PULL_LIMIT, 10);
const includeFiles = !args.noFiles && mode === "full";
const host = args.host ?? process.env.SSFW_PROD_SSH_HOST ?? DEFAULT_HOST;
const keyPath = expandHome(
	args.key ?? process.env.SSFW_PROD_SSH_KEY ?? DEFAULT_KEY,
);
const remoteDir =
	args.remoteDir ?? process.env.SSFW_PROD_APP_DIR ?? DEFAULT_REMOTE_DIR;
const outDir = resolve(
	args.outDir ?? process.env.SSFW_CASE_PULL_OUT_DIR ?? DEFAULT_OUT_DIR,
);

const startedAt = new Date();
const remotePayload = await runRemotePull({
	host,
	includeFiles,
	keyPath,
	limit,
	mode,
	remoteDir,
});
const report = {
	pulledAt: startedAt.toISOString(),
	source: {
		host,
		includeFiles,
		mode,
		remoteDir,
	},
	...remotePayload,
};

mkdirSync(outDir, { recursive: true });
const basename = `incident-cases-${timestamp(startedAt)}-${mode}`;
const fileRoot = join(outDir, `${basename}-files`);
const materializedFiles =
	mode === "full" ? materializeEmbeddedFiles(report, fileRoot) : 0;
const outPath = join(outDir, `${basename}.json`);
writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);

printSummary(report, outPath, materializedFiles);

async function runRemotePull(input) {
	const remoteCommand = [
		`cd ${shellQuote(input.remoteDir)}`,
		"&&",
		"node --env-file=.env --input-type=module -",
		String(input.limit),
		input.mode,
		input.includeFiles ? "files" : "no-files",
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
			`Remote case pull failed with exit code ${exitCode}.\n${stderr.trim()}`,
		);
	}

	try {
		return JSON.parse(stdout);
	} catch (error) {
		throw new Error(
			`Remote case pull did not return JSON: ${String(error)}\n${stdout.slice(
				0,
				800,
			)}`,
		);
	}
}

function materializeEmbeddedFiles(report, fileRoot) {
	let written = 0;

	for (const tenant of report.tenants ?? []) {
		for (const caseBundle of tenant.cases ?? []) {
			const safeTenant = safePathSegment(tenant.tenant.name);
			const caseName = safePathSegment(
				`${caseBundle.case?.case_number ?? "case"}-${String(
					caseBundle.case?.id ?? "unknown",
				).slice(0, 8)}`,
			);
			const files = caseBundle.files ?? [];

			for (let index = 0; index < files.length; index += 1) {
				const file = files[index];
				if (!file.contentBase64) {
					continue;
				}
				const filename = safePathSegment(
					file.filename || `${file.source}-${index + 1}.bin`,
				);
				const localPath = join(
					fileRoot,
					safeTenant,
					caseName,
					`${String(index + 1).padStart(2, "0")}-${filename}`,
				);
				mkdirSync(resolve(localPath, ".."), { recursive: true });
				writeFileSync(localPath, Buffer.from(file.contentBase64, "base64"));
				file.localPath = localPath;
				delete file.contentBase64;
				written += 1;
			}
		}
	}

	return written;
}

function printSummary(report, outPath, materializedFiles) {
	const tenants = report.tenants ?? [];
	const totals = tenants.reduce(
		(accumulator, tenant) => {
			accumulator.cases += tenant.stats?.total ?? 0;
			accumulator.exported += tenant.latestCases?.length ?? 0;
			accumulator.createdLast24h += tenant.stats?.createdLast24h ?? 0;
			accumulator.createdLast7d += tenant.stats?.createdLast7d ?? 0;
			accumulator.updatedLast24h += tenant.stats?.updatedLast24h ?? 0;
			return accumulator;
		},
		{
			cases: 0,
			createdLast24h: 0,
			createdLast7d: 0,
			exported: 0,
			updatedLast24h: 0,
		},
	);

	console.log(`Wrote ${outPath}`);
	console.log(
		`Mode: ${report.source.mode}; tenants: ${tenants.length}; latest case bundles: ${totals.exported}; total cases: ${totals.cases}; created 24h: ${totals.createdLast24h}; created 7d: ${totals.createdLast7d}; updated 24h: ${totals.updatedLast24h}; files written: ${materializedFiles}`,
	);

	for (const tenant of tenants) {
		console.log(
			`- ${tenant.tenant.name}: total=${tenant.stats?.total ?? 0}, exported=${
				tenant.latestCases?.length ?? 0
			}, latest=${tenant.stats?.latestCreatedAt ?? "none"}`,
		);
	}
}

function parseArgs(values) {
	const parsed = {};

	for (let index = 0; index < values.length; index += 1) {
		const value = values[index];

		if (value === "--") {
			continue;
		} else if (value === "--help" || value === "-h") {
			parsed.help = true;
		} else if (value === "--summary") {
			parsed.summary = true;
		} else if (value === "--no-files") {
			parsed.noFiles = true;
		} else if (value === "--limit") {
			parsed.limit = requireValue(values, (index += 1), value);
		} else if (value.startsWith("--limit=")) {
			parsed.limit = value.slice("--limit=".length);
		} else if (value === "--max-file-bytes") {
			throw new Error(
				"--max-file-bytes was removed; full case pulls no longer skip files by size.",
			);
		} else if (value.startsWith("--max-file-bytes=")) {
			throw new Error(
				"--max-file-bytes was removed; full case pulls no longer skip files by size.",
			);
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
	return date.toISOString().replaceAll(":", "").replace(/\.\d{3}Z$/, "Z");
}

function printHelp() {
	console.log(`Pull latest production incident case bundles over Tailscale SSH.

Usage:
  pnpm operator:pull-cases
  pnpm operator:pull-cases -- --limit 25
  pnpm operator:pull-cases -- --summary
  pnpm operator:pull-cases -- --no-files --limit 5

Default mode pulls full latest case bundles from every active tenant:
case fields, people/accounts, facts, personal events, timeline, sources,
deviations, causes, linked actions, attachments, generated artifacts, approval
snapshots, coach conversation, proposed operations, operation decisions, and
referenced local-storage files.

Defaults:
  host            ${DEFAULT_HOST}
  key             ${DEFAULT_KEY}
  remote dir      ${DEFAULT_REMOTE_DIR}
  out dir         ${DEFAULT_OUT_DIR}

Options:
  --summary               Export metadata only.
  --no-files              Keep file metadata but do not embed/download file bodies.
  --limit <n>             Latest cases per tenant to include. Default: 10.
  --out-dir <path>        Local output directory. Default: ${DEFAULT_OUT_DIR}.
  --host <ssh-host>       SSH host. Default: ${DEFAULT_HOST}.
  --key <path>            SSH identity file. Default: ${DEFAULT_KEY}.
  --remote-dir <path>     Remote app directory. Default: ${DEFAULT_REMOTE_DIR}.
`);
}

function remoteScriptSource() {
	return String.raw`
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const limit = Number(process.argv[2] || "10");
const mode = process.argv[3] || "full";
const includeFiles = (process.argv[4] || "files") === "files" && mode === "full";
const storageRoot = process.env.STORAGE_LOCAL_ROOT || "";

if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
	throw new Error("limit must be an integer from 1 to 500");
}

function quoteIdent(value) {
	if (!/^tenant_[0-9a-f_]{36}$/.test(value)) {
		throw new Error("Unexpected tenant schema: " + value);
	}
	return '"' + value.replaceAll('"', '""') + '"';
}

function maskEmail(value) {
	if (!value || !String(value).includes("@")) {
		return value;
	}
	const parts = String(value).split("@");
	return parts[0].slice(0, 2) + "***@" + parts[1];
}

function compactTitle(value) {
	if (!value) {
		return null;
	}
	const text = String(value).replace(/\s+/g, " ").trim();
	return text.length > 100 ? text.slice(0, 97) + "..." : text;
}

function shortId(value) {
	return String(value).slice(0, 8);
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

async function optionalRows(schema, tableName, sql) {
	if (!(await tableExists(schema.name, tableName))) {
		return [];
	}
	return prisma.$queryRawUnsafe(sql);
}

function caseSummary(row) {
	return {
		id: shortId(row.id),
		caseNumber: row.case_number,
		title: compactTitle(row.title),
		workflowStage: row.workflow_stage,
		incidentAt: iso(row.incident_at),
		createdAt: iso(row.created_at),
		updatedAt: iso(row.updated_at),
		counts: {
			facts: row.fact_count,
			timelineEvents: row.timeline_count,
			causeNodes: row.cause_count,
			causeActions: row.cause_action_count,
			coachMessages: row.coach_message_count,
			incidentAttachments: row.incident_attachment_count,
			generatedArtifacts: row.generated_artifact_count,
		},
	};
}

async function readStorageFile(input) {
	const key = input.storageKey;
	if (!validateStorageKey(key)) {
		return { ...input, skipped: true, reason: "invalid_storage_key" };
	}
	if (!storageRoot) {
		return { ...input, skipped: true, reason: "storage_root_not_configured" };
	}
	const root = resolve(storageRoot);
	const filePath = resolve(root, key);
	const rootRelative = relative(root, filePath);
	if (rootRelative.startsWith("..") || rootRelative === "" || rootRelative.startsWith("/")) {
		return { ...input, skipped: true, reason: "storage_path_outside_root" };
	}
	if (!existsSync(filePath)) {
		return { ...input, skipped: true, reason: "file_missing" };
	}
	const fileStat = await stat(filePath);
	const metadataPath = filePath + ".metadata.json";
	const metadata = existsSync(metadataPath)
		? JSON.parse(await readFile(metadataPath, "utf8").catch(() => "null"))
		: null;
	const sizeBytes = fileStat.size;
	if (!includeFiles) {
		return { ...input, metadata, sizeBytes, skipped: true, reason: "files_disabled" };
	}
	const body = await readFile(filePath);
	return {
		...input,
		contentBase64: body.toString("base64"),
		metadata,
		sha256: createHash("sha256").update(body).digest("hex"),
		sizeBytes,
	};
}

async function caseContent(schema, tenant, caseId) {
	const factCaseColumn = await columnExists(schema.name, "incident_fact", "case_id");
	const attachmentCaptionColumn = await columnExists(schema.name, "incident_attachment", "caption");
	const caseRows = await prisma.$queryRawUnsafe(
		"SELECT id::text AS id, case_number, suva_case_number, title, incident_at, incident_time_note, location, incident_type, actual_injury_outcome, actual_severity_code, actual_severity_reason, potential_outcome_text, potential_severity_code, potential_likelihood_code, potential_risk_band, hazard_category_code, department_text, area_text, shift_text, work_activity, work_type, event_type, process_involved, ppe_required, ppe_worn, injury_nature, body_part, lost_days, contractor_flag, time_in_role_band, reportable_uvg, control_failure, immediate_cause, contributing_causes, coordinator_role, coordinator_name, workflow_stage, content_language, vision_consent, hira_followup_needed, hira_followup_text, created_by::text AS created_by, created_at, updated_at, closed_at FROM " +
			schema.quoted +
			".incident_case WHERE id = $1::uuid",
		caseId,
	);
	const persons = await optionalRows(
		schema,
		"incident_person",
		"SELECT id::text AS id, role, name, other_info, years_with_company, created_at, updated_at FROM " +
			schema.quoted +
			".incident_person WHERE case_id = '" +
			caseId +
			"'::uuid ORDER BY created_at ASC, id ASC",
	);
	const accounts = await optionalRows(
		schema,
		"incident_account",
		"SELECT id::text AS id, person_id::text AS person_id, raw_statement, created_at, updated_at FROM " +
			schema.quoted +
			".incident_account WHERE case_id = '" +
			caseId +
			"'::uuid ORDER BY created_at ASC, id ASC",
	);
	const factsWhere = factCaseColumn
		? "fact.case_id = '" + caseId + "'::uuid"
		: "account.case_id = '" + caseId + "'::uuid";
	const factsJoin = factCaseColumn
		? ""
		: " INNER JOIN " + schema.quoted + ".incident_account account ON account.id = fact.account_id ";
	const facts = await optionalRows(
		schema,
		"incident_fact",
		"SELECT fact.id::text AS id, fact.account_id::text AS account_id, fact.order_index, fact.text, fact.created_at, fact.updated_at FROM " +
			schema.quoted +
			".incident_fact fact" +
			factsJoin +
			" WHERE " +
			factsWhere +
			" ORDER BY fact.order_index ASC, fact.created_at ASC, fact.id ASC",
	);
	const personalEvents = await optionalRows(
		schema,
		"incident_personal_event",
		"SELECT event.id::text AS id, event.account_id::text AS account_id, event.order_index, event.event_at, event.time_label, event.text, event.created_at, event.updated_at FROM " +
			schema.quoted +
			".incident_personal_event event INNER JOIN " +
			schema.quoted +
			".incident_account account ON account.id = event.account_id WHERE account.case_id = '" +
			caseId +
			"'::uuid ORDER BY event.order_index ASC, event.event_at ASC NULLS LAST, event.created_at ASC",
	);
	const timelineEvents = await optionalRows(
		schema,
		"incident_timeline_event",
		"SELECT id::text AS id, order_index, event_at, time_label, text, confidence, created_at, updated_at FROM " +
			schema.quoted +
			".incident_timeline_event WHERE case_id = '" +
			caseId +
			"'::uuid ORDER BY order_index ASC, event_at ASC NULLS LAST, created_at ASC, id ASC",
	);
	const timelineSources = await optionalRows(
		schema,
		"incident_timeline_source",
		"SELECT source.id::text AS id, source.timeline_event_id::text AS timeline_event_id, source.account_id::text AS account_id, source.fact_id::text AS fact_id, source.personal_event_id::text AS personal_event_id, source.created_at, source.updated_at FROM " +
			schema.quoted +
			".incident_timeline_source source INNER JOIN " +
			schema.quoted +
			".incident_timeline_event event ON event.id = source.timeline_event_id WHERE event.case_id = '" +
			caseId +
			"'::uuid ORDER BY source.created_at ASC, source.id ASC",
	);
	const deviations = await optionalRows(
		schema,
		"incident_deviation",
		"SELECT deviation.id::text AS id, deviation.event_id::text AS event_id, deviation.order_index, deviation.expected, deviation.actual, deviation.created_at, deviation.updated_at FROM " +
			schema.quoted +
			".incident_deviation deviation INNER JOIN " +
			schema.quoted +
			".incident_timeline_event event ON event.id = deviation.event_id WHERE event.case_id = '" +
			caseId +
			"'::uuid ORDER BY event.order_index ASC, deviation.order_index ASC, deviation.created_at ASC",
	);
	const causeNodes = await optionalRows(
		schema,
		"incident_cause_node",
		"SELECT id::text AS id, parent_id::text AS parent_id, timeline_event_id::text AS timeline_event_id, order_index, statement, question, is_root_cause, created_at, updated_at FROM " +
			schema.quoted +
			".incident_cause_node WHERE case_id = '" +
			caseId +
			"'::uuid ORDER BY parent_id NULLS FIRST, order_index ASC, created_at ASC, id ASC",
	);
	const causeActions = await optionalRows(
		schema,
		"incident_cause_action",
		"SELECT action.id::text AS id, action.cause_node_id::text AS cause_node_id, action.action_item_id::text AS action_item_id, action.order_index, action.description, action.owner_role, action.due_date, action.action_type, action.status, item.title AS action_item_title, item.description AS action_item_description, item.status AS action_item_status, item.owner_text AS action_item_owner_text, item.due_date AS action_item_due_date, item.priority AS action_item_priority, item.verification_status AS action_item_verification_status, item.effectiveness_result AS action_item_effectiveness_result, action.created_at, action.updated_at FROM " +
			schema.quoted +
			".incident_cause_action action INNER JOIN " +
			schema.quoted +
			".incident_cause_node cause ON cause.id = action.cause_node_id LEFT JOIN " +
			schema.quoted +
			".action_item item ON item.id = action.action_item_id WHERE cause.case_id = '" +
			caseId +
			"'::uuid ORDER BY cause.order_index ASC, action.order_index ASC, action.created_at ASC",
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
			".incident_timeline_event event ON event.id = attachment.event_id WHERE event.case_id = '" +
			caseId +
			"'::uuid ORDER BY attachment.created_at ASC, attachment.id ASC",
	);
	const actionAttachments = await optionalRows(
		schema,
		"action_attachment",
		"SELECT attachment.id::text AS id, attachment.action_item_id::text AS action_item_id, attachment.storage_path, attachment.filename, attachment.mime_type, attachment.description, attachment.uploaded_at, attachment.uploaded_by_user_id::text AS uploaded_by_user_id FROM " +
			schema.quoted +
			".action_attachment attachment INNER JOIN " +
			schema.quoted +
			".incident_cause_action action ON action.action_item_id = attachment.action_item_id INNER JOIN " +
			schema.quoted +
			".incident_cause_node cause ON cause.id = action.cause_node_id WHERE cause.case_id = '" +
			caseId +
			"'::uuid ORDER BY attachment.uploaded_at ASC, attachment.id ASC",
	);
	const approvalSnapshots = await optionalRows(
		schema,
		"approval_snapshot",
		"SELECT id::text AS id, workflow_type, version_label, approved_by::text AS approved_by, approved_at, schema_version, workflow_data, artifact_refs, attachment_refs FROM " +
			schema.quoted +
			".approval_snapshot WHERE ii_case_id = '" +
			caseId +
			"'::uuid ORDER BY approved_at ASC, id ASC",
	);
	const generatedArtifacts = await optionalRows(
		schema,
		"generated_artifact",
		"SELECT id::text AS id, workflow_type, output_type, version_seq, snapshot_id::text AS snapshot_id, storage_key, filename, mime_type, size_bytes, generated_at, generated_by::text AS generated_by, source, is_snapshot_linked FROM " +
			schema.quoted +
			".generated_artifact WHERE ii_case_id = '" +
			caseId +
			"'::uuid ORDER BY generated_at ASC, id ASC",
	);
	const coachMessages = await optionalRows(
		schema,
		"incident_coach_message",
		"SELECT id::text AS id, role, content, operations, operation_decisions, created_at FROM " +
			schema.quoted +
			".incident_coach_message WHERE case_id = '" +
			caseId +
			"'::uuid ORDER BY created_at ASC, id ASC",
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
		case: caseRows[0] || null,
		persons,
		accounts,
		facts,
		personalEvents,
		timelineEvents,
		timelineSources,
		deviations,
		causeNodes,
		causeActions,
		incidentAttachments,
		actionAttachments,
		approvalSnapshots,
		generatedArtifacts,
		coachMessages,
		files,
	};
}

try {
	const tenants = await prisma.$queryRawUnsafe(
		"SELECT t.id::text AS id, t.name::text AS name, t.workspace_kind::text AS workspace_kind, t.created_at AS created_at, creator.email::text AS creator_email, shared.tenant_schema_name(t.id)::text AS schema_name, COALESCE(array_remove(array_agg(DISTINCT td.domain::text), NULL), ARRAY[]::text[]) AS domains FROM shared.tenants t LEFT JOIN shared.users creator ON creator.id = t.created_by_user_id LEFT JOIN shared.tenant_domains td ON td.tenant_id = t.id WHERE t.deleted_at IS NULL GROUP BY t.id, creator.email ORDER BY t.created_at ASC",
	);
	const payload = [];

	for (const tenant of tenants) {
		const schema = {
			name: tenant.schema_name,
			quoted: quoteIdent(tenant.schema_name),
		};
		const incidentTableExists = await tableExists(schema.name, "incident_case");
		const tenantOutput = {
			tenant: {
				id: tenant.id,
				name: tenant.workspace_kind === "personal" ? maskEmail(tenant.name) : tenant.name,
				workspaceKind: tenant.workspace_kind,
				domains: tenant.domains,
				createdAt: iso(tenant.created_at),
				creatorEmail: maskEmail(tenant.creator_email),
			},
			stats: null,
			latestCases: [],
		};
		if (!incidentTableExists) {
			if (mode === "full") {
				tenantOutput.cases = [];
			}
			payload.push(tenantOutput);
			continue;
		}

		const statsRows = await prisma.$queryRawUnsafe(
			"SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE created_at >= now() - interval '24 hours')::int AS created_last_24h, COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days')::int AS created_last_7d, COUNT(*) FILTER (WHERE updated_at >= now() - interval '24 hours')::int AS updated_last_24h, MAX(created_at) AS latest_created_at, MAX(updated_at) AS latest_updated_at FROM " +
				schema.quoted +
				".incident_case",
		);
		const latestRows = await prisma.$queryRawUnsafe(
			"SELECT c.id::text AS id, c.case_number, c.title, c.workflow_stage, c.incident_at, c.created_at, c.updated_at, " +
				"(SELECT COUNT(*)::int FROM " +
				schema.quoted +
				".incident_fact fact WHERE fact.case_id = c.id) AS fact_count, " +
				"(SELECT COUNT(*)::int FROM " +
				schema.quoted +
				".incident_timeline_event event WHERE event.case_id = c.id) AS timeline_count, " +
				"(SELECT COUNT(*)::int FROM " +
				schema.quoted +
				".incident_cause_node cause WHERE cause.case_id = c.id) AS cause_count, " +
				"(SELECT COUNT(*)::int FROM " +
				schema.quoted +
				".incident_cause_action action INNER JOIN " +
				schema.quoted +
				".incident_cause_node cause ON cause.id = action.cause_node_id WHERE cause.case_id = c.id) AS cause_action_count, " +
				"(SELECT COUNT(*)::int FROM " +
				schema.quoted +
				".incident_coach_message message WHERE message.case_id = c.id) AS coach_message_count, " +
				"(SELECT COUNT(*)::int FROM " +
				schema.quoted +
				".incident_attachment attachment INNER JOIN " +
				schema.quoted +
				".incident_timeline_event event ON event.id = attachment.event_id WHERE event.case_id = c.id) AS incident_attachment_count, " +
				"(SELECT COUNT(*)::int FROM " +
				schema.quoted +
				".generated_artifact artifact WHERE artifact.ii_case_id = c.id) AS generated_artifact_count " +
				"FROM " +
				schema.quoted +
				".incident_case c ORDER BY c.created_at DESC, c.id DESC LIMIT $1",
			limit,
		);
		tenantOutput.stats = {
			total: statsRows[0]?.total || 0,
			createdLast24h: statsRows[0]?.created_last_24h || 0,
			createdLast7d: statsRows[0]?.created_last_7d || 0,
			updatedLast24h: statsRows[0]?.updated_last_24h || 0,
			latestCreatedAt: iso(statsRows[0]?.latest_created_at),
			latestUpdatedAt: iso(statsRows[0]?.latest_updated_at),
		};
		tenantOutput.latestCases = latestRows.map(caseSummary);
		if (mode === "full") {
			tenantOutput.cases = [];
			for (const row of latestRows) {
				tenantOutput.cases.push(await caseContent(schema, tenant, row.id));
			}
		}
		payload.push(tenantOutput);
	}

	console.log(JSON.stringify(
		{
			checkedAt: new Date().toISOString(),
			includeFiles,
			limit,
			mode,
			tenants: payload,
		},
		jsonReplacer,
	));
} finally {
await prisma.$disconnect();
}
`;
}
