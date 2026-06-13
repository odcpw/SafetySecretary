import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import type {
	ByokSettingsStoreRow,
	ByokStore,
	SaveByokStoreInput,
	SaveLocalOverrideStoreInput,
	TenantInput,
	TenantUserInput,
} from "../../../src/lib/llm/byok";
import type { LLMTextRequest } from "../../../src/lib/llm/types";

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

const byokModulePath = "../../../src/lib/llm/byok.ts";
const cryptoModulePath = "../../../src/lib/crypto/master-key.ts";
const compatibleModulePath = "../../../src/lib/llm/openai-compatible.ts";

const {
	ByokValidationError,
	clearByokProviderConfig,
	clearLocalOverrideConfig,
	createByokProviderForTenant,
	maskedApiKeyIndicator,
	readByokSettings,
	saveByokProviderConfig,
	saveLocalOverrideConfig,
} = (await import(
	byokModulePath
)) as typeof import("../../../src/lib/llm/byok");
const { decryptWithMasterKey, encryptWithMasterKey } = (await import(
	cryptoModulePath
)) as typeof import("../../../src/lib/crypto/master-key");
const { OpenAICompatibleProvider } = (await import(
	compatibleModulePath
)) as typeof import("../../../src/lib/llm/openai-compatible");

const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const masterKey = Buffer.alloc(32, 9);
const apiKey = "sk-test-byok-abc4";
const originalNodeEnv = process.env.NODE_ENV;
const originalValidationFlag = process.env.LLM_VALIDATION_OK;
const originalMasterKey = process.env.MASTER_ENCRYPTION_KEY;
const originalLlmApiKey = process.env.LLM_API_KEY;

type CapturedRequest = {
	url: string;
	headers: Headers;
	body: Record<string, unknown>;
};

test.afterEach(() => {
	setOptionalEnv("NODE_ENV", originalNodeEnv);
	setOptionalEnv("LLM_VALIDATION_OK", originalValidationFlag);
	setOptionalEnv("MASTER_ENCRYPTION_KEY", originalMasterKey);
	setOptionalEnv("LLM_API_KEY", originalLlmApiKey);
});

test("master-key encrypt/decrypt round trip uses random IV and keeps plaintext out of ciphertext", () => {
	const first = encryptWithMasterKey(apiKey, { key: masterKey });
	const second = encryptWithMasterKey(apiKey, { key: masterKey });

	assert.notEqual(first.toString("utf8"), second.toString("utf8"));
	assert.equal(decryptWithMasterKey(first, { key: masterKey }), apiKey);
	assert.equal(decryptWithMasterKey(second, { key: masterKey }), apiKey);
	assert.equal(first.toString("utf8").includes(apiKey), false);
});

test("schema and SQL expose ciphertext, masked indicator, and plaintext local override fields", () => {
	const schema = readFileSync("prisma/schema.prisma", "utf8");
	const sql = readFileSync("db/sql/00060_byok_local_override.sql", "utf8");

	assert.match(schema, /byokProviderConfigCiphertext\s+Bytes\?/);
	assert.match(schema, /@map\("byok_provider_config_ciphertext"\)/);
	assert.match(schema, /byokProviderConfigMaskedIndicator\s+String\?/);
	assert.match(schema, /localOverrideConfig\s+Json\?/);
	assert.match(sql, /"byok_provider_config_ciphertext" bytea NULL/);
	assert.match(sql, /"byok_provider_config_masked_indicator" text NULL/);
	assert.match(sql, /"local_override_config" jsonb NULL/);
});

test("OpenAICompatibleProvider is blocked in default test mode", () => {
	setOptionalEnv("NODE_ENV", "test");
	setOptionalEnv("LLM_VALIDATION_OK", undefined);

	assert.throws(
		() =>
			new OpenAICompatibleProvider({
				baseUrl: "http://127.0.0.1:11434/v1",
				textModel: "gemma-text",
				visionModel: "gemma-vision",
				fetch: async () => jsonResponse({}),
			}),
		/OpenAICompatibleProvider blocked/,
	);
});

