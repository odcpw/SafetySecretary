import type { Prisma, PrismaClient } from "@prisma/client";

export const Capability = {
	TextLlm: "text_llm",
	Vision: "vision",
	ImageGeneration: "image_generation",
	DocumentsIngestion: "documents_ingestion",
	CompanyMemory: "company_memory",
	ToolCalling: "tool_calling",
	VoiceStt: "voice_stt",
} as const;

export type Capability = (typeof Capability)[keyof typeof Capability];

export const ALL_CAPABILITIES = [
	Capability.TextLlm,
	Capability.Vision,
	Capability.ImageGeneration,
	Capability.DocumentsIngestion,
	Capability.CompanyMemory,
	Capability.ToolCalling,
	Capability.VoiceStt,
] as const satisfies readonly Capability[];

export const ProviderMode = {
	OpenaiDefault: "openai_default",
	Byok: "byok",
	LocalEndpoint: "local_endpoint",
	Disabled: "disabled",
} as const;

export type ProviderMode = (typeof ProviderMode)[keyof typeof ProviderMode];

export type CapabilityConfig = {
	readonly enabled: boolean;
	readonly provider_mode: ProviderMode;
	readonly credential_ref: string | null;
	readonly endpoint_ref: string | null;
	readonly configured_at: string | null;
	readonly configured_by_user_id: string | null;
	readonly data_handling_note_ref: string | null;
	readonly invalid_reason?: "invalid_config";
};

export type CapabilityMatrix = Partial<Record<Capability, CapabilityConfig>>;

export type TenantCapabilityInput = {
	readonly id?: string;
	readonly visionEnabled?: boolean | null;
	readonly capabilities?: unknown;
};

export type CapabilityEnv = {
	readonly OPENAI_API_KEY?: string;
};

export type CapabilityOptions = {
	readonly env?: CapabilityEnv;
};

export type CapabilityAvailable = {
	readonly ok: true;
	readonly providerMode: Exclude<ProviderMode, "disabled">;
	readonly providerRef?: string;
};

export type CapabilityUnavailable = {
	readonly ok: false;
	readonly code: "capability_unavailable";
	readonly reason: string;
};

export type CapabilityCheckResult = CapabilityAvailable | CapabilityUnavailable;

export type TenantCapabilityStoreInput = {
	readonly tenantId: string;
	readonly userId: string;
};

export type SaveTenantCapabilitiesInput = TenantCapabilityStoreInput & {
	readonly capabilities: unknown;
};

