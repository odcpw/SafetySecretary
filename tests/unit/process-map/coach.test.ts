import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (!context.parentURL || !isLocalImport(specifier)) {
			return nextResolve(specifier, context);
		}

		const candidates = [
			new URL(`${specifier}.ts`, context.parentURL),
			new URL(`${specifier}.tsx`, context.parentURL),
			new URL(`${specifier}.json`, context.parentURL),
			new URL(`${specifier}/index.ts`, context.parentURL),
		];
		const resolved = candidates.find((candidate) => existsSync(candidate));

		if (resolved) {
			return {
				shortCircuit: true,
				url: resolved.href,
			};
		}

		return nextResolve(specifier, context);
	},
});

const {
	buildProcessMapCoachPrompt,
	computeProcessMapPhase,
} = (await import(
	moduleUrl("src/lib/process-map/coach-prompt.ts")
)) as typeof import("../../../src/lib/process-map/coach-prompt");
const {
	parseProcessMapCoachResponse,
	parseProcessMapOperations,
} = (await import(
	moduleUrl("src/lib/process-map/operations.ts")
)) as typeof import("../../../src/lib/process-map/operations");
const { computeProcessMapReadiness } = (await import(
	moduleUrl("src/lib/process-map/readiness.ts")
)) as typeof import("../../../src/lib/process-map/readiness");
const { dispatch } = (await import(
	moduleUrl("src/lib/llm/dispatch.ts")
)) as typeof import("../../../src/lib/llm/dispatch");
const { MockProvider, hashOfPrompt } = (await import(
	moduleUrl("src/lib/llm/mock.ts")
)) as typeof import("../../../src/lib/llm/mock");
const { KindEnum } = (await import(
	moduleUrl("src/lib/llm/types.ts")
)) as typeof import("../../../src/lib/llm/types");

const PM_COACH_PROMPT_PURPOSE = "process_map_coach_turn";

test("process-map operations parse, reject invalid kinds, and rewire refs", () => {
	const operations = parseProcessMapOperations([
		{
			kind: "node_add",
			payload: {
				kind: "ACTIVITY",
				name: "Receive order",
				sourceConfidence: "HEARSAY",
				whoWouldKnow: "Sales",
			},
			ref: "n1",
		},
		{
			kind: "node_add",
			payload: { kind: "ACTIVITY", name: "Pick goods" },
			ref: "n2",
		},
		{
			kind: "edge_add",
			payload: { fromRef: "n1", toRef: "n2" },
		},
		{
			kind: "node_remove",
			payload: { nodeId: "n2" },
		},
	]);

	assert.equal(operations.length, 4);
	const firstNode = operations[0];
	const secondNode = operations[1];
	const edge = operations[2];
	const remove = operations[3];
	assert.ok(firstNode);
	assert.ok(secondNode);
	assert.ok(firstNode.kind === "node_add");
	assert.equal(firstNode.payload.sourceConfidence, "HEARSAY");
	assert.equal(firstNode.payload.whoWouldKnow, "Sales");
	assert.ok(edge?.kind === "edge_add");
	assert.equal(edge.payload.fromRef, firstNode.id);
	assert.equal(edge.payload.toRef, secondNode.id);
	assert.ok(remove?.kind === "node_remove");
	assert.equal(remove.payload.nodeId, secondNode.id);

	assert.throws(() =>
		parseProcessMapOperations([
			{ kind: "not_a_kind", payload: { name: "Nope" } },
		]),
	);
	assert.throws(() =>
		parseProcessMapOperations([
			{
				kind: "flow_add",
				payload: {
					direction: "OUT",
					flowType: "MONEY",
					label: "Invoice value",
					nodeRef: firstNode.id,
				},
			},
		]),
	);
});

