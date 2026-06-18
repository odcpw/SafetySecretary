import assert from "node:assert/strict";
import {
	type ChildProcess,
	spawn,
} from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (!context.parentURL || !isLocalImport(specifier)) {
			return nextResolve(specifier, context);
		}

		const candidates = [
			new URL(`${specifier}.ts`, context.parentURL),
			new URL(`${specifier}.tsx`, context.parentURL),
			new URL(`${specifier}.json`, context.parentURL),
			new URL(`${specifier}/index.ts`, context.parentURL),
		];
		const resolved = candidates.find((candidate) => existsSync(candidate));

		if (resolved) {
			return {
				shortCircuit: true,
				url: resolved.href,
			};
		}

		return nextResolve(specifier, context);
	},
});

const { recordCoachOperationDecision, runCoachChatTurn } = (await import(
	moduleUrl("src/lib/incident/coach-chat.ts")
)) as typeof import("../../src/lib/incident/coach-chat");
const { resolveFlueModel } = (await import(
	moduleUrl("src/lib/incident/coach-flue-config.ts")
)) as typeof import("../../src/lib/incident/coach-flue-config");
const { applyIncidentCoachOperation } = (await import(
	moduleUrl("src/lib/agent/incident-investigation/apply-operation.ts")
)) as typeof import("../../src/lib/agent/incident-investigation/apply-operation");
const { dropTenantSchema, prisma, withTenantConnection } = (await import(
	moduleUrl("src/lib/db/index.ts")
)) as typeof import("../../src/lib/db");

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
	throw new Error("DATABASE_URL is required. Run with `node --env-file=.env ...`.");
}

if (!process.env.OPENAI_API_KEY) {
	throw new Error("OPENAI_API_KEY is required for the live Flue story run.");
}

const runId = randomUUID();
const reportPath =
	process.env.SSFW_FLUE_STORY_REPORT_PATH ??
	`.tmp/flue-incident-story-${runId}.json`;
const port = Number(process.env.SSFW_FLUE_STORY_PORT ?? "3593");
const baseUrl = `http://127.0.0.1:${port}`;
const sqlitePath =
	process.env.SSFW_FLUE_SQLITE_PATH ?? `.tmp/flue-story-${runId}.db`;
const model = resolveFlueModel(process.env);

process.env.SSFW_II_COACH_RUNTIME = "flue";
process.env.SSFW_FLUE_BASE_URL = baseUrl;
process.env.SSFW_FLUE_SQLITE_PATH = sqlitePath;
process.env.SSFW_FLUE_MODEL = model;

const storyTurns = [
	"Someone got hurt near Line 2 yesterday. Can you help me investigate it?",
	"It was at 07:42 by the pallet jack charging area. Mara, a packaging operator, slipped while carrying label rolls.",
	"At first people said she tripped, but Sam saw a thin trail of hydraulic oil on the floor.",
	"The pallet jack had been leaking since Wednesday. Maintenance tagged it for Friday repair, but production was behind and the jack stayed in use.",
	"The spill kit was empty and nobody put cones or a barrier around the trail.",
	"Mara fractured her left wrist and went to hospital. No one else is hurt, but that lane is still used by three operators.",
	"Supervisor Luis told the crew to keep the lane moving because the order was late. He did not mean ignore safety, but that is what happened.",
	"Measures: stop using that pallet jack until repaired; refill spill kits every shift; supervisors must block off leaks immediately; maintenance escalation if leaking equipment is needed for production. Luis owns the rule briefing by 2026-06-20 and maintenance owns the repair today.",
] as const;
const explanationPrompt =
	"Before I export it, explain the case back to me: what happened, why it happened, and why these measures fit the causes. Don't add new record operations unless you learned a new fact.";

const expectedFindings = [
	{
		key: "Line 2 / pallet jack charging area",
		patterns: [/line 2/i, /pallet jack/i],
	},
	{ key: "hydraulic oil slip", patterns: [/hydraulic oil/i, /slip/i] },
	{ key: "fractured wrist", patterns: [/fractur/i, /wrist/i] },
	{ key: "leak known before incident", patterns: [/leak/i, /wednesday|two days/i] },
	{ key: "production pressure", patterns: [/production/i, /behind|late|pressure/i] },
	{ key: "empty spill kit", patterns: [/spill kit/i, /empty/i] },
	{ key: "missing cones/barrier", patterns: [/cone|barrier|block/i] },
	{ key: "equipment isolation action", patterns: [/stop using|isolate|removed/i] },
	{ key: "spill kit replenishment action", patterns: [/spill kit/i, /refill|replenish/i] },
	{
		key: "supervisor escalation/briefing action",
		patterns: [/supervisor|luis/i, /brief|block|escalat/i],
	},
] as const;

