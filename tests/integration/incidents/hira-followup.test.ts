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

if (!databaseUrl) {
	test("II HIRA-followup placeholder integration", {
		skip: "DATABASE_URL is required",
	}, () => {});
} else {
	const { NextRequest } = (await import(
		"next/server.js"
	)) as typeof import("next/server");
	const route = (await import(
		moduleUrl("src/app/api/incidents/[id]/hira-followup/route.ts")
	)) as typeof import("../../../src/app/api/incidents/[id]/hira-followup/route");
	const { prisma, dropTenantSchema, withTenantConnection } = (await import(
		moduleUrl("src/lib/db/index.ts")
	)) as typeof import("../../../src/lib/db");
	const { issueSession } = (await import(
		moduleUrl("src/lib/auth/session.ts")
	)) as typeof import("../../../src/lib/auth/session");
	const { mintCsrfToken } = (await import(
		moduleUrl("src/lib/auth/csrf.ts")
	)) as typeof import("../../../src/lib/auth/csrf");
	const { serialiseWorkflow } = (await import(
		moduleUrl("src/lib/incident/serialise.ts")
	)) as typeof import("../../../src/lib/incident/serialise");

	test("HIRA-followup route writes placeholder fields and serialises them", async () => {
		const tenantA = await seedTenant("a");
		const tenantB = await seedTenant("b");
		const caseId = randomUUID();

		try {
			await insertIncidentCase({
				caseId,
				tenantId: tenantA.tenantId,
				userId: tenantA.userId,
			});

			const initial = await route.GET(
				request({
					sessionCookie: tenantA.sessionCookie,
					tenantId: tenantA.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/hira-followup`,
					userId: tenantA.userId,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(initial.status, 200);
			assert.deepEqual(pickFollowupFields(await initial.json()), {
				hiraFollowupNeeded: false,
				hiraFollowupText: null,
			});

			const crossTenant = await route.GET(
				request({
					sessionCookie: tenantB.sessionCookie,
					tenantId: tenantB.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/hira-followup`,
					userId: tenantB.userId,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(crossTenant.status, 404);

			const saved = await route.POST(
				request({
					body: {
						hiraFollowupNeeded: true,
						hiraFollowupText: "Review pallet movement HIRA.",
					},
					method: "POST",
					sessionCookie: tenantA.sessionCookie,
					tenantId: tenantA.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/hira-followup`,
					userId: tenantA.userId,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(saved.status, 200);
			assert.deepEqual(pickFollowupFields(await saved.json()), {
				hiraFollowupNeeded: true,
				hiraFollowupText: "Review pallet movement HIRA.",
			});

			const row = await inspectFollowup(tenantA.tenantId, caseId);
			assert.deepEqual(row, {
				hiraFollowupNeeded: true,
				hiraFollowupText: "Review pallet movement HIRA.",
			});
			console.log(
				`DB inspection HIRA follow-up on: incident_case.hira_followup_needed=${row.hiraFollowupNeeded}; incident_case.hira_followup_text=${row.hiraFollowupText}`,
			);

			const serialised = await serialiseWorkflow("II", caseId, {
				tenantId: tenantA.tenantId,
			});
			assert.equal(record(serialised.case).hiraFollowupNeeded, true);
			assert.equal(
				record(serialised.case).hiraFollowupText,
				"Review pallet movement HIRA.",
			);

			const cleared = await route.PATCH(
				request({
					body: {
						hiraFollowupNeeded: false,
						hiraFollowupText: "This text must be cleared.",
					},
					method: "PATCH",
					sessionCookie: tenantA.sessionCookie,
					tenantId: tenantA.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/hira-followup`,
					userId: tenantA.userId,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(cleared.status, 200);
			assert.deepEqual(pickFollowupFields(await cleared.json()), {
				hiraFollowupNeeded: false,
				hiraFollowupText: null,
			});
			console.log(
				"DB inspection HIRA follow-up off: incident_case.hira_followup_needed=false; incident_case.hira_followup_text=null",
			);
		} finally {
			await cleanupTenant(tenantB);
			await cleanupTenant(tenantA);
		}
	});

	test.after(async () => {
		await prisma.$disconnect();
	});

	async function seedTenant(label: string): Promise<{
		sessionCookie: string;
		tenantId: string;
		userId: string;
	}> {
		const tenant = await prisma.tenant.create({
			data: {
				defaultLanguage: "en",
				name: `ssfw-bp4-${label}-${randomUUID()}`,
			},
		});
		const user = await prisma.user.create({
			data: {
				email: `ssfw-bp4-${label}-${randomUUID()}@example.invalid`,
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
				'II HIRA follow-up test',
				'2026-05-05T06:30:00Z'::timestamptz,
				'NEAR_MISS',
				'Safety lead',
				'en',
				${sqlString(input.userId)}::uuid
			)`,
		);
	}

	async function inspectFollowup(
		tenantId: string,
		caseId: string,
	): Promise<{
		hiraFollowupNeeded: boolean;
		hiraFollowupText: string | null;
	}> {
		const rows = await withTenantConnection(
			tenantId,
			async (tx) =>
				tx.$queryRaw<
					Array<{
						hiraFollowupNeeded: boolean;
						hiraFollowupText: string | null;
					}>
				>`
				SELECT
					hira_followup_needed AS "hiraFollowupNeeded",
					hira_followup_text AS "hiraFollowupText"
				FROM incident_case
				WHERE id = ${caseId}::uuid
			`,
		);

		assert.equal(rows.length, 1);
		return rows[0] as {
			hiraFollowupNeeded: boolean;
			hiraFollowupText: string | null;
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
		await prisma.tenant.deleteMany({ where: { id: input.tenantId } });
		await prisma.user.deleteMany({ where: { id: input.userId } });
	}

	function request(input: {
		body?: Record<string, unknown>;
		method?: string;
		sessionCookie: string;
		tenantId: string;
		url: string;
		userId: string;
	}) {
		const csrf = mintCsrfToken(input.sessionCookie);
		return new NextRequest(input.url, {
			body: input.body ? JSON.stringify(input.body) : undefined,
			headers: {
				cookie: `ssfw_session=${input.sessionCookie}; ssfw_csrf=${csrf}`,
				"content-type": "application/json",
				"x-ssfw-csrf": csrf,
			},
			method: input.method ?? "GET",
		});
	}
}

function pickFollowupFields(payload: unknown): {
	hiraFollowupNeeded: boolean;
	hiraFollowupText: string | null;
} {
	const followup = record(record(payload).followup);
	return {
		hiraFollowupNeeded: Boolean(followup.hiraFollowupNeeded),
		hiraFollowupText:
			typeof followup.hiraFollowupText === "string"
				? followup.hiraFollowupText
				: null,
	};
}

function record(value: unknown): Record<string, unknown> {
	assert.ok(value && typeof value === "object" && !Array.isArray(value));
	return value as Record<string, unknown>;
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

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith(".") || specifier.startsWith("/");
}

function moduleUrl(relativePath: string): string {
	return pathToFileURL(`${process.cwd()}/${relativePath}`).href;
}
