import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { Document, Packer, Paragraph, type Footer } from "docx";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import pptxgen from "pptxgenjs";

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
	applyDisclaimerFooter,
} = await import("../../../src/lib/exports/footer");
const { exportFooterText } = await import("../../../src/lib/legal/disclaimer");

const execFileAsync = promisify(execFile);
const footerText = exportFooterText("en");

test("DOCX helper writes the disclaimer text into a document footer", async () => {
	const buffer = await minimalDocx();
	const zip = await JSZip.loadAsync(buffer);
	const footerFiles = Object.keys(zip.files).filter((fileName) =>
		/^word\/footer\d+\.xml$/.test(fileName),
	);
	const footerXml = await Promise.all(
		footerFiles.map((fileName) => zip.file(fileName)?.async("string")),
	);

	assert.ok(footerFiles.length > 0, "expected at least one DOCX footer part");
	assert.ok(footerXml.some((xml) => xml?.includes(footerText)));
});

test("XLSX helper writes the disclaimer text into worksheet headerFooter XML", async () => {
	const buffer = await applyDisclaimerFooter(
		async ({ applyXlsxFooter }) => {
			const workbook = new ExcelJS.Workbook();
			const worksheet = workbook.addWorksheet("Summary");
			worksheet.getCell("A1").value = "Fixture";
			applyXlsxFooter(worksheet);
			return Buffer.from(await workbook.xlsx.writeBuffer());
		},
		"xlsx",
		{ locale: "en" },
	);
	const zip = await JSZip.loadAsync(buffer);
	const sheetXml = await zip.file("xl/worksheets/sheet1.xml")?.async("string");

	assert.ok(sheetXml?.includes("<headerFooter"));
	assert.ok(sheetXml?.includes(footerText));
});

test("PPTX helper writes the disclaimer text into the slide master layout", async () => {
	const buffer = await applyDisclaimerFooter(
		async ({ pptxSlideMaster }) => {
			const pptx = new pptxgen();
			pptx.layout = "LAYOUT_WIDE";
			pptx.defineSlideMaster(pptxSlideMaster());
			const slide = pptx.addSlide("SSFW_DISCLAIMER_MASTER");
			slide.addText("Fixture", { h: 0.4, w: 2, x: 0.5, y: 0.5 });

			return Buffer.from(
				(await pptx.write({ outputType: "nodebuffer" })) as ArrayBuffer,
			);
		},
		"pptx",
		{ locale: "en" },
	);
	const zip = await JSZip.loadAsync(buffer);
	const layoutFiles = Object.keys(zip.files).filter((fileName) =>
		/^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(fileName),
	);
	const layoutXml = await Promise.all(
		layoutFiles.map((fileName) => zip.file(fileName)?.async("string")),
	);

	assert.ok(layoutFiles.length > 0, "expected at least one PPTX slide layout part");
	assert.ok(layoutXml.some((xml) => xml?.includes(footerText)));
});

test("PDF helper path preserves the DOCX footer through LibreOffice conversion", async () => {
	const workdir = await mkdtemp(join(tmpdir(), "ssfw-footer-"));
	const docxPath = join(workdir, "footer-fixture.docx");
	const pdfPath = join(workdir, "footer-fixture.pdf");

	try {
		const pdfArtifact = await applyDisclaimerFooter(
			async ({ createDocxFooter }) => {
				await writeFile(docxPath, await buildDocxBuffer(createDocxFooter));
				await execFileAsync("libreoffice", [
					"--headless",
					"--convert-to",
					"pdf",
					"--outdir",
					workdir,
					docxPath,
				]);
				const [bytes, { stdout }] = await Promise.all([
					readFile(pdfPath),
					execFileAsync("pdftotext", [pdfPath, "-"]),
				]);

				return {
					bytes,
					extractedText: stdout,
				};
			},
			"pdf",
			{ locale: "en" },
		);
		const normalizedPdfText = pdfArtifact.extractedText.replace(/\s+/g, " ").trim();
		const normalizedFooterText = footerText.replace(/\s+/g, " ").trim();

		assert.ok(pdfArtifact.bytes.byteLength > 0);
		assert.ok(normalizedPdfText.includes(normalizedFooterText));
	} finally {
		await rm(workdir, { force: true, recursive: true });
	}
});

test("applyDisclaimerFooter verifies the generated artifact contains current footer text", async () => {
	const buffer = await applyDisclaimerFooter(
		async ({ createDocxFooter }) =>
			Packer.toBuffer(
				new Document({
					sections: [
						{
							children: [new Paragraph("Verified footer fixture")],
							footers: {
								default: createDocxFooter(),
							},
						},
					],
				}),
			),
		"docx",
		{ locale: "en" },
	);
	const zip = await JSZip.loadAsync(buffer);
	const footerXml = await zip.file("word/footer1.xml")?.async("string");

	assert.ok(footerXml?.includes(footerText));
});

test("applyDisclaimerFooter rejects generators that ignore the format helper", async () => {
	await assert.rejects(
		applyDisclaimerFooter(async () => "ignored", "docx", { locale: "en" }),
		/did not call a format-specific footer helper/,
	);
});

test("applyDisclaimerFooter rejects artifacts that discard the returned footer", async () => {
	await assert.rejects(
		applyDisclaimerFooter(
			async ({ createDocxFooter }) => {
				createDocxFooter();
				return Packer.toBuffer(
					new Document({
						sections: [
							{
								children: [new Paragraph("No footer fixture")],
							},
						],
					}),
				);
			},
			"docx",
			{ locale: "en" },
		),
		/output does not contain the disclaimer footer text/,
	);
});

async function minimalDocx(): Promise<Buffer> {
	return applyDisclaimerFooter(
		async ({ createDocxFooter }) => buildDocxBuffer(createDocxFooter),
		"docx",
		{ locale: "en" },
	);
}

async function buildDocxBuffer(createFooter: () => Footer): Promise<Buffer> {
	return Packer.toBuffer(
		new Document({
			sections: [
				{
					children: [new Paragraph("Footer fixture")],
					footers: {
						default: createFooter(),
					},
				},
			],
		}),
	);
}
