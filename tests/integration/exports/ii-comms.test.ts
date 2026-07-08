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
import type {
	Storage,
	StorageBody,
	StorageListOptions,
	StorageListResult,
	StorageObject,
	StorageObjectMetadata,
	StoragePutOptions,
} from "../../../src/lib/storage";

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
const pngFixture = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
	"base64",
);
const tenantId = "11111111-1111-4111-8111-111111111111";
const {
	II_COMMS_ONEPAGER_SECTIONS,
	generateIICommsOnePagerDocx,
	iiCommsFilename,
} = await import("../../../src/lib/exports/ii/comms-onepager");
const { exportFooterText } = await import("../../../src/lib/legal/disclaimer");
const { LocalFsStorage, tenantPrefix } = await import(
	"../../../src/lib/storage"
);
const { NextRequest } = (await import(
	"next/server.js"
)) as typeof import("next/server");
const { dropTenantSchema, prisma } = (await import(
	moduleUrl("src/lib/db/index.ts")
)) as typeof import("../../../src/lib/db");
const { issueSession } = (await import(
	moduleUrl("src/lib/auth/session.ts")
)) as typeof import("../../../src/lib/auth/session");
const { mintCsrfToken } = (await import(
	moduleUrl("src/lib/auth/csrf.ts")
)) as typeof import("../../../src/lib/auth/csrf");
const databaseUrl = process.env.DATABASE_URL;
const selectedPhotoKey = `${tenantPrefix(tenantId)}/attachments/selected.png`;
const unselectedPhotoKey = `${tenantPrefix(tenantId)}/attachments/unselected.png`;

test("II comms one-pager DOCX contains methodology sections, footer, and selected timeline photo", async () => {
	const storage = new MemoryStorage();
	await storage.put(selectedPhotoKey, pngFixture, { contentType: "image/png" });
	await storage.put(unselectedPhotoKey, pngFixture, {
		contentType: "image/png",
	});

	const docx = await generateIICommsOnePagerDocx(
		{
			tenantId,
			type: "workflowData",
			workflowData: fixtureWorkflowData({
				attachments: [
					{
						filename: "selected.png",
						mimeType: "image/png",
						selectedForComms: true,
						storageKey: selectedPhotoKey,
					},
					{
						filename: "unselected.png",
						mimeType: "image/png",
						selectedForComms: false,
						storageKey: unselectedPhotoKey,
					},
				],
				title: "Comms sample near miss",
			}),
		},
		{ storage },
	);
	const text = await docxText(docx);
	const media = await docxMedia(docx);

	for (const section of II_COMMS_ONEPAGER_SECTIONS) {
		assert.match(text, new RegExp(escapeRegExp(section), "i"));
	}

	assert.match(text, /Comms sample near miss/);
	assert.match(text, /Forklift passed close to a pedestrian/);
	assert.match(text, /No marked crossing was available/);
	assert.match(text, /Mark pedestrian crossing and brief the shift/);
	assert.match(text, new RegExp(escapeRegExp(exportFooterText("en"))));
	assert.equal(media.length, 1);
	assert.deepEqual(media[0], pngFixture);
});

test("II comms one-pager falls back to all image attachments when no explicit selection exists", async () => {
	const storage = new MemoryStorage();
	await storage.put(selectedPhotoKey, pngFixture, { contentType: "image/png" });

	const docx = await generateIICommsOnePagerDocx(
		{
			tenantId,
			type: "workflowData",
			workflowData: fixtureWorkflowData({
				attachments: [
					{
						filename: "selected.png",
						mimeType: "image/png",
						storageKey: selectedPhotoKey,
					},
				],
				title: "Fallback photo incident",
			}),
		},
		{ storage },
	);

	assert.equal((await docxMedia(docx)).length, 1);
});

