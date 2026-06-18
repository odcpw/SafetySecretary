import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { incidentCoachTraceStore } from "../agent/incident-investigation/coach-trace";
import { buildIncidentInvestigationAgentContext } from "../agent/incident-investigation/context";
import {
	INCIDENT_COACH_SKILL,
	incidentCoachSkillRef,
} from "../agent/skills/incident-coach-v1";
import { parseStructuredOperation } from "../agent/structured-operations";
import {
	AgentAllowedOperationTarget,
	AgentConfirmationMode,
	AgentOperationKind,
	type AgentRunMetadata,
	AgentRunStatus,
	type AgentSkillRef,
	type AgentStructuredOperation,
	AgentSurface,
	AgentWorkflowType,
} from "../agent/types";
import { withTenantConnection } from "../db";
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
import {
	buildCauseTreeDigest,
	buildPhaseSignal,
	type CauseTreeDigestAction,
	type CauseTreeDigestCause,
} from "./cause-tree";
import {
	type FlueIncidentCoachProgressEvent,
	runIncidentCoachTurnViaFlueWithProgress,
} from "./coach-flue-runtime";
import { PiCoachProvider } from "./coach-pi-runtime";
import {
	buildCoachTurnPrompt,
	type CoachTranscriptMessage,
} from "./coach-prompt";

export const II_COACH_PROMPT_PURPOSE = "ii_coach_turn";
export const II_COACH_MOCK_SEED_PATH_ENV = "SSFW_II_COACH_MOCK_SEED_PATH";

const transcriptWindow = 40;

export type CoachOperationDecision = {
	readonly status: "applied" | "dismissed";
	readonly recordId?: string | null;
};

export type CoachChatMessage = {
	readonly id: string;
	readonly role: "user" | "assistant";
	readonly content: string;
	readonly operations: readonly AgentStructuredOperation[];
	readonly operationDecisions: Readonly<Record<string, CoachOperationDecision>>;
	readonly createdAt: string;
};

export type CoachChatTurnResult = {
	readonly userMessage: CoachChatMessage;
	readonly assistantMessage: CoachChatMessage;
};

export type CoachChatTurnProgressEvent =
	| {
			readonly type: "flue";
			readonly event: FlueIncidentCoachProgressEvent;
	  }
	| {
			readonly type: "dispatch_started";
	  }
	| {
			readonly type: "assistant_parsed";
			readonly operationCount: number;
	  };

export class CoachIncidentNotFoundError extends Error {
	constructor() {
		super("INCIDENT_NOT_FOUND");
		this.name = "CoachIncidentNotFoundError";
	}
}

export class CoachDispatchError extends Error {
	readonly result: Exclude<DispatchResult, { ok: true }>;

	constructor(result: Exclude<DispatchResult, { ok: true }>) {
		super(`II coach dispatch failed: ${result.code}`);
		this.name = "CoachDispatchError";
		this.result = result;
	}
}

export class CoachProviderError extends Error {
	readonly cause: unknown;

	constructor(cause: unknown) {
		super("II coach provider failed.");
		this.name = "CoachProviderError";
		this.cause = cause;
	}
}

export async function listCoachMessages(
	tenantId: string,
	incidentId: string,
): Promise<CoachChatMessage[] | null> {
	return withTenantConnection(tenantId, async (tx) => {
		const incidentRows = await tx.$queryRaw<Array<{ id: string }>>`
			SELECT id::text AS id
			FROM incident_case
			WHERE id = ${incidentId}::uuid
			LIMIT 1
		`;

		if (incidentRows.length === 0) {
			return null;
		}

		const rows = await tx.$queryRaw<CoachMessageRow[]>`
			SELECT
				id::text AS id,
				role,
				content,
				operations,
				operation_decisions AS "operationDecisions",
				created_at AS "createdAt"
			FROM incident_coach_message
			WHERE case_id = ${incidentId}::uuid
			ORDER BY created_at ASC, id ASC
		`;

		return rows.map(coachMessageFromRow);
	});
}

