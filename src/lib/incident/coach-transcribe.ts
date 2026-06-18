import { prisma } from "../db";
import { PrismaByokStore } from "../llm/byok";
import {
	checkAndConsumeCap,
	type CheckAndConsumeCapOptions,
	type MonthlyCapCheckResult,
	recordCost,
} from "../llm/cost";
import { decryptWithMasterKey } from "../crypto/master-key";
import { KindEnum, type LLMRequest } from "../llm/types";

export const II_COACH_TRANSCRIBE_PROMPT_PURPOSE = "ii_coach_transcribe";
export const II_COACH_TRANSCRIBE_MOCK_ENV = "SSFW_II_TRANSCRIBE_MOCK";
export const II_COACH_TRANSCRIBE_MODEL_ENV = "SSFW_II_TRANSCRIBE_MODEL";
const DEFAULT_MOCK_TRANSCRIPT = "mock transcript";
const DEFAULT_TRANSCRIBE_MODELS = ["gpt-4o-transcribe", "whisper-1"] as const;
const TRANSCRIPTIONS_URL = "https://api.openai.com/v1/audio/transcriptions";

/**
 * Thrown when neither a tenant BYOK key nor process.env.OPENAI_API_KEY is
 * available. The route maps this to 503 NO_PROVIDER_KEY.
 */
export class CoachTranscribeNoProviderKeyError extends Error {
	readonly code = "no_provider_key";

	constructor() {
		super("No OpenAI API key is configured for transcription.");
		this.name = "CoachTranscribeNoProviderKeyError";
	}
}

/**
 * Thrown when the per-tenant monthly LLM budget is exhausted. The route maps
 * this to 503 MONTHLY_CAP_EXCEEDED. The cap is checked BEFORE any audio leaves
 * the server, so a tenant over budget never reaches OpenAI.
 */
export class CoachTranscribeMonthlyCapError extends Error {
	readonly code = "monthly_cap_exceeded";

	constructor() {
		super("Monthly LLM usage cap exceeded.");
		this.name = "CoachTranscribeMonthlyCapError";
	}
}

/** Thrown when the OpenAI transcription request itself fails. */
export class CoachTranscribeProviderError extends Error {
	readonly code = "provider_failed";
	readonly status?: number;

	constructor(message: string, status?: number) {
		super(message);
		this.name = "CoachTranscribeProviderError";
		this.status = status;
	}
}

export type CoachTranscribeDispatchOptions = {
	/** Bypasses the HTTP call entirely and returns this transcript verbatim. */
	readonly mockTranscript?: string;
	readonly env?: Pick<NodeJS.ProcessEnv, string>;
	readonly fetch?: typeof fetch;
	/** Test/override seam for the per-tenant key resolution. */
	readonly resolveApiKey?: (input: {
		tenantId: string;
	}) => Promise<string | null> | string | null;
	/** Test/override seam for the monthly cap check. */
	readonly checkCap?: (
		req: LLMRequest,
		tenantId: string,
	) => Promise<MonthlyCapCheckResult> | MonthlyCapCheckResult;
	/** Test/override seam for cost ledger recording. */
	readonly recordCost?: typeof recordCost;
	/** Override seam for the cap-check deployment/store. */
	readonly capOptions?: CheckAndConsumeCapOptions;
};

export type TranscribeCoachAudioInput = {
	readonly tenantId: string;
	readonly userId: string;
	readonly incidentId: string;
	readonly audio: Buffer;
	readonly mimeType: string;
	readonly filename: string;
	readonly locale: string;
	readonly signal?: AbortSignal;
	readonly dispatchOptions?: CoachTranscribeDispatchOptions;
};

/**
 * Push-to-talk transcription for the incident coach. The audio bytes are sent
 * to OpenAI only on this explicit user action and are never stored. We mirror
 * the text path's privacy posture: no transcript or audio content is logged.
 */
export async function transcribeCoachAudio(
	input: TranscribeCoachAudioInput,
): Promise<{ text: string }> {
	const options = input.dispatchOptions ?? {};
	const env = options.env ?? process.env;
	const inTestMode = env.NODE_ENV === "test";

	// Enforce the same monthly budget the text path uses, BEFORE any audio
	// leaves the server. Skipped in test mode unless a stub is injected so the
	// route success path can run without a database.
	if (options.checkCap || !inTestMode) {
		const capRequest = buildCapRequest(input);
		const cap = await (options.checkCap ??
			((req: LLMRequest, tenantId: string) =>
				checkAndConsumeCap(req, tenantId, {
					env,
					...options.capOptions,
				})))(capRequest, input.tenantId);

		if (!cap.ok) {
			throw new CoachTranscribeMonthlyCapError();
		}
	}

	// Test mode (or an explicit mock) returns a canned transcript and never
	// touches the network or an API key.
	if (options.mockTranscript !== undefined || inTestMode) {
		const text =
			options.mockTranscript ??
			env[II_COACH_TRANSCRIBE_MOCK_ENV] ??
			DEFAULT_MOCK_TRANSCRIPT;
		await recordTranscribeCost(input, options, "mock");
		return { text: text.trim() };
	}

	const apiKey = await resolveTranscribeApiKey(input.tenantId, options);

	if (!apiKey) {
		throw new CoachTranscribeNoProviderKeyError();
	}

	const text = await postTranscription({ apiKey, input, options });
	await recordTranscribeCost(input, options, "openai");

	return { text };
}

function buildCapRequest(input: TranscribeCoachAudioInput): LLMRequest {
	return {
		prompt: "",
		options: {
			kind: KindEnum.Authoring,
			locale: input.locale,
			promptPurpose: II_COACH_TRANSCRIBE_PROMPT_PURPOSE,
			requiresVision: false,
			tenantId: input.tenantId,
			userId: input.userId,
			workflowId: input.incidentId,
		},
	};
}

