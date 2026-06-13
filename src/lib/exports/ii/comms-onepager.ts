import {
	Document,
	HeadingLevel,
	ImageRun,
	Packer,
	Paragraph,
	TextRun,
} from "docx";
import { withTenantConnection } from "../../db/tenancy";
import { applyDisclaimerFooter } from "../../exports/footer";
import type { Locale } from "../../i18n/types";
import {
	type SnapshotJson,
	serialiseWorkflow,
	WorkflowNotFoundError,
	type WorkflowSnapshotData,
} from "../../incident/serialise";
import {
	createStorageFromEnv,
	tenantPrefix,
	type Storage,
} from "../../storage";
import {
	normalizeIIExportOptions,
	type IIExportOptionsInput,
} from "./options";
import {
	iiExportLabels,
	localizeActionStatus,
	localizeIncidentType,
	localizeTimelineConfidence,
} from "./labels";
import {
	translateIIWorkflowDataForExport,
	type IIStoredContentTranslationContext,
} from "./translate-content";

export type IICommsSource =
	| {
			type: "draft";
			caseId: string;
			tenantId: string;
	  }
	| {
			type: "snapshot";
			caseId?: string;
			snapshotId: string;
			tenantId: string;
	  }
	| {
			type: "workflowData";
			workflowData: WorkflowSnapshotData;
			tenantId?: string;
	  };

export type IICommsOptions = IIExportOptionsInput & {
	selectedAttachmentIds?: readonly string[];
	storage?: Storage;
	translationContext?: IIStoredContentTranslationContext;
};

export const II_COMMS_ONEPAGER_SECTIONS = [
	"Incident summary",
	"Timeline",
	"Root causes",
	"Changes being made",
	"What every team member needs to do",
] as const;

const outputType = "ii_comms_onepager";
const defaultLocale: Locale = "en";
const maxTimelineEvents = 5;
const maxInlinePhotos = 3;

export async function generateIICommsOnePagerDocx(
	source: IICommsSource,
	options: IICommsOptions = {},
): Promise<Buffer> {
	const { tenantId, workflowData } = await resolveWorkflowData(source);
	const sourceLocale = workflowLocale(workflowData);
	const exportOptions = normalizeIIExportOptions(
		options,
		sourceLocale,
	);
	const exportWorkflowData = await translateIIWorkflowDataForExport(
		workflowData,
		{
			artifact: "commsOnePager",
			...exportOptions,
			sourceLocale,
			targetLocale: exportOptions.exportLocale,
			translationContext: options.translationContext,
		},
	);
	const report = await commsReportView(exportWorkflowData, {
		locale: exportOptions.exportLocale,
		selectedAttachmentIds: options.selectedAttachmentIds,
		storage: options.storage,
		tenantId,
	});
	const labels = iiExportLabels(exportOptions.exportLocale);

	return applyDisclaimerFooter(
		async ({ createDocxFooter }) =>
			Packer.toBuffer(
				new Document({
					sections: [
						{
							children: buildCommsChildren(
								report,
								labels,
								exportOptions.exportLocale,
							),
							footers: {
								default: createDocxFooter(),
							},
						},
					],
				}),
			),
		"docx",
		{ locale: exportOptions.exportLocale },
	);
}

export function iiCommsFilename(caseId: string): string {
	return `ii-comms-onepager-${caseId}.docx`;
}

