import { randomUUID } from "node:crypto";
import { withTenantConnection } from "../../db";
import type { AgentContextBundle, AgentRunMetadata } from "../types";

type IncidentContextRow = {
	id: string;
	caseNumber: string | null;
	title: string;
	incidentAt: Date | null;
	incidentTimeNote: string | null;
	location: string | null;
	incidentType: string;
	actualOutcome: string | null;
	actualSeverity: string | null;
	actualSeverityReason: string | null;
	potentialOutcome: string | null;
	potentialSeverity: string | null;
	hazardCategory: string | null;
	department: string | null;
	immediateCause: string | null;
	controlFailure: string | null;
	area: string | null;
	shift: string | null;
	workActivity: string | null;
	workType: string | null;
	eventType: string | null;
	processInvolved: string | null;
	injuryNature: string | null;
	bodyPart: string | null;
	lostDays: number | null;
	coordinatorRole: string;
	coordinatorName: string | null;
	workflowStage: string;
	causeMethod: string;
	contentLanguage: string;
	hiraFollowupNeeded: boolean;
	hiraFollowupText: string | null;
};

type PersonContextRow = {
	id: string;
	role: string;
	name: string | null;
	otherInfo: string | null;
	accountId: string | null;
	rawStatement: string | null;
};

type FactContextRow = {
	id: string;
	accountId: string;
	personId: string;
	personRole: string;
	personName: string | null;
	text: string;
};

type TimelineContextRow = {
	id: string;
	eventAt: Date | null;
	timeLabel: string | null;
	text: string;
	confidence: string;
	attachmentCount: number;
};

type CauseContextRow = {
	id: string;
	parentId: string | null;
	timelineEventId: string | null;
	statement: string;
	question: string | null;
	isRootCause: boolean;
	branchStatus: string;
};

type ActionContextRow = {
	id: string;
	causeNodeId: string;
	description: string;
	ownerRole: string | null;
	dueDate: Date | null;
	actionType: string | null;
	status: string;
};

type AttachmentContextRow = {
	id: string;
	eventId: string;
	storageKey: string;
	filename: string | null;
	mimeType: string | null;
	caption: string | null;
	sizeBytes: bigint | number | null;
};

