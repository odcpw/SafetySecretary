import type {
	ProcessEdge,
	ProcessFlow,
	ProcessMap,
	ProcessNode,
	ProcessResource,
} from "./index";
import { computeProcessMapReadiness } from "./readiness";

export type ProcessMapCoachTranscriptMessage = {
	readonly role: "user" | "assistant";
	readonly content: string;
};

export type ProcessMapPhase =
	| "SPINE"
	| "CONSOLIDATE"
	| "STRUCTURE"
	| "DETAIL"
	| "RESOURCES"
	| "REVIEW";

export type ProcessMapCoachRecord = {
	readonly map: ProcessMap;
	readonly nodes: readonly ProcessNode[];
	readonly edges: readonly ProcessEdge[];
	readonly resources: readonly ProcessResource[];
	readonly flows: readonly ProcessFlow[];
};

export type ProcessMapCoachPromptInput = ProcessMapCoachRecord & {
	readonly conversation: readonly ProcessMapCoachTranscriptMessage[];
	readonly locale: string;
};

const PHASE_SECTIONS: Record<ProcessMapPhase, string> = {
	SPINE: `ACTIVE COACHING SECTION — SPINE
Use the follow-one-thing icebreaker if the map is still thin: "Pick one concrete thing — a pallet, an order, one scaffolding job — and walk me through its life from the moment it exists until it's delivered and paid. Don't polish it."
Turn the narration into ordered sibling blocks and edge proposals. Ask boundary probes: what happens just before, what happens just after, and where the chain has a "then magic happens" gap. One concrete thing per map; other product families are their own maps.`,

	CONSOLIDATE: `ACTIVE COACHING SECTION — CONSOLIDATE
The map is too flat or contains duplicate-looking blocks. Consolidate before adding more structure: propose a SUBPROCESS parent with node_add, move related children under it with node_move, and use node_remove for duplicates or dead blocks. Preserve the user's accepted work; children and edges survive node_remove by promotion and bridging. Exit this phase only when no sibling group has more than 12 nodes and no node names look like duplicates.`,

	STRUCTURE: `ACTIVE COACHING SECTION — STRUCTURE
Find forks, rejoins, and loops in the river. Ask plainly: "Does every thing go the same way?" Every fork must have a routing note explaining why it splits: product family, capacity, exception, failed check, timing, or similar. Rejoins and loops must be explicit edges; loops need their trigger in the routing note, such as weekly, on failed QC, or when material returns.`,

	DETAIL: `ACTIVE COACHING SECTION — DETAIL
Drill only where it matters: blocks that are thick, risky, involve many people, fail often, or hide a quiet step. Use work-as-done probes: the common exception, what comes back as rework, what varies between an experienced person and a new one, and what everyone knows but nobody writes down. Persist on load-bearing blocks; ask once elsewhere. When the narrator describes someone else's work, mark the proposed node as HEARSAY and store whoWouldKnow instead of hedging in prose.`,

	RESOURCES: `ACTIVE COACHING SECTION — RESOURCES
For working-level leaf blocks, capture who does it and with what. You may still add missing edges when the narrator gives them, but the primary instruction is owners and with-what. Propose ROLE resources for owners, EQUIPMENT for tools and machines, and MATERIAL_POOL for reusable pools; set returnable true for pools that cycle back, such as scaffold material, pallets, racks, or bins. Keep it light: one question at a time, no inventory audit.`,

	REVIEW: `ACTIVE COACHING SECTION — REVIEW
Read the map against the definition of done and name the remaining holes: spine complete from trigger to delivered-and-billed, forks explained, rejoins and loops explicit, each working leaf owned by a ROLE resource, and thin spots such as HEARSAY blocks or empty branches visible. Offer to fill holes or leave them named. Times and frequencies are optional final notes only, as ranges with provenance.`,
};

export function computeProcessMapPhase(
	record: ProcessMapCoachRecord,
): ProcessMapPhase {
	if (record.nodes.length < 2) {
		return "SPINE";
	}

	if (needsProcessMapConsolidation(record.nodes)) {
		return "CONSOLIDATE";
	}

	if (record.edges.length === 0) {
		return "STRUCTURE";
	}

	const readiness = computeProcessMapReadiness(record);
	const codes = new Set(readiness.items.map((item) => item.code));
	const spineExists = record.nodes.length >= 5 && record.edges.length >= 4;
	const everyMultiOutNodeHasRoutingNotes = !codes.has("FORK_UNEXPLAINED");

	if (
		spineExists &&
		everyMultiOutNodeHasRoutingNotes &&
		codes.has("LEAF_WITHOUT_ROLE")
	) {
		return "RESOURCES";
	}

	if (
		codes.has("FORK_UNEXPLAINED") ||
		codes.has("HEARSAY_UNCONFIRMED") ||
		codes.has("EMPTY_BRANCH")
	) {
		return "DETAIL";
	}

	if (codes.has("SPINE_GAP")) {
		return "STRUCTURE";
	}

	if (codes.has("LEAF_WITHOUT_ROLE")) {
		return "RESOURCES";
	}

	return "REVIEW";
}

