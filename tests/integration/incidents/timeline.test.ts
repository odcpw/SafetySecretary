import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
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

const databaseUrl = process.env.DATABASE_URL;
const csrfValue = "timeline-csrf-token";
const timelineMessageKeys = [
	"incident.timeline.addEvent",
	"incident.timeline.addTitle",
	"incident.timeline.confidence",
	"incident.timeline.confidence.CONFIRMED",
	"incident.timeline.confidence.LIKELY",
	"incident.timeline.confidence.UNCLEAR",
	"incident.timeline.deleteEvent",
	"incident.timeline.description",
	"incident.timeline.empty",
	"incident.timeline.error.invalidEventId",
	"incident.timeline.error.invalidPayload",
	"incident.timeline.error.invalidSource",
	"incident.timeline.error.invalidUpload",
	"incident.timeline.error.saveFailed",
	"incident.timeline.error.unsupportedUpload",
	"incident.timeline.error.uploadFailed",
	"incident.timeline.error.uploadTooLarge",
	"incident.timeline.eventAt",
	"incident.timeline.listTitle",
	"incident.timeline.photoUnnamed",
	"incident.timeline.photoUpload",
	"incident.timeline.photos",
	"incident.timeline.photosEmpty",
	"incident.timeline.saveEvent",
	"incident.timeline.sourceNeedsAccount",
	"incident.timeline.sources",
	"incident.timeline.sourcesEmpty",
	"incident.timeline.sourcesNone",
	"incident.timeline.text",
	"incident.timeline.timeLabel",
	"incident.timeline.title",
	"incident.timeline.untimedEvent",
	"incident.timeline.uploadPhoto",
] as const;

const { CSRF_COOKIE_NAME } = (await import(
	moduleUrl("src/lib/auth/cookies.ts")
)) as typeof import("../../../src/lib/auth/cookies");
const { t } = (await import(
	moduleUrl("src/lib/i18n/t.ts")
)) as typeof import("../../../src/lib/i18n/t");
const { LOCALES } = (await import(
	moduleUrl("src/lib/i18n/types.ts")
)) as typeof import("../../../src/lib/i18n/types");

test("timeline route and page labels have DE/EN/FR/IT catalog coverage", () => {
	for (const locale of LOCALES) {
		for (const key of timelineMessageKeys) {
			const rendered = t(key, locale);
			assert.notEqual(rendered, key, `${locale}.${key} must resolve`);
			assert.ok(rendered.trim(), `${locale}.${key} must not be empty`);
		}
	}

	const pageSource = readFileSync(
		"src/app/incidents/[id]/timeline/page.tsx",
		"utf8",
	);
	const photoRouteSource = readFileSync(
		"src/app/api/incidents/[id]/timeline/[eventId]/photos/route.ts",
		"utf8",
	);

	assert.match(pageSource, /messageKey\("incident", "timeline", "title"\)/);
	assert.match(
		pageSource,
		/messageKey\("incident", "timeline", "uploadPhoto"\)/,
	);
	assert.doesNotMatch(photoRouteSource, /dispatch|llm|vision/i);
});

