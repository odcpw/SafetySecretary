import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readEnvRaw } from "../config/env";
import { withTenantConnection } from "../db";
import type { Locale } from "../i18n/types";
import {
	type DispatchOptions,
	type DispatchResult,
	dispatch,
} from "../llm/dispatch";
import { hashOfPrompt, MockProvider, type MockProviderSeed } from "../llm/mock";
import { KindEnum, type LLMProvider, type LLMResponse } from "../llm/types";

export const II_5WHYS_PROMPT_PURPOSE = "ii_5whys_turn";
export const II_5WHYS_MOCK_SEED_PATH_ENV =
	"SAFETYSECRETARY_II_5WHYS_MOCK_SEED_PATH";
export const LEGACY_II_5WHYS_MOCK_SEED_PATH_ENV =
	"SSFW_II_5WHYS_MOCK_SEED_PATH";

export type CauseParentKind = "timeline_event" | "cause_node";

export type CauseBranchStatus = "OPEN" | "ROOT_REACHED" | "PARKED";

export type IncidentCauseNode = {
	id: string;
	caseId: string;
	parentId: string | null;
	timelineEventId: string | null;
	orderIndex: number;
	statement: string;
	question: string | null;
	isRootCause: boolean;
	branchStatus: CauseBranchStatus;
	createdAt: Date;
	updatedAt: Date;
};

export type IncidentTimelineEventOption = {
	id: string;
	orderIndex: number;
	eventAt: Date | null;
	timeLabel: string | null;
	text: string;
};

export type IncidentCauseTree = {
	id: string;
	title: string;
	timelineEvents: IncidentTimelineEventOption[];
	nodes: IncidentCauseNode[];
};

export type CauseNodeMutation = {
	parentId?: string | null;
	timelineEventId?: string | null;
	statement: string;
	question?: string | null;
	isRootCause?: boolean;
	branchStatus?: CauseBranchStatus;
};

export type CauseNodeUpdate = {
	nodeId: string;
	statement: string;
	question?: string | null;
	isRootCause: boolean;
	/** Omit to keep the current parent; null moves the node to the top level. */
	parentId?: string | null;
	/**
	 * When present, the destination sibling group is renumbered so the node
	 * sits before this sibling; null appends the node at the end. A parentId
	 * change without beforeId also appends at the end of the new group.
	 */
	beforeId?: string | null;
	/** Omit to keep the current branch status. */
	branchStatus?: CauseBranchStatus;
};

export type FiveWhysTurnInput = {
	tenantId: string;
	userId: string;
	incidentId: string;
	parentId?: string | null;
	timelineEventId?: string | null;
	userAnswer: string;
	locale: Locale;
};

export type FiveWhysPromptInput = {
	parentKind: CauseParentKind;
	parentStatement: string;
	userAnswer: string;
	locale: Locale;
};

export type FiveWhysMockFixture = {
	entries: FiveWhysMockFixtureEntry[];
};

export type FiveWhysMockFixtureEntry = FiveWhysPromptInput & {
	responseText: string;
};

type ParentContext = {
	parentId: string | null;
	parentKind: CauseParentKind;
	parentStatement: string;
	timelineEventId: string | null;
};

type TenantTx = Parameters<Parameters<typeof withTenantConnection>[1]>[0];

export class IncidentCauseNotFoundError extends Error {
	readonly code: "INCIDENT_NOT_FOUND" | "CAUSE_NODE_NOT_FOUND";

	constructor(code: "INCIDENT_NOT_FOUND" | "CAUSE_NODE_NOT_FOUND") {
		super(code);
		this.name = "IncidentCauseNotFoundError";
		this.code = code;
	}
}

export class InvalidCauseReferenceError extends Error {
	readonly code:
		| "INVALID_CAUSE_PARENT"
		| "INVALID_CAUSE_BEFORE"
		| "INVALID_TIMELINE_EVENT"
		| "INVALID_CAUSE_PAYLOAD";

	constructor(
		code:
			| "INVALID_CAUSE_PARENT"
			| "INVALID_CAUSE_BEFORE"
			| "INVALID_TIMELINE_EVENT"
			| "INVALID_CAUSE_PAYLOAD",
	) {
		super(code);
		this.name = "InvalidCauseReferenceError";
		this.code = code;
	}
}

export class FiveWhysDispatchError extends Error {
	readonly result: Exclude<DispatchResult, { ok: true }>;

