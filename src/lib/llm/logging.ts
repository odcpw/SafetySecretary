import type { LLMRequest, LLMResponse } from "./types";

export const LLM_METADATA_LOG_STREAM = "llm.metadata";
export const LLM_DEBUG_LOG_STREAM = "llm.debug.content";
export const LLM_DEBUG_LOG_ENV = "LLM_DEBUG_LOG";

type EnvLike = Pick<NodeJS.ProcessEnv, string>;

export type LLMMetadataLogRecord = {
	readonly stream: typeof LLM_METADATA_LOG_STREAM;
	readonly timestamp: string;
	readonly tenant_id: string;
	readonly user_id: string;
	readonly provider: string;
	readonly model: string;
	readonly prompt_purpose: string;
	readonly kind: string;
	readonly token_input: number | null;
	readonly token_output: number | null;
	readonly cost_usd: number | null;
	readonly http_status: number | null;
	readonly error_code: string | null;
	readonly latency_ms: number;
};

export type LLMDebugContentLogRecord = {
	readonly stream: typeof LLM_DEBUG_LOG_STREAM;
	readonly timestamp: string;
	readonly tenant_id: string;
	readonly user_id: string;
	readonly provider: string;
	readonly model: string;
	readonly prompt_purpose: string;
	readonly kind: string;
	readonly prompt_body: string;
	readonly response_body: string | null;
	readonly error_code: string | null;
};

export type LLMLogSink = {
	readonly metadata?: (record: LLMMetadataLogRecord) => void;
	readonly debug?: (record: LLMDebugContentLogRecord) => void;
};

export type LLMLogSuccessInput = {
	readonly request: LLMRequest;
	readonly response: LLMResponse;
	readonly provider: string;
	readonly startedAtMs: number;
	readonly env?: EnvLike;
	readonly sink?: LLMLogSink;
	readonly now?: () => Date;
};

export type LLMLogErrorInput = {
	readonly request: LLMRequest;
	readonly error: unknown;
	readonly provider: string;
	readonly startedAtMs: number;
	readonly env?: EnvLike;
	readonly sink?: LLMLogSink;
	readonly now?: () => Date;
};

export const LLM_LOGGING_ADMIN_COPY = {
	title: "LLM logging",
	eyebrow: "Admin control",
	statusOn: "Debug LLM logging is ON",
	statusOff: "Debug LLM logging is OFF",
	body: "Default LLM logs contain metadata only. Operators enable prompt and response debug logs by setting LLM_DEBUG_LOG=1 outside the application.",
	debugStream:
		"Debug content is written to a separate stream so log shipping can exclude it unless explicitly re-enabled.",
	metadata:
		"Metadata includes tenant ID, user ID, provider, model, prompt purpose, kind, token counts, cost, status, error code, and latency.",
} as const;

export const LLM_LOGGING_LEGAL_COPY = {
	title: "LLM logging posture",
	intro:
		"Safety Secretary keeps LLM application logs minimised by default. Prompt text, response text, photo bytes, photo URLs, photo hashes, BYOK keys, and user workflow content are not written to the default log stream.",
	defaultHeading: "Default metadata log",
	defaultBody:
		"The default stream records timestamp, tenant ID, user ID, provider, model, prompt purpose, call kind, token counts, cost, HTTP status, error code, and latency so operations can monitor reliability without storing LLM content.",
	debugHeading: "Operator debug switch",
	debugBody:
		"Operators can set LLM_DEBUG_LOG=1 for a deployment when prompt troubleshooting is required. That writes prompt and response text to a clearly marked debug stream, separate from the default metadata stream.",
	neverHeading: "Never logged",
	neverBody:
		"BYOK plaintext keys are never logged. Photos are never logged in application logs. Vision audit records store photo hashes separately from the application logging stream.",
} as const;

export function isLLMDebugLoggingEnabled(
	env: EnvLike = process.env,
): boolean {
	return env[LLM_DEBUG_LOG_ENV] === "1";
}

export function llmDebugLoggingStatusText(env: EnvLike = process.env): string {
	return isLLMDebugLoggingEnabled(env)
		? LLM_LOGGING_ADMIN_COPY.statusOn
		: LLM_LOGGING_ADMIN_COPY.statusOff;
}