test("OpenAICompatibleProvider posts to mocked loopback and extracts JSON from loose content", async () => {
	allowRealProviderInTest();
	const captured: CapturedRequest[] = [];
	const provider = new OpenAICompatibleProvider({
		baseUrl: "http://127.0.0.1:11434/v1",
		apiKey,
		textModel: "gemma-text",
		visionModel: "gemma-vision",
		fetch: mockFetch(captured, {
			model: "gemma-text",
			choices: [
				{
					message: {
						content: 'Sure, here is JSON:\n{"status":"ok","items":[1]}',
					},
				},
			],
			usage: { prompt_tokens: 3, completion_tokens: 4 },
		}),
	});

	const response = await provider.text(textRequest());

	assert.equal(response.text, '{"status":"ok","items":[1]}');
	assert.equal(response.model, "gemma-text");
	assert.equal(response.provider, "compatible:127.0.0.1:11434");
	assert.deepEqual(response.usage, { inputTokens: 3, outputTokens: 4 });
	assert.equal(captured.length, 1);
	assert.equal(captured[0].url, "http://127.0.0.1:11434/v1/chat/completions");
	assert.equal(captured[0].headers.get("authorization"), `Bearer ${apiKey}`);
	assert.equal(JSON.stringify(captured[0].body).includes(apiKey), false);
	assert.equal(captured[0].body.model, "gemma-text");
});

test("BYOK save validates with mocked provider, stores ciphertext only, and renders a stored mask", async () => {
	allowRealProviderInTest();
	const store = new MemoryByokStore();
	const captured: CapturedRequest[] = [];

	const saved = await saveByokProviderConfig(
		{
			tenantId,
			userId,
			config: {
				baseUrl: "http://127.0.0.1:11434/v1",
				apiKey,
				textModel: "gemma-text",
				visionModel: "gemma-vision",
			},
		},
		{
			store,
			masterKey,
			fetch: mockFetch(captured, {
				model: "gemma-text",
				choices: [{ message: { content: '{"ok":true}' } }],
			}),
		},
	);

	assert.equal(saved, true);
	assert.equal(captured.length, 1);
	assert.ok(store.row.byokProviderConfigCiphertext);
	assert.equal(
		Buffer.from(store.row.byokProviderConfigCiphertext ?? []).includes(apiKey),
		false,
	);
	assert.equal(
		String(store.row.byokProviderConfigCiphertext).includes(apiKey),
		false,
	);
	assert.equal(
		store.row.byokProviderConfigMaskedIndicator,
		"OpenAI key configured: sk-...abc4",
	);

	const state = await readByokSettings({ tenantId, userId }, { store });
	assert.deepEqual(state, {
		hasByokProviderConfig: true,
		maskedIndicator: "OpenAI key configured: sk-...abc4",
		localOverrideConfig: null,
	});
});

test("invalid BYOK validation rejects without storing ciphertext", async () => {
	allowRealProviderInTest();
	const store = new MemoryByokStore();

	await assert.rejects(
		saveByokProviderConfig(
			{
				tenantId,
				userId,
				config: {
					baseUrl: "http://127.0.0.1:11434/v1",
					apiKey,
					textModel: "gemma-text",
					visionModel: "gemma-vision",
				},
			},
			{
				store,
				masterKey,
				fetch: async () => jsonResponse({ error: "invalid" }, 401),
			},
		),
		ByokValidationError,
	);

	assert.equal(store.row.byokProviderConfigCiphertext, null);
	assert.equal(store.row.byokProviderConfigMaskedIndicator, null);
});

test("BYOK provider decrypts only to construct provider and clear resets the row", async () => {
	allowRealProviderInTest();
	const store = new MemoryByokStore();
	await saveByokProviderConfig(
		{
			tenantId,
			userId,
			config: {
				baseUrl: "http://127.0.0.1:11434/v1",
				apiKey,
				textModel: "gemma-text",
				visionModel: "gemma-vision",
			},
		},
		{
			store,
			masterKey,
			fetch: mockFetch([], {
				model: "gemma-text",
				choices: [{ message: { content: '{"ok":true}' } }],
			}),
		},
	);
	const captured: CapturedRequest[] = [];
	const provider = await createByokProviderForTenant(
		{ tenantId },
		{
			store,
			masterKey,
			fetch: mockFetch(captured, {
				model: "gemma-text",
				choices: [{ message: { content: '{"answer":"ok"}' } }],
			}),
		},
	);

	assert.ok(provider);
	await provider.text(textRequest());
	assert.equal(captured[0].headers.get("authorization"), `Bearer ${apiKey}`);
	assert.equal(
		await clearByokProviderConfig({ tenantId, userId }, { store }),
		true,
	);
	assert.equal(store.row.byokProviderConfigCiphertext, null);
	assert.equal(store.row.byokProviderConfigMaskedIndicator, null);
});

