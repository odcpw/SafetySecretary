import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === "next/server") {
			return nextResolve("next/server.js", context);
		}

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
});

const mutableEnv = process.env as Record<string, string | undefined>;
const originalNodeEnv = process.env.NODE_ENV;

mutableEnv.NODE_ENV = "test";

const { NextRequest } = (await import(
	"next/server.js"
)) as typeof import("next/server");
const transcribeRoute = (await import(
	moduleUrl("src/app/api/incidents/[id]/coach/transcribe/route.ts")
)) as typeof import("../../../src/app/api/incidents/[id]/coach/transcribe/route");
const {
	transcribeCoachAudio,
	CoachTranscribeNoProviderKeyError,
	CoachTranscribeMonthlyCapError,
	CoachTranscribeProviderError,
} = (await import(
	moduleUrl("src/lib/incident/coach-transcribe.ts")
)) as typeof import("../../../src/lib/incident/coach-transcribe");
const { mintCsrfToken } = (await import(
	moduleUrl("src/lib/auth/csrf.ts")
)) as typeof import("../../../src/lib/auth/csrf");

const incidentId = "11111111-1111-4111-8111-111111111111";
const tenantId = "22222222-2222-4222-8222-222222222222";
const userId = "33333333-3333-4333-8333-333333333333";
const sessionId = "44444444-4444-4444-8444-444444444444";
const csrfToken = mintCsrfToken(sessionId);

test.after(() => {
	if (originalNodeEnv === undefined) {
		delete mutableEnv.NODE_ENV;
	} else {
		mutableEnv.NODE_ENV = originalNodeEnv;
	}
});

test("transcribe route rejects an unauthenticated request", async () => {
	const response = await transcribeRoute.POST(
		new NextRequest(
			`https://app.example.test/api/incidents/${incidentId}/coach/transcribe`,
			{
				method: "POST",
			},
		),
		{ params: { id: incidentId } },
	);

	assert.equal(response.status, 401);
	assert.equal(record(await response.json()).code, "AUTH_REQUIRED");
});

test("transcribe route returns 400 when no audio field is present", async () => {
	const csrf = csrfToken;
	const form = new FormData();
	form.set("locale", "en");

	const response = await transcribeRoute.handleCoachTranscribe(
		multipartRequest({ csrf, form }),
		{ params: { id: incidentId } },
		{
			sessionValidator: testSessionValidator,
			transcribe: async () => {
				throw new Error("transcribe should not run when audio is missing");
			},
		},
	);

	assert.equal(response.status, 400);
	assert.equal(record(await response.json()).code, "AUDIO_REQUIRED");
});

test("transcribe route returns the mocked transcript without hitting the network", async () => {
	const csrf = csrfToken;
	const form = new FormData();
	form.set(
		"audio",
		new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/webm" }),
		"speech.webm",
	);
	form.set("locale", "en-GB");

	const response = await transcribeRoute.handleCoachTranscribe(
		multipartRequest({ csrf, form }),
		{ params: { id: incidentId } },
		{
			sessionValidator: testSessionValidator,
			transcribe: async (input) => {
				assert.equal(input.incidentId, incidentId);
				assert.equal(input.tenantId, tenantId);
				assert.equal(input.mimeType, "audio/webm");
				assert.ok(input.audio.byteLength === 4);
				// Exercise the real lib with the test/mock path (no network, no DB).
				return transcribeCoachAudio({
					...input,
					dispatchOptions: {
						mockTranscript: "hello from the mic",
						recordCost: (async () => ({})) as never,
					},
				});
			},
		},
	);

	assert.equal(response.status, 200);
	assert.equal(record(await response.json()).text, "hello from the mic");
});

test("transcribe route accepts a MediaRecorder codec-suffixed MIME type", async () => {
	const csrf = csrfToken;
	const form = new FormData();
	// Real browsers report e.g. "audio/webm;codecs=opus"; the route must match
	// on the MIME essence rather than rejecting it as UNSUPPORTED_CONTENT_TYPE.
	form.set(
		"audio",
		new Blob([new Uint8Array([1, 2, 3, 4])], {
			type: "audio/webm;codecs=opus",
		}),
		"speech.webm",
	);
	form.set("locale", "en");

	let observedMimeType = "";

	const response = await transcribeRoute.handleCoachTranscribe(
		multipartRequest({ csrf, form }),
		{ params: { id: incidentId } },
		{
			sessionValidator: testSessionValidator,
			transcribe: async (input) => {
				observedMimeType = input.mimeType;
				return { text: "codec ok" };
			},
		},
	);

	assert.equal(response.status, 200);
	assert.equal(record(await response.json()).text, "codec ok");
	assert.equal(
		observedMimeType,
		"audio/webm",
		"the codec parameter must be stripped before reaching the provider",
	);
});

