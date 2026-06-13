import type { PrismaClient } from "@prisma/client";
import { prisma, withTenantConnection } from "../db";
import {
	createByokProviderForTenant,
	createLocalOverrideProvider as createLocalOverrideProviderFromConfig,
} from "./byok";
import { applyVisionConsentDefault, type WorkflowVisionConsent } from "./consent";
import {
	checkAndConsumeCap,
	type MonthlyCapCheckResult,
} from "./cost";
import {
	type MonthlyCapExceededError,
	VisionUnavailableCompanyError,
	VisionUnavailableWorkflowError,
} from "./errors";
import { MockProvider } from "./mock";
import { NoKeyProvider } from "./no-key";
import { OpenAICompatibleProvider } from "./openai-compatible";
import { createOpenAIProviderFromEnv } from "./openai";
import {
	hashVisionPhotos,
	recordVisionCall,
	type VisionCallAuditInput,
} from "./audit";
import {
	logLLMDispatchError,
	logLLMDispatchSuccess,
	type LLMLogSink,
} from "./logging";
import type {
	LLMProvider,
	LLMRequest,
	LLMResponse,
	LLMVisionRequest,
} from "./types";

export const DispatchErrorCode = {
	VisionConsentRequired: "vision_consent_required",
} as const;

export type DispatchErrorCode =
	(typeof DispatchErrorCode)[keyof typeof DispatchErrorCode];

export type ProviderSelectionStep =
	| "mock"
	| "localOverride"
	| "byok"
	| "selfHosted"
	| "hostedSaaS";

export type DispatchProviderSettings = {
	readonly localOverrideConfig: unknown;
	readonly hasByokProviderConfig: boolean;
};

export type DispatchStore = {
	readCompanyVisionEnabled(input: {
		tenantId: string;
		userId: string;
	}): Promise<boolean | null>;
	readWorkflowVisionConsent(input: {
		tenantId: string;
		workflowId?: string;
	}): Promise<WorkflowVisionConsent | null>;
	readProviderSettings(input: {
		tenantId: string;
	}): Promise<DispatchProviderSettings | null>;
};

export type HostedSaaSCapCheck = MonthlyCapCheckResult;

export type ProviderSelection = {
	readonly ok: true;
	readonly step: ProviderSelectionStep;
	readonly provider: LLMProvider;
};

export type DispatchOptions = {
	readonly store?: DispatchStore;
	readonly env?: Pick<NodeJS.ProcessEnv, string>;
	readonly fetch?: typeof fetch;
	readonly masterKey?: string | Buffer | Uint8Array;
	readonly mockProvider?: LLMProvider;
	readonly justGrantedVisionConsent?: boolean;
	readonly createLocalOverrideProvider?: (
		config: unknown,
	) => LLMProvider | null;
	readonly createByokProvider?: (input: {
		tenantId: string;
	}) => Promise<LLMProvider | null>;
	readonly createSelfHostedProvider?: () => LLMProvider | null;
	readonly createHostedSaaSProvider?: () => Promise<LLMProvider> | LLMProvider;
	readonly checkHostedSaaSCap?: (input: {
		tenantId: string;
		userId: string;
		promptPurpose: string;
	}) => Promise<HostedSaaSCapCheck> | HostedSaaSCapCheck;
	readonly logSink?: LLMLogSink;
	readonly recordVisionCall?: (
		input: VisionCallAuditInput,
	) => Promise<unknown> | unknown;
	readonly now?: () => Date;
};

export type DispatchSuccess = {
	readonly ok: true;
	readonly response: LLMResponse;
	readonly providerStep: ProviderSelectionStep;
};

export type DispatchFailure =
	| {
			readonly ok: false;
			readonly code: "vision_unavailable_company";
			readonly error: VisionUnavailableCompanyError;
	  }
	| {
			readonly ok: false;
			readonly code: "vision_unavailable_workflow";
			readonly error: VisionUnavailableWorkflowError;
	  }
	| {
			readonly ok: false;
			readonly code: typeof DispatchErrorCode.VisionConsentRequired;
			readonly deferred: "vision_consent_modal";
			readonly message: string;
			readonly workflowId?: string;
	  }
	| {
			readonly ok: false;
			readonly code: "monthly_cap_exceeded";
			readonly error: MonthlyCapExceededError;
	  };

