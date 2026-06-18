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
const actionMessageKeys = [
	"incident.actions.addTitle",
	"incident.actions.createAction",
	"incident.actions.deleteAction",
	"incident.actions.description",
	"incident.actions.empty",
	"incident.actions.emptyCauses",
	"incident.actions.error.invalidDueDate",
	"incident.actions.error.invalidId",
	"incident.actions.error.invalidPayload",
	"incident.actions.error.invalidStatus",
	"incident.actions.error.invalidType",
	"incident.actions.error.saveFailed",
	"incident.actions.field.actionType",
	"incident.actions.field.description",
	"incident.actions.field.dueDate",
	"incident.actions.field.ownerRole",
	"incident.actions.field.status",
	"incident.actions.listTitle",
	"incident.actions.saveAction",
	"incident.actions.status.COMPLETE",
	"incident.actions.status.IN_PROGRESS",
	"incident.actions.status.OPEN",
	"incident.actions.title",
	"incident.actions.type.ENGINEERING",
	"incident.actions.type.ORGANISATIONAL",
	"incident.actions.type.PPE",
	"incident.actions.type.TRAINING",
] as const;

const { NextRequest } = (await import(
	"next/server.js"
)) as typeof import("next/server");
const actionsRoute = (await import(
	moduleUrl("src/app/api/incidents/[id]/actions/route.ts")
)) as typeof import("../../../src/app/api/incidents/[id]/actions/route");
const { authorizeRequest } = (await import(
	moduleUrl("src/proxy.ts")
)) as typeof import("../../../src/proxy");
const { mintCsrfToken } = (await import(
	moduleUrl("src/lib/auth/csrf.ts")
)) as typeof import("../../../src/lib/auth/csrf");
const { prisma, dropTenantSchema, withTenantConnection } = (await import(
	moduleUrl("src/lib/db/index.ts")
)) as typeof import("../../../src/lib/db");
const { serialiseWorkflow } = (await import(
	moduleUrl("src/lib/incident/serialise.ts")
)) as typeof import("../../../src/lib/incident/serialise");
const { listActionItems } = (await import(
	moduleUrl("src/lib/actions/queries.ts")
)) as typeof import("../../../src/lib/actions/queries");
const { t } = (await import(
	moduleUrl("src/lib/i18n/t.ts")
)) as typeof import("../../../src/lib/i18n/t");
const { LOCALES } = (await import(
	moduleUrl("src/lib/i18n/types.ts")
)) as typeof import("../../../src/lib/i18n/types");

test.after(async () => {
	await prisma.$disconnect();
});

test("II corrective action labels have DE/EN/FR/IT catalog coverage", () => {
	for (const locale of LOCALES) {
		for (const key of actionMessageKeys) {
			const rendered = t(key, locale);
			assert.notEqual(rendered, key, `${locale}.${key} must resolve`);
			assert.ok(rendered.trim(), `${locale}.${key} must not be empty`);
		}
	}
});

test("proxied II corrective action form posts require the CSRF double-submit token", async () => {
	const session = {
		deviceHint: "desktop" as const,
		expiresAt: new Date("2026-05-30T00:00:00.000Z"),
		id: randomUUID(),
		lastSeenAt: new Date("2026-05-05T00:00:00.000Z"),
		tenantId: "11111111-1111-4111-8111-111111111111",
		userId: "22222222-2222-4222-8222-222222222222",
	};
	const body = new URLSearchParams({
		actionType: "ORGANIZATIONAL",
		causeNodeId: "33333333-3333-4333-8333-333333333333",
		description: "Create escalation path for cancelled maintenance windows.",
		status: "OPEN",
	}).toString();
	const url =
		"https://app.example.test/api/incidents/44444444-4444-4444-8444-444444444444/actions";

	const rejected = await authorizeRequest(
		new NextRequest(url, {
			body,
			headers: {
				cookie: `ssfw_session=${session.id}`,
				"content-type": "application/x-www-form-urlencoded",
			},
			method: "POST",
		}),
		async () => session,
		async () => true,
	);
	assert.equal(rejected.status, 403);

	const csrfToken = mintCsrfToken(session.id);
	const accepted = await authorizeRequest(
		new NextRequest(url, {
			body,
			headers: {
				cookie: `ssfw_session=${session.id}; ssfw_csrf=${csrfToken}`,
				"content-type": "application/x-www-form-urlencoded",
				"x-ssfw-csrf": csrfToken,
			},
			method: "POST",
		}),
		async () => session,
		async () => true,
	);
	assert.equal(accepted.status, 200);
	assert.equal(accepted.headers.get("x-middleware-next"), "1");
});