export function logLLMDispatchSuccess(input: LLMLogSuccessInput): void {
	const timestamp = timestampFor(input.now);
	const provider = input.response.provider ?? input.provider;
	const model = input.response.model ?? "unknown";
	const base = metadataBase({
		model,
		provider,
		request: input.request,
		startedAtMs: input.startedAtMs,
		timestamp,
	});

	emitMetadata(input.sink, {
		...base,
		error_code: null,
		http_status: null,
		token_input: input.response.usage?.inputTokens ?? null,
		token_output: input.response.usage?.outputTokens ?? null,
	});

	if (isLLMDebugLoggingEnabled(input.env)) {
		emitDebug(input.sink, {
			stream: LLM_DEBUG_LOG_STREAM,
			timestamp,
			tenant_id: input.request.options.tenantId,
			user_id: input.request.options.userId,
			provider,
			model,
			prompt_purpose: input.request.options.promptPurpose,
			kind: input.request.options.kind,
			prompt_body: input.request.prompt,
			response_body: input.response.text,
			error_code: null,
		});
	}
}

export function logLLMDispatchError(input: LLMLogErrorInput): void {
	const timestamp = timestampFor(input.now);
	const errorCode = errorCodeFor(input.error);

	emitMetadata(input.sink, {
		...metadataBase({
			model: "unknown",
			provider: input.provider,
			request: input.request,
			startedAtMs: input.startedAtMs,
			timestamp,
		}),
		error_code: errorCode,
		http_status: httpStatusFor(input.error),
		token_input: null,
		token_output: null,
	});

	if (isLLMDebugLoggingEnabled(input.env)) {
		emitDebug(input.sink, {
			stream: LLM_DEBUG_LOG_STREAM,
			timestamp,
			tenant_id: input.request.options.tenantId,
			user_id: input.request.options.userId,
			provider: input.provider,
			model: "unknown",
			prompt_purpose: input.request.options.promptPurpose,
			kind: input.request.options.kind,
			prompt_body: input.request.prompt,
			response_body: null,
			error_code: errorCode,
		});
	}
}

function metadataBase(input: {
	readonly request: LLMRequest;
	readonly provider: string;
	readonly model: string;
	readonly timestamp: string;
	readonly startedAtMs: number;
}): Omit<
	LLMMetadataLogRecord,
	"error_code" | "http_status" | "token_input" | "token_output"
> {
	return {
		stream: LLM_METADATA_LOG_STREAM,
		timestamp: input.timestamp,
		tenant_id: input.request.options.tenantId,
		user_id: input.request.options.userId,
		provider: input.provider,
		model: input.model,
		prompt_purpose: input.request.options.promptPurpose,
		kind: input.request.options.kind,
		cost_usd: null,
		latency_ms: Math.max(0, Date.now() - input.startedAtMs),
	};
}

function emitMetadata(
	sink: LLMLogSink | undefined,
	record: LLMMetadataLogRecord,
): void {
	if (sink?.metadata) {
		sink.metadata(record);
		return;
	}

	console.info(JSON.stringify(record));
}

function emitDebug(
	sink: LLMLogSink | undefined,
	record: LLMDebugContentLogRecord,
): void {
	if (sink?.debug) {
		sink.debug(record);
		return;
	}

	console.debug(JSON.stringify(record));
}

function timestampFor(now: (() => Date) | undefined): string {
	return (now?.() ?? new Date()).toISOString();
}

function httpStatusFor(error: unknown): number | null {
	if (!isRecord(error)) {
		return null;
	}

	for (const key of ["status", "statusCode", "httpStatus"]) {
		const value = error[key];
		if (typeof value === "number" && Number.isInteger(value)) {
			return value;
		}
	}

	return null;
}

function errorCodeFor(error: unknown): string {
	if (isRecord(error) && typeof error.code === "string") {
		return safeErrorCode(error.code);
	}

	if (error instanceof Error && error.name) {
		return safeErrorCode(error.name);
	}

	return "unknown_error";
}

function safeErrorCode(value: string): string {
	return /^[A-Za-z0-9_.:-]{1,96}$/.test(value) ? value : "unknown_error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object";
}
