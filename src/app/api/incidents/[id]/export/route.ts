import { type NextRequest, NextResponse } from "next/server";
import { readSessionCookie } from "../../../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../../lib/auth/session";
import { prisma } from "../../../../../lib/db";
import {
	generateIICommsOnePagerDocx,
	iiCommsFilename,
} from "../../../../../lib/exports/ii/comms-onepager";
import {
	generateIIReportDocx,
	generateIIReportPdf,
	iiReportFilename,
} from "../../../../../lib/exports/ii/full-report";
import {
	generateIIOnePagerPptx,
	iiOnePagerFilename,
} from "../../../../../lib/exports/ii/onepager";
import {
	attachmentContentDisposition,
	parseIIExportOptions,
	parseSelectedAttachmentIds,
} from "../../../../../lib/exports/ii/options";
import { DEFAULT_LOCALE, type Locale } from "../../../../../lib/i18n/types";
import { WorkflowNotFoundError } from "../../../../../lib/incident/serialise";

export const runtime = "nodejs";

type ExportRouteContext = {
	params: Promise<{ id: string }> | { id: string };
};

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
	request: NextRequest,
	context: ExportRouteContext,
): Promise<NextResponse> {
	const { id: caseId } = await Promise.resolve(context.params);

	if (!isUuid(caseId)) {
		return NextResponse.json({ code: "INVALID_INCIDENT_ID" }, { status: 400 });
	}

	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	const url = new URL(request.url);
	const report = url.searchParams.get("report") ?? "full-report";
	const format = url.searchParams.get("format") ?? "docx";
	const snapshotId = url.searchParams.get("snapshotId");
	const selectedAttachmentIds = parseSelectedAttachmentIds(url.searchParams);

	if (report !== "full-report" && report !== "comms" && report !== "onepager") {
		return NextResponse.json(
			{ code: "INVALID_EXPORT_REPORT" },
			{ status: 400 },
		);
	}

	if (!isValidReportFormat(report, format)) {
		return NextResponse.json(
			{ code: "INVALID_EXPORT_FORMAT" },
			{ status: 400 },
		);
	}

	if (snapshotId && !isUuid(snapshotId)) {
		return NextResponse.json({ code: "INVALID_SNAPSHOT_ID" }, { status: 400 });
	}

	if (selectedAttachmentIds.some((photoId) => !isUuid(photoId))) {
		return NextResponse.json({ code: "INVALID_PHOTO_ID" }, { status: 400 });
	}

	const exportOptions = await resolveExportOptions(url, session.userId);

	if (!exportOptions.ok) {
		return NextResponse.json({ code: exportOptions.code }, { status: 400 });
	}

	try {
		const generatorOptions = {
			...exportOptions.options,
			translationContext: {
				tenantId: session.tenantId,
				userId: session.userId,
				workflowId: caseId,
			},
		};

		if (report === "onepager") {
			const pptx = await generateIIOnePagerPptx(
				snapshotId
					? {
							caseId,
							snapshotId,
							tenantId: session.tenantId,
							type: "snapshot",
						}
					: { caseId, tenantId: session.tenantId, type: "draft" },
				{
					...exportOptions.options,
					selectedAttachmentIds:
						selectedAttachmentIds.length > 0
							? selectedAttachmentIds
							: undefined,
					userId: session.userId,
				},
			);

			return bytesResponse(pptx, {
				contentType:
					"application/vnd.openxmlformats-officedocument.presentationml.presentation",
				filename: iiOnePagerFilename(caseId),
			});
		}

		if (report === "comms") {
			const docx = await generateIICommsOnePagerDocx(
				snapshotId
					? {
							caseId,
							snapshotId,
							tenantId: session.tenantId,
							type: "snapshot",
						}
					: { caseId, tenantId: session.tenantId, type: "draft" },
				{
					...generatorOptions,
					selectedAttachmentIds:
						selectedAttachmentIds.length > 0
							? selectedAttachmentIds
							: undefined,
				},
			);

			return bytesResponse(docx, {
				contentType:
					"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
				filename: iiCommsFilename(caseId),
			});
		}

		if (format === "pdf") {
			const pdf = await generateIIReportPdf(
				snapshotId
					? {
							caseId,
							snapshotId,
							tenantId: session.tenantId,
							type: "snapshot",
						}
					: { caseId, tenantId: session.tenantId, type: "draft" },
				generatorOptions,
			);

			return bytesResponse(pdf.bytes, {
				contentType: "application/pdf",
				filename: iiReportFilename(caseId, "pdf"),
			});
		}

		const docx = await generateIIReportDocx(
			snapshotId
				? {
						caseId,
						snapshotId,
						tenantId: session.tenantId,
						type: "snapshot",
					}
				: { caseId, tenantId: session.tenantId, type: "draft" },
			generatorOptions,
		);

		return bytesResponse(docx, {
			contentType:
				"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
			filename: iiReportFilename(caseId, "docx"),
		});
	} catch (error) {
		if (error instanceof WorkflowNotFoundError) {
			return NextResponse.json(
				{ code: "INCIDENT_EXPORT_SOURCE_NOT_FOUND" },
				{ status: 404 },
			);
		}

		return NextResponse.json(
			{ code: "INCIDENT_EXPORT_FAILED" },
			{ status: 500 },
		);
	}
}

async function resolveExportOptions(url: URL, userId: string) {
	const localeParam =
		url.searchParams.get("locale") ?? url.searchParams.get("exportLocale");
	const translateParam =
		url.searchParams.get("translate") ??
		url.searchParams.get("translateStoredContent");
	const preliminary = parseIIExportOptions({
		defaultLocale: DEFAULT_LOCALE,
		localeParam,
		translateParam,
	});

	if (localeParam) {
		return preliminary;
	}

	if (!preliminary.ok) {
		return preliminary;
	}

	return parseIIExportOptions({
		defaultLocale: await loadUserLocale(userId),
		translateParam,
	});
}

async function loadUserLocale(userId: string): Promise<Locale> {
	const user = await prisma.user.findUnique({
		select: { uiLocale: true },
		where: { id: userId },
	});

	return user?.uiLocale ?? DEFAULT_LOCALE;
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "tenantId" | "userId"> | null> {
	return validateSession(readSessionCookie(request.cookies));
}

function bytesResponse(
	bytes: Uint8Array,
	options: { contentType: string; filename: string },
): NextResponse {
	return new NextResponse(arrayBuffer(bytes), {
		headers: {
			"content-disposition": attachmentContentDisposition(options.filename),
			"content-type": options.contentType,
		},
		status: 200,
	});
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
	return bytes.buffer.slice(
		bytes.byteOffset,
		bytes.byteOffset + bytes.byteLength,
	) as ArrayBuffer;
}

function isValidReportFormat(report: string, format: string): boolean {
	if (report === "onepager") {
		return format === "pptx";
	}

	if (report === "full-report") {
		return format === "docx" || format === "pdf";
	}

	// comms one-pager only ships as docx.
	return format === "docx";
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}
