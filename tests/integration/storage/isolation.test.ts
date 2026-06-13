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
const retentionModulePath = pathToFileURL(
	path.resolve("src/lib/storage/retention.ts"),
).href;
const { handleStorageUpload } = (await import(
	uploadRouteModulePath
)) as typeof import("../../../src/app/api/storage/upload/route");
const { handleStorageDownload } = (await import(
	downloadRouteModulePath
)) as typeof import("../../../src/app/api/storage/[...key]/route");
const {
	InvalidTenantStorageKeyError,
	StorageNotFoundError,
	tenantPrefix,
	tenantStorage,
} = (await import(
	storageModulePath
)) as typeof import("../../../src/lib/storage");
const { isKeyReferencedBySnapshot } = (await import(
	retentionModulePath
)) as typeof import("../../../src/lib/storage/retention");

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";
const userA = "33333333-3333-4333-8333-333333333333";
const userB = "55555555-5555-4555-8555-555555555555";
const sessionA = "44444444-4444-4444-8444-444444444444";
const sessionB = "66666666-6666-4666-8666-666666666666";
const csrfValue = "csrf-storage-token";

test("tenant A can read its own photo while tenant B's photo returns 404", async () => {
	const storage = new MemoryStorage();
	const traces: string[] = [];

	const tenantAUpload = await uploadSyntheticPhoto(storage, validSessionA());
	const tenantBUpload = await uploadSyntheticPhoto(storage, validSessionB());

	traces.push(`POST tenantA -> ${tenantAUpload.status}`);
	traces.push(`POST tenantB -> ${tenantBUpload.status}`);

	assert.equal(tenantAUpload.status, 201);
	assert.equal(tenantBUpload.status, 201);

	const tenantAKey = (await tenantAUpload.json()).attachment
		.storageKey as string;
	const tenantBKey = (await tenantBUpload.json()).attachment
		.storageKey as string;

	const ownRead = await handleStorageDownload(
		downloadRequest(tenantAKey, sessionA),
		{ params: { key: tenantAKey.split("/") } },
		{
			sessionValidator: validatorWithSession(validSessionA()),
			storage,
		},
	);
	const crossTenantRead = await handleStorageDownload(
		downloadRequest(tenantBKey, sessionA),
		{ params: { key: tenantBKey.split("/") } },
		{
			sessionValidator: validatorWithSession(validSessionA()),
			storage,
		},
	);

	traces.push(`GET tenantA own key -> ${ownRead.status}`);
	traces.push(`GET tenantA tenantB key -> ${crossTenantRead.status}`);

	assert.equal(ownRead.status, 200);
	assert.equal(
		(await ownRead.arrayBuffer().then(Buffer.from)).toString(),
		"synthetic-photo",
	);
	assert.equal(crossTenantRead.status, 404);
	assert.deepEqual(await crossTenantRead.json(), {
		code: "STORAGE_OBJECT_NOT_FOUND",
	});
	assert.deepEqual(traces, [
		"POST tenantA -> 201",
		"POST tenantB -> 201",
		"GET tenantA own key -> 200",
		"GET tenantA tenantB key -> 404",
	]);
});

test("tenantStorage list returns only the current tenant's keys", async () => {
	const rawStorage = new MemoryStorage();
	await rawStorage.put(`${tenantPrefix(tenantA)}/attachments/a.png`, "a");
	await rawStorage.put(`${tenantPrefix(tenantA)}/exports/report.pdf`, "report");
	await rawStorage.put(`${tenantPrefix(tenantB)}/attachments/b.png`, "b");

	const listed = await tenantStorage(tenantA, { storage: rawStorage }).list();

	assert.deepEqual(
		listed.items.map((item) => item.key),
		[
			`${tenantPrefix(tenantA)}/attachments/a.png`,
			`${tenantPrefix(tenantA)}/exports/report.pdf`,
		],
	);
});

test("removed-member session validation cuts off storage GET with 401", async () => {
	const storage = new MemoryStorage();
	const key = `${tenantPrefix(tenantA)}/attachments/a.png`;
	await storage.put(key, "a", { contentType: "image/png" });

	const response = await handleStorageDownload(
		downloadRequest(key, sessionA),
		{ params: { key: key.split("/") } },
		{
			sessionValidator: validatorWithSession(null),
			storage,
		},
	);

	assert.equal(response.status, 401);
	assert.deepEqual(await response.json(), { code: "AUTH_REQUIRED" });
});

test("tenantStorage rejects path traversal before storage adapter access", async () => {
	const rawStorage = new MemoryStorage();
	const storage = tenantStorage(tenantA, { storage: rawStorage });
	const craftedKey = "tenants/A/../B/foo";

	await assert.rejects(
		() => storage.put(craftedKey, "body"),
		InvalidTenantStorageKeyError,
	);
	await assert.rejects(
		() => storage.list(`${craftedKey}/`),
		InvalidTenantStorageKeyError,
	);
	assert.deepEqual([...rawStorage.objects.keys()], []);
});

