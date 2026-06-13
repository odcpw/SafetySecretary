import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === "next/server") {
			return nextResolve("next/server.js", context);
		}

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

const databaseUrl = process.env.DATABASE_URL;
const fixturePath = `${process.cwd()}/tests/fixtures/llm/ii-coach-chat.json`;
const mutableEnv = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalSeedPath = process.env.SSFW_II_COACH_MOCK_SEED_PATH;

mutableEnv.NODE_ENV = "test";
process.env.SSFW_II_COACH_MOCK_SEED_PATH = fixturePath;

const { listCoachMessages, parseCoachResponse, runCoachChatTurn } =
	(await import(
		moduleUrl("src/lib/incident/coach-chat.ts")
	)) as typeof import("../../../src/lib/incident/coach-chat");
const { applyIncidentCoachOperation } = (await import(
	moduleUrl("src/lib/agent/incident-investigation/apply-operation.ts")
)) as typeof import("../../../src/lib/agent/incident-investigation/apply-operation");
const { AgentOperationKind } = (await import(
	moduleUrl("src/lib/agent/types.ts")
)) as typeof import("../../../src/lib/agent/types");
const { prisma, dropTenantSchema, withTenantConnection } = (await import(
	moduleUrl("src/lib/db/index.ts")
)) as typeof import("../../../src/lib/db");

test.after(async () => {
	if (originalNodeEnv === undefined) {
		delete mutableEnv.NODE_ENV;
	} else {
		mutableEnv.NODE_ENV = originalNodeEnv;
	}

	if (originalSeedPath === undefined) {
		delete process.env.SSFW_II_COACH_MOCK_SEED_PATH;
	} else {
		process.env.SSFW_II_COACH_MOCK_SEED_PATH = originalSeedPath;
	}

	await prisma.$disconnect();
});

test("coach chat parses operations, rewires refs, and survives non-JSON replies", () => {
	const runId = randomUUID();
	const skill = { id: "incident-investigation", version: "0.1.0" };
	const incidentId = randomUUID();
	const parsed = parseCoachResponse(
		JSON.stringify({
			operations: [
				{
					kind: "cause_node",
					payload: { label: "Charger had no fixed place" },
					ref: "c1",
				},
				{
					kind: "stop_action",
					payload: {
						linkedCauseNodeId: "c1",
						stopClass: "T",
						title: "Maintenance installs a wall bracket this week",
					},
				},
				{
					kind: "not_a_kind",
					payload: { whatever: true },
				},
			],
			reply: "Noted.",
		}),
		runId,
		skill,
		incidentId,
	);

	assert.equal(parsed.reply, "Noted.");
	assert.equal(parsed.operations.length, 2);
	const causeOperation = parsed.operations[0];
	const actionOperation = parsed.operations[1];
	assert.ok(causeOperation && actionOperation);
	assert.equal(causeOperation.kind, AgentOperationKind.CauseNode);
	assert.equal(actionOperation.kind, AgentOperationKind.StopAction);
	assert.equal(
		(actionOperation.payload as { linkedCauseNodeId?: string })
			.linkedCauseNodeId,
		causeOperation.id,
	);

	const fallback = parseCoachResponse(
		"Plain sentence without JSON.",
		runId,
		skill,
		incidentId,
	);
	assert.equal(fallback.reply, "Plain sentence without JSON.");
	assert.equal(fallback.operations.length, 0);
});

