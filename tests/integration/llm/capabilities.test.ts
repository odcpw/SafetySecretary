import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { createRequire, registerHooks } from "node:module";
import { resolve } from "node:path";
import test from "node:test";

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

const require = createRequire(import.meta.url);
const capabilityModulePath = "../../../src/lib/llm/capabilities.ts";
const {
	ALL_CAPABILITIES,
	Capability,
	ProviderMode,
	PrismaCapabilityStore,
	capabilityConfigForTenant,
	containsRawSecretValue,
	prepareCapabilitiesForStorage,
	requireCapability,
} = (await import(
	capabilityModulePath
)) as typeof import("../../../src/lib/llm/capabilities");

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";
const userA = "33333333-3333-4333-8333-333333333333";
const userB = "44444444-4444-4444-8444-444444444444";

test("Capability enum exports the ssfw-5kej v1 surface", () => {
	assert.deepEqual(ALL_CAPABILITIES, [
		"text_llm",
		"vision",
		"image_generation",
		"documents_ingestion",
		"company_memory",
		"tool_calling",
		"voice_stt",
	]);
});

test("defaults mirror OpenAI env for text and Company.visionEnabled for vision", () => {
	const noKeyEnv = { OPENAI_API_KEY: "" };
	const keyEnv = { OPENAI_API_KEY: "configured" };

	assert.deepEqual(
		requireCapability(
			{ visionEnabled: false, capabilities: {} },
			Capability.TextLlm,
			{ env: noKeyEnv },
		),
		{
			ok: false,
			code: "capability_unavailable",
			reason: "text_llm:disabled",
		},
	);
	assert.deepEqual(
		requireCapability(
			{ visionEnabled: false, capabilities: {} },
			Capability.TextLlm,
			{ env: keyEnv },
		),
		{ ok: true, providerMode: "openai_default" },
	);

	assert.equal(
		capabilityConfigForTenant(
			{ visionEnabled: true, capabilities: {} },
			Capability.Vision,
			{ env: noKeyEnv },
		).enabled,
		false,
	);
	assert.deepEqual(
		requireCapability(
			{ visionEnabled: true, capabilities: {} },
			Capability.Vision,
			{ env: noKeyEnv },
		),
		{
			ok: false,
			code: "capability_unavailable",
			reason: "vision:disabled",
		},
	);
	assert.deepEqual(
		requireCapability(
			{ visionEnabled: true, capabilities: {} },
			Capability.Vision,
			{ env: keyEnv },
		),
		{ ok: true, providerMode: "openai_default" },
	);
	assert.deepEqual(
		requireCapability(
			{
				visionEnabled: false,
				capabilities: {
					vision: capability({
						provider_mode: ProviderMode.OpenaiDefault,
					}),
				},
			},
			Capability.Vision,
			{ env: keyEnv },
		),
		{
			ok: false,
			code: "capability_unavailable",
			reason: "vision:disabled",
		},
	);
	const disabledVisionConfig = capabilityConfigForTenant(
		{
			visionEnabled: false,
			capabilities: {
				vision: capability({
					provider_mode: ProviderMode.OpenaiDefault,
				}),
			},
		},
		Capability.Vision,
		{ env: keyEnv },
	);
	assert.equal(disabledVisionConfig.enabled, false);
	assert.equal(disabledVisionConfig.provider_mode, ProviderMode.Disabled);
});

