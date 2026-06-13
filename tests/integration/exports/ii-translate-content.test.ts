import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import JSZip from "jszip";
import type {
	SnapshotJson,
	WorkflowSnapshotData,
} from "../../../src/lib/incident/serialise";
import type {
	CostLedgerEntryRow,
	CostStore,
	MonthToDateInput,
	TenantCostSettings,
} from "../../../src/lib/llm/cost";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === "next/server") {
			return nextResolve("next/server.js", context);
		}

		if (isIIExportRouteParent(context.parentURL)) {
			if (specifier.endsWith("/lib/exports/ii/full-report")) {
				return {
					shortCircuit: true,
					url: new URL("./route-stubs/ii-full-report-stub.ts", import.meta.url)
						.href,
				};
			}

			if (specifier.endsWith("/lib/exports/ii/comms-onepager")) {
				return {
					shortCircuit: true,
					url: new URL("./route-stubs/ii-comms-stub.ts", import.meta.url).href,
				};
			}
		}

		if (context.parentURL && specifier.startsWith(".")) {
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
		}

		return nextResolve(specifier, context);
	},
});

const { generateIIReportDocx } = await import(
	"../../../src/lib/exports/ii/full-report"
);
const { generateIICommsOnePagerDocx } = await import(
	"../../../src/lib/exports/ii/comms-onepager"
);
const {
	II_STORED_CONTENT_TRANSLATION_PROMPT_PURPOSE,
	II_STORED_CONTENT_TRANSLATION_REVIEW_MARKER,
	buildIIStoredContentTranslationPrompt,
	translateIIWorkflowDataForExport,
} = await import("../../../src/lib/exports/ii/translate-content");
const { hashOfPrompt, MockProvider } = await import(
	"../../../src/lib/llm/mock"
);

const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const workflowId = "33333333-3333-4333-8333-333333333333";

test("translateStoredContent=false leaves workflow data untouched without context", async () => {
	const workflowData = fixtureWorkflowData();

	const translated = await translateIIWorkflowDataForExport(workflowData, {
		artifact: "fullReport",
		sourceLocale: "en",
		targetLocale: "de",
		translateStoredContent: false,
	});

	assert.equal(translated, workflowData);
	assert.equal(record(translated.case).title, "Stored source title");
});

test("translateStoredContent=true translates stored text through MockProvider and records cost", async () => {
	const workflowData = fixtureWorkflowData();
	const translations = new Map([
		["Stored source title", "DE gespeicherter Titel"],
		["Receiving dock", "DE Wareneingang"],
		["Safety lead", "DE Sicherheitsleitung"],
		["Case Coordinator", "DE Fallkoordination"],
		[
			"Forklift passed close to a pedestrian.",
			"DE Stapler fuhr nah an einer Person vorbei.",
		],
	]);
	const mockProvider = translationMockProvider(translations);
	const costStore = new MemoryCostStore();

	const docx = await generateIIReportDocx(
		{ type: "workflowData", workflowData },
		{
			exportLocale: "de",
			translateStoredContent: true,
			translationContext: {
				costStore,
				dispatchOptions: {
					env: { NODE_ENV: "test" },
					logSink: {
						metadata: () => undefined,
					},
					mockProvider,
				},
				now: () => new Date("2026-05-06T14:30:00.000Z"),
				tenantId,
				userId,
				workflowId,
			},
		},
	);
	const text = await docxText(docx);

	assert.match(text, /DE gespeicherter Titel/);
	assert.match(text, /DE Wareneingang/);
	assert.match(text, /DE Sicherheitsleitung.*DE Fallkoordination/);
	assert.match(text, /DE Stapler fuhr nah an einer Person vorbei/);
	assert.match(text, /Beinaheereignis/);
	assert.match(text, /Stored source title/);
	assert.match(text, /Forklift passed close to a pedestrian/);
	assert.match(text, new RegExp(II_STORED_CONTENT_TRANSLATION_REVIEW_MARKER));
	assert.equal(mockProvider.textInvocationCount, translations.size);
	assert.equal(costStore.records.length, translations.size);
	assert.deepEqual(
		costStore.records.map((row) => ({
			costUsd: row.costUsd,
			kind: row.kind,
			provider: row.provider,
			tokenInput: row.tokenInput,
			tokenOutput: row.tokenOutput,
		})),
		Array.from({ length: translations.size }, () => ({
			costUsd: "0.00000",
			kind: "authoring",
			provider: "mock",
			tokenInput: 11,
			tokenOutput: 7,
		})),
	);
});

