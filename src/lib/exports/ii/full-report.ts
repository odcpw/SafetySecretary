import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
	Document,
	type Footer,
	HeadingLevel,
	ImageRun,
	Packer,
	PageOrientation,
	Paragraph,
	Table,
	TableCell,
	TableRow,
	TextRun,
	WidthType,
} from "docx";
import {
	COACH_PHOTO_EVENT_TEXT,
	COACH_PHOTO_EVENT_TIME_LABEL,
} from "../../../components/incident/coach/types";
import { withTenantConnection } from "../../db/tenancy";
import {
	applyDisclaimerFooter,
	createDocxDisclaimerFooter,
} from "../../exports/footer";
import type { Locale } from "../../i18n/types";
import {
	type SnapshotJson,
	serialiseWorkflow,
	WorkflowNotFoundError,
	type WorkflowSnapshotData,
} from "../../incident/serialise";
import {
	createStorageFromEnv,
	type Storage,
	tenantPrefix,
} from "../../storage";
import {
	HAZARD_CATEGORY_CODES,
	type HazardCategoryCode,
	type LikelihoodCode,
	type RiskBandCode,
	type SeverityCode,
} from "../../taxonomy/schema";
import { renderCauseTreeSvg } from "./cause-tree-svg";
import {
	type IIExportLabels,
	iiExportHazardCategoryLabel,
	iiExportLabels,
	iiExportLikelihoodLabel,
	iiExportRiskBandLabel,
	iiExportSeverityLabel,
	localizeActionStatus,
	localizeActionType,
	localizeActualInjuryOutcome,
	localizeIncidentType,
	localizeTimelineConfidence,
} from "./labels";
import { type IIExportOptionsInput, normalizeIIExportOptions } from "./options";
import { svgToPng } from "./rasterize";
import {
	type IIStoredContentTranslationContext,
	translateIIWorkflowDataForExport,
} from "./translate-content";

export type IIReportSource =
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
	  };

export type IIReportOptions = IIExportOptionsInput & {
	storage?: Storage;
	translationContext?: IIStoredContentTranslationContext;
};

export type IIReportPdf = {
	bytes: Buffer;
};

export const II_FULL_REPORT_SECTIONS = [
	"Overview",
	"Facts & timeline",
	"Cause tree",
	"Action plan",
	"Photos",
] as const;

const outputType = "ii_full_report";
const defaultLocale: Locale = "en";
const libreOfficeTimeoutMs = 30_000;
const causeIndentTwips = 360;
const execFileAsync = promisify(execFile);

type ReportAction = {
	actionType: string | null;
	description: string;
	dueDate: string | null;
	ownerRole: string | null;
	status: string;
};

type CauseBranchStatus = "OPEN" | "PARKED" | "ROOT_REACHED";

type ReportCauseNode = {
	actions: ReportAction[];
	branchStatus: CauseBranchStatus;
	id: string | null;
	isRootCause: boolean;
	parentId: string | null;
	question: string | null;
	statement: string;
};

type ReportTimelineEvent = {
	confidence: string;
	deviations: Array<{ actual: string | null; expected: string | null }>;
	eventAt: string | null;
	text: string;
	timeLabel: string | null;
};

type ReportFact = {
	personName: string | null;
	personRole: string | null;
	text: string;
};

type ReportPhoto = {
	bytes: Buffer;
	caption: string | null;
	filename: string | null;
	type: "jpg" | "png";
};

type ReportPhotoCandidate = {
	caption: string | null;
	filename: string | null;
	id: string | null;
	storageKey: string;
	type: "jpg" | "png";
};

type NumberedCause = {
	cause: ReportCauseNode;
	depth: number;
	number: string;
};

export async function generateIIReport(
	source: IIReportSource,
	options: IIReportOptions = {},
): Promise<Buffer> {
	return generateIIReportDocx(source, options);
}