const rawProviderMaterialPatterns = [
	/\bsk-[A-Za-z0-9_-]{8,}\b/,
	/\bxox[baprs]-[A-Za-z0-9-]{8,}\b/,
	/\bgh[pousr]_[A-Za-z0-9_]{8,}\b/,
	/\bAIza[0-9A-Za-z_-]{10,}\b/,
	/\bBearer\s+[A-Za-z0-9._~+/-]{12,}={0,2}\b/i,
	/\bhttps?:\/\/[^\s"'<>]+/i,
];

const rawProviderMaterialKeyPattern =
	/(^|[_-])(api[_-]?key|access[_-]?token|refresh[_-]?token|secret|authorization|password)$/i;
const rawProviderUrlKeyPattern =
	/(^|[_-])(endpoint[_-]?url|base[_-]?url|url|uri)$/i;
const credentialRefPrefix = "credential:";
const endpointRefPrefix = "endpoint:";

export function requireCapability(
	tenant: TenantCapabilityInput,
	capability: Capability,
	options: CapabilityOptions = {},
): CapabilityCheckResult {
	const config = capabilityConfigForTenant(tenant, capability, options);

	if (config.invalid_reason) {
		return unavailable(capability, config.invalid_reason);
	}

	if (!config.enabled || config.provider_mode === ProviderMode.Disabled) {
		return unavailable(capability, "disabled");
	}

	if (config.provider_mode === ProviderMode.OpenaiDefault) {
		if (!hasOpenAiDefault(options.env)) {
			return unavailable(capability, "openai_default_missing_key");
		}

		return {
			ok: true,
			providerMode: ProviderMode.OpenaiDefault,
		};
	}

	if (config.provider_mode === ProviderMode.Byok) {
		if (!nonEmpty(config.credential_ref)) {
			return unavailable(capability, "byok_missing_credential_ref");
		}

		if (!isOpaqueCredentialRef(config.credential_ref)) {
			return unavailable(capability, "invalid_config");
		}

		return {
			ok: true,
			providerMode: ProviderMode.Byok,
			providerRef: config.credential_ref,
		};
	}

	if (config.provider_mode === ProviderMode.LocalEndpoint) {
		if (!nonEmpty(config.endpoint_ref)) {
			return unavailable(capability, "local_endpoint_missing_endpoint_ref");
		}

		if (!isOpaqueEndpointRef(config.endpoint_ref)) {
			return unavailable(capability, "invalid_config");
		}

		return {
			ok: true,
			providerMode: ProviderMode.LocalEndpoint,
			providerRef: config.endpoint_ref,
		};
	}

	return unavailable(capability, "unsupported_provider_mode");
}

export function capabilityConfigForTenant(
	tenant: TenantCapabilityInput,
	capability: Capability,
	options: CapabilityOptions = {},
): CapabilityConfig {
	if (capability === Capability.Vision && tenant.visionEnabled !== true) {
		return disabledConfig();
	}

	const stored = readCapabilityConfig(tenant.capabilities, capability);

	if (stored) {
		return stored;
	}

	return defaultCapabilityConfig(tenant, capability, options);
}

export function defaultCapabilityConfig(
	tenant: TenantCapabilityInput,
	capability: Capability,
	options: CapabilityOptions = {},
): CapabilityConfig {
	if (capability === Capability.TextLlm) {
		return hasOpenAiDefault(options.env)
			? enabledConfig(ProviderMode.OpenaiDefault)
			: disabledConfig();
	}

	if (capability === Capability.Vision) {
		if (tenant.visionEnabled !== true) {
			return disabledConfig();
		}

		return hasOpenAiDefault(options.env)
			? enabledConfig(ProviderMode.OpenaiDefault)
			: disabledConfig();
	}

	return disabledConfig();
}

export function prepareCapabilitiesForStorage(
	value: unknown,
): CapabilityMatrix {
	assertNoRawSecretsInCapabilities(value);
	if (!isRecord(value)) {
		throw new Error("Capabilities JSONB must be an object.");
	}

	const matrix = value;
	const prepared: CapabilityMatrix = {};

	for (const capability of ALL_CAPABILITIES) {
		if (!hasOwn(matrix, capability)) {
			continue;
		}

		const config = parseCapabilityConfig(matrix[capability]);

		if (!config || config.invalid_reason) {
			throw new Error(
				`Invalid capability config for ${capability}: invalid_config.`,
			);
		}

		validateCapabilityConfigForStorage(capability, config);
		prepared[capability] = config;
	}

	return prepared;
}

export function assertNoRawSecretsInCapabilities(value: unknown): void {
	const finding = findRawSecret(value);

	if (finding) {
		throw new Error(
			`Capabilities JSONB must store opaque refs only; raw secret-like key/token/url found at ${finding}.`,
		);
	}
}

export function containsRawSecretValue(value: unknown): boolean {
	return findRawSecret(value) !== null;
}

export class PrismaCapabilityStore {
	private readonly prisma: PrismaClient;

	constructor(prismaClient: PrismaClient) {
		this.prisma = prismaClient;
	}

	async readTenantCapabilities(
		input: TenantCapabilityStoreInput,
	): Promise<TenantCapabilityInput | null> {
		return this.prisma.tenant.findFirst({
			select: {
				id: true,
				visionEnabled: true,
				capabilities: true,
			},
			where: {
				id: input.tenantId,
				memberships: {
					some: { userId: input.userId },
				},
			},
		});
	}

	async updateTenantCapabilities(
		input: SaveTenantCapabilitiesInput,
	): Promise<boolean> {
		const capabilities = prepareCapabilitiesForStorage(input.capabilities);
		const result = await this.prisma.tenant.updateMany({
			data: {
				capabilities: capabilities as Prisma.InputJsonValue,
			},
			where: {
				id: input.tenantId,
				memberships: {
					some: { userId: input.userId },
				},
			},
		});

		return result.count === 1;
	}
}

function readCapabilityConfig(
	value: unknown,
	capability: Capability,
): CapabilityConfig | null {
	if (value === undefined) {
		return null;
	}

	if (containsRawSecretValue(value)) {
		return invalidConfig();
	}

	if (!isRecord(value)) {
		return invalidConfig();
	}

	if (!hasOwn(value, capability)) {
		return null;
	}

	return parseCapabilityConfig(value[capability]) ?? invalidConfig();
}

function parseCapabilityConfig(value: unknown): CapabilityConfig | null {
	if (!isRecord(value)) {
		return null;
	}

	const providerMode = parseProviderMode(value.provider_mode);

	if (!providerMode) {
		return invalidConfig();
	}

	return {
		enabled: value.enabled === true,
		provider_mode: providerMode,
		credential_ref: nullableString(value.credential_ref),
		endpoint_ref: nullableString(value.endpoint_ref),
		configured_at: nullableString(value.configured_at),
		configured_by_user_id: nullableString(value.configured_by_user_id),
		data_handling_note_ref: nullableString(value.data_handling_note_ref),
	};
}

function parseProviderMode(value: unknown): ProviderMode | null {
	return Object.values(ProviderMode).includes(value as ProviderMode)
		? (value as ProviderMode)
		: null;
}

function enabledConfig(providerMode: ProviderMode): CapabilityConfig {
	return {
		...baseConfig(),
		enabled: true,
		provider_mode: providerMode,
	};
}

function disabledConfig(): CapabilityConfig {
	return {
		...baseConfig(),
		enabled: false,
		provider_mode: ProviderMode.Disabled,
	};
}

function invalidConfig(): CapabilityConfig {
	return {
		...disabledConfig(),
		invalid_reason: "invalid_config",
	};
}

function baseConfig(): CapabilityConfig {
	return {
		enabled: false,
		provider_mode: ProviderMode.Disabled,
		credential_ref: null,
		endpoint_ref: null,
		configured_at: null,
		configured_by_user_id: null,
		data_handling_note_ref: null,
	};
}

function unavailable(
	capability: Capability,
	reasonCode: string,
): CapabilityUnavailable {
	return {
		ok: false,
		code: "capability_unavailable",
		reason: `${capability}:${reasonCode}`,
	};
}

function hasOpenAiDefault(env: CapabilityEnv | undefined): boolean {
	return nonEmpty(env?.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nullableString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function nonEmpty(value: string | null | undefined): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function validateCapabilityConfigForStorage(
	capability: Capability,
	config: CapabilityConfig,
): void {
	if (config.provider_mode === ProviderMode.Disabled) {
		return;
	}

	if (config.provider_mode === ProviderMode.Byok) {
		if (!nonEmpty(config.credential_ref)) {
			throw new Error(`${capability}: byok requires credential_ref.`);
		}

		if (!isOpaqueCredentialRef(config.credential_ref)) {
			throw new Error(`${capability}: byok credential_ref must be opaque.`);
		}
	}

	if (config.provider_mode === ProviderMode.LocalEndpoint) {
		if (!nonEmpty(config.endpoint_ref)) {
			throw new Error(`${capability}: local_endpoint requires endpoint_ref.`);
		}

		if (!isOpaqueEndpointRef(config.endpoint_ref)) {
			throw new Error(
				`${capability}: local_endpoint endpoint_ref must be opaque.`,
			);
		}
	}
}

function isOpaqueCredentialRef(value: string): boolean {
	return (
		value.startsWith(credentialRefPrefix) && !containsRawSecretValue(value)
	);
}

function isOpaqueEndpointRef(value: string): boolean {
	return value.startsWith(endpointRefPrefix) && !containsRawSecretValue(value);
}

function hasOwn(
	value: Record<string, unknown>,
	key: string,
): value is Record<string, unknown> {
	return Object.hasOwn(value, key);
}

function findRawSecret(value: unknown, path = "$"): string | null {
	if (typeof value === "string") {
		return rawProviderMaterialPatterns.some((pattern) => pattern.test(value))
			? path
			: null;
	}

	if (Array.isArray(value)) {
		for (const [index, item] of value.entries()) {
			const finding = findRawSecret(item, `${path}[${index}]`);

			if (finding) {
				return finding;
			}
		}

		return null;
	}

	if (!isRecord(value)) {
		return null;
	}

	for (const [key, item] of Object.entries(value)) {
		const childPath = `${path}.${key}`;

		if (
			(rawProviderMaterialKeyPattern.test(key) ||
				rawProviderUrlKeyPattern.test(key)) &&
			typeof item === "string" &&
			item
		) {
			return childPath;
		}

		const finding = findRawSecret(item, childPath);

		if (finding) {
			return finding;
		}
	}

	return null;
}
