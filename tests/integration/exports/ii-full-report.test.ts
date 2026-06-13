import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import JSZip from "jszip";
import type { WorkflowSnapshotData } from "../../../src/lib/incident/serialise";
import type { Storage } from "../../../src/lib/storage";

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

const execFileAsync = promisify(execFile);
const { II_FULL_REPORT_SECTIONS, generateIIReportDocx, generateIIReportPdf } =
	await import("../../../src/lib/exports/ii/full-report");
const { extractIIReportPdfText } = await import(
	"../../../src/lib/exports/ii/full-report"
);
const { exportFooterText } = await import("../../../src/lib/legal/disclaimer");
const { NextRequest } = (await import(
	"next/server.js"
)) as typeof import("next/server");
const databaseUrl = process.env.DATABASE_URL;

test("II full report route rejects unauthenticated and invalid format requests", async () => {
	const route = (await import(
		moduleUrl("src/app/api/incidents/[id]/export/route.ts")
	)) as typeof import("../../../src/app/api/incidents/[id]/export/route");
	const caseId = "11111111-1111-4111-8111-111111111111";

	const unauthenticated = await route.GET(
		new NextRequest(
			`https://app.example.test/api/incidents/${caseId}/export?report=full-report`,
		),
		{ params: { id: caseId } },
	);
	assert.equal(unauthenticated.status, 401);

	const invalidFormat = await route.GET(
		new NextRequest(
			`https://app.example.test/api/incidents/${caseId}/export?report=full-report&format=xlsx`,
			{
				headers: {
					"x-ssfw-tenant-id": "22222222-2222-4222-8222-222222222222",
					"x-ssfw-user-id": "33333333-3333-4333-8333-333333333333",
				},
			},
		),
		{ params: { id: caseId } },
	);
	assert.equal(invalidFormat.status, 400);
	assert.deepEqual(await invalidFormat.json(), {
		code: "INVALID_EXPORT_FORMAT",
	});
});

test("II full report DOCX contains methodology sections and footer", async () => {
	const docx = await generateIIReportDocx(
		{
			type: "workflowData",
			workflowData: fixtureWorkflowData("Original test incident", {
				coachPhoto: true,
			}),
		},
		{ storage: stubStorage() },
	);
	const text = await docxText(docx);

	for (const section of II_FULL_REPORT_SECTIONS) {
		assert.match(text, new RegExp(escapeRegExp(section), "i"));
	}

	assert.match(text, /Original test incident/);
	assert.match(text, /Forklift passed close to a pedestrian/);
	assert.match(text, /Mark pedestrian crossing/);
	assert.match(text, /Follow up HIRA for changed route/);
	assert.match(
		text,
		/Pedestrian crossed the aisle\. — Witness One \(witness\)/,
	);
	assert.match(text, /Forklift aisle seen from the dock door\./);
	assert.doesNotMatch(text, /Evidence: Photo evidence/);

	const zip = await JSZip.loadAsync(docx);
	const mediaFiles = Object.keys(zip.files).filter((fileName) =>
		fileName.startsWith("word/media/"),
	);
	assert.ok(mediaFiles.length >= 1);

	const footerMatches =
		text.match(new RegExp(escapeRegExp(exportFooterText("en")), "g")) ?? [];
	assert.equal(footerMatches.length, 1);
});

test("II full report renders a plain-numbered cause tree with markers and nested measures", async () => {
	const docx = await generateIIReportDocx({
		type: "workflowData",
		workflowData: fixtureWorkflowData("Cause tree incident"),
	});
	const text = await docxText(docx);

	assert.match(text, /1 No marked crossing was available\. \(root cause\)/);
	assert.doesNotMatch(text, /B1 No marked crossing/);
	assert.match(
		text,
		/1\.1 Crossing budget was cut last year\. \(parked — beyond team scope\)/,
	);
	assert.doesNotMatch(text, /noted for management/);
	assert.match(text, /2 Legacy flat cause without a known parent\./);
	assert.match(
		text,
		/\[T\] Mark pedestrian crossing and brief the shift\. - owner: Safety lead; due: 2026-05-15; status: In progress/,
	);
});