export async function generateIIReportDocx(
	source: IIReportSource,
	options: IIReportOptions = {},
): Promise<Buffer> {
	const workflowData = await resolveWorkflowData(source);
	const photos = await loadReportPhotos(workflowData, {
		storage: options.storage,
		tenantId: sourceTenantId(source),
	});
	const sourceLocale = workflowLocale(workflowData);
	const exportOptions = normalizeIIExportOptions(options, sourceLocale);
	const exportWorkflowData = await translateIIWorkflowDataForExport(
		withoutCoachPhotoEvidenceEvents(workflowData),
		{
			artifact: "fullReport",
			...exportOptions,
			sourceLocale,
			targetLocale: exportOptions.exportLocale,
			translationContext: options.translationContext,
		},
	);

	const treeImage = await buildCauseTreeImage(exportWorkflowData);

	return applyDisclaimerFooter(
		async ({ createDocxFooter }) =>
			Packer.toBuffer(
				buildIIReportDocument(
					exportWorkflowData,
					createDocxFooter(),
					exportOptions.exportLocale,
					photos,
					treeImage,
				),
			),
		"docx",
		{ locale: exportOptions.exportLocale },
	);
}

export async function generateIIReportPdf(
	source: IIReportSource,
	options: IIReportOptions = {},
): Promise<IIReportPdf> {
	const workflowData = await resolveWorkflowData(source);
	const photos = await loadReportPhotos(workflowData, {
		storage: options.storage,
		tenantId: sourceTenantId(source),
	});
	const sourceLocale = workflowLocale(workflowData);
	const exportOptions = normalizeIIExportOptions(options, sourceLocale);
	const exportWorkflowData = await translateIIWorkflowDataForExport(
		withoutCoachPhotoEvidenceEvents(workflowData),
		{
			artifact: "fullReport",
			...exportOptions,
			sourceLocale,
			targetLocale: exportOptions.exportLocale,
			translationContext: options.translationContext,
		},
	);
	const treeImage = await buildCauseTreeImage(exportWorkflowData);
	const docx = await Packer.toBuffer(
		buildIIReportDocument(
			exportWorkflowData,
			createDocxDisclaimerFooter({
				locale: exportOptions.exportLocale,
			}),
			exportOptions.exportLocale,
			photos,
			treeImage,
		),
	);
	const pdf = await convertDocxBufferToPdf(docx);

	return {
		bytes: pdf.bytes,
	};
}

export async function extractIIReportPdfText(
	bytes: Uint8Array,
): Promise<string> {
	return extractPdfText(bytes);
}

export function iiReportFilename(
	caseId: string,
	format: "docx" | "pdf",
): string {
	return `ii-full-report-${caseId}.${format}`;
}

async function resolveWorkflowData(
	source: IIReportSource,
): Promise<WorkflowSnapshotData> {
	if (source.type === "workflowData") {
		return source.workflowData;
	}

	if (source.type === "draft") {
		return serialiseWorkflow("II", source.caseId, {
			tenantId: source.tenantId,
		});
	}

	return withTenantConnection(source.tenantId, async (tx) => {
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

		if (!snapshot) {
			throw new WorkflowNotFoundError("II", source.snapshotId);
		}

		if (!snapshot.iiCaseId) {
			throw new WorkflowNotFoundError("II", source.snapshotId);
		}

		return workflowData(snapshot.workflowData);
	});
}

