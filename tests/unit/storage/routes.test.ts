import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { NextRequest } from "next/server.js";
import type { ValidatedSession } from "../../../src/lib/auth/session";
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
		if (
			specifier === "next/server" &&
			context.parentURL?.includes("/src/app/api/storage/")
		) {
			return nextResolve("next/server.js", context);
		}

		if (
			specifier === "../auth/cookies" &&
			context.parentURL?.endsWith("/src/lib/storage/auth.ts")
		) {
			return dataModuleUrl(
				'export const SESSION_COOKIE_NAME = "ssfw_session";',
			);
		}

		if (
			specifier === "../auth/session" &&
			context.parentURL?.endsWith("/src/lib/storage/auth.ts")
		) {
			return dataModuleUrl(
				"export async function validateSession() { return null; }",
			);
		}

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

const uploadRouteModulePath = pathToFileURL(
	path.resolve("src/app/api/storage/upload/route.ts"),
).href;
const downloadRouteModulePath = pathToFileURL(
	path.resolve("src/app/api/storage/[...key]/route.ts"),
).href;
const storageModulePath = pathToFileURL(
	path.resolve("src/lib/storage/index.ts"),
).href;
const { handleStorageUpload } = (await import(
	uploadRouteModulePath
)) as typeof import("../../../src/app/api/storage/upload/route");
const { handleStorageDownload } = (await import(
	downloadRouteModulePath
)) as typeof import("../../../src/app/api/storage/[...key]/route");
const { StorageNotFoundError, tenantPrefix } = (await import(
	storageModulePath
)) as typeof import("../../../src/lib/storage");

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";
const userA = "33333333-3333-4333-8333-333333333333";
const sessionCookie = "44444444-4444-4444-8444-444444444444";
const csrfValue = "csrf-storage-token";

test("upload writes a synthetic PNG through tenantStorage and records attachment metadata", async () => {
	const storage = new MemoryStorage();
	const rows: Array<{
		attachmentId: string;
		contentType: string;
		filename: string;
		sizeBytes: number;
		storageKey: string;
		uploadedBy: string;
	}> = [];

	const response = await handleStorageUpload(
		uploadRequest(
			new File([Buffer.from([0x89, 0x50, 0x4e, 0x47])], "site.png", {
				type: "image/png",
			}),
		),
		{
			sessionValidator: validatorWithSession(validSession()),
			storage,
			writeAttachment: async (row) => {
				rows.push(row);
				return row;
			},
		},
	);
	const body = await response.json();

	assert.equal(response.status, 201);
	assert.equal(rows.length, 1);
	assert.equal(body.attachment.storageKey, rows[0]?.storageKey);
	assert.match(
		body.attachment.storageKey,
		new RegExp(`^${tenantPrefix(tenantA)}/attachments/[0-9a-f-]+\\.png$`),
	);
	assert.deepEqual([...storage.objects.keys()], [body.attachment.storageKey]);
	assert.equal(storage.objects.get(body.attachment.storageKey)?.body.length, 4);
	assert.deepEqual(rows[0], {
		attachmentId: body.attachment.attachmentId,
		contentType: "image/png",
		filename: "site.png",
		sizeBytes: 4,
		storageKey: body.attachment.storageKey,
		uploadedBy: userA,
	});
});

test("anonymous upload is rejected before storage or row writes", async () => {
	const storage = new MemoryStorage();
	const rows: unknown[] = [];

	const response = await handleStorageUpload(
		uploadRequest(new File(["png"], "site.png", { type: "image/png" })),
		{
			sessionValidator: validatorWithSession(null),
			storage,
			writeAttachment: async (row) => {
				rows.push(row);
				return row;
			},
		},
	);

	assert.equal(response.status, 401);
	assert.equal(storage.objects.size, 0);
	assert.deepEqual(rows, []);
});

test("authenticated upload without CSRF is rejected before storage writes", async () => {
	const storage = new MemoryStorage();
	const formData = new FormData();
	formData.set("file", new File(["png"], "site.png", { type: "image/png" }));

	const response = await handleStorageUpload(
		new NextRequest("https://app.example.test/api/storage/upload", {
			body: formData,
			headers: { cookie: `${sessionCookieName()}=${sessionCookie}` },
			method: "POST",
		}),
		{
			sessionValidator: validatorWithSession(validSession()),
			storage,
		},
	);

	assert.equal(response.status, 403);
	assert.equal(storage.objects.size, 0);
});

test("cross-tenant download returns 404 and does not leak existence", async () => {
	const storage = new MemoryStorage();
	const tenantBKey = `${tenantPrefix(tenantB)}/attachments/file.png`;
	await storage.put(tenantBKey, "tenant-b-secret", {
		contentType: "image/png",
	});

	const response = await handleStorageDownload(
		downloadRequest(tenantBKey),
		{ params: { key: tenantBKey.split("/") } },
		{
			sessionValidator: validatorWithSession(validSession()),
			storage,
		},
	);

	assert.equal(response.status, 404);
	assert.deepEqual(await response.json(), { code: "STORAGE_OBJECT_NOT_FOUND" });
});

