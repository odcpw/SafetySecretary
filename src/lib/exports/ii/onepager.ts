import PptxGenJS from "pptxgenjs";
import { withTenantConnection } from "../../db/tenancy";
import { applyDisclaimerFooter } from "../../exports/footer";
import type { Locale } from "../../i18n/types";
import {
	generateOnePagerDraft,
	type OnePagerDraft,
	type OnePagerDraftOptions,
} from "../../incident/onepager-draft";
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
import { renderCauseTreeSvg } from "./cause-tree-svg";
import { iiExportLabels, localizeIncidentType } from "./labels";
import { type IIExportOptionsInput, normalizeIIExportOptions } from "./options";
import { svgToPng } from "./rasterize";

export type IIOnePagerSource =
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

export type IIOnePagerOptions = IIExportOptionsInput & {
	selectedAttachmentIds?: readonly string[];
	storage?: Storage;
	userId?: string;
	draft?: OnePagerDraft;
	draftOptions?: OnePagerDraftOptions;
};

const outputType = "ii_manager_onepager";
const defaultLocale: Locale = "en";
const maxPhotos = 3;
const minPhotos = 1;

// LAYOUT_WIDE is 13.33in x 7.5in. The text column always occupies the left
// portion; photos fill the right column and their size adapts to the count.
const slideWidth = 13.33;
const slideHeight = 7.5;
const margin = 0.45;
const textColumnWidth = 7.6;
const photoColumnX = textColumnWidth + margin + 0.2;
const photoColumnWidth = slideWidth - photoColumnX - margin;

/**
 * Builds the manager one-pager: a single printable PowerPoint slide that
 * summarises an incident for managers and teams (not safety pros). The lesson
 * and summary text are LLM-drafted (promptPurpose "ii_onepager") unless a
 * reviewed draft is supplied via options.draft. Photos selected by the user
 * are embedded; the layout adapts to 1, 2, or 3 photos.
 */
export async function generateIIOnePagerPptx(
	source: IIOnePagerSource,
	options: IIOnePagerOptions = {},
): Promise<Buffer> {
	const { tenantId, workflowData } = await resolveWorkflowData(source);
	const sourceLocale = workflowLocale(workflowData);
	const exportOptions = normalizeIIExportOptions(options, sourceLocale);
	const locale = exportOptions.exportLocale;
	const labels = iiExportLabels(locale);

	const photos = await loadSelectedPhotos(workflowData, {
		selectedAttachmentIds: options.selectedAttachmentIds,
		storage: options.storage,
		tenantId,
	});

	const draft =
		options.draft ??
		(await generateOnePagerDraft(
			{
				locale,
				tenantId: tenantId ?? "",
				userId: options.userId ?? "",
				workflowId: caseIdFromWorkflow(workflowData),
				workflowData,
			},
			options.draftOptions,
		));

	const facts = factsLine(workflowData, labels, locale);
	const causeTree = await buildCauseTreeImage(workflowData);

	return (await applyDisclaimerFooter(
		async ({ pptxSlideMaster }) => {
			const pptx = new PptxGenJS();
			pptx.defineLayout({
				height: slideHeight,
				name: "SSFW_ONEPAGER",
				width: slideWidth,
			});
			pptx.layout = "SSFW_ONEPAGER";
			pptx.defineSlideMaster(
				pptxSlideMaster() as Parameters<typeof pptx.defineSlideMaster>[0],
			);

			const slide = pptx.addSlide({ masterName: "SSFW_DISCLAIMER_MASTER" });
			buildSlide(slide, { draft, facts, labels, photos });

			if (causeTree) {
				const treeSlide = pptx.addSlide({
					masterName: "SSFW_DISCLAIMER_MASTER",
				});
				buildCauseTreeSlide(treeSlide, { image: causeTree, labels });
			}

			return (await pptx.write({ outputType: "nodebuffer" })) as Buffer;
		},
		"pptx",
		{ locale },
	)) as Buffer;
}

export function iiOnePagerFilename(caseId: string): string {
	return `ii-manager-onepager-${caseId}.pptx`;
}