test("requireCapability accepts configured fixture modes and rejects unavailable modes", () => {
	const env = { OPENAI_API_KEY: "configured" };
	const tenant = {
		visionEnabled: true,
		capabilities: {
			text_llm: capability({
				provider_mode: ProviderMode.OpenaiDefault,
			}),
			image_generation: capability({
				provider_mode: ProviderMode.Byok,
				credential_ref: "credential:tenant-a:image-gen",
			}),
			documents_ingestion: capability({
				provider_mode: ProviderMode.LocalEndpoint,
				endpoint_ref: "endpoint:tenant-a:docs",
			}),
			company_memory: capability({
				enabled: false,
				provider_mode: ProviderMode.Disabled,
			}),
			tool_calling: capability({
				provider_mode: ProviderMode.Byok,
				credential_ref: null,
			}),
			voice_stt: capability({
				provider_mode: ProviderMode.LocalEndpoint,
				endpoint_ref: null,
			}),
		},
	};

	assert.deepEqual(requireCapability(tenant, Capability.TextLlm, { env }), {
		ok: true,
		providerMode: "openai_default",
	});
	assert.deepEqual(
		requireCapability(tenant, Capability.ImageGeneration, { env }),
		{
			ok: true,
			providerMode: "byok",
			providerRef: "credential:tenant-a:image-gen",
		},
	);
	assert.deepEqual(
		requireCapability(tenant, Capability.DocumentsIngestion, { env }),
		{
			ok: true,
			providerMode: "local_endpoint",
			providerRef: "endpoint:tenant-a:docs",
		},
	);
	assert.deepEqual(
		requireCapability(tenant, Capability.CompanyMemory, { env }),
		{
			ok: false,
			code: "capability_unavailable",
			reason: "company_memory:disabled",
		},
	);
	assert.deepEqual(requireCapability(tenant, Capability.ToolCalling, { env }), {
		ok: false,
		code: "capability_unavailable",
		reason: "tool_calling:byok_missing_credential_ref",
	});
	assert.deepEqual(requireCapability(tenant, Capability.VoiceStt, { env }), {
		ok: false,
		code: "capability_unavailable",
		reason: "voice_stt:local_endpoint_missing_endpoint_ref",
	});
});

test("stored invalid provider_mode fails closed instead of defaulting", () => {
	const env = { OPENAI_API_KEY: "configured" };
	const tenant = {
		visionEnabled: true,
		capabilities: {
			text_llm: capability({ provider_mode: "anthropic" }),
			vision: capability({ provider_mode: "vision_default" }),
		},
	};

	assert.deepEqual(requireCapability(tenant, Capability.TextLlm, { env }), {
		ok: false,
		code: "capability_unavailable",
		reason: "text_llm:invalid_config",
	});
	assert.deepEqual(requireCapability(tenant, Capability.Vision, { env }), {
		ok: false,
		code: "capability_unavailable",
		reason: "vision:invalid_config",
	});
	assert.equal(
		capabilityConfigForTenant(tenant, Capability.TextLlm, { env })
			.invalid_reason,
		"invalid_config",
	);
	assert.throws(
		() =>
			prepareCapabilitiesForStorage({
				text_llm: capability({ provider_mode: "anthropic" }),
			}),
		/invalid_config/,
	);
});

test("disabled vision capability suppresses ssfw-ito consumers at helper boundary", () => {
	assert.deepEqual(
		requireCapability(
			{
				visionEnabled: true,
				capabilities: {
					vision: capability({
						enabled: false,
						provider_mode: ProviderMode.Disabled,
					}),
				},
			},
			Capability.Vision,
			{ env: { OPENAI_API_KEY: "configured" } },
		),
		{
			ok: false,
			code: "capability_unavailable",
			reason: "vision:disabled",
		},
	);
});

test("capabilities JSONB preparation rejects raw key, token, and URL shapes", () => {
	const rawOpenAiKey = ["sk", "deliberate-canary-00000000"].join("-");
	const rawBotToken = ["xoxb", "deliberate", "00000000"].join("-");
	const apiKeyField = ["api", "Key"].join("");
	const tokenField = ["to", "ken"].join("");
	const rawEndpointUrl = "https://llm.example.invalid/v1";
	const safe = prepareCapabilitiesForStorage({
		text_llm: capability({
			provider_mode: ProviderMode.Byok,
			credential_ref: "credential:tenant-a:text",
		}),
		vision: capability({
			provider_mode: ProviderMode.LocalEndpoint,
			endpoint_ref: "endpoint:tenant-a:vision",
		}),
	});

	assert.equal(JSON.stringify(safe).includes("credential:tenant-a:text"), true);
	assert.equal(containsRawSecretValue(safe), false);

	assert.throws(
		() =>
			prepareCapabilitiesForStorage({
				text_llm: capability({
					provider_mode: ProviderMode.Byok,
					credential_ref: rawOpenAiKey,
				}),
			}),
		/raw secret-like key\/token\/url/,
	);
	assert.throws(
		() =>
			prepareCapabilitiesForStorage({
				text_llm: {
					...capability({ provider_mode: ProviderMode.Byok }),
					[apiKeyField]: "placeholder",
				},
			}),
		/raw secret-like key\/token\/url/,
	);
	assert.throws(
		() =>
			prepareCapabilitiesForStorage({
				vision: capability({
					provider_mode: ProviderMode.LocalEndpoint,
					endpoint_ref: rawEndpointUrl,
				}),
			}),
		/raw secret-like key\/token\/url/,
	);
	assert.equal(containsRawSecretValue({ [tokenField]: rawBotToken }), true);
});

