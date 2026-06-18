import { Prisma, type PrismaClient } from "@prisma/client";
import {
	decryptWithMasterKey,
	encryptWithMasterKey,
} from "../crypto/master-key";
import {
	normalizeOpenAICompatibleConfig,
	OpenAICompatibleProvider,
	type OpenAICompatibleProviderConfig,
} from "./openai-compatible";
import type { LLMProvider, LLMTextRequest } from "./types";

const DEFAULT_BYOK_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_BYOK_TEXT_MODEL = "gpt-5.5";
const DEFAULT_BYOK_VISION_MODEL = "gpt-4o-mini";

export type ByokProviderConfigInput = {
	readonly baseUrl?: string;
	readonly apiKey: string;
	readonly textModel?: string;
	readonly visionModel?: string;
};

export type LocalOverrideConfig = OpenAICompatibleProviderConfig;
export type ByokProviderConfig = OpenAICompatibleProviderConfig & {
	readonly apiKey: string;
};

export type ByokSettingsState = {
	readonly hasByokProviderConfig: boolean;
	readonly maskedIndicator: string | null;
	readonly localOverrideConfig: LocalOverrideConfig | null;
};

export type ByokStore = {
	readSettings(input: TenantUserInput): Promise<ByokSettingsStoreRow | null>;
	readByokCiphertext(input: TenantInput): Promise<Buffer | Uint8Array | null>;
	saveByok(input: SaveByokStoreInput): Promise<boolean>;
	clearByok(input: TenantUserInput): Promise<boolean>;
	saveLocalOverride(input: SaveLocalOverrideStoreInput): Promise<boolean>;
	clearLocalOverride(input: TenantUserInput): Promise<boolean>;
};

export type TenantInput = {
	readonly tenantId: string;
};

export type TenantUserInput = TenantInput & {
	readonly userId: string;
};

export type SaveByokConfigInput = TenantUserInput & {
	readonly config: ByokProviderConfigInput;
};

export type SaveLocalOverrideConfigInput = TenantUserInput & {
	readonly config: unknown;
};

export type SaveByokStoreInput = TenantUserInput & {
	readonly ciphertext: Buffer;
	readonly maskedIndicator: string;
};

export type SaveLocalOverrideStoreInput = TenantUserInput & {
	readonly config: LocalOverrideConfig;
};

export type ByokSettingsStoreRow = {
	readonly byokProviderConfigCiphertext: Buffer | Uint8Array | null;
	readonly byokProviderConfigMaskedIndicator: string | null;
	readonly localOverrideConfig: unknown;
};

export type ByokHelperOptions = {
	readonly store?: ByokStore;
	readonly prisma?: PrismaClient;
	readonly fetch?: typeof fetch;
	readonly masterKey?: string | Buffer | Uint8Array;
};

export class ByokValidationError extends Error {
	readonly code = "byok_validation_failed";

	constructor() {
		super("BYOK provider validation failed.");
		this.name = "ByokValidationError";
	}
}

export async function readByokSettings(
	input: TenantUserInput,
	options: ByokHelperOptions = {},
): Promise<ByokSettingsState | null> {
	const row = await byokStore(options).readSettings(input);

	if (!row) {
		return null;
	}

	return {
		hasByokProviderConfig: Boolean(row.byokProviderConfigCiphertext),
		maskedIndicator: row.byokProviderConfigMaskedIndicator,
		localOverrideConfig: parseLocalOverrideConfig(row.localOverrideConfig),
	};
}

export async function saveByokProviderConfig(
	input: SaveByokConfigInput,
	options: ByokHelperOptions = {},
): Promise<boolean> {
	const config = normalizeByokConfig(input.config);

	await validateProviderConfig(config, {
		tenantId: input.tenantId,
		userId: input.userId,
		fetch: options.fetch,
	});

	const ciphertext = encryptWithMasterKey(JSON.stringify(config), {
		key: options.masterKey,
	});

	return byokStore(options).saveByok({
		tenantId: input.tenantId,
		userId: input.userId,
		ciphertext,
		maskedIndicator: maskedApiKeyIndicator(config.apiKey),
	});
}

export async function clearByokProviderConfig(
	input: TenantUserInput,
	options: ByokHelperOptions = {},
): Promise<boolean> {
	return byokStore(options).clearByok(input);
}

export async function saveLocalOverrideConfig(
	input: SaveLocalOverrideConfigInput,
	options: ByokHelperOptions = {},
): Promise<boolean> {
	const config = parseLocalOverrideConfig(input.config);

	if (!config) {
		return false;
	}

	return byokStore(options).saveLocalOverride({
		tenantId: input.tenantId,
		userId: input.userId,
		config,
	});
}

export async function clearLocalOverrideConfig(
	input: TenantUserInput,
	options: ByokHelperOptions = {},
): Promise<boolean> {
	return byokStore(options).clearLocalOverride(input);
}

export async function createByokProviderForTenant(
	input: TenantInput,
	options: ByokHelperOptions = {},
): Promise<LLMProvider | null> {
	const ciphertext = await byokStore(options).readByokCiphertext(input);

	if (!ciphertext) {
		return null;
	}

	const config = parseEncryptedByokConfig(
		decryptWithMasterKey(ciphertext, { key: options.masterKey }),
	);

	return new OpenAICompatibleProvider({
		config,
		fetch: options.fetch,
	});
}

export function createLocalOverrideProvider(
	config: unknown,
	options: Pick<ByokHelperOptions, "fetch"> = {},
): LLMProvider | null {
	const parsed = parseLocalOverrideConfig(config);

	if (!parsed) {
		return null;
	}

	return new OpenAICompatibleProvider({
		config: parsed,
		fetch: options.fetch,
	});
}

