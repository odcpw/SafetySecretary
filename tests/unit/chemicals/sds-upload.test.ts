import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import type {
	Storage,
	StorageBody,
	StorageListResult,
	StorageObject,
	StorageObjectMetadata,
	StoragePutOptions,
} from "../../../src/lib/storage";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (!context.parentURL || !specifier.startsWith(".")) {
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

const uploadModulePath = "../../../src/lib/chemicals/sds-upload.ts";
const { SdsUploadError, storeSdsUpload } = (await import(
	uploadModulePath
)) as typeof import("../../../src/lib/chemicals/sds-upload");

const tenantId = "11111111-1111-4111-8111-111111111111";
const profileId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";

test("SDS upload stores tenant-scoped source file with provenance metadata", async () => {
	const storage = new MemoryStorage();
	const upload = await storeSdsUpload({
		file: fileLike({
			body: "Section 8: Use local exhaust ventilation.",
			name: "fixture-sds.pdf",
			type: "application/pdf",
		}),
		profileId,
		storage,
		tenantId,
		userId,
	});

	assert.equal(upload.filename, "fixture-sds.pdf");
	assert.equal(upload.contentType, "application/pdf");
	assert.equal(
		upload.body.toString("utf8"),
		"Section 8: Use local exhaust ventilation.",
	);
	assert.match(
		upload.storagePath,
		new RegExp(`^tenants/${tenantId}/sds/${profileId}/.*\\.pdf$`),
	);
	assert.equal(
		storage.objects.get(upload.storagePath)?.customMetadata?.filename,
		"fixture-sds.pdf",
	);
	assert.equal(
		storage.objects.get(upload.storagePath)?.customMetadata?.uploadedBy,
		userId,
	);
});

test("SDS upload rejects unsupported content type and oversize files", async () => {
	await assert.rejects(
		() =>
			storeSdsUpload({
				file: fileLike({
					body: "not an SDS",
					name: "fixture.exe",
					type: "application/octet-stream",
				}),
				profileId,
				storage: new MemoryStorage(),
				tenantId,
				userId,
			}),
		SdsUploadError,
	);

	await assert.rejects(
		() =>
			storeSdsUpload({
				env: { SDS_UPLOAD_MAX_BYTES: "4" } as unknown as NodeJS.ProcessEnv,
				file: fileLike({
					body: "too large",
					name: "fixture-sds.pdf",
					type: "application/pdf",
				}),
				profileId,
				storage: new MemoryStorage(),
				tenantId,
				userId,
			}),
		SdsUploadError,
	);
});

function fileLike(input: { body: string; name: string; type: string }) {
	const body = Buffer.from(input.body);
	return {
		arrayBuffer: async () =>
			body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
		name: input.name,
		size: body.byteLength,
		type: input.type,
	};
}

class MemoryStorage implements Storage {
	readonly objects = new Map<
		string,
		StorageObjectMetadata & { body: Buffer }
	>();

	async put(
		key: string,
		body: StorageBody,
		options: StoragePutOptions = {},
	): Promise<StorageObjectMetadata> {
		const buffer = Buffer.from(body as Buffer);
		const metadata: StorageObjectMetadata & { body: Buffer } = {
			body: buffer,
			contentType: options.contentType,
			customMetadata: options.customMetadata,
			key,
			sizeBytes: options.sizeBytes ?? buffer.byteLength,
			updatedAt: new Date("2026-05-06T08:00:00.000Z"),
		};
		this.objects.set(key, metadata);
		return metadata;
	}

	async get(key: string): Promise<StorageObject> {
		const object = this.objects.get(key);
		if (!object) {
			throw new Error("not found");
		}
		return {
			body: object.body,
			metadata: object,
		};
	}

	async head(key: string): Promise<StorageObjectMetadata> {
		const object = this.objects.get(key);
		if (!object) {
			throw new Error("not found");
		}
		return object;
	}

	async delete(key: string): Promise<void> {
		this.objects.delete(key);
	}

	async list(prefix: string): Promise<StorageListResult> {
		return {
			items: [...this.objects.values()].filter((item) =>
				item.key.startsWith(prefix),
			),
			truncated: false,
		};
	}
}
