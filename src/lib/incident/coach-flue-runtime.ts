import {
	createFlueClient,
	FlueApiError,
	type AttachedAgentEvent,
	type FlueClient,
} from "@flue/sdk";
import { encodeFlueIncidentInstanceId } from "./coach-flue-ids";

const defaultFlueBaseUrl = "http://127.0.0.1:3583";
const defaultIncidentAgentName = "incident-investigation";

export type FlueIncidentCoachTurn = {
	readonly agentName: string;
	readonly instanceId: string;
	readonly model?: string;
	readonly offset: string;
	readonly streamUrl: string;
	readonly submissionId: string;
	readonly text: string;
};

export type FlueIncidentCoachProgressEvent =
	| {
			readonly type: "admitted";
			readonly agentName: string;
			readonly instanceId: string;
			readonly offset: string;
			readonly streamUrl: string;
			readonly submissionId: string;
	  }
	| {
			readonly type: "activity";
			readonly eventType: AttachedAgentEvent["type"];
			readonly phase?: "start" | "end";
			readonly toolName?: string;
			readonly operationKind?: string;
			readonly isError?: boolean;
	  };

export class FlueCoachRuntimeError extends Error {
	readonly cause: unknown;

	constructor(cause: unknown) {
		super("Flue incident coach request failed.");
		this.name = "FlueCoachRuntimeError";
		this.cause = cause;
	}
}

export async function runIncidentCoachTurnViaFlue(input: {
	readonly tenantId: string;
	readonly userId: string;
	readonly incidentId: string;
	readonly locale: string;
	readonly message: string;
	readonly env?: Pick<NodeJS.ProcessEnv, string>;
	readonly fetch?: typeof fetch;
	readonly onProgress?: (event: FlueIncidentCoachProgressEvent) => void;
	readonly signal?: AbortSignal;
}): Promise<FlueIncidentCoachTurn> {
	return runIncidentCoachTurnViaFlueWithProgress(input);
}

export async function runIncidentCoachTurnViaFlueWithProgress(input: {
	readonly tenantId: string;
	readonly userId: string;
	readonly incidentId: string;
	readonly locale: string;
	readonly message: string;
	readonly env?: Pick<NodeJS.ProcessEnv, string>;
	readonly fetch?: typeof fetch;
	readonly signal?: AbortSignal;
	readonly onProgress?: (event: FlueIncidentCoachProgressEvent) => void;
}): Promise<FlueIncidentCoachTurn> {
	const env = input.env ?? process.env;
	const baseUrl = cleanEnv(env.SSFW_FLUE_BASE_URL) ?? defaultFlueBaseUrl;
	const agentName =
		cleanEnv(env.SSFW_FLUE_II_AGENT) ?? defaultIncidentAgentName;
	const token = cleanEnv(env.SSFW_FLUE_TOKEN);
	const instanceId = encodeFlueIncidentInstanceId({
		incidentId: input.incidentId,
		tenantId: input.tenantId,
	});
	const client = createFlueClient({
		baseUrl,
		fetch: input.fetch,
		...(token ? { token } : {}),
	});

	try {
		const admitted = await client.agents.send(agentName, instanceId, {
			message: buildFlueTurnMessage(input),
			signal: input.signal,
		});
		emitProgress(input.onProgress, {
			agentName,
			instanceId,
			offset: admitted.offset,
			streamUrl: admitted.streamUrl,
			submissionId: admitted.submissionId,
			type: "admitted",
		});
		const result = await waitForPromptResult({
			agentName,
			client,
			instanceId,
			onProgress: input.onProgress,
			offset: admitted.offset,
			signal: input.signal,
			submissionId: admitted.submissionId,
		});
		const extracted = extractPromptText(result);

		return {
			agentName,
			instanceId,
			model: extracted.model,
			offset: admitted.offset,
			streamUrl: admitted.streamUrl,
			submissionId: admitted.submissionId,
			text: extracted.text,
		};
	} catch (error) {
		if (error instanceof FlueCoachRuntimeError) {
			throw error;
		}

		if (error instanceof FlueApiError) {
			throw new FlueCoachRuntimeError({
				body: error.body,
				status: error.status,
			});
		}

		throw new FlueCoachRuntimeError(error);
	}
}

async function waitForPromptResult(input: {
	readonly agentName: string;
	readonly client: FlueClient;
	readonly instanceId: string;
	readonly onProgress?: (event: FlueIncidentCoachProgressEvent) => void;
	readonly offset: string;
	readonly signal?: AbortSignal;
	readonly submissionId: string;
}): Promise<unknown> {
	const stream = input.client.agents.stream(input.agentName, input.instanceId, {
		live: true,
		offset: input.offset,
		signal: input.signal,
	});

	try {
		for await (const event of stream) {
			if (event.submissionId && event.submissionId !== input.submissionId) {
				continue;
			}

			const progress = flueEventToProgress(event);
			if (progress) {
				emitProgress(input.onProgress, progress);
			}

			if (event.type === "operation" && event.operationKind === "prompt") {
				if (event.isError) {
					throw new FlueCoachRuntimeError(event.error);
				}
				return event.result;
			}

			if (
				event.type === "submission_settled" &&
				event.submissionId === input.submissionId &&
				event.outcome === "failed"
			) {
				throw new FlueCoachRuntimeError(event.error ?? "Submission failed.");
			}

			if (event.type === "idle" && event.submissionId === input.submissionId) {
				break;
			}
		}
	} finally {
		stream.cancel();
	}

	throw new FlueCoachRuntimeError(
		"Flue stream ended before prompt result was emitted.",
	);
}

