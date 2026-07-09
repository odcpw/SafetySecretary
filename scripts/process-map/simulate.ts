#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type {
	ProcessMapCoachTranscriptMessage,
	ProcessMapPhase,
} from "../../src/lib/process-map/coach-prompt";
import type {
	ProcessEdge,
	ProcessFlow,
	ProcessMap,
	ProcessNode,
	ProcessResource,
} from "../../src/lib/process-map/index";
import type {
	ProcessMapOperation,
	ProcessMapOperationKind,
} from "../../src/lib/process-map/operations";
import type {
	ProcessMapFogState,
	ProcessMapReadiness,
} from "../../src/lib/process-map/readiness";
import type {
	ProcessMapPersona,
	ProcessMapPersonaName,
} from "./personas";

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

type LoadedProcessMap = {
	readonly map: ProcessMap;
	readonly nodes: readonly ProcessNode[];
	readonly flows: readonly ProcessFlow[];
	readonly edges: readonly ProcessEdge[];
	readonly resources: readonly ProcessResource[];
};

type OperationApplyLog = {
	readonly turn: number;
	readonly operation: ProcessMapOperation;
	readonly ok: boolean;
	readonly code?: string;
	readonly question?: boolean;
	readonly recordId?: string | null;
};

type TurnLog = {
	readonly turn: number;
	readonly narrator: string;
	readonly coach: string;
	readonly operations: readonly OperationApplyLog[];
	readonly phase: ProcessMapPhase;
	readonly ready: boolean;
};

type OperationStats = {
	proposed: number;
	applied: number;
	failed: number;
	questions: number;
	byKind: Record<ProcessMapOperationKind, { proposed: number; applied: number; failed: number }>;
};

type ParsedArgs = {
	readonly help?: boolean;
	readonly keep?: boolean;
	readonly maxTurns?: string;
	readonly persona?: string;
};

const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1"]);
const DEFAULT_MAX_TURNS = 24;

const args = parseArgs(process.argv.slice(2));

try {
	if (args.help) {
		printHelp();
		process.exit(0);
	}

	const personaName = parsePersonaName(args.persona);
	const maxTurns = parseMaxTurns(args.maxTurns);
	assertLocalDatabase(process.env.DATABASE_URL, "DATABASE_URL");

	const [
		{ PERSONAS, generateNarratorTurn },
		processMapStore,
		processMapCoach,
		processMapApply,
		processMapPrompt,
		processMapReadiness,
		db,
	] = await Promise.all([
		import(moduleUrl("scripts/process-map/personas.ts")),
		import(moduleUrl("src/lib/process-map/index.ts")),
		import(moduleUrl("src/lib/process-map/coach-turn.ts")),
		import(moduleUrl("src/lib/process-map/apply-operation.ts")),
		import(moduleUrl("src/lib/process-map/coach-prompt.ts")),
		import(moduleUrl("src/lib/process-map/readiness.ts")),
		import(moduleUrl("src/lib/db/index.ts")),
	]);

	const persona = PERSONAS[personaName] as ProcessMapPersona;
	const tenant = await createLabTenant({
		personaName,
		prisma: db.prisma,
	});
	let keepTenant = args.keep === true;

	try {
		const processMap = await processMapStore.createProcessMap(tenant.tenantId, {
			contentLanguage: "en",
			createdBy: tenant.userId,
			scopeNote: `Simulation persona: ${personaName}`,
			title: `${persona.company} process map`,
		});

		const result = await runSimulation({
			applyProcessMapOperation: processMapApply.applyProcessMapOperation,
			computeProcessMapPhase: processMapPrompt.computeProcessMapPhase,
			computeProcessMapReadiness: processMapReadiness.computeProcessMapReadiness,
			deriveProcessMapFogState: processMapReadiness.deriveProcessMapFogState,
			dispatchOptions: localSimulationDispatchOptions(),
			generateNarratorTurn,
			loadProcessMap: processMapStore.loadProcessMap,
			mapId: processMap.id,
			maxTurns,
			persona,
			personaName,
			runProcessMapCoachTurn: processMapCoach.runProcessMapCoachTurn,
			tenantId: tenant.tenantId,
			userId: tenant.userId,
		});

		writeSimulationArtifacts(result);
		console.log(
			JSON.stringify(
				{
					mapPath: join(result.outputDir, "map.md"),
					persona: personaName,
					readiness: result.readiness,
					stats: result.stats,
					transcriptPath: join(result.outputDir, "transcript.md"),
					turnsUsed: result.turnsUsed,
				},
				null,
				2,
			),
		);
	} catch (error) {
		keepTenant = keepTenant || args.keep === true;
		throw error;
	} finally {
		if (keepTenant) {
			console.error(
				JSON.stringify(
					{ keptLabTenantId: tenant.tenantId, keptLabUserId: tenant.userId },
					null,
					2,
				),
			);
		} else {
			await cleanupLabTenant({
				dropTenantSchema: db.dropTenantSchema,
				prisma: db.prisma,
				tenantId: tenant.tenantId,
				userId: tenant.userId,
			});
		}
		await db.prisma.$disconnect();
	}
} catch (error) {
	console.error(error instanceof Error ? error.stack : error);
	process.exit(1);
}

