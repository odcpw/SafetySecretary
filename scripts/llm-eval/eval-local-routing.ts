import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
	createServer,
	type IncomingMessage,
	type Server,
	type ServerResponse,
} from "node:http";
import { registerHooks } from "node:module";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { VisionCallAuditInput } from "../../src/lib/llm/audit";
import type { WorkflowVisionConsent } from "../../src/lib/llm/consent";
import type {
	DispatchProviderSettings,
	DispatchStore,
} from "../../src/lib/llm/dispatch";
import type { LLMVisionRequest } from "../../src/lib/llm/types";

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

const dispatchModulePath = pathToFileURL(
	path.resolve("src/lib/llm/dispatch.ts"),
).href;

const LOOPBACK_BASE_URL_PATTERN =
	/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/;
const GATE_MESSAGE =
	"Refusing to run local-routing harness: LLM_VALIDATION_OK=1 is required per ADR-0005 D7 and ADR-0005 §Local-endpoint routing harness.";
const LOOPBACK_GUARDRAIL_PREFIX = "loopback guardrail violated";
const CANNED_RESPONSE = '{"ok":true,"source":"loopback-harness"}';
const TEXT_MODEL = "local-harness-text";
const VISION_MODEL = "local-harness-vision";
const PROMPT = "Describe the local routing harness photo.";
const LOOPBACK_PLACEHOLDER_TOKEN = ["loopback", "harness", "placeholder"].join(
	"-",
);
const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const workflowId = "33333333-3333-4333-8333-333333333333";

type ParsedArgs = {
	readonly baseUrl?: string;
};

type DispatchFn = typeof import("../../src/lib/llm/dispatch").dispatch;

type CapturedLoopbackRequest = {
	readonly method: string;
	readonly url: string;
	readonly body: unknown;
};

type NetworkSummary = {
	readonly apiOpenAiRequests: number;
	readonly nonLoopbackRequests: readonly string[];
};

class MemoryDispatchStore implements DispatchStore {
	companyVisionReads = 0;
	workflowConsentReads = 0;
	providerSettingsReads = 0;
	private readonly input: {
		readonly visionEnabled: boolean;
		readonly visionConsent: WorkflowVisionConsent;
		readonly providerSettings: DispatchProviderSettings;
	};

	constructor(input: {
		readonly visionEnabled: boolean;
		readonly visionConsent: WorkflowVisionConsent;
		readonly providerSettings: DispatchProviderSettings;
	}) {
		this.input = input;
	}

	async readCompanyVisionEnabled(): Promise<boolean | null> {
		this.companyVisionReads += 1;
		return this.input.visionEnabled;
	}

	async readWorkflowVisionConsent(): Promise<WorkflowVisionConsent | null> {
		this.workflowConsentReads += 1;
		return this.input.visionConsent;
	}

	async readProviderSettings(): Promise<DispatchProviderSettings | null> {
		this.providerSettingsReads += 1;
		return this.input.providerSettings;
	}
}

class FakeOpenAICompatibleServer {
	readonly requests: CapturedLoopbackRequest[] = [];
	private readonly server: Server;

	private constructor() {
		this.server = createServer((req, res) => void this.handle(req, res));
	}

	static async start(): Promise<FakeOpenAICompatibleServer> {
		const harness = new FakeOpenAICompatibleServer();

		await new Promise<void>((resolve, reject) => {
			harness.server.once("error", reject);
			harness.server.listen(0, "127.0.0.1", () => {
				harness.server.off("error", reject);
				resolve();
			});
		});

		return harness;
	}