type InlinePhoto = {
	altText: string;
	dataUri: string;
};

type CauseTreeImage = {
	dataUri: string;
	width: number;
	height: number;
};

// The cause-tree slide gives the diagram its own wide canvas: a title at the
// top, then the rasterised tree fit (never stretched) within the content box.
const treeTitleHeight = 0.8;
const treeContentMaxWidth = slideWidth - margin * 2;
const treeContentMaxHeight =
	slideHeight - margin * 2 - 0.4 - treeTitleHeight - 0.1;

function buildSlide(
	slide: PptxGenJS.Slide,
	input: {
		draft: OnePagerDraft;
		facts: string;
		labels: ReturnType<typeof iiExportLabels>;
		photos: InlinePhoto[];
	},
): void {
	const { draft, facts, labels, photos } = input;
	const hasPhotos = photos.length > 0;
	const textWidth = hasPhotos ? textColumnWidth : slideWidth - margin * 2;

	// Title.
	slide.addText(draft.title, {
		align: "left",
		bold: true,
		color: "1A2B3C",
		fontSize: 26,
		h: 0.8,
		w: textWidth,
		x: margin,
		y: margin,
	});

	// Facts line (where / when / type — roles only, no personal data).
	slide.addText(facts, {
		align: "left",
		color: "555555",
		fontSize: 11,
		h: 0.5,
		italic: true,
		w: textWidth,
		x: margin,
		y: margin + 0.85,
	});

	// Summary sections stacked in the left column.
	const sections: Array<{ heading: string; body: string }> = [
		{ body: draft.whatHappened, heading: labels.onePager.whatHappened },
		{ body: draft.causes, heading: labels.onePager.causes },
		{ body: draft.actions, heading: labels.onePager.actions },
	];

	const sectionTop = margin + 1.45;
	const sectionHeight = 1.0;

	sections.forEach((section, index) => {
		const y = sectionTop + index * sectionHeight;
		slide.addText(
			[
				{
					options: {
						bold: true,
						breakLine: true,
						color: "1A6FB0",
						fontSize: 12,
					},
					text: section.heading,
				},
				{
					options: { color: "222222", fontSize: 11 },
					text: section.body,
				},
			],
			{
				align: "left",
				h: sectionHeight - 0.1,
				valign: "top",
				w: textWidth,
				x: margin,
				y,
			},
		);
	});

	// Lessons learned at three leadership levels.
	const lessonsTop = sectionTop + sections.length * sectionHeight + 0.1;
	slide.addText(labels.onePager.lessonsLearned, {
		align: "left",
		bold: true,
		color: "1A2B3C",
		fontSize: 14,
		h: 0.35,
		w: textWidth,
		x: margin,
		y: lessonsTop,
	});

	const lessons: Array<{ level: string; body: string }> = [
		{ body: draft.lessons.teamMember, level: labels.onePager.asTeamMember },
		{
			body: draft.lessons.frontlineManager,
			level: labels.onePager.asFrontlineManager,
		},
		{ body: draft.lessons.executive, level: labels.onePager.asExecutive },
	];

	slide.addText(
		lessons.flatMap((lesson, index) => [
			{
				options: {
					bold: true,
					breakLine: false,
					color: "B5651D",
					fontSize: 11,
				},
				text: `${lesson.level}: `,
			},
			{
				options: {
					breakLine: index < lessons.length - 1,
					color: "222222",
					fontSize: 11,
				},
				text: lesson.body,
			},
		]),
		{
			align: "left",
			h: 1.4,
			valign: "top",
			w: textWidth,
			x: margin,
			y: lessonsTop + 0.4,
		},
	);

	if (hasPhotos) {
		placePhotos(slide, photos);
	}
}

/**
 * Lays the selected photos down the right-hand column. The slot count drives
 * the size: a single photo fills the column tall, two stack at half height,
 * three stack at one-third height. Each image is contained (never stretched)
 * within its slot so portrait and landscape shots both stay readable.
 */