export async function buildIncidentInvestigationAgentContext(input: {
	readonly metadata: AgentRunMetadata;
	readonly userMessage?: string | null;
}): Promise<AgentContextBundle | null> {
	const { metadata } = input;
	const incidentId = metadata.workflowId;

	if (!incidentId) {
		return null;
	}

	return withTenantConnection(metadata.tenantId, async (tx) => {
		const incidents = await tx.$queryRaw<IncidentContextRow[]>`
			SELECT
				id::text AS id,
				case_number AS "caseNumber",
				title,
				incident_at AS "incidentAt",
				incident_time_note AS "incidentTimeNote",
				location,
				incident_type::text AS "incidentType",
				actual_injury_outcome::text AS "actualOutcome",
				actual_severity_code AS "actualSeverity",
				actual_severity_reason AS "actualSeverityReason",
				potential_outcome_text AS "potentialOutcome",
				potential_severity_code AS "potentialSeverity",
				hazard_category_code AS "hazardCategory",
				department_text AS department,
				immediate_cause AS "immediateCause",
				control_failure AS "controlFailure",
				area_text AS area,
				shift_text AS shift,
				work_activity AS "workActivity",
				work_type AS "workType",
				event_type AS "eventType",
				process_involved AS "processInvolved",
				injury_nature AS "injuryNature",
				body_part AS "bodyPart",
				lost_days AS "lostDays",
				coordinator_role AS "coordinatorRole",
				coordinator_name AS "coordinatorName",
				workflow_stage::text AS "workflowStage",
				cause_method AS "causeMethod",
				content_language::text AS "contentLanguage",
				hira_followup_needed AS "hiraFollowupNeeded",
				hira_followup_text AS "hiraFollowupText"
			FROM incident_case
			WHERE id = ${incidentId}::uuid
			LIMIT 1
		`;
		const incident = incidents[0];

		if (!incident) {
			return null;
		}

		const [persons, facts, timeline, causes, actions, attachments] =
			await Promise.all([
				tx.$queryRaw<PersonContextRow[]>`
					SELECT
						person.id::text AS id,
						person.role,
						person.name,
						person.other_info AS "otherInfo",
						account.id::text AS "accountId",
						account.raw_statement AS "rawStatement"
					FROM incident_person person
					LEFT JOIN incident_account account
						ON account.person_id = person.id
					WHERE person.case_id = ${incidentId}::uuid
					ORDER BY person.created_at ASC, person.id ASC
				`,
				tx.$queryRaw<FactContextRow[]>`
					SELECT
						fact.id::text AS id,
						account.id::text AS "accountId",
						person.id::text AS "personId",
						person.role AS "personRole",
						person.name AS "personName",
						fact.text
					FROM incident_fact fact
						LEFT JOIN incident_account account
							ON account.id = fact.account_id
						LEFT JOIN incident_person person
							ON person.id = account.person_id
						WHERE fact.case_id = ${incidentId}::uuid
					ORDER BY fact.order_index ASC, fact.id ASC
				`,
				tx.$queryRaw<TimelineContextRow[]>`
					SELECT
						event.id::text AS id,
						event.event_at AS "eventAt",
						event.time_label AS "timeLabel",
						event.text,
						event.confidence::text AS confidence,
						(
							SELECT COUNT(*)::int
							FROM incident_attachment attachment
							WHERE attachment.event_id = event.id
						) AS "attachmentCount"
					FROM incident_timeline_event event
					WHERE event.case_id = ${incidentId}::uuid
					ORDER BY event.event_at ASC NULLS LAST, event.order_index ASC, event.created_at ASC, event.id ASC
				`,
				tx.$queryRaw<CauseContextRow[]>`
					SELECT
						id::text AS id,
						parent_id::text AS "parentId",
						timeline_event_id::text AS "timelineEventId",
						statement,
						question,
						is_root_cause AS "isRootCause",
						branch_status AS "branchStatus"
					FROM incident_cause_node
					WHERE case_id = ${incidentId}::uuid
					ORDER BY order_index ASC, created_at ASC, id ASC
				`,
				tx.$queryRaw<ActionContextRow[]>`
					SELECT
						action.id::text AS id,
						action.cause_node_id::text AS "causeNodeId",
						action.description,
						action.owner_role AS "ownerRole",
						action.due_date AS "dueDate",
						action.action_type::text AS "actionType",
						action.status::text AS status
					FROM incident_cause_action action
					JOIN incident_cause_node node
						ON node.id = action.cause_node_id
					WHERE node.case_id = ${incidentId}::uuid
					ORDER BY action.order_index ASC, action.created_at ASC, action.id ASC
				`,
				tx.$queryRaw<AttachmentContextRow[]>`
					SELECT
						attachment.id::text AS id,
						attachment.event_id::text AS "eventId",
						attachment.storage_key AS "storageKey",
						attachment.filename,
						attachment.mime_type AS "mimeType",
						attachment.caption,
						attachment.size_bytes AS "sizeBytes"
					FROM incident_attachment attachment
					JOIN incident_timeline_event event
						ON event.id = attachment.event_id
					WHERE event.case_id = ${incidentId}::uuid
					ORDER BY attachment.created_at ASC, attachment.id ASC
				`,
			]);

		const attachmentRefs = attachments.map((attachment) => ({
			type: "timeline_attachment",
			id: attachment.id,
			label:
				attachment.filename ??
				attachment.mimeType ??
				"timeline evidence attachment",
		}));

		const message = input.userMessage?.trim();

		return {
			metadata,
			workflowSnapshot: {
				sections: {
					incident: {
						...incident,
						actualOutcome: incident.actualOutcome,
						// Likelihood / risk band were dropped from the method (no
						// post-mortem probability). Do not surface them or any
						// risk-matrix flag to the coach: serious potential is judged
						// from severity alone, plus an explicit HIRA hand-off.
						seriousPotential:
							incident.potentialSeverity === "A" ||
							incident.potentialSeverity === "B" ||
							incident.hiraFollowupNeeded,
					},
					people: persons.map((person) => ({
						id: person.id,
						role: person.role,
						name: person.name,
						otherInfo: person.otherInfo,
					})),
					accounts: persons
						.filter((person) => person.accountId)
						.map((person) => ({
							id: person.accountId,
							personId: person.id,
							rawStatement: person.rawStatement,
						})),
					facts,
					timeline: timeline.map((event) => ({
						id: event.id,
						phase: phaseFromTimeLabel(event.timeLabel),
						eventAt: event.eventAt?.toISOString() ?? null,
						timeLabel: event.timeLabel,
						text: event.text,
						confidence: event.confidence,
						attachmentCount: event.attachmentCount,
					})),
					causes,
					actions,
					hiraFollowup: {
						needed: incident.hiraFollowupNeeded,
						text: incident.hiraFollowupText,
					},
					evidence: attachments.map((attachment) => ({
						id: attachment.id,
						eventId: attachment.eventId,
						storageKey: attachment.storageKey,
						filename: attachment.filename,
						mimeType: attachment.mimeType,
						caption: attachment.caption,
						sizeBytes:
							typeof attachment.sizeBytes === "bigint"
								? Number(attachment.sizeBytes)
								: attachment.sizeBytes,
					})),
				},
				attachmentRefs,
			},
			methodologyRefs: [
				{
					id: "docs/methodology-pack.md#ii-incident-investigation-data-shape",
					label: "II data shape",
				},
				{
					id: "docs/mockups/incident-investigation-flow-review.md",
					label: "II workbench flow",
				},
			],
			sameCompanyPatterns: [],
			conversationHistory: message
				? [
						{
							id: randomUUID(),
							role: "user",
							text: message,
							createdAt: metadata.createdAt,
						},
					]
				: [],
			companyMemoryExcerpts: [],
			generatedArtifacts: [],
		};
	});
}

function phaseFromTimeLabel(
	value: string | null,
): "before" | "event" | "after" | undefined {
	const text = value?.toLowerCase() ?? "";

	if (text.includes("before") || text.includes("vorher")) {
		return "before";
	}

	if (text.includes("after") || text.includes("nachher")) {
		return "after";
	}

	if (text.includes("event") || text.includes("ereignis")) {
		return "event";
	}

	return undefined;
}