test("II full report PDF converts through LibreOffice with the same sections", async () => {
	const pdf = await generateIIReportPdf(
		{
			type: "workflowData",
			workflowData: fixtureWorkflowData("PDF test incident", {
				coachPhoto: true,
			}),
		},
		{ storage: stubStorage() },
	);
	const pdfText = await extractIIReportPdfText(pdf.bytes);

	assert.ok(pdf.bytes.byteLength > 0);

	for (const section of II_FULL_REPORT_SECTIONS) {
		assert.match(pdfText, new RegExp(escapeRegExp(section), "i"));
	}

	assert.match(pdfText, /PDF test incident/);
	assert.match(pdfText, new RegExp(escapeRegExp(exportFooterText("en"))));

	const flatPdfText = pdfText.replace(/\s+/g, " ");
	assert.match(flatPdfText, /1 No marked crossing was available\./);
	assert.doesNotMatch(flatPdfText, /B1 No marked crossing/);
	assert.match(
		flatPdfText,
		/1\.1 Crossing budget was cut last year\. \(parked — beyond team scope\)/,
	);
	assert.doesNotMatch(flatPdfText, /noted for management/);
	assert.match(flatPdfText, /2 Legacy flat cause without a known parent\./);
	assert.match(flatPdfText, /Forklift aisle seen from the dock door\./);
	assert.doesNotMatch(flatPdfText, /Evidence: Photo evidence/);
});

test("II full report uses snapshot workflow data rather than later draft edits", async () => {
	const snapshotDocx = await generateIIReportDocx({
		type: "workflowData",
		workflowData: fixtureWorkflowData("Snapshot v01 title"),
	});
	const currentDraftDocx = await generateIIReportDocx({
		type: "workflowData",
		workflowData: fixtureWorkflowData("Edited current draft title"),
	});

	const snapshotText = await docxText(snapshotDocx);
	const draftText = await docxText(currentDraftDocx);

	assert.match(snapshotText, /Snapshot v01 title/);
	assert.doesNotMatch(snapshotText, /Edited current draft title/);
	assert.match(draftText, /Edited current draft title/);
});

