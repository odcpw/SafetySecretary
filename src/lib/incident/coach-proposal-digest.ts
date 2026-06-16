import type { AgentStructuredOperation } from "../agent/types";
import { withTenantConnection } from "../db";

export type CoachProposalStatus = "applied" | "dismissed" | "pending";

export type CoachProposalDigestEntry = {
	readonly createdAt: string;
	readonly gist: string;
	readonly kind: string;
	readonly messageId: string;
	readonly operationId: string;
	readonly recordId?: string | null;
	readonly status: CoachProposalStatus;
};

export type CoachProposalDigest = {
	readonly applied: readonly CoachProposalDigestEntry[];
	readonly dismissed: readonly CoachProposalDigestEntry[];
	readonly pending: readonly CoachProposalDigestEntry[];
	readonly statusCounts: Readonly<Record<CoachProposalStatus, number>>;
	readonly totalConsidered: number;
};

export type CoachProposalDuplicateInput = {
	readonly index: number;
	readonly operation: Pick<AgentStructuredOperation, "kind" | "payload">;
};

type CoachProposalMessage = {
	readonly createdAt: Date | string;
	readonly id: string;
	readonly operationDecisions: unknown;
	readonly operations: unknown;
};

type CoachOperationDecision = {
	readonly recordId?: string | null;
	readonly status: "applied" | "dismissed";
};

export async function readIncidentCoachProposalDigest(input: {
	readonly incidentId: string;
	readonly tenantId: string;
	readonly limit?: number;
	readonly maxEntriesPerStatus?: number;
}): Promise<CoachProposalDigest> {
	const limit = input.limit ?? 40;

	return withTenantConnection(input.tenantId, async (tx) => {
		const rows = await tx.$queryRaw<CoachProposalMessage[]>`
			SELECT
				id::text AS id,
				operations,
				operation_decisions AS "operationDecisions",
				created_at AS "createdAt"
			FROM incident_coach_message
			WHERE case_id = ${input.incidentId}::uuid
				AND role = 'assistant'
				AND jsonb_array_length(operations) > 0
			ORDER BY created_at DESC, id DESC
			LIMIT ${limit}
		`;

		return buildCoachProposalDigestFromMessages(rows.toReversed(), {
			maxEntriesPerStatus: input.maxEntriesPerStatus,
		});
	});
}

export function buildCoachProposalDigestFromMessages(
	messages: readonly CoachProposalMessage[],
	options: { readonly maxEntriesPerStatus?: number } = {},
): CoachProposalDigest {
	const maxEntriesPerStatus = options.maxEntriesPerStatus ?? 18;
	const entries: CoachProposalDigestEntry[] = [];

	for (const message of messages) {
		const operations = operationList(message.operations);
		const decisions = decisionMap(message.operationDecisions);

		for (const operation of operations) {
			const decision = decisions[operation.id];
			const status = decision?.status ?? "pending";

			entries.push({
				createdAt: isoString(message.createdAt),
				gist: operationGist(operation),
				kind: operation.kind,
				messageId: message.id,
				operationId: operation.id,
				...(decision?.recordId ? { recordId: decision.recordId } : {}),
				status,
			});
		}
	}

	const pending = entries.filter((entry) => entry.status === "pending");
	const applied = entries.filter((entry) => entry.status === "applied");
	const dismissed = entries.filter((entry) => entry.status === "dismissed");

	return {
		applied: lastEntries(applied, maxEntriesPerStatus),
		dismissed: lastEntries(dismissed, maxEntriesPerStatus),
		pending: lastEntries(pending, maxEntriesPerStatus),
		statusCounts: {
			applied: applied.length,
			dismissed: dismissed.length,
			pending: pending.length,
		},
		totalConsidered: entries.length,
	};
}

export function findDuplicateCoachProposalOperations(input: {
	readonly operations: readonly CoachProposalDuplicateInput[];
	readonly proposalDigest: CoachProposalDigest;
}): Array<{ readonly index: number; readonly message: string }> {
	const entries = [
		...input.proposalDigest.pending,
		...input.proposalDigest.applied,
		...input.proposalDigest.dismissed,
	];
	const errors: Array<{ index: number; message: string }> = [];

	for (const candidate of input.operations) {
		const gist = normalizeProposalGist(operationGist(candidate.operation));
		if (!gist) {
			continue;
		}

		const duplicate = entries.find(
			(entry) =>
				entry.kind === candidate.operation.kind &&
				normalizeProposalGist(entry.gist) === gist,
		);

		if (duplicate) {
			errors.push({
				index: candidate.index,
				message: `Duplicate ${duplicate.status} proposal already exists: ${duplicate.kind} "${duplicate.gist}". Do not re-propose pending, applied, or dismissed cards unless new information materially changes the operation.`,
			});
		}
	}

	return errors;
}

function operationList(value: unknown): AgentStructuredOperation[] {
	return Array.isArray(value)
		? value.filter(isAgentStructuredOperation)
		: [];
}

function isAgentStructuredOperation(
	value: unknown,
): value is AgentStructuredOperation {
	const operation = asRecord(value);
	return (
		typeof operation.id === "string" &&
		typeof operation.kind === "string" &&
		operation.payload !== null &&
		typeof operation.payload === "object" &&
		!Array.isArray(operation.payload)
	);
}

function decisionMap(
	value: unknown,
): Record<string, CoachOperationDecision | undefined> {
	const record = asRecord(value);
	const decisions: Record<string, CoachOperationDecision | undefined> = {};

	for (const [operationId, rawDecision] of Object.entries(record)) {
		const decision = asRecord(rawDecision);
		const status = decision.status;

		if (status !== "applied" && status !== "dismissed") {
			continue;
		}

		decisions[operationId] = {
			...(typeof decision.recordId === "string"
				? { recordId: decision.recordId }
				: {}),
			status,
		};
	}

	return decisions;
}

function operationGist(
	operation: Pick<AgentStructuredOperation, "kind" | "payload">,
): string {
	const payload = operation.payload as unknown as Record<string, unknown>;

	if (operation.kind === "incident_field_update") {
		return truncate(`${String(payload.field)}=${String(payload.value)}`);
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
			return truncate(candidate.trim());
		}
	}

	return operation.kind;
}

function lastEntries<T>(entries: readonly T[], max: number): readonly T[] {
	return entries.length > max ? entries.slice(entries.length - max) : entries;
}

function truncate(value: string): string {
	return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}

function normalizeProposalGist(value: string): string {
	return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function isoString(value: Date | string): string {
	return value instanceof Date ? value.toISOString() : value;
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}
