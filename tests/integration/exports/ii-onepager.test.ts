import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
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

// The draft generator returns a deterministic canned draft when NODE_ENV is
// "test" (instead of calling a live model), so set it before importing.
const mutableEnv = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;
mutableEnv.NODE_ENV = "test";

test.after(() => {
	if (originalNodeEnv === undefined) {
		delete mutableEnv.NODE_ENV;
	} else {
		mutableEnv.NODE_ENV = originalNodeEnv;
	}
});

const pngFixture = Buffer.from(
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
	"base64",
);
const tenantId = "11111111-1111-4111-8111-111111111111";

const { generateIIOnePagerPptx, iiOnePagerFilename } = await import(
	"../../../src/lib/exports/ii/onepager"
);
const { exportFooterText } = await import(
	"../../../src/lib/legal/disclaimer"
);
const { tenantPrefix } = await import("../../../src/lib/storage");

const photoKeyOne = `${tenantPrefix(tenantId)}/attachments/photo-one.png`;
const photoKeyTwo = `${tenantPrefix(tenantId)}/attachments/photo-two.png`;
const photoKeyThree = `${tenantPrefix(tenantId)}/attachments/photo-three.png`;

test("manager one-pager PPTX opens and contains title, summaries, and three lesson levels", async () => {
	const storage = new MemoryStorage();
	await storage.put(photoKeyOne, pngFixture, { contentType: "image/png" });

	const pptx = await generateIIOnePagerPptx(
		{
			tenantId,
			type: "workflowData",
			workflowData: fixtureWorkflowData({
				attachments: [
					{
						filename: "photo-one.png",
						id: "11111111-1111-4111-8111-aaaaaaaaaaaa",
						mimeType: "image/png",
						storageKey: photoKeyOne,
					},
				],
				title: "Forklift near miss on the receiving dock",
			}),
		},
		{ selectedAttachmentIds: ["11111111-1111-4111-8111-aaaaaaaaaaaa"], storage },
	);

	const zip = await JSZip.loadAsync(pptx);

	// Valid OOXML presentation package.
	assert.ok(zip.file("ppt/presentation.xml"), "missing ppt/presentation.xml");
	assert.ok(zip.file("[Content_Types].xml"), "missing content types");
	const slideNames = Object.keys(zip.files).filter((name) =>
		/^ppt\/slides\/slide\d+\.xml$/.test(name),
	);
	assert.equal(slideNames.length, 1, "expected exactly one slide");

	const slideText = await pptxSlideText(zip);

	assert.match(slideText, /Forklift near miss on the receiving dock/);
	// Summaries (canned draft in NODE_ENV=test).
	assert.match(slideText, /What happened/i);
	assert.match(slideText, /Causes/i);
	assert.match(slideText, /Forklift passed close to a pedestrian/);
	assert.match(slideText, /No marked crossing was available/);
	assert.match(slideText, /Mark pedestrian crossing/);

	// The three lesson leadership levels.
	assert.match(slideText, /As a team member/i);
	assert.match(slideText, /As a frontline manager/i);
	assert.match(slideText, /As executive management/i);

	// One embedded photo.
	const media = pptxMedia(zip);
	assert.equal(media.length, 1);

	// Disclaimer footer lands in the slide master/layout.
	const masterText = await pptxMasterText(zip);
	assert.ok(
		masterText.includes(normalize(exportFooterText("en"))),
		"missing disclaimer footer in slide master",
	);

	assert.equal(
		iiOnePagerFilename("case-1"),
		"ii-manager-onepager-case-1.pptx",
	);
});

test("manager one-pager PPTX adapts to two and three selected photos", async () => {
	for (const count of [2, 3]) {
		const storage = new MemoryStorage();
		const keys = [photoKeyOne, photoKeyTwo, photoKeyThree].slice(0, count);
		const ids = [
			"11111111-1111-4111-8111-aaaaaaaaaaaa",
			"11111111-1111-4111-8111-bbbbbbbbbbbb",
			"11111111-1111-4111-8111-cccccccccccc",
		].slice(0, count);

		for (const key of keys) {
			await storage.put(key, pngFixture, { contentType: "image/png" });
		}

		const pptx = await generateIIOnePagerPptx(
			{
				tenantId,
				type: "workflowData",
				workflowData: fixtureWorkflowData({
					attachments: keys.map((storageKey, index) => ({
						filename: `photo-${index}.png`,
						id: ids[index] ?? `id-${index}`,
						mimeType: "image/png",
						storageKey,
					})),
					title: `Layout test with ${count} photos`,
				}),
			},
			{ selectedAttachmentIds: ids, storage },
		);

		const zip = await JSZip.loadAsync(pptx);
		assert.equal(
			pptxMedia(zip).length,
			count,
			`expected ${count} embedded photos`,
		);
		const slideText = await pptxSlideText(zip);
		assert.match(slideText, new RegExp(`Layout test with ${count} photos`));
	}
});

test("manager one-pager PPTX renders without photos", async () => {
	const pptx = await generateIIOnePagerPptx(
		{
			tenantId,
			type: "workflowData",
			workflowData: fixtureWorkflowData({
				attachments: [],
				title: "No photo incident",
			}),
		},
		{ storage: new MemoryStorage() },
	);

	const zip = await JSZip.loadAsync(pptx);
	assert.equal(pptxMedia(zip).length, 0);
	const slideText = await pptxSlideText(zip);
	assert.match(slideText, /No photo incident/);
	assert.match(slideText, /As executive management/i);
});

async function pptxSlideText(zip: JSZip): Promise<string> {
	const slideNames = Object.keys(zip.files)
		.filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
		.sort();
	const parts = await Promise.all(
		slideNames.map((name) => zip.file(name)?.async("string")),
	);

	return xmlText(parts.map((part) => part ?? "").join(" "));
}

async function pptxMasterText(zip: JSZip): Promise<string> {
	const names = Object.keys(zip.files).filter((name) =>
		/^ppt\/(?:slideMasters\/slideMaster|slideLayouts\/slideLayout)\d+\.xml$/.test(
			name,
		),
	);
	const parts = await Promise.all(
		names.map((name) => zip.file(name)?.async("string")),
	);

	return normalize(xmlText(parts.map((part) => part ?? "").join(" ")));
}

function pptxMedia(zip: JSZip): string[] {
	return Object.keys(zip.files)
		.filter((name) => /^ppt\/media\/.+\.(png|jpe?g)$/i.test(name))
		.sort();
}

function xmlText(xml: string): string {
	return xml
		.replace(/<[^>]+>/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&apos;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/\s+/g, " ")
		.trim();
}

function normalize(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function fixtureWorkflowData(input: {
	attachments: Array<{
		filename: string;
		id: string;
		mimeType: string;
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
			hiraFollowupNeeded: false,
			hiraFollowupText: null,
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
				attachments: input.attachments.map((attachment) => ({
					createdAt: "2026-05-01T08:24:00.000Z",
					createdById: "user-1",
					eventId: "event-1",
					filename: attachment.filename,
					id: attachment.id,
					mimeType: attachment.mimeType,
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

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith(".") || specifier.startsWith("/");
}