export async function runCoachChatTurn(input: {
	readonly tenantId: string;
	readonly userId: string;
	readonly incidentId: string;
	readonly message: string;
	readonly locale: string;
	readonly dispatchOptions?: DispatchOptions;
	readonly onProgress?: (event: CoachChatTurnProgressEvent) => void;
	readonly signal?: AbortSignal;
}): Promise<CoachChatTurnResult | null> {
	const runId = randomUUID();
	const now = new Date();
	const skill: AgentSkillRef = incidentCoachSkillRef("coach-chat");
	const metadata: AgentRunMetadata = {
		createdAt: now.toISOString(),
		kind: KindEnum.Authoring,
		locale: input.locale,
		requiresVision: false,
		runId,
		skill,
		surface: AgentSurface.Workbench,
		tenantId: input.tenantId,
		userId: input.userId,
		workflowType: AgentWorkflowType.Ii,
		workflowId: input.incidentId,
	};

	const context = await buildIncidentInvestigationAgentContext({ metadata });

	if (!context) {
		return null;
	}

	const history =
		(await listCoachMessages(input.tenantId, input.incidentId)) ?? [];
	const transcript: CoachTranscriptMessage[] = history
		.slice(-transcriptWindow)
		.map((message) => ({
			content: transcriptContentFor(message),
			role: message.role,
		}));

	const userMessage = await insertCoachMessage(input.tenantId, {
		caseId: input.incidentId,
		content: input.message,
		operations: [],
		role: "user",
	});

	const sections = context.workflowSnapshot.sections as {
		readonly causes?: readonly CauseTreeDigestCause[];
		readonly actions?: readonly CauseTreeDigestAction[];
		readonly facts?: readonly unknown[];
		readonly timeline?: readonly unknown[];
		readonly incident?: {
			readonly potentialSeverity?: string | null;
			readonly causeMethod?: string | null;
		};
	};
	const causes = sections.causes ?? [];
	const actions = sections.actions ?? [];
	const causeTreeDigest = buildCauseTreeDigest({ actions, causes });
	// Internal, never-stored phase signal derived from current record state.
	const phaseSignal = buildPhaseSignal({
		actions,
		causes,
		factCount: sections.facts?.length ?? 0,
		timelineCount: sections.timeline?.length ?? 0,
		potentialSeverity: sections.incident?.potentialSeverity ?? null,
	});

	let responseText: string;
	let contextDigestSource: string;

	if (shouldUseFlueCoachRuntime(input.dispatchOptions)) {
		try {
			const flueTurn = await runIncidentCoachTurnViaFlueWithProgress({
				incidentId: input.incidentId,
				locale: input.locale,
				message: input.message,
				onProgress: (event) =>
					emitCoachProgress(input.onProgress, { event, type: "flue" }),
				signal: input.signal,
				tenantId: input.tenantId,
				userId: input.userId,
			});
			responseText = flueTurn.text;
			contextDigestSource = JSON.stringify({
				agentName: flueTurn.agentName,
				instanceId: flueTurn.instanceId,
				message: input.message,
				offset: flueTurn.offset,
				streamUrl: flueTurn.streamUrl,
				submissionId: flueTurn.submissionId,
			});
		} catch (error) {
			await deleteCoachMessage(
				input.tenantId,
				input.incidentId,
				userMessage.id,
			);
			throw new CoachProviderError(error);
		}
	} else {
		const prompt = buildCoachTurnPrompt({
			causeMethod: sections.incident?.causeMethod ?? "FIVE_WHYS",
			causeTreeDigest,
			context,
			locale: input.locale,
			phaseSignal,
			transcript,
			userMessage: input.message,
		});

		let result: DispatchResult;

		try {
			emitCoachProgress(input.onProgress, { type: "dispatch_started" });
			result = await dispatch(
				{
					prompt,
					options: {
						kind: KindEnum.Authoring,
						locale: input.locale,
						promptPurpose: II_COACH_PROMPT_PURPOSE,
						requiresVision: false,
						tenantId: input.tenantId,
						userId: input.userId,
						workflowId: input.incidentId,
					},
				},
				input.dispatchOptions ?? coachDispatchOptionsFromEnv(),
			);
		} catch (error) {
			await deleteCoachMessage(
				input.tenantId,
				input.incidentId,
				userMessage.id,
			);
			throw new CoachProviderError(error);
		}

		if (!result.ok) {
			await deleteCoachMessage(
				input.tenantId,
				input.incidentId,
				userMessage.id,
			);
			throw new CoachDispatchError(result);
		}

		responseText = result.response.text;
		contextDigestSource = prompt;
	}

	const parsed = parseCoachResponse(
		responseText,
		runId,
		skill,
		input.incidentId,
	);
	emitCoachProgress(input.onProgress, {
		operationCount: parsed.operations.length,
		type: "assistant_parsed",
	});

	const assistantMessage = await insertCoachMessage(input.tenantId, {
		caseId: input.incidentId,
		content: parsed.reply,
		operations: parsed.operations,
		role: "assistant",
	});

	// Skill-run trace (SPEC: skills are versioned and traceable). Tracing must
	// never break the turn itself.
	try {
		await incidentCoachTraceStore.create({
			contextDigest: createHash("sha256")
				.update(contextDigestSource)
				.digest("hex")
				.slice(0, 16),
			metadata,
		});
		await incidentCoachTraceStore.recordStructuredOperations({
			operations: parsed.operations,
			runId,
			tenantId: input.tenantId,
		});
		await incidentCoachTraceStore.complete({
			runId,
			status: AgentRunStatus.Completed,
			tenantId: input.tenantId,
		});
	} catch (error) {
		console.warn(
			"[ii-coach] trace recording failed:",
			error instanceof Error ? error.message : error,
		);
	}

	return { assistantMessage, userMessage };
}