let flue: ChildProcess | null = null;
let tenantId = "";
let userId = "";
let incidentId = "";

try {
	({ tenantId, userId } = await seedTenant());
	incidentId = randomUUID();
	await insertIncidentCase({ caseId: incidentId, tenantId, userId });

	flue = await startFlueServer();
	const transcript = [];

	for (const [index, message] of storyTurns.entries()) {
		if (index === 4) {
			await stopFlueServer(flue);
			flue = await startFlueServer();
		}

		const turn = await runCoachChatTurn({
			incidentId,
			locale: "en",
			message,
			tenantId,
			userId,
		});
		assert.ok(turn);
		const applied = await applyOperations({
			incidentId,
			messageId: turn.assistantMessage.id,
			operations: turn.assistantMessage.operations,
			tenantId,
		});
		transcript.push({
			applied,
			assistant: turn.assistantMessage.content,
			operationKinds: turn.assistantMessage.operations.map(
				(operation) => operation.kind,
			),
			user: message,
		});
	}

	const explanationTurn = await runCoachChatTurn({
		incidentId,
		locale: "en",
		message: explanationPrompt,
		tenantId,
		userId,
	});
	assert.ok(explanationTurn);
	const explanation = {
		assistant: explanationTurn.assistantMessage.content,
		operationKinds: explanationTurn.assistantMessage.operations.map(
			(operation) => operation.kind,
		),
		user: explanationPrompt,
	};
	const finalRecord = await readFinalRecord({ incidentId, tenantId });
	const comparison = compareRecord(finalRecord, explanation);
	const report = {
		comparison,
		explanation,
		finalRecord,
		flue: {
			baseUrl,
			model,
			restartedAfterTurn: 4,
			sqlitePath,
		},
		incidentId,
		runId,
		storyTurns,
		tenantId,
		transcript,
	};

	mkdirSync(".tmp", { recursive: true });
	writeFileSync(reportPath, JSON.stringify(report, null, 2));

	console.log(JSON.stringify({ comparison, reportPath }, null, 2));

	if (!comparison.pass) {
		process.exitCode = 1;
	}
} finally {
	if (flue) {
		await stopFlueServer(flue).catch(() => undefined);
	}
	if (tenantId) {
		await dropTenantSchema(tenantId).catch(() => undefined);
		await prisma.tenantMembership.deleteMany({ where: { tenantId } });
		await prisma.tenant.deleteMany({ where: { id: tenantId } });
	}
	if (userId) {
		await prisma.user.deleteMany({ where: { id: userId } });
	}
	await prisma.$disconnect();
}

