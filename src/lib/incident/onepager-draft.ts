import type { Locale } from "../i18n/types";
import { type DispatchOptions, dispatch } from "../llm/dispatch";
import { KindEnum } from "../llm/types";
import type { SnapshotJson, WorkflowSnapshotData } from "./serialise";

export const II_ONEPAGER_PROMPT_PURPOSE = "ii_onepager";

/**
 * The manager one-pager draft. The LLM generates these fields from the
 * incident record; the manager reviews and edits before exporting. Every
 * field is plain text written for non-safety-pros (managers and teams) and
 * must use roles, never personal names.
 */
export type OnePagerDraft = {
	readonly title: string;
	readonly whatHappened: string;
	readonly causes: string;
	readonly actions: string;
	readonly lessons: {
		readonly teamMember: string;
		readonly frontlineManager: string;
		readonly executive: string;
	};
};

export type OnePagerDraftInput = {
	readonly workflowData: WorkflowSnapshotData;
	readonly locale: Locale;
	readonly tenantId: string;
	readonly userId: string;
	readonly workflowId?: string;
};

export type OnePagerDraftOptions = {
	readonly env?: NodeJS.ProcessEnv;
	readonly dispatchOptions?: DispatchOptions;
};

/**
 * The structured incident facts handed to the model. Pre-extracted here so the
 * prompt is deterministic and never leaks personal names: only roles, the
 * timeline narrative, cause statements, and the action descriptions are sent.
 */
type OnePagerSourceFacts = {
	readonly title: string;
	readonly incidentType: string;
	readonly location: string | null;
	readonly incidentAt: string | null;
	readonly timeline: readonly string[];
	readonly causes: readonly { statement: string; isRootCause: boolean }[];
	readonly actions: readonly {
		description: string;
		ownerRole: string | null;
	}[];
};

/**
 * Builds the manager one-pager draft. In tests (NODE_ENV=test) this returns a
 * deterministic canned draft built from the incident facts, so integration
 * tests never reach a live model and the strict MockProvider seed is not
 * required. In every other environment the draft is produced through the
 * existing dispatch() LLM path (promptPurpose "ii_onepager", generation kind),
 * which respects BYOK / self-hosted / hosted selection and the monthly cost
 * cap. Pi is never used.
 */
export async function generateOnePagerDraft(
	input: OnePagerDraftInput,
	options: OnePagerDraftOptions = {},
): Promise<OnePagerDraft> {
	const facts = extractSourceFacts(input.workflowData);
	const env = options.env ?? process.env;

	if (env.NODE_ENV === "test" && !options.dispatchOptions?.mockProvider) {
		return cannedDraft(facts, input.locale);
	}

	const result = await dispatch(
		{
			options: {
				kind: KindEnum.Generation,
				locale: input.locale,
				promptPurpose: II_ONEPAGER_PROMPT_PURPOSE,
				requiresVision: false,
				tenantId: input.tenantId,
				userId: input.userId,
				workflowId: input.workflowId,
			},
			prompt: buildOnePagerPrompt(facts, input.locale),
		},
		options.dispatchOptions ?? {},
	);

	if (!result.ok) {
		throw new OnePagerDraftDispatchError(result.code);
	}

	return parseOnePagerDraft(result.response.text, facts, input.locale);
}

export class OnePagerDraftDispatchError extends Error {
	readonly code: string;

	constructor(code: string) {
		super(`Manager one-pager draft generation failed: ${code}.`);
		this.name = "OnePagerDraftDispatchError";
		this.code = code;
	}
}