	constructor(result: Exclude<DispatchResult, { ok: true }>) {
		super(`II 5-Whys dispatch failed: ${result.code}`);
		this.name = "FiveWhysDispatchError";
		this.result = result;
	}
}

export class FiveWhysProviderError extends Error {
	readonly cause: unknown;

	constructor(cause: unknown) {
		super("II 5-Whys provider failed.");
		this.name = "FiveWhysProviderError";
		this.cause = cause;
	}
}

export class InvalidFiveWhysMockFixtureError extends Error {
	readonly cause: unknown;
	readonly fixturePath: string;

	constructor(fixturePath: string, cause: unknown) {
		super(`Invalid II 5-Whys mock fixture: ${fixturePath}`);
		this.name = "InvalidFiveWhysMockFixtureError";
		this.cause = cause;
		this.fixturePath = fixturePath;
	}
}

export async function loadIncidentCauseTree(
	tenantId: string,
	incidentId: string,
): Promise<IncidentCauseTree | null> {
	return withTenantConnection(tenantId, async (tx) => {
		const cases = await tx.$queryRaw<Array<{ id: string; title: string }>>`
			SELECT id::text AS id, title
			FROM incident_case
			WHERE id = ${incidentId}::uuid
			LIMIT 1
		`;
		const incident = cases[0];

		if (!incident) {
			return null;
		}

		const [timelineEvents, nodes] = await Promise.all([
			tx.$queryRaw<IncidentTimelineEventOption[]>`
				SELECT
					id::text AS id,
					order_index AS "orderIndex",
					event_at AS "eventAt",
					time_label AS "timeLabel",
					text
				FROM incident_timeline_event
				WHERE case_id = ${incidentId}::uuid
				ORDER BY event_at ASC NULLS LAST, order_index ASC, created_at ASC, id ASC
			`,
			listCauseNodes(tx, incidentId),
		]);

		return {
			id: incident.id,
			title: incident.title,
			timelineEvents,
			nodes,
		};
	});
}

export async function createManualCauseNode(
	tenantId: string,
	incidentId: string,
	payload: CauseNodeMutation,
): Promise<IncidentCauseNode | null> {
	return withTenantConnection(tenantId, async (tx) => {
		await assertIncidentExists(tx, incidentId);
		await validateCauseReferences(tx, incidentId, payload);
		return insertCauseNode(tx, incidentId, payload);
	});
}

export async function updateCauseNode(
	tenantId: string,
	incidentId: string,
	payload: CauseNodeUpdate,
): Promise<IncidentCauseNode | null> {
	return withTenantConnection(tenantId, async (tx) => {
		const repositions =
			payload.parentId !== undefined || payload.beforeId !== undefined;

		if (repositions) {
			// Serialize moves per case so two concurrent re-parents cannot each
			// pass the cycle check against a snapshot and persist a cycle, and
			// so two sibling reorders cannot interleave their renumbering.
			// (::text because Prisma cannot deserialize the void return type.)
			await tx.$queryRaw`
				SELECT pg_advisory_xact_lock(hashtextextended(${incidentId}, 0))::text
			`;
		}

		if (payload.parentId !== undefined) {
			await assertValidCauseReparent(
				tx,
				incidentId,
				payload.nodeId,
				payload.parentId,
			);
		}

		const rows = await tx.$queryRaw<IncidentCauseNode[]>`
			UPDATE incident_cause_node
			SET
				statement = ${payload.statement},
				question = ${payload.question ?? null},
				is_root_cause = ${payload.isRootCause},
				parent_id = CASE
					WHEN ${payload.parentId !== undefined}
						THEN ${payload.parentId ?? null}::uuid
					ELSE parent_id
				END,
				branch_status = COALESCE(${payload.branchStatus ?? null}, branch_status),
				updated_at = CURRENT_TIMESTAMP
			WHERE id = ${payload.nodeId}::uuid
				AND case_id = ${incidentId}::uuid
			RETURNING
				id::text AS id,
				case_id::text AS "caseId",
				parent_id::text AS "parentId",
				timeline_event_id::text AS "timelineEventId",
				order_index AS "orderIndex",
				statement,
				question,
				is_root_cause AS "isRootCause",
				branch_status AS "branchStatus",
				created_at AS "createdAt",
				updated_at AS "updatedAt"
		`;
		const node = rows[0] ?? null;

		if (!node || !repositions) {
			return node;
		}

		const orderIndex = await repositionCauseNode(
			tx,
			incidentId,
			node.id,
			node.parentId,
			payload.beforeId ?? null,
		);

		return { ...node, orderIndex };
	});
}

