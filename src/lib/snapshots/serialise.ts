import type { ApprovalWorkflowType } from "./types";

export const SNAPSHOT_SCHEMA_VERSION = 1;

type JsonPrimitive = string | number | boolean | null;
export type SnapshotJson =
	| JsonPrimitive
	| { [key: string]: SnapshotJson }
	| SnapshotJson[];

export type WorkflowSnapshotData = {
	schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
	workflowType: ApprovalWorkflowType;
	case: SnapshotJson;
	persons: SnapshotJson[];
	accounts: SnapshotJson[];
	timelineEvents: SnapshotJson[];
	causeNodes: SnapshotJson[];
};

export interface WorkflowSerialiseStore {
	findIncidentWorkflow(caseId: string): Promise<IncidentWorkflowRow | null>;
}

export type SerialiseWorkflowOptions = {
	store?: WorkflowSerialiseStore;
	client?: SnapshotPrismaClient;
	tenantId?: string;
};

export class WorkflowNotFoundError extends Error {
	readonly code = "workflow_not_found";
	readonly workflowType: ApprovalWorkflowType;
	readonly caseId: string;

	constructor(workflowType: ApprovalWorkflowType, caseId: string) {
		super(`No ${workflowType} workflow found for case ${caseId}.`);
		this.name = "WorkflowNotFoundError";
		this.workflowType = workflowType;
		this.caseId = caseId;
	}
}

export class UnsupportedSnapshotWorkflowError extends Error {
	readonly code = "unsupported_snapshot_workflow";
	readonly workflowType: ApprovalWorkflowType;

	constructor(workflowType: ApprovalWorkflowType) {
		super(
			`Snapshot serialisation for ${workflowType} is not available until its case table exists.`,
		);
		this.name = "UnsupportedSnapshotWorkflowError";
		this.workflowType = workflowType;
	}
}

export async function serialiseWorkflow(
	workflowType: ApprovalWorkflowType,
	caseId: string,
	options: SerialiseWorkflowOptions = {},
): Promise<WorkflowSnapshotData> {
	if (workflowType !== "II") {
		throw new UnsupportedSnapshotWorkflowError(workflowType);
	}

	if (!options.store && !options.client && options.tenantId) {
		const { withTenantConnection } = await import("../db/tenancy");
		return withTenantConnection(options.tenantId, (tx) =>
			serialiseWorkflow(workflowType, caseId, {
				store: new PrismaWorkflowSerialiseStore(tx as SnapshotPrismaClient),
			}),
		);
	}

	const store =
		options.store ??
		new PrismaWorkflowSerialiseStore(
			options.client ?? (await getDefaultSnapshotPrismaClient()),
		);
	const workflow = await store.findIncidentWorkflow(caseId);

	if (!workflow) {
		throw new WorkflowNotFoundError(workflowType, caseId);
	}

	return serialiseIncidentWorkflow(workflow);
}

export class PrismaWorkflowSerialiseStore implements WorkflowSerialiseStore {
	private readonly client: SnapshotPrismaClient;

	constructor(client: SnapshotPrismaClient) {
		this.client = client;
	}