if (!databaseUrl) {
	test("II corrective actions integration", {
		skip: "DATABASE_URL is required",
	}, () => {});
} else {
	test("II corrective actions CRUD stays tenant-scoped and status-aware", async () => {
		const tenantA = await seedTenant("a");
		const tenantB = await seedTenant("b");
		const caseId = randomUUID();
		const causeNodeId = randomUUID();
		const legacyActionId = randomUUID();

		try {
			assert.deepEqual(await inspectIncidentActionBridgeSchema(tenantA.tenantId), {
				columnNullable: "YES",
				constraintName: "incident_cause_action_action_item_id_fkey",
			});
			await insertIncidentCase({
				caseId,
				tenantId: tenantA.tenantId,
				userId: tenantA.userId,
			});
			await insertCauseNode({
				caseId,
				causeNodeId,
				tenantId: tenantA.tenantId,
			});
			await insertLegacyIncidentAction({
				actionId: legacyActionId,
				causeNodeId,
				tenantId: tenantA.tenantId,
			});

			const legacyBoardActions = await listActionItems(tenantA.tenantId, {
				originType: "ii",
			});
			assert.equal(legacyBoardActions.length, 1);
			const legacyActionItemId = stringField(
				legacyBoardActions[0]?.id,
				"legacy.board.actionItemId",
			);
			assert.equal(legacyBoardActions[0]?.originId, causeNodeId);
			assert.equal(legacyBoardActions[0]?.ownerText, "Operations lead");

			const legacyList = await actionsRoute.GET(
				request({
					tenantId: tenantA.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/actions`,
					userId: tenantA.userId,
				}),
				{ params: { id: caseId } },
			);
			await assertStatus(legacyList, 200);
			const legacyActions = recordArray(
				record(await legacyList.json()).actions,
			).map(record);
			assert.equal(legacyActions.length, 1);
			assert.equal(legacyActions[0]?.actionItemId, legacyActionItemId);
			const relistedLegacyBoardActions = await listActionItems(
				tenantA.tenantId,
				{ originType: "ii" },
			);
			assert.equal(relistedLegacyBoardActions.length, 1);
			assert.equal(relistedLegacyBoardActions[0]?.id, legacyActionItemId);

			const deletedLegacy = await actionsRoute.DELETE(
				request({
					body: { actionId: legacyActionId },
					method: "DELETE",
					tenantId: tenantA.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/actions`,
					userId: tenantA.userId,
				}),
				{ params: { id: caseId } },
			);
			await assertStatus(deletedLegacy, 200);
			assert.equal(
				await inspectActionItemCount(tenantA.tenantId, legacyActionItemId),
				0,
			);

			const created = await actionsRoute.POST(
				request({
					body: {
						actionType: "ORGANIZATIONAL",
						causeNodeId,
						description:
							"Create an escalation path for cancelled maintenance windows.",
						dueDate: "2026-05-22",
						ownerRole: "Maintenance planner",
					},
					method: "POST",
					tenantId: tenantA.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/actions`,
					userId: tenantA.userId,
				}),
				{ params: { id: caseId } },
			);
			await assertStatus(created, 201);
			const createdAction = record(record(await created.json()).action);
			const actionId = stringField(createdAction.id, "created.action.id");
			const actionItemId = stringField(
				createdAction.actionItemId,
				"created.action.actionItemId",
			);
			assert.equal(createdAction.causeNodeId, causeNodeId);
			assert.equal(createdAction.actionType, "ORGANIZATIONAL");
			assert.equal(
				createdAction.description,
				"Create an escalation path for cancelled maintenance windows.",
			);
			assert.equal(createdAction.dueDate, "2026-05-22");
			assert.equal(createdAction.ownerRole, "Maintenance planner");
			assert.equal(createdAction.status, "OPEN");
			assert.deepEqual(
				await inspectLinkedActionItem(tenantA.tenantId, actionItemId),
				{
					completed: false,
					description:
						"Create an escalation path for cancelled maintenance windows.",
					dueDate: "2026-05-22",
					originId: causeNodeId,
					originType: "ii",
					ownerText: "Maintenance planner",
					status: "open",
					title: "Create an escalation path for cancelled maintenance windows.",
				},
			);

			const updated = await actionsRoute.PATCH(
				request({
					body: {
						actionId,
						actionType: "TECHNICAL",
						description:
							"Add a locked maintenance-window control before production restart.",
						dueDate: "2026-06-01",
						ownerRole: "Engineering lead",
						status: "IN_PROGRESS",
					},
					method: "PATCH",
					tenantId: tenantA.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/actions`,
					userId: tenantA.userId,
				}),
				{ params: { id: caseId } },
			);
			await assertStatus(updated, 200);
			const updatedAction = record(record(await updated.json()).action);
			assert.equal(updatedAction.actionType, "TECHNICAL");
			assert.equal(
				updatedAction.description,
				"Add a locked maintenance-window control before production restart.",
			);
			assert.equal(updatedAction.dueDate, "2026-06-01");
			assert.equal(updatedAction.ownerRole, "Engineering lead");
			assert.equal(updatedAction.status, "IN_PROGRESS");
			assert.equal(updatedAction.actionItemId, actionItemId);
			assert.deepEqual(
				await inspectLinkedActionItem(tenantA.tenantId, actionItemId),
				{
					completed: false,
					description:
						"Add a locked maintenance-window control before production restart.",
					dueDate: "2026-06-01",
					originId: causeNodeId,
					originType: "ii",
					ownerText: "Engineering lead",
					status: "in_progress",
					title: "Add a locked maintenance-window control before production restart.",
				},
			);

			const completed = await actionsRoute.POST(
				formRequest({
					body: {
						_action: "update",
						actionId,
						actionType: "TECHNICAL",
						description:
							"Add a locked maintenance-window control before production restart.",
						dueDate: "2026-06-01",
						ownerRole: "Engineering lead",
						status: "COMPLETE",
					},
					method: "POST",
					tenantId: tenantA.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/actions`,
					userId: tenantA.userId,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(completed.status, 303);
			assert.match(
				completed.headers.get("location") ?? "",
				/\/incidents\/[0-9a-f-]+\/actions$/,
			);

			const list = await actionsRoute.GET(
				request({
					tenantId: tenantA.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/actions`,
					userId: tenantA.userId,
				}),
				{ params: { id: caseId } },
			);
			await assertStatus(list, 200);
			const actions = recordArray(record(await list.json()).actions);
			assert.equal(actions.length, 1);
			assert.equal(record(actions[0]).status, "COMPLETE");
			assert.equal(record(actions[0]).actionItemId, actionItemId);

			const boardActions = await listActionItems(tenantA.tenantId, {
				originType: "ii",
			});
			assert.equal(boardActions.length, 1);
			assert.equal(boardActions[0]?.id, actionItemId);
			assert.equal(boardActions[0]?.originId, causeNodeId);
			assert.equal(boardActions[0]?.status, "completed");
			assert.equal(boardActions[0]?.completedAt instanceof Date, true);

			const crossTenant = await actionsRoute.GET(
				request({
					tenantId: tenantB.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/actions`,
					userId: tenantB.userId,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(crossTenant.status, 404);

			const invalidStatus = await actionsRoute.PATCH(
				request({
					body: {
						actionId,
						actionType: "TECHNICAL",
						description: "Keep the system control.",
						status: "BLOCKED",
					},
					method: "PATCH",
					tenantId: tenantA.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/actions`,
					userId: tenantA.userId,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(invalidStatus.status, 400);
			assert.equal(
				record(await invalidStatus.json()).code,
				"INVALID_ACTION_STATUS",
			);

			const invalidDueDate = await actionsRoute.PATCH(
				request({
					body: {
						actionId,
						actionType: "TECHNICAL",
						description: "Keep the system control.",
						dueDate: "01.06.2026",
						status: "COMPLETE",
					},
					method: "PATCH",
					tenantId: tenantA.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/actions`,
					userId: tenantA.userId,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(invalidDueDate.status, 400);
			assert.equal(
				record(await invalidDueDate.json()).code,
				"INVALID_DUE_DATE",
			);

			const serialised = await serialiseWorkflow("II", caseId, {
				tenantId: tenantA.tenantId,
			});
			const serialisedCauseNodes = recordArray(serialised.causeNodes).map(
				record,
			);
			const serialisedChildCause = serialisedCauseNodes.find(
				(node) => node.id === causeNodeId,
			);
			assert.ok(serialisedChildCause);
			const serialisedActions = recordArray(serialisedChildCause.actions).map(
				record,
			);
			assert.equal(serialisedActions.length, 1);
			const [serialisedAction] = serialisedActions;
			assert.ok(serialisedAction);
			assert.equal(serialisedAction.status, "COMPLETE");
			assert.equal(serialisedAction.actionType, "TECHNICAL");

			const inspected = await inspectIncidentActions(tenantA.tenantId, caseId);
			assert.deepEqual(inspected, {
				actionCount: 1,
				descriptions: [
					"Add a locked maintenance-window control before production restart.",
				],
				statuses: ["COMPLETE"],
				types: ["TECHNICAL"],
			});
			console.log(
				`DB inspection II actions: incident_cause_action=${inspected.actionCount}; statuses=${inspected.statuses.join(",")}; types=${inspected.types.join(",")}`,
			);

			const deleted = await actionsRoute.DELETE(
				request({
					body: { actionId },
					method: "DELETE",
					tenantId: tenantA.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/actions`,
					userId: tenantA.userId,
				}),
				{ params: { id: caseId } },
			);
			await assertStatus(deleted, 200);
			assert.deepEqual(await inspectIncidentActions(tenantA.tenantId, caseId), {
				actionCount: 0,
				descriptions: [],
				statuses: [],
				types: [],
			});
			assert.equal(
				await inspectActionItemCount(tenantA.tenantId, actionItemId),
				0,
			);
		} finally {
			await cleanupTenant(tenantB);
			await cleanupTenant(tenantA);
		}
	});

	async function seedTenant(label: string): Promise<{
		tenantId: string;
		userId: string;
	}> {
		const tenant = await prisma.tenant.create({
			data: {
				defaultLanguage: "en",
				name: `ssfw-vja-${label}-${randomUUID()}`,
			},
		});
		const user = await prisma.user.create({
			data: {
				email: `ssfw-vja-${label}-${randomUUID()}@example.invalid`,
				uiLocale: "en",
			},
		});
		await prisma.tenantMembership.create({
			data: {
				tenantId: tenant.id,
				userId: user.id,
			},
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
			`SELECT shared.apply_incident_cause_branch_status_schema(${sqlString(
				schema,
			)}::name)`,
		);
		await prisma.$executeRawUnsafe(
			`SELECT shared.apply_action_item_schema(${sqlString(schema)}::name)`,
		);
		await prisma.$executeRawUnsafe(
			`SELECT shared.apply_action_origin_contract_schema(${sqlString(
				schema,
			)}::name)`,
		);
		await prisma.$executeRawUnsafe(
			`SELECT shared.apply_action_attachment_schema(${sqlString(schema)}::name)`,
		);
		await prisma.$executeRawUnsafe(
			`SELECT shared.apply_incident_action_bridge_schema(${sqlString(
				schema,
			)}::name)`,
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
				'II actions test',
				'2026-05-05T06:45:00Z'::timestamptz,
				'NEAR_MISS',
				'Safety lead',
				'en',
				${sqlString(input.userId)}::uuid
			)`,
		);
	}

	async function insertCauseNode(input: {
		caseId: string;
		causeNodeId: string;
		tenantId: string;
	}): Promise<void> {
		const schema = quoteIdent(names(input.tenantId).schema);

		await prisma.$executeRawUnsafe(
			`INSERT INTO ${schema}.incident_cause_node (
				id,
				case_id,
				order_index,
				statement,
				question,
				is_root_cause
			) VALUES (
				${sqlString(input.causeNodeId)}::uuid,
				${sqlString(input.caseId)}::uuid,
				0,
				'Maintenance restart happened without an escalation path.',
				'Why was the safe path hard to follow?',
				true
			)`,
		);
	}

	async function insertLegacyIncidentAction(input: {
		actionId: string;
		causeNodeId: string;
		tenantId: string;
	}): Promise<void> {
		const schema = quoteIdent(names(input.tenantId).schema);

		await prisma.$executeRawUnsafe(
			`INSERT INTO ${schema}.incident_cause_action (
				id,
				cause_node_id,
				order_index,
				description,
				owner_role,
				due_date,
				action_type,
				status
			) VALUES (
				${sqlString(input.actionId)}::uuid,
				${sqlString(input.causeNodeId)}::uuid,
				0,
				'Create a handover checklist for maintenance restarts.',
				'Operations lead',
				'2026-06-15'::date,
				'ORGANIZATIONAL',
				'OPEN'
			)`,
		);
	}

	async function inspectLinkedActionItem(
		tenantId: string,
		actionItemId: string,
	): Promise<{
		completed: boolean;
		description: string | null;
		dueDate: string | null;
		originId: string | null;
		originType: string;
		ownerText: string | null;
		status: string;
		title: string;
	}> {
		return withTenantConnection(tenantId, async (tx) => {
			const actions = await tx.$queryRaw<
				Array<{
					completed: boolean;
					description: string | null;
					dueDate: Date | string | null;
					originId: string | null;
					originType: string;
					ownerText: string | null;
					status: string;
					title: string;
				}>
			>`
				SELECT
					action.completed_at IS NOT NULL AS completed,
					action.description,
					action.due_date AS "dueDate",
					action.origin_id::text AS "originId",
					action.origin_type::text AS "originType",
					action.owner_text AS "ownerText",
					action.status::text AS status,
					action.title
				FROM action_item action
				WHERE action.id = ${actionItemId}::uuid
			`;
			const action = actions[0];
			assert.ok(action, "linked action_item must exist");
			return {
				...action,
				dueDate: dateOnly(action.dueDate),
			};
		});
	}

	async function inspectIncidentActionBridgeSchema(tenantId: string): Promise<{
		columnNullable: string;
		constraintName: string | null;
	}> {
		const { schema } = names(tenantId);
		const columns = await prisma.$queryRaw<Array<{ is_nullable: string }>>`
			SELECT is_nullable
			FROM information_schema.columns
			WHERE table_schema = ${schema}
				AND table_name = 'incident_cause_action'
				AND column_name = 'action_item_id'
			LIMIT 1
		`;
		const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`
			SELECT constraint_row.conname
			FROM pg_catalog.pg_constraint constraint_row
			WHERE constraint_row.conrelid = (${schema} || '.incident_cause_action')::regclass
				AND constraint_row.conname = 'incident_cause_action_action_item_id_fkey'
			LIMIT 1
		`;

		return {
			columnNullable: columns[0]?.is_nullable ?? "missing",
			constraintName: constraints[0]?.conname ?? null,
		};
	}

	async function inspectActionItemCount(
		tenantId: string,
		actionItemId: string,
	): Promise<number> {
		return withTenantConnection(tenantId, async (tx) => {
			const rows = await tx.$queryRaw<Array<{ count: number }>>`
				SELECT count(*)::integer AS count
				FROM action_item
				WHERE id = ${actionItemId}::uuid
			`;
			return rows[0]?.count ?? 0;
		});
	}

	async function inspectIncidentActions(
		tenantId: string,
		caseId: string,
	): Promise<{
		actionCount: number;
		descriptions: string[];
		statuses: string[];
		types: string[];
	}> {
		return withTenantConnection(tenantId, async (tx) => {
			const actions = await tx.$queryRaw<
				Array<{
					description: string;
					status: string;
					type: string;
				}>
			>`
				SELECT
					action.description,
					action.status::text AS status,
					action.action_type::text AS type
				FROM incident_cause_action action
				JOIN incident_cause_node node ON node.id = action.cause_node_id
				WHERE node.case_id = ${caseId}::uuid
				ORDER BY action.order_index ASC, action.created_at ASC, action.id ASC
			`;

			return {
				actionCount: actions.length,
				descriptions: actions.map((action) => action.description),
				statuses: actions.map((action) => action.status),
				types: actions.map((action) => action.type),
			};
		});
	}

	async function cleanupTenant(input: {
		tenantId: string;
		userId: string;
	}): Promise<void> {
		await dropTenantSchema(input.tenantId).catch(() => undefined);
		await prisma.tenantMembership.deleteMany({
			where: { tenantId: input.tenantId },
		});
		await prisma.session.deleteMany({ where: { tenantId: input.tenantId } });
		await prisma.tenant.deleteMany({ where: { id: input.tenantId } });
		await prisma.user.deleteMany({ where: { id: input.userId } });
	}
}

function request(input: {
	body?: Record<string, unknown>;
	method?: string;
	tenantId: string;
	url: string;
	userId: string;
}) {
	return new NextRequest(input.url, {
		body: input.body ? JSON.stringify(input.body) : undefined,
		headers: {
			"content-type": "application/json",
			"x-ssfw-tenant-id": input.tenantId,
			"x-ssfw-user-id": input.userId,
		},
		method: input.method ?? "GET",
	});
}

function formRequest(input: {
	body: Record<string, string>;
	method?: string;
	tenantId: string;
	url: string;
	userId: string;
}) {
	return new NextRequest(input.url, {
		body: new URLSearchParams(input.body).toString(),
		headers: {
			accept: "text/html",
			"content-type": "application/x-www-form-urlencoded",
			"x-ssfw-tenant-id": input.tenantId,
			"x-ssfw-user-id": input.userId,
		},
		method: input.method ?? "POST",
	});
}

function recordArray(value: unknown): unknown[] {
	assert.ok(Array.isArray(value));
	return value;
}

function record(value: unknown): Record<string, unknown> {
	assert.ok(value && typeof value === "object" && !Array.isArray(value));
	return value as Record<string, unknown>;
}

function stringField(value: unknown, field: string): string {
	assert.equal(typeof value, "string", `${field} must be a string`);
	return value as string;
}

async function assertStatus(
	response: Response,
	expected: number,
): Promise<void> {
	if (response.status !== expected) {
		assert.equal(response.status, expected, await response.text());
	}
}

function names(tenantId: string): {
	role: string;
	schema: string;
} {
	const suffix = tenantId.toLowerCase().replaceAll("-", "_");
	return {
		role: `role_tenant_${suffix}`,
		schema: `tenant_${suffix}`,
	};
}

function quoteIdent(value: string): string {
	return `"${String(value).replaceAll('"', '""')}"`;
}

function sqlString(value: string): string {
	return `'${String(value).replaceAll("'", "''")}'`;
}

function dateOnly(value: Date | string | null): string | null {
	if (!value) {
		return null;
	}

	return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith(".") || specifier.startsWith("/");
}

function moduleUrl(relativePath: string): string {
	return pathToFileURL(`${process.cwd()}/${relativePath}`).href;
}