function buildIIReportDocument(
	workflowData: WorkflowSnapshotData,
	footer: Footer,
	locale: Locale,
	photos: ReportPhoto[],
	treeImage: ReportTreeImage | null = null,
): Document {
	const report = reportView(workflowData);
	const labels = iiExportLabels(locale);
	const causeTree = numberedCauseTree(report.causeNodes);
	const children: Array<Paragraph | Table> = [
		new Paragraph({
			children: [new TextRun({ bold: true, text: labels.titles.fullReport })],
			heading: HeadingLevel.TITLE,
		}),
		sectionHeading(numberedSection(1, labels.sections.overview)),
		keyValueTable([
			[labels.fields.title, report.case.title],
			[
				labels.fields.incidentType,
				localizeIncidentType(report.case.incidentType, locale),
			],
			[
				labels.fields.actualInjuryOutcome,
				report.case.actualInjuryOutcome
					? localizeActualInjuryOutcome(report.case.actualInjuryOutcome, locale)
					: labels.fallbacks.unspecified,
			],
			[
				labels.fields.actualSeverity,
				report.case.actualSeverityCode
					? severityLabel(report.case.actualSeverityCode, locale)
					: labels.fallbacks.unspecified,
			],
			[
				labels.fields.potentialOutcome,
				report.case.potentialOutcomeText ?? labels.fallbacks.unspecified,
			],
			[
				labels.fields.potentialSeverity,
				report.case.potentialSeverityCode
					? severityLabel(report.case.potentialSeverityCode, locale)
					: labels.fallbacks.unspecified,
			],
			[
				labels.fields.potentialLikelihood,
				report.case.potentialLikelihoodCode
					? likelihoodLabel(report.case.potentialLikelihoodCode, locale)
					: labels.fallbacks.unspecified,
			],
			[
				labels.fields.potentialRisk,
				report.case.potentialRiskBand
					? iiExportRiskBandLabel(
							report.case.potentialRiskBand as RiskBandCode,
							locale,
						)
					: labels.fallbacks.unspecified,
			],
			[
				labels.fields.incidentTime,
				report.case.incidentAt ?? labels.fallbacks.unspecified,
			],
			[
				labels.fields.location,
				report.case.location ?? labels.fallbacks.unspecified,
			],
			[
				labels.fields.department,
				report.case.departmentText ?? labels.fallbacks.unspecified,
			],
			[
				labels.fields.workActivity,
				report.case.workActivity ?? labels.fallbacks.unspecified,
			],
			[
				labels.fields.hazardCategory,
				report.case.hazardCategoryCode
					? iiExportHazardCategoryLabel(report.case.hazardCategoryCode, locale)
					: labels.fallbacks.unspecified,
			],
			[
				labels.fields.injuryNature,
				report.case.injuryNature ?? labels.fallbacks.unspecified,
			],
			[
				labels.fields.bodyPart,
				report.case.bodyPart ?? labels.fallbacks.unspecified,
			],
			[
				labels.fields.lostDays,
				report.case.lostDays === null
					? labels.fallbacks.unspecified
					: String(report.case.lostDays),
			],
			[
				labels.fields.coordinator,
				report.coordinator ?? labels.fallbacks.unspecified,
			],
		]),
		subHeading(labels.sections.personsInvolved),
		...(report.persons.length > 0
			? bulletList(
					report.persons.map(
						(person) =>
							`${person.role}${person.name ? ` - ${person.name}` : ""}`,
					),
				)
			: [mutedParagraph(labels.fallbacks.noPersons)]),
	];

	if (report.case.hiraFollowupNeeded || report.case.hiraFollowupText) {
		children.push(
			subHeading(labels.sections.hiraFollowup),
			new Paragraph(
				report.case.hiraFollowupText ?? labels.fallbacks.hiraFollowupNeeded,
			),
		);
	}

	children.push(
		sectionHeading(numberedSection(2, labels.sections.factsTimeline)),
		...(report.timelineEvents.length > 0
			? report.timelineEvents.flatMap((event) =>
					timelineEventParagraphs(event, labels, locale),
				)
			: [mutedParagraph(labels.fallbacks.noTimeline)]),
	);

	if (report.facts.length > 0) {
		children.push(
			subHeading(labels.sections.statementFacts),
			...bulletList(report.facts.map(factLine)),
		);
	}

	children.push(
		sectionHeading(numberedSection(3, labels.sections.causeTree)),
		...(causeTree.length > 0
			? causeTree.flatMap((entry) => causeParagraphs(entry, labels, locale))
			: [mutedParagraph(labels.fallbacks.noCauseTree)]),
		sectionHeading(numberedSection(4, labels.sections.actionPlan)),
		...actionPlanContent(causeTree, labels, locale),
	);

	if (photos.length > 0) {
		children.push(
			sectionHeading(numberedSection(5, labels.sections.photos)),
			...photos.flatMap((photo) => reportPhotoParagraphs(photo, labels)),
		);
	}

	return new Document({
		sections: [
			{
				children,
				footers: { default: footer },
			},
			...(treeImage
				? [
						{
							properties: {
								page: { size: { orientation: PageOrientation.LANDSCAPE } },
							},
							children: [
								sectionHeading(labels.sections.causeTree),
								new Paragraph({
									children: [
										new ImageRun({
											altText: {
												description: labels.sections.causeTree,
												name: "cause-tree",
												title: labels.sections.causeTree,
											},
											data: treeImage.data,
											transformation: {
												height: treeImage.height,
												width: treeImage.width,
											},
											type: "png",
										}),
									],
									spacing: { before: 160 },
								}),
							],
							footers: { default: footer },
						},
					]
				: []),
		],
	});
}

function sectionHeading(text: string): Paragraph {
	return new Paragraph({
		children: [new TextRun({ bold: true, text })],
		heading: HeadingLevel.HEADING_1,
		spacing: { after: 160, before: 240 },
	});
}