async function runSimulation(input: {
	readonly personaName: ProcessMapPersonaName;
	readonly persona: ProcessMapPersona;
	readonly tenantId: string;
	readonly userId: string;
	readonly mapId: string;
	readonly maxTurns: number;
	readonly generateNarratorTurn: typeof import("./personas").generateNarratorTurn;
	readonly runProcessMapCoachTurn: typeof import("../../src/lib/process-map/coach-turn").runProcessMapCoachTurn;
	readonly applyProcessMapOperation: typeof import("../../src/lib/process-map/apply-operation").applyProcessMapOperation;
	readonly loadProcessMap: typeof import("../../src/lib/process-map/index").loadProcessMap;
	readonly computeProcessMapPhase: typeof import("../../src/lib/process-map/coach-prompt").computeProcessMapPhase;
	readonly computeProcessMapReadiness: typeof import("../../src/lib/process-map/readiness").computeProcessMapReadiness;
	readonly deriveProcessMapFogState: typeof import("../../src/lib/process-map/readiness").deriveProcessMapFogState;
	readonly dispatchOptions: import("../../src/lib/llm/dispatch").DispatchOptions;
}): Promise<{
	readonly outputDir: string;
	readonly fogStates: Readonly<Record<string, ProcessMapFogState>>;
	readonly persona: ProcessMapPersona;
	readonly personaName: ProcessMapPersonaName;
	readonly record: LoadedProcessMap;
	readonly readiness: ProcessMapReadiness;
	readonly stats: OperationStats;
	readonly turns: readonly TurnLog[];
	readonly turnsUsed: number;
}> {
	const conversation: ProcessMapCoachTranscriptMessage[] = [];
	const displayConversation: { role: "narrator" | "coach"; content: string }[] = [];
	const operationRecordMap: Record<string, string | null> = {};
	const stats = emptyOperationStats();
	const turns: TurnLog[] = [];
	let coachQuestion =
		"Pick one concrete thing and walk me through its life from the moment it exists until it is delivered and paid. Do not polish it.";
	let noQuestionNoOpsStreak = 0;
	let record = await requireProcessMap(input.loadProcessMap, input.tenantId, input.mapId);
	let readiness = input.computeProcessMapReadiness(record);

	for (let turn = 1; turn <= input.maxTurns; turn += 1) {
		const narrator = await input.generateNarratorTurn({
			coachQuestion,
			conversation: displayConversation,
			firstTurn: turn === 1,
			mapId: input.mapId,
			persona: input.persona,
			tenantId: input.tenantId,
			userId: input.userId,
			dispatchOptions: input.dispatchOptions,
		});
		console.log(`[${input.personaName}] turn ${turn} narrator: ${narrator}`);

		const coach = await input.runProcessMapCoachTurn({
			conversation,
			locale: "en",
			mapId: input.mapId,
			message: narrator,
			tenantId: input.tenantId,
			userId: input.userId,
			dispatchOptions: input.dispatchOptions,
		});

		if (!coach) {
			throw new Error(`Process map disappeared during simulation: ${input.mapId}`);
		}

		conversation.push({ content: narrator, role: "user" });
		conversation.push({ content: coach.reply, role: "assistant" });
		displayConversation.push({ content: narrator, role: "narrator" });
		displayConversation.push({ content: coach.reply, role: "coach" });

		const operationLogs: OperationApplyLog[] = [];
		for (const operation of coach.operations) {
			stats.proposed += 1;
			stats.byKind[operation.kind].proposed += 1;

			if (operation.kind === "ask_question") {
				operationRecordMap[operation.id] = null;
				stats.questions += 1;
				operationLogs.push({
					ok: true,
					operation,
					question: true,
					recordId: null,
					turn,
				});
				console.log(
					`[${input.personaName}] turn ${turn} op ${operation.kind} ${operation.id}: question`,
				);
				continue;
			}

			const result = await input
				.applyProcessMapOperation({
					mapId: input.mapId,
					operation,
					operationRecordMap,
					tenantId: input.tenantId,
				})
				.catch((error) => ({
					code: `APPLY_EXCEPTION: ${errorMessage(error)}`,
					ok: false as const,
				}));

			if (result.ok) {
				operationRecordMap[operation.id] = result.recordId;
				stats.applied += 1;
				stats.byKind[operation.kind].applied += 1;
				operationLogs.push({
					ok: true,
					operation,
					recordId: result.recordId,
					turn,
				});
			} else {
				operationRecordMap[operation.id] = null;
				stats.failed += 1;
				stats.byKind[operation.kind].failed += 1;
				operationLogs.push({
					code: result.code,
					ok: false,
					operation,
					turn,
				});
			}

			const latest = operationLogs[operationLogs.length - 1];
			console.log(
				`[${input.personaName}] turn ${turn} op ${operation.kind} ${operation.id}: ${
					latest?.ok ? `applied ${latest.recordId ?? ""}`.trim() : `failed ${latest?.code}`
				}`,
			);
		}

		record = await requireProcessMap(input.loadProcessMap, input.tenantId, input.mapId);
		readiness = input.computeProcessMapReadiness(record);
		const phase = input.computeProcessMapPhase(record);
		turns.push({
			coach: coach.reply,
			narrator,
			operations: operationLogs,
			phase,
			ready: readiness.ready,
			turn,
		});

		console.log(
			`[${input.personaName}] turn ${turn} coach ops=${coach.operations.length} phase=${phase} ready=${String(
				readiness.ready,
			)}: ${coach.reply}`,
		);

		if (phase === "REVIEW" && readiness.ready) {
			break;
		}

		if (!containsQuestion(coach.reply) && coach.operations.length === 0) {
			noQuestionNoOpsStreak += 1;
			if (noQuestionNoOpsStreak >= 2) {
				break;
			}
		} else {
			noQuestionNoOpsStreak = 0;
		}

		coachQuestion = coach.reply;
	}

	const outputDir = resolve(
		".tmp/process-map-sims",
		`${input.personaName}-${timestamp(new Date())}`,
	);

	return {
		outputDir,
		fogStates: computeFogStates(record, input.deriveProcessMapFogState),
		persona: input.persona,
		personaName: input.personaName,
		readiness,
		record,
		stats,
		turns,
		turnsUsed: turns.length,
	};
}