test("coach chat persists the conversation and field updates apply to the record", {
	skip: !databaseUrl,
}, async (t) => {
	const { tenantId, userId } = await seedTenant();
	const incidentId = randomUUID();
	await insertIncidentCase({ caseId: incidentId, tenantId, userId });

	t.after(async () => {
		await dropTenantSchema(tenantId).catch(() => undefined);
		await prisma.tenantMembership.deleteMany({ where: { tenantId } });
		await prisma.tenant.deleteMany({ where: { id: tenantId } });
		await prisma.user.deleteMany({ where: { id: userId } });
	});

	const turn = await runCoachChatTurn({
		incidentId,
		locale: "en",
		message:
			"Forklift nearly hit a pedestrian at gate 3 while reversing out of the bay.",
		tenantId,
		userId,
	});

	assert.ok(turn);
	assert.equal(turn.userMessage.role, "user");
	assert.equal(turn.assistantMessage.role, "assistant");
	assert.match(turn.assistantMessage.content, /credible worst case/i);
	assert.equal(turn.assistantMessage.operations.length, 4);

	const persisted = await listCoachMessages(tenantId, incidentId);
	assert.ok(persisted);
	assert.equal(persisted.length, 2);

	const fieldUpdate = turn.assistantMessage.operations.find(
		(operation) => operation.kind === AgentOperationKind.IncidentFieldUpdate,
	);
	assert.ok(fieldUpdate);
	const appliedField = await applyIncidentCoachOperation({
		incidentId,
		operation: fieldUpdate,
		tenantId,
	});
	assert.deepEqual(
		{ ok: appliedField.ok },
		{ ok: true },
		JSON.stringify(appliedField),
	);

	const causeOperation = turn.assistantMessage.operations.find(
		(operation) => operation.kind === AgentOperationKind.CauseNode,
	);
	assert.ok(causeOperation);
	const appliedCause = await applyIncidentCoachOperation({
		incidentId,
		operation: causeOperation,
		tenantId,
	});
	assert.ok(appliedCause.ok);

	const causeUpdateOperation = turn.assistantMessage.operations.find(
		(operation) => operation.kind === AgentOperationKind.CauseUpdate,
	);
	assert.ok(causeUpdateOperation);
	assert.equal(
		(causeUpdateOperation.payload as { causeId?: string }).causeId,
		causeOperation.id,
	);
	const appliedCauseUpdate = await applyIncidentCoachOperation({
		incidentId,
		operation: causeUpdateOperation,
		operationRecordMap: appliedCause.ok
			? { [causeOperation.id]: appliedCause.recordId ?? "" }
			: {},
		tenantId,
	});
	assert.ok(appliedCauseUpdate.ok, JSON.stringify(appliedCauseUpdate));

	const actionOperation = turn.assistantMessage.operations.find(
		(operation) => operation.kind === AgentOperationKind.StopAction,
	);
	assert.ok(actionOperation);
	const appliedAction = await applyIncidentCoachOperation({
		incidentId,
		operation: actionOperation,
		operationRecordMap: appliedCause.ok
			? { [causeOperation.id]: appliedCause.recordId ?? "" }
			: {},
		tenantId,
	});
	assert.ok(appliedAction.ok, JSON.stringify(appliedAction));

	const row = await withTenantConnection(tenantId, async (tx) => {
		const rows = await tx.$queryRaw<
			Array<{ location: string | null; causes: number; actions: number }>
		>`
				SELECT
					incident_case.location,
					(
						SELECT COUNT(*)::int
						FROM incident_cause_node
						WHERE case_id = incident_case.id
					) AS causes,
					(
						SELECT COUNT(*)::int
						FROM incident_cause_action action
						JOIN incident_cause_node node ON node.id = action.cause_node_id
						WHERE node.case_id = incident_case.id
					) AS actions
				FROM incident_case
				WHERE id = ${incidentId}::uuid
			`;
		return rows[0];
	});

	assert.ok(row);
	assert.equal(row.location, "Loading bay gate 3");
	assert.equal(row.causes, 1);
	assert.equal(row.actions, 1);

	const causeRow = await withTenantConnection(tenantId, async (tx) => {
		const rows = await tx.$queryRaw<
			Array<{ branchStatus: string; isRootCause: boolean }>
		>`
				SELECT
					branch_status AS "branchStatus",
					is_root_cause AS "isRootCause"
				FROM incident_cause_node
				WHERE case_id = ${incidentId}::uuid
			`;
		return rows[0];
	});

	assert.ok(causeRow);
	assert.equal(causeRow.branchStatus, "ROOT_REACHED");
	assert.equal(causeRow.isRootCause, true);

	const fallbackTurn = await runCoachChatTurn({
		incidentId,
		locale: "en",
		message: "And what should I do next?",
		tenantId,
		userId,
	});

	assert.ok(fallbackTurn);
	assert.equal(
		fallbackTurn.assistantMessage.content,
		"This is not JSON at all, just a plain coach sentence.",
	);
	assert.equal(fallbackTurn.assistantMessage.operations.length, 0);
});