test("II comms one-pager DOCX passes automated openability round-trip", async () => {
	const storage = new MemoryStorage();
	await storage.put(selectedPhotoKey, pngFixture, { contentType: "image/png" });
	const workdir = await mkdtemp(join(tmpdir(), "ssfw-ii-comms-openability-"));
	const docxPath = join(workdir, "ii-comms-onepager.docx");
	const pdfPath = join(workdir, "ii-comms-onepager.pdf");

	try {
		await writeFile(
			docxPath,
			await generateIICommsOnePagerDocx(
				{
					tenantId,
					type: "workflowData",
					workflowData: fixtureWorkflowData({
						attachments: [
							{
								filename: "selected.png",
								mimeType: "image/png",
								selectedForComms: true,
								storageKey: selectedPhotoKey,
							},
						],
						title: "Openability comms incident",
					}),
				},
				{ storage },
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

test("II comms route rejects unauthenticated, invalid id, and non-DOCX format requests", async () => {
	const route = (await import(
		moduleUrl("src/app/api/incidents/[id]/export/route.ts")
	)) as typeof import("../../../src/app/api/incidents/[id]/export/route");
	const caseId = "11111111-1111-4111-8111-111111111111";
	const authTenantId = randomUUID();
	const authUserId = randomUUID();
	const authMembershipId = randomUUID();

	const invalidId = await route.GET(
		new NextRequest(
			"https://app.example.test/api/incidents/not-a-uuid/export?report=comms",
		),
		{ params: { id: "not-a-uuid" } },
	);
	assert.equal(invalidId.status, 400);

	const unauthenticated = await route.GET(
		new NextRequest(
			`https://app.example.test/api/incidents/${caseId}/export?report=comms`,
		),
		{ params: { id: caseId } },
	);
	assert.equal(unauthenticated.status, 401);

	try {
		const { sessionCookie } = await seedTenant(prisma, {
			membershipId: authMembershipId,
			tenantId: authTenantId,
			userId: authUserId,
		});

		const invalidFormat = await route.GET(
			routeRequest({
				caseId,
				format: "pptx",
				sessionCookie,
			}),
			{ params: { id: caseId } },
		);
		assert.equal(invalidFormat.status, 400);
		assert.deepEqual(await invalidFormat.json(), {
			code: "INVALID_EXPORT_FORMAT",
		});

		const invalidPhotoId = await route.GET(
			routeRequest({
				caseId,
				photoId: "not-a-uuid",
				sessionCookie,
			}),
			{ params: { id: caseId } },
		);
		assert.equal(invalidPhotoId.status, 400);
		assert.deepEqual(await invalidPhotoId.json(), {
			code: "INVALID_PHOTO_ID",
		});
	} finally {
		await prisma.tenantMembership.deleteMany({
			where: { tenantId: authTenantId },
		});
		await prisma.session.deleteMany({ where: { tenantId: authTenantId } });
		await prisma.tenant.deleteMany({ where: { id: authTenantId } });
		await prisma.user.deleteMany({ where: { id: authUserId } });
	}
	assert.equal(iiCommsFilename(caseId), `ii-comms-onepager-${caseId}.docx`);
});

if (!databaseUrl) {
	test("II comms route returns DOCX with timeline photo from tenant storage", {
		skip: "DATABASE_URL is required",
	}, () => {});
} else {
	test("II comms route returns DOCX with timeline photo from tenant storage", async () => {
		const route = (await import(
			moduleUrl("src/app/api/incidents/[id]/export/route.ts")
		)) as typeof import("../../../src/app/api/incidents/[id]/export/route");
		const caseId = randomUUID();
		const eventId = randomUUID();
		const snapshotId = randomUUID();
		const selectedAttachmentId = randomUUID();
		const unselectedAttachmentId = randomUUID();
		const userId = randomUUID();
		const membershipId = randomUUID();
		const testTenantId = randomUUID();
		const storageRoot = await mkdtemp(join(tmpdir(), "ssfw-ii-comms-storage-"));
		const priorStorageRoot = process.env.STORAGE_LOCAL_ROOT;
		const priorStorageDriver = process.env.STORAGE_DRIVER;
		const selectedStorageKey = `${tenantPrefix(testTenantId)}/attachments/${selectedAttachmentId}.png`;
		const unselectedStorageKey = `${tenantPrefix(testTenantId)}/attachments/${unselectedAttachmentId}.png`;
		const schemaName = `tenant_${testTenantId.replaceAll("-", "_")}`;

		process.env.STORAGE_DRIVER = "local-fs";
		process.env.STORAGE_LOCAL_ROOT = storageRoot;

		try {
			const { sessionCookie } = await seedTenant(prisma, {
				membershipId,
				tenantId: testTenantId,
				userId,
			});
			await provisionIncidentSchema(prisma, schemaName);
			await new LocalFsStorage({ rootDir: storageRoot }).put(
				selectedStorageKey,
				pngFixture,
				{ contentType: "image/png" },
			);
			await new LocalFsStorage({ rootDir: storageRoot }).put(
				unselectedStorageKey,
				pngFixture,
				{ contentType: "image/png" },
			);
			await seedIncidentWithPhotos(prisma, {
				attachments: [
					{
						attachmentId: selectedAttachmentId,
						filename: "selected-route-photo.png",
						storageKey: selectedStorageKey,
					},
					{
						attachmentId: unselectedAttachmentId,
						filename: "unselected-route-photo.png",
						storageKey: unselectedStorageKey,
					},
				],
				caseId,
				eventId,
				schemaName,
				userId,
			});
			await seedApprovalSnapshot(prisma, {
				caseId,
				schemaName,
				selectedAttachmentId,
				selectedStorageKey,
				snapshotId,
				userId,
			});

			const response = await route.GET(
				routeRequest({
					caseId,
					selectedAttachmentIds: [selectedAttachmentId],
					sessionCookie,
				}),
				{ params: { id: caseId } },
			);
			if (response.status !== 200) {
				assert.fail(await responseText(response));
			}
			assert.equal(
				response.headers.get("content-type"),
				"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			);
			assert.match(
				response.headers.get("content-disposition") ?? "",
				/ii-comms-onepager-.*\.docx/,
			);

			const docx = Buffer.from(await response.arrayBuffer());
			const text = await docxText(docx);
			const media = await docxMedia(docx);

			assert.match(text, /Route comms near miss/);
			assert.match(text, /Forklift passed close to a pedestrian/);
			assert.equal(media.length, 1);

			const snapshotResponse = await route.GET(
				routeRequest({
					caseId,
					selectedAttachmentIds: [selectedAttachmentId],
					sessionCookie,
					snapshotId,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(snapshotResponse.status, 200);
			const snapshotText = await docxText(
				Buffer.from(await snapshotResponse.arrayBuffer()),
			);
			assert.match(snapshotText, /Frozen comms snapshot/);
			assert.doesNotMatch(snapshotText, /Route comms near miss/);
		} finally {
			if (priorStorageDriver === undefined) {
				delete process.env.STORAGE_DRIVER;
			} else {
				process.env.STORAGE_DRIVER = priorStorageDriver;
			}

			if (priorStorageRoot === undefined) {
				delete process.env.STORAGE_LOCAL_ROOT;
			} else {
				process.env.STORAGE_LOCAL_ROOT = priorStorageRoot;
			}

			await rm(storageRoot, { force: true, recursive: true });
			await dropTenantSchema(testTenantId).catch(() => undefined);
			await prisma.tenantMembership.deleteMany({
				where: { tenantId: testTenantId },
			});
			await prisma.session.deleteMany({ where: { tenantId: testTenantId } });
			await prisma.tenant.deleteMany({ where: { id: testTenantId } });
			await prisma.user.deleteMany({ where: { id: userId } });
		}
	});
}

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

async function docxMedia(docx: Buffer): Promise<Buffer[]> {
	const zip = await JSZip.loadAsync(docx);
	const mediaNames = Object.keys(zip.files)
		.filter((fileName) => /^word\/media\/.+\.(png|jpe?g)$/i.test(fileName))
		.sort();

	return Promise.all(
		mediaNames.map(async (fileName) => {
			const media = await zip.file(fileName)?.async("nodebuffer");
			assert.ok(media, `Missing media part ${fileName}`);
			return media;
		}),
	);
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

function fixtureWorkflowData(input: {
	attachments: Array<{
		filename: string;
		id?: string;
		mimeType: string;
		selectedForComms?: boolean;
		storageKey: string;
	}>;
	title: string;
}): WorkflowSnapshotData {
	return {
		accounts: [],
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
			title: input.title,
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
		],
		persons: [],
		schemaVersion: 1,
		timelineEvents: [
			{
				attachments: input.attachments.map((attachment, index) => ({
					createdAt: "2026-05-01T08:24:00.000Z",
					createdById: "user-1",
					eventId: "event-1",
					filename: attachment.filename,
					id: attachment.id ?? `attachment-${index + 1}`,
					mimeType: attachment.mimeType,
					...(attachment.selectedForComms === undefined
						? {}
						: { selectedForComms: attachment.selectedForComms }),
					sizeBytes: String(pngFixture.byteLength),
					storageKey: attachment.storageKey,
				})),
				caseId: "case-1",
				confidence: "CONFIRMED",
				createdAt: "2026-05-01T08:20:00.000Z",
				deviations: [],
				eventAt: "2026-05-01T08:30:00.000Z",
				id: "event-1",
				orderIndex: 1,
				sources: [],
				text: "Forklift passed close to a pedestrian.",
				timeLabel: "08:30",
				updatedAt: "2026-05-01T08:20:00.000Z",
			},
		],
		workflowType: "II",
	};
}

async function seedTenant(
	prisma: { $executeRawUnsafe(query: string): Promise<unknown> },
	input: { membershipId: string; tenantId: string; userId: string },
): Promise<{ sessionCookie: string }> {
	await prisma.$executeRawUnsafe(
		`INSERT INTO shared.users (id, email, ui_locale)
		 VALUES (${sqlString(input.userId)}::uuid, ${sqlString(
				`ssfw-tdy-${input.userId}@example.invalid`,
			)}::citext, 'en')`,
	);
	await prisma.$executeRawUnsafe(
		`INSERT INTO shared.tenants (id, name, default_language)
		 VALUES (${sqlString(input.tenantId)}::uuid, 'ssfw-tdy tenant', 'en')`,
	);
	await prisma.$executeRawUnsafe(
		`INSERT INTO shared.tenant_memberships (id, tenant_id, user_id)
		 VALUES (${sqlString(input.membershipId)}::uuid, ${sqlString(
				input.tenantId,
			)}::uuid, ${sqlString(input.userId)}::uuid)`,
	);
	const session = await issueSession(input.userId, input.tenantId);
	return { sessionCookie: session.cookieValue };
}

async function provisionIncidentSchema(
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
		`SELECT shared.apply_incident_soft_delete_schema(${sqlString(schemaName)}::name)`,
	);
	await prisma.$executeRawUnsafe(
		`SELECT shared.apply_incident_cause_branch_status_schema(${sqlString(schemaName)}::name)`,
	);
	await prisma.$executeRawUnsafe(
		`SELECT shared.apply_approval_snapshot_schema(${sqlString(schemaName)}::name)`,
	);
}

async function seedIncidentWithPhotos(
	prisma: { $executeRawUnsafe(query: string): Promise<unknown> },
	input: {
		attachments: Array<{
			attachmentId: string;
			filename: string;
			storageKey: string;
		}>;
		caseId: string;
		eventId: string;
		schemaName: string;
		userId: string;
	},
): Promise<void> {
	const schema = quoteIdent(input.schemaName);

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
			'Route comms near miss',
			'2026-05-01T08:30:00Z'::timestamptz,
			'NEAR_MISS',
			'Safety lead',
			'en',
			${sqlString(input.userId)}::uuid
		)`,
	);
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
			1,
			'2026-05-01T08:30:00Z'::timestamptz,
			'08:30',
			'Forklift passed close to a pedestrian.',
			'CONFIRMED'
		)`,
	);
	for (const attachment of input.attachments) {
		await prisma.$executeRawUnsafe(
			`INSERT INTO ${schema}.incident_attachment (
				id,
				event_id,
				storage_key,
				filename,
				mime_type,
				size_bytes,
				created_by
			) VALUES (
				${sqlString(attachment.attachmentId)}::uuid,
				${sqlString(input.eventId)}::uuid,
				${sqlString(attachment.storageKey)},
				${sqlString(attachment.filename)},
				'image/png',
				${pngFixture.byteLength},
				${sqlString(input.userId)}::uuid
			)`,
		);
	}
	await prisma.$executeRawUnsafe(
		`INSERT INTO ${schema}.incident_cause_node (
			id,
			case_id,
			timeline_event_id,
			order_index,
			statement,
			question,
			is_root_cause
		) VALUES (
			${sqlString(randomUUID())}::uuid,
			${sqlString(input.caseId)}::uuid,
			${sqlString(input.eventId)}::uuid,
			1,
			'No marked crossing was available.',
			'Why was there no marked crossing?',
			true
		)`,
	);
}

async function seedApprovalSnapshot(
	prisma: { $executeRawUnsafe(query: string): Promise<unknown> },
	input: {
		caseId: string;
		schemaName: string;
		selectedAttachmentId: string;
		selectedStorageKey: string;
		snapshotId: string;
		userId: string;
	},
): Promise<void> {
	const workflowData = fixtureWorkflowData({
		attachments: [
			{
				filename: "selected-route-photo.png",
				id: input.selectedAttachmentId,
				mimeType: "image/png",
				selectedForComms: true,
				storageKey: input.selectedStorageKey,
			},
		],
		title: "Frozen comms snapshot",
	});
	const schema = quoteIdent(input.schemaName);

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
			${sqlString(input.snapshotId)}::uuid,
			'II',
			${sqlString(input.caseId)}::uuid,
			'v01',
			${sqlString(input.userId)}::uuid,
			'2026-05-01T09:00:00Z'::timestamptz,
			1,
			${sqlString(JSON.stringify(workflowData))}::jsonb,
			'[]'::jsonb,
			'[]'::jsonb
		)`,
	);
}

class MemoryStorage implements Storage {
	readonly objects = new Map<string, StorageObject>();

	async put(
		key: string,
		body: StorageBody,
		options: StoragePutOptions = {},
	): Promise<StorageObjectMetadata> {
		const buffer =
			typeof body === "string" || Buffer.isBuffer(body)
				? Buffer.from(body)
				: Buffer.from(
						body instanceof ArrayBuffer ? new Uint8Array(body) : body,
					);
		const metadata: StorageObjectMetadata = {
			contentType: options.contentType,
			customMetadata: options.customMetadata,
			key,
			sizeBytes: buffer.byteLength,
			updatedAt: new Date("2026-05-01T08:00:00.000Z"),
		};
		this.objects.set(key, { body: buffer, metadata });
		return metadata;
	}

	async get(key: string): Promise<StorageObject> {
		const object = this.objects.get(key);

		if (!object) {
			throw new Error(`Missing storage object: ${key}`);
		}

		return object;
	}

	async head(key: string): Promise<StorageObjectMetadata> {
		return (await this.get(key)).metadata;
	}

	async delete(key: string): Promise<void> {
		this.objects.delete(key);
	}

	async list(
		prefix = "",
		_options: StorageListOptions = {},
	): Promise<StorageListResult> {
		return {
			items: [...this.objects.values()]
				.map((object) => object.metadata)
				.filter((metadata) => metadata.key.startsWith(prefix)),
			truncated: false,
		};
	}
}

function routeRequest(input: {
	caseId: string;
	format?: string;
	photoId?: string;
	selectedAttachmentIds?: string[];
	sessionCookie: string;
	snapshotId?: string;
}) {
	const url = new URL(
		`https://app.example.test/api/incidents/${input.caseId}/export?report=comms`,
	);

	if (input.format) {
		url.searchParams.set("format", input.format);
	}

	if (input.photoId) {
		url.searchParams.set("photoId", input.photoId);
	}

	for (const attachmentId of input.selectedAttachmentIds ?? []) {
		url.searchParams.append("photoId", attachmentId);
	}

	if (input.snapshotId) {
		url.searchParams.set("snapshotId", input.snapshotId);
	}

	const csrf = mintCsrfToken(input.sessionCookie);
	return new NextRequest(url, {
		headers: {
			cookie: `ssfw_session=${input.sessionCookie}; ssfw_csrf=${csrf}`,
			"x-ssfw-csrf": csrf,
		},
	});
}

async function responseText(response: Response): Promise<string> {
	return await response.text().catch(() => "<unreadable response>");
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith(".") || specifier.startsWith("/");
}

function moduleUrl(path: string): string {
	return pathToFileURL(join(process.cwd(), path)).href;
}

function quoteIdent(identifier: string): string {
	return `"${identifier.replaceAll('"', '""')}"`;
}

function sqlString(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}