test("capabilities JSONB preparation rejects provider modes missing opaque refs", () => {
	assert.throws(
		() =>
			prepareCapabilitiesForStorage({
				tool_calling: capability({
					provider_mode: ProviderMode.Byok,
					credential_ref: null,
				}),
			}),
		/byok requires credential_ref/,
	);
	assert.throws(
		() =>
			prepareCapabilitiesForStorage({
				voice_stt: capability({
					provider_mode: ProviderMode.LocalEndpoint,
					endpoint_ref: null,
				}),
			}),
		/local_endpoint requires endpoint_ref/,
	);
	assert.throws(
		() =>
			prepareCapabilitiesForStorage({
				text_llm: capability({
					provider_mode: ProviderMode.Byok,
					credential_ref: "vault-key-id",
				}),
			}),
		/credential_ref must be opaque/,
	);
	assert.throws(
		() =>
			prepareCapabilitiesForStorage({
				documents_ingestion: capability({
					provider_mode: ProviderMode.LocalEndpoint,
					endpoint_ref: "local-llm",
				}),
			}),
		/endpoint_ref must be opaque/,
	);
	assert.throws(
		() =>
			prepareCapabilitiesForStorage({
				image_generation: capability({
					enabled: false,
					provider_mode: ProviderMode.Byok,
					credential_ref: null,
				}),
			}),
		/byok requires credential_ref/,
	);
	assert.throws(
		() =>
			prepareCapabilitiesForStorage({
				documents_ingestion: capability({
					enabled: false,
					provider_mode: ProviderMode.LocalEndpoint,
					endpoint_ref: null,
				}),
			}),
		/local_endpoint requires endpoint_ref/,
	);
});

test("direct persisted raw key and raw URL JSONB fail closed on read paths", () => {
	const rawOpenAiKey = ["sk", "persisted-canary-00000000"].join("-");
	const rawEndpointUrl = "https://llm.example.invalid/v1";

	assert.deepEqual(
		requireCapability(
			{
				visionEnabled: true,
				capabilities: {
					image_generation: capability({
						provider_mode: ProviderMode.Byok,
						credential_ref: rawOpenAiKey,
					}),
				},
			},
			Capability.ImageGeneration,
			{ env: { OPENAI_API_KEY: "configured" } },
		),
		{
			ok: false,
			code: "capability_unavailable",
			reason: "image_generation:invalid_config",
		},
	);
	assert.deepEqual(
		requireCapability(
			{
				visionEnabled: true,
				capabilities: {
					documents_ingestion: capability({
						provider_mode: ProviderMode.LocalEndpoint,
						endpoint_ref: rawEndpointUrl,
					}),
				},
			},
			Capability.DocumentsIngestion,
			{ env: { OPENAI_API_KEY: "configured" } },
		),
		{
			ok: false,
			code: "capability_unavailable",
			reason: "documents_ingestion:invalid_config",
		},
	);
	assert.equal(
		capabilityConfigForTenant(
			{
				visionEnabled: true,
				capabilities: {
					text_llm: capability({
						provider_mode: ProviderMode.Byok,
						credential_ref: rawOpenAiKey,
					}),
				},
			},
			Capability.TextLlm,
		).credential_ref,
		null,
	);
});

test("PrismaCapabilityStore scopes reads and writes by tenant membership", async () => {
	const prisma = new MemoryPrisma({
		[tenantA]: {
			id: tenantA,
			visionEnabled: true,
			capabilities: {},
			memberUserIds: [userA],
		},
		[tenantB]: {
			id: tenantB,
			visionEnabled: false,
			capabilities: {},
			memberUserIds: [userB],
		},
	});
	const store = new PrismaCapabilityStore(prisma as never);

	assert.equal(
		await store.readTenantCapabilities({ tenantId: tenantB, userId: userA }),
		null,
	);
	assert.equal(
		await store.updateTenantCapabilities({
			tenantId: tenantB,
			userId: userA,
			capabilities: {
				text_llm: capability({
					provider_mode: ProviderMode.Byok,
					credential_ref: "credential:cross-tenant-write",
				}),
			},
		}),
		false,
	);
	assert.deepEqual(prisma.rows[tenantB]?.capabilities, {});

	const ownRead = await store.readTenantCapabilities({
		tenantId: tenantA,
		userId: userA,
	});
	assert.equal(ownRead?.id, tenantA);
	assert.equal(
		await store.updateTenantCapabilities({
			tenantId: tenantA,
			userId: userA,
			capabilities: {
				text_llm: capability({
					provider_mode: ProviderMode.Byok,
					credential_ref: "credential:tenant-a:text",
				}),
			},
		}),
		true,
	);
	assert.equal(
		(
			prisma.rows[tenantA]?.capabilities as Record<
				string,
				Record<string, string>
			>
		).text_llm?.credential_ref,
		"credential:tenant-a:text",
	);
});

