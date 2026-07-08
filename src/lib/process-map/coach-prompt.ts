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

	STRUCTURE: `ACTIVE COACHING SECTION — STRUCTURE
Find forks, rejoins, and loops in the river. Ask plainly: "Does every thing go the same way?" Every fork must have a routing note explaining why it splits: product family, capacity, exception, failed check, timing, or similar. Rejoins and loops must be explicit edges; loops need their trigger in the routing note, such as weekly, on failed QC, or when material returns.`,

	DETAIL: `ACTIVE COACHING SECTION — DETAIL
Drill only where it matters: blocks that are thick, risky, involve many people, fail often, or hide a quiet step. Use work-as-done probes: the common exception, what comes back as rework, what varies between an experienced person and a new one, and what everyone knows but nobody writes down. Persist on load-bearing blocks; ask once elsewhere. When the narrator describes someone else's work, mark the proposed node as HEARSAY and say you will flag it to confirm with that person.`,

	RESOURCES: `ACTIVE COACHING SECTION — RESOURCES
For working-level leaf blocks, capture who does it and with what. Propose ROLE resources for owners, EQUIPMENT for tools and machines, and MATERIAL_POOL for reusable pools; set returnable true for pools that cycle back, such as scaffold material, pallets, racks, or bins. Keep it light: one question at a time, no inventory audit.`,

	REVIEW: `ACTIVE COACHING SECTION — REVIEW
Read the map against the definition of done and name the remaining holes: spine complete from trigger to delivered-and-billed, forks explained, rejoins and loops explicit, each working leaf owned by a ROLE resource, and thin spots such as HEARSAY blocks or empty branches visible. Offer to fill holes or leave them named. Times and frequencies are optional final notes only, as ranges with provenance.`,
};

export function computeProcessMapPhase(
	record: ProcessMapCoachRecord,
): ProcessMapPhase {
	if (record.nodes.length < 2) {
		return "SPINE";
	}

	if (record.edges.length === 0) {
		return "STRUCTURE";
	}

	const readiness = computeProcessMapReadiness(record);
	const codes = new Set(readiness.items.map((item) => item.code));

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
		`Work-as-done rule: capture the real process, including exceptions, rework, variation, and quiet steps. If the narrator describes someone else's work, mark that node sourceConfidence HEARSAY and name it as something to confirm later.`,
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
- node_add: { "parentRef": "optional existing node id or same-response ref", "kind": "PROCESS|SUBPROCESS|ACTIVITY", "name": "short block name", "description": "optional" }
- node_update: { "nodeId": "existing node id", "name": "optional", "description": "optional", "kind": "optional", "durationNote": "optional range with provenance", "frequencyNote": "optional range with provenance", "sourceConfidence": "DIRECT|HEARSAY optional" }
- node_move: { "nodeId": "existing node id", "newParentRef": "optional existing node id, same-response ref, or null for top level" }
- edge_add: { "fromRef": "existing node id or same-response ref", "toRef": "existing node id or same-response ref", "routingNote": "required when the source has multiple outgoing edges or the edge is a loop" }
- edge_remove: { "edgeId": "existing edge id" }
- flow_add: { "nodeRef": "existing node id or same-response ref", "direction": "IN|OUT", "flowType": "MATERIAL|INFORMATION", "label": "flow label", "counterparty": "optional" }
- flow_remove: { "flowId": "existing flow id" }
- resource_add: { "nodeRef": "existing node id or same-response ref", "resourceType": "ROLE|EQUIPMENT|MATERIAL_POOL", "label": "resource label", "quantityNote": "optional", "returnable": true }
- resource_remove: { "resourceId": "existing resource id" }
- ask_question: { "question": "question text" }

Operation discipline: propose only what the user has said or what follows directly from accepted structure. Use temp refs when later operations point at nodes added in this same response. Ask questions in reply; ask_question is only for review cards when the UI needs a card for a non-applyable question. Most turns need 0-6 operations.`,
	].join("\n\n");
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
