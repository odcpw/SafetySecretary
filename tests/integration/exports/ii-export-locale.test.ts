import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import JSZip from "jszip";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import type { Locale } from "../../../src/lib/i18n/types";
import type { WorkflowSnapshotData } from "../../../src/lib/incident/serialise";

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
	load(url, context, nextLoad) {
		if (url.startsWith("file:") && url.endsWith(".tsx")) {
			const source = readFileSync(fileURLToPath(url), "utf8");
			const transpiled = ts.transpileModule(source, {
				compilerOptions: {
					jsx: ts.JsxEmit.ReactJSX,
					module: ts.ModuleKind.ESNext,
					target: ts.ScriptTarget.ES2022,
				},
			});

			return {
				format: "module",
				shortCircuit: true,
				source: transpiled.outputText,
			};
		}

		return nextLoad(url, context);
	},
});

const { IncidentExportDialog } = await import(
	"../../../src/components/incident/ExportDialog"
);
const { generateIICommsOnePagerDocx } = await import(
	"../../../src/lib/exports/ii/comms-onepager"
);
const { generateIIReportDocx } = await import(
	"../../../src/lib/exports/ii/full-report"
);
const { iiExportHazardCategoryLabel, iiExportRiskBandLabel } = await import(
	"../../../src/lib/exports/ii/labels"
);
const { parseIIExportOptions } = await import(
	"../../../src/lib/exports/ii/options"
);
const { exportFooterText } = await import("../../../src/lib/legal/disclaimer");
const { LOCALES } = await import("../../../src/lib/i18n/types");
const { NextRequest } = (await import(
	"next/server.js"
)) as typeof import("next/server");

const localizedExpectations: Record<
	Locale,
	{
		actionStatus: string;
		categoryWorkOrganisation: string;
		commsTeamHeading: string;
		commsTitle: string;
		confidence: string;
		fullOverviewHeading: string;
		fullTitle: string;
		incidentType: string;
		riskHigh: string;
	}
> = {
	de: {
		actionStatus: "In Arbeit",
		categoryWorkOrganisation: "Arbeitsorganisation",
		commsTeamHeading: "5. Was jedes Teammitglied tun muss",
		commsTitle: "II-Kommunikation auf einer Seite",
		confidence: "Bestaetigt",
		fullOverviewHeading: "1. Übersicht",
		fullTitle: "II-Vollbericht",
		incidentType: "Beinaheereignis",
		riskHigh: "Höheres Risiko",
	},
	en: {
		actionStatus: "In progress",
		categoryWorkOrganisation: "Work organisation",
		commsTeamHeading: "5. What every team member needs to do",
		commsTitle: "II communications one-pager",
		confidence: "Confirmed",
		fullOverviewHeading: "1. Overview",
		fullTitle: "II full report",
		incidentType: "Near miss",
		riskHigh: "Higher risk",
	},
	fr: {
		actionStatus: "En cours",
		categoryWorkOrganisation: "Organisation du travail",
		commsTeamHeading: "5. Ce que chaque membre de l'équipe doit faire",
		commsTitle: "Communication II d'une page",
		confidence: "Confirme",
		fullOverviewHeading: "1. Vue d'ensemble",
		fullTitle: "Rapport II complet",
		incidentType: "Presqu'accident",
		riskHigh: "Risque plus élevé",
	},
	it: {
		actionStatus: "In corso",
		categoryWorkOrganisation: "Organizzazione del lavoro",
		commsTeamHeading: "5. Cosa deve fare ogni membro del team",
		commsTitle: "Comunicazione II in una pagina",
		confidence: "Confermato",
		fullOverviewHeading: "1. Panoramica",
		fullTitle: "Rapporto II completo",
		incidentType: "Mancato incidente",
		riskHigh: "Rischio più elevato",
	},
};

test("II export option parser defaults to user UI locale and translate=false", () => {
	assert.deepEqual(
		parseIIExportOptions({
			defaultLocale: "fr",
			localeParam: null,
			translateParam: null,
		}),
		{
			ok: true,
			options: {
				exportLocale: "fr",
				translateStoredContent: false,
			},
		},
	);
	assert.deepEqual(
		parseIIExportOptions({
			defaultLocale: "fr",
			localeParam: "de",
			translateParam: "true",
		}),
		{
			ok: true,
			options: {
				exportLocale: "de",
				translateStoredContent: true,
			},
		},
	);
	assert.deepEqual(
		parseIIExportOptions({
			defaultLocale: "fr",
			localeParam: "es",
			translateParam: null,
		}),
		{ code: "INVALID_EXPORT_LOCALE", ok: false },
	);
	assert.deepEqual(
		parseIIExportOptions({
			defaultLocale: "fr",
			localeParam: "de",
			translateParam: "yes",
		}),
		{ code: "INVALID_TRANSLATE_STORED_CONTENT", ok: false },
	);
});

test("II generators thread exportLocale to existing footer output", async () => {
	const workflowData = fixtureWorkflowData("Locale plumbing incident");
	const fullReportText = await docxText(
		await generateIIReportDocx(
			{ type: "workflowData", workflowData },
			{ exportLocale: "de", translateStoredContent: false },
		),
	);
	const commsText = await docxText(
		await generateIICommsOnePagerDocx(
			{ type: "workflowData", workflowData },
			{ exportLocale: "de", translateStoredContent: false },
		),
	);

	assert.match(
		fullReportText,
		new RegExp(escapeRegExp(exportFooterText("de"))),
	);
	assert.match(commsText, new RegExp(escapeRegExp(exportFooterText("de"))));
});

