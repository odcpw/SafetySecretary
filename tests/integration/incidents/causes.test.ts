import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
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
const fixturePath = `${process.cwd()}/tests/fixtures/llm/ii-5whys.json`;
const mutableEnv = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
const originalSeedPath = process.env.SSFW_II_5WHYS_MOCK_SEED_PATH;
const causeMessageKeys = [
	"incident.causes.answer",
	"incident.causes.askNext",
	"incident.causes.continueTitle",
	"incident.causes.deleteNode",
	"incident.causes.description",
	"incident.causes.empty",
	"incident.causes.error.invalidNodeId",
	"incident.causes.error.invalidParent",
	"incident.causes.error.invalidPayload",
	"incident.causes.error.llmFailed",
	"incident.causes.error.saveFailed",
	"incident.causes.markRootCause",
	"incident.causes.question",
	"incident.causes.rootCause",
	"incident.causes.saveNode",
	"incident.causes.startTitle",
	"incident.causes.statement",
	"incident.causes.timelineEvent",
	"incident.causes.timelineEventEmpty",
	"incident.causes.title",
	"incident.causes.treeTitle",
] as const;

mutableEnv.NODE_ENV = "test";
process.env.SSFW_II_5WHYS_MOCK_SEED_PATH = fixturePath;

const { NextRequest } = (await import(
	"next/server.js"
)) as typeof import("next/server");
const causesRoute = (await import(
	moduleUrl("src/app/api/incidents/[id]/causes/route.ts")
)) as typeof import("../../../src/app/api/incidents/[id]/causes/route");
const turnRoute = (await import(
	moduleUrl("src/app/api/incidents/[id]/causes/turn/route.ts")
)) as typeof import("../../../src/app/api/incidents/[id]/causes/turn/route");
const { authorizeRequest } = (await import(
	moduleUrl("src/proxy.ts")
)) as typeof import("../../../src/proxy");
const {
	buildFiveWhysPrompt,
	fiveWhysMockSeedFromFixture,
	generateFiveWhysTurnQuestion,
} = (await import(
	moduleUrl("src/lib/incident/five-whys.ts")
)) as typeof import("../../../src/lib/incident/five-whys");
const { MockProvider } = (await import(
	moduleUrl("src/lib/llm/mock.ts")
)) as typeof import("../../../src/lib/llm/mock");
const { prisma, dropTenantSchema, withTenantConnection } = (await import(
	moduleUrl("src/lib/db/index.ts")
)) as typeof import("../../../src/lib/db");
const { t } = (await import(
	moduleUrl("src/lib/i18n/t.ts")
)) as typeof import("../../../src/lib/i18n/t");
const { LOCALES } = (await import(
	moduleUrl("src/lib/i18n/types.ts")
)) as typeof import("../../../src/lib/i18n/types");

test.after(async () => {
	if (originalNodeEnv === undefined) {
		delete mutableEnv.NODE_ENV;
	} else {
		mutableEnv.NODE_ENV = originalNodeEnv;
	}

	if (originalSeedPath === undefined) {
		delete process.env.SSFW_II_5WHYS_MOCK_SEED_PATH;
	} else {
		process.env.SSFW_II_5WHYS_MOCK_SEED_PATH = originalSeedPath;
	}

	await prisma.$disconnect();
});

test("II causes page labels have DE/EN/FR/IT catalog coverage", () => {
	for (const locale of LOCALES) {
		for (const key of causeMessageKeys) {
			const rendered = t(key, locale);
			assert.notEqual(rendered, key, `${locale}.${key} must resolve`);
			assert.ok(rendered.trim(), `${locale}.${key} must not be empty`);
		}
	}
});