test("comms translation sends only comms-visible stored fields", async () => {
	const workflowData = fixtureWorkflowDataWithHiddenCommsFields();
	const translations = new Map([
		["Visible comms title", "DE sichtbarer Kommunikationstitel"],
		["Visible comms location", "DE sichtbarer Kommunikationsort"],
		[
			"Visible comms timeline text.",
			"DE sichtbarer Kommunikationstimeline-Text.",
		],
		["Visible cause statement.", "DE sichtbare Ursachenaussage."],
		["Visible action description.", "DE sichtbare Massnahme."],
		["Visible owner role", "DE sichtbare Verantwortung"],
	]);
	const mockProvider = translationMockProvider(translations);
	const costStore = new MemoryCostStore();

	const docx = await generateIICommsOnePagerDocx(
		{ type: "workflowData", workflowData },
		{
			exportLocale: "de",
			translateStoredContent: true,
			translationContext: {
				costStore,
				dispatchOptions: {
					env: { NODE_ENV: "test" },
					logSink: {
						metadata: () => undefined,
					},
					mockProvider,
				},
				tenantId,
				userId,
				workflowId,
			},
		},
	);
	const text = await docxText(docx);

	assert.match(text, /DE sichtbarer Kommunikationstitel/);
	assert.match(text, /DE sichtbarer Kommunikationsort/);
	assert.match(text, /DE sichtbarer Kommunikationstimeline-Text/);
	assert.match(text, /DE sichtbare Ursachenaussage/);
	assert.match(text, /DE sichtbare Massnahme/);
	assert.match(text, /DE sichtbare Verantwortung/);
	assert.match(text, /Visible comms title/);
	assert.match(text, /Visible comms timeline text/);
	assert.match(text, new RegExp(II_STORED_CONTENT_TRANSLATION_REVIEW_MARKER));
	assert.doesNotMatch(text, /Hidden medical restriction/);
	assert.equal(mockProvider.textInvocationCount, translations.size);
	assert.equal(costStore.records.length, translations.size);
});

test("II export routes pass route-owned translation context to generators", async () => {
	const { NextRequest } = (await import(
		"next/server.js"
	)) as typeof import("next/server");
	const caseId = randomUUID();
	const routeTenantId = randomUUID();
	const routeUserId = randomUUID();
	const headers = {
		"x-ssfw-tenant-id": routeTenantId,
		"x-ssfw-user-id": routeUserId,
	};

	resetRouteStubCalls();

	const unifiedRoute = (await import(
		moduleUrl("src/app/api/incidents/[id]/export/route.ts")
	)) as typeof import("../../../src/app/api/incidents/[id]/export/route");
	const unifiedResponse = await unifiedRoute.GET(
		new NextRequest(
			`https://app.example.test/api/incidents/${caseId}/export?report=comms&locale=de&translateStoredContent=true`,
			{ headers },
		),
		{ params: { id: caseId } },
	);
	assert.equal(unifiedResponse.status, 200);

	const fullReportResponse = await unifiedRoute.GET(
		new NextRequest(
			`https://app.example.test/api/incidents/${caseId}/export?report=full-report&locale=de&translateStoredContent=true`,
			{ headers },
		),
		{ params: { id: caseId } },
	);
	assert.equal(fullReportResponse.status, 200);

	const commsResponse = await unifiedRoute.GET(
		new NextRequest(
			`https://app.example.test/api/incidents/${caseId}/export?report=comms&locale=de&translateStoredContent=true`,
			{ headers },
		),
		{ params: { id: caseId } },
	);
	assert.equal(commsResponse.status, 200);

	assert.deepEqual(
		routeStubCalls().map((call) => ({
			exportLocale: call.options.exportLocale,
			generator: call.generator,
			source: call.source,
			translateStoredContent: call.options.translateStoredContent,
			translationContext: call.options.translationContext,
		})),
		[
			{
				exportLocale: "de",
				generator: "commsOnePagerDocx",
				source: { caseId, tenantId: routeTenantId, type: "draft" },
				translateStoredContent: true,
				translationContext: {
					tenantId: routeTenantId,
					userId: routeUserId,
					workflowId: caseId,
				},
			},
			{
				exportLocale: "de",
				generator: "fullReportDocx",
				source: { caseId, tenantId: routeTenantId, type: "draft" },
				translateStoredContent: true,
				translationContext: {
					tenantId: routeTenantId,
					userId: routeUserId,
					workflowId: caseId,
				},
			},
			{
				exportLocale: "de",
				generator: "commsOnePagerDocx",
				source: { caseId, tenantId: routeTenantId, type: "draft" },
				translateStoredContent: true,
				translationContext: {
					tenantId: routeTenantId,
					userId: routeUserId,
					workflowId: caseId,
				},
			},
		],
	);
});