test("process-map readiness flags fork notes and leaf roles, then passes", () => {
	const ids = fixtureIds();
	const nodes = [
		node({
			description: "The office receives the order and checks it.",
			id: ids.a,
			name: "Receive order",
		}),
		node({
			description: "The molding line makes molded parts.",
			id: ids.b,
			name: "Molding line",
		}),
		node({
			description: "The injection line makes injected parts.",
			id: ids.c,
			name: "Injection line",
		}),
	];
	const broken = computeProcessMapReadiness({
		edges: [
			edge({ fromNodeId: ids.a, toNodeId: ids.b }),
			edge({
				fromNodeId: ids.a,
				routingNote: "Injection jobs use machine B",
				toNodeId: ids.c,
			}),
		],
		nodes,
		resources: [
			role({ nodeId: ids.a }),
			role({ nodeId: ids.b }),
		],
	});

	assert.equal(broken.ready, false);
	assert.ok(broken.items.some((item) => item.code === "FORK_UNEXPLAINED"));
	assert.ok(broken.items.some((item) => item.code === "LEAF_WITHOUT_ROLE"));

	const fixed = computeProcessMapReadiness({
		edges: [
			edge({
				fromNodeId: ids.a,
				routingNote: "Molding jobs use machine A",
				toNodeId: ids.b,
			}),
			edge({
				fromNodeId: ids.a,
				routingNote: "Injection jobs use machine B",
				toNodeId: ids.c,
			}),
		],
		nodes,
		resources: [role({ nodeId: ids.a }), role({ nodeId: ids.b }), role({ nodeId: ids.c })],
	});

	assert.deepEqual(fixed, {
		items: [],
		questLog: {
			clearCount: 3,
			fogCount: 0,
			hazeCount: 0,
			quests: [],
		},
		ready: true,
	});
});

test("process-map readiness derives quest log fog states", () => {
	const ids = fixtureIds();
	const clear = node({
		description: "Operator receives the order and checks the delivery date.",
		id: ids.a,
		name: "Receive order",
	});
	const haze = node({
		description: "Billing prepares the monthly invoice.",
		id: ids.b,
		name: "Monthly billing",
		sourceConfidence: "HEARSAY",
		whoWouldKnow: "Frau Keller",
	});
	const fog = node({
		description: "unexplored",
		id: ids.c,
		name: "Damage recharge",
		sourceConfidence: "HEARSAY",
		whoWouldKnow: "Yard lead",
	});

	const readiness = computeProcessMapReadiness({
		edges: [
			edge({ fromNodeId: ids.a, toNodeId: ids.b }),
			edge({ fromNodeId: ids.b, toNodeId: ids.c }),
		],
		nodes: [clear, haze, fog],
		resources: [role({ nodeId: ids.a }), role({ nodeId: ids.b })],
	});

	assert.deepEqual(readiness.questLog, {
		clearCount: 1,
		fogCount: 1,
		hazeCount: 1,
		quests: [
			{
				nodeId: ids.b,
				nodeName: "Monthly billing",
				whoWouldKnow: "Frau Keller",
			},
			{
				nodeId: ids.c,
				nodeName: "Damage recharge",
				whoWouldKnow: "Yard lead",
			},
		],
	});
});

test("process-map readiness treats ownership gaps separately from fog", () => {
	const ids = fixtureIds();
	const directWithoutRole = node({
		description: "The baker checks the order list before dough prep starts.",
		id: ids.a,
		name: "Review order list",
	});
	const explicitStub = node({
		description: "unexplored",
		id: ids.b,
		name: "Weekly invoicing",
		sourceConfidence: "DIRECT",
		whoWouldKnow: "Office",
	});
	const hearsaySubstantive = node({
		description: "The office prepares the invoice from delivery notes.",
		id: ids.c,
		name: "Prepare invoice",
		sourceConfidence: "HEARSAY",
		whoWouldKnow: "Office",
	});

	const readiness = computeProcessMapReadiness({
		edges: [
			edge({ fromNodeId: ids.a, toNodeId: ids.b }),
			edge({ fromNodeId: ids.b, toNodeId: ids.c }),
		],
		nodes: [directWithoutRole, explicitStub, hearsaySubstantive],
		resources: [],
	});

	assert.ok(
		readiness.items.some((item) => item.code === "LEAF_WITHOUT_ROLE"),
	);
	assert.deepEqual(readiness.questLog, {
		clearCount: 1,
		fogCount: 1,
		hazeCount: 1,
		quests: [
			{
				nodeId: ids.b,
				nodeName: "Weekly invoicing",
				whoWouldKnow: "Office",
			},
			{
				nodeId: ids.c,
				nodeName: "Prepare invoice",
				whoWouldKnow: "Office",
			},
		],
	});
});

