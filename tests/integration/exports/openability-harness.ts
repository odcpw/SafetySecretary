import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import JSZip from "jszip";

const execFileAsync = promisify(execFile);
const IN_SCOPE_FORMATS = new Set(["docx", "xlsx", "pdf"]);
const REQUIRED_FILES = [
	"hira-report.docx",
	"jha-report.docx",
	"ii-report.docx",
	"sop-one-pager.docx",
	"hira-report.xlsx",
	"audit-checklist.xlsx",
	"hira-report.pdf",
	"jha-report.pdf",
	"ii-report.pdf",
	"sop-one-pager.pdf",
] as const;

type ManifestEntry = {
	file: string;
	format: string;
	name: string;
	size: number;
};

type CheckResult = {
	file: string;
	format: string;
	info: string;
	status: "PASS";
};

async function main() {
	const fixtureDir = resolveFixtureDir();
	const manifest = await loadManifest(fixtureDir);
	const inScope = manifest.filter((entry) =>
		IN_SCOPE_FORMATS.has(entry.format),
	);
	const missing = REQUIRED_FILES.filter(
		(fileName) => !inScope.some((entry) => entry.file === fileName),
	);

	if (missing.length > 0) {
		throw new Error(`Missing in-scope export fixtures: ${missing.join(", ")}`);
	}

	const results: CheckResult[] = [];

	for (const entry of inScope.sort((a, b) => a.file.localeCompare(b.file))) {
		const filePath = join(fixtureDir, entry.file);
		if (!existsSync(filePath)) {
			throw new Error(`Manifest entry missing file: ${filePath}`);
		}

		if (entry.format === "docx") {
			results.push(await checkDocxRoundTrip(filePath));
			continue;
		}

		if (entry.format === "xlsx") {
			results.push(await checkXlsx(filePath));
			continue;
		}

		if (entry.format === "pdf") {
			results.push(await checkPdf(filePath));
		}
	}

	console.log(JSON.stringify({ fixtureDir, results }, null, 2));
}

function resolveFixtureDir(): string {
	const candidates = [
		process.env.SSFW_EXPORT_FIXTURE_DIR,
		join(process.cwd(), "fixtures", "exports", "golden"),
		join(
			dirname(process.cwd()),
			"SafetySecretaryFlywheel",
			"fixtures",
			"exports",
			"golden",
		),
	].filter(Boolean) as string[];

	const fixtureDir = candidates.find((candidate) =>
		existsSync(join(candidate, "manifest.json")),
	);

	if (!fixtureDir) {
		throw new Error(
			`Export fixtures not found. Set SSFW_EXPORT_FIXTURE_DIR to the directory containing manifest.json. Checked: ${candidates.join(", ")}`,
		);
	}

	return resolve(fixtureDir);
}

async function loadManifest(fixtureDir: string): Promise<ManifestEntry[]> {
	const manifest = JSON.parse(
		await readFile(join(fixtureDir, "manifest.json"), "utf8"),
	) as ManifestEntry[];

	if (!Array.isArray(manifest)) {
		throw new Error("Export fixture manifest must be an array");
	}

	return manifest;
}

async function checkDocxRoundTrip(filePath: string): Promise<CheckResult> {
	const zip = await JSZip.loadAsync(await readFile(filePath));
	const documentXml = await zip.file("word/document.xml")?.async("string");
	if (!documentXml?.includes("<w:document")) {
		throw new Error(`${filePath} is missing word/document.xml`);
	}

	const workdir = await mkdtemp(join(tmpdir(), "ssfw-openability-"));
	try {
		await execFileAsync("libreoffice", [
			"--headless",
			"--convert-to",
			"pdf",
			"--outdir",
			workdir,
			filePath,
		]);
		const pdfPath = join(workdir, `${basename(filePath, ".docx")}.pdf`);
		const { stdout } = await execFileAsync("pdfinfo", [pdfPath]);
		const pages = pageCount(stdout);
		if (pages < 1) {
			throw new Error(`${pdfPath} has no pages after LibreOffice conversion`);
		}

		return {
			file: basename(filePath),
			format: "docx",
			info: `LibreOffice DOCX->PDF round-trip produced ${pages} page(s)`,
			status: "PASS",
		};
	} finally {
		await rm(workdir, { force: true, recursive: true });
	}
}

async function checkXlsx(filePath: string): Promise<CheckResult> {
	const zip = await JSZip.loadAsync(await readFile(filePath));
	const workbookXml = await zip.file("xl/workbook.xml")?.async("string");
	const sheetFiles = Object.keys(zip.files).filter((fileName) =>
		/^xl\/worksheets\/sheet\d+\.xml$/.test(fileName),
	);

	if (!workbookXml?.includes("<workbook") || sheetFiles.length < 1) {
		throw new Error(`${filePath} is missing workbook data`);
	}

	return {
		file: basename(filePath),
		format: "xlsx",
		info: `OOXML workbook has ${sheetFiles.length} sheet file(s)`,
		status: "PASS",
	};
}

async function checkPdf(filePath: string): Promise<CheckResult> {
	const { stdout } = await execFileAsync("pdfinfo", [filePath]);
	const pages = pageCount(stdout);
	if (pages < 1) {
		throw new Error(`${filePath} has no pages`);
	}

	return {
		file: basename(filePath),
		format: "pdf",
		info: `pdfinfo reports ${pages} page(s)`,
		status: "PASS",
	};
}

function pageCount(pdfInfo: string): number {
	const match = pdfInfo.match(/^Pages:\s+(\d+)$/m);
	return match ? Number.parseInt(match[1] ?? "0", 10) : 0;
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