export async function recordCoachOperationDecision(input: {
	readonly tenantId: string;
	readonly incidentId: string;
	readonly messageId: string;
	readonly operationId: string;
	readonly decision: CoachOperationDecision;
	readonly onlyIfUndecided?: boolean;
}): Promise<boolean> {
	return withTenantConnection(input.tenantId, async (tx) => {
		const decisionJson = JSON.stringify(input.decision);
		const rows = input.onlyIfUndecided
			? await tx.$queryRaw<Array<{ id: string }>>`
				UPDATE incident_coach_message
				SET operation_decisions = jsonb_set(
					operation_decisions,
					ARRAY[${input.operationId}],
					${decisionJson}::jsonb,
					true
				)
				WHERE id = ${input.messageId}::uuid
					AND case_id = ${input.incidentId}::uuid
					AND NOT (operation_decisions ? ${input.operationId})
				RETURNING id::text AS id
			`
			: await tx.$queryRaw<Array<{ id: string }>>`
				UPDATE incident_coach_message
				SET operation_decisions = jsonb_set(
					operation_decisions,
					ARRAY[${input.operationId}],
					${decisionJson}::jsonb,
					true
				)
				WHERE id = ${input.messageId}::uuid
					AND case_id = ${input.incidentId}::uuid
				RETURNING id::text AS id
			`;

		return rows.length > 0;
	});
}

export async function clearCoachOperationDecision(input: {
	readonly tenantId: string;
	readonly incidentId: string;
	readonly messageId: string;
	readonly operationId: string;
}): Promise<void> {
	await withTenantConnection(input.tenantId, async (tx) => {
		await tx.$executeRaw`
			UPDATE incident_coach_message
			SET operation_decisions = operation_decisions - ${input.operationId}
			WHERE id = ${input.messageId}::uuid
				AND case_id = ${input.incidentId}::uuid
		`;
	});
}

export type ParsedCoachResponse = {
	readonly reply: string;
	readonly operations: readonly AgentStructuredOperation[];
};