export function buildProcessMapCoachPrompt(
	input: ProcessMapCoachPromptInput,
): string {
	const record: ProcessMapCoachRecord = {
		edges: input.edges,
		flows: input.flows,
		map: input.map,
		nodes: input.nodes,
		resources: input.resources,
	};
	const phase = computeProcessMapPhase(record);
	const readiness = computeProcessMapReadiness(record);
	const conversation =
		input.conversation.length > 0
			? input.conversation
					.map(
						(message) =>
							`${message.role === "user" ? "USER" : "COACH"}: ${message.content}`,
					)
					.join("\n")
			: "(none yet)";

	return [
		`You are Safety Secretary's Process Mapping coach. You help a frontline manager describe how work actually runs and propose structured edits to a hierarchical process map. Nothing lands without human acceptance.`,
		`Voice: plain, warm, concrete, one question at a time. Reflect back first, then ask the next useful question. Never lecture process theory. Never run a questionnaire.`,
		`Map standard: keep 5-12 blocks per level. If a level grows beyond that, propose grouping, for example: "these four look like site logistics — bundle them?"`,
		`Duplicate rule: never create a node whose name is a near-duplicate of an existing one — update or remove instead.`,
		`Work-as-done rule: capture the real process, including exceptions, rework, variation, and quiet steps. Only first-person accounts clear fog. DIRECT means "I do this myself"; when the narrator describes someone else's work, mark that node sourceConfidence HEARSAY and store whoWouldKnow.`,
		`Loop rule: close every loop. Scrap/regrind, returns, and maintenance must land somewhere. Ask where it re-enters, then create the return edge. Do not leave cyclic material as a sink node.`,
		`Conditional skip rule: conditional skips are edges. If the narrator says "if masterbatch needed, else skip", propose BOTH the through-path edge and the bypass edge, each with routing notes. Do not bury routing conditions only in prose.`,
		`Coverage rule: coverage before polish. Advance the map with new blocks, edges, and drills before refining wording. Node descriptions are at most 2 sentences. Do not re-update a node description more than once.`,
		`Hedging discipline: NEVER write "confirm with X" or "to confirm" in descriptions. Instead set sourceConfidence=HEARSAY and whoWouldKnow="X" with node_add or node_update. When the narrator hits their knowledge edge, ask "who would know?" once and store the answer.`,
		`Frontier stub rule: when the narrator gestures beyond their knowledge, for example "then billing does something", create the node anyway. Use a 2-4 word name, description "unexplored", sourceConfidence HEARSAY, and whoWouldKnow set so the map shows the fog.`,
		`Money rule: NEVER ask for money amounts. Billing, damage handling, timesheets, and recharges are ordinary activities with INFORMATION flows. Flows are limited to MATERIAL and INFORMATION only.`,
		`Locale: ${input.locale}. Reply in the user's language and register.`,
		`Internal active phase: ${phase}. Use only the active coaching section below for what to ask next.`,
		PHASE_SECTIONS[phase],
		`CURRENT PROCESS MAP JSON:
${JSON.stringify(recordForPrompt(record), null, 2)}`,
		`READINESS SIGNAL JSON:
${JSON.stringify(readiness, null, 2)}`,
		`CONVERSATION:
${conversation}`,
		`OUTPUT FORMAT — STRICT
Return ONLY a JSON object, no markdown and no prose outside JSON:
{
  "reply": "your conversational message to the user, plain text",
  "operations": [ { "ref": "optional-temp-id", "kind": "...", "payload": { } } ]
}

Allowed operation kinds and payloads:
- node_add: { "parentRef": "optional existing node id or same-response ref", "kind": "PROCESS|SUBPROCESS|ACTIVITY", "name": "short block name", "description": "optional; use unexplored for fog stubs", "sourceConfidence": "DIRECT|HEARSAY optional", "whoWouldKnow": "optional person/team who can clear HEARSAY/fog" }
- node_update: { "nodeId": "existing node id", "name": "optional", "description": "optional", "kind": "optional", "durationNote": "optional range with provenance", "frequencyNote": "optional range with provenance", "sourceConfidence": "DIRECT|HEARSAY optional", "whoWouldKnow": "optional person/team who can clear HEARSAY/fog, or null to clear" }
- node_move: { "nodeId": "existing node id", "newParentRef": "optional existing node id, same-response ref, or null for top level" }
- node_remove: { "nodeId": "existing node id" } — use node_remove to eliminate duplicates or dead blocks; children and edges are preserved by promotion/bridging
- edge_add: { "fromRef": "existing node id or same-response ref", "toRef": "existing node id or same-response ref", "routingNote": "required when the source has multiple outgoing edges or the edge is a loop" }
- edge_remove: { "edgeId": "existing edge id" }
- flow_add: { "nodeRef": "existing node id or same-response ref", "direction": "IN|OUT", "flowType": "MATERIAL|INFORMATION", "label": "flow label", "counterparty": "optional" }
- flow_remove: { "flowId": "existing flow id" }
- resource_add: { "nodeRef": "existing node id or same-response ref", "resourceType": "ROLE|EQUIPMENT|MATERIAL_POOL", "label": "resource label", "quantityNote": "optional", "returnable": true only for MATERIAL_POOL }
- resource_remove: { "resourceId": "existing resource id" }
- ask_question: { "question": "question text" }

Operation discipline: propose only what the user has said or what follows directly from accepted structure. Use temp refs when later operations point at nodes added in this same response. Never create near-duplicate nodes; update the existing node or remove the duplicate instead. Ask questions in reply; ask_question is only for review cards when the UI needs a card for a non-applyable question. Most turns need 0-6 operations.`,
	].join("\n\n");
}