export type DispatchResult = DispatchSuccess | DispatchFailure;

export async function dispatch(
	req: LLMRequest,
	options: DispatchOptions = {},
): Promise<DispatchResult> {
	const store = options.store ?? new PrismaDispatchStore();

	if (isVisionRequest(req)) {
		const gate = await runVisionStep0(req, store, options);
		if (!gate.ok) {
			return gate;
		}
	}

	const selection = await selectProvider(req, store, options);
	if (!selection.ok) {
		return selection;
	}

	const startedAt = Date.now();
	let response: LLMResponse;
	try {
		response = isVisionRequest(req)
			? await selection.provider.vision(req)
			: await selection.provider.text(req);
	} catch (error) {
		logLLMDispatchError({
			request: req,
			error,
			provider: selection.step,
			startedAtMs: startedAt,
			env: options.env,
			sink: options.logSink,
			now: options.now,
		});
		throw error;
	}

	logLLMDispatchSuccess({
		request: req,
		response,
		provider: selection.step,
		startedAtMs: startedAt,
		env: options.env,
		sink: options.logSink,
		now: options.now,
	});

	if (isVisionRequest(req)) {
		await writeVisionAudit(req, response, selection, startedAt, options);
	}

	return {
		ok: true,
		response,
		providerStep: selection.step,
	};
}

export class PrismaDispatchStore implements DispatchStore {
	private readonly prisma: PrismaClient;

	constructor(prismaClient: PrismaClient = prisma) {
		this.prisma = prismaClient;
	}

	async readCompanyVisionEnabled(input: {
		tenantId: string;
		userId: string;
	}): Promise<boolean | null> {
		const tenant = await this.prisma.tenant.findFirst({
			select: { visionEnabled: true },
			where: {
				id: input.tenantId,
				memberships: {
					some: { userId: input.userId },
				},
			},
		});

		return tenant?.visionEnabled ?? null;
	}

	async readWorkflowVisionConsent(input: {
		tenantId: string;
		workflowId?: string;
	}): Promise<WorkflowVisionConsent | null> {
		if (!input.workflowId) {
			return "ASK";
		}

		const rows = await withTenantConnection(
			input.tenantId,
			async (tx) =>
				tx.$queryRaw<Array<{ visionConsent: WorkflowVisionConsent }>>`
					SELECT vision_consent::text AS "visionConsent"
					FROM incident_case
					WHERE id = ${input.workflowId}::uuid
					LIMIT 1
				`,
		);

		return applyVisionConsentDefault(rows[0]?.visionConsent);
	}

	async readProviderSettings(input: {
		tenantId: string;
	}): Promise<DispatchProviderSettings | null> {
		const tenant = await this.prisma.tenant.findUnique({
			select: {
				byokProviderConfigCiphertext: true,
				localOverrideConfig: true,
			},
			where: { id: input.tenantId },
		});

		if (!tenant) {
			return null;
		}

		return {
			localOverrideConfig: tenant.localOverrideConfig,
			hasByokProviderConfig: Boolean(tenant.byokProviderConfigCiphertext),
		};
	}
}

async function runVisionStep0(
	req: LLMVisionRequest,
	store: DispatchStore,
	options: DispatchOptions,
): Promise<{ ok: true } | DispatchFailure> {
	const visionEnabled = await store.readCompanyVisionEnabled({
		tenantId: req.options.tenantId,
		userId: req.options.userId,
	});

	if (visionEnabled !== true) {
		const error = new VisionUnavailableCompanyError();
		return {
			ok: false,
			code: error.code,
			error,
		};
	}

	const visionConsent = applyVisionConsentDefault(
		await store.readWorkflowVisionConsent({
			tenantId: req.options.tenantId,
			workflowId: req.options.workflowId,
		}),
	);

	if (visionConsent === "NEVER") {
		const error = new VisionUnavailableWorkflowError();
		return {
			ok: false,
			code: error.code,
			error,
		};
	}

	if (visionConsent === "ASK" && !options.justGrantedVisionConsent) {
		return {
			ok: false,
			code: DispatchErrorCode.VisionConsentRequired,
			deferred: "vision_consent_modal",
			message: "Vision consent is required before sending photos.",
			workflowId: req.options.workflowId,
		};
	}

	return { ok: true };
}