export function buildOnePagerPrompt(
	facts: OnePagerSourceFacts,
	locale: Locale,
): string {
	const timeline =
		facts.timeline.length > 0
			? facts.timeline.map((event) => `- ${event}`).join("\n")
			: "- (no timeline recorded)";
	const causes =
		facts.causes.length > 0
			? facts.causes
					.map(
						(cause) =>
							`- ${cause.isRootCause ? "[root cause] " : ""}${cause.statement}`,
					)
					.join("\n")
			: "- (no causes recorded)";
	const actions =
		facts.actions.length > 0
			? facts.actions
					.map(
						(action) =>
							`- ${action.description}${
								action.ownerRole ? ` (owner: ${action.ownerRole})` : ""
							}`,
					)
					.join("\n")
			: "- (no actions recorded)";

	return [
		"You are a safety leader writing a one-page incident summary for ordinary managers and teams — not safety professionals. Plain, calm, blame-free language.",
		"",
		"Incident facts:",
		`- Working title: ${facts.title}`,
		`- Incident type: ${facts.incidentType}`,
		`- Where: ${facts.location ?? "not recorded"}`,
		`- When: ${facts.incidentAt ?? "not recorded"}`,
		"",
		"What happened (timeline):",
		timeline,
		"",
		"Causes identified:",
		causes,
		"",
		"Actions / changes being made:",
		actions,
		"",
		"Write the one-pager as a JSON object only (no markdown, no prose outside JSON), with exactly these string fields:",
		"{",
		'  "title": "a short, clear headline that summarises the case for a manager (no jargon, no names)",',
		'  "whatHappened": "2-4 sentences describing what happened in plain language",',
		'  "causes": "2-3 sentences explaining why it happened, focused on systems and conditions, not individuals",',
		'  "actions": "2-3 sentences on what we are changing so it does not happen again",',
		'  "lessons": {',
		'    "teamMember": "1-2 sentences: what this means for a team member day-to-day",',
		'    "frontlineManager": "1-2 sentences: what this means for a frontline manager / supervisor",',
		'    "executive": "1-2 sentences: what this means for executive management / leadership"',
		"  }",
		"}",
		"",
		"Hard rules:",
		"- NEVER use personal names. Always refer to people by role (e.g. 'the operator', 'a warehouse worker', 'the supervisor').",
		"- Do not include any personal information.",
		"- The three lessons are distinct safety-leadership messages for the three audiences.",
		`- Write every field in the language for locale "${locale}".`,
	].join("\n");
}

export function parseOnePagerDraft(
	responseText: string,
	facts: OnePagerSourceFacts,
	locale: Locale,
): OnePagerDraft {
	const fallback = cannedDraft(facts, locale);

	let parsed: Record<string, unknown>;

	try {
		parsed = JSON.parse(extractJson(responseText)) as Record<string, unknown>;
	} catch {
		return fallback;
	}

	const lessons =
		typeof parsed.lessons === "object" && parsed.lessons !== null
			? (parsed.lessons as Record<string, unknown>)
			: {};

	return {
		actions: stringOr(parsed.actions, fallback.actions),
		causes: stringOr(parsed.causes, fallback.causes),
		lessons: {
			executive: stringOr(lessons.executive, fallback.lessons.executive),
			frontlineManager: stringOr(
				lessons.frontlineManager,
				fallback.lessons.frontlineManager,
			),
			teamMember: stringOr(lessons.teamMember, fallback.lessons.teamMember),
		},
		title: stringOr(parsed.title, fallback.title),
		whatHappened: stringOr(parsed.whatHappened, fallback.whatHappened),
	};
}

function extractSourceFacts(
	workflowData: WorkflowSnapshotData,
): OnePagerSourceFacts {
	const caseRecord = record(workflowData.case);
	const timeline = records(workflowData.timelineEvents)
		.map((event) => {
			const label =
				stringOrNull(event.timeLabel) ?? stringOrNull(event.eventAt);
			const text = stringOrNull(event.text) ?? "";
			return label ? `${label}: ${text}` : text;
		})
		.filter((line) => line.trim().length > 0);
	const causes = records(workflowData.causeNodes).map((node) => ({
		isRootCause: Boolean(node.isRootCause),
		statement: stringOrNull(node.statement) ?? "",
	}));
	const actions = records(workflowData.causeNodes).flatMap((node) =>
		records(arrayField(node.actions)).map((action) => ({
			description: stringOrNull(action.description) ?? "",
			ownerRole: stringOrNull(action.ownerRole),
		})),
	);

	return {
		actions: actions.filter((action) => action.description.trim().length > 0),
		causes: causes.filter((cause) => cause.statement.trim().length > 0),
		incidentAt: stringOrNull(caseRecord.incidentAt),
		incidentType: stringOrNull(caseRecord.incidentType) ?? "INCIDENT",
		location: stringOrNull(caseRecord.location),
		timeline,
		title: stringOrNull(caseRecord.title) ?? "Incident",
	};
}

/**
 * A deterministic, role-safe draft assembled straight from the record. Used as
 * the test canned response and as the parsing fallback when the model returns
 * something unusable.
 */
