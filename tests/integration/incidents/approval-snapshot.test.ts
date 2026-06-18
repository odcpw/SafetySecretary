import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire, registerHooks } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import type { PrismaClient } from "@prisma/client";

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

type SnapshotInspectionRow = {
	id: string;
	versionLabel: string;
	workflowData: Record<string, unknown>;
	artifactRefs: unknown;
	attachmentRefs: unknown;
};

type ArtifactInspectionRow = {
	id: string;
	isSnapshotLinked: boolean;
};

const databaseUrl = process.env.DATABASE_URL;
const requireFromTest = createRequire(import.meta.url);
let migrated = false;
let vectorShimInstalled = false;

test("approval page submit path reads and sends the server-bound CSRF token", async () => {
	const { JSDOM } = requireFromTest("jsdom") as {
		JSDOM: new (
			html: string,
			options: { runScripts: "dangerously"; url: string },
		) => TestDom;
	};
	const caseId = "00000000-0000-4000-8000-000000000001";
	const script = approvalFormScriptFromPageSource();
	const dom = new JSDOM(
		`<!doctype html>
		<html>
			<body>
				<form
					action="/api/incidents/${caseId}/approve"
					data-csrf-cookie="ssfw_csrf"
					data-no-redirect="true"
					data-ssfw-approval-form="true"
					data-success-url="/incidents/${caseId}/approval"
					method="post"
				>
					<button type="submit">Approve</button>
					<p data-ssfw-approval-status hidden></p>
				</form>
				<script>${script}</script>
			</body>
		</html>`,
		{
			runScripts: "dangerously",
			url: `https://app.example.test/incidents/${caseId}/approval`,
		},
	);
	const fetchCalls: FetchCall[] = [];

	// The CSRF token is now server-minted and read-only on the client, so seed
	// the cookie the proxy would have issued; the script must read and echo it.
	const seededCsrf = "server-bound-approval-csrf";
	dom.window.document.cookie = `ssfw_csrf=${seededCsrf}; Path=/`;
	dom.window.fetch = (async (input, init) => {
		fetchCalls.push({ init, input });
		return new Response(JSON.stringify({ snapshot: { versionLabel: "v03" } }), {
			headers: { "content-type": "application/json" },
			status: 201,
		});
	}) as typeof dom.window.fetch;

	const form = dom.window.document.querySelector("form");
	assert.ok(form);
	form.dispatchEvent(
		new dom.window.Event("submit", { bubbles: true, cancelable: true }),
	);

	await waitFor(() => fetchCalls.length === 1);

	const [call] = fetchCalls;
	assert.ok(call);
	assert.equal(
		String(call.input),
		`https://app.example.test/api/incidents/${caseId}/approve`,
	);
	assert.equal(call.init?.method, "POST");
	assert.equal(call.init?.credentials, "same-origin");
	const csrfCookieValue = cookieValue(dom.window.document.cookie, "ssfw_csrf");
	assert.equal(csrfCookieValue, seededCsrf, "page should not mint a CSRF cookie");
	assert.equal(
		new Headers(call.init?.headers).get("x-ssfw-csrf"),
		seededCsrf,
	);

	dom.window.close();
});