function writeSimulationArtifacts(input: {
	readonly outputDir: string;
	readonly fogStates: Readonly<Record<string, ProcessMapFogState>>;
	readonly persona: ProcessMapPersona;
	readonly personaName: ProcessMapPersonaName;
	readonly record: LoadedProcessMap;
	readonly readiness: ProcessMapReadiness;
	readonly stats: OperationStats;
	readonly turns: readonly TurnLog[];
	readonly turnsUsed: number;
}): void {
	mkdirSync(input.outputDir, { recursive: true });
	writeFileSync(join(input.outputDir, "map.md"), renderMapMarkdown(input), "utf8");
	writeFileSync(
		join(input.outputDir, "transcript.md"),
		renderTranscriptMarkdown(input),
		"utf8",
	);
}

function renderMapMarkdown(input: {
	readonly fogStates: Readonly<Record<string, ProcessMapFogState>>;
	readonly personaName: ProcessMapPersonaName;
	readonly record: LoadedProcessMap;
	readonly readiness: ProcessMapReadiness;
	readonly stats: OperationStats;
	readonly turnsUsed: number;
}): string {
	return [
		`# ${input.record.map.title}`,
		"",
		`Persona: ${input.personaName}`,
		`Turns used: ${input.turnsUsed}`,
		"",
		"## Outline",
		"",
		renderOutline(input.record, input.fogStates),
		"",
		"## Edges",
		"",
		renderEdges(input.record),
		"",
		"## Top-Level River",
		"",
		renderMermaid(input.record),
		"",
		"## Readiness",
		"",
		renderReadiness(input.readiness),
		"",
		"## Quest log",
		"",
		renderQuestLog(input.readiness),
		"",
		"## Operation Stats",
		"",
		renderStats(input.stats),
		"",
	].join("\n");
}