function subHeading(text: string): Paragraph {
	return new Paragraph({
		children: [new TextRun({ bold: true, text })],
		heading: HeadingLevel.HEADING_2,
		spacing: { after: 80, before: 160 },
	});
}

function timelineEventParagraphs(
	event: ReportTimelineEvent,
	labels: IIExportLabels,
	locale: Locale,
): Paragraph[] {
	return [
		new Paragraph({
			bullet: { level: 0 },
			children: [
				new TextRun(
					`${event.timeLabel ?? event.eventAt ?? labels.fallbacks.untimed}: ${event.text} (${localizeTimelineConfidence(event.confidence, locale)})`,
				),
			],
		}),
		...event.deviations.map(
			(deviation) =>
				new Paragraph({
					bullet: { level: 1 },
					children: [
						new TextRun(
							`${labels.fields.expected}: ${deviation.expected ?? labels.fallbacks.notRecorded}; ${labels.fields.actual}: ${deviation.actual ?? labels.fallbacks.notRecorded}`,
						),
					],
				}),
		),
	];
}

function numberedCauseTree(causes: ReportCauseNode[]): NumberedCause[] {
	const knownIds = new Set(
		causes.flatMap((cause) => (cause.id ? [cause.id] : [])),
	);
	const childrenByParent = new Map<string, ReportCauseNode[]>();
	const roots: ReportCauseNode[] = [];

	for (const cause of causes) {
		if (
			cause.parentId &&
			cause.parentId !== cause.id &&
			knownIds.has(cause.parentId)
		) {
			const siblings = childrenByParent.get(cause.parentId) ?? [];
			siblings.push(cause);
			childrenByParent.set(cause.parentId, siblings);
		} else {
			roots.push(cause);
		}
	}

	const entries: NumberedCause[] = [];
	const visited = new Set<ReportCauseNode>();
	const visit = (cause: ReportCauseNode, number: string, depth: number) => {
		if (visited.has(cause)) {
			return;
		}

		visited.add(cause);
		entries.push({ cause, depth, number });
		const children = cause.id ? (childrenByParent.get(cause.id) ?? []) : [];

		for (const [index, child] of children.entries()) {
			visit(child, `${number}.${index + 1}`, depth + 1);
		}
	};

	// Plain numbering (1, 1.1, …) matches the coach digest and the cause tree
	// panel, so chat, panel, and report all name the same cause the same way.
	for (const [index, root] of roots.entries()) {
		visit(root, String(index + 1), 0);
	}

	for (const cause of causes) {
		if (!visited.has(cause)) {
			const topLevelCount = entries.filter((entry) => entry.depth === 0).length;
			visit(cause, String(topLevelCount + 1), 0);
		}
	}

	return entries;
}

function causeParagraphs(
	entry: NumberedCause,
	labels: IIExportLabels,
	locale: Locale,
): Paragraph[] {
	const { cause, depth, number } = entry;
	const markers: string[] = [];

	if (cause.isRootCause || cause.branchStatus === "ROOT_REACHED") {
		markers.push(labels.markers.rootCause);
	}

	if (cause.branchStatus === "PARKED") {
		markers.push(labels.markers.parked);
	}

	const indent = { left: depth * causeIndentTwips };
	const paragraphs: Paragraph[] = [
		new Paragraph({
			children: [
				new TextRun({ bold: true, text: `${number} ` }),
				new TextRun(cause.statement),
				...(markers.length > 0
					? [new TextRun({ italics: true, text: ` (${markers.join("; ")})` })]
					: []),
			],
			indent,
			spacing: { before: depth === 0 ? 160 : 60 },
		}),
	];

	if (cause.question) {
		paragraphs.push(
			new Paragraph({
				children: [new TextRun({ italics: true, text: cause.question })],
				indent,
			}),
		);
	}

	paragraphs.push(
		...cause.actions.map(
			(action) =>
				new Paragraph({
					children: actionRuns(action, labels, locale),
					indent: { left: (depth + 1) * causeIndentTwips },
				}),
		),
	);

	return paragraphs;
}