if (!databaseUrl) {
	test("II full report loads approval snapshot workflow_data by snapshot id", {
		skip: "DATABASE_URL is required",
	}, () => {});
} else {
	test("II full report loads approval snapshot workflow_data by snapshot id", async () => {
		const { dropTenantSchema, prisma } = (await import(
			moduleUrl("src/lib/db/index.ts")
		)) as typeof import("../../../src/lib/db");
		const tenantId = randomUUID();
		const userId = randomUUID();
		const membershipId = randomUUID();
		const caseId = randomUUID();
		const snapshotId = randomUUID();
		const otherTenantId = randomUUID();
		const otherUserId = randomUUID();
		const otherMembershipId = randomUUID();
		const schemaName = `tenant_${tenantId.replaceAll("-", "_")}`;
		const schema = quoteIdent(schemaName);

		try {
			await seedShared(prisma, { membershipId, tenantId, userId });
			await provisionSnapshotTestSchema(prisma, schemaName);
			await seedShared(prisma, {
				membershipId: otherMembershipId,
				tenantId: otherTenantId,
				userId: otherUserId,
			});
			await provisionSnapshotTestSchema(
				prisma,
				`tenant_${otherTenantId.replaceAll("-", "_")}`,
			);
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
					${sqlString(caseId)}::uuid,
					'Current draft after approval',
					'2026-05-01T08:30:00Z'::timestamptz,
					'NEAR_MISS',
					'Safety lead',
					'en',
					${sqlString(userId)}::uuid
				)`,
			);
			await prisma.$executeRawUnsafe(
				`INSERT INTO ${schema}.approval_snapshot (
					id,
					workflow_type,
					ii_case_id,
					version_label,
					approved_by,
					approved_at,
					schema_version,
					workflow_data,
					artifact_refs,
					attachment_refs
				) VALUES (
					${sqlString(snapshotId)}::uuid,
					'II',
					${sqlString(caseId)}::uuid,
					'v01',
					${sqlString(userId)}::uuid,
					'2026-05-01T09:00:00Z'::timestamptz,
					1,
					${sqlString(JSON.stringify(fixtureWorkflowData("Frozen snapshot title")))}::jsonb,
					'[]'::jsonb,
					'[]'::jsonb
				)`,
			);

			const snapshotText = await docxText(
				await generateIIReportDocx({
					caseId,
					snapshotId,
					tenantId,
					type: "snapshot",
				}),
			);
			const draftText = await docxText(
				await generateIIReportDocx({ caseId, tenantId, type: "draft" }),
			);

			assert.match(snapshotText, /Frozen snapshot title/);
			assert.doesNotMatch(snapshotText, /Current draft after approval/);
			assert.match(draftText, /Current draft after approval/);

			const route = (await import(
				moduleUrl("src/app/api/incidents/[id]/export/route.ts")
			)) as typeof import("../../../src/app/api/incidents/[id]/export/route");
			const docxResponse = await route.GET(
				routeRequest({
					caseId,
					snapshotId,
					tenantId,
					userId,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(docxResponse.status, 200);
			assert.equal(
				docxResponse.headers.get("content-type"),
				"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			);
			assert.match(
				docxResponse.headers.get("content-disposition") ?? "",
				/ii-full-report-.*\.docx/,
			);
			assert.match(
				await docxText(Buffer.from(await docxResponse.arrayBuffer())),
				/Frozen snapshot title/,
			);

			const pdfResponse = await route.GET(
				routeRequest({
					caseId,
					format: "pdf",
					snapshotId,
					tenantId,
					userId,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(pdfResponse.status, 200);
			assert.equal(pdfResponse.headers.get("content-type"), "application/pdf");
			assert.match(
				pdfResponse.headers.get("content-disposition") ?? "",
				/ii-full-report-.*\.pdf/,
			);
			const pdfText = await extractIIReportPdfText(
				new Uint8Array(await pdfResponse.arrayBuffer()),
			);
			assert.match(pdfText, /Frozen snapshot title/);

			const missingSnapshot = await route.GET(
				routeRequest({
					caseId,
					snapshotId: randomUUID(),
					tenantId,
					userId,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(missingSnapshot.status, 404);

			const wrongCaseId = randomUUID();
			const wrongCaseSnapshot = await route.GET(
				routeRequest({
					caseId: wrongCaseId,
					snapshotId,
					tenantId,
					userId,
				}),
				{ params: { id: wrongCaseId } },
			);
			assert.equal(wrongCaseSnapshot.status, 404);

			const crossTenantSnapshot = await route.GET(
				routeRequest({
					caseId,
					snapshotId,
					tenantId: otherTenantId,
					userId: otherUserId,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(crossTenantSnapshot.status, 404);
		} finally {
			await dropTenantSchema(tenantId).catch(() => undefined);
			await dropTenantSchema(otherTenantId).catch(() => undefined);
			await prisma.tenantMembership.deleteMany({
				where: { tenantId: { in: [tenantId, otherTenantId] } },
			});
			await prisma.session.deleteMany({
				where: { tenantId: { in: [tenantId, otherTenantId] } },
			});
			await prisma.tenant.deleteMany({
				where: { id: { in: [tenantId, otherTenantId] } },
			});
			await prisma.user.deleteMany({
				where: { id: { in: [userId, otherUserId] } },
			});
		}
	});
}

test("II full report DOCX passes automated openability round-trip", async () => {
	const workdir = await mkdtemp(join(tmpdir(), "ssfw-ii-report-openability-"));
	const docxPath = join(workdir, "ii-full-report.docx");
	const pdfPath = join(workdir, "ii-full-report.pdf");

	try {
		await writeFile(
			docxPath,
			await generateIIReportDocx(
				{
					type: "workflowData",
					workflowData: fixtureWorkflowData("Openability test incident", {
						coachPhoto: true,
					}),
				},
				{ storage: stubStorage() },
			),
		);
		await execFileAsync("libreoffice", [
			"--headless",
			"--convert-to",
			"pdf",
			"--outdir",
			workdir,
			docxPath,
		]);
		const { stdout } = await execFileAsync("pdfinfo", [pdfPath]);
		assert.match(stdout, /^Pages:\s+\d+$/m);
	} finally {
		await rm(workdir, { force: true, recursive: true });
	}
});

async function docxText(docx: Buffer): Promise<string> {
	const zip = await JSZip.loadAsync(docx);
	const documentXml = await zip.file("word/document.xml")?.async("string");
	const footerXml = await Promise.all(
		Object.keys(zip.files)
			.filter((fileName) => /^word\/footer\d+\.xml$/.test(fileName))
			.map((fileName) => zip.file(fileName)?.async("string")),
	);

	return `${xmlText(documentXml ?? "")} ${footerXml.map((xml) => xmlText(xml ?? "")).join(" ")}`;
}

function xmlText(xml: string): string {
	return xml
		.replace(/<[^>]+>/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/\s+/g, " ")
		.trim();
}

const oneByOnePngBytes = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
	"base64",
);

function stubStorage(): Storage {
	return {
		delete: async () => undefined,
		get: async (key: string) => ({
			body: oneByOnePngBytes,
			metadata: {
				key,
				sizeBytes: oneByOnePngBytes.byteLength,
				updatedAt: new Date("2026-05-01T08:25:00.000Z"),
			},
		}),
		head: async (key: string) => ({
			key,
			sizeBytes: oneByOnePngBytes.byteLength,
			updatedAt: new Date("2026-05-01T08:25:00.000Z"),
		}),
		list: async () => ({ items: [], truncated: false }),
		put: async (key: string) => ({
			key,
			sizeBytes: 0,
			updatedAt: new Date("2026-05-01T08:25:00.000Z"),
		}),
	};
}

function fixtureWorkflowData(
	title: string,
	options: { coachPhoto?: boolean } = {},
): WorkflowSnapshotData {
	const coachPhotoEvents = options.coachPhoto
		? [
				{
					attachments: [
						{
							caption: "Forklift aisle seen from the dock door.",
							createdAt: "2026-05-01T08:26:00.000Z",
							createdById: "user-1",
							eventId: "event-photos",
							filename: "aisle.png",
							id: "attachment-1",
							mimeType: "image/png",
							sizeBytes: String(oneByOnePngBytes.byteLength),
							storageKey: "tenants/tenant-1/attachments/attachment-1.png",
						},
					],
					caseId: "case-1",
					confidence: "LIKELY",
					createdAt: "2026-05-01T08:25:00.000Z",
					deviations: [],
					eventAt: null,
					id: "event-photos",
					orderIndex: 2,
					sources: [],
					text: "Photo evidence",
					timeLabel: "Evidence",
					updatedAt: "2026-05-01T08:25:00.000Z",
				},
			]
		: [];

	return {
		accounts: [
			{
				caseId: "case-1",
				createdAt: "2026-05-01T08:02:00.000Z",
				facts: [
					{
						accountId: "account-1",
						createdAt: "2026-05-01T08:03:00.000Z",
						id: "fact-1",
						orderIndex: 1,
						text: "Pedestrian crossed the aisle.",
						updatedAt: "2026-05-01T08:03:00.000Z",
					},
				],
				id: "account-1",
				personId: "person-1",
				personalEvents: [],
				rawStatement: "Forklift passed close to a pedestrian.",
				updatedAt: "2026-05-01T08:02:00.000Z",
			},
		],
		case: {
			contentLanguage: "en",
			coordinatorName: "Case Coordinator",
			coordinatorRole: "Safety lead",
			createdAt: "2026-05-01T08:00:00.000Z",
			createdById: "user-1",
			hiraFollowupNeeded: true,
			hiraFollowupText: "Follow up HIRA for changed route.",
			id: "case-1",
			incidentAt: "2026-05-01T08:30:00.000Z",
			incidentTimeNote: "Europe/Zurich",
			incidentType: "NEAR_MISS",
			location: "Receiving dock",
			title,
			updatedAt: "2026-05-01T09:00:00.000Z",
			visionConsent: "ASK",
			workflowStage: "REVIEW",
		},
		causeNodes: [
			{
				actions: [
					{
						actionType: "TECHNICAL",
						causeNodeId: "cause-1",
						createdAt: "2026-05-01T08:45:00.000Z",
						description: "Mark pedestrian crossing and brief the shift.",
						dueDate: "2026-05-15",
						id: "action-1",
						orderIndex: 1,
						ownerRole: "Safety lead",
						status: "IN_PROGRESS",
						updatedAt: "2026-05-01T08:45:00.000Z",
					},
				],
				caseId: "case-1",
				createdAt: "2026-05-01T08:40:00.000Z",
				id: "cause-1",
				isRootCause: true,
				orderIndex: 1,
				parentId: null,
				question: "Why was there no marked crossing?",
				statement: "No marked crossing was available.",
				timelineEventId: "event-1",
				updatedAt: "2026-05-01T08:40:00.000Z",
			},
			{
				actions: [],
				branchStatus: "PARKED",
				caseId: "case-1",
				createdAt: "2026-05-01T08:41:00.000Z",
				id: "cause-2",
				isRootCause: false,
				orderIndex: 1,
				parentId: "cause-1",
				question: null,
				statement: "Crossing budget was cut last year.",
				timelineEventId: null,
				updatedAt: "2026-05-01T08:41:00.000Z",
			},
			{
				actions: [],
				caseId: "case-1",
				createdAt: "2026-05-01T08:42:00.000Z",
				id: "cause-3",
				isRootCause: false,
				orderIndex: 2,
				parentId: "cause-missing",
				question: null,
				statement: "Legacy flat cause without a known parent.",
				timelineEventId: null,
				updatedAt: "2026-05-01T08:42:00.000Z",
			},
		],
		persons: [
			{
				caseId: "case-1",
				createdAt: "2026-05-01T08:01:00.000Z",
				id: "person-1",
				name: "Witness One",
				otherInfo: null,
				role: "witness",
				updatedAt: "2026-05-01T08:01:00.000Z",
			},
		],
		schemaVersion: 1,
		timelineEvents: [
			{
				attachments: [],
				caseId: "case-1",
				confidence: "CONFIRMED",
				createdAt: "2026-05-01T08:20:00.000Z",
				deviations: [
					{
						actual: "Shared aisle without barrier.",
						createdAt: "2026-05-01T08:22:00.000Z",
						eventId: "event-1",
						expected: "Pedestrian route separated from forklift traffic.",
						id: "deviation-1",
						orderIndex: 1,
						updatedAt: "2026-05-01T08:22:00.000Z",
					},
				],
				eventAt: "2026-05-01T08:30:00.000Z",
				id: "event-1",
				orderIndex: 1,
				sources: [],
				text: "Forklift passed close to a pedestrian.",
				timeLabel: "08:30",
				updatedAt: "2026-05-01T08:20:00.000Z",
			},
			...coachPhotoEvents,
		],
		workflowType: "II",
	};
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith(".") || specifier.startsWith("/");
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function moduleUrl(path: string): string {
	return pathToFileURL(join(process.cwd(), path)).href;
}

function routeRequest(input: {
	caseId: string;
	format?: "docx" | "pdf";
	snapshotId?: string;
	tenantId: string;
	userId: string;
}) {
	const url = new URL(
		`https://app.example.test/api/incidents/${input.caseId}/export?report=full-report`,
	);

	if (input.format) {
		url.searchParams.set("format", input.format);
	}

	if (input.snapshotId) {
		url.searchParams.set("snapshotId", input.snapshotId);
	}

	return new NextRequest(url, {
		headers: {
			"x-ssfw-tenant-id": input.tenantId,
			"x-ssfw-user-id": input.userId,
		},
	});
}

async function seedShared(
	prisma: { $executeRawUnsafe(query: string): Promise<unknown> },
	input: { membershipId: string; tenantId: string; userId: string },
): Promise<void> {
	await prisma.$executeRawUnsafe(
		`INSERT INTO shared.users (id, email, ui_locale)
		 VALUES (${sqlString(input.userId)}::uuid, ${sqlString(
				`ssfw-tvd-${input.userId}@example.invalid`,
			)}::citext, 'en')`,
	);
	await prisma.$executeRawUnsafe(
		`INSERT INTO shared.tenants (id, name, default_language)
		 VALUES (${sqlString(input.tenantId)}::uuid, 'ssfw-tvd tenant', 'en')`,
	);
	await prisma.$executeRawUnsafe(
		`INSERT INTO shared.tenant_memberships (id, tenant_id, user_id)
		 VALUES (${sqlString(input.membershipId)}::uuid, ${sqlString(
				input.tenantId,
			)}::uuid, ${sqlString(input.userId)}::uuid)`,
	);
}

async function provisionSnapshotTestSchema(
	prisma: { $executeRawUnsafe(query: string): Promise<unknown> },
	schemaName: string,
): Promise<void> {
	const role = `role_${schemaName}`;
	await prisma.$executeRawUnsafe(
		`DO $$
		 BEGIN
		   IF NOT EXISTS (
		     SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ${sqlString(role)}
		   ) THEN
		     EXECUTE format(
		       'CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION',
		       ${sqlString(role)}
		     );
		   END IF;
		 END $$`,
	);
	await prisma.$executeRawUnsafe(`GRANT ${quoteIdent(role)} TO CURRENT_USER`);
	await prisma.$executeRawUnsafe(
		`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schemaName)} AUTHORIZATION ${quoteIdent(role)}`,
	);
	await prisma.$executeRawUnsafe(
		`ALTER SCHEMA ${quoteIdent(schemaName)} OWNER TO ${quoteIdent(role)}`,
	);
	await prisma.$executeRawUnsafe(
		`GRANT USAGE ON SCHEMA ${quoteIdent(schemaName)} TO ${quoteIdent(role)}`,
	);
	await prisma.$executeRawUnsafe(
		`GRANT USAGE ON SCHEMA "shared" TO ${quoteIdent(role)}`,
	);
	await prisma.$executeRawUnsafe(
		`SELECT shared.apply_incident_case_schema(${sqlString(schemaName)}::name)`,
	);
	await prisma.$executeRawUnsafe(
		`SELECT shared.apply_incident_cause_branch_status_schema(${sqlString(schemaName)}::name)`,
	);
	await prisma.$executeRawUnsafe(
		`SELECT shared.apply_approval_snapshot_schema(${sqlString(schemaName)}::name)`,
	);
}

function quoteIdent(identifier: string): string {
	return `"${identifier.replaceAll('"', '""')}"`;
}

function sqlString(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}
