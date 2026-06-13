import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import type {
	DispatchProviderSettings,
	DispatchStore,
} from "../../../src/lib/llm/dispatch";
import type { WorkflowVisionConsent } from "../../../src/lib/llm/consent";
import type {
	LLMProvider,
	LLMResponse,
	LLMTextRequest,
	LLMVisionRequest,
} from "../../../src/lib/llm/types";
import type {
	LLMDebugContentLogRecord,
	LLMLogSink,
	LLMMetadataLogRecord,
} from "../../../src/lib/llm/logging";

registerHooks({
	resolve(specifier, context, nextResolve) {
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
		if (!url.startsWith("file:") || !/\.[cm]?tsx?$/.test(url)) {
			return nextLoad(url, context);
		}

		const source = readFileSync(fileURLToPath(url), "utf8");
		const transpiled = ts.transpileModule(source, {
			compilerOptions: {
				jsx: ts.JsxEmit.ReactJSX,
				module: ts.ModuleKind.ESNext,
				moduleResolution: ts.ModuleResolutionKind.Bundler,
				target: ts.ScriptTarget.ES2022,
			},
			fileName: fileURLToPath(url),
		});

		return {
			format: "module",
			shortCircuit: true,
			source: transpiled.outputText,
		};
	},
});

const dispatchModule = (await import(
	"../../../src/lib/llm/dispatch"
)) as typeof import("../../../src/lib/llm/dispatch");
const loggingModule = (await import(
	"../../../src/lib/llm/logging"
)) as typeof import("../../../src/lib/llm/logging");
const proxyModule = (await import(
	pathToFileURL(path.resolve("src/proxy.ts")).href
)) as typeof import("../../../src/proxy");
const adminPageModule = (await import(
	"../../../src/app/workspace/settings/debug-log/page"
)) as typeof import("../../../src/app/workspace/settings/debug-log/page");
const legalPageModule = (await import(
	"../../../src/app/legal/llm-logging/page"
)) as typeof import("../../../src/app/legal/llm-logging/page");

const { dispatch } = dispatchModule;
const {
	LLM_DEBUG_LOG_ENV,
	LLM_DEBUG_LOG_STREAM,
	LLM_LOGGING_ADMIN_COPY,
	LLM_LOGGING_LEGAL_COPY,
	LLM_METADATA_LOG_STREAM,
	isLLMDebugLoggingEnabled,
} = loggingModule;
const { isPublicPath } = proxyModule;
const AdminPage = adminPageModule.default;
const LegalPage = legalPageModule.default;

const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const workflowId = "33333333-3333-4333-8333-333333333333";
const promptBody = "q4p prompt body must stay out of metadata logs";
const responseBody = "q4p response body must stay out of metadata logs";
const photoBytes = Buffer.from("q4p-photo-bytes-must-not-log");
const photoUrl = "https://storage.example.test/q4p-photo-url";
const photoHash = createHash("sha256").update(photoBytes).digest("hex");
const byokPlaintextKey = "sk-q4p-plaintext-never-log";
const originalDebugFlag = process.env.LLM_DEBUG_LOG;

test.afterEach(() => {
	setOptionalEnv(LLM_DEBUG_LOG_ENV, originalDebugFlag);
});

