#!/usr/bin/env -S node --experimental-strip-types
/**
 * Manual Gemma quality evaluation harness for ADR-0005 D8.
 *
 * This script is deliberately outside CI. It refuses to run unless
 * LLM_VALIDATION_OK=1 is set, then evaluates the fixture corpus against a
 * configured local OpenAI-compatible endpoint and, when OPENAI_API_KEY is
 * present, the OpenAI provider.
 */

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import {
	createServer,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import { registerHooks } from "node:module";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";

registerHooks({
	resolve(specifier, context, nextResolve) {
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

type OpenAICompatibleProviderCtor =
	typeof import("../../src/lib/llm/openai-compatible").OpenAICompatibleProvider;
type OpenAIProviderCtor =
	typeof import("../../src/lib/llm/openai").OpenAIProvider;
type LLMProvider = import("../../src/lib/llm/types").LLMProvider;
type LLMResponse = import("../../src/lib/llm/types").LLMResponse;
type LLMTextRequest = import("../../src/lib/llm/types").LLMTextRequest;
type LLMVisionRequest = import("../../src/lib/llm/types").LLMVisionRequest;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, "..", "..");
const TEXT_FIXTURE_DIR = path.join(
	PROJECT_ROOT,
	"tests",
	"fixtures",
	"llm-eval",
	"text",
);
const VISION_FIXTURE_DIR = path.join(
	PROJECT_ROOT,
	"tests",
	"fixtures",
	"llm-eval",
	"vision",
);
const VISION_IMAGE_DIR = path.join(VISION_FIXTURE_DIR, "images");
const EVIDENCE_DIR = path.join(PROJECT_ROOT, "evidence", "llm-eval");
const TAXONOMY_EN_PATH = path.join(
	PROJECT_ROOT,
	"fixtures",
	"taxonomy",
	"taxonomy.en.json",
);

const GATE_MESSAGE =
	"Refusing to run Gemma quality harness: LLM_VALIDATION_OK=1 is required per ADR-0005 D7 and ADR-0005 D8.";
const DEFAULT_TEXT_MODEL = "gemma-quality-text";
const DEFAULT_VISION_MODEL = "gemma-quality-vision";
const LOOPBACK_API_KEY = "loopback-gemma-quality";
const LOOPBACK_PATTERN = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/;
const TODAY = new Date().toISOString().slice(0, 10);

const TEXT_FAMILY_IDS = [
	"step_extraction",
	"hazard_extraction",
	"suva_category_proposal",
	"severity_likelihood_suggestion",
	"action_rewording",
	"stop_control_proposal",
	"ii_5whys_turn",
	"cross_hira_suggestion",
] as const;

type TextFamilyId = (typeof TEXT_FAMILY_IDS)[number];

type Rubric = {
	readonly mode: "json_schema";
	readonly requiredFields: readonly string[];
	readonly humanReviewNote: string;
};

type TextFixture = {
	readonly id: string;
	readonly prompt: string;
	readonly expectedShape: Rubric;
};

type TextFixtureFile = {
	readonly family: TextFamilyId;
	readonly description: string;
	readonly fixtures: readonly TextFixture[];
};

type VisionFixture = {
	readonly id: string;
	readonly categoryCode: string;
	readonly file: string;
	readonly mimeType: "image/png";
	readonly prompt: string;
	readonly expectedShape: Rubric;
};

type VisionManifest = {
	readonly description: string;
	readonly fixtures: readonly VisionFixture[];
};

type ProviderRun = {
	readonly providerName: string;
	readonly rows: ResultRow[];
};

type ResultRow = {
	readonly fixtureType: "text" | "vision";
	readonly familyOrCategory: string;
	readonly fixtureId: string;
	readonly pass: boolean;
	readonly provider: string;
	readonly model: string;
	readonly responsePreview: string;
	readonly errors: readonly string[];
};

type ParsedArgs = {
	readonly writeFixtures: boolean;
	readonly fakeLoopback: boolean;
	readonly output?: string;
};

type TaxonomyCategory = {
	readonly code: string;
	readonly label: string;
};

type TaxonomyFixture = {
	readonly categories: readonly TaxonomyCategory[];
};

type FixtureWriter = {
	readonly filename: string;
	readonly width: number;
	readonly height: number;
	readonly draw: (pixels: Uint8Array, width: number, height: number) => void;
};

const TASK_SCENARIOS = [
	"packaging line changeover with a jammed carton sensor",
	"forklift battery charging beside a pedestrian route",
	"cleaning a mixer with residual wet product in the bowl",
	"replacing a blade on a guarded cutting station",
	"moving solvent drums from storage to a dosing point",
	"working from a step ladder to reset an overhead valve",
	"clearing dust from a filter housing during maintenance",
	"night-shift handover after an alarm and partial stop",
	"manual pallet wrapping at the end of a packing process",
	"outdoor unloading during rain and poor visibility",
] as const;

const TEXT_FIXTURES: readonly TextFixtureFile[] = TEXT_FAMILY_IDS.map(
	(family) => ({
		family,
		description: textFamilyDescription(family),
		fixtures: TASK_SCENARIOS.map((scenario, index) => ({
			id: `${family}-${String(index + 1).padStart(2, "0")}`,
			prompt: buildTextPrompt(family, scenario),
			expectedShape: textRubric(family),
		})),
	}),
);

const VISION_FIXTURES: readonly VisionFixture[] = [
	"MECHANICAL",
	"FALLS",
	"ELECTRICAL",
	"HAZARDOUS_SUBSTANCES",
	"FIRE_EXPLOSION",
	"THERMAL",
	"PHYSICAL_AGENTS",
	"ENVIRONMENTAL",
	"MUSCULOSKELETAL",
	"PSYCHOSOCIAL",
	"UNEXPECTED_ACTIONS",
	"WORK_ORGANISATION",
].map((categoryCode) => ({
	id: `vision-${categoryCode.toLowerCase()}`,
	categoryCode,
	file: `images/${categoryCode.toLowerCase()}.png`,
	mimeType: "image/png",
	prompt: [
		"This is a synthetic Safety Secretary diagram, not a real workplace photo.",
		`Assess the visible cue for SUVA category ${categoryCode}.`,
		"Return JSON with hazards, categoryCode, confidence, and reviewNote.",
	].join(" "),
	expectedShape: {
		mode: "json_schema",
		requiredFields: ["hazards", "categoryCode", "confidence", "reviewNote"],
		humanReviewNote:
			"Reviewer checks whether the model describes only synthetic cues and avoids inventing real incident facts.",
	},
}));

async function main(): Promise<void> {
	if (process.env.LLM_VALIDATION_OK !== "1") {
		throw new Error(GATE_MESSAGE);
	}

	const args = parseArgs(process.argv.slice(2));

	if (args.writeFixtures) {
		await writeDefaultFixtures();
	}

	const taxonomy = await readTaxonomy();
	const textFixtures = await readTextFixtureFiles();
	const visionManifest = await readVisionManifest();
	const checks = await validateFixtureCorpus(
		textFixtures,
		visionManifest,
		taxonomy,
	);
	const providerContext = await buildProviders(args);
	const runs: ProviderRun[] = [];

	try {
		for (const provider of providerContext.providers) {
			runs.push({
				providerName: provider.name,
				rows: await runProvider(
					provider.name,
					provider.provider,
					textFixtures,
					visionManifest,
				),
			});
		}
	} finally {
		await providerContext.cleanup();
	}

	const reportPath = args.output
		? path.resolve(args.output)
		: path.join(EVIDENCE_DIR, `${TODAY}.md`);
	await writeReport(reportPath, {
		args,
		checks,
		providers: runs,
		openAiSkipped: !providerContext.providers.some(
			(provider) => provider.name === "openai",
		),
	});

	for (const run of runs) {
		const failed = run.rows.filter((row) => !row.pass);
		if (failed.length > 0) {
			throw new Error(
				`${run.providerName} failed ${failed.length} fixture(s); see ${reportPath}`,
			);
		}
	}

	console.log("Gemma quality harness: PASS");
	console.log(`text_fixture_count=${checks.textFixtureCount}`);
	console.log(`vision_fixture_count=${checks.visionFixtureCount}`);
	console.log(`report=${path.relative(PROJECT_ROOT, reportPath)}`);
}

function parseArgs(argv: readonly string[]): ParsedArgs {
	const args = {
		writeFixtures: false,
		fakeLoopback: false,
		output: undefined as string | undefined,
	};

	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index];

		if (arg === "--write-fixtures") {
			args.writeFixtures = true;
			continue;
		}

		if (arg === "--fake-loopback") {
			args.fakeLoopback = true;
			continue;
		}

		if (arg === "--output") {
			const value = argv[index + 1];
			if (!value) {
				throw new Error("--output requires a path");
			}
			args.output = value;
			index += 1;
			continue;
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	return args;
}

async function writeDefaultFixtures(): Promise<void> {
	await mkdir(TEXT_FIXTURE_DIR, { recursive: true });
	await mkdir(VISION_IMAGE_DIR, { recursive: true });

	for (const fixture of TEXT_FIXTURES) {
		await writeFile(
			path.join(TEXT_FIXTURE_DIR, `${fixture.family}.json`),
			formatFixtureJson(fixture),
		);
	}

	const manifest: VisionManifest = {
		description:
			"Synthetic diagram fixtures for ADR-0005 D8. No real workplace photos, people, faces, locations, EXIF, GPS, or company data.",
		fixtures: VISION_FIXTURES,
	};
	await writeFile(
		path.join(VISION_FIXTURE_DIR, "manifest.json"),
		formatFixtureJson(manifest),
	);

	for (const writer of visionImageWriters()) {
		const pixels = new Uint8Array(writer.width * writer.height * 3);
		fillRect(
			pixels,
			0,
			0,
			writer.width,
			writer.height,
			writer.width,
			...RGB.bg,
		);
		writer.draw(pixels, writer.width, writer.height);
		const png = buildPng(writer.width, writer.height, pixels);
		await writeFile(path.join(VISION_IMAGE_DIR, writer.filename), png);
	}
}

function formatFixtureJson(value: unknown): string {
	return `${JSON.stringify(value, null, "\t").replace(
		/"requiredFields": \[\n\t{5}"([^"]+)"(?:,\n\t{5}"([^"]+)")?(?:,\n\t{5}"([^"]+)")?\n\t{4}\]/g,
		(_, first: string, second?: string, third?: string) => {
			const fields = [first, second, third]
				.filter((field): field is string => Boolean(field))
				.map((field) => `"${field}"`)
				.join(", ");
			return `"requiredFields": [${fields}]`;
		},
	)}\n`;
}

async function readTaxonomy(): Promise<TaxonomyFixture> {
	return parseJson<TaxonomyFixture>(
		TAXONOMY_EN_PATH,
		await readFile(TAXONOMY_EN_PATH, "utf8"),
	);
}

async function readTextFixtureFiles(): Promise<readonly TextFixtureFile[]> {
	const files = (await readdir(TEXT_FIXTURE_DIR))
		.filter((file) => file.endsWith(".json"))
		.sort();

	return Promise.all(
		files.map(async (file) => {
			const fixturePath = path.join(TEXT_FIXTURE_DIR, file);
			return parseJson<TextFixtureFile>(
				fixturePath,
				await readFile(fixturePath, "utf8"),
			);
		}),
	);
}

async function readVisionManifest(): Promise<VisionManifest> {
	const manifestPath = path.join(VISION_FIXTURE_DIR, "manifest.json");
	return parseJson<VisionManifest>(
		manifestPath,
		await readFile(manifestPath, "utf8"),
	);
}

function parseJson<T>(sourceName: string, rawJson: string): T {
	try {
		return JSON.parse(rawJson) as T;
	} catch (error) {
		throw new Error(
			`Failed to parse ${sourceName}: ${
				error instanceof Error ? error.message : String(error)
			}`,
			{ cause: error },
		);
	}
}

async function validateFixtureCorpus(
	textFixtures: readonly TextFixtureFile[],
	visionManifest: VisionManifest,
	taxonomy: TaxonomyFixture,
) {
	const families = new Set(textFixtures.map((fixture) => fixture.family));
	assert.deepEqual(
		[...families].sort(),
		[...TEXT_FAMILY_IDS].sort(),
		"text fixtures must cover all 8 task families",
	);

	let textFixtureCount = 0;
	for (const fixture of textFixtures) {
		assert.ok(TEXT_FAMILY_IDS.includes(fixture.family));
		assert.ok(
			fixture.fixtures.length >= 10 && fixture.fixtures.length <= 20,
			`${fixture.family} must contain 10-20 prompts`,
		);
		for (const item of fixture.fixtures) {
			assert.equal(item.expectedShape.mode, "json_schema");
			assert.ok(item.expectedShape.requiredFields.length > 0);
			assert.ok(item.prompt.trim().length > 0);
		}
		textFixtureCount += fixture.fixtures.length;
	}

	assert.ok(
		textFixtureCount >= 80 && textFixtureCount <= 160,
		`text fixture count must be 80-160; received ${textFixtureCount}`,
	);

	const categoryCodes = taxonomy.categories.map((category) => category.code);
	const covered = new Set(
		visionManifest.fixtures.map((fixture) => fixture.categoryCode),
	);
	assert.deepEqual(
		[...covered].sort(),
		[...categoryCodes].sort(),
		"vision manifest must cover every taxonomy category exactly once",
	);

	for (const fixture of visionManifest.fixtures) {
		assert.equal(fixture.mimeType, "image/png");
		assert.equal(fixture.expectedShape.mode, "json_schema");
		assert.ok(fixture.prompt.trim().length > 0);
		await assertPngHasNoMetadata(path.join(VISION_FIXTURE_DIR, fixture.file));
	}

	return {
		textFamilyCount: textFixtures.length,
		textFixtureCount,
		visionFixtureCount: visionManifest.fixtures.length,
		categoryCodes,
	};
}

async function buildProviders(args: ParsedArgs): Promise<{
	readonly providers: readonly {
		readonly name: string;
		readonly provider: LLMProvider;
	}[];
	readonly cleanup: () => Promise<void>;
}> {
	const [{ OpenAICompatibleProvider }, { OpenAIProvider }] = await Promise.all([
		importProvider<{
			OpenAICompatibleProvider: OpenAICompatibleProviderCtor;
		}>("src/lib/llm/openai-compatible.ts"),
		importProvider<{
			OpenAIProvider: OpenAIProviderCtor;
		}>("src/lib/llm/openai.ts"),
	]);

	const providers: { name: string; provider: LLMProvider }[] = [];
	const fakeServer = args.fakeLoopback
		? await FakeOpenAICompatibleServer.start()
		: null;

	const localBaseUrl = fakeServer?.baseUrl ?? process.env.LLM_BASE_URL;
	if (!localBaseUrl) {
		throw new Error(
			"LLM_BASE_URL is required unless --fake-loopback is supplied.",
		);
	}

	if (args.fakeLoopback) {
		assertLoopbackUrl(localBaseUrl);
	}

	providers.push({
		name: args.fakeLoopback ? "gemma-loopback" : "gemma-local",
		provider: new OpenAICompatibleProvider({
			baseUrl: localBaseUrl,
			apiKey: fakeServer ? LOOPBACK_API_KEY : process.env.LLM_API_KEY,
			textModel: process.env.LLM_TEXT_MODEL ?? DEFAULT_TEXT_MODEL,
			visionModel:
				process.env.LLM_VISION_MODEL ??
				process.env.LLM_TEXT_MODEL ??
				DEFAULT_VISION_MODEL,
		}),
	});

	if (process.env.OPENAI_API_KEY) {
		providers.push({
			name: "openai",
			provider: new OpenAIProvider({
				textModel: process.env.OPENAI_TEXT_MODEL ?? process.env.LLM_TEXT_MODEL,
				visionModel:
					process.env.OPENAI_VISION_MODEL ??
					process.env.LLM_VISION_MODEL ??
					process.env.LLM_TEXT_MODEL,
			}),
		});
	}

	return {
		providers,
		cleanup: async () => {
			await fakeServer?.close();
		},
	};
}

async function importProvider<T>(relativePath: string): Promise<T> {
	const moduleUrl = pathToFileURL(path.join(PROJECT_ROOT, relativePath)).href;
	return (await import(moduleUrl)) as T;
}

async function runProvider(
	providerName: string,
	provider: LLMProvider,
	textFixtures: readonly TextFixtureFile[],
	visionManifest: VisionManifest,
): Promise<ResultRow[]> {
	const rows: ResultRow[] = [];

	for (const family of textFixtures) {
		for (const fixture of family.fixtures) {
			rows.push(
				await evaluateTextFixture(
					providerName,
					provider,
					family.family,
					fixture,
				),
			);
		}
	}

	for (const fixture of visionManifest.fixtures) {
		rows.push(await evaluateVisionFixture(providerName, provider, fixture));
	}

	return rows;
}

async function evaluateTextFixture(
	providerName: string,
	provider: LLMProvider,
	family: TextFamilyId,
	fixture: TextFixture,
): Promise<ResultRow> {
	const request: LLMTextRequest = {
		prompt: fixture.prompt,
		options: {
			tenantId: "llm-eval-tenant",
			userId: "llm-eval-user",
			locale: "en",
			promptPurpose: `llm-eval.${family}.${fixture.id}`,
			kind: family === "cross_hira_suggestion" ? "generation" : "authoring",
			requiresVision: false,
		},
	};

	return evaluateResponse({
		fixtureType: "text",
		familyOrCategory: family,
		fixtureId: fixture.id,
		providerName,
		rubric: fixture.expectedShape,
		response: await provider.text(request),
	});
}

async function evaluateVisionFixture(
	providerName: string,
	provider: LLMProvider,
	fixture: VisionFixture,
): Promise<ResultRow> {
	const imagePath = path.join(VISION_FIXTURE_DIR, fixture.file);
	const request: LLMVisionRequest = {
		prompt: fixture.prompt,
		photos: [
			{
				mimeType: fixture.mimeType,
				data: await readFile(imagePath),
				filename: path.basename(imagePath),
			},
		],
		options: {
			tenantId: "llm-eval-tenant",
			userId: "llm-eval-user",
			workflowId: "llm-eval-workflow",
			locale: "en",
			promptPurpose: `llm-eval.vision.${fixture.categoryCode}`,
			kind: "authoring",
			requiresVision: true,
		},
	};

	return evaluateResponse({
		fixtureType: "vision",
		familyOrCategory: fixture.categoryCode,
		fixtureId: fixture.id,
		providerName,
		rubric: fixture.expectedShape,
		response: await provider.vision(request),
	});
}

function evaluateResponse(input: {
	readonly fixtureType: "text" | "vision";
	readonly familyOrCategory: string;
	readonly fixtureId: string;
	readonly providerName: string;
	readonly rubric: Rubric;
	readonly response: LLMResponse;
}): ResultRow {
	const errors: string[] = [];
	let parsed: unknown;

	try {
		parsed = JSON.parse(input.response.text);
	} catch (error) {
		errors.push(
			error instanceof Error
				? `response is not JSON: ${error.message}`
				: "response is not JSON",
		);
	}

	if (parsed && typeof parsed === "object") {
		for (const field of input.rubric.requiredFields) {
			if (!(field in parsed)) {
				errors.push(`missing field ${field}`);
			}
		}
	}

	return {
		fixtureType: input.fixtureType,
		familyOrCategory: input.familyOrCategory,
		fixtureId: input.fixtureId,
		pass: errors.length === 0,
		provider: input.response.provider ?? input.providerName,
		model: input.response.model ?? "unknown",
		responsePreview: truncate(input.response.text, 220),
		errors,
	};
}

async function writeReport(
	reportPath: string,
	input: {
		readonly args: ParsedArgs;
		readonly checks: Awaited<ReturnType<typeof validateFixtureCorpus>>;
		readonly providers: readonly ProviderRun[];
		readonly openAiSkipped: boolean;
	},
): Promise<void> {
	await mkdir(path.dirname(reportPath), { recursive: true });

	const lines: string[] = [
		`# Gemma Quality Evaluation Harness Evidence - ${TODAY}`,
		"",
		"Bead: `ssfw-x6m`",
		"",
		"Scope: ADR-0005 D8 manual quality measurement. This report was generated with a loopback fake server unless noted otherwise; it is evidence that the harness and fixture corpus execute without CI or real-photo use.",
		"",
		"## Invocation",
		"",
		"```text",
		`LLM_VALIDATION_OK=${process.env.LLM_VALIDATION_OK ?? ""}`,
		`fakeLoopback=${String(input.args.fakeLoopback)}`,
		`writeFixtures=${String(input.args.writeFixtures)}`,
		"```",
		"",
		"## Fixture Checks",
		"",
		`- Text families: ${input.checks.textFamilyCount}`,
		`- Text fixtures: ${input.checks.textFixtureCount}`,
		`- Vision fixtures: ${input.checks.visionFixtureCount}`,
		`- Vision category coverage: ${input.checks.categoryCodes.join(", ")}`,
		"- PNG metadata check: passed for all vision fixtures (no eXIf / tEXt / iTXt / zTXt / GPS markers).",
		"",
		"## Provider Summary",
		"",
	];

	for (const run of input.providers) {
		const failed = run.rows.filter((row) => !row.pass);
		lines.push(
			`### ${run.providerName}`,
			"",
			`- Fixtures executed: ${run.rows.length}`,
			`- Passed: ${run.rows.length - failed.length}`,
			`- Failed: ${failed.length}`,
			"",
			"| Area | Total | Passed | Failed |",
			"|---|---:|---:|---:|",
		);

		for (const summary of summarizeRows(run.rows)) {
			lines.push(
				`| ${summary.area} | ${summary.total} | ${summary.passed} | ${summary.failed} |`,
			);
		}

		lines.push(
			"",
			"#### Sample Rows",
			"",
			"| Fixture | Pass | Model | Preview |",
		);
		lines.push("|---|---|---|---|");

		for (const row of sampleRows(run.rows)) {
			lines.push(
				`| ${row.fixtureType}:${row.familyOrCategory}:${row.fixtureId} | ${row.pass ? "yes" : "no"} | ${escapePipe(row.model)} | ${escapePipe(row.responsePreview)} |`,
			);
		}

		if (failed.length > 0) {
			lines.push("", "#### Failures", "", "| Fixture | Errors |");
			lines.push("|---|---|");
			for (const row of failed) {
				lines.push(
					`| ${row.fixtureType}:${row.familyOrCategory}:${row.fixtureId} | ${escapePipe(row.errors.join("; "))} |`,
				);
			}
		}

		lines.push("");
	}

	if (input.openAiSkipped) {
		lines.push(
			"## OpenAI Comparison",
			"",
			"`OPENAI_API_KEY` was not set, so the OpenAI comparison leg was skipped. When the key is present, the same fixtures run against OpenAI and appear in this side-by-side report.",
			"",
		);
	}

	lines.push(
		"## Reviewer Sign-Off",
		"",
		"- [ ] Reviewer inspected failed rows and sample outputs.",
		"- [ ] Reviewer confirms fixtures contain no real workplace photos, people, company data, or incident facts.",
		"- [ ] Reviewer records whether Gemma quality is acceptable for the next release decision.",
	);

	await writeFile(reportPath, `${lines.join("\n")}\n`);
}

function summarizeRows(rows: readonly ResultRow[]) {
	const summaries = new Map<
		string,
		{ total: number; passed: number; failed: number }
	>();

	for (const row of rows) {
		const current = summaries.get(row.familyOrCategory) ?? {
			total: 0,
			passed: 0,
			failed: 0,
		};
		current.total += 1;
		if (row.pass) {
			current.passed += 1;
		} else {
			current.failed += 1;
		}
		summaries.set(row.familyOrCategory, current);
	}

	return [...summaries.entries()].map(([area, summary]) => ({
		area,
		...summary,
	}));
}

function sampleRows(rows: readonly ResultRow[]): readonly ResultRow[] {
	const samples: ResultRow[] = [];
	const seen = new Set<string>();

	for (const row of rows) {
		if (seen.has(row.familyOrCategory)) {
			continue;
		}
		seen.add(row.familyOrCategory);
		samples.push(row);
	}

	return samples.slice(0, 12);
}

class FakeOpenAICompatibleServer {
	readonly requests: unknown[] = [];
	private readonly server: Server;

	private constructor() {
		this.server = createServer((req, res) => void this.handle(req, res));
	}

	static async start(): Promise<FakeOpenAICompatibleServer> {
		const fake = new FakeOpenAICompatibleServer();
		await new Promise<void>((resolve, reject) => {
			fake.server.once("error", reject);
			fake.server.listen(0, "127.0.0.1", () => {
				fake.server.off("error", reject);
				resolve();
			});
		});
		return fake;
	}

	get baseUrl(): string {
		const address = this.server.address() as AddressInfo | null;
		assert.ok(address);
		return `http://127.0.0.1:${address.port}/v1`;
	}

	async close(): Promise<void> {
		await new Promise<void>((resolve, reject) => {
			this.server.close((error) => {
				if (error) {
					reject(error);
					return;
				}
				resolve();
			});
		});
	}

	private async handle(
		req: IncomingMessage,
		res: ServerResponse,
	): Promise<void> {
		const rawBody = await readRequestBody(req);
		const body = rawBody.length
			? parseJson<unknown>("loopback request", rawBody)
			: {};
		this.requests.push(body);

		if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
			writeJson(res, 404, { error: "unexpected route" });
			return;
		}

		const purpose = promptPurposeFromBody(body);
		const requestModel =
			body && typeof body === "object" && "model" in body
				? body.model
				: undefined;
		writeJson(res, 200, {
			model: typeof requestModel === "string" ? requestModel : "loopback",
			choices: [
				{
					message: {
						content: JSON.stringify(cannedResponseForPurpose(purpose)),
					},
				},
			],
			usage: { prompt_tokens: 17, completion_tokens: 9 },
		});
	}
}

function promptPurposeFromBody(body: unknown): string {
	if (!body || typeof body !== "object") {
		return "unknown";
	}
	const messages = "messages" in body ? body.messages : undefined;
	if (!Array.isArray(messages)) {
		return "unknown";
	}
	const first = messages[0];
	const content =
		first && typeof first === "object" && "content" in first
			? first.content
			: undefined;
	if (typeof content !== "string") {
		return "unknown";
	}
	const match = content.match(/Prompt purpose: ([^. ]+\.[^. ]+\.[^. ]+)/);
	return match?.[1] ?? "unknown";
}

function cannedResponseForPurpose(purpose: string): Record<string, unknown> {
	if (purpose.includes(".step_extraction.")) {
		return {
			steps: [{ activity: "inspect area", equipment: [], substances: [] }],
		};
	}
	if (purpose.includes(".hazard_extraction.")) {
		return {
			hazards: [{ label: "pinch point", categoryCode: "MECHANICAL" }],
		};
	}
	if (purpose.includes(".suva_category_proposal.")) {
		return {
			categoryCode: "MECHANICAL",
			rationale: "moving parts are present",
		};
	}
	if (purpose.includes(".severity_likelihood_suggestion.")) {
		return {
			severity: "C",
			likelihood: "2",
			rationale: "credible lost-time case",
		};
	}
	if (purpose.includes(".action_rewording.")) {
		return {
			rewrittenAction: "Install a guard and verify use.",
			ownerHint: "team lead",
		};
	}
	if (purpose.includes(".stop_control_proposal.")) {
		return {
			controls: [
				{ hierarchy: "TECHNICAL", description: "guard the moving part" },
			],
		};
	}
	if (purpose.includes(".ii_5whys_turn.")) {
		return {
			nextQuestion: "Why was the guard open?",
			causeNodeDraft: "guard bypassed",
		};
	}
	if (purpose.includes(".cross_hira_suggestion.")) {
		return {
			suggestions: [
				{ sourceSummary: "similar step", copiedDraft: "add verified guard" },
			],
		};
	}
	if (purpose.includes(".vision.")) {
		const categoryCode = purpose.split(".").at(-1) ?? "MECHANICAL";
		return {
			hazards: [{ label: "synthetic visual cue" }],
			categoryCode,
			confidence: "low",
			reviewNote: "Synthetic fixture only; human review required.",
		};
	}
	return { ok: true };
}

function buildTextPrompt(family: TextFamilyId, scenario: string): string {
	const prefix = `Scenario: ${scenario}.`;
	const instruction: Record<TextFamilyId, string> = {
		step_extraction:
			"Extract 3-6 HIRA process steps with activity, equipment, and substances arrays.",
		hazard_extraction:
			"Extract hazards for the relevant step, including categoryCode and existingControls.",
		suva_category_proposal:
			"Propose the best single SUVA hazard category code and a short rationale.",
		severity_likelihood_suggestion:
			"Suggest severity A-E and likelihood 1-5 using the 1000-people task estimate framing.",
		action_rewording:
			"Reword the corrective action so it is concrete, owned, and non-blaming.",
		stop_control_proposal:
			"Propose S-T-O-P controls, preferring substitution or technical measures before PPE.",
		ii_5whys_turn:
			"Ask the next 5-Whys follow-up and draft a cause-node summary.",
		cross_hira_suggestion:
			"Suggest similar prior HIRA controls as copied draft text, not shared links.",
	};

	return `${prefix} ${instruction[family]} Return JSON only.`;
}

function textRubric(family: TextFamilyId): Rubric {
	const requiredFields: Record<TextFamilyId, readonly string[]> = {
		step_extraction: ["steps"],
		hazard_extraction: ["hazards"],
		suva_category_proposal: ["categoryCode", "rationale"],
		severity_likelihood_suggestion: ["severity", "likelihood", "rationale"],
		action_rewording: ["rewrittenAction", "ownerHint"],
		stop_control_proposal: ["controls"],
		ii_5whys_turn: ["nextQuestion", "causeNodeDraft"],
		cross_hira_suggestion: ["suggestions"],
	};

	return {
		mode: "json_schema",
		requiredFields: requiredFields[family],
		humanReviewNote:
			"Reviewer checks usefulness, safety-domain fit, and whether the output avoids inventing facts.",
	};
}

function textFamilyDescription(family: TextFamilyId): string {
	const descriptions: Record<TextFamilyId, string> = {
		step_extraction:
			"Extract process steps from a short operational narrative.",
		hazard_extraction:
			"Extract hazards and existing controls from step context.",
		suva_category_proposal: "Propose a canonical SUVA hazard category code.",
		severity_likelihood_suggestion:
			"Suggest A-E severity and 1-5 likelihood anchors.",
		action_rewording:
			"Rewrite corrective actions into concrete, non-blaming actions.",
		stop_control_proposal:
			"Propose controls classified by the S-T-O-P hierarchy.",
		ii_5whys_turn: "Drive one incident-investigation 5-Whys follow-up turn.",
		cross_hira_suggestion:
			"Surface similar HIRA content as copy-not-link suggestions.",
	};
	return descriptions[family];
}

async function assertPngHasNoMetadata(filePath: string): Promise<void> {
	const fileStat = await stat(filePath);
	assert.ok(fileStat.size > 0, `${filePath} must be non-empty`);

	const buffer = await readFile(filePath);
	const signature = Buffer.from([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
	]);
	assert.deepEqual(buffer.subarray(0, 8), signature, `${filePath} is not PNG`);

	for (const marker of ["eXIf", "tEXt", "iTXt", "zTXt", "GPS"]) {
		assert.equal(
			buffer.includes(Buffer.from(marker)),
			false,
			`${filePath} must not contain ${marker}`,
		);
	}
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks).toString("utf8");
}

function writeJson(
	res: ServerResponse,
	statusCode: number,
	body: unknown,
): void {
	res.writeHead(statusCode, { "content-type": "application/json" });
	res.end(JSON.stringify(body));
}

function assertLoopbackUrl(baseUrl: string): void {
	if (!LOOPBACK_PATTERN.test(baseUrl)) {
		throw new Error(
			`loopback guardrail violated: expected ${String(LOOPBACK_PATTERN)}, received ${baseUrl}`,
		);
	}
}

function truncate(value: string, maxLength: number): string {
	return value.length <= maxLength
		? value
		: `${value.slice(0, maxLength - 3)}...`;
}

function escapePipe(value: string): string {
	return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

// PNG generation utilities. These intentionally write only IHDR, IDAT, IEND.
const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, i) => {
	let c = i;
	for (let bit = 0; bit < 8; bit += 1) {
		c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	}
	return c >>> 0;
});

