import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
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
import type { VisionCallAuditInput } from "../../../src/lib/llm/audit";

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

const dispatchModulePath = "../../../src/lib/llm/dispatch.ts";
const { DispatchErrorCode, dispatch } = (await import(
	dispatchModulePath
)) as typeof import("../../../src/lib/llm/dispatch");

const tenantId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const workflowId = "33333333-3333-4333-8333-333333333333";
const photoBytes = Buffer.from("dispatch-photo-bytes");

test("Step 0 blocks company-off vision before provider selection", async () => {
	const store = new MemoryDispatchStore({ visionEnabled: false });
	const provider = new RecordingProvider("mock");
	const audits: VisionCallAuditInput[] = [];

	const result = await dispatch(visionRequest(), {
		store,
		env: { NODE_ENV: "test" },
		mockProvider: provider,
		recordVisionCall: (audit) => audits.push(audit),
	});

	assert.equal(result.ok, false);
	assert.equal(result.ok ? "" : result.code, "vision_unavailable_company");
	assert.equal(provider.visionInvocations, 0);
	assert.equal(store.providerSettingsReads, 0);
	assert.equal(store.workflowConsentReads, 0);
	assert.equal(audits.length, 0);
});

test("Step 0 blocks NEVER consent before provider invocation", async () => {
	const store = new MemoryDispatchStore({
		visionEnabled: true,
		visionConsent: "NEVER",
	});
	const provider = new RecordingProvider("mock");

	const result = await dispatch(visionRequest(), {
		store,
		env: { NODE_ENV: "test" },
		mockProvider: provider,
		recordVisionCall: () => {
			throw new Error("audit must not be written on blocked paths");
		},
	});

	assert.equal(result.ok, false);
	assert.equal(result.ok ? "" : result.code, "vision_unavailable_workflow");
	assert.equal(provider.visionInvocations, 0);
});

test("Step 0 returns deferred modal for ASK until consent is granted", async () => {
	const store = new MemoryDispatchStore({
		visionEnabled: true,
		visionConsent: "ASK",
	});
	const provider = new RecordingProvider("mock");

	const result = await dispatch(visionRequest(), {
		store,
		env: { NODE_ENV: "test" },
		mockProvider: provider,
		recordVisionCall: () => {
			throw new Error("audit must not be written while deferred");
		},
	});

	assert.deepEqual(result, {
		ok: false,
		code: DispatchErrorCode.VisionConsentRequired,
		deferred: "vision_consent_modal",
		message: "Vision consent is required before sending photos.",
		workflowId,
	});
	assert.equal(provider.visionInvocations, 0);
});

test("ALWAYS and just-granted ASK consent proceed and audit successful vision", async () => {
	for (const [visionConsent, justGranted] of [
		["ALWAYS", false],
		["ASK", true],
	] as const) {
		const store = new MemoryDispatchStore({ visionEnabled: true, visionConsent });
		const provider = new RecordingProvider("mock");
		const audits: VisionCallAuditInput[] = [];

		const result = await dispatch(visionRequest(), {
			store,
			env: { NODE_ENV: "test" },
			mockProvider: provider,
			justGrantedVisionConsent: justGranted,
			recordVisionCall: (audit) => audits.push(audit),
		});

		assert.equal(result.ok, true);
		assert.equal(result.ok ? result.providerStep : "", "mock");
		assert.equal(provider.visionInvocations, 1);
		assert.equal(audits.length, 1);
		assert.equal(audits[0].photoHash, sha256Hex(photoBytes));
		assert.equal(JSON.stringify(audits[0]).includes("dispatch-photo-bytes"), false);
	}
});

test("text dispatch skips Step 0 entirely", async () => {
	const store = new MemoryDispatchStore({
		failIfCompanyVisionRead: true,
		failIfWorkflowConsentRead: true,
	});
	const provider = new RecordingProvider("mock");

	const result = await dispatch(textRequest(), {
		store,
		env: { NODE_ENV: "test" },
		mockProvider: provider,
	});

	assert.equal(result.ok, true);
	assert.equal(result.ok ? result.providerStep : "", "mock");
	assert.equal(provider.textInvocations, 1);
	assert.equal(store.companyVisionReads, 0);
	assert.equal(store.workflowConsentReads, 0);
});

