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
	AuditInspectionCaptureValidationError,
	captureAuditInspectionFindings,
	parseAuditInspectionCaptureForm,
	prepareAuditInspectionActionCreatePayload,
	prepareAuditInspectionFindingRecord,
	reportableAuditInspectionItems,
	storeAuditInspectionPhoto,
} = await import("../../../src/lib/findings/audit-inspection-capture");
const { auditInspectionDraftStorageKey } = await import(
	"../../../src/lib/findings/audit-inspection-draft"
);

const tenantId = "11111111-1111-4111-8111-111111111111";
const actorUserId = "22222222-2222-4222-8222-222222222222";
const actionId = "33333333-3333-4333-8333-333333333333";

test("audit inspection draft key is scoped by tenant and user", () => {
	const tenantScopedKey = auditInspectionDraftStorageKey({
		tenantId,
		userId: actorUserId,
	});

	assert.match(
		tenantScopedKey,
		new RegExp(`^safetysecretary:audit-inspection-capture:v1:${tenantId}:`),
	);
	assert.notEqual(
		tenantScopedKey,
		auditInspectionDraftStorageKey({
			tenantId,
			userId: "55555555-5555-4555-8555-555555555555",
		}),
	);
	assert.notEqual(
		tenantScopedKey,
		auditInspectionDraftStorageKey({
			tenantId: "66666666-6666-4666-8666-666666666666",
			userId: actorUserId,
		}),
	);
});

test("audit inspection parser keeps checklist items and reportable results", () => {
	const payload = parseAuditInspectionCaptureForm(
		formDataFrom({
			checklistTitle: "Warehouse route check",
			contextText: "Crew rerouted around a delivery.",
			departmentText: "Logistics",
			findingType: "inspection",
			itemCount: "3",
			"items.0.prompt": "Emergency exit route clear",
			"items.0.result": "checked_ok",
			"items.1.description": "Pallets narrowed the marked route.",
			"items.1.prompt": "Pedestrian route width",
			"items.1.result": "non_conformance",
			"items.1.severity": "high",
			"items.2.description": "Operator paused traffic before reversing.",
			"items.2.prompt": "Vehicle spotter practice",
			"items.2.result": "positive_observation",
			"items.2.severity": "low",
			locationText: "Goods-in aisle",
		}),
	);

	assert.ok(payload);
	assert.equal(payload.findingType, "inspection");
	assert.equal(payload.items.length, 3);
	assert.equal(payload.items[1]?.result, "non_conformance");
	assert.equal(payload.items[2]?.result, "positive_observation");
	assert.deepEqual(
		reportableAuditInspectionItems(payload).map((item) => item.index),
		[1, 2],
	);
});

test("audit inspection action bridge uses audit inspection origin contract", () => {
	const payload = parseAuditInspectionCaptureForm(
		formDataFrom({
			checklistTitle: "Loading dock audit",
			findingType: "audit",
			itemCount: "1",
			"items.0.actionDueDate": "2026-05-12",
			"items.0.actionOwnerText": "Warehouse supervisor",
			"items.0.description": "SOP note does not match observed staging.",
			"items.0.prompt": "SOP staging point",
			"items.0.result": "non_conformance",
			"items.0.severity": "critical",
			locationText: "Dock 2",
		}),
	);
	assert.ok(payload);
	const item = reportableAuditInspectionItems(payload)[0];
	assert.ok(item);

	const finding = prepareAuditInspectionFindingRecord(payload, item, {
		actorUserId,
		tenantId,
	});
	const action = prepareAuditInspectionActionCreatePayload(finding, item);

	assert.equal(finding.findingType, "audit");
	assert.equal(finding.status, "open");
	assert.equal(action.originType, "audit_inspection");
	assert.equal(action.originId, finding.id);
	assert.match(action.originLabel ?? "", /^Audit\/inspection: /);
	assert.equal(action.priority, "critical");
	assert.equal(action.ownerText, "Warehouse supervisor");
	assert.equal(action.dueDate, "2026-05-12");
});

test("audit inspection photo rejects oversized file before reading bytes", async () => {
	let arrayBufferCalled = false;

	await assert.rejects(
		() =>
			storeAuditInspectionPhoto({
				env: { ...process.env, STORAGE_UPLOAD_MAX_BYTES: "3" },
				file: {
					async arrayBuffer() {
						arrayBufferCalled = true;
						return new Uint8Array([1, 2, 3, 4]).buffer;
					},
					name: "audit.jpg",
					size: 4,
					type: "image/jpeg",
				},
				findingId: "44444444-4444-4444-8444-444444444444",
				storage: new MemoryStorage(),
				tenantId,
			}),
		(error: unknown) =>
			error instanceof AuditInspectionCaptureValidationError &&
			error.code === "UPLOAD_TOO_LARGE" &&
			error.status === 413,
	);
	assert.equal(arrayBufferCalled, false);
});