type Rgb = readonly [number, number, number];

const RGB = {
	bg: [232, 232, 236],
	blue: [74, 108, 247],
	orange: [245, 158, 11],
	red: [239, 68, 68],
	green: [34, 197, 94],
	purple: [168, 85, 247],
	dark: [51, 65, 85],
	white: [248, 250, 252],
} as const;

function crc32(data: Uint8Array): number {
	let crc = 0xffffffff;
	for (const byte of data) {
		crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function writeU32(buf: Uint8Array, offset: number, value: number): void {
	buf[offset] = (value >>> 24) & 0xff;
	buf[offset + 1] = (value >>> 16) & 0xff;
	buf[offset + 2] = (value >>> 8) & 0xff;
	buf[offset + 3] = value & 0xff;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
	const typeBytes = new TextEncoder().encode(type);
	const chunk = new Uint8Array(4 + 4 + data.length + 4);
	writeU32(chunk, 0, data.length);
	chunk.set(typeBytes, 4);
	chunk.set(data, 8);
	writeU32(chunk, 8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
	return chunk;
}

function buildPng(
	width: number,
	height: number,
	pixels: Uint8Array,
): Uint8Array {
	const raw = new Uint8Array(height * (1 + width * 3));
	for (let y = 0; y < height; y += 1) {
		raw[y * (width * 3 + 1)] = 0;
		raw.set(
			pixels.subarray(y * width * 3, (y + 1) * width * 3),
			y * (width * 3 + 1) + 1,
		);
	}

	const ihdr = Uint8Array.from({ length: 13 }, () => 0);
	writeU32(ihdr, 0, width);
	writeU32(ihdr, 4, height);
	ihdr[8] = 8;
	ihdr[9] = 2;

	const chunks = [
		Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		pngChunk("IHDR", ihdr),
		pngChunk("IDAT", deflateSync(raw, { level: 6 })),
		pngChunk("IEND", Uint8Array.of()),
	];
	const output = new Uint8Array(
		chunks.reduce((sum, chunk) => sum + chunk.length, 0),
	);
	let offset = 0;
	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.length;
	}
	return output;
}

function setPixel(
	buf: Uint8Array,
	x: number,
	y: number,
	width: number,
	height: number,
	r: number,
	g: number,
	b: number,
): void {
	if (x < 0 || y < 0 || x >= width || y >= height) {
		return;
	}
	const index = (y * width + x) * 3;
	buf[index] = r;
	buf[index + 1] = g;
	buf[index + 2] = b;
}

function fillRect(
	buf: Uint8Array,
	x0: number,
	y0: number,
	width: number,
	height: number,
	canvasWidth: number,
	r: number,
	g: number,
	b: number,
): void {
	const canvasHeight = Math.floor(buf.length / 3 / canvasWidth);
	for (
		let y = Math.max(0, y0);
		y < Math.min(canvasHeight, y0 + height);
		y += 1
	) {
		for (
			let x = Math.max(0, x0);
			x < Math.min(canvasWidth, x0 + width);
			x += 1
		) {
			setPixel(buf, x, y, canvasWidth, canvasHeight, r, g, b);
		}
	}
}

function fillCircle(
	buf: Uint8Array,
	cx: number,
	cy: number,
	radius: number,
	canvasWidth: number,
	r: number,
	g: number,
	b: number,
): void {
	const canvasHeight = Math.floor(buf.length / 3 / canvasWidth);
	for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
		for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
			if ((x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2) {
				setPixel(buf, x, y, canvasWidth, canvasHeight, r, g, b);
			}
		}
	}
}

function drawLine(
	buf: Uint8Array,
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	width: number,
	r: number,
	g: number,
	b: number,
): void {
	const height = Math.floor(buf.length / 3 / width);
	const dx = Math.abs(x1 - x0);
	const dy = Math.abs(y1 - y0);
	const sx = x0 < x1 ? 1 : -1;
	const sy = y0 < y1 ? 1 : -1;
	let error = dx - dy;
	let x = x0;
	let y = y0;

	while (true) {
		setPixel(buf, x, y, width, height, r, g, b);
		if (x === x1 && y === y1) {
			return;
		}
		const error2 = 2 * error;
		if (error2 > -dy) {
			error -= dy;
			x += sx;
		}
		if (error2 < dx) {
			error += dx;
			y += sy;
		}
	}
}

function fillTriangle(
	buf: Uint8Array,
	points: readonly [number, number][],
	width: number,
	r: number,
	g: number,
	b: number,
): void {
	const height = Math.floor(buf.length / 3 / width);
	const [a, c, d] = points;
	const minX = Math.max(0, Math.floor(Math.min(a[0], c[0], d[0])));
	const maxX = Math.min(width - 1, Math.ceil(Math.max(a[0], c[0], d[0])));
	const minY = Math.max(0, Math.floor(Math.min(a[1], c[1], d[1])));
	const maxY = Math.min(height - 1, Math.ceil(Math.max(a[1], c[1], d[1])));
	const area = edge(a, c, d);

	for (let y = minY; y <= maxY; y += 1) {
		for (let x = minX; x <= maxX; x += 1) {
			const p: [number, number] = [x, y];
			const w0 = edge(c, d, p);
			const w1 = edge(d, a, p);
			const w2 = edge(a, c, p);
			if (
				(area >= 0 && w0 >= 0 && w1 >= 0 && w2 >= 0) ||
				(area < 0 && w0 <= 0 && w1 <= 0 && w2 <= 0)
			) {
				setPixel(buf, x, y, width, height, r, g, b);
			}
		}
	}
}

function edge(
	a: readonly [number, number],
	b: readonly [number, number],
	c: readonly [number, number],
): number {
	return (c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0]);
}

