import { randomUUID } from "node:crypto";
import { z } from "zod";

export const PROCESS_MAP_OPERATION_KINDS = [
	"node_add",
	"node_update",
	"node_move",
	"edge_add",
	"edge_remove",
	"flow_add",
	"flow_remove",
	"resource_add",
	"resource_remove",
	"ask_question",
] as const;

const nodeKindSchema = z.enum(["PROCESS", "SUBPROCESS", "ACTIVITY"]);
const sourceConfidenceSchema = z.enum(["DIRECT", "HEARSAY"]);
const flowDirectionSchema = z.enum(["IN", "OUT"]);
const flowTypeSchema = z.enum(["MATERIAL", "INFORMATION"]);
const resourceTypeSchema = z.enum(["ROLE", "EQUIPMENT", "MATERIAL_POOL"]);

const rawOperationSchema = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("node_add"),
		ref: z.string().min(1).optional(),
		payload: z.object({
			parentRef: z.string().min(1).optional(),
			kind: nodeKindSchema,
			name: z.string().min(1),
			description: z.string().min(1).optional(),
			sourceConfidence: sourceConfidenceSchema.optional(),
			whoWouldKnow: z.string().min(1).nullable().optional(),
		}),
	}),
	z.object({
		kind: z.literal("node_update"),
		ref: z.string().min(1).optional(),
		payload: z.object({
			nodeId: z.string().min(1),
			name: z.string().min(1).optional(),
			description: z.string().min(1).nullable().optional(),
			kind: nodeKindSchema.optional(),
			durationNote: z.string().min(1).nullable().optional(),
			frequencyNote: z.string().min(1).nullable().optional(),
			sourceConfidence: sourceConfidenceSchema.optional(),
			whoWouldKnow: z.string().min(1).nullable().optional(),
		}),
	}),
	z.object({
		kind: z.literal("node_move"),
		ref: z.string().min(1).optional(),
		payload: z.object({
			nodeId: z.string().min(1),
			newParentRef: z.string().min(1).nullable().optional(),
		}),
	}),
	z.object({
		kind: z.literal("edge_add"),
		ref: z.string().min(1).optional(),
		payload: z.object({
			fromRef: z.string().min(1),
			toRef: z.string().min(1),
			routingNote: z.string().min(1).optional(),
		}),
	}),
	z.object({
		kind: z.literal("edge_remove"),
		ref: z.string().min(1).optional(),
		payload: z.object({
			edgeId: z.string().min(1),
		}),
	}),
	z.object({
		kind: z.literal("flow_add"),
		ref: z.string().min(1).optional(),
		payload: z.object({
			nodeRef: z.string().min(1),
			direction: flowDirectionSchema,
			flowType: flowTypeSchema,
			label: z.string().min(1),
			counterparty: z.string().min(1).optional(),
		}),
	}),
	z.object({
		kind: z.literal("flow_remove"),
		ref: z.string().min(1).optional(),
		payload: z.object({
			flowId: z.string().min(1),
		}),
	}),
	z.object({
		kind: z.literal("resource_add"),
		ref: z.string().min(1).optional(),
		payload: z.object({
			nodeRef: z.string().min(1),
			resourceType: resourceTypeSchema,
			label: z.string().min(1),
			quantityNote: z.string().min(1).optional(),
			returnable: z.boolean().optional(),
		}),
	}),
	z.object({
		kind: z.literal("resource_remove"),
		ref: z.string().min(1).optional(),
		payload: z.object({
			resourceId: z.string().min(1),
		}),
	}),
	z.object({
		kind: z.literal("ask_question"),
		ref: z.string().min(1).optional(),
		payload: z.object({
			question: z.string().min(1),
		}),
	}),
]);

export type ProcessMapOperationKind =
	(typeof PROCESS_MAP_OPERATION_KINDS)[number];
type RawProcessMapOperation = z.infer<typeof rawOperationSchema>;

export type ProcessMapOperation = RawProcessMapOperation & {
	readonly id: string;
};

export type ParsedProcessMapCoachResponse = {
	readonly reply: string;
	readonly operations: readonly ProcessMapOperation[];
};

export function parseProcessMapOperations(
	raw: unknown,
): readonly ProcessMapOperation[] {
	const rawOperations = Array.isArray(raw) ? raw : [];
	const parsedOperations = rawOperations.map((operation) =>
		rawOperationSchema.parse(stripNullOptionals(operation)),
	);
	const refToOperationId = new Map<string, string>();
	const withIds = parsedOperations.map((operation) => {
		const id = randomUUID();
		if (operation.ref) {
			refToOperationId.set(operation.ref, id);
		}
		return { ...operation, id };
	});

	return withIds.map((operation) => {
		const rewired = rawOperationSchema.parse({
			...operation,
			payload: rewirePayloadReferences(operation.payload, refToOperationId),
		});
		return { ...rewired, id: operation.id };
	});
}

export function parseProcessMapCoachResponse(
	responseText: string,
): ParsedProcessMapCoachResponse {
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
	const reply =
		typeof record.reply === "string" && record.reply.trim()
			? record.reply.trim()
			: rawOperations.length > 0
				? "I captured some process-map suggestions for review."
				: fallbackReply;

	try {
		return {
			operations: parseProcessMapOperations(rawOperations),
			reply,
		};
	} catch (error) {
		console.warn(
			"[process-map-coach] dropped invalid structured operations:",
			error instanceof Error ? error.message : error,
		);
		return { operations: [], reply };
	}
}

function rewirePayloadReferences(
	payload: Record<string, unknown>,
	refToOperationId: ReadonlyMap<string, string>,
): Record<string, unknown> {
	const next = { ...payload };
	for (const key of [
		"parentRef",
		"newParentRef",
		"fromRef",
		"toRef",
		"nodeRef",
	]) {
		const value = next[key];
		if (typeof value === "string" && refToOperationId.has(value)) {
			next[key] = refToOperationId.get(value);
		}
	}
	return next;
}

function stripNullOptionals(value: unknown): unknown {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return value;
	}

	const operation = value as {
		readonly kind?: unknown;
		readonly ref?: unknown;
		readonly payload?: unknown;
	};
	if (
		!operation.payload ||
		typeof operation.payload !== "object" ||
		Array.isArray(operation.payload)
	) {
		return value;
	}

	const payload = { ...(operation.payload as Record<string, unknown>) };
	for (const key of Object.keys(payload)) {
		if (
			payload[key] === null &&
			key !== "description" &&
			key !== "whoWouldKnow"
		) {
			delete payload[key];
		}
	}

	return { ...operation, payload };
}

function extractJson(text: string): string {
	const trimmed = text.trim();
	if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
		return trimmed;
	}

	const start = trimmed.indexOf("{");
	const end = trimmed.lastIndexOf("}");
	if (start >= 0 && end > start) {
		return trimmed.slice(start, end + 1);
	}

	throw new Error("No JSON object found.");
}

function asRecord(value: unknown): Record<string, unknown> {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: {};
}