export async function deleteCauseNode(
	tenantId: string,
	incidentId: string,
	nodeId: string,
): Promise<boolean> {
	return withTenantConnection(tenantId, async (tx) => {
		const rows = await tx.$queryRaw<Array<{ id: string }>>`
			DELETE FROM incident_cause_node
			WHERE id = ${nodeId}::uuid
				AND case_id = ${incidentId}::uuid
			RETURNING id::text AS id
		`;

		return Boolean(rows[0]);
	});
}

export async function createFiveWhysTurn(
	input: FiveWhysTurnInput,
	dispatchOptions: DispatchOptions = testDispatchOptionsFromEnv(),
): Promise<IncidentCauseNode | null> {
	const parent = await loadParentContext(input);

	if (!parent) {
		return null;
	}

	const question = await generateFiveWhysTurnQuestion(
		{
			parentKind: parent.parentKind,
			parentStatement: parent.parentStatement,
			userAnswer: input.userAnswer,
			locale: input.locale,
		},
		{
			dispatchOptions,
			incidentId: input.incidentId,
			tenantId: input.tenantId,
			userId: input.userId,
		},
	);

	return withTenantConnection(input.tenantId, async (tx) => {
		await assertIncidentExists(tx, input.incidentId);
		return insertCauseNode(tx, input.incidentId, {
			isRootCause: false,
			parentId: parent.parentId,
			question,
			statement: input.userAnswer,
			timelineEventId: parent.timelineEventId,
		});
	});
}

export async function generateFiveWhysTurnQuestion(
	input: FiveWhysPromptInput,
	options: {
		tenantId: string;
		userId: string;
		incidentId: string;
		dispatchOptions?: DispatchOptions;
	},
): Promise<string> {
	let result: DispatchResult;

	try {
		result = await dispatch(
			{
				prompt: buildFiveWhysPrompt(input),
				options: {
					kind: KindEnum.Authoring,
					locale: input.locale,
					promptPurpose: II_5WHYS_PROMPT_PURPOSE,
					requiresVision: false,
					tenantId: options.tenantId,
					userId: options.userId,
					workflowId: options.incidentId,
				},
			},
			options.dispatchOptions,
		);
	} catch (error) {
		throw new FiveWhysProviderError(error);
	}

	if (!result.ok) {
		throw new FiveWhysDispatchError(result);
	}

	return result.response.text.trim();
}

export function buildFiveWhysPrompt(input: FiveWhysPromptInput): string {
	return [
		"You are coaching a non-punitive incident investigation using 5-Whys.",
		`Respond in locale: ${input.locale}.`,
		`Parent type: ${input.parentKind}.`,
		`Parent statement: ${input.parentStatement}`,
		`User answer: ${input.userAnswer}`,
		"Ask exactly one short follow-up why question.",
		"Use work-as-done framing: what normally happens, what changed, what conditions or trade-offs were present, what made the safe path hard, what made this make sense at the time, and what went well that should be kept.",
		"Do not default to person-blame, carelessness, human error, or punishment when system-condition framing is available.",
	].join("\n");
}

export function fiveWhysMockSeedFromFixture(
	fixture: FiveWhysMockFixture,
): MockProviderSeed {
	return {
		text: fixture.entries.map((entry) => ({
			hashOfPrompt: hashOfPrompt(buildFiveWhysPrompt(entry)),
			promptPurpose: II_5WHYS_PROMPT_PURPOSE,
			response: {
				model: "mock-ii-5whys",
				provider: "mock",
				text: entry.responseText,
			} satisfies LLMResponse,
		})),
		vision: [],
	};
}

export function readFiveWhysMockProviderFromEnv(
	env: Pick<NodeJS.ProcessEnv, string> = process.env,
): LLMProvider | undefined {
	if (env.NODE_ENV !== "test") {
		return undefined;
	}

	const fixturePath = readEnvRaw(
		env,
		II_5WHYS_MOCK_SEED_PATH_ENV,
		LEGACY_II_5WHYS_MOCK_SEED_PATH_ENV,
	);

	if (!fixturePath) {
		return undefined;
	}

	const resolvedPath = resolve(fixturePath);
	let fixture: FiveWhysMockFixture;

	try {
		fixture = JSON.parse(
			readFileSync(resolvedPath, "utf8"),
		) as FiveWhysMockFixture;
	} catch (error) {
		throw new InvalidFiveWhysMockFixtureError(resolvedPath, error);
	}

	return new MockProvider(fiveWhysMockSeedFromFixture(fixture));
}