function renderTranscriptMarkdown(input: {
	readonly personaName: ProcessMapPersonaName;
	readonly turns: readonly TurnLog[];
}): string {
	const lines = [`# Process Map Simulation Transcript: ${input.personaName}`, ""];
	for (const turn of input.turns) {
		lines.push(`## Turn ${turn.turn}`, "");
		lines.push("### Narrator", "", turn.narrator, "");
		lines.push("### Coach", "", turn.coach, "");
		lines.push("### Operations", "");
		if (turn.operations.length === 0) {
			lines.push("- none");
		} else {
			for (const op of turn.operations) {
				const status = op.ok
					? op.question
						? "question"
						: `applied${op.recordId ? ` -> ${op.recordId}` : ""}`
					: `failed: ${op.code ?? "unknown"}`;
				lines.push(
					`- ${op.operation.kind} ${op.operation.id}: ${status}`,
					`  - payload: \`${escapeInlineCode(JSON.stringify(op.operation.payload))}\``,
				);
			}
		}
		lines.push("", `Phase after turn: ${turn.phase}`, `Ready after turn: ${String(turn.ready)}`, "");
	}
	return `${lines.join("\n")}\n`;
}

function renderOutline(
	record: LoadedProcessMap,
	fogStates: Readonly<Record<string, ProcessMapFogState>>,
): string {
	const childrenByParent = new Map<string | null, ProcessNode[]>();
	for (const node of record.nodes) {
		const siblings = childrenByParent.get(node.parentId) ?? [];
		siblings.push(node);
		childrenByParent.set(node.parentId, siblings);
	}
	for (const siblings of childrenByParent.values()) {
		siblings.sort(compareOrdered);
	}

	const lines: string[] = [];
	const visit = (node: ProcessNode, depth: number): void => {
		const resources = record.resources
			.filter((resource) => resource.nodeId === node.id)
			.map((resource) => {
				const bits = [
					resource.resourceType,
					resource.label,
					resource.quantityNote,
					resource.returnable ? "returnable" : null,
				].filter(Boolean);
				return bits.join(" ");
			});
		const flows = record.flows
			.filter((flow) => flow.nodeId === node.id)
			.map((flow) => `${flow.direction} ${flow.flowType} ${flow.label}${flow.counterparty ? ` (${flow.counterparty})` : ""}`);
		const notes = [
			node.sourceConfidence === "HEARSAY" ? "HEARSAY" : null,
			node.whoWouldKnow ? `who would know: ${node.whoWouldKnow}` : null,
			node.durationNote ? `duration: ${node.durationNote}` : null,
			node.frequencyNote ? `frequency: ${node.frequencyNote}` : null,
			resources.length > 0 ? `resources: ${resources.join("; ")}` : null,
			flows.length > 0 ? `flows: ${flows.join("; ")}` : null,
		].filter(Boolean);
		const suffix = notes.length > 0 ? ` [${notes.join(" | ")}]` : "";
		const description = node.description ? ` - ${node.description}` : "";
		const fogState = fogStates[node.id] ?? "fog";
		lines.push(`${"  ".repeat(depth)}- [${fogState}] [${node.kind}] ${node.name}${description}${suffix}`);

		for (const child of childrenByParent.get(node.id) ?? []) {
			visit(child, depth + 1);
		}
	};

	for (const node of childrenByParent.get(null) ?? []) {
		visit(node, 0);
	}

	return lines.length > 0 ? lines.join("\n") : "_No nodes captured._";
}

