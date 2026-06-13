import { Footer, Paragraph } from "docx";
import type { Worksheet } from "exceljs";
import JSZip from "jszip";
import { exportFooterText } from "../legal/disclaimer";
import { DEFAULT_LOCALE, type Locale } from "../i18n/types";

export type ExportFormat = "docx" | "xlsx" | "pptx" | "pdf";

export type DisclaimerFooter = {
	format: ExportFormat;
	locale: Locale;
	text: string;
};

export type DisclaimerFooterOptions = {
	locale?: Locale;
};

export type DisclaimerFooterTools = {
	footer: DisclaimerFooter;
	format: ExportFormat;
	locale: Locale;
	text: string;
	createDocxFooter: () => Footer;
	applyXlsxFooter: (worksheet: Worksheet) => Worksheet;
	pptxSlideMaster: () => ReturnType<typeof pptxDisclaimerSlideMaster>;
};

export type DisclaimerFooterGenerator<T> = (
	tools: DisclaimerFooterTools,
) => T | Promise<T>;

type VerifiableArtifact = ArrayBuffer | string | Uint8Array;

export type PdfDisclaimerArtifact = {
	bytes: ArrayBuffer | Uint8Array;
	extractedText: string;
};

export function disclaimerFooter(
	format: ExportFormat,
	options: DisclaimerFooterOptions = {},
): DisclaimerFooter {
	const locale = options.locale ?? DEFAULT_LOCALE;

	return {
		format,
		locale,
		text: exportFooterText(locale),
	};
}

export async function applyDisclaimerFooter<T>(
	generator: DisclaimerFooterGenerator<T>,
	format: ExportFormat,
	options: DisclaimerFooterOptions = {},
): Promise<T> {
	const footer = disclaimerFooter(format, options);
	let applied = false;
	const markApplied = () => {
		applied = true;
	};
	const result = await generator({
		applyXlsxFooter: (worksheet) => {
			markApplied();
			return applyXlsxDisclaimerFooter(worksheet, options);
		},
		createDocxFooter: () => {
			markApplied();
			return createDocxDisclaimerFooter(options);
		},
		footer,
		format: footer.format,
		locale: footer.locale,
		pptxSlideMaster: () => {
			markApplied();
			return pptxDisclaimerSlideMaster(options);
		},
		text: footer.text,
	});

	if (!applied) {
		throw new Error(
			`applyDisclaimerFooter(${format}) generator did not call a format-specific footer helper`,
		);
	}

	await assertDisclaimerFooterArtifact(format, result, footer.text);

	return result;
}

export function createDocxDisclaimerFooter(
	options: DisclaimerFooterOptions = {},
): Footer {
	return new Footer({
		children: [new Paragraph(exportFooterText(options.locale ?? DEFAULT_LOCALE))],
	});
}

export function applyXlsxDisclaimerFooter(
	worksheet: Worksheet,
	options: DisclaimerFooterOptions = {},
): Worksheet {
	worksheet.headerFooter.oddFooter = `&C${exportFooterText(options.locale ?? DEFAULT_LOCALE)}`;
	return worksheet;
}

export function pptxDisclaimerSlideMaster(
	options: DisclaimerFooterOptions = {},
) {
	return {
		objects: [
			{
				text: {
					options: {
						color: "666666",
						fontSize: 7,
						h: 0.24,
						w: 12.4,
						x: 0.4,
						y: 7.12,
					},
					text: exportFooterText(options.locale ?? DEFAULT_LOCALE),
				},
			},
		],
		title: "SSFW_DISCLAIMER_MASTER",
	};
}

async function assertDisclaimerFooterArtifact(
	format: ExportFormat,
	artifact: unknown,
	footerText: string,
): Promise<void> {
	if (
		!isVerifiableArtifact(artifact) &&
		!(format === "pdf" && isPdfDisclaimerArtifact(artifact))
	) {
		throw new Error(
			`applyDisclaimerFooter(${format}) generator must return verifiable artifact bytes`,
		);
	}

	const candidates = await footerTextCandidates(format, artifact);

	if (!candidates.some((candidate) => normalized(candidate).includes(normalized(footerText)))) {
		throw new Error(
			`applyDisclaimerFooter(${format}) output does not contain the disclaimer footer text`,
		);
	}
}

async function footerTextCandidates(
	format: ExportFormat,
	artifact: VerifiableArtifact | PdfDisclaimerArtifact,
): Promise<string[]> {
	if (format === "pdf") {
		return isPdfDisclaimerArtifact(artifact)
			? [artifact.extractedText]
			: [artifactToText(artifact)];
	}

	if (!isVerifiableArtifact(artifact)) {
		throw new Error(
			`applyDisclaimerFooter(${format}) generator must return artifact bytes for footer verification`,
		);
	}

	const zip = await JSZip.loadAsync(artifact);
	const filePattern =
		format === "docx"
			? /^word\/footer\d+\.xml$/
			: format === "xlsx"
				? /^xl\/worksheets\/sheet\d+\.xml$/
				: /^ppt\/(?:slideMasters\/slideMaster|slideLayouts\/slideLayout)\d+\.xml$/;
	const files = Object.keys(zip.files).filter((fileName) => filePattern.test(fileName));

	return Promise.all(
		files.map(async (fileName) => (await zip.file(fileName)?.async("string")) ?? ""),
	);
}

function isVerifiableArtifact(artifact: unknown): artifact is VerifiableArtifact {
	return (
		typeof artifact === "string" ||
		artifact instanceof ArrayBuffer ||
		artifact instanceof Uint8Array
	);
}

function isPdfDisclaimerArtifact(artifact: unknown): artifact is PdfDisclaimerArtifact {
	return (
		typeof artifact === "object" &&
		artifact !== null &&
		"bytes" in artifact &&
		"extractedText" in artifact &&
		typeof (artifact as PdfDisclaimerArtifact).extractedText === "string" &&
		((artifact as PdfDisclaimerArtifact).bytes instanceof ArrayBuffer ||
			(artifact as PdfDisclaimerArtifact).bytes instanceof Uint8Array)
	);
}

function artifactToText(artifact: VerifiableArtifact): string {
	if (typeof artifact === "string") {
		return artifact;
	}

	return new TextDecoder().decode(artifact);
}

function normalized(text: string): string {
	return text
		.replace(/&apos;/g, "'")
		.replace(/&quot;/g, '"')
		.replace(/&amp;/g, "&")
		.replace(/\s+/g, " ")
		.trim();
}