test("transcribe route maps a missing provider key to 503 NO_PROVIDER_KEY", async () => {
	const csrf = csrfToken;

	const response = await transcribeRoute.handleCoachTranscribe(
		multipartRequest({ csrf, form: audioForm() }),
		{ params: { id: incidentId } },
		{
			sessionValidator: testSessionValidator,
			transcribe: async () => {
				throw new CoachTranscribeNoProviderKeyError();
			},
		},
	);

	assert.equal(response.status, 503);
	assert.equal(record(await response.json()).code, "NO_PROVIDER_KEY");
});

test("transcribe route maps an exhausted cap to 503 MONTHLY_CAP_EXCEEDED", async () => {
	const csrf = csrfToken;

	const response = await transcribeRoute.handleCoachTranscribe(
		multipartRequest({ csrf, form: audioForm() }),
		{ params: { id: incidentId } },
		{
			sessionValidator: testSessionValidator,
			transcribe: async () => {
				throw new CoachTranscribeMonthlyCapError();
			},
		},
	);

	assert.equal(response.status, 503);
	assert.equal(record(await response.json()).code, "MONTHLY_CAP_EXCEEDED");
});

test("transcribe route maps provider 400 to AUDIO_UNREADABLE", async () => {
	const csrf = csrfToken;

	const response = await transcribeRoute.handleCoachTranscribe(
		multipartRequest({ csrf, form: audioForm() }),
		{ params: { id: incidentId } },
		{
			sessionValidator: testSessionValidator,
			transcribe: async () => {
				throw new CoachTranscribeProviderError("Audio could not be decoded.", 400);
			},
		},
	);

	assert.equal(response.status, 422);
	assert.equal(record(await response.json()).code, "AUDIO_UNREADABLE");
});

test("transcribe route maps non-decode provider failures to PROVIDER_FAILED", async () => {
	const csrf = csrfToken;

	const response = await transcribeRoute.handleCoachTranscribe(
		multipartRequest({ csrf, form: audioForm() }),
		{ params: { id: incidentId } },
		{
			sessionValidator: testSessionValidator,
			transcribe: async () => {
				throw new CoachTranscribeProviderError("Provider unavailable.", 500);
			},
		},
	);

	assert.equal(response.status, 502);
	assert.equal(record(await response.json()).code, "PROVIDER_FAILED");
});

test("transcribeCoachAudio throws NO_PROVIDER_KEY when no key resolves", async () => {
	await assert.rejects(
		() =>
			transcribeCoachAudio({
				audio: Buffer.from([1, 2, 3]),
				dispatchOptions: {
					// Force the live path so the mock short-circuit is skipped.
					env: { NODE_ENV: "production" } as NodeJS.ProcessEnv,
					checkCap: () => ({ ok: true }),
					resolveApiKey: () => null,
					recordCost: (async () => ({})) as never,
				},
				filename: "speech.webm",
				incidentId,
				locale: "en",
				mimeType: "audio/webm",
				tenantId,
				userId,
			}),
		(error: unknown) => error instanceof CoachTranscribeNoProviderKeyError,
	);
});

test("transcribeCoachAudio enforces the monthly cap before transcribing", async () => {
	let transcribed = false;

	await assert.rejects(
		() =>
			transcribeCoachAudio({
				audio: Buffer.from([1, 2, 3]),
				dispatchOptions: {
					env: { NODE_ENV: "production" } as NodeJS.ProcessEnv,
					checkCap: () =>
						({
							ok: false,
							code: "monthly_cap_exceeded",
						}) as never,
					resolveApiKey: () => {
						transcribed = true;
						return "sk-should-not-be-used";
					},
					recordCost: (async () => ({})) as never,
				},
				filename: "speech.webm",
				incidentId,
				locale: "en",
				mimeType: "audio/webm",
				tenantId,
				userId,
			}),
		(error: unknown) => error instanceof CoachTranscribeMonthlyCapError,
	);

	assert.equal(transcribed, false, "cap check must run before key resolution");
});