test("process-map phase signal follows the deterministic gates", () => {
	const ids = fixtureIds();
	const baseMap = processMap();
	const first = node({ id: ids.a, name: "Receive order" });
	const second = node({ id: ids.b, name: "Pick goods" });

	assert.equal(
		computeProcessMapPhase({
			edges: [],
			flows: [],
			map: baseMap,
			nodes: [first],
			resources: [],
		}),
		"SPINE",
	);
	assert.equal(
		computeProcessMapPhase({
			edges: [],
			flows: [],
			map: baseMap,
			nodes: [first, second],
			resources: [],
		}),
		"STRUCTURE",
	);
	assert.equal(
		computeProcessMapPhase({
			edges: [
				edge({ fromNodeId: ids.a, toNodeId: ids.b }),
				edge({ fromNodeId: ids.a, toNodeId: ids.c }),
			],
			flows: [],
			map: baseMap,
			nodes: [first, second, node({ id: ids.c, name: "Pack goods" })],
			resources: [],
		}),
		"DETAIL",
	);
	assert.equal(
		computeProcessMapPhase({
			edges: [edge({ fromNodeId: ids.a, toNodeId: ids.b })],
			flows: [],
			map: baseMap,
			nodes: [first, second],
			resources: [],
		}),
		"RESOURCES",
	);
	assert.equal(
		computeProcessMapPhase({
			edges: [edge({ fromNodeId: ids.a, toNodeId: ids.b })],
			flows: [],
			map: baseMap,
			nodes: [first, second],
			resources: [role({ nodeId: ids.a }), role({ nodeId: ids.b })],
		}),
		"REVIEW",
	);
});

test("process-map phase signal consolidates oversized and duplicate-looking maps", () => {
	const baseMap = processMap();
	const manySiblings = Array.from({ length: 13 }, (_value, index) =>
		node({
			description: `Step ${index + 1} is described.`,
			id: randomUUID(),
			name: `Step ${index + 1}`,
		}),
	);

	assert.equal(
		computeProcessMapPhase({
			edges: manySiblings
				.slice(0, -1)
				.map((current, index) =>
					edge({ fromNodeId: current.id, toNodeId: manySiblings[index + 1]?.id ?? current.id }),
				),
			flows: [],
			map: baseMap,
			nodes: manySiblings,
			resources: manySiblings.map((entry) => role({ nodeId: entry.id })),
		}),
		"CONSOLIDATE",
	);

	const ids = fixtureIds();
	assert.equal(
		computeProcessMapPhase({
			edges: [edge({ fromNodeId: ids.a, toNodeId: ids.b })],
			flows: [],
			map: baseMap,
			nodes: [
				node({ id: ids.a, name: "Foreman flags mod need" }),
				node({ id: ids.b, name: "Foreman flags mod need" }),
			],
			resources: [role({ nodeId: ids.a }), role({ nodeId: ids.b })],
		}),
		"CONSOLIDATE",
	);
});

test("process-map phase signal yields to resources once a routed spine exists", () => {
	const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
	const nodes = ids.map((id, index) =>
		node({
			description: `Step ${index + 1} is described.`,
			id,
			name: `Process step ${index + 1}`,
		}),
	);

	assert.equal(
		computeProcessMapPhase({
			edges: [
				edge({ fromNodeId: ids[0] ?? "", toNodeId: ids[1] ?? "" }),
				edge({ fromNodeId: ids[1] ?? "", routingNote: "Normal path", toNodeId: ids[2] ?? "" }),
				edge({ fromNodeId: ids[1] ?? "", routingNote: "Exception path", toNodeId: ids[3] ?? "" }),
				edge({ fromNodeId: ids[3] ?? "", toNodeId: ids[4] ?? "" }),
			],
			flows: [],
			map: processMap(),
			nodes,
			resources: [],
		}),
		"RESOURCES",
	);
});

test("process-map prompt phase-gates the SPINE coaching section", () => {
	const prompt = buildProcessMapCoachPrompt({
		conversation: [],
		edges: [],
		flows: [],
		locale: "en",
		map: processMap(),
		nodes: [],
		resources: [],
	});

	assert.match(prompt, /Pick one concrete thing/);
	assert.match(prompt, /NEVER ask for money amounts/);
	assert.match(prompt, /Loop rule: close every loop/i);
	assert.match(prompt, /Hedging discipline: NEVER write "confirm with X" or "to confirm" in descriptions/);
	assert.match(prompt, /node_remove to eliminate duplicates or dead blocks/);
	assert.doesNotMatch(prompt, /ACTIVE COACHING SECTION — STRUCTURE/);
	assert.doesNotMatch(prompt, /ACTIVE COACHING SECTION — RESOURCES/);
});