if (!process.env.DATABASE_URL) {
	test("ssfw-19k DB tenancy harness boundary for capability store", {
		skip: "DATABASE_URL is not set; live shared.tenant_memberships capability isolation was not run.",
	});
} else {
	test("PrismaCapabilityStore scopes capabilities through real ssfw-19k membership rows", async () => {
		const { PrismaClient } = (await import(
			"@prisma/client"
		)) as typeof import("@prisma/client");
		const prisma = new PrismaClient();
		const store = new PrismaCapabilityStore(prisma);
		const suffix = randomUUID();
		const tenantAId = randomUUID();
		const tenantBId = randomUUID();
		const userAId = randomUUID();
		const userBId = randomUUID();
		const tenantIds = [tenantAId, tenantBId];
		const userIds = [userAId, userBId];

		try {
			await prisma.user.createMany({
				data: [
					{
						id: userAId,
						email: `ssfw-5kej-a-${suffix}@example.invalid`,
					},
					{
						id: userBId,
						email: `ssfw-5kej-b-${suffix}@example.invalid`,
					},
				],
			});
			await prisma.tenant.create({
				data: {
					id: tenantAId,
					name: `ssfw-5kej A ${suffix}`,
					defaultLanguage: "en",
					capabilities: {},
					memberships: { create: { userId: userAId } },
				},
			});
			await prisma.tenant.create({
				data: {
					id: tenantBId,
					name: `ssfw-5kej B ${suffix}`,
					defaultLanguage: "en",
					capabilities: {},
					memberships: { create: { userId: userBId } },
				},
			});

			assert.equal(
				await store.readTenantCapabilities({
					tenantId: tenantBId,
					userId: userAId,
				}),
				null,
			);
			assert.equal(
				await store.updateTenantCapabilities({
					tenantId: tenantBId,
					userId: userAId,
					capabilities: {
						text_llm: capability({
							provider_mode: ProviderMode.Byok,
							credential_ref: "credential:tenant-b:blocked",
						}),
					},
				}),
				false,
			);
			assert.deepEqual(
				(
					await prisma.tenant.findUnique({
						select: { capabilities: true },
						where: { id: tenantBId },
					})
				)?.capabilities,
				{},
			);
		} finally {
			await prisma.tenantMembership.deleteMany({
				where: { tenantId: { in: tenantIds } },
			});
			await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
			await prisma.user.deleteMany({ where: { id: { in: userIds } } });
			await prisma.$disconnect();
		}
	});
}