test("II 5-Whys prompt is non-punitive and deterministic through MockProvider", async () => {
	const fixture = readFiveWhysFixture();
	const provider = new MockProvider(fiveWhysMockSeedFromFixture(fixture));
	const first = fixture.entries[0];
	assert.ok(first);

	const prompt = buildFiveWhysPrompt(first);
	assert.match(prompt, /what normally happens/i);
	assert.match(prompt, /what made the safe path hard/i);
	assert.match(prompt, /what went well/i);
	assert.doesNotMatch(prompt, /who is to blame/i);

	for (const entry of fixture.entries) {
		assert.doesNotMatch(
			entry.responseText,
			/careless|human error|operator failed|blame/i,
		);
	}

	const resultA = await generateFiveWhysTurnQuestion(first, {
		dispatchOptions: {
			env: { NODE_ENV: "test" },
			mockProvider: provider,
		},
		incidentId: "33333333-3333-4333-8333-333333333333",
		tenantId: "11111111-1111-4111-8111-111111111111",
		userId: "22222222-2222-4222-8222-222222222222",
	});
	const resultB = await generateFiveWhysTurnQuestion(first, {
		dispatchOptions: {
			env: { NODE_ENV: "test" },
			mockProvider: provider,
		},
		incidentId: "33333333-3333-4333-8333-333333333333",
		tenantId: "11111111-1111-4111-8111-111111111111",
		userId: "22222222-2222-4222-8222-222222222222",
	});

	assert.equal(resultA, first.responseText);
	assert.equal(resultB, first.responseText);
	assert.equal(provider.textInvocationCount, 2);
	assert.equal(provider.visionInvocationCount, 0);
});