function placePhotos(slide: PptxGenJS.Slide, photos: InlinePhoto[]): void {
	const count = Math.min(photos.length, maxPhotos);
	const top = margin;
	const available = slideHeight - margin - 0.4 - top;
	const gap = 0.2;
	const slotHeight = (available - gap * (count - 1)) / count;

	photos.slice(0, count).forEach((photo, index) => {
		slide.addImage({
			altText: photo.altText,
			data: photo.dataUri,
			h: slotHeight,
			sizing: {
				h: slotHeight,
				type: "contain",
				w: photoColumnWidth,
			},
			w: photoColumnWidth,
			x: photoColumnX,
			y: top + index * (slotHeight + gap),
		});
	});
}

/**
 * Second slide: the graphical cause tree on its own wide canvas. The diagram
 * is fit (preserving the SVG aspect ratio) inside the content box and centred
 * horizontally, so the same tree the coach shows on screen also prints here.
 */
function buildCauseTreeSlide(
	slide: PptxGenJS.Slide,
	input: {
		image: CauseTreeImage;
		labels: ReturnType<typeof iiExportLabels>;
	},
): void {
	const { image, labels } = input;

	slide.addText(labels.sections.causeTree, {
		align: "left",
		bold: true,
		color: "1A2B3C",
		fontSize: 22,
		h: treeTitleHeight,
		w: treeContentMaxWidth,
		x: margin,
		y: margin,
	});

	const scale = Math.min(
		treeContentMaxWidth / image.width,
		treeContentMaxHeight / image.height,
		1,
	);
	const displayWidth = image.width * scale;
	const displayHeight = image.height * scale;
	const top = margin + treeTitleHeight + 0.1;

	slide.addImage({
		altText: labels.sections.causeTree,
		data: image.dataUri,
		h: displayHeight,
		sizing: {
			h: displayHeight,
			type: "contain",
			w: displayWidth,
		},
		w: displayWidth,
		x: margin + (treeContentMaxWidth - displayWidth) / 2,
		y: top,
	});
}

/**
 * Build the cause-tree PNG (as a data URI) plus its native pixel size from the
 * resolved workflow data. Mirrors the comms one-pager's mapping of causeNodes
 * to the shared layout input. Returns null when there are no causes or when
 * rasterisation fails (e.g. rsvg-convert not installed), so the slide is simply
 * skipped and the export still succeeds.
 */
async function buildCauseTreeImage(
	workflowData: WorkflowSnapshotData,
): Promise<CauseTreeImage | null> {
	const caseRecord = record(workflowData.case);
	const nodes = records(workflowData.causeNodes);

	if (nodes.length === 0) {
		return null;
	}

	const causes = nodes.flatMap((node) => {
		const id = stringOrNull(node.id);
		if (!id) {
			return [];
		}

		return [
			{
				id,
				parentId: stringOrNull(node.parentId),
				statement: stringOrNull(node.statement) ?? "",
				isRootCause: Boolean(node.isRootCause),
				branchStatus: stringOrNull(node.branchStatus),
			},
		];
	});

	if (causes.length === 0) {
		return null;
	}

	const actions = nodes.flatMap((node) => {
		const id = stringOrNull(node.id);
		if (!id) {
			return [];
		}

		return records(arrayField(node.actions)).map((action, index) => ({
			id: `${id}-${index}`,
			causeNodeId: id,
			description: stringOrNull(action.description) ?? "",
			actionType: stringOrNull(action.actionType),
			ownerRole: stringOrNull(action.ownerRole),
			dueDate: stringOrNull(action.dueDate),
		}));
	});

	const { svg, width, height } = renderCauseTreeSvg({
		actions,
		causes,
		eventTitle: stringOrNull(caseRecord.title) ?? "",
	});
	const png = await svgToPng(svg);

	if (!png) {
		return null;
	}

	return {
		dataUri: `data:image/png;base64,${png.toString("base64")}`,
		height,
		width,
	};
}