if (!databaseUrl) {
	test("II approval snapshot route integration", {
		skip: "DATABASE_URL is required",
	}, () => {});
} else {
	const { NextRequest } = (await import(
		"next/server.js"
	)) as typeof import("next/server");
	const approveRoute = (await import(
		moduleUrl("src/app/api/incidents/[id]/approve/route.ts")
	)) as typeof import("../../../src/app/api/incidents/[id]/approve/route");
	const { LocalFsStorage } = (await import(
		moduleUrl("src/lib/storage/index.ts")
	)) as typeof import("../../../src/lib/storage");
	const { serialiseWorkflow } = (await import(
		moduleUrl("src/lib/incident/serialise.ts")
	)) as typeof import("../../../src/lib/incident/serialise");
	const { dropTenantSchema, prisma } = (await import(
		moduleUrl("src/lib/db/index.ts")
	)) as typeof import("../../../src/lib/db");

	test("approve route snapshots II tree, refs, immutability, and retained photos", async () => {
		await ensureMigrated(prisma);

		const tenantId = randomUUID();
		const userId = randomUUID();
		const caseId = randomUUID();
		const personId = randomUUID();
		const accountId = randomUUID();
		const factId = randomUUID();
		const personalEventId = randomUUID();
		const timelineEventId = randomUUID();
		const timelineSourceId = randomUUID();
		const deviationId = randomUUID();
		const attachmentId = randomUUID();
		const rootCauseId = randomUUID();
		const childCauseId = randomUUID();
		const actionId = randomUUID();
		const artifactId = randomUUID();
		const tenantSchema = `tenant_${tenantId.replaceAll("-", "_")}`;
		const schema = quoteIdent(tenantSchema);
		const storageRoot = await mkdtemp(path.join(tmpdir(), "ssfw-r3p-storage-"));
		const storage = new LocalFsStorage({ rootDir: storageRoot });
		const originalPhotoKey = `tenants/${tenantId}/attachments/${attachmentId}-original.jpg`;
		const replacementPhotoKey = `tenants/${tenantId}/attachments/${attachmentId}-replacement.jpg`;
		const artifactKey = `tenants/${tenantId}/artifacts/${artifactId}.pdf`;

		try {
			await seedShared(prisma, tenantId, userId);
			await prisma.$executeRawUnsafe(
				`SELECT shared.provision_tenant_schema(${sqlString(tenantId)}::uuid)`,
			);
			await seedIncidentTree(prisma, {
				actionId,
				accountId,
				artifactId,
				artifactKey,
				attachmentId,
				caseId,
				childCauseId,
				deviationId,
				factId,
				originalPhotoKey,
				personId,
				personalEventId,
				rootCauseId,
				schema,
				timelineEventId,
				timelineSourceId,
				userId,
			});

			await storage.put(originalPhotoKey, "original-photo", {
				contentType: "image/jpeg",
			});
			await storage.put(artifactKey, "summary-artifact", {
				contentType: "application/pdf",
			});

			const firstSerialised = await serialiseWorkflow("II", caseId, {
				tenantId,
			});
			const secondSerialised = await serialiseWorkflow("II", caseId, {
				tenantId,
			});
			assert.equal(
				JSON.stringify(firstSerialised),
				JSON.stringify(secondSerialised),
			);
			assert.equal(record(firstSerialised.case).title, "Original II case");
			assert.equal(recordArray(firstSerialised.timelineEvents).length, 1);
			assert.equal(recordArray(firstSerialised.causeNodes).length, 2);
			assert.equal(
				serialisedIncidentAction(firstSerialised, childCauseId).status,
				"IN_PROGRESS",
			);

			const v01Response = await approveRoute.POST(
				new NextRequest(
					`https://app.example.test/api/incidents/${caseId}/approve`,
					{
						method: "POST",
						headers: {
							"x-ssfw-tenant-id": tenantId,
							"x-ssfw-user-id": userId,
						},
					},
				),
				{ params: { id: caseId } },
			);
			assert.equal(v01Response.status, 201);
			const v01Payload = (await v01Response.json()) as {
				snapshot: { id: string; versionLabel: string };
			};
			assert.equal(v01Payload.snapshot.versionLabel, "v01");

			await storage.put(replacementPhotoKey, "replacement-photo", {
				contentType: "image/jpeg",
			});
			await prisma.$executeRawUnsafe(
				`UPDATE ${schema}.incident_attachment
         SET storage_key = ${sqlString(replacementPhotoKey)}
         WHERE id = ${sqlString(attachmentId)}::uuid`,
			);
			await prisma.$executeRawUnsafe(
				`UPDATE ${schema}.incident_case
         SET title = 'Edited II case', updated_at = CURRENT_TIMESTAMP
         WHERE id = ${sqlString(caseId)}::uuid`,
			);

			const v02Response = await approveRoute.POST(
				new NextRequest(
					`https://app.example.test/api/incidents/${caseId}/approve`,
					{
						method: "POST",
						headers: {
							"x-ssfw-tenant-id": tenantId,
							"x-ssfw-user-id": userId,
						},
					},
				),
				{ params: Promise.resolve({ id: caseId }) },
			);
			assert.equal(v02Response.status, 201);
			const v02Payload = (await v02Response.json()) as {
				snapshot: { versionLabel: string };
			};
			assert.equal(v02Payload.snapshot.versionLabel, "v02");

			const snapshots = await prisma.$queryRawUnsafe<SnapshotInspectionRow[]>(
				`SELECT
           id::text AS id,
           version_label AS "versionLabel",
           workflow_data AS "workflowData",
           artifact_refs AS "artifactRefs",
           attachment_refs AS "attachmentRefs"
         FROM ${schema}.approval_snapshot
         WHERE ii_case_id = ${sqlString(caseId)}::uuid
         ORDER BY version_label ASC`,
			);
			assert.equal(snapshots.length, 2);

			const [v01, v02] = snapshots;
			assert.ok(v01);
			assert.ok(v02);
			assert.equal(v01.versionLabel, "v01");
			assert.equal(v02.versionLabel, "v02");
			assert.equal(
				record(record(v01.workflowData).case).title,
				"Original II case",
			);
			assert.equal(
				record(record(v02.workflowData).case).title,
				"Edited II case",
			);
			assert.equal(
				serialisedIncidentAction(v01.workflowData, childCauseId).status,
				"IN_PROGRESS",
			);
			assert.equal(
				serialisedIncidentAction(v02.workflowData, childCauseId).status,
				"IN_PROGRESS",
			);

			const v01Attachments = recordArray(v01.attachmentRefs);
			const v02Attachments = recordArray(v02.attachmentRefs);
			assert.equal(v01Attachments[0]?.storageKey, originalPhotoKey);
			assert.equal(v02Attachments[0]?.storageKey, replacementPhotoKey);
			assert.equal(recordArray(v01.artifactRefs)[0]?.artifactId, artifactId);

			const artifactRows = await prisma.$queryRawUnsafe<
				ArtifactInspectionRow[]
			>(
				`SELECT id::text AS id, is_snapshot_linked AS "isSnapshotLinked"
         FROM ${schema}.generated_artifact
         WHERE id = ${sqlString(artifactId)}::uuid`,
			);
			assert.deepEqual(artifactRows, [
				{ id: artifactId, isSnapshotLinked: true },
			]);

			const originalPhoto = await storage.head(originalPhotoKey);
			const replacementPhoto = await storage.head(replacementPhotoKey);
			console.log(
				`DB inspection ssfw-r3p snapshots=${JSON.stringify(
					snapshots.map((snapshot) => ({
						versionLabel: snapshot.versionLabel,
						title: record(record(snapshot.workflowData).case).title,
						attachmentStorageKey: recordArray(snapshot.attachmentRefs)[0]
							?.storageKey,
						artifactRefs: recordArray(snapshot.artifactRefs).length,
					})),
				)}`,
			);
			console.log(
				`DB inspection ssfw-r3p generated_artifact=${JSON.stringify(
					artifactRows,
				)}`,
			);
			console.log(
				`Storage inspection ssfw-r3p original=${originalPhoto.key}:${originalPhoto.sizeBytes} replacement=${replacementPhoto.key}:${replacementPhoto.sizeBytes}`,
			);
		} finally {
			await cleanupTenant(prisma, tenantId, userId);
			await rm(storageRoot, { recursive: true, force: true });
		}
	});

	test.after(async () => {
		restoreVectorExtensionFunctionIfShimmed();
		await prisma.$disconnect();
	});

	async function cleanupTenant(
		prismaClient: PrismaClient,
		tenantId: string,
		userId: string,
	): Promise<void> {
		await dropTenantSchema(tenantId, prismaClient).catch(() => undefined);
		await prismaClient.session.deleteMany({ where: { userId } });
		await prismaClient.tenant.deleteMany({ where: { id: tenantId } });
		await prismaClient.user.deleteMany({ where: { id: userId } });
	}
}