async function resolveWorkflowData(
	source: IICommsSource,
): Promise<{ tenantId?: string; workflowData: WorkflowSnapshotData }> {
	if (source.type === "workflowData") {
		return {
			tenantId: source.tenantId,
			workflowData: source.workflowData,
		};
	}

	if (source.type === "draft") {
		return {
			tenantId: source.tenantId,
			workflowData: await serialiseWorkflow("II", source.caseId, {
				tenantId: source.tenantId,
			}),
		};
	}

	const workflowData = await withTenantConnection(source.tenantId, async (tx) => {
		const rows = await tx.$queryRaw<
			Array<{
				id: string;
				iiCaseId: string | null;
				workflowData: unknown;
			}>
		>`
			SELECT
				id::text AS id,
				ii_case_id::text AS "iiCaseId",
				workflow_data AS "workflowData"
			FROM approval_snapshot
			WHERE id = ${source.snapshotId}::uuid
				AND workflow_type = 'II'::approval_workflow_type
				AND (
					${source.caseId ?? null}::uuid IS NULL
					OR ii_case_id = ${source.caseId ?? null}::uuid
				)
			LIMIT 1
		`;
		const snapshot = rows[0];

		if (!snapshot?.iiCaseId) {
			throw new WorkflowNotFoundError("II", source.snapshotId);
		}

		return workflowDataFromSnapshot(snapshot.workflowData);
	});

	return {
		tenantId: source.tenantId,
		workflowData,
	};
}

async function commsReportView(
	workflowData: WorkflowSnapshotData,
	options: {
		locale: Locale;
		selectedAttachmentIds?: readonly string[];
		storage?: Storage;
		tenantId?: string;
	},
) {
	const caseRecord = record(workflowData.case);
	const timelineEvents = records(workflowData.timelineEvents).map((event) => {
		const attachments = records(arrayField(event.attachments)).map(
			(attachment) => ({
				id: stringField(attachment.id, "attachment.id"),
				filename: stringOrNull(attachment.filename),
				mimeType: stringOrNull(attachment.mimeType),
				selectedForComms:
					booleanOrNull(attachment.selectedForComms) ??
					booleanOrNull(attachment.commsSelected),
				storageKey: stringField(attachment.storageKey, "attachment.storageKey"),
			}),
		);

		return {
			attachments,
			confidence: stringField(event.confidence, "timeline.confidence"),
			eventAt: stringOrNull(event.eventAt),
			text: stringField(event.text, "timeline.text"),
			timeLabel: stringOrNull(event.timeLabel),
		};
	});
	const causeNodes = records(workflowData.causeNodes).map((node) => ({
		isRootCause: Boolean(node.isRootCause),
		statement: stringField(node.statement, "cause.statement"),
		actions: records(arrayField(node.actions)).map((action) => ({
			description: stringField(action.description, "action.description"),
			dueDate: stringOrNull(action.dueDate),
			ownerRole: stringOrNull(action.ownerRole),
			status: stringField(action.status, "action.status"),
		})),
	}));
	const photos = await loadSelectedPhotos(timelineEvents, options);

	return {
		actions: causeNodes.flatMap((node) => node.actions),
		case: {
			incidentAt: stringOrNull(caseRecord.incidentAt),
			incidentType: stringField(caseRecord.incidentType, "case.incidentType"),
			location: stringOrNull(caseRecord.location),
			title: stringField(caseRecord.title, "case.title"),
		},
		causeNodes,
		photos,
		timelineEvents: timelineEvents.slice(0, maxTimelineEvents),
	};
}

function buildCommsChildren(
	report: Awaited<ReturnType<typeof commsReportView>>,
	labels: ReturnType<typeof iiExportLabels>,
	locale: Locale,
) {
	const children: Paragraph[] = [
		new Paragraph({
			children: [
				new TextRun({ bold: true, text: labels.titles.commsOnePager }),
			],
			heading: HeadingLevel.TITLE,
		}),
		sectionHeading(numberedSection(1, labels.sections.incidentSummary)),
		new Paragraph(summaryLine(report.case, labels, locale)),
		...photoParagraphs(report.photos.slice(0, 1), labels),
		sectionHeading(numberedSection(2, labels.sections.timeline)),
		...(report.timelineEvents.length > 0
			? bulletList(
					report.timelineEvents.map(
						(event) =>
							`${event.timeLabel ?? event.eventAt ?? labels.fallbacks.untimed}: ${event.text} (${localizeTimelineConfidence(event.confidence, locale)})`,
					),
				)
			: [mutedParagraph(labels.fallbacks.noTimeline)]),
		...photoParagraphs(report.photos.slice(1), labels),
		sectionHeading(numberedSection(3, labels.sections.rootCauses)),
		...(report.causeNodes.length > 0
			? bulletList(
					report.causeNodes.map(
						(node) =>
							`${node.isRootCause ? labels.prefixes.rootCause : ""}${node.statement}`,
					),
				)
			: [mutedParagraph(labels.fallbacks.noRootCauses)]),
		sectionHeading(numberedSection(4, labels.sections.changesBeingMade)),
		...(report.actions.length > 0
			? bulletList(
					report.actions.map(
						(action) =>
							`${action.description} - ${labels.fields.owner}: ${action.ownerRole ?? labels.fallbacks.unassigned}; ${labels.fields.due}: ${action.dueDate ?? labels.fallbacks.open}; ${labels.fields.status}: ${localizeActionStatus(action.status, locale)}`,
					),
				)
			: [mutedParagraph(labels.fallbacks.noCorrectiveActions)]),
		sectionHeading(numberedSection(5, labels.sections.teamMemberActions)),
		...teamMemberActions(report, labels),
	];

	return children;
}