function actionRuns(
	action: ReportAction,
	labels: IIExportLabels,
	locale: Locale,
): TextRun[] {
	return [
		...(action.actionType
			? [
					new TextRun({
						bold: true,
						text: `[${stopLetter(action.actionType, locale)}] `,
					}),
				]
			: []),
		new TextRun(
			`${action.description} - ${labels.fields.owner}: ${action.ownerRole ?? labels.fallbacks.unassigned}; ${labels.fields.due}: ${action.dueDate ?? labels.fallbacks.open}; ${labels.fields.status}: ${localizeActionStatus(action.status, locale)}`,
		),
	];
}

function actionPlanContent(
	causeTree: NumberedCause[],
	labels: IIExportLabels,
	locale: Locale,
): Array<Paragraph | Table> {
	const rows = causeTree.flatMap((entry) =>
		entry.cause.actions.map((action) => ({
			action,
			causeNumber: entry.number,
		})),
	);

	if (rows.length === 0) {
		return [mutedParagraph(labels.fallbacks.noCorrectiveActions)];
	}

	return [
		new Table({
			rows: [
				new TableRow({
					children: [
						actionPlanHeaderCell(labels.tableHeaders.cause, 8),
						actionPlanHeaderCell(labels.tableHeaders.measure, 40),
						actionPlanHeaderCell(labels.tableHeaders.stop, 10),
						actionPlanHeaderCell(labels.tableHeaders.owner, 14),
						actionPlanHeaderCell(labels.tableHeaders.due, 14),
						actionPlanHeaderCell(labels.tableHeaders.status, 14),
					],
				}),
				...rows.map(
					({ action, causeNumber }) =>
						new TableRow({
							children: [
								actionPlanCell(causeNumber, 8),
								actionPlanCell(action.description, 40),
								actionPlanCell(
									action.actionType
										? stopLetter(action.actionType, locale)
										: labels.fallbacks.unspecified,
									10,
								),
								actionPlanCell(
									action.ownerRole ?? labels.fallbacks.unassigned,
									14,
								),
								actionPlanCell(action.dueDate ?? labels.fallbacks.open, 14),
								actionPlanCell(localizeActionStatus(action.status, locale), 14),
							],
						}),
				),
			],
			width: { size: 100, type: WidthType.PERCENTAGE },
		}),
	];
}

function actionPlanHeaderCell(text: string, widthPercent: number): TableCell {
	return new TableCell({
		children: [
			new Paragraph({ children: [new TextRun({ bold: true, text })] }),
		],
		width: { size: widthPercent, type: WidthType.PERCENTAGE },
	});
}

function actionPlanCell(text: string, widthPercent: number): TableCell {
	return new TableCell({
		children: [new Paragraph(text)],
		width: { size: widthPercent, type: WidthType.PERCENTAGE },
	});
}

function stopLetter(actionType: string, locale: Locale): string {
	switch (actionType) {
		case "SUBSTITUTION":
			return "S";
		case "TECHNICAL":
		case "ENGINEERING":
			return "T";
		case "ORGANIZATIONAL":
		case "ORGANISATIONAL":
		case "TRAINING":
			return "O";
		case "PPE":
			return "P";
		default:
			return localizeActionType(actionType, locale);
	}
}

function factLine(fact: ReportFact): string {
	const attribution = fact.personName
		? `${fact.personName}${fact.personRole ? ` (${fact.personRole})` : ""}`
		: fact.personRole;

	return attribution ? `${fact.text} — ${attribution}` : fact.text;
}