test("default dispatch logs metadata fields only and excludes LLM content", async () => {
	const sink = new CaptureLogSink();
	const provider = new RecordingProvider({
		visionResponse: {
			text: responseBody,
			model: "mock-vision-q4p",
			provider: "mock",
			usage: { inputTokens: 7, outputTokens: 11 },
		},
	});

	const result = await dispatch(visionRequest(), {
		env: { NODE_ENV: "test" },
		logSink: sink.sink,
		mockProvider: provider,
		now: () => new Date("2026-05-05T08:30:00.000Z"),
		recordVisionCall: () => undefined,
		store: new MemoryDispatchStore({ visionEnabled: true, visionConsent: "ALWAYS" }),
	});

	assert.equal(result.ok, true);
	assert.equal(sink.debug.length, 0);
	assert.equal(sink.metadata.length, 1);
	assert.deepEqual(Object.keys(sink.metadata[0]).sort(), [
		"cost_usd",
		"error_code",
		"http_status",
		"kind",
		"latency_ms",
		"model",
		"prompt_purpose",
		"provider",
		"stream",
		"tenant_id",
		"timestamp",
		"token_input",
		"token_output",
		"user_id",
	]);
	assert.deepEqual(
		{
			cost_usd: sink.metadata[0].cost_usd,
			error_code: sink.metadata[0].error_code,
			http_status: sink.metadata[0].http_status,
			kind: sink.metadata[0].kind,
			model: sink.metadata[0].model,
			prompt_purpose: sink.metadata[0].prompt_purpose,
			provider: sink.metadata[0].provider,
			stream: sink.metadata[0].stream,
			tenant_id: sink.metadata[0].tenant_id,
			timestamp: sink.metadata[0].timestamp,
			token_input: sink.metadata[0].token_input,
			token_output: sink.metadata[0].token_output,
			user_id: sink.metadata[0].user_id,
		},
		{
			cost_usd: null,
			error_code: null,
			http_status: null,
			kind: "generation",
			model: "mock-vision-q4p",
			prompt_purpose: "q4p.logging.vision",
			provider: "mock",
			stream: LLM_METADATA_LOG_STREAM,
			tenant_id: tenantId,
			timestamp: "2026-05-05T08:30:00.000Z",
			token_input: 7,
			token_output: 11,
			user_id: userId,
		},
	);
	assert.equal(sink.metadata[0].latency_ms >= 0, true);
	assertNoSecret(JSON.stringify(sink.metadata), [
		promptBody,
		responseBody,
		photoBytes.toString("utf8"),
		photoUrl,
		photoHash,
		byokPlaintextKey,
	]);
	console.log(`LLM metadata log evidence: ${JSON.stringify(sink.metadata[0])}`);
});

test("LLM_DEBUG_LOG enables a separate debug stream and admin indicator", async () => {
	const sink = new CaptureLogSink();
	const provider = new RecordingProvider({
		textResponse: {
			text: responseBody,
			model: "mock-text-q4p",
			provider: "mock",
			usage: { inputTokens: 3, outputTokens: 5 },
		},
	});

	const result = await dispatch(textRequest(), {
		env: { NODE_ENV: "test", LLM_DEBUG_LOG: "1" },
		logSink: sink.sink,
		mockProvider: provider,
		now: () => new Date("2026-05-05T08:31:00.000Z"),
		store: new MemoryDispatchStore(),
	});

	assert.equal(result.ok, true);
	assert.equal(sink.metadata.length, 1);
	assert.equal(sink.debug.length, 1);
	assert.equal(sink.debug[0].stream, LLM_DEBUG_LOG_STREAM);
	assert.equal(sink.debug[0].prompt_body, promptBody);
	assert.equal(sink.debug[0].response_body, responseBody);
	assertNoSecret(JSON.stringify(sink.metadata), [promptBody, responseBody]);
	assertNoSecret(JSON.stringify(sink.debug), [
		photoBytes.toString("utf8"),
		photoUrl,
		photoHash,
		byokPlaintextKey,
	]);

	setOptionalEnv(LLM_DEBUG_LOG_ENV, "1");
	const html = renderToStaticMarkup(createElement(AdminPage));
	assert.match(html, new RegExp(escapeRegExp(LLM_LOGGING_ADMIN_COPY.statusOn)));
	assert.match(html, /data-debug-llm-logging="on"/);
	assert.equal(isLLMDebugLoggingEnabled(), true);
	console.log(`LLM debug log evidence: ${JSON.stringify(sink.debug[0])}`);
});

test("BYOK plaintext keys are absent from metadata and debug logs", async () => {
	const sink = new CaptureLogSink();
	const provider = new RecordingProvider({
		textResponse: {
			text: "q4p byok response",
			model: "byok-q4p",
			provider: "compatible:byok.example.test",
			usage: { inputTokens: 13, outputTokens: 17 },
		},
	});

	const result = await dispatch(textRequest("q4p byok prompt"), {
		createByokProvider: async () => provider,
		env: {
			NODE_ENV: "development",
			LLM_DEBUG_LOG: "1",
			LLM_API_KEY: byokPlaintextKey,
		},
		logSink: sink.sink,
		masterKey: Buffer.from(byokPlaintextKey),
		now: () => new Date("2026-05-05T08:32:00.000Z"),
		store: new MemoryDispatchStore({
			providerSettings: {
				hasByokProviderConfig: true,
				localOverrideConfig: null,
			},
		}),
	});

	assert.equal(result.ok, true);
	assert.equal(result.ok ? result.providerStep : "", "byok");
	assert.equal(sink.metadata.length, 1);
	assert.equal(sink.debug.length, 1);
	assertNoSecret(JSON.stringify([...sink.metadata, ...sink.debug]), [
		byokPlaintextKey,
	]);
});