async function ensureMigrated(prisma: PrismaClient): Promise<void> {
	if (migrated) {
		return;
	}

	const result = spawnSync("pnpm", ["db:migrate"], {
		cwd: process.cwd(),
		env: { ...process.env, DATABASE_URL: databaseUrl },
		encoding: "utf8",
	});

	assert.equal(
		result.status,
		0,
		`pnpm db:migrate failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
	);
	await installVectorExtensionShimIfUnavailable(prisma);
	migrated = true;
}

async function installVectorExtensionShimIfUnavailable(
	prisma: PrismaClient,
): Promise<void> {
	const rows = await prisma.$queryRaw<Array<{ available: boolean }>>`
		SELECT EXISTS (
			SELECT 1
			FROM pg_available_extensions
			WHERE name = 'vector'
		) AS "available"
	`;
	if (rows[0]?.available) {
		return;
	}

	await prisma.$executeRawUnsafe(`
		CREATE OR REPLACE FUNCTION "shared"."ensure_vector_extension"()
		RETURNS name
		LANGUAGE plpgsql
		AS $$
		BEGIN
			PERFORM "shared"."apply_approval_snapshot_schema_to_all_tenants"();
			PERFORM "shared"."apply_generated_artifact_schema_to_all_tenants"();
			PERFORM "shared"."apply_vision_call_audit_schema_to_all_tenants"();
			PERFORM "shared"."apply_cost_ledger_schema_to_all_tenants"();
			RETURN 'shared'::name;
		END
		$$;
	`);
	vectorShimInstalled = true;
	console.log(
		"DB inspection test shim: pgvector extension is unavailable; installed no-op shared.ensure_vector_extension() for approval snapshot tests",
	);
}

function restoreVectorExtensionFunctionIfShimmed(): void {
	if (!vectorShimInstalled) {
		return;
	}

	const result = spawnSync("pnpm", ["db:migrate"], {
		cwd: process.cwd(),
		env: { ...process.env, DATABASE_URL: databaseUrl },
		encoding: "utf8",
	});
	assert.equal(
		result.status,
		0,
		`pnpm db:migrate failed while restoring shared.ensure_vector_extension\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
	);
	vectorShimInstalled = false;
}