test("applying the same cause_node text twice yields one node, not a duplicate", {
	skip: !databaseUrl,
}, async (t) => {
	const { tenantId, userId } = await seedTenant();
	const incidentId = randomUUID();
	await insertIncidentCase({ caseId: incidentId, tenantId, userId });

	t.after(async () => {
		await dropTenantSchema(tenantId).catch(() => undefined);
		await prisma.tenantMembership.deleteMany({ where: { tenantId } });
		await prisma.tenant.deleteMany({ where: { id: tenantId } });
		await prisma.user.deleteMany({ where: { id: userId } });
	});

	const skill = { id: "incident-investigation", version: "0.4.0" };
	const buildCauseNode = (label: string) =>
		parseCoachResponse(
			JSON.stringify({
				operations: [{ kind: "cause_node", payload: { label } }],
				reply: "Noted.",
			}),
			randomUUID(),
			skill,
			incidentId,
		).operations[0];

	const first = buildCauseNode("Oil leak under the press");
	const duplicate = buildCauseNode("  oil   leak under THE press \n");
	const distinct = buildCauseNode("Reactive cleaning only");
	assert.ok(first && duplicate && distinct);

	const appliedFirst = await applyIncidentCoachOperation({
		incidentId,
		operation: first,
		tenantId,
	});
	assert.ok(appliedFirst.ok, JSON.stringify(appliedFirst));

	// The coach re-emits the same cause on a later turn: it must no-op and
	// resolve to the existing node's id, not insert a second node.
	const appliedDuplicate = await applyIncidentCoachOperation({
		incidentId,
		operation: duplicate,
		tenantId,
	});
	assert.ok(appliedDuplicate.ok, JSON.stringify(appliedDuplicate));
	assert.equal(
		appliedDuplicate.recordId,
		appliedFirst.recordId,
		"duplicate cause must resolve to the existing node id",
	);

	// A genuinely different cause is never merged away.
	const appliedDistinct = await applyIncidentCoachOperation({
		incidentId,
		operation: distinct,
		tenantId,
	});
	assert.ok(appliedDistinct.ok, JSON.stringify(appliedDistinct));
	assert.notEqual(appliedDistinct.recordId, appliedFirst.recordId);

	const statements = await withTenantConnection(tenantId, async (tx) => {
		const rows = await tx.$queryRaw<Array<{ statement: string }>>`
				SELECT statement
				FROM incident_cause_node
				WHERE case_id = ${incidentId}::uuid
				ORDER BY order_index ASC
			`;
		return rows.map((row) => row.statement);
	});
	assert.deepEqual(statements, [
		"Oil leak under the press",
		"Reactive cleaning only",
	]);
});

async function seedTenant(): Promise<{ tenantId: string; userId: string }> {
	const tenant = await prisma.tenant.create({
		data: {
			defaultLanguage: "en",
			name: `ssfw-coach-chat-${randomUUID()}`,
		},
	});
	const user = await prisma.user.create({
		data: {
			email: `ssfw-coach-chat-${randomUUID()}@example.invalid`,
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
	await prisma.$executeRawUnsafe(
		`SELECT shared.apply_incident_case_schema(${sqlString(schema)}::name)`,
	);
	await prisma.$executeRawUnsafe(
		`SELECT shared.apply_action_item_schema(${sqlString(schema)}::name)`,
	);
	await prisma.$executeRawUnsafe(
		`SELECT shared.apply_action_origin_contract_schema(${sqlString(schema)}::name)`,
	);
	await prisma.$executeRawUnsafe(
		`SELECT shared.apply_action_attachment_schema(${sqlString(schema)}::name)`,
	);
	await prisma.$executeRawUnsafe(
		`SELECT shared.apply_incident_action_bridge_schema(${sqlString(schema)}::name)`,
	);
	await prisma.$executeRawUnsafe(
		`SELECT shared.apply_incident_coach_message_schema(${sqlString(schema)}::name)`,
	);
	await prisma.$executeRawUnsafe(
		`SELECT shared.apply_incident_cause_branch_status_schema(${sqlString(schema)}::name)`,
	);
	await prisma.$executeRawUnsafe(
		`SELECT shared.apply_incident_attachment_caption_schema(${sqlString(schema)}::name)`,
	);
}

async function insertIncidentCase(input: {
	caseId: string;
	tenantId: string;
	userId: string;
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
			'II coach chat test',
			'2026-06-08T07:30:00Z'::timestamptz,
			'NEAR_MISS',
			'Safety lead',
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