function testDispatchOptionsFromEnv(): DispatchOptions {
	const mockProvider = readFiveWhysMockProviderFromEnv();

	return mockProvider ? { env: process.env, mockProvider } : {};
}

async function loadParentContext(
	input: FiveWhysTurnInput,
): Promise<ParentContext | null> {
	return withTenantConnection(input.tenantId, async (tx) => {
		await assertIncidentExists(tx, input.incidentId);

		if (input.parentId) {
			const rows = await tx.$queryRaw<
				Array<{
					id: string;
					statement: string;
					timelineEventId: string | null;
				}>
			>`
				SELECT
					id::text AS id,
					statement,
					timeline_event_id::text AS "timelineEventId"
				FROM incident_cause_node
				WHERE id = ${input.parentId}::uuid
					AND case_id = ${input.incidentId}::uuid
				LIMIT 1
			`;
			const parent = rows[0];

			if (!parent) {
				throw new InvalidCauseReferenceError("INVALID_CAUSE_PARENT");
			}

			return {
				parentId: parent.id,
				parentKind: "cause_node",
				parentStatement: parent.statement,
				timelineEventId: parent.timelineEventId,
			};
		}

		if (!input.timelineEventId) {
			throw new InvalidCauseReferenceError("INVALID_CAUSE_PARENT");
		}

		const rows = await tx.$queryRaw<Array<{ id: string; text: string }>>`
			SELECT id::text AS id, text
			FROM incident_timeline_event
			WHERE id = ${input.timelineEventId}::uuid
				AND case_id = ${input.incidentId}::uuid
			LIMIT 1
		`;
		const event = rows[0];

		if (!event) {
			throw new InvalidCauseReferenceError("INVALID_TIMELINE_EVENT");
		}

		return {
			parentId: null,
			parentKind: "timeline_event",
			parentStatement: event.text,
			timelineEventId: event.id,
		};
	});
}

async function assertIncidentExists(
	tx: TenantTx,
	incidentId: string,
): Promise<void> {
	const rows = await tx.$queryRaw<Array<{ id: string }>>`
		SELECT id::text AS id
		FROM incident_case
		WHERE id = ${incidentId}::uuid
		LIMIT 1
	`;

	if (!rows[0]) {
		throw new IncidentCauseNotFoundError("INCIDENT_NOT_FOUND");
	}
}

async function validateCauseReferences(
	tx: TenantTx,
	incidentId: string,
	payload: Pick<CauseNodeMutation, "parentId" | "timelineEventId">,
): Promise<void> {
	if (payload.parentId) {
		const rows = await tx.$queryRaw<Array<{ id: string }>>`
			SELECT id::text AS id
			FROM incident_cause_node
			WHERE id = ${payload.parentId}::uuid
				AND case_id = ${incidentId}::uuid
			LIMIT 1
		`;

		if (!rows[0]) {
			throw new InvalidCauseReferenceError("INVALID_CAUSE_PARENT");
		}
	}

	if (payload.timelineEventId) {
		const rows = await tx.$queryRaw<Array<{ id: string }>>`
			SELECT id::text AS id
			FROM incident_timeline_event
			WHERE id = ${payload.timelineEventId}::uuid
				AND case_id = ${incidentId}::uuid
			LIMIT 1
		`;

		if (!rows[0]) {
			throw new InvalidCauseReferenceError("INVALID_TIMELINE_EVENT");
		}
	}
}

async function assertValidCauseReparent(
	tx: TenantTx,
	incidentId: string,
	nodeId: string,
	parentId: string | null,
): Promise<void> {
	if (parentId === null) {
		return;
	}

	const movedId = nodeId.toLowerCase();

	if (parentId.toLowerCase() === movedId) {
		throw new InvalidCauseReferenceError("INVALID_CAUSE_PARENT");
	}

	// The target parent plus all of its ancestors; the moved node must not be
	// among them, otherwise the re-parent would create a cycle. UNION (not
	// UNION ALL) so the walk terminates even if existing data already cycles.
	const ancestors = await tx.$queryRaw<Array<{ id: string }>>`
		WITH RECURSIVE ancestor AS (
			SELECT id, parent_id
			FROM incident_cause_node
			WHERE id = ${parentId}::uuid
				AND case_id = ${incidentId}::uuid
			UNION
			SELECT node.id, node.parent_id
			FROM incident_cause_node node
			JOIN ancestor ON node.id = ancestor.parent_id
			WHERE node.case_id = ${incidentId}::uuid
		)
		SELECT id::text AS id
		FROM ancestor
	`;

	if (ancestors.length === 0) {
		throw new InvalidCauseReferenceError("INVALID_CAUSE_PARENT");
	}

	if (ancestors.some((ancestor) => ancestor.id.toLowerCase() === movedId)) {
		throw new InvalidCauseReferenceError("INVALID_CAUSE_PARENT");
	}
}