test("snapshot attachment_refs retain referenced photo keys", async () => {
	// This bead mocks approval_snapshot.attachment_refs so storage isolation stays
	// independent of later workflow fixture expansion.
	const store = new MemorySnapshotAttachmentReferenceStore([
		{
			attachmentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			storageKey: `${tenantPrefix(tenantA)}/attachments/original.png`,
		},
	]);

	assert.equal(
		await isKeyReferencedBySnapshot(
			`${tenantPrefix(tenantA)}/attachments/original.png`,
			{ store },
		),
		true,
	);
	assert.equal(
		await isKeyReferencedBySnapshot(
			`${tenantPrefix(tenantA)}/attachments/replacement.png`,
			{ store },
		),
		false,
	);
});

test("photo replacement keeps the snapshot-referenced old key accessible", async () => {
	const rawStorage = new MemoryStorage();
	const tenantScoped = tenantStorage(tenantA, { storage: rawStorage });
	const originalRelativeKey = "attachments/original.png";
	const replacementRelativeKey = "attachments/replacement.png";
	const originalKey = `${tenantPrefix(tenantA)}/${originalRelativeKey}`;
	const replacementKey = `${tenantPrefix(tenantA)}/${replacementRelativeKey}`;
	const store = new MemorySnapshotAttachmentReferenceStore([
		{
			attachmentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
			storageKey: originalKey,
		},
	]);

	await tenantScoped.put(originalRelativeKey, "original-photo", {
		contentType: "image/png",
	});
	await tenantScoped.put(replacementRelativeKey, "replacement-photo", {
		contentType: "image/png",
	});

	assert.equal(await isKeyReferencedBySnapshot(originalKey, { store }), true);
	assert.equal(
		await isKeyReferencedBySnapshot(replacementKey, { store }),
		false,
	);
	assert.equal(
		(await tenantScoped.get(originalRelativeKey)).body.toString(),
		"original-photo",
	);
	assert.equal(
		(await tenantScoped.get(replacementRelativeKey)).body.toString(),
		"replacement-photo",
	);
});

type MockAttachmentRef = {
	readonly attachmentId?: string;
	readonly storageKey: string;
};

class MemorySnapshotAttachmentReferenceStore {
	private readonly retainedKeys: ReadonlySet<string>;

	constructor(refs: readonly MockAttachmentRef[]) {
		this.retainedKeys = new Set(refs.map((ref) => ref.storageKey));
	}

	async isKeyReferencedBySnapshot(key: string): Promise<boolean> {
		return this.retainedKeys.has(key);
	}
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
			.filter((metadata) => metadata.key.startsWith(prefix))
			.sort((left, right) => left.key.localeCompare(right.key));

		return {
			items: items.slice(0, limit),
			truncated: items.length > limit,
		};
	}
}

async function uploadSyntheticPhoto(
	storage: Storage,
	session: ValidatedSession,
): Promise<Response> {
	return handleStorageUpload(
		uploadRequest(
			new File(["synthetic-photo"], "synthetic.png", { type: "image/png" }),
			session.id,
		),
		{
			sessionValidator: validatorWithSession(session),
			storage,
		},
	);
}

function uploadRequest(file: File, sessionId: string): NextRequest {
	const formData = new FormData();
	formData.set("file", file);

	return new NextRequest("https://app.example.test/api/storage/upload", {
		body: formData,
		headers: authenticatedHeaders(sessionId),
		method: "POST",
	});
}

function downloadRequest(storageKey: string, sessionId: string): NextRequest {
	return new NextRequest(`https://app.example.test/api/storage/${storageKey}`, {
		headers: { cookie: `ssfw_session=${sessionId}` },
		method: "GET",
	});
}

function authenticatedHeaders(sessionId: string): Headers {
	return new Headers({
		cookie: `ssfw_session=${sessionId}; ssfw_csrf=${csrfValue}`,
		"x-ssfw-csrf": csrfValue,
	});
}

function validatorWithSession(session: ValidatedSession | null) {
	return async () => session;
}

function validSessionA(): ValidatedSession {
	return {
		deviceHint: "desktop",
		expiresAt: new Date("2026-06-05T00:00:00.000Z"),
		id: sessionA,
		lastSeenAt: new Date("2026-05-05T00:00:00.000Z"),
		tenantId: tenantA,
		userId: userA,
	};
}

function validSessionB(): ValidatedSession {
	return {
		...validSessionA(),
		id: sessionB,
		tenantId: tenantB,
		userId: userB,
	};
}

function dataModuleUrl(source: string) {
	return {
		shortCircuit: true,
		url: `data:text/javascript;charset=utf-8,${encodeURIComponent(source)}`,
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