if (!databaseUrl) {
	test("II timeline integration", {
		skip: "DATABASE_URL is required",
	}, () => {});
} else {
	const { NextRequest } = (await import(
		"next/server.js"
	)) as typeof import("next/server");
	const timelineRoute = (await import(
		moduleUrl("src/app/api/incidents/[id]/timeline/route.ts")
	)) as typeof import("../../../src/app/api/incidents/[id]/timeline/route");
	const photoRoute = (await import(
		moduleUrl("src/app/api/incidents/[id]/timeline/[eventId]/photos/route.ts")
	)) as typeof import("../../../src/app/api/incidents/[id]/timeline/[eventId]/photos/route");
	const { prisma, dropTenantSchema, withTenantConnection } = (await import(
		moduleUrl("src/lib/db/index.ts")
	)) as typeof import("../../../src/lib/db");
	const { MockProvider } = (await import(
		moduleUrl("src/lib/llm/mock.ts")
	)) as typeof import("../../../src/lib/llm/mock");
	const { StorageNotFoundError, tenantPrefix } = (await import(
		moduleUrl("src/lib/storage/index.ts")
	)) as typeof import("../../../src/lib/storage");

	test("timeline CRUD, multi-witness sources, tenant scope, and photo upload stay storage-only", async () => {
		const tenantA = await seedTenant("a");
		const tenantB = await seedTenant("b");
		const caseId = randomUUID();

		try {
			await insertIncidentCase({
				caseId,
				tenantId: tenantA.tenantId,
				userId: tenantA.userId,
			});
			const persons = await insertPersonsWithAccounts(tenantA.tenantId, caseId);

			const empty = await timelineRoute.GET(
				jsonRequest({
					tenantId: tenantA.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/timeline`,
					userId: tenantA.userId,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(empty.status, 200, await responseText(empty));
			assert.deepEqual(eventList(await empty.json()), []);

			const created = await timelineRoute.POST(
				jsonRequest({
					body: {
						confidence: "LIKELY",
						eventAt: "2026-05-05T07:10:00.000Z",
						sourcePersonIds: [persons.annaId, persons.benId],
						text: "Machine guard was open while the line was running.",
						timeLabel: "Before stop",
					},
					method: "POST",
					tenantId: tenantA.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/timeline`,
					userId: tenantA.userId,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(created.status, 201);
			const createdEvent = record(record(await created.json()).event);
			const eventId = stringField(createdEvent.id, "event.id");
			assert.equal(createdEvent.confidence, "LIKELY");
			assert.deepEqual(
				recordArray(createdEvent.sources).map((source) =>
					stringField(record(source).personId, "source.personId"),
				),
				[persons.annaId, persons.benId],
			);

			const earlier = await timelineRoute.POST(
				jsonRequest({
					body: {
						confidence: "UNCLEAR",
						eventAt: "2026-05-05T06:55:00.000Z",
						sourcePersonIds: [],
						text: "Unconfirmed noise was reported.",
						timeLabel: "Start-up",
					},
					method: "POST",
					tenantId: tenantA.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/timeline`,
					userId: tenantA.userId,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(earlier.status, 201);
			const earlierEventId = stringField(
				record(record(await earlier.json()).event).id,
				"earlier.event.id",
			);

			const ordered = await timelineRoute.GET(
				jsonRequest({
					tenantId: tenantA.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/timeline`,
					userId: tenantA.userId,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(ordered.status, 200);
			assert.deepEqual(
				eventList(await ordered.json()).map((event) =>
					stringField(record(event).id, "ordered.event.id"),
				),
				[earlierEventId, eventId],
			);

			const updated = await timelineRoute.PATCH(
				jsonRequest({
					body: {
						confidence: "CONFIRMED",
						eventAt: "2026-05-05T07:12:00.000Z",
						eventId,
						sourcePersonIds: [persons.annaId],
						text: "Anna confirmed the guard was open during operation.",
						timeLabel: "Confirmed interview",
					},
					method: "PATCH",
					tenantId: tenantA.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/timeline`,
					userId: tenantA.userId,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(updated.status, 200);
			const updatedEvent = record(record(await updated.json()).event);
			assert.equal(updatedEvent.confidence, "CONFIRMED");
			assert.deepEqual(
				recordArray(updatedEvent.sources).map((source) =>
					stringField(record(source).personId, "updated.source.personId"),
				),
				[persons.annaId],
			);

			const crossTenant = await timelineRoute.GET(
				jsonRequest({
					tenantId: tenantB.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/timeline`,
					userId: tenantB.userId,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(crossTenant.status, 404);

			const storage = new MemoryStorage(StorageNotFoundError);
			const mockProvider = new MockProvider();
			const upload = await photoRoute.handleTimelinePhotoUpload(
				photoUploadRequest({
					file: new File([Buffer.from([0x89, 0x50, 0x4e, 0x47])], "guard.png", {
						type: "image/png",
					}),
					tenantId: tenantA.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/timeline/${eventId}/photos`,
					userId: tenantA.userId,
				}),
				{ params: { eventId, id: caseId } },
				{ storage },
			);
			assert.equal(upload.status, 201, await responseText(upload));
			const attachment = record(record(await upload.json()).attachment);
			assert.equal(attachment.eventId, eventId);
			assert.match(
				stringField(attachment.storageKey, "attachment.storageKey"),
				new RegExp(
					`^${tenantPrefix(tenantA.tenantId)}/attachments/[0-9a-f-]+\\.png$`,
				),
			);
			assert.deepEqual([...storage.objects.keys()], [attachment.storageKey]);
			assert.equal(mockProvider.visionInvocationCount, 0);

			const inspected = await inspectTimeline(tenantA.tenantId, caseId);
			assert.deepEqual(inspected, {
				attachmentCount: 1,
				attachmentEventIds: [eventId],
				eventCount: 2,
				sourceCount: 1,
			});
			console.log(
				`DB inspection II timeline: incident_timeline_event=${inspected.eventCount}; incident_timeline_source=${inspected.sourceCount}; incident_attachment=${inspected.attachmentCount}`,
			);

			const deleted = await timelineRoute.POST(
				timelineFormRequest({
					fields: [
						["_action", "update"],
						["eventId", earlierEventId],
						["_action", "delete"],
					],
					tenantId: tenantA.tenantId,
					url: `https://app.example.test/api/incidents/${caseId}/timeline`,
					userId: tenantA.userId,
				}),
				{ params: { id: caseId } },
			);
			assert.equal(deleted.status, 200);
			assert.equal(
				(await inspectTimeline(tenantA.tenantId, caseId)).eventCount,
				1,
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
				name: `ssfw-leg-${label}-${randomUUID()}`,
			},
		});
		const user = await prisma.user.create({
			data: {
				email: `ssfw-leg-${label}-${randomUUID()}@example.invalid`,
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
				'II timeline test',
				'2026-05-05T06:45:00Z'::timestamptz,
				'NEAR_MISS',
				'Safety lead',
				'en',
				${sqlString(input.userId)}::uuid
			)`,
		);
	}

	async function insertPersonsWithAccounts(
		tenantId: string,
		caseId: string,
	): Promise<{ annaId: string; benId: string }> {
		const annaId = randomUUID();
		const benId = randomUUID();
		const annaAccountId = randomUUID();
		const benAccountId = randomUUID();

		await withTenantConnection(tenantId, async (tx) => {
			await tx.$executeRaw`
				INSERT INTO incident_person (
					id,
					case_id,
					role,
					name,
					other_info
				) VALUES
					(${annaId}::uuid, ${caseId}::uuid, 'witness', 'Anna Witness', NULL),
					(${benId}::uuid, ${caseId}::uuid, 'witness', 'Ben Witness', NULL)
			`;
			await tx.$executeRaw`
				INSERT INTO incident_account (
					id,
					case_id,
					person_id,
					raw_statement
				) VALUES
					(${annaAccountId}::uuid, ${caseId}::uuid, ${annaId}::uuid, 'Anna saw the guard open.'),
					(${benAccountId}::uuid, ${caseId}::uuid, ${benId}::uuid, 'Ben saw the line running.')
			`;
		});

		return { annaId, benId };
	}

	async function inspectTimeline(
		tenantId: string,
		caseId: string,
	): Promise<{
		attachmentCount: number;
		attachmentEventIds: string[];
		eventCount: number;
		sourceCount: number;
	}> {
		return withTenantConnection(tenantId, async (tx) => {
			const [events, sources, attachments] = await Promise.all([
				tx.$queryRaw<Array<{ id: string }>>`
					SELECT id::text AS id
					FROM incident_timeline_event
					WHERE case_id = ${caseId}::uuid
				`,
				tx.$queryRaw<Array<{ id: string }>>`
					SELECT source.id::text AS id
					FROM incident_timeline_source source
					JOIN incident_timeline_event event
						ON event.id = source.timeline_event_id
					WHERE event.case_id = ${caseId}::uuid
				`,
				tx.$queryRaw<Array<{ eventId: string }>>`
					SELECT attachment.event_id::text AS "eventId"
					FROM incident_attachment attachment
					JOIN incident_timeline_event event
						ON event.id = attachment.event_id
					WHERE event.case_id = ${caseId}::uuid
					ORDER BY attachment.created_at ASC, attachment.id ASC
				`,
			]);

			return {
				attachmentCount: attachments.length,
				attachmentEventIds: attachments.map((attachment) => attachment.eventId),
				eventCount: events.length,
				sourceCount: sources.length,
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

	function jsonRequest(input: {
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

	function photoUploadRequest(input: {
		file: File;
		tenantId: string;
		url: string;
		userId: string;
	}) {
		const formData = new FormData();
		formData.set("file", input.file);

		return new NextRequest(input.url, {
			body: formData,
			headers: {
				cookie: `${CSRF_COOKIE_NAME}=${csrfValue}`,
				accept: "application/json",
				"x-ssfw-csrf": csrfValue,
				"x-ssfw-tenant-id": input.tenantId,
				"x-ssfw-user-id": input.userId,
			},
			method: "POST",
		});
	}

	function timelineFormRequest(input: {
		fields: Array<[string, string]>;
		tenantId: string;
		url: string;
		userId: string;
	}) {
		const formData = new FormData();

		for (const [key, value] of input.fields) {
			formData.append(key, value);
		}

		return new NextRequest(input.url, {
			body: formData,
			headers: {
				accept: "application/json",
				"x-ssfw-tenant-id": input.tenantId,
				"x-ssfw-user-id": input.userId,
			},
			method: "POST",
		});
	}
}

class MemoryStorage implements Storage {
	readonly objects = new Map<string, StorageObject>();
	private readonly notFoundError: new (
		key: string,
	) => Error;

	constructor(notFoundError: new (key: string) => Error) {
		this.notFoundError = notFoundError;
	}

	async put(
		key: string,
		body: StorageBody,
		options: StoragePutOptions = {},
	): Promise<StorageObjectMetadata> {
		const bodyBuffer = normalizeBody(body);
		const metadata = {
			key,
			contentType: options.contentType,
			customMetadata: options.customMetadata,
			sizeBytes: bodyBuffer.byteLength,
			updatedAt: new Date("2026-05-05T00:00:00.000Z"),
		};
		this.objects.set(key, { body: bodyBuffer, metadata });
		return metadata;
	}

	async get(key: string): Promise<StorageObject> {
		const object = this.objects.get(key);

		if (!object) {
			throw new this.notFoundError(key);
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
		prefix: string,
		options: StorageListOptions = {},
	): Promise<StorageListResult> {
		const limit = options.limit ?? Number.POSITIVE_INFINITY;
		const items = [...this.objects.values()]
			.map((object) => object.metadata)
			.filter((metadata) => metadata.key.startsWith(prefix));

		return {
			items: items.slice(0, limit),
			truncated: items.length > limit,
		};
	}
}

function eventList(payload: unknown): unknown[] {
	return recordArray(record(payload).events);
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

async function responseText(response: Response): Promise<string> {
	return response.clone().text();
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

function normalizeBody(body: StorageBody): Buffer {
	if (Buffer.isBuffer(body)) {
		return body;
	}

	if (typeof body === "string") {
		return Buffer.from(body);
	}

	if (body instanceof ArrayBuffer) {
		return Buffer.from(body);
	}

	return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith(".") || specifier.startsWith("/");
}

function moduleUrl(relativePath: string): string {
	return pathToFileURL(`${process.cwd()}/${relativePath}`).href;
}