async function loadSelectedPhotos(
	workflowData: WorkflowSnapshotData,
	options: {
		selectedAttachmentIds?: readonly string[];
		storage?: Storage;
		tenantId?: string;
	},
): Promise<InlinePhoto[]> {
	const imageAttachments = records(workflowData.timelineEvents).flatMap(
		(event) => {
			const eventText = stringOrNull(event.text) ?? "";
			return records(arrayField(event.attachments))
				.map((attachment) => ({
					eventText,
					filename: stringOrNull(attachment.filename),
					id: stringOrNull(attachment.id),
					mimeType: stringOrNull(attachment.mimeType),
					storageKey: stringOrNull(attachment.storageKey),
				}))
				.map((attachment) => ({
					...attachment,
					imageType: imageType(attachment),
				}))
				.filter(
					(
						attachment,
					): attachment is typeof attachment & {
						id: string;
						storageKey: string;
						imageType: "jpg" | "png";
					} =>
						attachment.imageType !== null &&
						attachment.id !== null &&
						attachment.storageKey !== null,
				);
		},
	);

	const requestedAttachmentIds = options.selectedAttachmentIds
		? new Set(options.selectedAttachmentIds)
		: null;
	const candidates = (
		requestedAttachmentIds
			? imageAttachments.filter((attachment) =>
					requestedAttachmentIds.has(attachment.id),
				)
			: imageAttachments.slice(0, minPhotos)
	).slice(0, maxPhotos);

	if (candidates.length === 0) {
		return [];
	}

	const storage = options.storage ?? createStorageFromEnv();
	const tenantKeyPrefix = options.tenantId
		? `${tenantPrefix(options.tenantId)}/`
		: null;

	return Promise.all(
		candidates.map(async (attachment) => {
			if (
				tenantKeyPrefix &&
				!attachment.storageKey.startsWith(tenantKeyPrefix)
			) {
				throw new Error(
					"Manager one-pager photo storage key is outside the tenant.",
				);
			}

			const object = await storage.get(attachment.storageKey);
			const base64 = Buffer.from(object.body).toString("base64");
			const mime = attachment.imageType === "png" ? "image/png" : "image/jpeg";

			return {
				altText:
					attachment.filename ?? attachment.eventText.slice(0, 80) ?? "Photo",
				dataUri: `data:${mime};base64,${base64}`,
			};
		}),
	);
}

async function resolveWorkflowData(
	source: IIOnePagerSource,
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

	const workflowData = await withTenantConnection(
		source.tenantId,
		async (tx) => {
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
		},
	);

	return {
		tenantId: source.tenantId,
		workflowData,
	};
}

function factsLine(
	workflowData: WorkflowSnapshotData,
	labels: ReturnType<typeof iiExportLabels>,
	locale: Locale,
): string {
	const caseRecord = record(workflowData.case);
	const incidentType = localizeIncidentType(
		stringOrNull(caseRecord.incidentType) ?? "",
		locale,
	);
	const parts = [
		incidentType,
		stringOrNull(caseRecord.location)
			? `${labels.fields.location}: ${stringOrNull(caseRecord.location)}`
			: null,
		stringOrNull(caseRecord.incidentAt)
			? `${labels.fields.incidentTime}: ${formatDate(
					stringOrNull(caseRecord.incidentAt),
				)}`
			: null,
	].filter((part): part is string => Boolean(part));

	return `${labels.onePager.facts} — ${parts.join("  |  ")}`;
}

function formatDate(value: string | null): string {
	if (!value) {
		return "";
	}

	// Keep dates only (no personal-data-bearing precision needed for managers).
	const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
	return match ? (match[1] ?? value) : value;
}

function caseIdFromWorkflow(
	workflowData: WorkflowSnapshotData,
): string | undefined {
	return stringOrNull(record(workflowData.case).id) ?? undefined;
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
		throw new Error("II one-pager workflow_data is not a JSON object.");
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

function stringOrNull(value: SnapshotJson | undefined): string | null {
	if (typeof value === "string") {
		return value;
	}

	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}

	return null;
}

export { outputType as II_MANAGER_ONEPAGER_OUTPUT_TYPE };