function flueEventToProgress(
	event: AttachedAgentEvent,
): FlueIncidentCoachProgressEvent | null {
	switch (event.type) {
		case "agent_start":
			return { eventType: event.type, phase: "start", type: "activity" };
		case "agent_end":
			return { eventType: event.type, phase: "end", type: "activity" };
		case "turn_start":
			return { eventType: event.type, phase: "start", type: "activity" };
		case "turn":
			return {
				eventType: event.type,
				isError: event.isError,
				phase: "end",
				type: "activity",
			};
		case "tool_start":
			return {
				eventType: event.type,
				phase: "start",
				toolName: event.toolName,
				type: "activity",
			};
		case "tool":
			return {
				eventType: event.type,
				isError: event.isError,
				phase: "end",
				toolName: event.toolName,
				type: "activity",
			};
		case "operation_start":
			return {
				eventType: event.type,
				operationKind: event.operationKind,
				phase: "start",
				type: "activity",
			};
		case "operation":
			return {
				eventType: event.type,
				isError: event.isError,
				operationKind: event.operationKind,
				phase: "end",
				type: "activity",
			};
		case "compaction_start":
			return { eventType: event.type, phase: "start", type: "activity" };
		case "compaction":
			return {
				eventType: event.type,
				isError: event.isError,
				phase: "end",
				type: "activity",
			};
		default:
			return null;
	}
}

function emitProgress(
	onProgress: ((event: FlueIncidentCoachProgressEvent) => void) | undefined,
	event: FlueIncidentCoachProgressEvent,
): void {
	if (!onProgress) {
		return;
	}

	try {
		onProgress(event);
	} catch {
		// Progress telemetry must never break the durable coach turn.
	}
}

function buildFlueTurnMessage(input: {
	readonly userId: string;
	readonly incidentId: string;
	readonly locale: string;
	readonly message: string;
}): string {
	return [
		"Handle one Safety Secretary incident-investigation chat turn.",
		"Use the incident-investigation skill and call read_incident_record before answering.",
		"Think about the whole case, then write only new or corrected record changes through typed tools: propose_incident_fields, propose_evidence, propose_cause_tree, propose_action_plan, and propose_hira_followup.",
		"Summary, explanation, review, and brainstorming turns may return operations: []; do not create approval cards just because you gave advice.",
		"If TURN_INPUT_JSON.message asks for suggestions/options, answer with options first and propose operations only for measures the user states, accepts, or explicitly asks you to add.",
		`CURRENT DATE/TIME: ${formatZurichNow()} - Swiss local time (Europe/Zurich). Anchor relative wording like "this morning", "heute Morgen", "gestern", or "ce matin" to this local time, not UTC.`,
		"If TURN_INPUT_JSON.message contains measures, actions, fixes, owners, deadlines, or close-out wording, call propose_action_plan and include the returned stop_action operations in your final JSON.",
		"Do not store agreed measures as fact operations.",
		"Return only the strict JSON object expected by the skill.",
		"",
		"TURN_INPUT_JSON:",
		JSON.stringify(
			{
				incidentId: input.incidentId,
				locale: input.locale,
				message: input.message,
				now: new Date().toISOString(),
				nowZurich: formatZurichNow(),
				userId: input.userId,
			},
			null,
			2,
		),
	].join("\n");
}

function extractPromptText(result: unknown): { text: string; model?: string } {
	if (typeof result === "string") {
		return { text: result };
	}

	if (result && typeof result === "object") {
		const record = result as Record<string, unknown>;
		const text = typeof record.text === "string" ? record.text : "";
		const modelRecord =
			record.model && typeof record.model === "object"
				? (record.model as Record<string, unknown>)
				: null;
		const provider =
			typeof modelRecord?.provider === "string" ? modelRecord.provider : "";
		const id = typeof modelRecord?.id === "string" ? modelRecord.id : "";

		if (text) {
			return {
				model: provider && id ? `${provider}/${id}` : undefined,
				text,
			};
		}
	}

	throw new FlueCoachRuntimeError("Flue result did not include text.");
}

function cleanEnv(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

function formatZurichNow(): string {
	return new Intl.DateTimeFormat("en-GB", {
		timeZone: "Europe/Zurich",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
		timeZoneName: "longOffset",
	}).format(new Date());
}
