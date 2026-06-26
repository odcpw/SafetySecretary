import { COACH_SYSTEM_PROMPT } from "../../incident/coach-prompt";
import { AgentOperationKind, type AgentSkillRef } from "../types";

/**
 * The Safety Secretary incident-investigation coach as a versioned product
 * skill (SPEC: skills-first architecture). The conversational system prompt
 * in coach-prompt.ts is this skill's content; the version below MUST be
 * bumped whenever that prompt or the allowed operation set changes, so that
 * traces, transcripts, and evals can be attributed to a skill version.
 */
export const INCIDENT_COACH_SKILL = {
	id: "incident-investigation",
	// Pre-first-release: stays on 0.x — the whole skill is a draft until we ship
	// a real 1.0. Bump the minor on each prompt/operation-set change.
	version: "0.19.0",
	systemPrompt: COACH_SYSTEM_PROMPT,
	/** Operation kinds the chat coach may emit; others are dropped with a warning. */
	allowedOperationKinds: [
		AgentOperationKind.IncidentFieldUpdate,
		AgentOperationKind.TimelineEvent,
		AgentOperationKind.CauseNode,
		AgentOperationKind.CauseUpdate,
		AgentOperationKind.StopAction,
		AgentOperationKind.HiraFollowupNote,
		AgentOperationKind.Fact,
	],
	/** Operation kinds the photo (vision) analysis may emit. */
	visionOperationKinds: [AgentOperationKind.TimelineEvent],
	/** Section headings the contract test pins; reorderings are fine, removals are not. */
	requiredPromptSections: [
		"WHY YOU EXIST",
		"WHAT YOU KNOW ABOUT ACCIDENTS",
		"INVESTIGATIVE RIGOR",
		"WORK THE WHOLE PICTURE",
		"HOW YOU COACH",
		"PHASE & CLOSING",
		"WHAT GOOD MEASURES LOOK LIKE",
		"THE CAUSE TREE",
		"SWITCHING METHOD MID-INVESTIGATION",
		"THE RECORD",
		"OUTPUT FORMAT — STRICT",
		"Operation discipline:",
	],
} as const;

export function incidentCoachSkillRef(section: string): AgentSkillRef {
	return {
		id: INCIDENT_COACH_SKILL.id,
		section,
		version: INCIDENT_COACH_SKILL.version,
	};
}