test("process-map mock dispatch response parses proposed nodes and refs", async () => {
	const prompt = buildProcessMapCoachPrompt({
		conversation: [{ content: "We receive the order, pick it, then dispatch.", role: "user" }],
		edges: [],
		flows: [],
		locale: "en",
		map: processMap(),
		nodes: [],
		resources: [],
	});
	const responseText = JSON.stringify({
		operations: [
			{
				kind: "node_add",
				payload: { kind: "ACTIVITY", name: "Receive order" },
				ref: "n1",
			},
			{
				kind: "node_add",
				payload: { kind: "ACTIVITY", name: "Pick goods" },
				ref: "n2",
			},
			{
				kind: "edge_add",
				payload: { fromRef: "n1", toRef: "n2" },
			},
		],
		reply: "I have the first two blocks. What happens after picking?",
	});
	const mockProvider = new MockProvider({
		text: [
			{
				hashOfPrompt: hashOfPrompt(prompt),
				promptPurpose: PM_COACH_PROMPT_PURPOSE,
				response: {
					model: "mock-process-map-coach",
					provider: "mock",
					text: responseText,
				},
			},
		],
		vision: [],
	});

	const result = await dispatch(
		{
			options: {
				kind: KindEnum.Authoring,
				locale: "en",
				promptPurpose: PM_COACH_PROMPT_PURPOSE,
				requiresVision: false,
				tenantId: randomUUID(),
				userId: randomUUID(),
				workflowId: randomUUID(),
			},
			prompt,
		},
		{ env: { NODE_ENV: "test" }, mockProvider },
	);

	assert.equal(result.ok, true);
	if (!result.ok) {
		return;
	}
	const parsed = parseProcessMapCoachResponse(result.response.text);
	assert.equal(parsed.reply, "I have the first two blocks. What happens after picking?");
	assert.equal(parsed.operations.length, 3);
	const parsedEdge = parsed.operations[2];
	assert.ok(parsedEdge?.kind === "edge_add");
	assert.equal(parsedEdge.payload.fromRef, parsed.operations[0]?.id);
	assert.equal(parsedEdge.payload.toRef, parsed.operations[1]?.id);
});

function processMap() {
	const now = new Date("2026-07-08T08:00:00.000Z");
	return {
		contentLanguage: "en",
		createdAt: now,
		createdBy: randomUUID(),
		deletedAt: null,
		id: randomUUID(),
		scopeNote: null,
		status: "DRAFT" as const,
		title: "Dispatch process",
		updatedAt: now,
	};
}

function node(input: {
	readonly id: string;
	readonly name: string;
	readonly description?: string | null;
	readonly sourceConfidence?: "DIRECT" | "HEARSAY";
	readonly whoWouldKnow?: string | null;
}) {
	const now = new Date("2026-07-08T08:00:00.000Z");
	return {
		createdAt: now,
		description: input.description ?? null,
		durationNote: null,
		frequencyNote: null,
		id: input.id,
		kind: "ACTIVITY" as const,
		mapId: randomUUID(),
		name: input.name,
		orderIndex: 0,
		parentId: null,
		sourceConfidence: input.sourceConfidence ?? ("DIRECT" as const),
		updatedAt: now,
		whoWouldKnow: input.whoWouldKnow ?? null,
	};
}

function edge(input: {
	readonly fromNodeId: string;
	readonly toNodeId: string;
	readonly routingNote?: string | null;
}) {
	const now = new Date("2026-07-08T08:00:00.000Z");
	return {
		createdAt: now,
		fromNodeId: input.fromNodeId,
		id: randomUUID(),
		mapId: randomUUID(),
		orderIndex: 0,
		routingNote: input.routingNote ?? null,
		toNodeId: input.toNodeId,
		updatedAt: now,
	};
}

function role(input: { readonly nodeId: string }) {
	const now = new Date("2026-07-08T08:00:00.000Z");
	return {
		createdAt: now,
		id: randomUUID(),
		label: "Operator",
		mapId: randomUUID(),
		nodeId: input.nodeId,
		orderIndex: 0,
		quantityNote: null,
		resourceType: "ROLE" as const,
		returnable: false,
		updatedAt: now,
	};
}

function fixtureIds(): {
	readonly a: string;
	readonly b: string;
	readonly c: string;
} {
	return {
		a: randomUUID(),
		b: randomUUID(),
		c: randomUUID(),
	};
}

function moduleUrl(relativePath: string): string {
	return pathToFileURL(`${process.cwd()}/${relativePath}`).href;
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith(".") || specifier.startsWith("/");
}