test("local override config is validated, stored as plaintext operator config, and cleared", async () => {
	const store = new MemoryByokStore();

	assert.equal(
		await saveLocalOverrideConfig(
			{
				tenantId,
				userId,
				config: {
					baseUrl: "http://localhost:11434/v1",
					apiKey: "placeholder",
					textModel: "gemma-text",
					visionModel: "gemma-vision",
				},
			},
			{ store },
		),
		true,
	);

	let state = await readByokSettings({ tenantId, userId }, { store });
	assert.deepEqual(state?.localOverrideConfig, {
		baseUrl: "http://localhost:11434/v1",
		apiKey: "placeholder",
		textModel: "gemma-text",
		visionModel: "gemma-vision",
	});

	assert.equal(
		await saveLocalOverrideConfig(
			{
				tenantId,
				userId,
				config: { baseUrl: "not-a-url", textModel: "x", visionModel: "y" },
			},
			{ store },
		),
		false,
	);
	assert.equal(
		await clearLocalOverrideConfig({ tenantId, userId }, { store }),
		true,
	);
	state = await readByokSettings({ tenantId, userId }, { store });
	assert.equal(state?.localOverrideConfig, null);
});

test("masked indicator keeps only the configured suffix outside ciphertext", () => {
	assert.equal(
		maskedApiKeyIndicator(apiKey),
		"OpenAI key configured: sk-...abc4",
	);
});

class MemoryByokStore implements ByokStore {
	readonly memberships = new Set([`${tenantId}:${userId}`]);
	row: ByokSettingsStoreRow = {
		byokProviderConfigCiphertext: null,
		byokProviderConfigMaskedIndicator: null,
		localOverrideConfig: null,
	};

	async readSettings(
		input: TenantUserInput,
	): Promise<ByokSettingsStoreRow | null> {
		return this.memberships.has(`${input.tenantId}:${input.userId}`)
			? this.row
			: null;
	}

	async readByokCiphertext(
		_input: TenantInput,
	): Promise<Buffer | Uint8Array | null> {
		return this.row.byokProviderConfigCiphertext;
	}

	async saveByok(input: SaveByokStoreInput): Promise<boolean> {
		if (!this.memberships.has(`${input.tenantId}:${input.userId}`)) {
			return false;
		}

		this.row = {
			...this.row,
			byokProviderConfigCiphertext: input.ciphertext,
			byokProviderConfigMaskedIndicator: input.maskedIndicator,
		};
		return true;
	}

	async clearByok(input: TenantUserInput): Promise<boolean> {
		if (!this.memberships.has(`${input.tenantId}:${input.userId}`)) {
			return false;
		}

		this.row = {
			...this.row,
			byokProviderConfigCiphertext: null,
			byokProviderConfigMaskedIndicator: null,
		};
		return true;
	}

	async saveLocalOverride(
		input: SaveLocalOverrideStoreInput,
	): Promise<boolean> {
		if (!this.memberships.has(`${input.tenantId}:${input.userId}`)) {
			return false;
		}

		this.row = {
			...this.row,
			localOverrideConfig: input.config,
		};
		return true;
	}

	async clearLocalOverride(input: TenantUserInput): Promise<boolean> {
		if (!this.memberships.has(`${input.tenantId}:${input.userId}`)) {
			return false;
		}

		this.row = {
			...this.row,
			localOverrideConfig: null,
		};
		return true;
	}
}

function textRequest(): LLMTextRequest {
	return {
		prompt: "Return JSON.",
		options: {
			tenantId,
			userId,
			locale: "en",
			promptPurpose: "byok.test",
			kind: "authoring",
			requiresVision: false,
		},
	};
}

function mockFetch(
	captured: CapturedRequest[],
	responseBody: Record<string, unknown>,
): typeof fetch {
	return async (url, init) => {
		const headers = new Headers(init?.headers);
		const body = JSON.parse(String(init?.body)) as Record<string, unknown>;

		captured.push({
			url: String(url),
			headers,
			body,
		});
		return jsonResponse(responseBody);
	};
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function allowRealProviderInTest() {
	setOptionalEnv("NODE_ENV", "test");
	setOptionalEnv("LLM_VALIDATION_OK", "1");
}

function setOptionalEnv(name: string, value: string | undefined) {
	if (value === undefined) {
		delete process.env[name];
	} else {
		process.env[name] = value;
	}
}
