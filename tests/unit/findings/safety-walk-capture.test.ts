import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
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
		if (!context.parentURL || !specifier.startsWith(".")) {
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

const {
	SafetyWalkCaptureValidationError,
	captureSafetyWalkFinding,
	parseSafetyWalkCaptureForm,
	prepareSafetyWalkActionCreatePayload,
	prepareSafetyWalkFindingRecord,
	storeSafetyWalkPhoto,
} = await import("../../../src/lib/findings/safety-walk-capture");

const tenantId = "11111111-1111-4111-8111-111111111111";
const actorUserId = "22222222-2222-4222-8222-222222222222";
const actionId = "33333333-3333-4333-8333-333333333333";

test("safety walk parser keeps the fast path and optional prompts", () => {
	const formData = new FormData();
	formData.set("description", "Guard was bypassed during setup.");
	formData.set("locationText", "Line 4");
	formData.set("severity", "high");
	formData.set("goodCatch", "on");
	formData.set("workAsDoneContext", "Operator stopped before restart.");
	formData.set("createAction", "on");
	formData.set("actionOwnerText", "Maintenance lead");

	const payload = parseSafetyWalkCaptureForm(formData);

	assert.equal(payload?.title, "Guard was bypassed during setup");
	assert.equal(payload?.description, "Guard was bypassed during setup.");
	assert.equal(payload?.locationText, "Line 4");
	assert.equal(payload?.severity, "high");
	assert.equal(payload?.goodCatch, true);
	assert.equal(payload?.createAction, true);
	assert.equal(payload?.actionOwnerText, "Maintenance lead");
	assert.equal(payload?.workAsDoneContext, "Operator stopped before restart.");
});

test("safety walk action bridge uses finding origin contract", () => {
	const payload = parseSafetyWalkCaptureForm(
		formDataFrom({
			actionDueDate: "2026-05-12",
			actionOwnerText: "Warehouse supervisor",
			description: "Pedestrian route blocked by pallets.",
			locationText: "Goods-in aisle",
			severity: "critical",
		}),
	);
	assert.ok(payload);

	const finding = prepareSafetyWalkFindingRecord(payload, {
		actorUserId,
		tenantId,
	});
	const action = prepareSafetyWalkActionCreatePayload(finding, payload);

	assert.equal(finding.findingType, "safety_walk");
	assert.equal(finding.status, "open");
	assert.equal(action.originType, "safety_walk");
	assert.equal(action.originId, finding.id);
	assert.match(action.originLabel ?? "", /^Safety walk: Goods-in aisle/);
	assert.equal(action.priority, "critical");
	assert.equal(action.ownerText, "Warehouse supervisor");
	assert.equal(action.dueDate, "2026-05-12");
});

test("safety walk photo rejects oversized file before reading bytes", async () => {
	let arrayBufferCalled = false;

	await assert.rejects(
		() =>
			storeSafetyWalkPhoto({
				env: { ...process.env, STORAGE_UPLOAD_MAX_BYTES: "3" },
				file: {
					async arrayBuffer() {
						arrayBufferCalled = true;
						return new Uint8Array([1, 2, 3, 4]).buffer;
					},
					name: "guard.jpg",
					size: 4,
					type: "image/jpeg",
				},
				findingId: "44444444-4444-4444-8444-444444444444",
				storage: new MemoryStorage(),
				tenantId,
			}),
		(error: unknown) =>
			error instanceof SafetyWalkCaptureValidationError &&
			error.code === "UPLOAD_TOO_LARGE" &&
			error.status === 413,
	);
	assert.equal(arrayBufferCalled, false);
});

test("capture persists tenant-bound photo and optional action through action surface", async () => {
	const storage = new MemoryStorage();
	const formData = formDataFrom({
		actionTitle: "Clear marked pedestrian route",
		createAction: "on",
		departmentText: "Logistics",
		description: "Pedestrian route blocked by pallets.",
		locationText: "Goods-in aisle",
		photo: new TestFile("route.jpg", "image/jpeg", [1, 2, 3]),
		severity: "high",
	});
	const insertedFindings: unknown[] = [];
	const linkedActions: string[] = [];
	const actionInputs: unknown[] = [];

	const result = await captureSafetyWalkFinding(
		formData,
		{ actorUserId, tenantId },
		{
			createAction: async (input) => {
				actionInputs.push(input);
				return {
					attachmentCount: 0,
					attachments: [],
					completedAt: null,
					createdAt: new Date("2026-05-05T00:00:00.000Z"),
					description: input.action.description ?? null,
					dueDate: null,
					effectivenessResult: "unknown",
					id: actionId,
					isSafetyCritical: false,
					originCreatedAt: new Date(
						input.action.originCreatedAt ?? "2026-05-05T00:00:00.000Z",
					),
					originId: input.action.originId ?? null,
					originLabel: input.action.originLabel ?? "Safety walk",
					originType: input.action.originType,
					priority: input.action.priority ?? "medium",
					status: "open",
					tenantId,
					title: input.action.title,
					updatedAt: new Date("2026-05-05T00:00:00.000Z"),
					verificationNote: null,
					verificationStatus: "not_required",
					verifiedAt: null,
					verifiedByEmail: null,
					verifiedByUserId: null,
					assigneeEmail: null,
					assigneeLabel: null,
					assigneeUserId: null,
					departmentText: null,
					ownerText: null,
				};
			},
			insertFinding: async (finding) => {
				insertedFindings.push(finding);
				return finding;
			},
			linkFindingAction: async (finding, linkedActionId) => {
				linkedActions.push(linkedActionId);
				return {
					...finding,
					actionItemId: linkedActionId,
					status: "action_created",
				};
			},
			storage,
		},
	);

	assert.equal(insertedFindings.length, 1);
	assert.equal(actionInputs.length, 1);
	assert.deepEqual(linkedActions, [actionId]);
	assert.equal(result.action?.id, actionId);
	assert.equal(result.finding.status, "action_created");
	assert.equal(result.finding.actionItemId, actionId);
	assert.match(
		result.finding.photoStoragePath ?? "",
		new RegExp(
			`^tenants/${tenantId}/findings/safety-walk/${result.finding.id}/`,
		),
	);
	assert.equal(storage.objects.size, 1);
	const actionInput = actionInputs[0] as {
		readonly action: {
			readonly originId?: string | null;
			readonly originType: string;
		};
	};
	assert.equal(actionInput.action.originType, "safety_walk");
	assert.equal(actionInput.action.originId, result.finding.id);
});

function formDataFrom(values: Record<string, string | TestFile | undefined>): {
	get(name: string): FormDataEntryValue | null;
} {
	return {
		get(name: string) {
			return (values[name] as FormDataEntryValue | undefined) ?? null;
		},
	};
}

class TestFile {
	readonly name: string;
	readonly size: number;
	readonly type: string;
	private readonly body: Uint8Array;

	constructor(name: string, type: string, body: readonly number[]) {
		this.name = name;
		this.type = type;
		this.body = new Uint8Array(body);
		this.size = this.body.byteLength;
	}

	async arrayBuffer(): Promise<ArrayBuffer> {
		return new Uint8Array(this.body).buffer;
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
			throw new Error("STORAGE_NOT_FOUND");
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
