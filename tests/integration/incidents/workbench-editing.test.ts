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
			return { shortCircuit: true, url: resolved.href };
		}

		return nextResolve(specifier, context);
	},
});

const databaseUrl = process.env.DATABASE_URL;

const { NextRequest } = (await import(
	"next/server.js"
)) as typeof import("next/server");
const incidentRoute = (await import(
	moduleUrl("src/app/api/incidents/[id]/route.ts")
)) as typeof import("../../../src/app/api/incidents/[id]/route");
const timelineRoute = (await import(
	moduleUrl("src/app/api/incidents/[id]/timeline/route.ts")
)) as typeof import("../../../src/app/api/incidents/[id]/timeline/route");
const actionsRoute = (await import(
	moduleUrl("src/app/api/incidents/[id]/actions/route.ts")
)) as typeof import("../../../src/app/api/incidents/[id]/actions/route");
const causesRoute = (await import(
	moduleUrl("src/app/api/incidents/[id]/causes/route.ts")
)) as typeof import("../../../src/app/api/incidents/[id]/causes/route");
const { issueSession } = (await import(
	moduleUrl("src/lib/auth/session.ts")
)) as typeof import("../../../src/lib/auth/session");
const { mintCsrfToken } = (await import(
	moduleUrl("src/lib/auth/csrf.ts")
)) as typeof import("../../../src/lib/auth/csrf");
const { prisma, dropTenantSchema, withTenantConnection } = (await import(
	moduleUrl("src/lib/db/index.ts")
)) as typeof import("../../../src/lib/db");

test.after(async () => {
	await prisma.$disconnect();
});

