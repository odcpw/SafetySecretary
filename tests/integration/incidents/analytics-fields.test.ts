import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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
assert.ok(databaseUrl, "DATABASE_URL is required for II analytics field tests");

const { NextRequest } = (await import("next/server.js")) as typeof import("next/server");
const incidentsRoute = (await import(
	moduleUrl("src/app/api/incidents/route.ts")
)) as typeof import("../../../src/app/api/incidents/route");
const incidentRoute = (await import(
	moduleUrl("src/app/api/incidents/[id]/route.ts")
)) as typeof import("../../../src/app/api/incidents/[id]/route");
const { prisma, dropTenantSchema } = (await import(
	moduleUrl("src/lib/db/index.ts")
)) as typeof import("../../../src/lib/db");

test("II analytics fields persist, derive severity, and expose queryable KPI inputs", async () => {
	ensureMigrated();
	const tenant = await seedTenant("analytics");
	let incidentId = "";

	try {
		const missingPotentialSeverity = await incidentsRoute.POST(
			request({
				body: validPayload({ potentialSeverityCode: "" }),
				tenantId: tenant.tenantId,
				userId: tenant.userId,
				url: "https://app.example.test/api/incidents",
			}),
		);
		assert.equal(missingPotentialSeverity.status, 400);
		assert.equal(
			record(await missingPotentialSeverity.json()).code,
			"INVALID_INCIDENT_PAYLOAD",
		);

		const created = await incidentsRoute.POST(
			request({
				body: validPayload({
					actualInjuryOutcome: "LOST_TIME",
					potentialLikelihoodCode: "",
				}),
				tenantId: tenant.tenantId,
				userId: tenant.userId,
				url: "https://app.example.test/api/incidents",
			}),
		);
		assert.equal(created.status, 201);
		const createdIncident = record(record(await created.json()).incident);
		incidentId = String(createdIncident.id);
		assert.equal(createdIncident.actualSeverityCode, "C");
		assert.equal(createdIncident.potentialSeverityCode, "A");
		assert.equal(createdIncident.potentialLikelihoodCode, null);
		assert.equal(createdIncident.potentialRiskBand, null);

		const updated = await incidentRoute.PATCH(
			request({
				body: validPayload({
					actualInjuryOutcome: "LOST_TIME",
					actualSeverityCode: "B",
					actualSeverityReason:
						"Potential permanent impairment was judged credible after review.",
					potentialLikelihoodCode: "2",
				}),
				method: "PATCH",
				tenantId: tenant.tenantId,
				userId: tenant.userId,
				url: `https://app.example.test/api/incidents/${incidentId}`,
			}),
			{ params: { id: incidentId } },
		);
		assert.equal(updated.status, 200);
		const updatedIncident = record(record(await updated.json()).incident);
		assert.equal(updatedIncident.actualSeverityCode, "B");
		assert.equal(
			updatedIncident.actualSeverityReason,
			"Potential permanent impairment was judged credible after review.",
		);

		await seedCauseActions(tenant.tenantId, incidentId);
		const row = await inspectAnalytics(tenant.tenantId, incidentId);

		assert.deepEqual(row, {
			actionsClosedCount: 1,
			actionsOpenCount: 1,
			actualOutcome: "LOST_TIME",
			actualSeverityCode: "B",
			bodyPart: "Left hand",
			controlFailure: "NOT_USED",
			dayOfWeek: 2,
			eventType: "SLIP_TRIP_FALL",
			immediateCause: "Cable crossed the access route.",
			incidentType: "ACCIDENT",
			investigationDoneFlag: true,
			isoWeek: 19,
			month: 5,
			potentialSeverityCode: "A",
			ppeNonComplianceFlag: true,
			processInvolved: "Outbound pallet staging",
			workType: "LOGISTICS",
			year: 2026,
		});
		console.log(
			`DB inspection II analytics fields: ${JSON.stringify(row)}; incident_id=${incidentId}`,
		);
	} finally {
		await cleanupTenant(tenant);
	}
});

test.after(async () => {
	await prisma.$disconnect();
});

function validPayload(
	overrides: Record<string, unknown> = {},
): Record<string, unknown> {
	return {
		actualInjuryOutcome: "FIRST_AID",
		areaText: "Dock 3",
		bodyPart: "Left hand",
		contentLanguage: "en",
		contractorFlag: "false",
		controlFailure: "NOT_USED",
		contributingCauses: [
			"Cable routing was temporary.",
			"Walkway inspection did not catch the cable.",
		],
		coordinatorName: "Claire Coordinator",
		coordinatorRole: "Safety lead",
		departmentText: "Packing",
		eventType: "SLIP_TRIP_FALL",
		hazardCategoryCode: "FALLS",
		immediateCause: "Cable crossed the access route.",
		incidentAt: "2026-05-05T07:10",
		incidentTimeZone: "europe/zurich",
		incidentType: "ACCIDENT",
		injuryNature: "Bruise",
		location: "Line 2 packing area",
		lostDays: "2",
		potentialOutcomeText: "A worker could have suffered fatal head trauma.",
		potentialSeverityCode: "A",
		processInvolved: "Outbound pallet staging",
		ppeRequired: ["safety shoes", "cut-resistant gloves"],
		ppeWorn: ["safety shoes"],
		reportableUvg: "false",
		timeInRoleBand: "1-3Y",
		title: "Cable trip during pallet staging",
		workActivity: "Moving pallet jack to outbound lane",
		workType: "LOGISTICS",
		...overrides,
	};
}