test("capture persists photos per reportable item and creates optional actions", async () => {
	const storage = new MemoryStorage();
	const formData = formDataFrom({
		checklistTitle: "Warehouse route check",
		createAction: "on",
		departmentText: "Logistics",
		findingType: "inspection",
		itemCount: "2",
		"items.0.actionTitle": "Clear marked pedestrian route",
		"items.0.createAction": "on",
		"items.0.description": "Pedestrian route blocked by pallets.",
		"items.0.photo": new TestFile("route.jpg", "image/jpeg", [1, 2, 3]),
		"items.0.prompt": "Pedestrian route clear",
		"items.0.result": "non_conformance",
		"items.0.severity": "high",
		"items.1.description": "New starter asked for help before entering dock.",
		"items.1.photo": new TestFile("pause.png", "image/png", [4, 5]),
		"items.1.prompt": "Stop and ask practice",
		"items.1.result": "positive_observation",
		"items.1.severity": "low",
		locationText: "Goods-in aisle",
	});
	const insertedFindings: unknown[] = [];
	const linkedActions: string[] = [];
	const actionInputs: unknown[] = [];

	const result = await captureAuditInspectionFindings(
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
					originLabel: input.action.originLabel ?? "Audit/inspection",
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

	assert.equal(insertedFindings.length, 2);
	assert.equal(actionInputs.length, 1);
	assert.deepEqual(linkedActions, [actionId]);
	assert.equal(result.findings.length, 2);
	assert.equal(result.findings[0]?.action?.id, actionId);
	assert.equal(result.findings[0]?.finding.status, "action_created");
	assert.equal(result.findings[1]?.finding.intent, "positive_observation");
	assert.equal(storage.objects.size, 2);
	for (const item of result.findings) {
		assert.match(
			item.finding.photoStoragePath ?? "",
			new RegExp(
				`^tenants/${tenantId}/findings/audit-inspection/${item.finding.id}/`,
			),
		);
	}
	const actionInput = actionInputs[0] as {
		readonly action: {
			readonly originId?: string | null;
			readonly originType: string;
		};
	};
	assert.equal(actionInput.action.originType, "audit_inspection");
	assert.equal(actionInput.action.originId, result.findings[0]?.finding.id);
});

test("capture rolls back created findings actions and photos when a later item fails", async () => {
	const storage = new MemoryStorage();
	const formData = formDataFrom({
		findingType: "inspection",
		itemCount: "2",
		"items.0.actionTitle": "Clear marked pedestrian route",
		"items.0.createAction": "on",
		"items.0.description": "Pedestrian route blocked by pallets.",
		"items.0.photo": new TestFile("route.jpg", "image/jpeg", [1, 2, 3]),
		"items.0.prompt": "Pedestrian route clear",
		"items.0.result": "non_conformance",
		"items.0.severity": "high",
		"items.1.description": "Second blocked route.",
		"items.1.photo": new TestFile("second.jpg", "image/jpeg", [4, 5, 6]),
		"items.1.prompt": "Second route clear",
		"items.1.result": "non_conformance",
		"items.1.severity": "medium",
	});
	const deletedActionIds: string[] = [];
	const deletedFindingIds: string[] = [];
	let insertCount = 0;

	await assert.rejects(
		() =>
			captureAuditInspectionFindings(
				formData,
				{ actorUserId, tenantId },
				{
					createAction: async (input) => ({
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
						originLabel: input.action.originLabel ?? "Audit/inspection",
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
					}),
					deleteAction: async (_tenantId, actionItemId) => {
						deletedActionIds.push(actionItemId);
					},
					deleteFinding: async (finding) => {
						deletedFindingIds.push(finding.id);
					},
					insertFinding: async (finding) => {
						insertCount += 1;
						if (insertCount === 2) {
							throw new Error("SECOND_FINDING_FAILED");
						}
						return finding;
					},
					linkFindingAction: async (finding, linkedActionId) => ({
						...finding,
						actionItemId: linkedActionId,
						status: "action_created",
					}),
					storage,
				},
			),
		/SECOND_FINDING_FAILED/,
	);

	assert.equal(insertCount, 2);
	assert.equal(deletedFindingIds.length, 1);
	assert.deepEqual(deletedActionIds, [actionId]);
	assert.equal(storage.objects.size, 0);
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
