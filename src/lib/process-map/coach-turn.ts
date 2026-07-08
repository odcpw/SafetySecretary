import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readEnvRaw } from "../config/env";
import {
	type DispatchOptions,
	type DispatchResult,
	dispatch,
} from "../llm/dispatch";
import {
	KindEnum,
	type LLMProvider,
	type LLMResponse,
	type LLMTextRequest,
	type LLMVisionRequest,
} from "../llm/types";
import { loadProcessMap } from "./index";
import {
	buildProcessMapCoachPrompt,
	type ProcessMapCoachTranscriptMessage,
} from "./coach-prompt";
import {
	parseProcessMapCoachResponse,
	type ProcessMapOperation,
} from "./operations";

export const PM_COACH_PROMPT_PURPOSE = "process_map_coach_turn";
export const PM_COACH_MOCK_SEED_PATH_ENV =
	"SAFETYSECRETARY_PM_COACH_MOCK_SEED_PATH";
export const LEGACY_PM_COACH_MOCK_SEED_PATH_ENV =
	"SSFW_PM_COACH_MOCK_SEED_PATH";

export type ProcessMapCoachTurnResult = {
	readonly reply: string;
	readonly operations: readonly ProcessMapOperation[];
};

export class ProcessMapCoachDispatchError extends Error {
	readonly result: Exclude<DispatchResult, { ok: true }>;

	constructor(result: Exclude<DispatchResult, { ok: true }>) {
		super(`Process-map coach dispatch failed: ${result.code}`);
		this.name = "ProcessMapCoachDispatchError";
		this.result = result;
	}
}

export async function runProcessMapCoachTurn(input: {
	readonly tenantId: string;
	readonly mapId: string;
	readonly message: string;
	readonly locale: string;
	readonly userId: string;
	readonly conversation?: readonly ProcessMapCoachTranscriptMessage[];
	readonly dispatchOptions?: DispatchOptions;
}): Promise<ProcessMapCoachTurnResult | null> {
	const record = await loadProcessMap(input.tenantId, input.mapId);
	if (!record) {
		return null;
	}

	const prompt = buildProcessMapCoachPrompt({
		conversation: [
			...(input.conversation ?? []),
			{ content: input.message, role: "user" },
		],
		edges: record.edges,
		flows: record.flows,
		locale: input.locale,
		map: record.map,
		nodes: record.nodes,
		resources: record.resources,
	});
	const result = await dispatch(
		{
			options: {
				kind: KindEnum.Authoring,
				locale: input.locale,
				promptPurpose: PM_COACH_PROMPT_PURPOSE,
				requiresVision: false,
				tenantId: input.tenantId,
				userId: input.userId,
				workflowId: input.mapId,
			},
			prompt,
		},
		input.dispatchOptions ?? processMapCoachDispatchOptionsFromEnv(),
	);

	if (!result.ok) {
		throw new ProcessMapCoachDispatchError(result);
	}

	return parseProcessMapCoachResponse(result.response.text);
}

export type ProcessMapCoachMockFixture = {
	readonly entries: ReadonlyArray<{ readonly responseText: string }>;
};

export class SequentialProcessMapCoachMockProvider implements LLMProvider {
	private readonly responses: readonly string[];
	private index = 0;

	constructor(fixture: ProcessMapCoachMockFixture) {
		this.responses = fixture.entries.map((entry) => entry.responseText);

		if (this.responses.length === 0) {
			throw new Error("Process-map coach mock fixture must contain entries.");
		}
	}

	async text(_req: LLMTextRequest): Promise<LLMResponse> {
		const position = Math.min(this.index, this.responses.length - 1);
		this.index += 1;

		return {
			model: "mock-process-map-coach",
			provider: "mock",
			text: this.responses[position] as string,
		};
	}

	async vision(_req: LLMVisionRequest): Promise<LLMResponse> {
		return this.text(_req as unknown as LLMTextRequest);
	}
}

const mockProvidersByFixturePath = new Map<string, LLMProvider>();

export function readProcessMapCoachMockProviderFromEnv(
	env: Pick<NodeJS.ProcessEnv, string> = process.env,
): LLMProvider | undefined {
	if (env.NODE_ENV !== "test") {
		return undefined;
	}

	const fixturePath = readEnvRaw(
		env,
		PM_COACH_MOCK_SEED_PATH_ENV,
		LEGACY_PM_COACH_MOCK_SEED_PATH_ENV,
	);
	if (!fixturePath) {
		return undefined;
	}

	const resolvedPath = resolve(fixturePath);
	const cached = mockProvidersByFixturePath.get(resolvedPath);
	if (cached) {
		return cached;
	}

	const fixture = JSON.parse(
		readFileSync(resolvedPath, "utf8"),
	) as ProcessMapCoachMockFixture;
	const provider = new SequentialProcessMapCoachMockProvider(fixture);
	mockProvidersByFixturePath.set(resolvedPath, provider);
	return provider;
}

function processMapCoachDispatchOptionsFromEnv(): DispatchOptions {
	const env = process.env;
	const mockProvider = readProcessMapCoachMockProviderFromEnv(env);
	return mockProvider ? { env, mockProvider } : {};
}
