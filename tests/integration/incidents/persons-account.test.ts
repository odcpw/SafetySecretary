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
	test("II persons/accounts integration", {
		skip: "DATABASE_URL is required",
	}, () => {});
} else {
	const { NextRequest } = (await import(
		"next/server.js"
	)) as typeof import("next/server");
	const personsRoute = (await import(
		moduleUrl("src/app/api/incidents/[id]/persons/route.ts")
	)) as typeof import("../../../src/app/api/incidents/[id]/persons/route");
	const accountRoute = (await import(
		moduleUrl("src/app/api/incidents/[id]/persons/[personId]/account/route.ts")
	)) as typeof import("../../../src/app/api/incidents/[id]/persons/[personId]/account/route");
	const { prisma, dropTenantSchema, withTenantConnection } = (await import(
		moduleUrl("src/lib/db/index.ts")
	)) as typeof import("../../../src/lib/db");
	const { serialiseWorkflow } = (await import(
		moduleUrl("src/lib/incident/serialise.ts")
	)) as typeof import("../../../src/lib/incident/serialise");

	test("persons CRUD and account facts stay tenant-scoped", async () => {
		const tenantA = await seedTenant("a");
		const tenantB = await seedTenant("b");
		const caseId = randomUUID();

		try {
			await insertIncidentCase({
				caseId,
				tenantId: tenantA.tenantId,
				userId: tenantA.userId,
			});

			const empty = await personsRoute.GET(
				request({
					tenantId: tenantA.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/persons`,
					userId: tenantA.userId,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(empty.status, 200);
			assert.deepEqual(personList(await empty.json()), []);

			const created = await personsRoute.POST(
				request({
					body: {
						name: "Anna Witness",
						otherInfo: "Saw the guard open.",
						role: "witness",
					},
					method: "POST",
					tenantId: tenantA.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/persons`,
					userId: tenantA.userId,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(created.status, 201);
			const createdPerson = record(record(await created.json()).person);
			const personId = stringField(createdPerson.id, "person.id");
			assert.equal(createdPerson.role, "witness");
			assert.equal(createdPerson.name, "Anna Witness");

			const invalidPersonForm = await personsRoute.POST(
				formRequest({
					body: {
						name: "",
						otherInfo: "",
						role: "witness",
					},
					method: "POST",
					tenantId: tenantA.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/persons`,
					userId: tenantA.userId,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(invalidPersonForm.status, 303);
			assert.match(
				invalidPersonForm.headers.get("location") ?? "",
				/\/incidents\/[0-9a-f-]+\/persons\?error=INVALID_PERSON_PAYLOAD$/,
			);

			const crossTenant = await personsRoute.GET(
				request({
					tenantId: tenantB.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/persons`,
					userId: tenantB.userId,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(crossTenant.status, 404);

			const updated = await personsRoute.PATCH(
				request({
					body: {
						name: "Anna Updated",
						otherInfo: "Interviewed twice.",
						personId,
						role: "coordinator",
					},
					method: "PATCH",
					tenantId: tenantA.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/persons`,
					userId: tenantA.userId,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(updated.status, 200);
			assert.equal(
				record(record(await updated.json()).person).role,
				"coordinator",
			);

			const savedAccount = await accountRoute.POST(
				request({
					body: {
						facts: [{ text: "Guard was open." }, { text: "Line was running." }],
						personalEvents: [
							{
								eventAt: "2026-05-05T05:55:00.000Z",
								text: "Walked to the machine.",
								timeLabel: "Before event",
							},
						],
						rawStatement: "I saw the guard open while the line was running.",
					},
					method: "POST",
					tenantId: tenantA.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/persons/${personId}/account`,
					userId: tenantA.userId,
				}),
				{ params: { id: caseId, personId } },
			);
			assert.equal(savedAccount.status, 200);
			const accountPayload = record(record(await savedAccount.json()).account);
			assert.equal(
				record(accountPayload.account).rawStatement,
				"I saw the guard open while the line was running.",
			);
			assert.deepEqual(
				recordArray(accountPayload.facts).map((fact) =>
					stringField(record(fact).text, "fact.text"),
				),
				["Guard was open.", "Line was running."],
			);
			assert.equal(recordArray(accountPayload.personalEvents).length, 1);

			const invalidAccountForm = await accountRoute.POST(
				formRequest({
					body: {
						factsJson: "[{",
						personalEventsJson: "[]",
						rawStatement: "Malformed facts JSON.",
					},
					method: "POST",
					tenantId: tenantA.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/persons/${personId}/account`,
					userId: tenantA.userId,
				}),
				{ params: { id: caseId, personId } },
			);
			assert.equal(invalidAccountForm.status, 303);
			assert.match(
				invalidAccountForm.headers.get("location") ?? "",
				/\/incidents\/[0-9a-f-]+\/persons\/[0-9a-f-]+\/account\?error=INVALID_ACCOUNT_PAYLOAD$/,
			);

			const inspected = await inspectPersonsAndAccount(
				tenantA.tenantId,
				caseId,
			);
			assert.deepEqual(inspected, {
				accountCount: 1,
				factTexts: ["Guard was open.", "Line was running."],
				personCount: 1,
				personNames: ["Anna Updated"],
			});
			console.log(
				`DB inspection II persons/account: incident_person=${inspected.personCount}; incident_account=${inspected.accountCount}; incident_fact=${inspected.factTexts.length}`,
			);

			const serialised = await serialiseWorkflow("II", caseId, {
				tenantId: tenantA.tenantId,
			});
			assert.equal(recordArray(record(serialised).persons).length, 1);
			const accounts = recordArray(record(serialised).accounts);
			assert.equal(accounts.length, 1);
			assert.deepEqual(
				recordArray(record(accounts[0]).facts).map((fact) =>
					stringField(record(fact).text, "serialised.fact.text"),
				),
				["Guard was open.", "Line was running."],
			);

			const deleted = await personsRoute.DELETE(
				request({
					body: { personId },
					method: "DELETE",
					tenantId: tenantA.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/persons`,
					userId: tenantA.userId,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(deleted.status, 200);
			assert.deepEqual(
				await inspectPersonsAndAccount(tenantA.tenantId, caseId),
				{
					accountCount: 0,
					factTexts: [],
					personCount: 0,
					personNames: [],
				},
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
		tenantId: string;
		userId: string;
	}> {
		const tenant = await prisma.tenant.create({
			data: {
				defaultLanguage: "en",
				name: `ssfw-6kk-${label}-${randomUUID()}`,
			},
		});
		const user = await prisma.user.create({
			data: {
				email: `ssfw-6kk-${label}-${randomUUID()}@example.invalid`,
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
				'II persons test',
				'2026-05-05T06:45:00Z'::timestamptz,
				'NEAR_MISS',
				'Safety lead',
				'en',
				${sqlString(input.userId)}::uuid
			)`,
		);
	}

	async function inspectPersonsAndAccount(
		tenantId: string,
		caseId: string,
	): Promise<{
		accountCount: number;
		factTexts: string[];
		personCount: number;
		personNames: string[];
	}> {
		return withTenantConnection(tenantId, async (tx) => {
			const [persons, accounts, facts] = await Promise.all([
				tx.$queryRaw<Array<{ name: string | null }>>`
					SELECT name
					FROM incident_person
					WHERE case_id = ${caseId}::uuid
					ORDER BY created_at ASC, id ASC
				`,
				tx.$queryRaw<Array<{ id: string }>>`
					SELECT id::text AS id
					FROM incident_account
					WHERE case_id = ${caseId}::uuid
				`,
				tx.$queryRaw<Array<{ text: string }>>`
					SELECT fact.text
					FROM incident_fact fact
					JOIN incident_account account ON account.id = fact.account_id
					WHERE account.case_id = ${caseId}::uuid
					ORDER BY fact.order_index ASC, fact.id ASC
				`,
			]);

			return {
				accountCount: accounts.length,
				factTexts: facts.map((fact) => fact.text),
				personCount: persons.length,
				personNames: persons
					.map((person) => person.name)
					.filter((name): name is string => typeof name === "string"),
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
			body: new URLSearchParams(input.body),
			headers: {
				accept: "text/html",
				"content-type": "application/x-www-form-urlencoded",
				"x-ssfw-tenant-id": input.tenantId,
				"x-ssfw-user-id": input.userId,
			},
			method: input.method ?? "POST",
		});
	}
}

function personList(payload: unknown): unknown[] {
	return recordArray(record(payload).persons);
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