async function seedTenant(label: string): Promise<{
	tenantId: string;
	userId: string;
}> {
	const suffix = randomUUID();
	const tenant = await prisma.tenant.create({
		data: {
			defaultLanguage: "en",
			name: `ssfw-yjd-${label}-${suffix}`,
		},
	});
	const user = await prisma.user.create({
		data: {
			email: `ssfw-yjd-${label}-${suffix}@example.invalid`,
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
}

async function seedCauseActions(
	tenantId: string,
	incidentId: string,
): Promise<void> {
	const schema = quoteIdent(names(tenantId).schema);
	const rootCauseId = randomUUID();
	await prisma.$executeRawUnsafe(
		`UPDATE ${schema}.incident_case SET workflow_stage = 'ACTIONS' WHERE id = ${sqlString(
			incidentId,
		)}::uuid`,
	);
	await prisma.$executeRawUnsafe(
		`INSERT INTO ${schema}.incident_cause_node (id, case_id, order_index, statement, question)
		 VALUES (${sqlString(rootCauseId)}::uuid, ${sqlString(
				incidentId,
			)}::uuid, 1, 'Cable crossed the walking route.', 'Why was the cable there?')`,
	);
	await prisma.$executeRawUnsafe(
		`INSERT INTO ${schema}.incident_cause_action (id, cause_node_id, order_index, description, owner_role, action_type, status)
		 VALUES
		 (${sqlString(randomUUID())}::uuid, ${sqlString(
				rootCauseId,
			)}::uuid, 1, 'Reroute the temporary cable overhead.', 'Maintenance', 'TECHNICAL', 'OPEN'),
		 (${sqlString(randomUUID())}::uuid, ${sqlString(
				rootCauseId,
			)}::uuid, 2, 'Brief the shift on temporary cable routing.', 'Supervisor', 'ORGANIZATIONAL', 'COMPLETE')`,
	);
}

async function inspectAnalytics(
	tenantId: string,
	incidentId: string,
): Promise<Record<string, unknown>> {
	const schema = quoteIdent(names(tenantId).schema);
	const [row] = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
		`SELECT
			year,
			month,
			iso_week AS "isoWeek",
			day_of_week AS "dayOfWeek",
			ppe_non_compliance_flag AS "ppeNonComplianceFlag",
			investigation_done_flag AS "investigationDoneFlag",
			actions_open_count AS "actionsOpenCount",
			actions_closed_count AS "actionsClosedCount",
			incident_type AS "incidentType",
			event_type AS "eventType",
			work_type AS "workType",
			process_involved AS "processInvolved",
			body_part AS "bodyPart",
			actual_outcome AS "actualOutcome",
			actual_severity_code AS "actualSeverityCode",
			potential_severity_code AS "potentialSeverityCode",
			immediate_cause AS "immediateCause",
			control_failure AS "controlFailure"
		FROM ${schema}.incident_case_analytics
		WHERE id = ${sqlString(incidentId)}::uuid`,
	);

	return {
		...row,
		actionsClosedCount: Number(row?.actionsClosedCount ?? 0),
		actionsOpenCount: Number(row?.actionsOpenCount ?? 0),
	};
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
	await prisma.userAcknowledgement.deleteMany({ where: { userId: input.userId } });
	await prisma.tenant.deleteMany({ where: { id: input.tenantId } });
	await prisma.user.deleteMany({ where: { id: input.userId } });
}

function request(input: {
	body?: Record<string, unknown>;
	method?: string;
	tenantId: string;
	url: string;
	userId: string;
}): InstanceType<typeof NextRequest> {
	return new NextRequest(input.url, {
		body: input.body ? JSON.stringify(input.body) : undefined,
		headers: {
			"content-type": "application/json",
			"x-ssfw-tenant-id": input.tenantId,
			"x-ssfw-user-id": input.userId,
		},
		method: input.method ?? "POST",
	});
}

let migrated = false;

function ensureMigrated(): void {
	if (migrated) {
		return;
	}

	const result = spawnSync("pnpm", ["db:migrate"], {
		cwd: process.cwd(),
		encoding: "utf8",
		env: { ...process.env, DATABASE_URL: databaseUrl },
	});
	assert.equal(
		result.status,
		0,
		`pnpm db:migrate failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
	);
	migrated = true;
}

function names(tenantId: string): {
	role: string;
	schema: string;
} {
	const compact = tenantId.replaceAll("-", "_");
	return {
		role: `role_tenant_${compact}`,
		schema: `tenant_${compact}`,
	};
}

function quoteIdent(value: string): string {
	return `"${value.replaceAll('"', '""')}"`;
}

function sqlString(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}

function record(value: unknown): Record<string, unknown> {
	assert.equal(typeof value, "object");
	assert.notEqual(value, null);
	return value as Record<string, unknown>;
}

function isLocalImport(specifier: string): boolean {
	return (
		specifier.startsWith(".") ||
		specifier.startsWith("/") ||
		specifier.startsWith("src/")
	);
}

function moduleUrl(relativePath: string): string {
	return pathToFileURL(`${process.cwd()}/${relativePath}`).href;
}