test("II generators render localized static output without translating stored content", async () => {
	const workflowData = fixtureWorkflowData("Stored source title");

	for (const locale of LOCALES) {
		const expectations = localizedExpectations[locale];
		const fullReportText = await docxText(
			await generateIIReportDocx(
				{ type: "workflowData", workflowData },
				{ exportLocale: locale, translateStoredContent: false },
			),
		);
		const commsText = await docxText(
			await generateIICommsOnePagerDocx(
				{ type: "workflowData", workflowData },
				{ exportLocale: locale, translateStoredContent: false },
			),
		);

		assert.match(fullReportText, literal(expectations.fullTitle));
		assert.match(fullReportText, literal(expectations.fullOverviewHeading));
		assert.match(fullReportText, literal(expectations.incidentType));
		assert.match(fullReportText, literal(expectations.confidence));
		assert.match(fullReportText, literal(expectations.actionStatus));
		assert.match(fullReportText, /Stored source title/);
		assert.match(fullReportText, /Forklift passed close to a pedestrian/);

		assert.match(commsText, literal(expectations.commsTitle));
		assert.match(commsText, literal(expectations.commsTeamHeading));
		assert.match(commsText, literal(expectations.incidentType));
		assert.match(commsText, literal(expectations.confidence));
		assert.match(commsText, literal(expectations.actionStatus));
		assert.match(commsText, /Stored source title/);
		assert.match(commsText, /Forklift passed close to a pedestrian/);
	}
});

test("II export label helpers use localized taxonomy and risk-band fixtures", () => {
	for (const locale of LOCALES) {
		const expectations = localizedExpectations[locale];

		assert.equal(
			iiExportHazardCategoryLabel("WORK_ORGANISATION", locale),
			expectations.categoryWorkOrganisation,
		);
		assert.equal(iiExportRiskBandLabel("HIGH", locale), expectations.riskHigh);
	}
});

test("II export routes reject invalid locale and translate params before generator work", async () => {
	const unifiedRoute = (await import(
		moduleUrl("src/app/api/incidents/[id]/export/route.ts")
	)) as typeof import("../../../src/app/api/incidents/[id]/export/route");
	const caseId = "11111111-1111-4111-8111-111111111111";

	const invalidLocale = await unifiedRoute.GET(
		authRequest(
			`https://app.example.test/api/incidents/${caseId}/export?report=full-report&locale=es`,
		),
		{ params: { id: caseId } },
	);
	assert.equal(invalidLocale.status, 400);
	assert.deepEqual(await invalidLocale.json(), {
		code: "INVALID_EXPORT_LOCALE",
	});

	const invalidTranslate = await unifiedRoute.GET(
		authRequest(
			`https://app.example.test/api/incidents/${caseId}/export?report=comms&translate=yes`,
		),
		{ params: { id: caseId } },
	);
	assert.equal(invalidTranslate.status, 400);
	assert.deepEqual(await invalidTranslate.json(), {
		code: "INVALID_TRANSLATE_STORED_CONTENT",
	});

	const invalidReport = await unifiedRoute.GET(
		authRequest(
			`https://app.example.test/api/incidents/${caseId}/export?report=hira`,
		),
		{ params: { id: caseId } },
	);
	assert.equal(invalidReport.status, 400);
	assert.deepEqual(await invalidReport.json(), {
		code: "INVALID_EXPORT_REPORT",
	});
});

test("IncidentExportDialog renders locale dropdown default and unchecked translate toggle", () => {
	const html = renderToStaticMarkup(
		createElement(IncidentExportDialog, {
			caseId: "11111111-1111-4111-8111-111111111111",
			contentLanguage: "fr",
			defaultExportLocale: "fr",
			labels: {
				communicationsOnePager: "Comms",
				docx: "DOCX",
				exportLocale: "Locale",
				format: "Format",
				fullReport: "Full report",
				localeNames: {
					de: "Deutsch",
					en: "English",
					fr: "Francais",
					it: "Italiano",
				},
				pdf: "PDF",
				translateStoredContent: "Translate",
			},
			selectedPhotoIds: ["22222222-2222-4222-8222-222222222222"],
		}),
	);

	assert.match(
		html,
		/action="\/api\/incidents\/11111111-1111-4111-8111-111111111111\/export"/,
	);
	assert.match(html, /name="locale"/);
	assert.match(html, /<option value="fr" selected="">Francais<\/option>/);
	assert.match(html, /name="translate"/);
	assert.doesNotMatch(html, /name="translate"[^>]+checked/);
	assert.match(
		html,
		/<input type="hidden" name="photoId" value="22222222-2222-4222-8222-222222222222"\/>/,
	);
});

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

function fixtureWorkflowData(title: string): WorkflowSnapshotData {
	return {
		accounts: [],
		case: {
			contentLanguage: "fr",
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
			title,
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
						description: "Paint a protected crossing.",
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

function authRequest(url: string) {
	return new NextRequest(url, {
		headers: {
			"x-ssfw-tenant-id": "22222222-2222-4222-8222-222222222222",
			"x-ssfw-user-id": "33333333-3333-4333-8333-333333333333",
		},
	});
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

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function literal(value: string): RegExp {
	return new RegExp(escapeRegExp(value));
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith(".") || specifier.startsWith("/");
}

function moduleUrl(path: string): string {
	return pathToFileURL(join(process.cwd(), path)).href;
}