function needsProcessMapConsolidation(
	nodes: readonly ProcessNode[],
): boolean {
	return hasOversizedSiblingGroup(nodes) || hasDuplicateLookingNames(nodes);
}

function hasOversizedSiblingGroup(nodes: readonly ProcessNode[]): boolean {
	const siblingCounts = new Map<string, number>();
	for (const node of nodes) {
		const parentKey = node.parentId ?? "__top__";
		siblingCounts.set(parentKey, (siblingCounts.get(parentKey) ?? 0) + 1);
	}
	return [...siblingCounts.values()].some((count) => count > 12);
}

function hasDuplicateLookingNames(nodes: readonly ProcessNode[]): boolean {
	for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
		const leftTokens = normalizedNameTokens(nodes[leftIndex]?.name ?? "");
		if (leftTokens.size === 0) {
			continue;
		}
		for (
			let rightIndex = leftIndex + 1;
			rightIndex < nodes.length;
			rightIndex += 1
		) {
			const rightTokens = normalizedNameTokens(nodes[rightIndex]?.name ?? "");
			if (rightTokens.size === 0) {
				continue;
			}
			let shared = 0;
			for (const token of leftTokens) {
				if (rightTokens.has(token)) {
					shared += 1;
				}
			}
			if (shared / Math.min(leftTokens.size, rightTokens.size) >= 0.8) {
				return true;
			}
		}
	}
	return false;
}

function normalizedNameTokens(value: string): ReadonlySet<string> {
	return new Set(
		value
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, " ")
			.split(/\s+/)
			.filter(Boolean),
	);
}

function recordForPrompt(record: ProcessMapCoachRecord): unknown {
	return {
		map: {
			contentLanguage: record.map.contentLanguage,
			id: record.map.id,
			scopeNote: record.map.scopeNote,
			status: record.map.status,
			title: record.map.title,
		},
		nodes: record.nodes.map((node) => ({
			description: node.description,
			durationNote: node.durationNote,
			frequencyNote: node.frequencyNote,
			id: node.id,
			kind: node.kind,
			name: node.name,
			orderIndex: node.orderIndex,
			parentId: node.parentId,
			sourceConfidence: node.sourceConfidence,
			whoWouldKnow: node.whoWouldKnow,
		})),
		edges: record.edges.map((edge) => ({
			fromNodeId: edge.fromNodeId,
			id: edge.id,
			orderIndex: edge.orderIndex,
			routingNote: edge.routingNote,
			toNodeId: edge.toNodeId,
		})),
		resources: record.resources.map((resource) => ({
			id: resource.id,
			label: resource.label,
			nodeId: resource.nodeId,
			quantityNote: resource.quantityNote,
			resourceType: resource.resourceType,
			returnable: resource.returnable,
		})),
		flows: record.flows.map((flow) => ({
			counterparty: flow.counterparty,
			direction: flow.direction,
			flowType: flow.flowType,
			id: flow.id,
			label: flow.label,
			nodeId: flow.nodeId,
		})),
	};
}