/**
 * Renumbers the sibling group under `parentId` (0..n-1, gap-free) so the
 * moved node sits before `beforeId`, or last when `beforeId` is null.
 * `beforeId` must reference another node of the same case inside the same
 * destination group. Callers must already hold the per-case advisory lock.
 * Returns the moved node's new order_index.
 */
async function repositionCauseNode(
	tx: TenantTx,
	incidentId: string,
	nodeId: string,
	parentId: string | null,
	beforeId: string | null,
): Promise<number> {
	const siblings = await tx.$queryRaw<Array<{ id: string }>>`
		SELECT id::text AS id
		FROM incident_cause_node
		WHERE case_id = ${incidentId}::uuid
			AND parent_id IS NOT DISTINCT FROM ${parentId}::uuid
			AND id <> ${nodeId}::uuid
		ORDER BY order_index ASC, created_at ASC, id ASC
	`;
	const ordered = siblings.map((sibling) => sibling.id);
	let movedIndex = ordered.length;

	if (beforeId !== null) {
		const target = beforeId.toLowerCase();
		movedIndex = ordered.findIndex((id) => id.toLowerCase() === target);

		if (movedIndex === -1) {
			throw new InvalidCauseReferenceError("INVALID_CAUSE_BEFORE");
		}
	}

	ordered.splice(movedIndex, 0, nodeId);

	for (const [index, id] of ordered.entries()) {
		await tx.$executeRaw`
			UPDATE incident_cause_node
			SET order_index = ${index}, updated_at = CURRENT_TIMESTAMP
			WHERE id = ${id}::uuid
				AND case_id = ${incidentId}::uuid
				AND order_index IS DISTINCT FROM ${index}
		`;
	}

	return movedIndex;
}

async function insertCauseNode(
	tx: TenantTx,
	incidentId: string,
	payload: CauseNodeMutation,
): Promise<IncidentCauseNode | null> {
	const nodeId = randomUUID();
	const rows = await tx.$queryRaw<IncidentCauseNode[]>`
		INSERT INTO incident_cause_node (
			id,
			case_id,
			parent_id,
			timeline_event_id,
			order_index,
			statement,
			question,
			is_root_cause,
			branch_status
		)
		SELECT
			${nodeId}::uuid,
			incident_case.id,
			${payload.parentId ?? null}::uuid,
			${payload.timelineEventId ?? null}::uuid,
			COALESCE(
				(
					SELECT MAX(order_index) + 1
					FROM incident_cause_node
					WHERE case_id = ${incidentId}::uuid
						AND parent_id IS NOT DISTINCT FROM ${payload.parentId ?? null}::uuid
				),
				0
			),
			${payload.statement},
			${payload.question ?? null},
			${payload.isRootCause ?? false},
			${payload.branchStatus ?? "OPEN"}
		FROM incident_case
		WHERE incident_case.id = ${incidentId}::uuid
		RETURNING
			id::text AS id,
			case_id::text AS "caseId",
			parent_id::text AS "parentId",
			timeline_event_id::text AS "timelineEventId",
			order_index AS "orderIndex",
			statement,
			question,
			is_root_cause AS "isRootCause",
			branch_status AS "branchStatus",
			created_at AS "createdAt",
			updated_at AS "updatedAt"
	`;

	return rows[0] ?? null;
}

async function listCauseNodes(
	tx: TenantTx,
	incidentId: string,
): Promise<IncidentCauseNode[]> {
	return tx.$queryRaw<IncidentCauseNode[]>`
		SELECT
			id::text AS id,
			case_id::text AS "caseId",
			parent_id::text AS "parentId",
			timeline_event_id::text AS "timelineEventId",
			order_index AS "orderIndex",
			statement,
			question,
			is_root_cause AS "isRootCause",
			branch_status AS "branchStatus",
			created_at AS "createdAt",
			updated_at AS "updatedAt"
		FROM incident_cause_node
		WHERE case_id = ${incidentId}::uuid
		ORDER BY order_index ASC, created_at ASC, id ASC
	`;
}