export function parseCoachResponse(
	responseText: string,
	runId: string,
	skill: AgentSkillRef,
	incidentId: string,
	allowedKinds?: readonly string[],
): ParsedCoachResponse {
	const fallbackReply = responseText.trim();
	let parsed: unknown;

	try {
		parsed = JSON.parse(extractJson(responseText));
	} catch {
		return { operations: [], reply: fallbackReply };
	}

	const record = asRecord(parsed);
	const rawOperations = Array.isArray(record.operations)
		? record.operations
		: [];
	// When the model returned parseable JSON but no reply text, do not show
	// the raw JSON payload to the user.
	const reply =
		typeof record.reply === "string" && record.reply.trim()
			? record.reply.trim()
			: rawOperations.length > 0
				? "I captured some updates — review the suggestions below."
				: fallbackReply;

	return {
		operations: normaliseCoachOperations(
			rawOperations,
			runId,
			skill,
			incidentId,
			allowedKinds,
		),
		reply,
	};
}

export function normaliseCoachOperations(
	rawOperations: readonly unknown[],
	runId: string,
	skill: AgentSkillRef,
	incidentId: string,
	allowedKinds: readonly string[] = INCIDENT_COACH_SKILL.allowedOperationKinds,
): readonly AgentStructuredOperation[] {
	const refToOperationId = new Map<string, string>();
	const prepared: Array<{
		id: string;
		kind: string;
		payload: Record<string, unknown>;
	}> = [];

	for (const [index, raw] of rawOperations.entries()) {
		const operation = asRecord(raw);
		const kind = typeof operation.kind === "string" ? operation.kind : "";

		if (kind && !allowedKinds.includes(kind)) {
			console.warn(
				`[ii-coach] dropped operation outside the skill's allowed kinds: "${kind}"`,
			);
			continue;
		}

		if (!kind) {
			continue;
		}

		const id = `${runId}:coach:${index}-${kind}`;
		const ref = typeof operation.ref === "string" ? operation.ref.trim() : "";

		if (ref) {
			refToOperationId.set(ref, id);
		}

		prepared.push({ id, kind, payload: asRecord(operation.payload) });
	}

	const operations: AgentStructuredOperation[] = [];

	for (const entry of prepared) {
		const payload = { ...entry.payload };

		// Models often send null for optional keys; the operation schema wants
		// them omitted. null stays meaningful only as a field-update value and
		// as cause_update.parentId (move to top level).
		for (const key of Object.keys(payload)) {
			if (
				payload[key] === null &&
				!(entry.kind === "incident_field_update" && key === "value") &&
				!(entry.kind === "cause_update" && key === "parentId")
			) {
				delete payload[key];
			}
		}

		for (const referenceKey of ["parentId", "linkedCauseNodeId", "causeId"]) {
			const value = payload[referenceKey];
			if (typeof value === "string" && refToOperationId.has(value)) {
				payload[referenceKey] = refToOperationId.get(value);
			}
		}

		try {
			operations.push(
				parseStructuredOperation({
					confirmationMode: AgentConfirmationMode.Propose,
					id: entry.id,
					kind: entry.kind,
					payload,
					runId,
					skill,
					sourceRefs: [
						{
							id: incidentId,
							label: "Coach conversation",
							type: "incident_case",
						},
					],
					target: AgentAllowedOperationTarget.WorkflowDraft,
				}),
			);
		} catch (error) {
			// Drop the malformed operation but leave a trail; the reply text
			// still reaches the user.
			console.warn(
				`[ii-coach] dropped invalid operation kind="${entry.kind}":`,
				error instanceof Error ? error.message : error,
			);
		}
	}

	// Strip references to operations that were dropped as malformed: a parent
	// ref that can never resolve makes the dependent op permanently
	// unapplicable, and an unlinked stop_action would land on the wrong cause.
	const keptIds = new Set(operations.map((operation) => operation.id));
	const coachIdPrefix = `${runId}:coach:`;
	const isDroppedReference = (value: string | undefined): boolean =>
		typeof value === "string" &&
		value.startsWith(coachIdPrefix) &&
		!keptIds.has(value);

	return operations
		.filter((operation) => {
			if (operation.kind === AgentOperationKind.StopAction) {
				return !isDroppedReference(operation.payload.linkedCauseNodeId);
			}

			if (operation.kind === AgentOperationKind.CauseUpdate) {
				return !isDroppedReference(operation.payload.causeId);
			}

			return true;
		})
		.map((operation) => {
			// A parentId pointing at a dropped op can never resolve; strip it so
			// the cause lands at top level rather than failing to apply.
			if (
				(operation.kind === AgentOperationKind.CauseNode ||
					operation.kind === AgentOperationKind.CauseUpdate) &&
				isDroppedReference(operation.payload.parentId ?? undefined)
			) {
				const { parentId: _dropped, ...payload } = operation.payload;
				return { ...operation, payload } as AgentStructuredOperation;
			}

			return operation;
		});
}