	get baseUrl(): string {
		const address = this.server.address() as AddressInfo | null;
		assert.ok(address, "loopback server must be listening");
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
		try {
			const rawBody = await readRequestBody(req);
			const body = rawBody.length ? JSON.parse(rawBody) : null;
			this.requests.push({
				method: req.method ?? "",
				url: req.url ?? "",
				body,
			});

			if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
				writeJson(res, 404, { error: "unexpected loopback route" });
				return;
			}

			writeJson(res, 200, {
				model: VISION_MODEL,
				choices: [
					{
						message: {
							content: CANNED_RESPONSE,
						},
					},
				],
				usage: {
					prompt_tokens: 13,
					completion_tokens: 5,
				},
			});
		} catch (error) {
			writeJson(res, 500, {
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}

class NetworkGuard {
	private readonly originalFetch = globalThis.fetch.bind(globalThis);
	private readonly nonLoopbackRequests: string[] = [];
	private apiOpenAiRequests = 0;

	install(): void {
		globalThis.fetch = this.fetch;
	}

	restore(): void {
		globalThis.fetch = this.originalFetch;
	}

	summary(): NetworkSummary {
		return {
			apiOpenAiRequests: this.apiOpenAiRequests,
			nonLoopbackRequests: [...this.nonLoopbackRequests],
		};
	}

	fetch: typeof fetch = async (input, init) => {
		const url = requestUrl(input);

		if (url.hostname === "api.openai.com") {
			this.apiOpenAiRequests += 1;
		}

		if (!isLoopbackUrl(url)) {
			this.nonLoopbackRequests.push(url.toString());
			throw new Error(`external network guardrail violated: ${url.toString()}`);
		}

		return this.originalFetch(input, init);
	};
}

async function main(): Promise<void> {
	if (process.env.LLM_VALIDATION_OK !== "1") {
		throw new Error(GATE_MESSAGE);
	}

	const args = parseArgs(process.argv.slice(2));

	if (args.baseUrl) {
		assertLoopbackBaseUrl(args.baseUrl);
	}

	const dispatch = await loadDispatch();
	const fakeServer = await FakeOpenAICompatibleServer.start();
	const networkGuard = new NetworkGuard();
	const baseUrl = args.baseUrl ?? fakeServer.baseUrl;
	assertLoopbackBaseUrl(baseUrl);
	networkGuard.install();

	try {
		const localOverrideConfig = {
			baseUrl,
			apiKey: LOOPBACK_PLACEHOLDER_TOKEN,
			textModel: TEXT_MODEL,
			visionModel: VISION_MODEL,
		};

		const scenarioA = await runCompanyOffScenario({
			dispatch,
			localOverrideConfig,
			fakeServer,
			networkGuard,
		});
		const scenarioB = await runLocalOverrideScenario({
			dispatch,
			localOverrideConfig,
			fakeServer,
			networkGuard,
		});

		assertExternalNetworkQuiet(networkGuard.summary());
		assert.equal(scenarioA.loopbackRequests, 0);
		assert.equal(scenarioB.loopbackRequests, 1);

		console.log("Local routing harness: PASS");
		console.log("guardrail: LLM_VALIDATION_OK=1 present");
		console.log(`loopback_base_url=${baseUrl}`);
		console.log(
			[
				"scenario_a",
				"step0_blocked=true",
				"code=vision_unavailable_company",
				`loopback_requests=${scenarioA.loopbackRequests}`,
				`provider_settings_reads=${scenarioA.providerSettingsReads}`,
				`non_loopback_requests=${scenarioA.nonLoopbackRequests}`,
			].join(" "),
		);
		console.log(
			[
				"scenario_b",
				"provider_step=localOverride",
				`loopback_requests=${scenarioB.loopbackRequests}`,
				"vision_shaped_body=true",
				`response=${scenarioB.response}`,
				`audit_writes=${scenarioB.auditWrites}`,
				`api_openai_requests=${scenarioB.apiOpenAiRequests}`,
				`non_loopback_requests=${scenarioB.nonLoopbackRequests}`,
			].join(" "),
		);
	} finally {
		networkGuard.restore();
		await fakeServer.close();
	}
}

async function loadDispatch(): Promise<DispatchFn> {
	const { dispatch } = (await import(
		dispatchModulePath
	)) as typeof import("../../src/lib/llm/dispatch");
	return dispatch;
}

async function runCompanyOffScenario(input: {
	readonly dispatch: DispatchFn;
	readonly localOverrideConfig: Record<string, unknown>;
	readonly fakeServer: FakeOpenAICompatibleServer;
	readonly networkGuard: NetworkGuard;
}): Promise<{
	readonly loopbackRequests: number;
	readonly providerSettingsReads: number;
	readonly nonLoopbackRequests: number;
}> {
	const startingLoopbackRequests = input.fakeServer.requests.length;
	const store = new MemoryDispatchStore({
		visionEnabled: false,
		visionConsent: "ALWAYS",
		providerSettings: {
			localOverrideConfig: input.localOverrideConfig,
			hasByokProviderConfig: false,
		},
	});

	const result = await input.dispatch(visionRequest(), {
		store,
		env: { NODE_ENV: "development" },
		fetch: input.networkGuard.fetch,
		recordVisionCall: () => {
			throw new Error("Step 0 blocked path must not write vision audit");
		},
	});

	assert.equal(result.ok, false);
	assert.equal(result.ok ? "" : result.code, "vision_unavailable_company");
	assert.equal(store.providerSettingsReads, 0);

	return {
		loopbackRequests:
			input.fakeServer.requests.length - startingLoopbackRequests,
		providerSettingsReads: store.providerSettingsReads,
		nonLoopbackRequests:
			input.networkGuard.summary().nonLoopbackRequests.length,
	};
}

async function runLocalOverrideScenario(input: {
	readonly dispatch: DispatchFn;
	readonly localOverrideConfig: Record<string, unknown>;
	readonly fakeServer: FakeOpenAICompatibleServer;
	readonly networkGuard: NetworkGuard;
}): Promise<{
	readonly loopbackRequests: number;
	readonly response: string;
	readonly auditWrites: number;
	readonly apiOpenAiRequests: number;
	readonly nonLoopbackRequests: number;
}> {
	const startingLoopbackRequests = input.fakeServer.requests.length;
	const audits: VisionCallAuditInput[] = [];
	const store = new MemoryDispatchStore({
		visionEnabled: true,
		visionConsent: "ALWAYS",
		providerSettings: {
			localOverrideConfig: input.localOverrideConfig,
			hasByokProviderConfig: false,
		},
	});

	const result = await input.dispatch(visionRequest(), {
		store,
		env: { NODE_ENV: "development" },
		fetch: input.networkGuard.fetch,
		recordVisionCall: (audit) => audits.push(audit),
		now: () => new Date("2026-05-05T00:00:00.000Z"),
	});

	assert.equal(result.ok, true);
	assert.equal(result.ok ? result.providerStep : "", "localOverride");
	assert.equal(result.ok ? result.response.text : "", CANNED_RESPONSE);
	assert.equal(audits.length, 1);

	const scenarioRequests = input.fakeServer.requests.slice(
		startingLoopbackRequests,
	);
	assert.equal(scenarioRequests.length, 1);
	assertVisionRequestBody(scenarioRequests[0].body);

	const networkSummary = input.networkGuard.summary();
	return {
		loopbackRequests: scenarioRequests.length,
		response: result.ok ? result.response.text : "",
		auditWrites: audits.length,
		apiOpenAiRequests: networkSummary.apiOpenAiRequests,
		nonLoopbackRequests: networkSummary.nonLoopbackRequests.length,
	};
}

function visionRequest(): LLMVisionRequest {
	return {
		prompt: PROMPT,
		photos: [
			{
				mimeType: "image/png",
				data: Buffer.from("local-routing-harness-photo"),
				filename: "local-routing-harness.png",
			},
		],
		options: {
			tenantId,
			userId,
			workflowId,
			locale: "en",
			promptPurpose: "llm-eval.local-routing",
			kind: "authoring",
			requiresVision: true,
		},
	};
}

function assertVisionRequestBody(body: unknown): void {
	assert.ok(isRecord(body), "loopback request body must be an object");
	assert.equal(body.model, VISION_MODEL);
	assert.ok(Array.isArray(body.messages), "messages must be an array");

	const userMessage = body.messages.find(
		(message) => isRecord(message) && message.role === "user",
	);
	assert.ok(isRecord(userMessage), "user message must be present");
	assert.ok(
		Array.isArray(userMessage.content),
		"user content must be an array",
	);

	const textPart = userMessage.content.find(
		(part) => isRecord(part) && part.type === "text",
	);
	assert.ok(isRecord(textPart), "vision text part must be present");
	assert.equal(textPart.text, PROMPT);

	const imagePart = userMessage.content.find(
		(part) => isRecord(part) && part.type === "image_url",
	);
	assert.ok(isRecord(imagePart), "vision image part must be present");
	assert.ok(isRecord(imagePart.image_url), "image_url object must be present");
	assert.ok(
		typeof imagePart.image_url.url === "string" &&
			imagePart.image_url.url.startsWith("data:image/png;base64,"),
		"image_url must contain a PNG data URL",
	);
}

function parseArgs(args: readonly string[]): ParsedArgs {
	let baseUrl: string | undefined;

	for (let index = 0; index < args.length; index += 1) {
		const arg = args[index];

		if (arg === "--base-url") {
			baseUrl = args[index + 1];
			index += 1;
			continue;
		}

		if (arg.startsWith("--base-url=")) {
			baseUrl = arg.slice("--base-url=".length);
			continue;
		}

		throw new Error(`Unknown argument: ${arg}`);
	}

	return { baseUrl };
}

function assertLoopbackBaseUrl(baseUrl: string): void {
	if (!LOOPBACK_BASE_URL_PATTERN.test(baseUrl)) {
		throw new Error(
			`${LOOPBACK_GUARDRAIL_PREFIX}: Company.localOverrideConfig.baseUrl must match ${LOOPBACK_BASE_URL_PATTERN.toString()}; received ${baseUrl}`,
		);
	}
}

function assertExternalNetworkQuiet(summary: NetworkSummary): void {
	assert.equal(
		summary.apiOpenAiRequests,
		0,
		"api.openai.com requests must be 0",
	);
	assert.deepEqual(
		summary.nonLoopbackRequests,
		[],
		"non-loopback requests must be 0",
	);
}

function requestUrl(input: Parameters<typeof fetch>[0]): URL {
	if (typeof input === "string" || input instanceof URL) {
		return new URL(input);
	}

	return new URL(input.url);
}

function isLoopbackUrl(url: URL): boolean {
	return url.protocol === "http:" &&
		(url.hostname === "127.0.0.1" || url.hostname === "localhost")
		? true
		: url.protocol === "https:" &&
				(url.hostname === "127.0.0.1" || url.hostname === "localhost");
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
	body: Record<string, unknown>,
): void {
	res.writeHead(statusCode, { "content-type": "application/json" });
	res.end(JSON.stringify(body));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exitCode = 1;
});