export function normalizeByokConfig(
	input: ByokProviderConfigInput,
): ByokProviderConfig {
	const config = normalizeOpenAICompatibleConfig({
		baseUrl: input.baseUrl ?? DEFAULT_BYOK_BASE_URL,
		apiKey: requireNonEmpty(input.apiKey, "apiKey"),
		textModel:
			input.textModel ?? process.env.LLM_TEXT_MODEL ?? DEFAULT_BYOK_TEXT_MODEL,
		visionModel:
			input.visionModel ??
			process.env.LLM_VISION_MODEL ??
			input.textModel ??
			process.env.LLM_TEXT_MODEL ??
			DEFAULT_BYOK_VISION_MODEL,
	});

	return {
		...config,
		apiKey: requireNonEmpty(config.apiKey, "apiKey"),
	};
}

export function parseLocalOverrideConfig(
	value: unknown,
): LocalOverrideConfig | null {
	if (!isRecord(value)) {
		return null;
	}

	const baseUrl = stringValue(value.baseUrl);
	const apiKey = stringValue(value.apiKey) || undefined;
	const textModel = stringValue(value.textModel);
	const visionModel = stringValue(value.visionModel);

	if (!baseUrl || !textModel || !visionModel) {
		return null;
	}

	try {
		return normalizeOpenAICompatibleConfig({
			baseUrl,
			apiKey,
			textModel,
			visionModel,
		});
	} catch {
		return null;
	}
}

export function maskedApiKeyIndicator(apiKey: string): string {
	const trimmed = requireNonEmpty(apiKey, "apiKey");
	const prefix = trimmed.startsWith("sk-")
		? "sk-"
		: trimmed.slice(0, Math.min(3, trimmed.length));
	const suffix = trimmed.slice(-4);

	return `OpenAI key configured: ${prefix}...${suffix}`;
}

export class PrismaByokStore implements ByokStore {
	private readonly prisma: PrismaClient;

	constructor(prisma: PrismaClient) {
		this.prisma = prisma;
	}

	async readSettings(
		input: TenantUserInput,
	): Promise<ByokSettingsStoreRow | null> {
		return this.prisma.tenant.findFirst({
			select: {
				byokProviderConfigCiphertext: true,
				byokProviderConfigMaskedIndicator: true,
				localOverrideConfig: true,
			},
			where: {
				id: input.tenantId,
				memberships: {
					some: { userId: input.userId },
				},
			},
		});
	}

	async readByokCiphertext(
		input: TenantInput,
	): Promise<Buffer | Uint8Array | null> {
		const row = await this.prisma.tenant.findUnique({
			select: { byokProviderConfigCiphertext: true },
			where: { id: input.tenantId },
		});

		return row?.byokProviderConfigCiphertext ?? null;
	}

	async saveByok(input: SaveByokStoreInput): Promise<boolean> {
		const result = await this.prisma.tenant.updateMany({
			data: {
				byokProviderConfigCiphertext: Uint8Array.from(input.ciphertext),
				byokProviderConfigMaskedIndicator: input.maskedIndicator,
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

	async clearByok(input: TenantUserInput): Promise<boolean> {
		const result = await this.prisma.tenant.updateMany({
			data: {
				byokProviderConfigCiphertext: null,
				byokProviderConfigMaskedIndicator: null,
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

	async saveLocalOverride(
		input: SaveLocalOverrideStoreInput,
	): Promise<boolean> {
		const result = await this.prisma.tenant.updateMany({
			data: {
				localOverrideConfig: input.config as unknown as Prisma.InputJsonValue,
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

	async clearLocalOverride(input: TenantUserInput): Promise<boolean> {
		const result = await this.prisma.tenant.updateMany({
			data: {
				localOverrideConfig: Prisma.DbNull,
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

async function validateProviderConfig(
	config: OpenAICompatibleProviderConfig,
	options: TenantUserInput & Pick<ByokHelperOptions, "fetch">,
): Promise<void> {
	const provider = new OpenAICompatibleProvider({
		config,
		fetch: options.fetch,
	});

	try {
		await provider.text(validationRequest(options));
	} catch {
		throw new ByokValidationError();
	}
}

function validationRequest(input: TenantUserInput): LLMTextRequest {
	return {
		prompt: 'Return {"ok":true} and no other text.',
		options: {
			tenantId: input.tenantId,
			userId: input.userId,
			locale: "en",
			promptPurpose: "byok.validation",
			kind: "authoring",
			requiresVision: false,
		},
	};
}

function parseEncryptedByokConfig(
	value: string,
): OpenAICompatibleProviderConfig {
	const parsed = JSON.parse(value) as unknown;

	if (!isRecord(parsed)) {
		throw new Error("Encrypted BYOK provider config is invalid.");
	}

	return normalizeByokConfig({
		baseUrl: stringValue(parsed.baseUrl),
		apiKey: stringValue(parsed.apiKey) ?? "",
		textModel: stringValue(parsed.textModel),
		visionModel: stringValue(parsed.visionModel),
	});
}

function byokStore(options: ByokHelperOptions): ByokStore {
	if (options.store) {
		return options.store;
	}

	if (!options.prisma) {
		throw new Error("A ByokStore or PrismaClient is required.");
	}

	return new PrismaByokStore(options.prisma);
}

function requireNonEmpty(value: string | undefined, name: string): string {
	const trimmed = value?.trim();

	if (!trimmed) {
		throw new Error(`${name} is required.`);
	}

	return trimmed;
}

function stringValue(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