async function loadSelectedPhotos(
	timelineEvents: Array<{
		attachments: Array<{
			id: string;
			filename: string | null;
			mimeType: string | null;
			selectedForComms: boolean | null;
			storageKey: string;
		}>;
		text: string;
	}>,
	options: {
		locale: Locale;
		selectedAttachmentIds?: readonly string[];
		storage?: Storage;
		tenantId?: string;
	},
): Promise<InlinePhoto[]> {
	const imageAttachments = timelineEvents.flatMap((event) =>
		event.attachments
			.map((attachment) => ({
				...attachment,
				eventText: event.text,
				imageType: imageType(attachment),
			}))
			.filter(
				(
					attachment,
				): attachment is typeof attachment & { imageType: "jpg" | "png" } =>
					attachment.imageType !== null,
			),
	);
	const requestedAttachmentIds = options.selectedAttachmentIds
		? new Set(options.selectedAttachmentIds)
		: null;
	const selected = requestedAttachmentIds
		? imageAttachments.filter((attachment) =>
				requestedAttachmentIds.has(attachment.id),
			)
		: imageAttachments.filter(
				(attachment) => attachment.selectedForComms === true,
			);
	const candidates = (
		selected.length > 0 || requestedAttachmentIds ? selected : imageAttachments
	).slice(0, maxInlinePhotos);

	if (candidates.length === 0) {
		return [];
	}

	const storage = options.storage ?? createStorageFromEnv();
	const tenantKeyPrefix = options.tenantId
		? `${tenantPrefix(options.tenantId)}/`
		: null;
	const labels = iiExportLabels(options.locale);

	return Promise.all(
		candidates.map(async (attachment) => {
			if (tenantKeyPrefix && !attachment.storageKey.startsWith(tenantKeyPrefix)) {
				throw new Error("II comms photo storage key is outside the tenant.");
			}

			const object = await storage.get(attachment.storageKey);

			return {
				altText:
					attachment.filename ??
					`${labels.fallbacks.timelinePhotoFor} ${attachment.eventText.slice(0, 80)}`,
				bytes: object.body,
				filename: attachment.filename,
				type: attachment.imageType,
			};
		}),
	);
}

function photoParagraphs(
	photos: InlinePhoto[],
	labels: ReturnType<typeof iiExportLabels>,
): Paragraph[] {
	return photos.flatMap((photo) => [
		new Paragraph({
			children: [
				new ImageRun({
					altText: {
						description: photo.altText,
						name: photo.filename ?? labels.fallbacks.timelinePhoto,
						title: photo.filename ?? labels.fallbacks.timelinePhoto,
					},
					data: photo.bytes,
					transformation: {
						height: 180,
						width: 240,
					},
					type: photo.type,
				}),
			],
			spacing: { after: 160, before: 120 },
		}),
	]);
}