function renderEdges(record: LoadedProcessMap): string {
	const nodesById = new Map(record.nodes.map((node) => [node.id, node]));
	const edgesByFrom = new Map<string, ProcessEdge[]>();
	for (const edge of record.edges) {
		const edges = edgesByFrom.get(edge.fromNodeId) ?? [];
		edges.push(edge);
		edgesByFrom.set(edge.fromNodeId, edges);
	}

	if (record.edges.length === 0) {
		return "_No edges captured._";
	}

	const lines: string[] = [];
	for (const [fromNodeId, edges] of [...edgesByFrom.entries()].sort(([left], [right]) =>
		nodeLabel(nodesById, left).localeCompare(nodeLabel(nodesById, right)),
	)) {
		lines.push(`- ${nodeLabel(nodesById, fromNodeId)}`);
		for (const edge of edges.sort(compareOrdered)) {
			const note = edge.routingNote ? ` (${edge.routingNote})` : "";
			lines.push(`  - -> ${nodeLabel(nodesById, edge.toNodeId)}${note}`);
		}
	}
	return lines.join("\n");
}

function renderMermaid(record: LoadedProcessMap): string {
	const topLevelNodes = record.nodes.filter((node) => node.parentId === null).sort(compareOrdered);
	const childNodes =
		topLevelNodes.length === 1
			? record.nodes.filter((node) => node.parentId === topLevelNodes[0]?.id).sort(compareOrdered)
			: [];
	const riverNodes = childNodes.length > 1 ? childNodes : topLevelNodes;
	const riverIds = new Set(riverNodes.map((node) => node.id));
	const idByNode = new Map(riverNodes.map((node, index) => [node.id, `N${index + 1}`]));
	const lines = ["```mermaid", "graph TD"];

	for (const node of riverNodes) {
		lines.push(`  ${idByNode.get(node.id)}["${escapeMermaidLabel(node.name)}"]`);
	}

	for (const edge of record.edges) {
		if (!riverIds.has(edge.fromNodeId) || !riverIds.has(edge.toNodeId)) {
			continue;
		}
		const label = edge.routingNote ? `|${escapeMermaidLabel(edge.routingNote)}|` : "";
		lines.push(`  ${idByNode.get(edge.fromNodeId)} -->${label} ${idByNode.get(edge.toNodeId)}`);
	}

	lines.push("```");
	return lines.join("\n");
}

function renderReadiness(readiness: ProcessMapReadiness): string {
	const counts = `Fog counts: clear=${readiness.questLog.clearCount}, haze=${readiness.questLog.hazeCount}, fog=${readiness.questLog.fogCount}`;
	if (readiness.ready) {
		return `Ready: yes\n${counts}\n\nOpen items: none`;
	}

	return [
		"Ready: no",
		counts,
		"",
		"Open items:",
		...readiness.items.map((item) => `- ${item.code}${item.count ? ` (${item.count})` : ""}: ${item.label}`),
	].join("\n");
}