if (!databaseUrl) {
	test(
		"II workbench editing integration",
		{ skip: "DATABASE_URL is required" },
		() => {},
	);
} else {
	test("Overview edit sends a full payload and only the edited field changes", async () => {
		const tenant = await seedTenant("overview");
		const caseId = randomUUID();

		try {
			await insertIncidentCase({
				caseId,
				tenantId: tenant.tenantId,
				userId: tenant.userId,
			});

			// Mirror OverviewEditor: forward every field the PATCH reads, override one.
			const patched = await incidentRoute.PATCH(
				request(tenant, `https://app.example.test/api/incidents/${caseId}`, {
					actualInjuryOutcome: "NO_INJURY",
					areaText: "",
					coordinatorRole: "Safety lead",
					departmentText: "Maintenance",
					incidentAt: "2026-05-05T06:45:00.000Z",
					incidentTimeZone: "europe/zurich",
					incidentType: "NEAR_MISS",
					location: "Loading bay",
					potentialLikelihoodCode: "3",
					potentialOutcomeText: "Worker could have been struck",
					potentialSeverityCode: "C",
					title: "Edited title",
				}),
				{ params: { id: caseId } },
			);
			await assertStatus(patched, 200);
			const incident = record(record(await patched.json()).incident);
			assert.equal(incident.title, "Edited title");
			assert.equal(incident.location, "Loading bay");
			assert.equal(incident.departmentText, "Maintenance");
			assert.equal(incident.incidentType, "NEAR_MISS");
			// The unedited potential severity round-trips unchanged.
			assert.equal(incident.potentialSeverityCode, "C");
		} finally {
			await cleanupTenant(tenant);
		}
	});

	test("Timeline facts can be added, edited (text + phase), and deleted", async () => {
		const tenant = await seedTenant("timeline");
		const caseId = randomUUID();

		try {
			await insertIncidentCase({
				caseId,
				tenantId: tenant.tenantId,
				userId: tenant.userId,
			});

			const created = await timelineRoute.POST(
				request(
					tenant,
					`https://app.example.test/api/incidents/${caseId}/timeline`,
					{
						confidence: "LIKELY",
						sourcePersonIds: [],
						text: "Operator approached the line",
						timeLabel: "Before",
					},
				),
				{ params: { id: caseId } },
			);
			await assertStatus(created, 201);
			const createdEvent = record(record(await created.json()).event);
			const eventId = stringField(createdEvent.id, "event.id");
			assert.equal(createdEvent.timeLabel, "Before");

			const edited = await timelineRoute.POST(
				request(
					tenant,
					`https://app.example.test/api/incidents/${caseId}/timeline`,
					{
						_action: "update",
						confidence: "LIKELY",
						eventId,
						sourcePersonIds: [],
						text: "Operator reached the running line",
						timeLabel: "Event",
					},
				),
				{ params: { id: caseId } },
			);
			await assertStatus(edited, 200);
			const editedEvent = record(record(await edited.json()).event);
			assert.equal(editedEvent.text, "Operator reached the running line");
			assert.equal(editedEvent.timeLabel, "Event");

			const deleted = await timelineRoute.POST(
				request(
					tenant,
					`https://app.example.test/api/incidents/${caseId}/timeline`,
					{ _action: "delete", eventId },
				),
				{ params: { id: caseId } },
			);
			await assertStatus(deleted, 200);

			const remaining = await timelineCount(tenant.tenantId, caseId);
			assert.equal(remaining, 0);
		} finally {
			await cleanupTenant(tenant);
		}
	});

	test("Action plan measures can be added, edited, and deleted", async () => {
		const tenant = await seedTenant("actions");
		const caseId = randomUUID();

		try {
			await insertIncidentCase({
				caseId,
				tenantId: tenant.tenantId,
				userId: tenant.userId,
			});

			const causeNodeId = await createCause(tenant, caseId, "Guard was removed");

			const created = await actionsRoute.POST(
				request(
					tenant,
					`https://app.example.test/api/incidents/${caseId}/actions`,
					{
						actionType: "ORGANIZATIONAL",
						causeNodeId,
						description: "Reinstate the fixed guard",
						dueDate: "2026-06-01",
						ownerRole: "Line supervisor",
						status: "OPEN",
					},
				),
				{ params: { id: caseId } },
			);
			await assertStatus(created, 201);
			const action = record(record(await created.json()).action);
			const actionId = stringField(action.id, "action.id");
			assert.equal(action.description, "Reinstate the fixed guard");
			assert.equal(action.status, "OPEN");

			const edited = await actionsRoute.POST(
				request(
					tenant,
					`https://app.example.test/api/incidents/${caseId}/actions`,
					{
						_action: "update",
						actionId,
						actionType: "TECHNICAL",
						description: "Reinstate the fixed guard and interlock it",
						dueDate: "2026-06-15",
						ownerRole: "Maintenance lead",
						status: "IN_PROGRESS",
					},
				),
				{ params: { id: caseId } },
			);
			await assertStatus(edited, 200);
			const editedAction = record(record(await edited.json()).action);
			assert.equal(editedAction.status, "IN_PROGRESS");
			assert.equal(editedAction.actionType, "TECHNICAL");
			assert.equal(editedAction.ownerRole, "Maintenance lead");

			const deleted = await actionsRoute.POST(
				request(
					tenant,
					`https://app.example.test/api/incidents/${caseId}/actions`,
					{ _action: "delete", actionId },
				),
				{ params: { id: caseId } },
			);
			await assertStatus(deleted, 200);

			const list = await actionsRoute.GET(
				request(
					tenant,
					`https://app.example.test/api/incidents/${caseId}/actions`,
				),
				{ params: { id: caseId } },
			);
			await assertStatus(list, 200);
			assert.equal(recordArray(record(await list.json()).actions).length, 0);
		} finally {
			await cleanupTenant(tenant);
		}
	});

	async function createCause(
		tenant: { tenantId: string; userId: string; sessionCookie: string },
		caseId: string,
		statement: string,
	): Promise<string> {
		const response = await causesRoute.POST(
			request(
				tenant,
				`https://app.example.test/api/incidents/${caseId}/causes`,
				{ statement },
			),
			{ params: { id: caseId } },
		);
		await assertStatus(response, 201);
		return stringField(
			record(record(await response.json()).node).id,
			"cause.node.id",
		);
	}

	async function timelineCount(
		tenantId: string,
		caseId: string,
	): Promise<number> {
		return withTenantConnection(tenantId, async (tx) => {
			const rows = await tx.$queryRaw<Array<{ count: bigint }>>`
				SELECT count(*)::bigint AS count
				FROM incident_timeline_event
				WHERE case_id = ${caseId}::uuid
			`;
			return Number(rows[0]?.count ?? BigInt(0));
		});
	}

	function request(
		tenant: { tenantId: string; userId: string; sessionCookie: string },
		url: string,
		body?: Record<string, unknown>,
	) {
		const csrf = mintCsrfToken(tenant.sessionCookie);
		return new NextRequest(url, {
			body: body ? JSON.stringify(body) : undefined,
			headers: {
				accept: "application/json",
				"content-type": "application/json",
				cookie: `ssfw_session=${tenant.sessionCookie}; ssfw_csrf=${csrf}`,
				"x-ssfw-csrf": csrf,
				"x-ssfw-tenant-id": tenant.tenantId,
				"x-ssfw-user-id": tenant.userId,
			},
			method: body ? "POST" : "GET",
		});
	}

	async function seedTenant(label: string): Promise<{
		tenantId: string;
		userId: string;
		sessionCookie: string;
	}> {
		const tenant = await prisma.tenant.create({
			data: {
				defaultLanguage: "en",
				name: `ssfw-edit-${label}-${randomUUID()}`,
			},
		});
		const user = await prisma.user.create({
			data: {
				email: `ssfw-edit-${label}-${randomUUID()}@example.invalid`,
				uiLocale: "en",
			},
		});
		await prisma.tenantMembership.create({
			data: { tenantId: tenant.id, userId: user.id },
		});
		await provisionIncidentSchema(tenant.id);
		const session = await issueSession(user.id, tenant.id);
		return {
			sessionCookie: session.cookieValue,
			tenantId: tenant.id,
			userId: user.id,
		};
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
			`SELECT shared.apply_incident_soft_delete_schema(${sqlString(schema)}::name)`,
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
			`SELECT shared.apply_incident_action_bridge_schema(${sqlString(
				schema,
			)}::name)`,
		);
		await prisma.$executeRawUnsafe(
			`SELECT shared.apply_incident_cause_branch_status_schema(${sqlString(
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

		// Real incidents always carry a potential outcome + severity (the create
		// and edit forms make them required), and PATCH re-validates that pair.
		await prisma.$executeRawUnsafe(
			`INSERT INTO ${schema}.incident_case (
				id,
				title,
				incident_at,
				incident_type,
				potential_outcome_text,
				potential_severity_code,
				potential_likelihood_code,
				coordinator_role,
				content_language,
				created_by
			) VALUES (
				${sqlString(input.caseId)}::uuid,
				'II editing test',
				'2026-05-05T06:45:00Z'::timestamptz,
				'NEAR_MISS',
				'Worker could have been struck',
				'C',
				'3',
				'Safety lead',
				'en',
				${sqlString(input.userId)}::uuid
			)`,
		);
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

function names(tenantId: string): { role: string; schema: string } {
	const suffix = tenantId.toLowerCase().replaceAll("-", "_");
	return { role: `role_tenant_${suffix}`, schema: `tenant_${suffix}` };
}

function quoteIdent(value: string): string {
	return `"${String(value).replaceAll('"', '""')}"`;
}

function sqlString(value: string): string {
	return `'${String(value).replaceAll("'", "''")}'`;
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith(".") || specifier.startsWith("/");
}

function moduleUrl(relativePath: string): string {
	return pathToFileURL(`${process.cwd()}/${relativePath}`).href;
}