function reportPhotoParagraphs(
	photo: ReportPhoto,
	labels: IIExportLabels,
): Paragraph[] {
	const captionLine =
		photo.caption ?? photo.filename ?? labels.fallbacks.timelinePhoto;

	return [
		new Paragraph({
			children: [
				new ImageRun({
					altText: {
						description: captionLine,
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
			spacing: { before: 160 },
		}),
		new Paragraph({
			children: [new TextRun(captionLine)],
			spacing: { after: 120 },
		}),
	];
}

/**
 * Coach photo uploads hang off one housekeeping "Photo evidence" timeline
 * event per case. Its attachments belong in the photos section, but the
 * event itself is noise in the facts & timeline section, so it is dropped
 * before translation and rendering.
 */
function withoutCoachPhotoEvidenceEvents(
	workflowData: WorkflowSnapshotData,
): WorkflowSnapshotData {
	return {
		...workflowData,
		timelineEvents: workflowData.timelineEvents.filter((event) => {
			const entry = record(event);

			return !(
				stringOrNull(entry.text) === COACH_PHOTO_EVENT_TEXT &&
				stringOrNull(entry.timeLabel) === COACH_PHOTO_EVENT_TIME_LABEL
			);
		}),
	};
}

async function loadReportPhotos(
	workflowData: WorkflowSnapshotData,
	options: {
		storage?: Storage;
		tenantId?: string;
	},
): Promise<ReportPhoto[]> {
	const candidates: ReportPhotoCandidate[] = records(
		workflowData.timelineEvents,
	).flatMap((event) =>
		records(arrayField(event.attachments)).flatMap((attachment) => {
			const storageKey = stringOrNull(attachment.storageKey);
			const filename = stringOrNull(attachment.filename);
			const type = imageType({
				filename,
				mimeType: stringOrNull(attachment.mimeType),
			});

			if (!storageKey || !type) {
				return [];
			}

			return [
				{
					caption: stringOrNull(attachment.caption),
					filename,
					id: stringOrNull(attachment.id),
					storageKey,
					type,
				},
			];
		}),
	);

	if (candidates.length === 0) {
		return [];
	}

	const captionById = options.tenantId
		? await loadAttachmentCaptions(
				options.tenantId,
				candidates.flatMap((candidate) => (candidate.id ? [candidate.id] : [])),
			)
		: new Map<string, string>();
	const storage = options.storage ?? createStorageFromEnv();
	const tenantKeyPrefix = options.tenantId
		? `${tenantPrefix(options.tenantId)}/`
		: null;

	return Promise.all(
		candidates.map(async (candidate) => {
			if (
				tenantKeyPrefix &&
				!candidate.storageKey.startsWith(tenantKeyPrefix)
			) {
				throw new Error("II report photo storage key is outside the tenant.");
			}

			const object = await storage.get(candidate.storageKey);
			const liveCaption = candidate.id
				? (captionById.get(candidate.id) ?? null)
				: null;

			return {
				bytes: object.body,
				caption: liveCaption ?? candidate.caption,
				filename: candidate.filename,
				type: candidate.type,
			};
		}),
	);
}

/**
 * Photo captions live on incident_attachment and are not part of older
 * approval snapshots, so they are read live whenever the tenant is known.
 */
async function loadAttachmentCaptions(
	tenantId: string,
	attachmentIds: string[],
): Promise<Map<string, string>> {
	if (attachmentIds.length === 0) {
		return new Map();
	}

	return withTenantConnection(tenantId, async (tx) => {
		const rows = await tx.$queryRaw<
			Array<{ id: string; caption: string | null }>
		>`
			SELECT id::text AS id, caption
			FROM incident_attachment
			WHERE id::text = ANY(${attachmentIds}::text[])
		`;

		return new Map(
			rows.flatMap((row) =>
				row.caption?.trim() ? [[row.id, row.caption.trim()] as const] : [],
			),
		);
	});
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

function sourceTenantId(source: IIReportSource): string | undefined {
	return source.type === "workflowData" ? undefined : source.tenantId;
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

function keyValueTable(rows: Array<[string, string]>): Table {
	return new Table({
		rows: rows.map(
			([label, value]) =>
				new TableRow({
					children: [
						new TableCell({
							children: [
								new Paragraph({
									children: [new TextRun({ bold: true, text: label })],
								}),
							],
							width: { size: 30, type: WidthType.PERCENTAGE },
						}),
						new TableCell({
							children: [new Paragraph(value)],
							width: { size: 70, type: WidthType.PERCENTAGE },
						}),
					],
				}),
		),
		width: { size: 100, type: WidthType.PERCENTAGE },
	});
}

function reportView(workflowData: WorkflowSnapshotData) {
	const caseRecord = record(workflowData.case);
	const persons = records(workflowData.persons).map((person) => ({
		name: stringOrNull(person.name),
		role: stringField(person.role, "person.role"),
	}));
	const personsById = new Map(
		records(workflowData.persons).flatMap((person) => {
			const id = stringOrNull(person.id);

			return id
				? [
						[
							id,
							{
								name: stringOrNull(person.name),
								role: stringOrNull(person.role),
							},
						] as const,
					]
				: [];
		}),
	);
	const facts: ReportFact[] = records(workflowData.accounts).flatMap(
		(account) => {
			const person = personsById.get(stringOrNull(account.personId) ?? "");

			return records(arrayField(account.facts)).flatMap((fact) => {
				const text = stringOrNull(fact.text);

				return text
					? [
							{
								personName: person?.name ?? null,
								personRole: person?.role ?? null,
								text,
							},
						]
					: [];
			});
		},
	);
	const timelineEvents = records(workflowData.timelineEvents).map((event) => ({
		confidence: stringField(event.confidence, "timeline.confidence"),
		eventAt: stringOrNull(event.eventAt),
		text: stringField(event.text, "timeline.text"),
		timeLabel: stringOrNull(event.timeLabel),
		deviations: records(arrayField(event.deviations)).map((deviation) => ({
			actual: stringOrNull(deviation.actual),
			expected: stringOrNull(deviation.expected),
		})),
	}));
	const causeNodes: ReportCauseNode[] = records(workflowData.causeNodes).map(
		(node) => ({
			actions: records(arrayField(node.actions)).map((action) => ({
				actionType: stringOrNull(action.actionType),
				description: stringField(action.description, "action.description"),
				dueDate: stringOrNull(action.dueDate),
				ownerRole: stringOrNull(action.ownerRole),
				status: stringField(action.status, "action.status"),
			})),
			branchStatus: causeBranchStatus(node.branchStatus),
			id: stringOrNull(node.id),
			isRootCause: Boolean(node.isRootCause),
			parentId: stringOrNull(node.parentId),
			question: stringOrNull(node.question),
			statement: stringField(node.statement, "cause.statement"),
		}),
	);

	return {
		case: {
			caseNumber: stringOrNull(caseRecord.caseNumber),
			suvaCaseNumber: stringOrNull(caseRecord.suvaCaseNumber),
			hiraFollowupNeeded: Boolean(caseRecord.hiraFollowupNeeded),
			hiraFollowupText: stringOrNull(caseRecord.hiraFollowupText),
			actualSeverityCode: stringOrNull(caseRecord.actualSeverityCode),
			actualSeverityReason: stringOrNull(caseRecord.actualSeverityReason),
			areaText: stringOrNull(caseRecord.areaText),
			bodyPart: stringOrNull(caseRecord.bodyPart),
			closedAt: stringOrNull(caseRecord.closedAt),
			contractorFlag:
				typeof caseRecord.contractorFlag === "boolean"
					? caseRecord.contractorFlag
					: null,
			controlFailure: stringOrNull(caseRecord.controlFailure),
			contributingCauses: arrayField(caseRecord.contributingCauses),
			departmentText: stringOrNull(caseRecord.departmentText),
			eventType: stringOrNull(caseRecord.eventType),
			hazardCategoryCode: hazardCategoryOrNull(caseRecord.hazardCategoryCode),
			immediateCause: stringOrNull(caseRecord.immediateCause),
			incidentAt: stringOrNull(caseRecord.incidentAt),
			incidentType: stringField(caseRecord.incidentType, "case.incidentType"),
			injuryNature: stringOrNull(caseRecord.injuryNature),
			actualInjuryOutcome: stringOrNull(caseRecord.actualInjuryOutcome),
			location: stringOrNull(caseRecord.location),
			lostDays:
				typeof caseRecord.lostDays === "number" ? caseRecord.lostDays : null,
			potentialLikelihoodCode: stringOrNull(caseRecord.potentialLikelihoodCode),
			potentialOutcomeText: stringOrNull(caseRecord.potentialOutcomeText),
			potentialRiskBand: stringOrNull(caseRecord.potentialRiskBand),
			potentialSeverityCode: stringOrNull(caseRecord.potentialSeverityCode),
			processInvolved: stringOrNull(caseRecord.processInvolved),
			ppeRequired: arrayField(caseRecord.ppeRequired),
			ppeWorn: arrayField(caseRecord.ppeWorn),
			reportableUvg:
				typeof caseRecord.reportableUvg === "boolean"
					? caseRecord.reportableUvg
					: null,
			timeInRoleBand: stringOrNull(caseRecord.timeInRoleBand),
			title: stringField(caseRecord.title, "case.title"),
			workActivity: stringOrNull(caseRecord.workActivity),
			workType: stringOrNull(caseRecord.workType),
		},
		causeNodes,
		coordinator:
			[
				stringOrNull(caseRecord.coordinatorRole),
				stringOrNull(caseRecord.coordinatorName),
			]
				.filter(Boolean)
				.join(" - ") || null,
		facts,
		persons,
		timelineEvents,
	};
}

async function convertDocxBufferToPdf(
	docx: Buffer,
): Promise<{ bytes: Buffer }> {
	const workdir = await mkdtemp(join(tmpdir(), "ssfw-ii-report-"));
	const docxPath = join(workdir, "ii-report.docx");
	const pdfPath = join(workdir, "ii-report.pdf");

	try {
		await writeFile(docxPath, docx);
		await execFileAsync(
			"libreoffice",
			["--headless", "--convert-to", "pdf", "--outdir", workdir, docxPath],
			{ timeout: libreOfficeTimeoutMs },
		);
		const bytes = await readFile(pdfPath);

		return {
			bytes,
		};
	} finally {
		await rm(workdir, { force: true, recursive: true });
	}
}

type ReportTreeImage = {
	readonly data: Buffer;
	readonly width: number;
	readonly height: number;
};

/** Build the graphical cause-tree image (PNG + display size) for the landscape
 * page, or null when there are no causes / rasterisation fails. */
async function buildCauseTreeImage(
	workflowData: WorkflowSnapshotData,
): Promise<ReportTreeImage | null> {
	const report = reportView(workflowData);
	if (report.causeNodes.length === 0) {
		return null;
	}
	const causes = report.causeNodes
		.filter((node): node is ReportCauseNode & { id: string } =>
			Boolean(node.id),
		)
		.map((node) => ({
			id: node.id,
			parentId: node.parentId,
			statement: node.statement,
			isRootCause: node.isRootCause,
			branchStatus: node.branchStatus,
		}));
	const actions = report.causeNodes.flatMap((node) =>
		node.id
			? node.actions.map((action, index) => ({
					id: `${node.id}-${index}`,
					causeNodeId: node.id as string,
					description: action.description,
					actionType: action.actionType,
					ownerRole: action.ownerRole,
					dueDate: action.dueDate,
				}))
			: [],
	);
	const { svg, width, height } = renderCauseTreeSvg({
		actions,
		causes,
		eventTitle: report.case.title,
	});
	const png = await svgToPng(svg);
	if (!png) {
		return null;
	}
	// Fit under the heading on a single landscape A4 page (content box ~900 x
	// 440 px at 96dpi, leaving room for margins + the section heading).
	const scale = Math.min(900 / width, 440 / height, 1);
	return {
		data: png,
		width: Math.round(width * scale),
		height: Math.round(height * scale),
	};
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
	const workdir = await mkdtemp(join(tmpdir(), "ssfw-ii-report-pdftext-"));
	const pdfPath = join(workdir, "ii-report.pdf");

	try {
		await writeFile(pdfPath, bytes);
		const { stdout } = await execFileAsync("pdftotext", [pdfPath, "-"], {
			timeout: libreOfficeTimeoutMs,
		});

		return stdout;
	} finally {
		await rm(workdir, { force: true, recursive: true });
	}
}

function workflowData(value: unknown): WorkflowSnapshotData {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new Error("II report workflow_data is not a JSON object.");
	}

	return value as WorkflowSnapshotData;
}

function workflowLocale(workflowData: WorkflowSnapshotData): Locale {
	const contentLanguage = stringOrNull(
		record(workflowData.case).contentLanguage,
	);

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

function stringField(
	value: SnapshotJson | undefined,
	fieldName: string,
): string {
	const parsed = stringOrNull(value);

	if (!parsed) {
		throw new Error(`II report requires ${fieldName}.`);
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

function causeBranchStatus(value: SnapshotJson | undefined): CauseBranchStatus {
	const text = stringOrNull(value);

	return text === "PARKED" || text === "ROOT_REACHED" ? text : "OPEN";
}

function hazardCategoryOrNull(
	value: SnapshotJson | undefined,
): HazardCategoryCode | null {
	const text = stringOrNull(value);
	return HAZARD_CATEGORY_CODES.includes(text as HazardCategoryCode)
		? (text as HazardCategoryCode)
		: null;
}

function severityLabel(code: string, locale: Locale): string {
	return `${code} - ${iiExportSeverityLabel(code as SeverityCode, locale)}`;
}

function likelihoodLabel(code: string, locale: Locale): string {
	return `${code} - ${iiExportLikelihoodLabel(code as LikelihoodCode, locale)}`;
}

export { outputType as II_FULL_REPORT_OUTPUT_TYPE };