function renderQuestLog(readiness: ProcessMapReadiness): string {
	const lines = [
		`Clear: ${readiness.questLog.clearCount}`,
		`Haze: ${readiness.questLog.hazeCount}`,
		`Fog: ${readiness.questLog.fogCount}`,
		"",
		"Quests:",
	];
	if (readiness.questLog.quests.length === 0) {
		lines.push("- none");
	} else {
		for (const quest of readiness.questLog.quests) {
			lines.push(`- ${quest.nodeName}: ask ${quest.whoWouldKnow}`);
		}
	}
	return lines.join("\n");
}

function renderStats(stats: OperationStats): string {
	const lines = [
		`Proposed: ${stats.proposed}`,
		`Applied: ${stats.applied}`,
		`Failed: ${stats.failed}`,
		`Questions: ${stats.questions}`,
		"",
		"| Kind | Proposed | Applied | Failed |",
		"| --- | ---: | ---: | ---: |",
	];
	for (const [kind, entry] of Object.entries(stats.byKind)) {
		if (entry.proposed === 0 && entry.applied === 0 && entry.failed === 0) {
			continue;
		}
		lines.push(`| ${kind} | ${entry.proposed} | ${entry.applied} | ${entry.failed} |`);
	}
	return lines.join("\n");
}

function computeFogStates(
	record: LoadedProcessMap,
	deriveProcessMapFogState: typeof import("../../src/lib/process-map/readiness").deriveProcessMapFogState,
): Readonly<Record<string, ProcessMapFogState>> {
	const childCountByParent = countBy(
		record.nodes
			.filter((node) => node.parentId)
			.map((node) => node.parentId as string),
	);
	const incomingByNode = countBy(record.edges.map((edge) => edge.toNodeId));
	const outgoingByNode = countBy(record.edges.map((edge) => edge.fromNodeId));
	const resourcesByNode = countBy(
		record.resources.map((resource) => resource.nodeId),
	);
	const roleResourcesByNode = countBy(
		record.resources
			.filter((resource) => resource.resourceType === "ROLE")
			.map((resource) => resource.nodeId),
	);

	return Object.fromEntries(
		record.nodes.map((node) => [
			node.id,
			deriveProcessMapFogState({
				childCount: childCountByParent.get(node.id) ?? 0,
				edgeCount:
					(incomingByNode.get(node.id) ?? 0) +
					(outgoingByNode.get(node.id) ?? 0),
				node,
				resourceCount: resourcesByNode.get(node.id) ?? 0,
				roleResourceCount: roleResourcesByNode.get(node.id) ?? 0,
			}),
		]),
	);
}

function countBy(values: readonly string[]): Map<string, number> {
	const counts = new Map<string, number>();
	for (const value of values) {
		counts.set(value, (counts.get(value) ?? 0) + 1);
	}
	return counts;
}

async function createLabTenant(input: {
	readonly personaName: ProcessMapPersonaName;
	readonly prisma: typeof import("../../src/lib/db").prisma;
}): Promise<{ readonly tenantId: string; readonly userId: string }> {
	const id = randomUUID();
	const tenant = await input.prisma.tenant.create({
		data: {
			defaultLanguage: "en",
			name: `pm-sim-${input.personaName}-${id}`,
		},
	});
	const user = await input.prisma.user.create({
		data: {
			email: `pm-sim-${input.personaName}-${id}@example.invalid`,
			uiLocale: "en",
		},
	});
	await input.prisma.tenantMembership.create({
		data: {
			tenantId: tenant.id,
			userId: user.id,
		},
	});

	try {
		await provisionProcessMapSchema(input.prisma, tenant.id);
	} catch (error) {
		await cleanupLabTenant({
			dropTenantSchema: async () => undefined,
			prisma: input.prisma,
			tenantId: tenant.id,
			userId: user.id,
		});
		throw error;
	}

	return { tenantId: tenant.id, userId: user.id };
}