	async findIncidentWorkflow(
		caseId: string,
	): Promise<IncidentWorkflowRow | null> {
		const cases = await this.client.$queryRaw<IncidentCaseRow[]>`
				SELECT
					id::text AS id,
					case_number AS "caseNumber",
					suva_case_number AS "suvaCaseNumber",
					title,
					incident_at AS "incidentAt",
						incident_time_note AS "incidentTimeNote",
						location,
						incident_type::text AS "incidentType",
						actual_injury_outcome::text AS "actualInjuryOutcome",
						actual_severity_code AS "actualSeverityCode",
						actual_severity_reason AS "actualSeverityReason",
						potential_outcome_text AS "potentialOutcomeText",
						potential_severity_code AS "potentialSeverityCode",
						potential_likelihood_code AS "potentialLikelihoodCode",
						potential_risk_band AS "potentialRiskBand",
						hazard_category_code AS "hazardCategoryCode",
						department_text AS "departmentText",
						area_text AS "areaText",
						work_activity AS "workActivity",
						work_type AS "workType",
						event_type AS "eventType",
						process_involved AS "processInvolved",
						ppe_required AS "ppeRequired",
						ppe_worn AS "ppeWorn",
						injury_nature AS "injuryNature",
						body_part AS "bodyPart",
						lost_days AS "lostDays",
						contractor_flag AS "contractorFlag",
						time_in_role_band AS "timeInRoleBand",
						reportable_uvg AS "reportableUvg",
						control_failure AS "controlFailure",
						immediate_cause AS "immediateCause",
						contributing_causes AS "contributingCauses",
						closed_at AS "closedAt",
						coordinator_role AS "coordinatorRole",
				coordinator_name AS "coordinatorName",
				workflow_stage::text AS "workflowStage",
				content_language::text AS "contentLanguage",
				vision_consent::text AS "visionConsent",
				hira_followup_needed AS "hiraFollowupNeeded",
				hira_followup_text AS "hiraFollowupText",
				created_by::text AS "createdById",
				created_at AS "createdAt",
				updated_at AS "updatedAt"
			FROM incident_case
			WHERE id = ${caseId}::uuid
			LIMIT 1
		`;
		const incidentCase = cases[0];

		if (!incidentCase) {
			return null;
		}

		const [
			persons,
			accountRows,
			facts,
			personalEvents,
			timelineEventRows,
			sources,
			deviations,
			attachments,
			causeNodeRows,
			actions,
		] = await Promise.all([
			this.client.$queryRaw<IncidentPersonRow[]>`
				SELECT
					id::text AS id,
					case_id::text AS "caseId",
						role,
						name,
						other_info AS "otherInfo",
						years_with_company AS "yearsWithCompany",
						created_at AS "createdAt",
					updated_at AS "updatedAt"
				FROM incident_person
				WHERE case_id = ${caseId}::uuid
			`,
			this.client.$queryRaw<IncidentAccountBaseRow[]>`
				SELECT
					id::text AS id,
					case_id::text AS "caseId",
					person_id::text AS "personId",
					raw_statement AS "rawStatement",
					created_at AS "createdAt",
					updated_at AS "updatedAt"
				FROM incident_account
				WHERE case_id = ${caseId}::uuid
			`,
			this.client.$queryRaw<IncidentFactRow[]>`
				SELECT
					fact.id::text AS id,
					fact.account_id::text AS "accountId",
					fact.order_index AS "orderIndex",
					fact.text,
					fact.created_at AS "createdAt",
					fact.updated_at AS "updatedAt"
				FROM incident_fact fact
				JOIN incident_account account ON account.id = fact.account_id
				WHERE account.case_id = ${caseId}::uuid
			`,
			this.client.$queryRaw<IncidentPersonalEventRow[]>`
				SELECT
					event.id::text AS id,
					event.account_id::text AS "accountId",
					event.order_index AS "orderIndex",
					event.event_at AS "eventAt",
					event.time_label AS "timeLabel",
					event.text,
					event.created_at AS "createdAt",
					event.updated_at AS "updatedAt"
				FROM incident_personal_event event
				JOIN incident_account account ON account.id = event.account_id
				WHERE account.case_id = ${caseId}::uuid
			`,
			this.client.$queryRaw<IncidentTimelineEventBaseRow[]>`
				SELECT
					id::text AS id,
					case_id::text AS "caseId",
					order_index AS "orderIndex",
					event_at AS "eventAt",
					time_label AS "timeLabel",
					text,
					confidence::text AS confidence,
					created_at AS "createdAt",
					updated_at AS "updatedAt"
				FROM incident_timeline_event
				WHERE case_id = ${caseId}::uuid
			`,
			this.client.$queryRaw<IncidentTimelineSourceRow[]>`
				SELECT
					source.id::text AS id,
					source.timeline_event_id::text AS "timelineEventId",
					source.account_id::text AS "accountId",
					source.fact_id::text AS "factId",
					source.personal_event_id::text AS "personalEventId",
					source.created_at AS "createdAt",
					source.updated_at AS "updatedAt"
				FROM incident_timeline_source source
				JOIN incident_timeline_event event ON event.id = source.timeline_event_id
				WHERE event.case_id = ${caseId}::uuid
			`,
			this.client.$queryRaw<IncidentDeviationRow[]>`
				SELECT
					deviation.id::text AS id,
					deviation.event_id::text AS "eventId",
					deviation.order_index AS "orderIndex",
					deviation.expected,
					deviation.actual,
					deviation.created_at AS "createdAt",
					deviation.updated_at AS "updatedAt"
				FROM incident_deviation deviation
				JOIN incident_timeline_event event ON event.id = deviation.event_id
				WHERE event.case_id = ${caseId}::uuid
			`,
			this.client.$queryRaw<IncidentAttachmentRow[]>`
				SELECT
					attachment.id::text AS id,
					attachment.event_id::text AS "eventId",
					attachment.storage_key AS "storageKey",
					attachment.filename,
					attachment.mime_type AS "mimeType",
					attachment.size_bytes AS "sizeBytes",
					attachment.created_at AS "createdAt",
					attachment.created_by::text AS "createdById"
				FROM incident_attachment attachment
				JOIN incident_timeline_event event ON event.id = attachment.event_id
				WHERE event.case_id = ${caseId}::uuid
			`,
			this.client.$queryRaw<IncidentCauseNodeBaseRow[]>`
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
				WHERE case_id = ${caseId}::uuid
			`,
			this.client.$queryRaw<IncidentCauseActionRow[]>`
				SELECT
					action.id::text AS id,
					action.cause_node_id::text AS "causeNodeId",
					action.order_index AS "orderIndex",
					action.description,
					action.owner_role AS "ownerRole",
					action.due_date AS "dueDate",
					action.action_type::text AS "actionType",
					action.status::text AS status,
					action.created_at AS "createdAt",
					action.updated_at AS "updatedAt"
				FROM incident_cause_action action
				JOIN incident_cause_node node ON node.id = action.cause_node_id
				WHERE node.case_id = ${caseId}::uuid
			`,
		]);

		const factsByAccount = groupBy(facts, (fact) => fact.accountId);
		const personalEventsByAccount = groupBy(
			personalEvents,
			(event) => event.accountId,
		);
		const sourcesByEvent = groupBy(sources, (source) => source.timelineEventId);
		const deviationsByEvent = groupBy(
			deviations,
			(deviation) => deviation.eventId,
		);
		const attachmentsByEvent = groupBy(
			attachments,
			(attachment) => attachment.eventId,
		);
		const actionsByCause = groupBy(actions, (action) => action.causeNodeId);

		return {
			...incidentCase,
			persons,
			accounts: accountRows.map((account) => ({
				...account,
				facts: factsByAccount.get(account.id) ?? [],
				personalEvents: personalEventsByAccount.get(account.id) ?? [],
			})),
			timelineEvents: timelineEventRows.map((event) => ({
				...event,
				sources: sourcesByEvent.get(event.id) ?? [],
				deviations: deviationsByEvent.get(event.id) ?? [],
				attachments: attachmentsByEvent.get(event.id) ?? [],
			})),
			causeNodes: causeNodeRows.map((node) => ({
				...node,
				actions: actionsByCause.get(node.id) ?? [],
			})),
		};
	}
}