async function selectProvider(
	req: LLMRequest,
	store: DispatchStore,
	options: DispatchOptions,
): Promise<ProviderSelection | Extract<DispatchFailure, { code: "monthly_cap_exceeded" }>> {
	const env = options.env ?? process.env;

	if (env.NODE_ENV === "test") {
		return {
			ok: true,
			step: "mock",
			provider: options.mockProvider ?? new MockProvider(),
		};
	}

	const settings = await store.readProviderSettings({
		tenantId: req.options.tenantId,
	});

	const localOverrideProvider = settings
		? (options.createLocalOverrideProvider ??
				((config: unknown) =>
					createLocalOverrideProviderFromConfig(config, {
						fetch: options.fetch,
					})))(settings.localOverrideConfig)
		: null;

	if (localOverrideProvider) {
		return {
			ok: true,
			step: "localOverride",
			provider: localOverrideProvider,
		};
	}

	if (settings?.hasByokProviderConfig) {
		const byokProvider = await (
			options.createByokProvider ??
			((input: { tenantId: string }) =>
				createByokProviderForTenant(input, {
					prisma,
					fetch: options.fetch,
					masterKey: options.masterKey,
				}))
		)({ tenantId: req.options.tenantId });

		if (byokProvider) {
			return {
				ok: true,
				step: "byok",
				provider: byokProvider,
			};
		}
	}

	if (nonEmpty(env.LLM_BASE_URL)) {
		const cap = await checkAndConsumeCap(req, req.options.tenantId, {
			env,
			deployment: "selfHosted",
			now: options.now,
		});

		if (!cap.ok) {
			return {
				ok: false,
				code: cap.code,
				error: cap.error,
			};
		}

		const selfHostedProvider =
			options.createSelfHostedProvider?.() ??
			new OpenAICompatibleProvider({
				baseUrl: env.LLM_BASE_URL,
				apiKey: env.LLM_API_KEY,
				textModel: env.LLM_TEXT_MODEL,
				visionModel: env.LLM_VISION_MODEL,
				fetch: options.fetch,
			});

		if (selfHostedProvider) {
			return {
				ok: true,
				step: "selfHosted",
				provider: selfHostedProvider,
			};
		}
	}

	const cap = await (
		options.checkHostedSaaSCap ??
		((input) =>
			allowHostedSaaSCap({
				...input,
				req,
				env,
				now: options.now,
			}))
	)({
		tenantId: req.options.tenantId,
		userId: req.options.userId,
		promptPurpose: req.options.promptPurpose,
	});

	if (!cap.ok) {
		return {
			ok: false,
			code: cap.error.code,
			error: cap.error,
		};
	}

	return {
		ok: true,
		step: "hostedSaaS",
		provider:
			(await options.createHostedSaaSProvider?.()) ??
			createOpenAIProviderFromEnv({
				fetch: options.fetch,
				noKeyUpgradePath: "byok",
			}) ??
			new NoKeyProvider({ upgradePath: "byok" }),
	};
}

async function writeVisionAudit(
	req: LLMVisionRequest,
	response: LLMResponse,
	selection: ProviderSelection,
	startedAtMs: number,
	options: DispatchOptions,
): Promise<void> {
	if (!req.options.workflowId) {
		throw new Error("workflowId is required for audited vision calls.");
	}

	await (options.recordVisionCall ?? recordVisionCall)({
		tenantId: req.options.tenantId,
		workflowId: req.options.workflowId,
		userId: req.options.userId,
		photoHash: hashVisionPhotos(req.photos),
		provider: response.provider ?? selection.step,
		model: response.model ?? "unknown",
		promptPurpose: req.options.promptPurpose,
		calledAt: options.now?.() ?? new Date(),
		latencyMs: Date.now() - startedAtMs,
		tokenCostUsd: null,
	});
}

function allowHostedSaaSCap(input: {
	readonly tenantId: string;
	readonly req: LLMRequest;
	readonly env?: Pick<NodeJS.ProcessEnv, string>;
	readonly now?: () => Date;
}): Promise<HostedSaaSCapCheck> {
	return checkAndConsumeCap(input.req, input.tenantId, {
		env: input.env,
		deployment: "hostedSaaS",
		now: input.now,
	});
}

function nonEmpty(value: string | undefined): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function isVisionRequest(req: LLMRequest): req is LLMVisionRequest {
	return req.options.requiresVision;
}