test("same-tenant download streams the stored object", async () => {
	const storage = new MemoryStorage();
	const tenantAKey = `${tenantPrefix(tenantA)}/attachments/file.pdf`;
	await storage.put(tenantAKey, "pdf-body", { contentType: "application/pdf" });

	const response = await handleStorageDownload(
		downloadRequest(tenantAKey),
		{ params: { key: tenantAKey.split("/") } },
		{
			sessionValidator: validatorWithSession(validSession()),
			storage,
		},
	);

	assert.equal(response.status, 200);
	assert.equal(response.headers.get("content-type"), "application/pdf");
	assert.equal(response.headers.get("content-length"), "8");
	assert.equal(await response.text(), "pdf-body");
});

test("download returns 404 for invalid same-tenant relative keys", async () => {
	const storage = new MemoryStorage();
	const invalidKey = `${tenantPrefix(tenantA)}/shared/file.png`;

	const response = await handleStorageDownload(
		downloadRequest(invalidKey),
		{ params: { key: invalidKey.split("/") } },
		{
			sessionValidator: validatorWithSession(validSession()),
			storage,
		},
	);

	assert.equal(response.status, 404);
	assert.deepEqual(await response.json(), { code: "STORAGE_OBJECT_NOT_FOUND" });
});

test("disallowed upload content-type is rejected", async () => {
	const storage = new MemoryStorage();

	const response = await handleStorageUpload(
		uploadRequest(new File(["plain"], "notes.txt", { type: "text/plain" })),
		{
			sessionValidator: validatorWithSession(validSession()),
			storage,
		},
	);

	assert.equal(response.status, 415);
	assert.equal(storage.objects.size, 0);
});

test("configured upload allow-list can narrow accepted content types", async () => {
	const storage = new MemoryStorage();

	const response = await handleStorageUpload(
		uploadRequest(new File(["pdf"], "report.pdf", { type: "application/pdf" })),
		{
			env: { ...process.env, STORAGE_ALLOWED_CONTENT_TYPES: "image/png" },
			sessionValidator: validatorWithSession(validSession()),
			storage,
		},
	);

	assert.equal(response.status, 415);
	assert.equal(storage.objects.size, 0);
});

test("oversized upload payload is rejected", async () => {
	const storage = new MemoryStorage();

	const response = await handleStorageUpload(
		uploadRequest(new File(["1234"], "site.png", { type: "image/png" })),
		{
			env: { ...process.env, STORAGE_UPLOAD_MAX_BYTES: "3" },
			sessionValidator: validatorWithSession(validSession()),
			storage,
		},
	);

	assert.equal(response.status, 413);
	assert.equal(storage.objects.size, 0);
});

test("removed-membership session validation cuts off storage reads", async () => {
	const storage = new MemoryStorage();
	const tenantAKey = `${tenantPrefix(tenantA)}/attachments/file.png`;
	await storage.put(tenantAKey, "png-body", { contentType: "image/png" });

	const response = await handleStorageDownload(
		downloadRequest(tenantAKey),
		{ params: { key: tenantAKey.split("/") } },
		{
			sessionValidator: validatorWithSession(null),
			storage,
		},
	);

	assert.equal(response.status, 401);
});

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

		if (!object) {
			throw new StorageNotFoundError(key);
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

function uploadRequest(file: File): NextRequest {
	const formData = new FormData();
	formData.set("file", file);

	return new NextRequest("https://app.example.test/api/storage/upload", {
		body: formData,
		headers: authenticatedHeaders(),
		method: "POST",
	});
}

function downloadRequest(storageKey: string): NextRequest {
	return new NextRequest(`https://app.example.test/api/storage/${storageKey}`, {
		headers: { cookie: `${sessionCookieName()}=${sessionCookie}` },
		method: "GET",
	});
}

function authenticatedHeaders(): Headers {
	return new Headers({
		cookie: `${sessionCookieName()}=${sessionCookie}; ssfw_csrf=${csrfValue}`,
		"x-ssfw-csrf": csrfValue,
	});
}

function sessionCookieName(): string {
	return "ssfw_session";
}

function validatorWithSession(session: ValidatedSession | null) {
	return async () => session;
}

function dataModuleUrl(source: string) {
	return {
		shortCircuit: true,
		url: `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`,
	};
}

function validSession(): ValidatedSession {
	return {
		deviceHint: "desktop",
		expiresAt: new Date("2026-06-05T00:00:00.000Z"),
		id: sessionCookie,
		lastSeenAt: new Date("2026-05-05T00:00:00.000Z"),
		tenantId: tenantA,
		userId: userA,
	};
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