export type SnapshotPrismaClient = {
	$queryRaw<T = unknown>(
		strings: TemplateStringsArray,
		...values: unknown[]
	): Promise<T>;
};

type IncidentCaseRow = {
	id: string;
	caseNumber: string | null;
	suvaCaseNumber: string | null;
	title: string;
	incidentAt: Date | null;
	incidentTimeNote: string | null;
	location: string | null;
	incidentType: string;
	actualInjuryOutcome: string | null;
	actualSeverityCode: string | null;
	actualSeverityReason: string | null;
	potentialOutcomeText: string | null;
	potentialSeverityCode: string | null;
	potentialLikelihoodCode: string | null;
	potentialRiskBand: string | null;
	hazardCategoryCode: string | null;
	departmentText: string | null;
	areaText: string | null;
	workActivity: string | null;
	workType: string | null;
	eventType: string | null;
	processInvolved: string | null;
	ppeRequired: string[];
	ppeWorn: string[];
	injuryNature: string | null;
	bodyPart: string | null;
	lostDays: number | null;
	contractorFlag: boolean | null;
	timeInRoleBand: string | null;
	reportableUvg: boolean | null;
	controlFailure: string | null;
	immediateCause: string | null;
	contributingCauses: string[];
	closedAt: Date | null;
	coordinatorRole: string;
	coordinatorName: string | null;
	workflowStage: string;
	contentLanguage: string;
	visionConsent: string;
	hiraFollowupNeeded: boolean;
	hiraFollowupText: string | null;
	createdById: string;
	createdAt: Date;
	updatedAt: Date;
};