function translationMockProvider(translations: ReadonlyMap<string, string>) {
	return new MockProvider({
		text: Array.from(translations.entries()).map(([source, translated]) => ({
			hashOfPrompt: hashOfPrompt(
				buildIIStoredContentTranslationPrompt({
					sourceLocale: "en",
					targetLocale: "de",
					text: source,
				}),
			),
			promptPurpose: II_STORED_CONTENT_TRANSLATION_PROMPT_PURPOSE,
			response: {
				model: "mock-translation",
				provider: "mock",
				text: translated,
				usage: {
					inputTokens: 11,
					outputTokens: 7,
				},
			},
		})),
		vision: [],
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

function fixtureWorkflowData(): WorkflowSnapshotData {
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
			title: "Stored source title",
			updatedAt: "2026-05-01T09:00:00.000Z",
			visionConsent: "ASK",
			workflowStage: "REVIEW",
		},
		causeNodes: [],
		persons: [],
		schemaVersion: 1,
		timelineEvents: [
			{
				attachments: [],
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

function fixtureWorkflowDataWithHiddenCommsFields(): WorkflowSnapshotData {
	return {
		accounts: [],
		case: {
			contentLanguage: "en",
			coordinatorName: "Hidden coordinator name",
			coordinatorRole: "Hidden coordinator role",
			createdAt: "2026-05-01T08:00:00.000Z",
			createdById: "user-1",
			hiraFollowupNeeded: true,
			hiraFollowupText: "Hidden HIRA follow-up note",
			id: "case-1",
			incidentAt: "2026-05-01T08:30:00.000Z",
			incidentTimeNote: "Europe/Zurich",
			incidentType: "NEAR_MISS",
			location: "Visible comms location",
			title: "Visible comms title",
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
						description: "Visible action description.",
						dueDate: "2026-05-15",
						id: "action-1",
						orderIndex: 1,
						ownerRole: "Visible owner role",
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
				question: "Hidden cause question",
				statement: "Visible cause statement.",
				timelineEventId: "event-1",
				updatedAt: "2026-05-01T08:40:00.000Z",
			},
		],
		persons: [
			{
				caseId: "case-1",
				createdAt: "2026-05-01T08:01:00.000Z",
				id: "person-1",
				name: "Hidden person name",
				otherInfo: "Hidden medical restriction",
				role: "Hidden person role",
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
						actual: "Hidden actual deviation",
						createdAt: "2026-05-01T08:21:00.000Z",
						eventId: "event-1",
						expected: "Hidden expected deviation",
						id: "deviation-1",
						orderIndex: 1,
						updatedAt: "2026-05-01T08:21:00.000Z",
					},
				],
				eventAt: "2026-05-01T08:30:00.000Z",
				id: "event-1",
				orderIndex: 1,
				sources: [],
				text: "Visible comms timeline text.",
				timeLabel: "08:30",
				updatedAt: "2026-05-01T08:20:00.000Z",
			},
		],
		workflowType: "II",
	};
}

function xmlText(xml: string): string {
	return xml
		.replace(/<[^>]+>/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&apos;/g, "'")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/\s+/g, " ")
		.trim();
}

class MemoryCostStore implements CostStore {
	readonly records: CostLedgerEntryRow[] = [];

	async recordCost(input: CostLedgerEntryRow): Promise<CostLedgerEntryRow> {
		this.records.push(input);
		return input;
	}

	async monthToDateUsd(_input: MonthToDateInput): Promise<number> {
		return 0;
	}

	async readTenantCostSettings(_input: {
		tenantId: string;
	}): Promise<TenantCostSettings | null> {
		return null;
	}
}

type RouteStubCall = {
	readonly generator: string;
	readonly options: Record<string, unknown>;
	readonly source: Record<string, unknown>;
};

function isIIExportRouteParent(parentURL: string | undefined): boolean {
	const url = parentURL ? decodeURI(parentURL) : undefined;

	return url?.endsWith("/src/app/api/incidents/[id]/export/route.ts") === true;
}

function moduleUrl(path: string): string {
	return new URL(`../../../${path}`, import.meta.url).href;
}

function resetRouteStubCalls() {
	routeStubStore().__ssfwIIExportRouteCalls = [];
}

function routeStubCalls(): RouteStubCall[] {
	return routeStubStore().__ssfwIIExportRouteCalls ?? [];
}

function routeStubStore(): typeof globalThis & {
	__ssfwIIExportRouteCalls?: RouteStubCall[];
} {
	return globalThis as typeof globalThis & {
		__ssfwIIExportRouteCalls?: RouteStubCall[];
	};
}

function record(value: SnapshotJson): Record<string, SnapshotJson> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}

	return value;
}