test("schema and migration expose shared.tenants.capabilities JSONB default", () => {
	const schema = readFileSync("prisma/schema.prisma", "utf8");
	const sql = readFileSync("db/sql/00080_tenant_capabilities.sql", "utf8");

	assert.match(schema, /capabilities\s+Json\s+@default\("\{\}"\)/);
	assert.match(
		sql,
		/ADD COLUMN IF NOT EXISTS "capabilities" jsonb NOT NULL DEFAULT '\{\}'::jsonb/,
	);
	assert.match(sql, /tenants_capabilities_is_object/);
	assert.match(sql, /tenants_capabilities_no_raw_provider_material/);
	assert.match(sql, /https\?:\/\//);
	assert.match(sql, /Raw provider keys\/tokens\/URLs are forbidden/);
	assert.match(sql, /runtime storage writes concrete capability entries/);
});

test("settings capabilities page compiles and renders a read-only dark-compatible matrix", () => {
	const tmpDir = ".tmp/ssfw-5kej-page-smoke";
	rmSync(tmpDir, { recursive: true, force: true });

	const result = spawnSync(
		"pnpm",
		[
			"exec",
			"tsc",
			"--ignoreConfig",
			"--outDir",
			tmpDir,
			"--module",
			"commonjs",
			"--moduleResolution",
			"node",
			"--ignoreDeprecations",
			"6.0",
			"--target",
			"ES2022",
			"--lib",
			"dom,dom.iterable,esnext",
			"--jsx",
			"react-jsx",
			"--esModuleInterop",
			"--skipLibCheck",
			"--strict",
			"src/app/workspace/settings/capabilities/page.tsx",
			"src/lib/llm/capabilities.ts",
		],
		{ encoding: "utf8" },
	);
	assert.equal(
		result.status,
		0,
		`settings page compile failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
	);

	const pageModule = require(
		resolve(`${tmpDir}/app/workspace/settings/capabilities/page.js`),
	) as typeof import("../../../src/app/workspace/settings/capabilities/page");
	const { renderToStaticMarkup } =
		require("react-dom/server") as typeof import("react-dom/server");
	const rows = pageModule.buildCapabilityRows(
		{
			visionEnabled: true,
			capabilities: {
				image_generation: capability({
					provider_mode: ProviderMode.Byok,
					credential_ref: "credential:tenant-a:image-gen",
				}),
				documents_ingestion: capability({
					provider_mode: ProviderMode.LocalEndpoint,
					endpoint_ref: "endpoint:tenant-a:docs",
				}),
			},
		},
		{ env: { OPENAI_API_KEY: "configured" } },
	);
	const markup = renderToStaticMarkup(
		pageModule.CapabilityMatrixPanel({ rows }),
	);

	assert.match(markup, /Capability matrix/);
	assert.match(markup, /Provider gates/);
	assert.match(markup, /Text LLM drafting/);
	assert.match(markup, /Not yet supported/);
	assert.match(markup, /var\(--color-surface\)/);
	assert.doesNotMatch(markup, /<button\b|<input\b/i);
	assert.doesNotMatch(markup, /credential:tenant-a|endpoint:tenant-a/);
	assert.equal(pageModule.isValidCapabilitySettingsUuid(tenantA), true);
	assert.equal(
		pageModule.isValidCapabilitySettingsUuid(
			"11111111-1111-4111-8111111111111111",
		),
		false,
	);
	rmSync(tmpDir, { recursive: true, force: true });
});

function capability(
	overrides: Partial<{
		enabled: boolean;
		provider_mode: string;
		credential_ref: string | null;
		endpoint_ref: string | null;
		configured_at: string | null;
		configured_by_user_id: string | null;
		data_handling_note_ref: string | null;
	}> = {},
) {
	return {
		enabled: true,
		provider_mode: ProviderMode.OpenaiDefault,
		credential_ref: null,
		endpoint_ref: null,
		configured_at: "2026-05-05T10:00:00.000Z",
		configured_by_user_id: userA,
		data_handling_note_ref: "data-handling:default:v1",
		...overrides,
	};
}

type MemoryTenant = {
	id: string;
	visionEnabled: boolean;
	capabilities: unknown;
	memberUserIds: readonly string[];
};

class MemoryPrisma {
	readonly rows: Record<string, MemoryTenant>;
	readonly tenant: {
		findFirst: (args: {
			select: Record<string, boolean>;
			where: { id: string; memberships: { some: { userId: string } } };
		}) => Promise<TenantProjection | null>;
		updateMany: (args: {
			data: { capabilities: unknown };
			where: { id: string; memberships: { some: { userId: string } } };
		}) => Promise<{ count: number }>;
	};

	constructor(rows: Record<string, MemoryTenant>) {
		this.rows = rows;
		this.tenant = {
			findFirst: async (args) => this.findFirst(args),
			updateMany: async (args) => this.updateMany(args),
		};
	}

	private findFirst(args: {
		select: Record<string, boolean>;
		where: { id: string; memberships: { some: { userId: string } } };
	}): TenantProjection | null {
		const row = this.rows[args.where.id];
		const userId = args.where.memberships.some.userId;

		if (!row?.memberUserIds.includes(userId)) {
			return null;
		}

		return {
			id: row.id,
			visionEnabled: row.visionEnabled,
			capabilities: row.capabilities,
		};
	}

	private updateMany(args: {
		data: { capabilities: unknown };
		where: { id: string; memberships: { some: { userId: string } } };
	}): { count: number } {
		const row = this.rows[args.where.id];
		const userId = args.where.memberships.some.userId;

		if (!row?.memberUserIds.includes(userId)) {
			return { count: 0 };
		}

		row.capabilities = args.data.capabilities;
		return { count: 1 };
	}
}

type TenantProjection = {
	id: string;
	visionEnabled: boolean;
	capabilities: unknown;
};