test("provider selection order is mock, local override, BYOK, self-host, hosted SaaS", async () => {
	const mock = new RecordingProvider("mock");
	const mockResult = await dispatch(textRequest(), {
		store: new MemoryDispatchStore({
			providerSettings: {
				localOverrideConfig: { baseUrl: "http://local.test/v1" },
				hasByokProviderConfig: true,
			},
		}),
		env: { NODE_ENV: "test", LLM_BASE_URL: "http://self-host.test/v1" },
		mockProvider: mock,
		createLocalOverrideProvider: () => {
			throw new Error("mock must win before local override");
		},
	});
	assert.equal(mockResult.ok ? mockResult.providerStep : "", "mock");

	const localCalls: string[] = [];
	const localResult = await dispatch(textRequest(), {
		store: new MemoryDispatchStore({
			providerSettings: {
				localOverrideConfig: { enabled: true },
				hasByokProviderConfig: true,
			},
		}),
		env: { NODE_ENV: "development", LLM_BASE_URL: "http://self-host.test/v1" },
		createLocalOverrideProvider: () => {
			localCalls.push("local");
			return new RecordingProvider("local");
		},
		createByokProvider: async () => {
			localCalls.push("byok");
			return new RecordingProvider("byok");
		},
	});
	assert.equal(localResult.ok ? localResult.providerStep : "", "localOverride");
	assert.deepEqual(localCalls, ["local"]);

	const byokCalls: string[] = [];
	const byokResult = await dispatch(textRequest(), {
		store: new MemoryDispatchStore({
			providerSettings: {
				localOverrideConfig: null,
				hasByokProviderConfig: true,
			},
		}),
		env: { NODE_ENV: "development", LLM_BASE_URL: "http://self-host.test/v1" },
		createLocalOverrideProvider: () => {
			byokCalls.push("local");
			return null;
		},
		createByokProvider: async () => {
			byokCalls.push("byok");
			return new RecordingProvider("byok");
		},
	});
	assert.equal(byokResult.ok ? byokResult.providerStep : "", "byok");
	assert.deepEqual(byokCalls, ["local", "byok"]);

	const selfCalls: string[] = [];
	const selfHostedResult = await dispatch(textRequest(), {
		store: new MemoryDispatchStore({
			providerSettings: {
				localOverrideConfig: null,
				hasByokProviderConfig: false,
			},
		}),
		env: { NODE_ENV: "development", LLM_BASE_URL: "http://self-host.test/v1" },
		createLocalOverrideProvider: () => {
			selfCalls.push("local");
			return null;
		},
		createSelfHostedProvider: () => {
			selfCalls.push("self");
			return new RecordingProvider("self");
		},
	});
	assert.equal(selfHostedResult.ok ? selfHostedResult.providerStep : "", "selfHosted");
	assert.deepEqual(selfCalls, ["local", "self"]);

	const hostedCalls: string[] = [];
	const hostedResult = await dispatch(textRequest(), {
		store: new MemoryDispatchStore({
			providerSettings: {
				localOverrideConfig: null,
				hasByokProviderConfig: false,
			},
		}),
		env: { NODE_ENV: "development" },
		createLocalOverrideProvider: () => {
			hostedCalls.push("local");
			return null;
		},
		checkHostedSaaSCap: () => {
			hostedCalls.push("cap");
			return { ok: true };
		},
		createHostedSaaSProvider: () => {
			hostedCalls.push("hosted");
			return new RecordingProvider("hosted");
		},
	});
	assert.equal(hostedResult.ok ? hostedResult.providerStep : "", "hostedSaaS");
	assert.deepEqual(hostedCalls, ["local", "cap", "hosted"]);
});

class MemoryDispatchStore implements DispatchStore {
	readonly visionEnabled: boolean | null;
	readonly visionConsent: WorkflowVisionConsent | null;
	readonly providerSettings: DispatchProviderSettings | null;
	readonly failIfCompanyVisionRead: boolean;
	readonly failIfWorkflowConsentRead: boolean;
	companyVisionReads = 0;
	workflowConsentReads = 0;
	providerSettingsReads = 0;

	constructor(
		options: {
			visionEnabled?: boolean | null;
			visionConsent?: WorkflowVisionConsent | null;
			providerSettings?: DispatchProviderSettings | null;
			failIfCompanyVisionRead?: boolean;
			failIfWorkflowConsentRead?: boolean;
		} = {},
	) {
		this.visionEnabled = options.visionEnabled ?? true;
		this.visionConsent = options.visionConsent ?? "ALWAYS";
		this.providerSettings = options.providerSettings ?? {
			localOverrideConfig: null,
			hasByokProviderConfig: false,
		};
		this.failIfCompanyVisionRead = options.failIfCompanyVisionRead ?? false;
		this.failIfWorkflowConsentRead = options.failIfWorkflowConsentRead ?? false;
	}

	async readCompanyVisionEnabled(): Promise<boolean | null> {
		this.companyVisionReads += 1;
		if (this.failIfCompanyVisionRead) {
			throw new Error("Step 0 company gate must be skipped.");
		}
		return this.visionEnabled;
	}

	async readWorkflowVisionConsent(): Promise<WorkflowVisionConsent | null> {
		this.workflowConsentReads += 1;
		if (this.failIfWorkflowConsentRead) {
			throw new Error("Step 0 workflow gate must be skipped.");
		}
		return this.visionConsent;
	}

	async readProviderSettings(): Promise<DispatchProviderSettings | null> {
		this.providerSettingsReads += 1;
		return this.providerSettings;
	}
}

class RecordingProvider implements LLMProvider {
	readonly providerName: string;
	textInvocations = 0;
	visionInvocations = 0;

	constructor(providerName: string) {
		this.providerName = providerName;
	}

	async text(_req: LLMTextRequest): Promise<LLMResponse> {
		this.textInvocations += 1;
		return {
			text: `${this.providerName} text`,
			model: `${this.providerName}-model`,
			provider: this.providerName,
		};
	}

	async vision(_req: LLMVisionRequest): Promise<LLMResponse> {
		this.visionInvocations += 1;
		return {
			text: `${this.providerName} vision`,
			model: `${this.providerName}-vision-model`,
			provider: this.providerName,
		};
	}
}

function textRequest(): LLMTextRequest {
	return {
		prompt: "Summarize this safety note.",
		options: {
			tenantId,
			userId,
			workflowId,
			locale: "en",
			promptPurpose: "dispatch.text",
			kind: "authoring",
			requiresVision: false,
		},
	};
}

function visionRequest(): LLMVisionRequest {
	return {
		prompt: "Describe the photo.",
		photos: [{ mimeType: "application/octet-stream", data: photoBytes }],
		options: {
			tenantId,
			userId,
			workflowId,
			locale: "en",
			promptPurpose: "dispatch.vision",
			kind: "authoring",
			requiresVision: true,
		},
	};
}

function sha256Hex(bytes: Uint8Array): string {
	return createHash("sha256").update(bytes).digest("hex");
}