async function seedShared(
	prisma: PrismaClient,
	tenantId: string,
	userId: string,
): Promise<void> {
	const membershipId = randomUUID();

	await prisma.$executeRawUnsafe(
		`INSERT INTO shared.users (id, email, ui_locale)
     VALUES (${sqlString(userId)}::uuid, ${sqlString(
				`ssfw-r3p-${userId}@example.invalid`,
			)}::citext, 'en')`,
	);
	await prisma.$executeRawUnsafe(
		`INSERT INTO shared.tenants (id, name, default_language)
     VALUES (${sqlString(tenantId)}::uuid, 'ssfw-r3p integration tenant', 'en')`,
	);
	await prisma.$executeRawUnsafe(
		`INSERT INTO shared.tenant_memberships (id, tenant_id, user_id)
     VALUES (${sqlString(membershipId)}::uuid, ${sqlString(
				tenantId,
			)}::uuid, ${sqlString(userId)}::uuid)`,
	);
}

async function seedIncidentTree(
	prisma: PrismaClient,
	input: {
		actionId: string;
		accountId: string;
		artifactId: string;
		artifactKey: string;
		attachmentId: string;
		caseId: string;
		childCauseId: string;
		deviationId: string;
		factId: string;
		originalPhotoKey: string;
		personId: string;
		personalEventId: string;
		rootCauseId: string;
		schema: string;
		timelineEventId: string;
		timelineSourceId: string;
		userId: string;
	},
): Promise<void> {
	await prisma.$executeRawUnsafe(
		`INSERT INTO ${input.schema}.incident_case (
       id,
       title,
       incident_at,
       incident_type,
       coordinator_role,
       coordinator_name,
       workflow_stage,
       content_language,
       hira_followup_needed,
       hira_followup_text,
       created_by,
       created_at,
       updated_at
     ) VALUES (
       ${sqlString(input.caseId)}::uuid,
       'Original II case',
       '2026-04-30T08:30:00Z'::timestamptz,
       'NEAR_MISS',
       'Safety lead',
       'Coordinator One',
       'REVIEW',
       'en',
       true,
       'Follow up HIRA for changed forklift route.',
       ${sqlString(input.userId)}::uuid,
       '2026-04-30T08:00:00Z'::timestamptz,
       '2026-04-30T09:00:00Z'::timestamptz
     )`,
	);
	await prisma.$executeRawUnsafe(
		`INSERT INTO ${input.schema}.incident_person (
       id,
       case_id,
       role,
       name,
       other_info,
       created_at,
       updated_at
     ) VALUES (
       ${sqlString(input.personId)}::uuid,
       ${sqlString(input.caseId)}::uuid,
       'Witness',
       'Case Witness',
       'No injury reported.',
       '2026-04-30T08:05:00Z'::timestamptz,
       '2026-04-30T08:05:00Z'::timestamptz
     )`,
	);
	await prisma.$executeRawUnsafe(
		`INSERT INTO ${input.schema}.incident_account (
       id,
       case_id,
       person_id,
       raw_statement,
       created_at,
       updated_at
     ) VALUES (
       ${sqlString(input.accountId)}::uuid,
       ${sqlString(input.caseId)}::uuid,
       ${sqlString(input.personId)}::uuid,
       'Forklift passed close to the pedestrian.',
       '2026-04-30T08:06:00Z'::timestamptz,
       '2026-04-30T08:06:00Z'::timestamptz
     )`,
	);
	await prisma.$executeRawUnsafe(
		`INSERT INTO ${input.schema}.incident_fact (
       id,
       account_id,
       order_index,
       text,
       created_at,
       updated_at
     ) VALUES (
       ${sqlString(input.factId)}::uuid,
       ${sqlString(input.accountId)}::uuid,
       1,
       'Pedestrian crossed the aisle.',
       '2026-04-30T08:07:00Z'::timestamptz,
       '2026-04-30T08:07:00Z'::timestamptz
     )`,
	);
	await prisma.$executeRawUnsafe(
		`INSERT INTO ${input.schema}.incident_personal_event (
       id,
       account_id,
       order_index,
       event_at,
       text,
       created_at,
       updated_at
     ) VALUES (
       ${sqlString(input.personalEventId)}::uuid,
       ${sqlString(input.accountId)}::uuid,
       1,
       '2026-04-30T08:30:00Z'::timestamptz,
       'Witness heard the reversing alarm.',
       '2026-04-30T08:08:00Z'::timestamptz,
       '2026-04-30T08:08:00Z'::timestamptz
     )`,
	);
	await prisma.$executeRawUnsafe(
		`INSERT INTO ${input.schema}.incident_timeline_event (
       id,
       case_id,
       order_index,
       event_at,
       text,
       confidence,
       created_at,
       updated_at
     ) VALUES (
       ${sqlString(input.timelineEventId)}::uuid,
       ${sqlString(input.caseId)}::uuid,
       1,
       '2026-04-30T08:30:00Z'::timestamptz,
       'Forklift passed near pedestrian.',
       'CONFIRMED',
       '2026-04-30T08:09:00Z'::timestamptz,
       '2026-04-30T08:09:00Z'::timestamptz
     )`,
	);
	await prisma.$executeRawUnsafe(
		`INSERT INTO ${input.schema}.incident_timeline_source (
       id,
       timeline_event_id,
       account_id,
       fact_id,
       personal_event_id,
       created_at,
       updated_at
     ) VALUES (
       ${sqlString(input.timelineSourceId)}::uuid,
       ${sqlString(input.timelineEventId)}::uuid,
       ${sqlString(input.accountId)}::uuid,
       ${sqlString(input.factId)}::uuid,
       ${sqlString(input.personalEventId)}::uuid,
       '2026-04-30T08:10:00Z'::timestamptz,
       '2026-04-30T08:10:00Z'::timestamptz
     )`,
	);
	await prisma.$executeRawUnsafe(
		`INSERT INTO ${input.schema}.incident_deviation (
       id,
       event_id,
       order_index,
       expected,
       actual,
       created_at,
       updated_at
     ) VALUES (
       ${sqlString(input.deviationId)}::uuid,
       ${sqlString(input.timelineEventId)}::uuid,
       1,
       'Pedestrian route separated from forklift traffic.',
       'Shared aisle without barrier.',
       '2026-04-30T08:11:00Z'::timestamptz,
       '2026-04-30T08:11:00Z'::timestamptz
     )`,
	);
	await prisma.$executeRawUnsafe(
		`INSERT INTO ${input.schema}.incident_attachment (
       id,
       event_id,
       storage_key,
       filename,
       mime_type,
       size_bytes,
       created_at,
       created_by
     ) VALUES (
       ${sqlString(input.attachmentId)}::uuid,
       ${sqlString(input.timelineEventId)}::uuid,
       ${sqlString(input.originalPhotoKey)},
       'original.jpg',
       'image/jpeg',
       14,
       '2026-04-30T08:12:00Z'::timestamptz,
       ${sqlString(input.userId)}::uuid
     )`,
	);
	await prisma.$executeRawUnsafe(
		`INSERT INTO ${input.schema}.incident_cause_node (
       id,
       case_id,
       order_index,
       statement,
       question,
       created_at,
       updated_at
     ) VALUES (
       ${sqlString(input.rootCauseId)}::uuid,
       ${sqlString(input.caseId)}::uuid,
       1,
       'Forklift and pedestrian shared the same route.',
       'Why was the route shared?',
       '2026-04-30T08:13:00Z'::timestamptz,
       '2026-04-30T08:13:00Z'::timestamptz
     )`,
	);
	await prisma.$executeRawUnsafe(
		`INSERT INTO ${input.schema}.incident_cause_node (
       id,
       case_id,
       parent_id,
       timeline_event_id,
       order_index,
       statement,
       question,
       is_root_cause,
       created_at,
       updated_at
     ) VALUES (
       ${sqlString(input.childCauseId)}::uuid,
       ${sqlString(input.caseId)}::uuid,
       ${sqlString(input.rootCauseId)}::uuid,
       ${sqlString(input.timelineEventId)}::uuid,
       1,
       'No marked crossing was available.',
       'Why was there no marked crossing?',
       true,
       '2026-04-30T08:14:00Z'::timestamptz,
       '2026-04-30T08:14:00Z'::timestamptz
     )`,
	);
	await prisma.$executeRawUnsafe(
		`INSERT INTO ${input.schema}.incident_cause_action (
       id,
       cause_node_id,
       order_index,
       description,
       owner_role,
       due_date,
       action_type,
       status,
       created_at,
       updated_at
     ) VALUES (
       ${sqlString(input.actionId)}::uuid,
       ${sqlString(input.childCauseId)}::uuid,
       1,
       'Mark pedestrian crossing and update route briefing.',
       'Safety lead',
       '2026-05-15'::date,
       'TECHNICAL',
       'IN_PROGRESS',
       '2026-04-30T08:15:00Z'::timestamptz,
       '2026-04-30T08:15:00Z'::timestamptz
     )`,
	);
	await prisma.$executeRawUnsafe(
		`INSERT INTO ${input.schema}.generated_artifact (
       id,
       workflow_type,
       ii_case_id,
       output_type,
       version_seq,
       storage_key,
       filename,
       mime_type,
       size_bytes,
       generated_by,
       source
     ) VALUES (
       ${sqlString(input.artifactId)}::uuid,
       'II',
       ${sqlString(input.caseId)}::uuid,
       'ii_summary_pdf',
       1,
       ${sqlString(input.artifactKey)},
       'ii-summary.pdf',
       'application/pdf',
       16,
       ${sqlString(input.userId)}::uuid,
       'GENERATED'
     )`,
	);
}