function teamMemberActions(
	report: Awaited<ReturnType<typeof commsReportView>>,
	labels: ReturnType<typeof iiExportLabels>,
) {
	const actionTexts = report.actions.slice(0, 3).map((action) => {
		const owner = action.ownerRole ? ` (${action.ownerRole})` : "";
		return `${labels.prefixes.supportCorrectiveAction}: ${action.description}${owner}.`;
	});

	return bulletList(
		actionTexts.length > 0
			? actionTexts
			: [labels.fallbacks.teamDefault],
	);
}

function sectionHeading(text: string): Paragraph {
	return new Paragraph({
		children: [new TextRun({ bold: true, text })],
		heading: HeadingLevel.HEADING_1,
		spacing: { after: 120, before: 220 },
	});
}

function mutedParagraph(text: string): Paragraph {
	return new Paragraph({
		children: [new TextRun({ italics: true, text })],
	});
}

function bulletList(items: string[]): Paragraph[] {
	return items.map(
		(item) =>
			new Paragraph({
				bullet: { level: 0 },
				children: [new TextRun(item)],
			}),
	);
}

function numberedSection(sectionNumber: number, title: string): string {
	return `${sectionNumber}. ${title}`;
}

function summaryLine(
	caseRecord: Awaited<ReturnType<typeof commsReportView>>["case"],
	labels: ReturnType<typeof iiExportLabels>,
	locale: Locale,
) {
	const incidentType = localizeIncidentType(caseRecord.incidentType, locale);
	const details = [
		caseRecord.location
			? `${labels.fields.location}: ${caseRecord.location}`
			: null,
		caseRecord.incidentAt
			? `${labels.fields.incidentTime}: ${caseRecord.incidentAt}`
			: null,
	].filter(Boolean);

	return `${caseRecord.title} (${incidentType})${details.length > 0 ? ` - ${details.join("; ")}` : ""}.`;
}

function imageType(attachment: {
	filename: string | null;
	mimeType: string | null;
}): "jpg" | "png" | null {
	const mimeType = attachment.mimeType?.toLowerCase();

	if (mimeType === "image/png") {
		return "png";
	}

	if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
		return "jpg";
	}

	const filename = attachment.filename?.toLowerCase() ?? "";

	if (filename.endsWith(".png")) {
		return "png";
	}

	if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) {
		return "jpg";
	}

	return null;
}

function workflowDataFromSnapshot(value: unknown): WorkflowSnapshotData {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("II comms workflow_data is not a JSON object.");
	}

	return value as WorkflowSnapshotData;
}

function workflowLocale(workflowData: WorkflowSnapshotData): Locale {
	const contentLanguage = stringOrNull(record(workflowData.case).contentLanguage);

	if (
		contentLanguage === "de" ||
		contentLanguage === "en" ||
		contentLanguage === "fr" ||
		contentLanguage === "it"
	) {
		return contentLanguage;
	}

	return defaultLocale;
}

function record(value: SnapshotJson): Record<string, SnapshotJson> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}

	return value;
}

function records(value: SnapshotJson[]): Array<Record<string, SnapshotJson>> {
	return value.map(record);
}

function arrayField(value: SnapshotJson | undefined): SnapshotJson[] {
	return Array.isArray(value) ? value : [];
}

function booleanOrNull(value: SnapshotJson | undefined): boolean | null {
	if (typeof value === "boolean") {
		return value;
	}

	if (value === "true") {
		return true;
	}

	if (value === "false") {
		return false;
	}

	return null;
}

function stringField(
	value: SnapshotJson | undefined,
	fieldName: string,
): string {
	const parsed = stringOrNull(value);

	if (!parsed) {
		throw new Error(`II comms one-pager requires ${fieldName}.`);
	}

	return parsed;
}

function stringOrNull(value: SnapshotJson | undefined): string | null {
	if (typeof value === "string") {
		return value;
	}

	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}

	return null;
}

type InlinePhoto = {
	altText: string;
	bytes: Buffer;
	filename: string | null;
	type: "jpg" | "png";
};

export { outputType as II_COMMS_ONEPAGER_OUTPUT_TYPE };