export type CoachMockFixture = {
	readonly entries: ReadonlyArray<{ readonly responseText: string }>;
};

/**
 * Sequential mock provider for tests and offline demos: returns the fixture
 * entries in order, repeating the final entry once exhausted.
 */
export class SequentialCoachMockProvider implements LLMProvider {
	private readonly responses: readonly string[];
	private index = 0;

	constructor(fixture: CoachMockFixture) {
		this.responses = fixture.entries.map((entry) => entry.responseText);

		if (this.responses.length === 0) {
			throw new Error("Coach mock fixture must contain at least one entry.");
		}
	}

	async text(_req: LLMTextRequest): Promise<LLMResponse> {
		const position = Math.min(this.index, this.responses.length - 1);
		this.index += 1;

		return {
			model: "mock-ii-coach",
			provider: "mock",
			text: this.responses[position] as string,
		};
	}

	async vision(_req: LLMVisionRequest): Promise<LLMResponse> {
		return this.text(_req as unknown as LLMTextRequest);
	}
}

const mockProvidersByFixturePath = new Map<string, LLMProvider>();

export function readCoachMockProviderFromEnv(
	env: Pick<NodeJS.ProcessEnv, string> = process.env,
): LLMProvider | undefined {
	if (env.NODE_ENV !== "test") {
		return undefined;
	}

	const fixturePath = env[II_COACH_MOCK_SEED_PATH_ENV];

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
	) as CoachMockFixture;
	const provider = new SequentialCoachMockProvider(fixture);
	mockProvidersByFixturePath.set(resolvedPath, provider);
	return provider;
}

function shouldUseFlueCoachRuntime(
	dispatchOptions: DispatchOptions | undefined,
	env: Pick<NodeJS.ProcessEnv, string> = process.env,
): boolean {
	if (dispatchOptions) {
		return false;
	}
	// Flue is the live coach runtime by default. Setting SSFW_II_COACH_RUNTIME
	// to anything else (e.g. "pi") opts back out to the dispatch/Pi path.
	const runtime = env.SSFW_II_COACH_RUNTIME;
	// An explicit selection is honoured as-is; otherwise a configured mock
	// provider (test fixtures) keeps deterministic runs on the dispatch path
	// rather than reaching the live Flue server.
	if (runtime === undefined && readCoachMockProviderFromEnv(env)) {
		return false;
	}
	return (runtime ?? "flue") === "flue";
}

function emitCoachProgress(
	onProgress: ((event: CoachChatTurnProgressEvent) => void) | undefined,
	event: CoachChatTurnProgressEvent,
): void {
	if (!onProgress) {
		return;
	}

	try {
		onProgress(event);
	} catch {
		// Progress delivery is best effort. The durable app record is written
		// after the model result; a dropped browser stream must not poison it.
	}
}

function coachDispatchOptionsFromEnv(): DispatchOptions {
	const env = process.env;
	const mockProvider = readCoachMockProviderFromEnv(env);

	if (mockProvider) {
		return { env, mockProvider };
	}

	// The live coach defaults to the Flue runtime (handled in
	// shouldUseFlueCoachRuntime); this dispatch path is only reached when the
	// operator opts back out via SSFW_II_COACH_RUNTIME=pi. When selected, Pi is
	// wired as the hosted provider so dispatch's cost-cap/consent/logging rails
	// still wrap it. PiCoachProvider falls back to OpenAI if Pi is unavailable.
	const runtime = env.SSFW_II_COACH_RUNTIME ?? "flue";
	if (runtime === "pi" && env.OPENAI_API_KEY?.trim()) {
		return {
			createHostedSaaSProvider: () => new PiCoachProvider({ env }),
			env,
		};
	}

	return {};
}