function quoteIdent(identifier: string): string {
	return `"${identifier.replaceAll('"', '""')}"`;
}

function sqlString(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}

function record(value: unknown): Record<string, unknown> {
	assert.equal(typeof value, "object");
	assert.notEqual(value, null);
	assert.equal(Array.isArray(value), false);
	return value as Record<string, unknown>;
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
	assert.ok(Array.isArray(value));
	return value.map(record);
}

function serialisedIncidentAction(
	workflowData: Record<string, unknown>,
	causeNodeId: string,
): Record<string, unknown> {
	const causeNode = recordArray(workflowData.causeNodes).find(
		(node) => node.id === causeNodeId,
	);
	assert.ok(causeNode, "serialised child cause node should be present");
	const [action] = recordArray(causeNode.actions);
	assert.ok(action, "serialised child cause action should be present");
	return action;
}

function moduleUrl(relativePath: string): string {
	return pathToFileURL(path.resolve(relativePath)).href;
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}

function cookieValue(cookieHeader: string, name: string): string | undefined {
	const prefix = `${name}=`;
	return cookieHeader
		.split(";")
		.map((value) => value.trim())
		.find((value) => value.startsWith(prefix))
		?.slice(prefix.length);
}

function approvalFormScriptFromPageSource(): string {
	const source = readFileSync(
		path.resolve("src/app/incidents/[id]/approval/page.tsx"),
		"utf8",
	);
	const match = source.match(/const approveFormScript = `([\s\S]*?)`;/);
	const script = match?.[1];
	assert.ok(script, "approval page CSRF submit script should be present");
	return script;
}

async function waitFor(predicate: () => boolean): Promise<void> {
	for (let attempt = 0; attempt < 50; attempt += 1) {
		if (predicate()) {
			return;
		}

		await new Promise((resolve) => setTimeout(resolve, 10));
	}

	assert.equal(predicate(), true);
}

type FetchCall = {
	init?: RequestInit;
	input: RequestInfo | URL;
};

type TestDom = {
	window: Window &
		typeof globalThis & {
			close(): void;
			fetch: typeof fetch;
		};
};