export type IncidentWorkflowRow = IncidentCaseRow & {
	persons: IncidentPersonRow[];
	accounts: IncidentAccountRow[];
	timelineEvents: IncidentTimelineEventRow[];
	causeNodes: IncidentCauseNodeRow[];
};

type IncidentPersonRow = {
	id: string;
	caseId: string;
	role: string;
	name: string | null;
	otherInfo: string | null;
	yearsWithCompany: number | null;
	createdAt: Date;
	updatedAt: Date;
};

type IncidentAccountBaseRow = {
	id: string;
	caseId: string;
	personId: string;
	rawStatement: string | null;
	createdAt: Date;
	updatedAt: Date;
};

type IncidentAccountRow = IncidentAccountBaseRow & {
	facts: IncidentFactRow[];
	personalEvents: IncidentPersonalEventRow[];
};

type IncidentFactRow = {
	id: string;
	accountId: string;
	orderIndex: number;
	text: string;
	createdAt: Date;
	updatedAt: Date;
};

type IncidentPersonalEventRow = {
	id: string;
	accountId: string;
	orderIndex: number;
	eventAt: Date | null;
	timeLabel: string | null;
	text: string;
	createdAt: Date;
	updatedAt: Date;
};

type IncidentTimelineEventBaseRow = {
	id: string;
	caseId: string;
	orderIndex: number;
	eventAt: Date | null;
	timeLabel: string | null;
	text: string;
	confidence: string;
	createdAt: Date;
	updatedAt: Date;
};

type IncidentTimelineEventRow = IncidentTimelineEventBaseRow & {
	sources: IncidentTimelineSourceRow[];
	deviations: IncidentDeviationRow[];
	attachments: IncidentAttachmentRow[];
};

type IncidentTimelineSourceRow = {
	id: string;
	timelineEventId: string;
	accountId: string;
	factId: string | null;
	personalEventId: string | null;
	createdAt: Date;
	updatedAt: Date;
};

type IncidentDeviationRow = {
	id: string;
	eventId: string;
	orderIndex: number;
	expected: string | null;
	actual: string | null;
	createdAt: Date;
	updatedAt: Date;
};

type IncidentAttachmentRow = {
	id: string;
	eventId: string;
	storageKey: string;
	filename: string | null;
	mimeType: string | null;
	sizeBytes: bigint | number | string | null;
	createdAt: Date;
	createdById: string;
};

type IncidentCauseNodeBaseRow = {
	id: string;
	caseId: string;
	parentId: string | null;
	timelineEventId: string | null;
	orderIndex: number;
	statement: string;
	question: string | null;
	isRootCause: boolean;
	branchStatus?: string | null;
	createdAt: Date;
	updatedAt: Date;
};

type IncidentCauseNodeRow = IncidentCauseNodeBaseRow & {
	actions: IncidentCauseActionRow[];
};

type IncidentCauseActionRow = {
	id: string;
	causeNodeId: string;
	orderIndex: number;
	description: string;
	ownerRole: string | null;
	dueDate: Date | null;
	actionType: string | null;
	status: string;
	createdAt: Date;
	updatedAt: Date;
};