test("admin and legal pages render the D10 posture text", () => {
	setOptionalEnv(LLM_DEBUG_LOG_ENV, undefined);
	const adminHtml = renderToStaticMarkup(createElement(AdminPage));
	const legalHtml = renderToStaticMarkup(createElement(LegalPage));

	assert.match(
		adminHtml,
		new RegExp(escapeRegExp(LLM_LOGGING_ADMIN_COPY.statusOff)),
	);
	assert.match(adminHtml, /data-debug-llm-logging="off"/);
	assert.match(legalHtml, new RegExp(escapeRegExp(LLM_LOGGING_LEGAL_COPY.title)));
	assert.match(legalHtml, /LLM_DEBUG_LOG=1/);
	assert.match(legalHtml, /BYOK plaintext keys are never logged/);
	assert.equal(isPublicPath("/legal/llm-logging"), true);
});

class CaptureLogSink {
	readonly metadata: LLMMetadataLogRecord[] = [];
	readonly debug: LLMDebugContentLogRecord[] = [];
	readonly sink: LLMLogSink = {
		debug: (record) => {
			this.debug.push(record);
		},
		metadata: (record) => {
			this.metadata.push(record);
		},
	};
}

class MemoryDispatchStore implements DispatchStore {
	private readonly visionEnabled: boolean;
	private readonly visionConsent: WorkflowVisionConsent;
	private readonly providerSettings: DispatchProviderSettings | null;

	constructor(
		options: {
			visionEnabled?: boolean;
			visionConsent?: WorkflowVisionConsent;
			providerSettings?: DispatchProviderSettings | null;
		} = {},
	) {
		this.visionEnabled = options.visionEnabled ?? false;
		this.visionConsent = options.visionConsent ?? "ASK";
		this.providerSettings = options.providerSettings ?? {
			hasByokProviderConfig: false,
			localOverrideConfig: null,
		};
	}

	async readCompanyVisionEnabled(): Promise<boolean> {
		return this.visionEnabled;
	}

	async readWorkflowVisionConsent(): Promise<WorkflowVisionConsent> {
		return this.visionConsent;
	}

	async readProviderSettings(): Promise<DispatchProviderSettings | null> {
		return this.providerSettings;
	}
}

class RecordingProvider implements LLMProvider {
	private readonly textResponse: LLMResponse;
	private readonly visionResponse: LLMResponse;

	constructor(
		input: {
			textResponse?: LLMResponse;
			visionResponse?: LLMResponse;
		} = {},
	) {
		this.textResponse = input.textResponse ?? {
			text: responseBody,
			model: "mock-text-q4p",
			provider: "mock",
		};
		this.visionResponse = input.visionResponse ?? {
			text: responseBody,
			model: "mock-vision-q4p",
			provider: "mock",
		};
	}

	async text(): Promise<LLMResponse> {
		return this.textResponse;
	}

	async vision(): Promise<LLMResponse> {
		return this.visionResponse;
	}
}

function textRequest(prompt = promptBody): LLMTextRequest {
	return {
		prompt,
		options: {
			tenantId,
			userId,
			locale: "en",
			promptPurpose: "q4p.logging.text",
			kind: "authoring",
			requiresVision: false,
		},
	};
}

function visionRequest(): LLMVisionRequest {
	return {
		prompt: promptBody,
		photos: [
			{
				mimeType: "image/png",
				data: photoBytes,
				filename: photoUrl,
			},
		],
		options: {
			tenantId,
			userId,
			workflowId,
			locale: "en",
			promptPurpose: "q4p.logging.vision",
			kind: "generation",
			requiresVision: true,
		},
	};
}

function assertNoSecret(haystack: string, secrets: readonly string[]): void {
	for (const secret of secrets) {
		assert.equal(
			haystack.includes(secret),
			false,
			`log output must not contain ${secret}`,
		);
	}
}

function setOptionalEnv(name: string, value: string | undefined): void {
	if (value === undefined) {
		delete process.env[name];
		return;
	}

	process.env[name] = value;
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith(".") || specifier.startsWith("/");
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