async function provisionProcessMapSchema(
	prisma: typeof import("../../src/lib/db").prisma,
	tenantId: string,
): Promise<void> {
	const { role, schema } = names(tenantId);
	await prisma.$executeRawUnsafe(
		`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = ${sqlString(
			role,
		)}) THEN EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION', ${sqlString(
			role,
		)}); END IF; END $$`,
	);
	await prisma.$executeRawUnsafe(`GRANT ${quoteIdent(role)} TO CURRENT_USER`);
	await prisma.$executeRawUnsafe(
		`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schema)} AUTHORIZATION ${quoteIdent(role)}`,
	);
	await prisma.$executeRawUnsafe(`ALTER SCHEMA ${quoteIdent(schema)} OWNER TO ${quoteIdent(role)}`);
	await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA ${quoteIdent(schema)} TO ${quoteIdent(role)}`);
	await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA "shared" TO ${quoteIdent(role)}`);
	await prisma.$executeRawUnsafe(`SELECT shared.apply_process_map_schema(${sqlString(schema)}::name)`);
	await prisma.$executeRawUnsafe(`SELECT shared.apply_process_map_edges_schema(${sqlString(schema)}::name)`);
	await prisma.$executeRawUnsafe(`SELECT shared.apply_process_map_quest_schema(${sqlString(schema)}::name)`);
}

async function cleanupLabTenant(input: {
	readonly tenantId: string;
	readonly userId: string;
	readonly prisma: typeof import("../../src/lib/db").prisma;
	readonly dropTenantSchema: (tenantId: string) => Promise<unknown>;
}): Promise<void> {
	const errors: string[] = [];
	await input.dropTenantSchema(input.tenantId).catch((error) => {
		errors.push(`dropTenantSchema: ${errorMessage(error)}`);
	});
	await input.prisma.session.deleteMany({ where: { tenantId: input.tenantId } }).catch((error) => {
		errors.push(`session cleanup: ${errorMessage(error)}`);
	});
	await input.prisma.tenantMembership
		.deleteMany({ where: { tenantId: input.tenantId } })
		.catch((error) => {
			errors.push(`membership cleanup: ${errorMessage(error)}`);
		});
	await input.prisma.tenant.deleteMany({ where: { id: input.tenantId } }).catch((error) => {
		errors.push(`tenant cleanup: ${errorMessage(error)}`);
	});
	await input.prisma.user.deleteMany({ where: { id: input.userId } }).catch((error) => {
		errors.push(`user cleanup: ${errorMessage(error)}`);
	});

	if (errors.length > 0) {
		console.error(JSON.stringify({ cleanupErrors: errors, tenantId: input.tenantId }, null, 2));
	}
}

async function requireProcessMap(
	loadProcessMap: typeof import("../../src/lib/process-map/index").loadProcessMap,
	tenantId: string,
	mapId: string,
): Promise<LoadedProcessMap> {
	const record = await loadProcessMap(tenantId, mapId);
	if (!record) {
		throw new Error(`Missing process map: ${mapId}`);
	}
	return record;
}

function emptyOperationStats(): OperationStats {
	const byKind = Object.fromEntries(
		[
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
		].map((kind) => [kind, { applied: 0, failed: 0, proposed: 0 }]),
	) as OperationStats["byKind"];

	return {
		applied: 0,
		byKind,
		failed: 0,
		proposed: 0,
		questions: 0,
	};
}

function localSimulationDispatchOptions(): import("../../src/lib/llm/dispatch").DispatchOptions {
	return {
		checkHostedSaaSCap: () => ({ ok: true }),
	};
}