async function resolveTranscribeApiKey(
	tenantId: string,
	options: CoachTranscribeDispatchOptions,
): Promise<string | null> {
	if (options.resolveApiKey) {
		return options.resolveApiKey({ tenantId });
	}

	// Tenant BYOK first — the same encrypted config the text provider uses.
	const byokKey = await readTenantByokApiKey(tenantId);
	if (byokKey) {
		return byokKey;
	}

	const env = options.env ?? process.env;
	const fallback = env.OPENAI_API_KEY?.trim();
	return fallback ? fallback : null;
}

async function readTenantByokApiKey(
	tenantId: string,
): Promise<string | null> {
	try {
		const ciphertext = await new PrismaByokStore(prisma).readByokCiphertext({
			tenantId,
		});

		if (!ciphertext) {
			return null;
		}

		const parsed = JSON.parse(decryptWithMasterKey(ciphertext)) as {
			apiKey?: unknown;
		};

		return typeof parsed.apiKey === "string" && parsed.apiKey.trim()
			? parsed.apiKey.trim()
			: null;
	} catch {
		// A missing master key or malformed ciphertext must not crash
		// transcription; fall back to the env key.
		return null;
	}
}

async function postTranscription(args: {
	apiKey: string;
	input: TranscribeCoachAudioInput;
	options: CoachTranscribeDispatchOptions;
}): Promise<string> {
	const { apiKey, input, options } = args;
	const fetchFn = options.fetch ?? fetch;
	const env = options.env ?? process.env;
	const models = transcriptionModelCandidates(env);
	let lastProviderError: CoachTranscribeProviderError | null = null;

	for (const [index, model] of models.entries()) {
		try {
			return await postTranscriptionWithModel({
				apiKey,
				fetchFn,
				input,
				model,
			});
		} catch (error) {
			if (
				error instanceof CoachTranscribeProviderError &&
				canFallbackFromTranscriptionStatus(error.status) &&
				index < models.length - 1
			) {
				lastProviderError = error;
				continue;
			}

			throw error;
		}
	}

	throw (
		lastProviderError ??
		new CoachTranscribeProviderError("No transcription model was configured.")
	);
}

async function postTranscriptionWithModel(args: {
	apiKey: string;
	fetchFn: typeof fetch;
	input: TranscribeCoachAudioInput;
	model: string;
}): Promise<string> {
	const { apiKey, fetchFn, input, model } = args;
	const form = new FormData();
	form.set("model", model);
	form.set("response_format", "json");

	const languageHint = twoLetterLanguage(input.locale);
	if (languageHint) {
		form.set("language", languageHint);
	}

	const blob = new Blob([Uint8Array.from(input.audio)], {
		type: input.mimeType || "application/octet-stream",
	});
	form.set("file", blob, input.filename || "audio.webm");

	let response: Response;

	try {
		response = await fetchFn(TRANSCRIPTIONS_URL, {
			body: form,
			headers: { authorization: `Bearer ${apiKey}` },
			method: "POST",
			signal: input.signal,
		});
	} catch (error) {
		if (isAbortError(error)) {
			throw error;
		}

		throw new CoachTranscribeProviderError(
			"OpenAI transcription request failed.",
		);
	}

	const responseText = await response.text();

	if (!response.ok) {
		throw new CoachTranscribeProviderError(
			`OpenAI transcription failed with status ${response.status}.`,
			response.status,
		);
	}

	let body: { text?: unknown };

	try {
		body = JSON.parse(responseText) as { text?: unknown };
	} catch {
		throw new CoachTranscribeProviderError(
			"OpenAI transcription response was not valid JSON.",
		);
	}

	if (typeof body.text !== "string") {
		throw new CoachTranscribeProviderError(
			"OpenAI transcription response did not include text.",
		);
	}

	return body.text.trim();
}

function transcriptionModelCandidates(
	env: Pick<NodeJS.ProcessEnv, string>,
): readonly string[] {
	const configured = env[II_COACH_TRANSCRIBE_MODEL_ENV]?.trim();

	if (!configured) {
		return DEFAULT_TRANSCRIBE_MODELS;
	}

	const models = configured
		.split(",")
		.map((model) => model.trim())
		.filter(Boolean);

	return models.length > 0 ? models : DEFAULT_TRANSCRIBE_MODELS;
}

function canFallbackFromTranscriptionStatus(
	status: number | undefined,
): boolean {
	return status === 400 || status === 404;
}

/**
 * Audio duration is unknown to us, so we log a flat zero-token authoring entry.
 * Cost-ledger failures must never break the transcription itself.
 */
async function recordTranscribeCost(
	input: TranscribeCoachAudioInput,
	options: CoachTranscribeDispatchOptions,
	provider: string,
): Promise<void> {
	try {
		await (options.recordCost ?? recordCost)({
			tenantId: input.tenantId,
			kind: KindEnum.Authoring,
			provider: `transcribe:${provider}`,
			tokenInput: 0,
			tokenOutput: 0,
			costUsd: 0,
		});
	} catch (error) {
		console.warn(
			"[ii-coach-transcribe] cost ledger entry failed:",
			error instanceof Error ? error.message : error,
		);
	}
}

function twoLetterLanguage(locale: string): string | null {
	const code = locale.trim().slice(0, 2).toLowerCase();
	return /^[a-z]{2}$/.test(code) ? code : null;
}

function isAbortError(error: unknown): boolean {
	return error instanceof DOMException
		? error.name === "AbortError"
		: error instanceof Error && error.name === "AbortError";
}