test("proxied II causes form posts require the CSRF double-submit token", async () => {
	const session = {
		deviceHint: "desktop" as const,
		expiresAt: new Date("2026-05-30T00:00:00.000Z"),
		id: randomUUID(),
		lastSeenAt: new Date("2026-05-05T00:00:00.000Z"),
		tenantId: "11111111-1111-4111-8111-111111111111",
		userId: "22222222-2222-4222-8222-222222222222",
	};
	const body = new URLSearchParams({ answer: "A system condition" }).toString();
	const url =
		"https://app.example.test/api/incidents/33333333-3333-4333-8333-333333333333/causes/turn";

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

	const csrfToken = "ssfw-d4h-csrf-token";
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
	test("II causes integration", {
		skip: "DATABASE_URL is required",
	}, () => {});
} else {
	test("II 5-Whys turn route creates a tenant-scoped editable cause tree", async () => {
		const tenantA = await seedTenant("a");
		const tenantB = await seedTenant("b");
		const caseId = randomUUID();
		const eventId = randomUUID();
		const fixture = readFiveWhysFixture();

		try {
			await insertIncidentCase({
				caseId,
				tenantId: tenantA.tenantId,
				userId: tenantA.userId,
			});
			await insertTimelineEvent({
				caseId,
				eventId,
				tenantId: tenantA.tenantId,
				text: fixture.entries[0].parentStatement,
			});

			const first = await postTurn({
				answer: fixture.entries[0].userAnswer,
				caseId,
				tenantId: tenantA.tenantId,
				timelineEventId: eventId,
				userId: tenantA.userId,
			});
			await assertStatus(first, 201);
			const firstNode = record(record(await first.json()).node);
			const firstNodeId = stringField(firstNode.id, "first.node.id");
			assert.equal(firstNode.parentId, null);
			assert.equal(firstNode.timelineEventId, eventId);
			assert.equal(firstNode.statement, fixture.entries[0].userAnswer);
			assert.equal(firstNode.question, fixture.entries[0].responseText);

			const second = await postTurn({
				answer: fixture.entries[1].userAnswer,
				caseId,
				parentId: firstNodeId,
				tenantId: tenantA.tenantId,
				userId: tenantA.userId,
			});
			await assertStatus(second, 201);
			const secondNode = record(record(await second.json()).node);
			const secondNodeId = stringField(secondNode.id, "second.node.id");
			assert.equal(secondNode.parentId, firstNodeId);
			assert.equal(secondNode.timelineEventId, eventId);
			assert.equal(secondNode.statement, fixture.entries[1].userAnswer);
			assert.equal(secondNode.question, fixture.entries[1].responseText);

			const third = await postTurn({
				answer: fixture.entries[2].userAnswer,
				caseId,
				parentId: secondNodeId,
				tenantId: tenantA.tenantId,
				userId: tenantA.userId,
			});
			await assertStatus(third, 201);
			const thirdNode = record(record(await third.json()).node);
			const thirdNodeId = stringField(thirdNode.id, "third.node.id");
			assert.equal(thirdNode.parentId, secondNodeId);
			assert.equal(thirdNode.timelineEventId, eventId);
			assert.equal(thirdNode.statement, fixture.entries[2].userAnswer);
			assert.equal(thirdNode.question, fixture.entries[2].responseText);

			const marked = await causesRoute.PATCH(
				request({
					body: {
						isRootCause: true,
						nodeId: thirdNodeId,
						question: thirdNode.question,
						statement: `${thirdNode.statement} Updated`,
					},
					method: "PATCH",
					tenantId: tenantA.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/causes`,
					userId: tenantA.userId,
				}),
				{ params: { id: caseId } },
			);
			await assertStatus(marked, 200);
			const markedNode = record(record(await marked.json()).node);
			assert.equal(markedNode.isRootCause, true);
			assert.equal(
				markedNode.statement,
				`${fixture.entries[2].userAnswer} Updated`,
			);

			const list = await causesRoute.GET(
				request({
					tenantId: tenantA.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/causes`,
					userId: tenantA.userId,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(list.status, 200);
			const nodes = recordArray(record(await list.json()).nodes);
			assert.equal(nodes.length, 3);
			assert.deepEqual(
				nodes.map((node) => record(node).parentId),
				[null, firstNodeId, secondNodeId],
			);

			const crossTenant = await causesRoute.GET(
				request({
					tenantId: tenantB.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/causes`,
					userId: tenantB.userId,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(crossTenant.status, 404);

			const inspected = await inspectCauseNodes(tenantA.tenantId, caseId);
			assert.deepEqual(inspected, {
				nodeCount: 3,
				parentIds: [null, firstNodeId, secondNodeId],
				rootCauseCount: 1,
			});
			console.log(
				`DB inspection II causes: incident_cause_node=${inspected.nodeCount}; root_causes=${inspected.rootCauseCount}`,
			);
		} finally {
			await cleanupTenant(tenantB);
			await cleanupTenant(tenantA);
		}
	});

	test("II 5-Whys turn route saves manually when the coach provider is unavailable", async () => {
		const tenantA = await seedTenant("manual-fallback");
		const caseId = randomUUID();
		const eventId = randomUUID();
		const answer = "The temporary cable crossed the walking route.";

		try {
			await insertIncidentCase({
				caseId,
				tenantId: tenantA.tenantId,
				userId: tenantA.userId,
			});
			await insertTimelineEvent({
				caseId,
				eventId,
				tenantId: tenantA.tenantId,
				text: "Operator tripped while walking to the packing table.",
			});

			const response = await withProviderlessRuntime(() =>
				postTurn({
					answer,
					caseId,
					tenantId: tenantA.tenantId,
					timelineEventId: eventId,
					userId: tenantA.userId,
				}),
			);
			await assertStatus(response, 201);

			const body = record(await response.json());
			assert.equal(body.warning, "CAUSE_COACH_UNAVAILABLE");

			const node = record(body.node);
			assert.equal(node.parentId, null);
			assert.equal(node.timelineEventId, eventId);
			assert.equal(node.statement, answer);
			assert.equal(node.question, null);

			const inspected = await inspectCauseNodes(tenantA.tenantId, caseId);
			assert.deepEqual(inspected, {
				nodeCount: 1,
				parentIds: [null],
				rootCauseCount: 0,
			});
		} finally {
			await cleanupTenant(tenantA);
		}
	});

	test("II causes PATCH beforeId reorders siblings and re-parents into position", async () => {
		const tenant = await seedTenant("reorder");
		const caseId = randomUUID();

		try {
			await insertIncidentCase({
				caseId,
				tenantId: tenant.tenantId,
				userId: tenant.userId,
			});

			const [aId, bId, cId] = [
				await createCause(tenant, caseId, "Cause A"),
				await createCause(tenant, caseId, "Cause B"),
				await createCause(tenant, caseId, "Cause C"),
			];

			// Reorder within the top-level group: move C before A → [C, A, B].
			const reordered = await patchCause(tenant, caseId, {
				beforeId: aId,
				isRootCause: false,
				nodeId: cId,
				statement: "Cause C",
			});
			await assertStatus(reordered, 200);
			const reorderedNode = record(record(await reordered.json()).node);
			assert.equal(reorderedNode.orderIndex, 0);
			assert.equal(reorderedNode.parentId, null);

			const list = await causesRoute.GET(
				request({
					tenantId: tenant.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/causes`,
					userId: tenant.userId,
				}),
				{ params: { id: caseId } },
			);
			await assertStatus(list, 200);
			const listed = recordArray(record(await list.json()).nodes).map(record);
			assert.deepEqual(
				listed.map((node) => node.id),
				[cId, aId, bId],
				"GET must list siblings by order_index",
			);
			assert.deepEqual(
				listed.map((node) => node.orderIndex),
				[0, 1, 2],
			);

			// Re-parent without beforeId appends at the end of the new group.
			const adopted = await patchCause(tenant, caseId, {
				isRootCause: false,
				nodeId: aId,
				parentId: cId,
				statement: "Cause A",
			});
			await assertStatus(adopted, 200);
			assert.equal(record(record(await adopted.json()).node).orderIndex, 0);

			// Re-parent with beforeId lands before the named sibling → C: [B, A].
			const inserted = await patchCause(tenant, caseId, {
				beforeId: aId,
				isRootCause: false,
				nodeId: bId,
				parentId: cId,
				statement: "Cause B",
			});
			await assertStatus(inserted, 200);
			assert.equal(record(record(await inserted.json()).node).orderIndex, 0);

			assert.deepEqual(await causePositions(tenant.tenantId, caseId), {
				[aId]: { orderIndex: 1, parentId: cId },
				[bId]: { orderIndex: 0, parentId: cId },
				[cId]: { orderIndex: 0, parentId: null },
			});

			// beforeId outside the destination sibling group is rejected.
			const wrongGroup = await patchCause(tenant, caseId, {
				beforeId: aId,
				isRootCause: false,
				nodeId: cId,
				statement: "Cause C",
			});
			await assertStatus(wrongGroup, 400);
			assert.deepEqual(await wrongGroup.json(), {
				code: "INVALID_CAUSE_BEFORE",
			});

			// Unknown beforeId is rejected and leaves the tree untouched.
			const unknownBefore = await patchCause(tenant, caseId, {
				beforeId: randomUUID(),
				isRootCause: false,
				nodeId: bId,
				statement: "Cause B",
			});
			await assertStatus(unknownBefore, 400);
			assert.deepEqual(await unknownBefore.json(), {
				code: "INVALID_CAUSE_BEFORE",
			});
			assert.deepEqual(await causePositions(tenant.tenantId, caseId), {
				[aId]: { orderIndex: 1, parentId: cId },
				[bId]: { orderIndex: 0, parentId: cId },
				[cId]: { orderIndex: 0, parentId: null },
			});
		} finally {
			await cleanupTenant(tenant);
		}
	});

	async function createCause(
		tenant: { tenantId: string; userId: string },
		caseId: string,
		statement: string,
	): Promise<string> {
		const response = await causesRoute.POST(
			request({
				body: { statement },
				method: "POST",
				tenantId: tenant.tenantId,
				url: `https://app.example.test/api/incidents/${caseId}/causes`,
				userId: tenant.userId,
			}),
			{ params: { id: caseId } },
		);
		await assertStatus(response, 201);
		return stringField(
			record(record(await response.json()).node).id,
			"created.node.id",
		);
	}

	async function patchCause(
		tenant: { tenantId: string; userId: string },
		caseId: string,
		body: Record<string, unknown>,
	): Promise<Response> {
		return causesRoute.PATCH(
			request({
				body,
				method: "PATCH",
				tenantId: tenant.tenantId,
				url: `https://app.example.test/api/incidents/${caseId}/causes`,
				userId: tenant.userId,
			}),
			{ params: { id: caseId } },
		);
	}

	async function causePositions(
		tenantId: string,
		caseId: string,
	): Promise<
		Record<string, { orderIndex: number; parentId: string | null }>
	> {
		return withTenantConnection(tenantId, async (tx) => {
			const rows = await tx.$queryRaw<
				Array<{ id: string; orderIndex: number; parentId: string | null }>
			>`
				SELECT
					id::text AS id,
					order_index AS "orderIndex",
					parent_id::text AS "parentId"
				FROM incident_cause_node
				WHERE case_id = ${caseId}::uuid
			`;

			return Object.fromEntries(
				rows.map((row) => [
					row.id,
					{ orderIndex: row.orderIndex, parentId: row.parentId },
				]),
			);
		});
	}

	async function postTurn(input: {
		answer: string;
		caseId: string;
		parentId?: string;
		tenantId: string;
		timelineEventId?: string;
		userId: string;
	}): Promise<Response> {
		return turnRoute.POST(
			request({
				body: {
					answer: input.answer,
					parentId: input.parentId,
					timelineEventId: input.timelineEventId,
				},
				method: "POST",
				tenantId: input.tenantId,
				url: `https://app.example.test/api/incidents/${input.caseId}/causes/turn`,
				userId: input.userId,
			}),
			{ params: { id: input.caseId } },
		);
	}

	async function withProviderlessRuntime<T>(run: () => Promise<T>): Promise<T> {
		const keys = [
			"NODE_ENV",
			"SSFW_II_5WHYS_MOCK_SEED_PATH",
			"OPENAI_API_KEY",
			"LLM_BASE_URL",
			"LLM_API_KEY",
			"LLM_TEXT_MODEL",
			"LLM_VISION_MODEL",
		] as const;
		const previous = new Map(
			keys.map((key) => [key, mutableEnv[key]] as const),
		);

		try {
			mutableEnv.NODE_ENV = "development";
			for (const key of keys) {
				if (key !== "NODE_ENV") {
					delete mutableEnv[key];
				}
			}

			return await run();
		} finally {
			for (const [key, value] of previous) {
				if (value === undefined) {
					delete mutableEnv[key];
				} else {
					mutableEnv[key] = value;
				}
			}
		}
	}

	async function seedTenant(label: string): Promise<{
		tenantId: string;
		userId: string;
	}> {
		const tenant = await prisma.tenant.create({
			data: {
				defaultLanguage: "en",
				name: `ssfw-d4h-${label}-${randomUUID()}`,
			},
		});
		const user = await prisma.user.create({
			data: {
				email: `ssfw-d4h-${label}-${randomUUID()}@example.invalid`,
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
				'II causes test',
				'2026-05-05T06:45:00Z'::timestamptz,
				'NEAR_MISS',
				'Safety lead',
				'en',
				${sqlString(input.userId)}::uuid
			)`,
		);
	}

	async function insertTimelineEvent(input: {
		caseId: string;
		eventId: string;
		tenantId: string;
		text: string;
	}): Promise<void> {
		const schema = quoteIdent(names(input.tenantId).schema);

		await prisma.$executeRawUnsafe(
			`INSERT INTO ${schema}.incident_timeline_event (
				id,
				case_id,
				order_index,
				event_at,
				time_label,
				text,
				confidence
			) VALUES (
				${sqlString(input.eventId)}::uuid,
				${sqlString(input.caseId)}::uuid,
				0,
				'2026-05-05T07:10:00Z'::timestamptz,
				'Before stop',
				${sqlString(input.text)},
				'LIKELY'
			)`,
		);
	}

	async function inspectCauseNodes(
		tenantId: string,
		caseId: string,
	): Promise<{
		nodeCount: number;
		parentIds: Array<string | null>;
		rootCauseCount: number;
	}> {
		return withTenantConnection(tenantId, async (tx) => {
			const nodes = await tx.$queryRaw<
				Array<{ parentId: string | null; isRootCause: boolean }>
			>`
				SELECT
					parent_id::text AS "parentId",
					is_root_cause AS "isRootCause"
				FROM incident_cause_node
				WHERE case_id = ${caseId}::uuid
				ORDER BY order_index ASC, created_at ASC, id ASC
			`;

			return {
				nodeCount: nodes.length,
				parentIds: nodes.map((node) => node.parentId),
				rootCauseCount: nodes.filter((node) => node.isRootCause).length,
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
}

function readFiveWhysFixture() {
	try {
		return JSON.parse(readFileSync(fixturePath, "utf8")) as {
			entries: Array<{
				locale: "en";
				parentKind: "timeline_event" | "cause_node";
				parentStatement: string;
				responseText: string;
				userAnswer: string;
			}>;
		};
	} catch (error) {
		throw new Error(`Invalid II 5-Whys fixture at ${fixturePath}`, {
			cause: error,
		});
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