export type CoachMessageRow = {
	id: string;
	role: "user" | "assistant";
	content: string;
	operations: unknown;
	operationDecisions: unknown;
	createdAt: Date;
};

export function coachMessageFromRow(row: CoachMessageRow): CoachChatMessage {
	return {
		content: row.content,
		createdAt: row.createdAt.toISOString(),
		id: row.id,
		operationDecisions: asRecord(row.operationDecisions) as Record<
			string,
			CoachOperationDecision
		>,
		operations: Array.isArray(row.operations)
			? (row.operations as AgentStructuredOperation[])
			: [],
		role: row.role,
	};
}

export async function insertCoachMessage(
	tenantId: string,
	input: {
		caseId: string;
		role: "user" | "assistant";
		content: string;
		operations: readonly AgentStructuredOperation[];
	},
): Promise<CoachChatMessage> {
	const id = randomUUID();
	const operationsJson = JSON.stringify(input.operations);

	try {
		return await withTenantConnection(tenantId, async (tx) => {
			const rows = await tx.$queryRaw<CoachMessageRow[]>`
				INSERT INTO incident_coach_message (
					id,
					case_id,
					role,
					content,
					operations
				) VALUES (
					${id}::uuid,
					${input.caseId}::uuid,
					${input.role},
					${input.content},
					${operationsJson}::jsonb
				)
				RETURNING
					id::text AS id,
					role,
					content,
					operations,
					operation_decisions AS "operationDecisions",
					created_at AS "createdAt"
			`;
			const row = rows[0];

			if (!row) {
				throw new CoachIncidentNotFoundError();
			}

			return coachMessageFromRow(row);
		});
	} catch (error) {
		if (isForeignKeyViolation(error)) {
			throw new CoachIncidentNotFoundError();
		}

		throw error;
	}
}

async function deleteCoachMessage(
	tenantId: string,
	incidentId: string,
	messageId: string,
): Promise<void> {
	await withTenantConnection(tenantId, async (tx) => {
		await tx.$executeRaw`
			DELETE FROM incident_coach_message
			WHERE id = ${messageId}::uuid
				AND case_id = ${incidentId}::uuid
		`;
	}).catch(() => undefined);
}

export function isForeignKeyViolation(error: unknown): boolean {
	const text =
		error instanceof Error ? `${error.message} ${JSON.stringify(error)}` : "";
	return text.includes("23503") || text.includes("foreign key");
}

function transcriptContentFor(message: CoachChatMessage): string {
	if (message.role !== "assistant" || message.operations.length === 0) {
		return message.content;
	}

	const summaries = message.operations.map((operation) => {
		const decision = message.operationDecisions[operation.id];
		const status = decision?.status ?? "pending";
		return `${operation.kind}: ${operationGist(operation)} (${status})`;
	});

	return `${message.content}\n[your earlier suggestions — ${summaries.join("; ")}]`;
}

function operationGist(operation: AgentStructuredOperation): string {
	const payload = operation.payload as unknown as Record<string, unknown>;

	if (operation.kind === "incident_field_update") {
		return `${String(payload.field)}=${String(payload.value)}`;
	}

	for (const key of [
		"title",
		"label",
		"statement",
		"note",
		"text",
		"narrative",
	]) {
		const candidate = payload[key];

		if (typeof candidate === "string" && candidate.trim()) {
			return candidate.length > 70 ? `${candidate.slice(0, 69)}…` : candidate;
		}
	}

	return operation.kind;
}

/** Exposed for sibling modules (photo analysis) that parse coach-style JSON. */
export function extractCoachJson(text: string): string {
	return extractJson(text);
}

function extractJson(text: string): string {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);

	if (fenced?.[1]) {
		return fenced[1].trim();
	}

	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");

	if (start >= 0 && end > start) {
		return text.slice(start, end + 1);
	}

	return text.trim();
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}