test("transcribeCoachAudio posts multipart to OpenAI and returns trimmed text", async () => {
	let capturedUrl = "";
	let capturedAuth = "";
	let capturedModel: FormDataEntryValue | null = null;
	let capturedLanguage: FormDataEntryValue | null = null;
	let capturedFormat: FormDataEntryValue | null = null;
	let hadFile = false;

	const result = await transcribeCoachAudio({
		audio: Buffer.from([9, 8, 7, 6]),
		dispatchOptions: {
			env: { NODE_ENV: "production" } as NodeJS.ProcessEnv,
			checkCap: () => ({ ok: true }),
			resolveApiKey: () => "sk-test-key",
			recordCost: (async () => ({})) as never,
			fetch: (async (url: string, init?: RequestInit) => {
				capturedUrl = url;
				capturedAuth = String(
					(init?.headers as Record<string, string>)?.authorization ?? "",
				);
				const form = init?.body as FormData;
				capturedModel = form.get("model");
				capturedLanguage = form.get("language");
				capturedFormat = form.get("response_format");
				hadFile = form.get("file") !== null;

				return new Response(JSON.stringify({ text: "  spoken words  " }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}) as unknown as typeof fetch,
		},
		filename: "speech.webm",
		incidentId,
		locale: "de-CH",
		mimeType: "audio/webm",
		tenantId,
		userId,
	});

	assert.equal(result.text, "spoken words");
	assert.equal(capturedUrl, "https://api.openai.com/v1/audio/transcriptions");
	assert.equal(capturedAuth, "Bearer sk-test-key");
	assert.equal(capturedModel, "gpt-4o-transcribe");
	assert.equal(capturedLanguage, "de");
	assert.equal(capturedFormat, "json");
	assert.equal(hadFile, true);
});

test("transcribeCoachAudio falls back to whisper when the primary model is unavailable", async () => {
	const capturedModels: string[] = [];

	const result = await transcribeCoachAudio({
		audio: Buffer.from([9, 8, 7, 6]),
		dispatchOptions: {
			env: { NODE_ENV: "production" } as NodeJS.ProcessEnv,
			checkCap: () => ({ ok: true }),
			resolveApiKey: () => "sk-test-key",
			recordCost: (async () => ({})) as never,
			fetch: (async (_url: string, init?: RequestInit) => {
				const form = init?.body as FormData;
				const model = String(form.get("model") ?? "");
				capturedModels.push(model);

				if (model === "gpt-4o-transcribe") {
					return new Response(
						JSON.stringify({ error: { message: "model unavailable" } }),
						{ status: 404, headers: { "content-type": "application/json" } },
					);
				}

				return new Response(JSON.stringify({ text: "  fallback words  " }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}) as unknown as typeof fetch,
		},
		filename: "speech.webm",
		incidentId,
		locale: "en",
		mimeType: "audio/webm",
		tenantId,
		userId,
	});

	assert.equal(result.text, "fallback words");
	assert.deepEqual(capturedModels, ["gpt-4o-transcribe", "whisper-1"]);
});

function audioForm(): FormData {
	const form = new FormData();
	form.set(
		"audio",
		new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/webm" }),
		"speech.webm",
	);
	form.set("locale", "en");
	return form;
}

function multipartRequest(input: { csrf: string; form: FormData }) {
	return new NextRequest(
		`https://app.example.test/api/incidents/${incidentId}/coach/transcribe`,
		{
			body: input.form,
			headers: {
				cookie: `ssfw_csrf=${input.csrf}`,
				"x-ssfw-csrf": input.csrf,
				"x-ssfw-tenant-id": tenantId,
				"x-ssfw-user-id": userId,
			},
			method: "POST",
		},
	);
}

async function testSessionValidator() {
	return { id: sessionId, tenantId, userId };
}

function record(value: unknown): Record<string, unknown> {
	assert.ok(value && typeof value === "object" && !Array.isArray(value));
	return value as Record<string, unknown>;
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith("./") || specifier.startsWith("../");
}

function moduleUrl(relativePath: string): string {
	return pathToFileURL(`${process.cwd()}/${relativePath}`).href;
}