function parseArgs(values: readonly string[]): ParsedArgs {
	const parsed: Record<string, string | boolean | undefined> = {};
	const booleanFlags = new Set(["help", "keep"]);

	for (let index = 0; index < values.length; index += 1) {
		const value = values[index];
		if (value === "--help" || value === "-h") {
			parsed.help = true;
			continue;
		}
		if (!value.startsWith("--")) {
			throw new Error(`Unknown argument: ${value}`);
		}

		const [rawKey, inline] = value.slice(2).split("=", 2);
		const key = toCamel(rawKey ?? "");
		if (booleanFlags.has(rawKey ?? "") && inline === undefined) {
			parsed[key] = true;
			continue;
		}

		const argValue = inline ?? values[++index];
		if (!argValue || argValue.startsWith("--")) {
			throw new Error(`${value} requires a value.`);
		}
		parsed[key] = argValue;
	}

	return parsed;
}

function parsePersonaName(value: string | undefined): ProcessMapPersonaName {
	if (value === "scaffolding" || value === "plastics" || value === "bakery") {
		return value;
	}
	throw new Error("--persona must be one of: scaffolding, plastics, bakery.");
}

function parseMaxTurns(value: string | undefined): number {
	if (value === undefined) {
		return DEFAULT_MAX_TURNS;
	}
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > 80) {
		throw new Error("--max-turns must be an integer from 1 to 80.");
	}
	return parsed;
}

function assertLocalDatabase(rawUrl: string | undefined, label: string): void {
	const url = rawUrl?.trim();
	if (!url) {
		throw new Error(`${label} is not set; process-map simulation refuses to run without a local database.`);
	}
	const host = databaseHost(url);
	if (!host || !LOCAL_DATABASE_HOSTS.has(host)) {
		throw new Error(
			`${label} points at non-local host "${host ?? "?"}". Process-map simulation creates and drops tenant schemas, so it refuses to run against a non-local database.`,
		);
	}
}

function databaseHost(url: string): string | null {
	try {
		return new URL(url).hostname.toLowerCase().replace(/^\[|\]$/g, "");
	} catch {
		return null;
	}
}

function containsQuestion(value: string): boolean {
	return value.includes("?");
}

function compareOrdered<T extends { readonly orderIndex: number; readonly id: string }>(left: T, right: T): number {
	return left.orderIndex - right.orderIndex || left.id.localeCompare(right.id);
}

function nodeLabel(nodesById: ReadonlyMap<string, ProcessNode>, id: string): string {
	return nodesById.get(id)?.name ?? id;
}

function names(tenantId: string): { readonly role: string; readonly schema: string } {
	const suffix = tenantId.toLowerCase().replaceAll("-", "_");
	return {
		role: `role_tenant_${suffix}`,
		schema: `tenant_${suffix}`,
	};
}

function quoteIdent(value: string): string {
	return `"${String(value).replaceAll('"', '""')}"`;
}

function sqlString(value: string): string {
	return `'${String(value).replaceAll("'", "''")}'`;
}

function timestamp(date: Date): string {
	return date.toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function toCamel(value: string): string {
	return value.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function escapeInlineCode(value: string): string {
	return value.replaceAll("`", "\\`");
}

function escapeMermaidLabel(value: string): string {
	return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("|", " ");
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function moduleUrl(relativePath: string): string {
	return pathToFileURL(resolve(relativePath)).href;
}

function isLocalImport(specifier: string): boolean {
	return specifier.startsWith(".") || specifier.startsWith("/");
}

function printHelp(): void {
	console.log(
		[
			"Usage: node --env-file=.env --experimental-strip-types scripts/process-map/simulate.ts --persona scaffolding|plastics|bakery [--max-turns 24] [--keep]",
			"",
			"Creates a throwaway local process-map tenant, runs one live narrator/coach simulation, writes map.md and transcript.md under .tmp/process-map-sims, then drops the tenant unless --keep is set.",
		].join("\n"),
	);
}