function serialiseIncidentWorkflow(
	workflow: IncidentWorkflowRow,
): WorkflowSnapshotData {
	return {
		schemaVersion: SNAPSHOT_SCHEMA_VERSION,
		workflowType: "II",
			case: {
				id: workflow.id,
				caseNumber: workflow.caseNumber,
				suvaCaseNumber: workflow.suvaCaseNumber,
				title: workflow.title,
				incidentAt: isoDateOrNull(workflow.incidentAt),
				incidentTimeNote: workflow.incidentTimeNote,
				location: workflow.location,
				incidentType: workflow.incidentType,
				actualInjuryOutcome: workflow.actualInjuryOutcome,
				actualSeverityCode: workflow.actualSeverityCode,
				actualSeverityReason: workflow.actualSeverityReason,
				potentialOutcomeText: workflow.potentialOutcomeText,
				potentialSeverityCode: workflow.potentialSeverityCode,
				potentialLikelihoodCode: workflow.potentialLikelihoodCode,
				potentialRiskBand: workflow.potentialRiskBand,
				hazardCategoryCode: workflow.hazardCategoryCode,
				departmentText: workflow.departmentText,
				areaText: workflow.areaText,
				workActivity: workflow.workActivity,
				workType: workflow.workType,
				eventType: workflow.eventType,
				processInvolved: workflow.processInvolved,
				ppeRequired: workflow.ppeRequired,
				ppeWorn: workflow.ppeWorn,
				injuryNature: workflow.injuryNature,
				bodyPart: workflow.bodyPart,
				lostDays: workflow.lostDays,
				contractorFlag: workflow.contractorFlag,
				timeInRoleBand: workflow.timeInRoleBand,
				reportableUvg: workflow.reportableUvg,
				controlFailure: workflow.controlFailure,
				immediateCause: workflow.immediateCause,
				contributingCauses: workflow.contributingCauses,
				closedAt: isoDateOrNull(workflow.closedAt),
				coordinatorRole: workflow.coordinatorRole,
			coordinatorName: workflow.coordinatorName,
			workflowStage: workflow.workflowStage,
			contentLanguage: workflow.contentLanguage,
			visionConsent: workflow.visionConsent,
			hiraFollowupNeeded: workflow.hiraFollowupNeeded,
			hiraFollowupText: workflow.hiraFollowupText,
			createdById: workflow.createdById,
			createdAt: workflow.createdAt.toISOString(),
			updatedAt: workflow.updatedAt.toISOString(),
		},
		persons: sortBy(workflow.persons, personSortKey).map((person) => ({
			id: person.id,
			caseId: person.caseId,
			role: person.role,
			name: person.name,
			otherInfo: person.otherInfo,
			yearsWithCompany: person.yearsWithCompany,
			createdAt: person.createdAt.toISOString(),
			updatedAt: person.updatedAt.toISOString(),
		})),
		accounts: sortBy(workflow.accounts, accountSortKey).map((account) => ({
			id: account.id,
			caseId: account.caseId,
			personId: account.personId,
			rawStatement: account.rawStatement,
			createdAt: account.createdAt.toISOString(),
			updatedAt: account.updatedAt.toISOString(),
			facts: sortBy(account.facts, orderedChildSortKey).map((fact) => ({
				id: fact.id,
				accountId: fact.accountId,
				orderIndex: fact.orderIndex,
				text: fact.text,
				createdAt: fact.createdAt.toISOString(),
				updatedAt: fact.updatedAt.toISOString(),
			})),
			personalEvents: sortBy(account.personalEvents, personalEventSortKey).map(
				(event) => ({
					id: event.id,
					accountId: event.accountId,
					orderIndex: event.orderIndex,
					eventAt: isoDateOrNull(event.eventAt),
					timeLabel: event.timeLabel,
					text: event.text,
					createdAt: event.createdAt.toISOString(),
					updatedAt: event.updatedAt.toISOString(),
				}),
			),
		})),
		timelineEvents: sortBy(workflow.timelineEvents, timelineEventSortKey).map(
			(event) => ({
				id: event.id,
				caseId: event.caseId,
				orderIndex: event.orderIndex,
				eventAt: isoDateOrNull(event.eventAt),
				timeLabel: event.timeLabel,
				text: event.text,
				confidence: event.confidence,
				createdAt: event.createdAt.toISOString(),
				updatedAt: event.updatedAt.toISOString(),
				sources: sortBy(event.sources, timelineSourceSortKey).map((source) => ({
					id: source.id,
					timelineEventId: source.timelineEventId,
					accountId: source.accountId,
					factId: source.factId,
					personalEventId: source.personalEventId,
					createdAt: source.createdAt.toISOString(),
					updatedAt: source.updatedAt.toISOString(),
				})),
				deviations: sortBy(event.deviations, orderedChildSortKey).map(
					(deviation) => ({
						id: deviation.id,
						eventId: deviation.eventId,
						orderIndex: deviation.orderIndex,
						expected: deviation.expected,
						actual: deviation.actual,
						createdAt: deviation.createdAt.toISOString(),
						updatedAt: deviation.updatedAt.toISOString(),
					}),
				),
				attachments: sortBy(event.attachments, attachmentSortKey).map(
					(attachment) => ({
						id: attachment.id,
						eventId: attachment.eventId,
						storageKey: attachment.storageKey,
						filename: attachment.filename,
						mimeType: attachment.mimeType,
						sizeBytes: decimalStringOrNull(attachment.sizeBytes),
						createdAt: attachment.createdAt.toISOString(),
						createdById: attachment.createdById,
					}),
				),
			}),
		),
		causeNodes: sortBy(workflow.causeNodes, causeNodeSortKey).map((node) => ({
			id: node.id,
			caseId: node.caseId,
			parentId: node.parentId,
			timelineEventId: node.timelineEventId,
			orderIndex: node.orderIndex,
			statement: node.statement,
			question: node.question,
			isRootCause: node.isRootCause,
			branchStatus: node.branchStatus ?? "OPEN",
			createdAt: node.createdAt.toISOString(),
			updatedAt: node.updatedAt.toISOString(),
			actions: sortBy(node.actions, orderedChildSortKey).map((action) => ({
				id: action.id,
				causeNodeId: action.causeNodeId,
				orderIndex: action.orderIndex,
				description: action.description,
				ownerRole: action.ownerRole,
				dueDate: isoDateOnlyOrNull(action.dueDate),
				actionType: action.actionType,
				status: action.status,
				createdAt: action.createdAt.toISOString(),
				updatedAt: action.updatedAt.toISOString(),
			})),
		})),
	};
}