function visionImageWriters(): readonly FixtureWriter[] {
	const size = 256;
	return VISION_FIXTURES.map((fixture, index) => ({
		filename: path.basename(fixture.file),
		width: size,
		height: size,
		draw: (pixels, width, height) =>
			drawCategoryDiagram(pixels, width, height, fixture.categoryCode, index),
	}));
}

function drawCategoryDiagram(
	pixels: Uint8Array,
	width: number,
	height: number,
	categoryCode: string,
	index: number,
): void {
	fillRect(pixels, 0, 0, width, height, width, ...RGB.bg);
	fillRect(pixels, 0, height - 18, width, 18, width, ...RGB.dark);
	const cx = width / 2;
	const cy = height / 2;

	switch (categoryCode) {
		case "MECHANICAL":
			fillCircle(pixels, cx, cy, 34, width, ...RGB.blue);
			for (let i = 0; i < 8; i += 1) {
				fillCircle(
					pixels,
					cx + Math.cos((Math.PI * 2 * i) / 8) * 55,
					cy + Math.sin((Math.PI * 2 * i) / 8) * 55,
					10,
					width,
					...RGB.dark,
				);
			}
			return;
		case "FALLS":
			for (let i = 0; i < 6; i += 1) {
				fillRect(pixels, 55 + i * 25, 55 + i * 22, 25, 22, width, ...RGB.red);
			}
			drawLine(pixels, 130, 35, 130, 185, width, ...RGB.dark);
			return;
		case "ELECTRICAL":
			fillTriangle(
				pixels,
				[
					[128, 35],
					[55, 185],
					[200, 185],
				],
				width,
				...RGB.red,
			);
			drawLine(pixels, 140, 68, 112, 123, width, ...RGB.orange);
			drawLine(pixels, 112, 123, 145, 123, width, ...RGB.orange);
			drawLine(pixels, 145, 123, 112, 180, width, ...RGB.orange);
			return;
		case "HAZARDOUS_SUBSTANCES":
			fillRect(pixels, 92, 45, 72, 20, width, ...RGB.dark);
			fillRect(pixels, 105, 65, 46, 86, width, ...RGB.green);
			fillCircle(pixels, 110, 170, 18, width, ...RGB.purple);
			fillCircle(pixels, 153, 180, 14, width, ...RGB.orange);
			return;
		case "FIRE_EXPLOSION":
			fillCircle(pixels, 128, 150, 58, width, ...RGB.orange);
			fillTriangle(
				pixels,
				[
					[128, 40],
					[86, 170],
					[170, 170],
				],
				width,
				...RGB.red,
			);
			fillCircle(pixels, 128, 148, 24, width, ...RGB.white);
			return;
		case "THERMAL":
			fillRect(pixels, 0, 0, width / 2, height, width, ...RGB.orange);
			fillRect(pixels, width / 2, 0, width / 2, height, width, ...RGB.blue);
			fillCircle(pixels, 128, 128, 42, width, ...RGB.white);
			return;
		case "PHYSICAL_AGENTS":
			for (let radius = 25; radius <= 85; radius += 20) {
				drawCircleOutline(pixels, cx, cy, radius, width, ...RGB.purple);
			}
			drawLine(pixels, 40, 210, 216, 45, width, ...RGB.dark);
			return;
		case "ENVIRONMENTAL":
			fillCircle(pixels, 72, 72, 34, width, ...RGB.orange);
			fillCircle(pixels, 145, 145, 38, width, ...RGB.blue);
			fillCircle(pixels, 176, 145, 32, width, ...RGB.blue);
			drawLine(pixels, 40, 205, 216, 205, width, ...RGB.green);
			return;
		case "MUSCULOSKELETAL":
			fillCircle(pixels, 92, 72, 18, width, ...RGB.dark);
			drawLine(pixels, 92, 90, 112, 145, width, ...RGB.dark);
			drawLine(pixels, 112, 145, 78, 190, width, ...RGB.dark);
			fillRect(pixels, 135, 120, 58, 48, width, ...RGB.orange);
			return;
		case "PSYCHOSOCIAL":
			for (let i = 0; i < 7; i += 1) {
				const color: Rgb = i % 2 === 0 ? RGB.purple : RGB.blue;
				fillCircle(
					pixels,
					75 + (i % 3) * 50,
					75 + Math.floor(i / 3) * 48,
					20,
					width,
					...color,
				);
			}
			drawLine(pixels, 45, 195, 210, 195, width, ...RGB.red);
			return;
		case "UNEXPECTED_ACTIONS":
			drawCircleOutline(pixels, cx, cy, 62, width, ...RGB.dark);
			drawLine(pixels, 82, 82, 174, 174, width, ...RGB.red);
			drawLine(pixels, 174, 82, 82, 174, width, ...RGB.red);
			fillRect(pixels, 112, 50, 32, 70, width, ...RGB.orange);
			return;
		case "WORK_ORGANISATION":
			for (let row = 0; row < 3; row += 1) {
				for (let col = 0; col < 3; col += 1) {
					const color: Rgb = row === col ? RGB.green : RGB.blue;
					fillRect(
						pixels,
						62 + col * 48,
						62 + row * 42,
						34,
						28,
						width,
						...color,
					);
				}
			}
			drawLine(pixels, 80, 200, 176, 200, width, ...RGB.dark);
			return;
		default:
			fillCircle(pixels, cx, cy, 40 + index, width, ...RGB.blue);
	}
}

function drawCircleOutline(
	buf: Uint8Array,
	cx: number,
	cy: number,
	radius: number,
	width: number,
	r: number,
	g: number,
	b: number,
): void {
	for (let angle = 0; angle < Math.PI * 2; angle += 0.01) {
		setPixel(
			buf,
			Math.round(cx + Math.cos(angle) * radius),
			Math.round(cy + Math.sin(angle) * radius),
			width,
			Math.floor(buf.length / 3 / width),
			r,
			g,
			b,
		);
	}
}

try {
	await main();
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
}