async function startFlueServer(): Promise<ChildProcess> {
	const child = spawn(process.execPath, [".flue-dist/server.mjs"], {
		env: {
			...process.env,
			PORT: String(port),
			SSFW_FLUE_SQLITE_PATH: sqlitePath,
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	child.stdout?.on("data", (chunk) => process.stdout.write(`[flue] ${chunk}`));
	child.stderr?.on("data", (chunk) => process.stderr.write(`[flue] ${chunk}`));
	await waitForFlue(child);
	return child;
}

async function stopFlueServer(
	child: ChildProcess,
): Promise<void> {
	if (hasExited(child)) {
		return;
	}
	child.kill("SIGTERM");
	if (await waitForChildExit(child, 5_000)) {
		return;
	}

	child.kill("SIGKILL");
	await waitForChildExit(child, 5_000);
}

async function waitForChildExit(
	child: ChildProcess,
	timeoutMs: number,
): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;

	while (Date.now() < deadline) {
		if (hasExited(child)) {
			return true;
		}
		await new Promise((resolve) => setTimeout(resolve, 50));
	}

	return hasExited(child);
}

function hasExited(child: ChildProcess): boolean {
	return child.exitCode !== null || child.signalCode !== null;
}

async function waitForFlue(child: ChildProcess): Promise<void> {
	const deadline = Date.now() + 30_000;
	let lastError: unknown;

	while (Date.now() < deadline) {
		if (child.exitCode !== null) {
			throw new Error(`Flue server exited early with code ${child.exitCode}`);
		}

		try {
			const response = await fetch(`${baseUrl}/openapi.json`);
			if (response.ok) {
				return;
			}
			lastError = new Error(`HTTP ${response.status}`);
		} catch (error) {
			lastError = error;
		}

		await new Promise((resolve) => setTimeout(resolve, 250));
	}

	throw new Error(
		`Flue server did not become ready: ${
			lastError instanceof Error ? lastError.message : String(lastError)
		}`,
	);
}

async function applyOperations(input: {
	readonly tenantId: string;
	readonly incidentId: string;
	readonly messageId: string;
	readonly operations: readonly import("../../src/lib/agent/types").AgentStructuredOperation[];
}) {
	const operationRecordMap: Record<string, string> = {};
	const results = [];

	for (const operation of input.operations) {
		const result = await applyIncidentCoachOperation({
			incidentId: input.incidentId,
			operation,
			operationRecordMap,
			tenantId: input.tenantId,
		});

		if (result.ok) {
			if (result.recordId) {
				operationRecordMap[operation.id] = result.recordId;
			}
			await recordCoachOperationDecision({
				decision: {
					recordId: result.recordId,
					status: "applied",
				},
				incidentId: input.incidentId,
				messageId: input.messageId,
				operationId: operation.id,
				tenantId: input.tenantId,
			});
		}

		results.push({ kind: operation.kind, result });
	}

	return results;
}

async function readFinalRecord(input: {
	readonly tenantId: string;
	readonly incidentId: string;
}) {
	return withTenantConnection(input.tenantId, async (tx) => {
		const [incident] = await tx.$queryRaw<
			Array<{
				actualOutcome: string | null;
				bodyPart: string | null;
				eventType: string | null;
				hazardCategory: string | null;
				incidentType: string;
				injuryNature: string | null;
				location: string | null;
				potentialOutcome: string | null;
				potentialSeverity: string | null;
				title: string;
			}>
		>`
			SELECT
				title,
				location,
				incident_type::text AS "incidentType",
				actual_injury_outcome::text AS "actualOutcome",
				potential_outcome_text AS "potentialOutcome",
				potential_severity_code AS "potentialSeverity",
				hazard_category_code AS "hazardCategory",
				event_type AS "eventType",
				injury_nature AS "injuryNature",
				body_part AS "bodyPart"
			FROM incident_case
			WHERE id = ${input.incidentId}::uuid
			LIMIT 1
		`;
		const facts = await tx.$queryRaw<Array<{ text: string }>>`
			SELECT text
			FROM incident_fact
			WHERE case_id = ${input.incidentId}::uuid
			ORDER BY order_index ASC
		`;
		const timeline = await tx.$queryRaw<
			Array<{ text: string; timeLabel: string | null }>
		>`
			SELECT time_label AS "timeLabel", text
			FROM incident_timeline_event
			WHERE case_id = ${input.incidentId}::uuid
			ORDER BY order_index ASC
		`;
		const causes = await tx.$queryRaw<
			Array<{ branchStatus: string; isRootCause: boolean; statement: string }>
		>`
			SELECT statement, is_root_cause AS "isRootCause", branch_status AS "branchStatus"
			FROM incident_cause_node
			WHERE case_id = ${input.incidentId}::uuid
			ORDER BY order_index ASC
		`;
		const actions = await tx.$queryRaw<
			Array<{ description: string; dueDate: Date | null; ownerRole: string | null }>
		>`
			SELECT action.description, action.owner_role AS "ownerRole", action.due_date AS "dueDate"
			FROM incident_cause_action action
			JOIN incident_cause_node cause ON cause.id = action.cause_node_id
			WHERE cause.case_id = ${input.incidentId}::uuid
			ORDER BY action.order_index ASC
		`;

		return { actions, causes, facts, incident, timeline };
	});
}

function compareRecord(
	finalRecord: Awaited<ReturnType<typeof readFinalRecord>>,
	explanation: {
		readonly assistant: string;
		readonly operationKinds: readonly string[];
	},
) {
	const haystack = JSON.stringify(finalRecord).toLowerCase();
	const checks = expectedFindings.map((finding) => ({
		found: finding.patterns.every((pattern) => pattern.test(haystack)),
		key: finding.key,
	}));
	const foundCount = checks.filter((check) => check.found).length;
	const actionCount = finalRecord.actions.length;
	const requiredActionCount = 3;
	const explanationComparison = compareExplanation(explanation);
	const classificationChecks = [
		{
			found:
				typeof finalRecord.incident.actualOutcome === "string" &&
				finalRecord.incident.actualOutcome !== "UNKNOWN",
			key: "actual injury outcome classified",
		},
		{
			found: typeof finalRecord.incident.potentialSeverity === "string",
			key: "potential severity classified",
		},
		{
			found: finalRecord.incident.eventType === "SLIP_TRIP_FALL",
			key: "slip/trip/fall event type classified",
		},
		{
			found: typeof finalRecord.incident.hazardCategory === "string",
			key: "hazard category classified",
		},
	];
	const classificationFoundCount = classificationChecks.filter(
		(check) => check.found,
	).length;

	return {
		actionCount,
		checks,
		classification: {
			checks: classificationChecks,
			foundCount: classificationFoundCount,
			pass: classificationFoundCount >= 3,
			requiredCount: 3,
		},
		explanation: explanationComparison,
		foundCount,
		pass:
			foundCount >= 8 &&
			classificationFoundCount >= 3 &&
			actionCount >= requiredActionCount &&
			explanationComparison.pass,
		requiredActionCount,
		requiredCount: 8,
		totalCount: checks.length,
	};
}

function compareExplanation(input: {
	readonly assistant: string;
	readonly operationKinds: readonly string[];
}) {
	const text = input.assistant.toLowerCase();
	const checks = [
		{ found: /hydraulic oil|oil/.test(text), key: "explains slip hazard" },
		{ found: /leak/.test(text), key: "explains leaking equipment" },
		{
			found: /production|late|pressure|backlog/.test(text),
			key: "explains production pressure",
		},
		{ found: /spill kit/.test(text), key: "explains empty spill kit" },
		{
			found: /block|barrier|cone|isolate/.test(text),
			key: "connects isolation measure",
		},
		{
			found: /repair|refill|brief|escalat/.test(text),
			key: "connects corrective measures",
		},
	] as const;
	const foundCount = checks.filter((check) => check.found).length;

	return {
		checks,
		foundCount,
		operationCount: input.operationKinds.length,
		pass: foundCount >= 5 && input.operationKinds.length === 0,
		requiredCount: 5,
	};
}

async function seedTenant(): Promise<{ tenantId: string; userId: string }> {
	const tenant = await prisma.tenant.create({
		data: {
			defaultLanguage: "en",
			name: `ssfw-flue-story-${randomUUID()}`,
		},
	});
	const user = await prisma.user.create({
		data: {
			email: `ssfw-flue-story-${randomUUID()}@example.invalid`,
			uiLocale: "en",
		},
	});
	await prisma.tenantMembership.create({
		data: { tenantId: tenant.id, userId: user.id },
	});
	await provisionIncidentSchema(tenant.id);
	return { tenantId: tenant.id, userId: user.id };
}

async function provisionIncidentSchema(tenantId: string): Promise<void> {
	const { role, schema } = names(tenantId);
	await prisma.$executeRawUnsafe(
		`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ${sqlString(
			role,
		)}) THEN EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION', ${sqlString(
			role,
		)}); END IF; END $$`,
	);
	await prisma.$executeRawUnsafe(`GRANT ${quoteIdent(role)} TO CURRENT_USER`);
	await prisma.$executeRawUnsafe(
		`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)} AUTHORIZATION ${quoteIdent(
			role,
		)}`,
	);
	await prisma.$executeRawUnsafe(
		`ALTER SCHEMA ${quoteIdent(schema)} OWNER TO ${quoteIdent(role)}`,
	);
	await prisma.$executeRawUnsafe(
		`GRANT USAGE ON SCHEMA ${quoteIdent(schema)} TO ${quoteIdent(role)}`,
	);
	await prisma.$executeRawUnsafe(
		`GRANT USAGE ON SCHEMA "shared" TO ${quoteIdent(role)}`,
	);
	for (const fn of [
		"apply_incident_case_schema",
		"apply_action_item_schema",
		"apply_action_origin_contract_schema",
		"apply_action_attachment_schema",
		"apply_incident_action_bridge_schema",
		"apply_incident_coach_message_schema",
		"apply_incident_cause_branch_status_schema",
		"apply_incident_attachment_caption_schema",
	]) {
		await prisma.$executeRawUnsafe(
			`SELECT shared.${fn}(${sqlString(schema)}::name)`,
		);
	}
}

async function insertIncidentCase(input: {
	readonly caseId: string;
	readonly tenantId: string;
	readonly userId: string;
}): Promise<void> {
	const schema = quoteIdent(names(input.tenantId).schema);

	await prisma.$executeRawUnsafe(
		`INSERT INTO ${schema}.incident_case (
			id,
			title,
			incident_at,
			incident_type,
			coordinator_role,
			content_language,
			created_by
		) VALUES (
			${sqlString(input.caseId)}::uuid,
			'Flue story investigation',
			'2026-06-13T05:42:00Z'::timestamptz,
			'ACCIDENT',
			'Line supervisor',
			'en',
			${sqlString(input.userId)}::uuid
		)`,
	);
}

function names(tenantId: string): { role: string; schema: string } {
	const suffix = tenantId.replaceAll("-", "_");
	return {
		role: `role_tenant_${suffix}`,
		schema: `tenant_${suffix}`,
	};
}

function quoteIdent(value: string): string {
	return `"${value.replaceAll('"', '""')}"`;
}

function sqlString(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}

function moduleUrl(relativePath: string): string {
	return pathToFileURL(relativePath).href;
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}