function cannedDraft(
	facts: OnePagerSourceFacts,
	locale: Locale,
): OnePagerDraft {
	const phrases = cannedPhrases[locale] ?? cannedPhrases.en;
	const whatHappened =
		facts.timeline.length > 0
			? `${phrases.whatHappenedLead} ${facts.timeline.join(" ")}`
			: `${phrases.whatHappenedLead} ${facts.title}.`;
	const causes =
		facts.causes.length > 0
			? `${phrases.causesLead} ${joinSentences(
					facts.causes.map((cause) => cause.statement),
				)}.`
			: phrases.causesNone;
	const actions =
		facts.actions.length > 0
			? `${phrases.actionsLead} ${joinSentences(
					facts.actions.map((action) => action.description),
				)}.`
			: phrases.actionsNone;

	return {
		actions,
		causes,
		lessons: {
			executive: phrases.lessonExecutive,
			frontlineManager: phrases.lessonFrontlineManager,
			teamMember: phrases.lessonTeamMember,
		},
		title: facts.title,
		whatHappened,
	};
}

const cannedPhrases: Record<
	Locale,
	{
		whatHappenedLead: string;
		causesLead: string;
		causesNone: string;
		actionsLead: string;
		actionsNone: string;
		lessonTeamMember: string;
		lessonFrontlineManager: string;
		lessonExecutive: string;
	}
> = {
	de: {
		actionsLead: "Wir ändern Folgendes:",
		actionsNone: "Massnahmen werden noch festgelegt.",
		causesLead: "Beigetragen haben:",
		causesNone: "Die Ursachen werden noch geprüft.",
		lessonExecutive:
			"Als Geschäftsleitung sorgen wir dafür, dass die Mittel und Prioritäten die sichere Arbeitsweise stützen.",
		lessonFrontlineManager:
			"Als Vorgesetzte halten wir die aktualisierten Kontrollen ein und sprechen sie im Team an.",
		lessonTeamMember:
			"Als Teammitglied melden wir unsichere Bedingungen sofort und folgen den aktualisierten Kontrollen.",
		whatHappenedLead: "Was geschah:",
	},
	en: {
		actionsLead: "We are changing the following:",
		actionsNone: "Actions are still being decided.",
		causesLead: "Contributing factors:",
		causesNone: "The causes are still being reviewed.",
		lessonExecutive:
			"As executive management, we make sure resources and priorities support working safely.",
		lessonFrontlineManager:
			"As a frontline manager, keep to the updated controls and talk them through with the team.",
		lessonTeamMember:
			"As a team member, raise unsafe conditions straight away and follow the updated controls.",
		whatHappenedLead: "What happened:",
	},
	fr: {
		actionsLead: "Nous changeons ce qui suit :",
		actionsNone: "Les actions sont encore en cours de définition.",
		causesLead: "Facteurs ayant contribué :",
		causesNone: "Les causes sont encore en cours d'examen.",
		lessonExecutive:
			"En tant que direction, nous veillons à ce que les ressources et les priorités soutiennent le travail en sécurité.",
		lessonFrontlineManager:
			"En tant que responsable de terrain, appliquez les contrôles mis à jour et discutez-en avec l'équipe.",
		lessonTeamMember:
			"En tant que membre de l'équipe, signalez immédiatement les conditions dangereuses et appliquez les contrôles mis à jour.",
		whatHappenedLead: "Ce qui s'est passé :",
	},
	it: {
		actionsLead: "Stiamo cambiando quanto segue:",
		actionsNone: "Le azioni sono ancora in fase di definizione.",
		causesLead: "Fattori che hanno contribuito:",
		causesNone: "Le cause sono ancora in fase di esame.",
		lessonExecutive:
			"Come direzione, garantiamo che risorse e priorità sostengano il lavoro in sicurezza.",
		lessonFrontlineManager:
			"Come responsabile di reparto, rispettare i controlli aggiornati e discuterne con il team.",
		lessonTeamMember:
			"Come membro del team, segnalare subito le condizioni non sicure e seguire i controlli aggiornati.",
		whatHappenedLead: "Cosa è successo:",
	},
};

function joinSentences(items: readonly string[]): string {
	return items
		.map((item) => item.trim().replace(/[.;]+$/, ""))
		.filter((item) => item.length > 0)
		.join("; ");
}

function extractJson(text: string): string {
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");

	if (start === -1 || end === -1 || end < start) {
		return text;
	}

	return text.slice(start, end + 1);
}

function stringOr(value: unknown, fallback: string): string {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed.length > 0 ? trimmed : fallback;
	}

	return fallback;
}

function record(value: SnapshotJson): Record<string, SnapshotJson> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}

	return value;
}

function records(value: SnapshotJson[]): Array<Record<string, SnapshotJson>> {
	return value.map(record);
}

function arrayField(value: SnapshotJson | undefined): SnapshotJson[] {
	return Array.isArray(value) ? value : [];
}

function stringOrNull(value: SnapshotJson | undefined): string | null {
	if (typeof value === "string") {
		return value;
	}

	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}

	return null;
}
