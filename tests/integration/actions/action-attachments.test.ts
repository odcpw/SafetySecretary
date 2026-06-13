import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
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
} from "../../../src/lib/storage/types.ts";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (context.parentURL && specifier.startsWith(".")) {
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
		}

		return nextResolve(specifier, context);
	},
});

const attachmentsModulePath = pathToFileURL(
	path.resolve("src/lib/actions/attachments.ts"),
).href;
const keysModulePath = pathToFileURL(
	path.resolve("src/lib/storage/keys.ts"),
).href;
const dbModulePath = pathToFileURL(path.resolve("src/lib/db/tenancy.ts")).href;
const {
	ActionAttachmentNotFoundError,
	ActionAttachmentValidationError,
	createActionAttachment,
	deleteActionAttachment,
	listActionAttachments,
} = (await import(
	attachmentsModulePath
)) as typeof import("../../../src/lib/actions/attachments");
const { tenantPrefix } = (await import(
	keysModulePath
)) as typeof import("../../../src/lib/storage/keys");

let migrated = false;

if (!process.env.DATABASE_URL) {
	test("action_attachment integration requires DATABASE_URL", () => {
		assert.fail("DATABASE_URL is required for action_attachment integration.");
	});
} else {
	const {
		dropTenantSchema,
		prisma,
		provisionTenantSchema,
		tenantDatabaseNames,
		withTenantConnection,
	} = (await import(
		dbModulePath
	)) as typeof import("../../../src/lib/db/tenancy");

	test("action_attachment schema provisions tenant-scoped metadata and storage references", async () => {
		await ensureMigrated();

		const tenantId = randomUUID();
		const otherTenantId = randomUUID();
		const userId = randomUUID();
		const otherUserId = randomUUID();
		const actionId = randomUUID();
		const otherTenantActionId = randomUUID();
		const names = tenantDatabaseNames(tenantId);
		const otherNames = tenantDatabaseNames(otherTenantId);
		const storage = new MemoryStorage();

		await prisma.user.createMany({
			data: [
				{
					email: `action-attachment-${userId}@example.test`,
					id: userId,
				},
				{
					email: `action-attachment-other-${otherUserId}@example.test`,
					id: otherUserId,
				},
			],
		});
		await prisma.tenant.create({
			data: {
				defaultLanguage: "en",
				id: tenantId,
				memberships: { create: { userId } },
				name: `ssfw-sgj ${tenantId}`,
			},
		});
		await prisma.tenant.create({
			data: {
				defaultLanguage: "en",
				id: otherTenantId,
				memberships: { create: { userId: otherUserId } },
				name: `ssfw-sgj-other ${otherTenantId}`,
			},
		});

		try {
			await provisionTenantSchema(tenantId, prisma);
			await provisionTenantSchema(otherTenantId, prisma);

			const columns = await prisma.$queryRaw<
				Array<{ column_name: string; data_type: string; is_nullable: string }>
			>`
				SELECT column_name, data_type, is_nullable
				FROM information_schema.columns
				WHERE table_schema = ${names.schemaName}
					AND table_name = 'action_attachment'
				ORDER BY ordinal_position
			`;

			assert.deepEqual(
				columns.map((column) => column.column_name),
				[
					"id",
					"action_item_id",
					"storage_path",
					"filename",
					"mime_type",
					"uploaded_by_user_id",
					"uploaded_at",
					"description",
				],
			);

			const constraints = await prisma.$queryRaw<Array<{ conname: string }>>`
				SELECT conname
				FROM pg_catalog.pg_constraint
				WHERE conrelid = (${names.schemaName} || '.action_attachment')::regclass
				ORDER BY conname
			`;

			assert.deepEqual(
				constraints.map((constraint) => constraint.conname),
				[
					"action_attachment_action_item_id_fkey",
					"action_attachment_description_not_blank",
					"action_attachment_filename_not_blank",
					"action_attachment_mime_type_not_blank",
					"action_attachment_pkey",
					"action_attachment_storage_path_key",
					"action_attachment_storage_path_not_blank",
					"action_attachment_storage_path_tenant_check",
					"action_attachment_uploaded_by_user_id_fkey",
				],
			);

			await insertAction(tenantId, actionId, "Replace guard");
			await insertAction(otherTenantId, otherTenantActionId, "Other guard");

			const attachment = await createActionAttachment({
				actionItemId: actionId,
				body: "synthetic-action-photo",
				description: "Guard before replacement.",
				filename: "guard-before.png",
				mimeType: "image/png",
				storage,
				tenantId,
				uploadedByUserId: userId,
			});

			assert.equal(attachment.actionItemId, actionId);
			assert.equal(attachment.filename, "guard-before.png");
			assert.equal(attachment.mimeType, "image/png");
			assert.equal(attachment.uploadedByUserId, userId);
			assert.equal(attachment.description, "Guard before replacement.");
			assert.match(
				attachment.storagePath,
				new RegExp(
					`^${tenantPrefix(tenantId)}/attachments/[0-9a-f-]{36}\\.png$`,
				),
			);
			assert.equal(
				(await storage.get(attachment.storagePath)).body.toString(),
				"synthetic-action-photo",
			);

			assert.deepEqual(await listActionAttachments(tenantId, actionId), [
				attachment,
			]);
			assert.deepEqual(
				await listActionAttachments(otherTenantId, actionId),
				[],
			);

			const objectCountBeforeRejectedUpload = storage.objects.size;
			await assert.rejects(
				() =>
					createActionAttachment({
						actionItemId: actionId,
						body: "<html>",
						filename: "bad.html",
						mimeType: "text/html",
						storage,
						tenantId,
						uploadedByUserId: userId,
					}),
				ActionAttachmentValidationError,
			);
			assert.equal(storage.objects.size, objectCountBeforeRejectedUpload);

			await assert.rejects(
				() =>
					createActionAttachment({
						actionItemId: actionId,
						body: "not-a-member",
						filename: "not-member.pdf",
						mimeType: "application/pdf",
						storage,
						tenantId,
						uploadedByUserId: otherUserId,
					}),
				ActionAttachmentNotFoundError,
			);
			assert.equal(storage.objects.size, objectCountBeforeRejectedUpload);

			const deleted = await deleteActionAttachment(tenantId, attachment.id);
			assert.deepEqual(deleted, attachment);
			assert.deepEqual(await listActionAttachments(tenantId, actionId), []);
			assert.equal(
				(await storage.get(attachment.storagePath)).body.toString(),
				"synthetic-action-photo",
			);

			await assert.rejects(() =>
				withTenantConnection(tenantId, (tx) =>
					tx.$queryRawUnsafe(
						`SELECT count(*)::bigint AS count FROM "${otherNames.schemaName}".action_attachment`,
					),
				),
			);

			const provisionHook = await prisma.$queryRaw<
				Array<{ has_action_attachment_hook: boolean }>
			>`
				SELECT
					pg_get_functiondef('shared.provision_tenant_schema(uuid, name)'::regprocedure)
						LIKE '%apply_action_attachment_schema%' AS has_action_attachment_hook
			`;

			assert.equal(provisionHook[0]?.has_action_attachment_hook, true);
		} finally {
			await dropTenantSchema(otherTenantId).catch(() => undefined);
			await dropTenantSchema(tenantId).catch(() => undefined);
			await prisma.tenantMembership.deleteMany({
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

	async function insertAction(
		tenantId: string,
		actionId: string,
		title: string,
	): Promise<void> {
		await withTenantConnection(tenantId, (tx) =>
			tx.$executeRawUnsafe(
				`INSERT INTO action_item (
					id,
					tenant_id,
					title,
					status,
					origin_type,
					origin_label,
					origin_created_at,
					priority
				) VALUES (
					$1::uuid,
					$2::uuid,
					$3,
					'open',
					'manual',
					$4,
					CURRENT_TIMESTAMP,
					'medium'
				)`,
				actionId,
				tenantId,
				title,
				`Manual: ${title}`,
			),
		);
	}
}

function ensureMigrated(): Promise<void> {
	if (migrated) {
		return Promise.resolve();
	}

	const result = spawnSync("pnpm", ["db:migrate"], {
		cwd: process.cwd(),
		env: process.env,
		encoding: "utf8",
	});

	assert.equal(
		result.status,
		0,
		`pnpm db:migrate failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
	);

	migrated = true;
	return Promise.resolve();
}

class MemoryStorage implements Storage {
	readonly objects = new Map<string, StorageObject>();

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
		assert.ok(object, `expected ${key} to exist`);
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
			.filter((metadata) => metadata.key.startsWith(prefix))
			.sort((left, right) => left.key.localeCompare(right.key));

		return {
			items: items.slice(0, limit),
			truncated: items.length > limit,
		};
	}
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