async function getDefaultSnapshotPrismaClient(): Promise<SnapshotPrismaClient> {
	const { prisma } = await import("../db/tenancy");
	return prisma as unknown as SnapshotPrismaClient;
}

function isoDateOrNull(value: Date | null): string | null {
	return value ? value.toISOString() : null;
}

function isoDateOnlyOrNull(value: Date | null): string | null {
	return value ? value.toISOString().slice(0, 10) : null;
}

function decimalStringOrNull(
	value: bigint | number | string | null,
): string | null {
	return value === null ? null : String(value);
}

function sortBy<T>(items: readonly T[], keyFn: (item: T) => string): T[] {
	return [...items].sort((left, right) =>
		keyFn(left).localeCompare(keyFn(right)),
	);
}

function groupBy<T>(
	items: readonly T[],
	keyFn: (item: T) => string,
): Map<string, T[]> {
	const grouped = new Map<string, T[]>();

	for (const item of items) {
		const key = keyFn(item);
		const values = grouped.get(key) ?? [];
		values.push(item);
		grouped.set(key, values);
	}

	return grouped;
}

function nullLast(value: string | number | Date | null): string {
	if (value === null) {
		return "~";
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	return String(value);
}

function personSortKey(person: IncidentPersonRow): string {
	return [person.role, nullLast(person.name), person.id].join("\u0000");
}

function accountSortKey(account: IncidentAccountRow): string {
	return [account.personId, account.id].join("\u0000");
}

function orderedChildSortKey(item: { orderIndex: number; id: string }): string {
	return [String(item.orderIndex).padStart(10, "0"), item.id].join("\u0000");
}

function personalEventSortKey(event: IncidentPersonalEventRow): string {
	return [
		String(event.orderIndex).padStart(10, "0"),
		nullLast(event.eventAt),
		event.id,
	].join("\u0000");
}

function timelineEventSortKey(event: IncidentTimelineEventRow): string {
	return [
		String(event.orderIndex).padStart(10, "0"),
		nullLast(event.eventAt),
		event.id,
	].join("\u0000");
}

function timelineSourceSortKey(source: IncidentTimelineSourceRow): string {
	return [
		source.timelineEventId,
		source.accountId,
		nullLast(source.factId),
		nullLast(source.personalEventId),
		source.id,
	].join("\u0000");
}

function attachmentSortKey(attachment: IncidentAttachmentRow): string {
	return [attachment.createdAt.toISOString(), attachment.id].join("\u0000");
}

function causeNodeSortKey(node: IncidentCauseNodeRow): string {
	return [
		nullLast(node.parentId),
		String(node.orderIndex).padStart(10, "0"),
		node.id,
	].join("\u0000");
}
