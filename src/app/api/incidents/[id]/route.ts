import { type NextRequest, NextResponse } from "next/server";
import { readSessionCookie } from "../../../../lib/auth/cookies";
import { verifyCsrfRequest } from "../../../../lib/auth/csrf";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../lib/auth/session";
import { withTenantConnection } from "../../../../lib/db";
import type { Locale } from "../../../../lib/i18n/types";
import {
	computePotentialRiskBand,
	defaultActualInjuryOutcomeFor,
	deriveActualSeverityFromOutcome,
	type IncidentActualInjuryOutcome,
	type IncidentType,
	normalizeIncidentClassification,
	parseActualInjuryOutcome,
	parseIncidentType,
	parsePotentialLikelihood,
	parsePotentialSeverity,
	parseSeverity,
} from "../../../../lib/incident/classification";
import {
	EVENT_TYPE_CODES,
	HAZARD_CATEGORY_CODES,
} from "../../../../lib/taxonomy/schema";

export const runtime = "nodejs";

type IncidentRouteContext = {
	params: Promise<{ id: string }> | { id: string };
};

type IncidentRow = {
	id: string;
	caseNumber: string | null;
	suvaCaseNumber: string | null;
	title: string;
	incidentAt: Date | null;
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
	contentLanguage: Locale;
	incidentTimeNote: string | null;
	hiraFollowupNeeded: boolean;
	hiraFollowupText: string | null;
	createdById: string;
	createdAt: Date;
	updatedAt: Date;
};

type IncidentPayload = {
	title: string;
	incidentAt: Date;
	incidentTimeZone: string;
	location: string | null;
	incidentType: IncidentType;
	actualInjuryOutcome: IncidentActualInjuryOutcome;
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
	coordinatorRole: string;
	coordinatorName: string | null;
};

const hazardCategoryCodes = new Set<string>(HAZARD_CATEGORY_CODES);
const eventTypeCodes = new Set<string>(EVENT_TYPE_CODES);
const workTypeCodes = new Set([
	"MAINTENANCE",
	"OPERATIONS",
	"CLEANING",
	"LOGISTICS",
	"CONSTRUCTION",
	"OFFICE",
	"OTHER",
]);
const controlFailureCodes = new Set([
	"MISSING",
	"INADEQUATE",
	"BYPASSED",
	"NOT_USED",
	"UNKNOWN",
]);
const timeInRoleBands = new Set(["<3M", "3-12M", "1-3Y", ">3Y", "unknown"]);
const defaultIncidentTimeZone = "europe/zurich";
const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
	request: NextRequest,
	context: IncidentRouteContext,
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);

	if (!isUuid(id)) {
		return NextResponse.json({ code: "INVALID_INCIDENT_ID" }, { status: 400 });
	}

	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	const incident = await loadIncident(session.tenantId, id);

	if (!incident) {
		return NextResponse.json({ code: "INCIDENT_NOT_FOUND" }, { status: 404 });
	}

	return NextResponse.json({ incident: serializeIncident(incident) });
}

export async function DELETE(
	request: NextRequest,
	context: IncidentRouteContext,
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);

	if (!isUuid(id)) {
		return NextResponse.json({ code: "INVALID_INCIDENT_ID" }, { status: 400 });
	}

	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	if (!verifyCsrfRequest(request.headers, session.id)) {
		return NextResponse.json({ code: "CSRF_REQUIRED" }, { status: 403 });
	}

	const deleted = await softDeleteIncident(session.tenantId, id);

	if (!deleted) {
		return NextResponse.json({ code: "INCIDENT_NOT_FOUND" }, { status: 404 });
	}

	return NextResponse.json({ ok: true });
}

export async function PATCH(
	request: NextRequest,
	context: IncidentRouteContext,
): Promise<NextResponse> {
	return updateIncidentRequest(request, context);
}

export async function POST(
	request: NextRequest,
	context: IncidentRouteContext,
): Promise<NextResponse> {
	return updateIncidentRequest(request, context);
}

async function updateIncidentRequest(
	request: NextRequest,
	context: IncidentRouteContext,
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);

	if (!isUuid(id)) {
		return NextResponse.json({ code: "INVALID_INCIDENT_ID" }, { status: 400 });
	}

	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	const parsed = await readIncidentPayload(request);

	if (!parsed.ok) {
		return NextResponse.json({ code: parsed.code }, { status: 400 });
	}

	const incident = await updateIncident(session.tenantId, id, parsed.payload);

	if (!incident) {
		return NextResponse.json({ code: "INCIDENT_NOT_FOUND" }, { status: 404 });
	}

	if (wantsHtmlRedirect(request)) {
		return NextResponse.redirect(
			new URL(`/incidents/${incident.id}`, request.url),
			303,
		);
	}

	return NextResponse.json({ incident: serializeIncident(incident) });
}

async function loadIncident(
	tenantId: string,
	incidentId: string,
): Promise<IncidentRow | null> {
	const rows = await withTenantConnection(
		tenantId,
		async (tx) =>
			tx.$queryRaw<IncidentRow[]>`
			SELECT
				id::text AS id,
				case_number AS "caseNumber",
				suva_case_number AS "suvaCaseNumber",
				title,
				incident_at AS "incidentAt",
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
				incident_time_note AS "incidentTimeNote",
				hira_followup_needed AS "hiraFollowupNeeded",
				hira_followup_text AS "hiraFollowupText",
				created_by::text AS "createdById",
				created_at AS "createdAt",
				updated_at AS "updatedAt"
			FROM incident_case
			WHERE id = ${incidentId}::uuid
				AND deleted_at IS NULL
			LIMIT 1
		`,
	);

	return rows[0] ?? null;
}

async function updateIncident(
	tenantId: string,
	incidentId: string,
	payload: IncidentPayload,
): Promise<IncidentRow | null> {
	const rows = await withTenantConnection(
		tenantId,
		async (tx) =>
			tx.$queryRaw<IncidentRow[]>`
			UPDATE incident_case
				SET
					title = ${payload.title},
					incident_at = ${payload.incidentAt}::timestamptz,
						incident_time_note = ${payload.incidentTimeZone},
						location = ${payload.location},
						incident_type = ${payload.incidentType}::incident_type,
						actual_injury_outcome = ${payload.actualInjuryOutcome}::incident_actual_injury_outcome,
						actual_severity_code = ${payload.actualSeverityCode},
						actual_severity_reason = ${payload.actualSeverityReason},
						potential_outcome_text = ${payload.potentialOutcomeText},
						potential_severity_code = ${payload.potentialSeverityCode},
						potential_likelihood_code = ${payload.potentialLikelihoodCode},
						potential_risk_band = ${payload.potentialRiskBand},
						hazard_category_code = ${payload.hazardCategoryCode},
						department_text = ${payload.departmentText},
						area_text = ${payload.areaText},
						work_activity = ${payload.workActivity},
						work_type = ${payload.workType},
						event_type = ${payload.eventType},
						process_involved = ${payload.processInvolved},
						ppe_required = ${payload.ppeRequired}::text[],
						ppe_worn = ${payload.ppeWorn}::text[],
						injury_nature = ${payload.injuryNature},
						body_part = ${payload.bodyPart},
						lost_days = ${payload.lostDays},
						contractor_flag = ${payload.contractorFlag},
						time_in_role_band = ${payload.timeInRoleBand},
						reportable_uvg = ${payload.reportableUvg},
						control_failure = ${payload.controlFailure},
						immediate_cause = ${payload.immediateCause},
						contributing_causes = ${payload.contributingCauses}::text[],
						coordinator_role = ${payload.coordinatorRole},
				coordinator_name = ${payload.coordinatorName},
				updated_at = CURRENT_TIMESTAMP
			WHERE id = ${incidentId}::uuid
				AND deleted_at IS NULL
			RETURNING
				id::text AS id,
				case_number AS "caseNumber",
				suva_case_number AS "suvaCaseNumber",
				title,
				incident_at AS "incidentAt",
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
				incident_time_note AS "incidentTimeNote",
				hira_followup_needed AS "hiraFollowupNeeded",
				hira_followup_text AS "hiraFollowupText",
				created_by::text AS "createdById",
				created_at AS "createdAt",
				updated_at AS "updatedAt"
		`,
	);

	return rows[0] ?? null;
}

async function softDeleteIncident(
	tenantId: string,
	incidentId: string,
): Promise<boolean> {
	// Soft delete: safety records stay recoverable and keep their cause/action/
	// coach-message/snapshot foreign keys intact. The register hides rows where
	// deleted_at IS NOT NULL. A single-row update needs no advisory lock.
	const rows = await withTenantConnection(
		tenantId,
		async (tx) =>
			tx.$queryRaw<Array<{ id: string }>>`
			UPDATE incident_case
			SET
				deleted_at = now(),
				updated_at = CURRENT_TIMESTAMP
			WHERE id = ${incidentId}::uuid
				AND deleted_at IS NULL
			RETURNING id::text AS id
		`,
	);

	return Boolean(rows[0]);
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "id" | "tenantId" | "userId"> | null> {
	return validateSession(readSessionCookie(request.cookies));
}

async function readIncidentPayload(
	request: NextRequest,
): Promise<
	| { ok: true; payload: IncidentPayload }
	| { ok: false; code: "INVALID_INCIDENT_PAYLOAD" }
> {
	const body = await readBody(request);
	const title = stringValue(body.get("title"));
	const incidentTimeZone = parseTimeZone(body.get("incidentTimeZone"));
	const incidentAt = parseIncidentAt(
		stringValue(body.get("incidentAt")),
		incidentTimeZone,
	);
	const rawIncidentType = stringValue(body.get("incidentType"));
	const incidentType = parseIncidentType(rawIncidentType);
	const actualInjuryOutcome = parseActualInjuryOutcome(
		body.get("actualInjuryOutcome"),
		rawIncidentType,
	);
	const resolvedActualInjuryOutcome =
		actualInjuryOutcome ??
		(incidentType ? defaultActualInjuryOutcomeFor(incidentType) : null);
	const rawActualSeverity = stringValue(body.get("actualSeverityCode"));
	const parsedActualSeverity = parseSeverity(rawActualSeverity);
	const derivedActualSeverity = resolvedActualInjuryOutcome
		? deriveActualSeverityFromOutcome(resolvedActualInjuryOutcome)
		: null;
	const actualSeverityCode =
		resolvedActualInjuryOutcome === "NO_INJURY" ||
		resolvedActualInjuryOutcome === "UNKNOWN"
			? null
			: (parsedActualSeverity ?? derivedActualSeverity);
	const potentialOutcomeText = nullableStringValue(
		body.get("potentialOutcomeText"),
	);
	const rawPotentialSeverity = stringValue(body.get("potentialSeverityCode"));
	const rawPotentialLikelihood = stringValue(
		body.get("potentialLikelihoodCode"),
	);
	const potentialSeverityCode = parsePotentialSeverity(rawPotentialSeverity);
	// Likelihood lives on the same A–E × 1–5 pair as severity: it is only
	// meaningful once a potential severity is set, so clearing severity (the
	// "kein/—" option in the overview editor) clears the likelihood too.
	const potentialLikelihoodCode = potentialSeverityCode
		? parsePotentialLikelihood(rawPotentialLikelihood)
		: null;
	const potentialPairIsInvalid =
		// A non-empty severity must parse; an empty one clears the pair.
		(Boolean(rawPotentialSeverity) && !potentialSeverityCode) ||
		// A likelihood is only accepted alongside a severity, and must parse.
		Boolean(
			potentialSeverityCode &&
				rawPotentialLikelihood &&
				!potentialLikelihoodCode,
		);
	const potentialRiskBand =
		potentialSeverityCode && potentialLikelihoodCode
			? computePotentialRiskBand(potentialSeverityCode, potentialLikelihoodCode)
			: null;
	const coordinatorRole =
		stringValue(body.get("coordinatorRole")) || "Investigation coordinator";
	const hazardCategoryCode = parseHazardCategoryCode(
		body.get("hazardCategoryCode"),
	);
	const lostDays = parseNonNegativeInteger(body.get("lostDays"));
	const eventType = parseCode(body.get("eventType"), eventTypeCodes);
	const workType = parseCode(body.get("workType"), workTypeCodes);
	const controlFailure = parseCode(
		body.get("controlFailure"),
		controlFailureCodes,
	);
	const timeInRoleBand = parseCode(body.get("timeInRoleBand"), timeInRoleBands);
	const contractorFlag = parseNullableBoolean(body.get("contractorFlag"));
	const reportableUvg = parseNullableBoolean(body.get("reportableUvg"));

	if (
		!title ||
		!incidentAt ||
		!incidentType ||
		(actualInjuryOutcome === null &&
			Boolean(stringValue(body.get("actualInjuryOutcome")))) ||
		(Boolean(rawActualSeverity) && !parsedActualSeverity) ||
		(resolvedActualInjuryOutcome !== null &&
			resolvedActualInjuryOutcome !== "NO_INJURY" &&
			resolvedActualInjuryOutcome !== "UNKNOWN" &&
			!actualSeverityCode) ||
		potentialPairIsInvalid ||
		hazardCategoryCode === false ||
		eventType === false ||
		workType === false ||
		controlFailure === false ||
		timeInRoleBand === false ||
		contractorFlag === "INVALID" ||
		reportableUvg === "INVALID" ||
		lostDays === false
	) {
		return { code: "INVALID_INCIDENT_PAYLOAD", ok: false };
	}

	return {
		ok: true,
		payload: {
			actualSeverityCode,
			actualSeverityReason: actualSeverityCode
				? nullableStringValue(body.get("actualSeverityReason"))
				: null,
			areaText: nullableStringValue(body.get("areaText")),
			bodyPart: nullableStringValue(body.get("bodyPart")),
			contractorFlag,
			coordinatorName: nullableStringValue(body.get("coordinatorName")),
			coordinatorRole,
			controlFailure,
			contributingCauses: parseTextList(body.get("contributingCauses")),
			departmentText: nullableStringValue(body.get("departmentText")),
			eventType,
			hazardCategoryCode,
			immediateCause: nullableStringValue(body.get("immediateCause")),
			incidentAt,
			incidentTimeZone,
			incidentType,
			injuryNature: nullableStringValue(body.get("injuryNature")),
			actualInjuryOutcome:
				resolvedActualInjuryOutcome ??
				defaultActualInjuryOutcomeFor(incidentType as IncidentType),
			location: nullableStringValue(body.get("location")),
			lostDays,
			ppeRequired: parseTextList(body.get("ppeRequired")),
			ppeWorn: parseTextList(body.get("ppeWorn")),
			potentialLikelihoodCode,
			potentialOutcomeText,
			potentialRiskBand,
			potentialSeverityCode,
			processInvolved: nullableStringValue(body.get("processInvolved")),
			reportableUvg,
			timeInRoleBand,
			title,
			workActivity: nullableStringValue(body.get("workActivity")),
			workType,
		},
	};
}

async function readBody(request: NextRequest): Promise<Map<string, unknown>> {
	const contentType = request.headers.get("content-type") ?? "";

	if (contentType.includes("application/json")) {
		const body = (await request.json().catch(() => null)) as Record<
			string,
			unknown
		> | null;
		return new Map(Object.entries(body ?? {}));
	}

	const formData = await request.formData().catch(() => null);
	return new Map(formData?.entries() ?? []);
}

function serializeIncident(row: IncidentRow) {
	const classification = normalizeIncidentClassification(row);

	return {
		...row,
		...classification,
		createdAt: row.createdAt.toISOString(),
		incidentAt: row.incidentAt?.toISOString() ?? null,
		updatedAt: row.updatedAt.toISOString(),
	};
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function nullableStringValue(value: unknown): string | null {
	const text = stringValue(value);
	return text ? text : null;
}

function parseNonNegativeInteger(value: unknown): number | null | false {
	if (typeof value === "number") {
		return Number.isInteger(value) && value >= 0 ? value : false;
	}

	const text = stringValue(value);

	if (!text) {
		return null;
	}

	const parsed = Number(text);
	return Number.isInteger(parsed) && parsed >= 0 ? parsed : false;
}

function parseHazardCategoryCode(value: unknown): string | null | false {
	const text = stringValue(value);

	if (!text) {
		return null;
	}

	return hazardCategoryCodes.has(text) ? text : false;
}

function parseCode(
	value: unknown,
	allowed: Set<string>,
): string | null | false {
	const text = stringValue(value);

	if (!text) {
		return null;
	}

	return allowed.has(text) ? text : false;
}

function parseNullableBoolean(value: unknown): boolean | null | "INVALID" {
	if (typeof value === "boolean") {
		return value;
	}

	const text = stringValue(value).toLowerCase();

	if (!text) {
		return null;
	}

	if (["1", "true", "yes", "on"].includes(text)) {
		return true;
	}

	if (["0", "false", "no", "off"].includes(text)) {
		return false;
	}

	return "INVALID";
}

function parseTextList(value: unknown): string[] {
	const values = Array.isArray(value) ? value : [value];
	return values
		.flatMap((item) => String(item ?? "").split(/[\n,;]/))
		.map((item) => item.trim())
		.filter(Boolean);
}

function parseIncidentAt(value: string, timeZone: string): Date | null {
	if (!value) {
		return null;
	}

	const parsed = hasExplicitTimeZone(value)
		? new Date(value)
		: zonedDateTimeToUtc(value, timeZone);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseTimeZone(value: unknown): string {
	const candidate = stringValue(value) || defaultIncidentTimeZone;

	try {
		return new Intl.DateTimeFormat("en", {
			timeZone: candidate,
		}).resolvedOptions().timeZone;
	} catch {
		return new Intl.DateTimeFormat("en", {
			timeZone: defaultIncidentTimeZone,
		}).resolvedOptions().timeZone;
	}
}

function hasExplicitTimeZone(value: string): boolean {
	return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
}

function zonedDateTimeToUtc(value: string, timeZone: string): Date {
	const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);

	if (!match) {
		return new Date(value);
	}

	const [, year, month, day, hour, minute] = match;
	const naiveUtc = Date.UTC(
		Number(year),
		Number(month) - 1,
		Number(day),
		Number(hour),
		Number(minute),
	);
	const firstOffset = timeZoneOffsetMs(timeZone, new Date(naiveUtc));
	const firstUtc = naiveUtc - firstOffset;
	const secondOffset = timeZoneOffsetMs(timeZone, new Date(firstUtc));

	return new Date(naiveUtc - secondOffset);
}

function timeZoneOffsetMs(timeZone: string, utcDate: Date): number {
	const parts = new Intl.DateTimeFormat("en", {
		day: "2-digit",
		hour: "2-digit",
		hourCycle: "h23",
		minute: "2-digit",
		month: "2-digit",
		second: "2-digit",
		timeZone,
		year: "numeric",
	}).formatToParts(utcDate);
	const part = (type: string): number =>
		Number(parts.find((item) => item.type === type)?.value ?? 0);
	const zonedAsUtc = Date.UTC(
		part("year"),
		part("month") - 1,
		part("day"),
		part("hour"),
		part("minute"),
		part("second"),
	);

	return zonedAsUtc - utcDate.getTime();
}

function wantsHtmlRedirect(request: NextRequest): boolean {
	const accept = request.headers.get("accept") ?? "";
	const contentType = request.headers.get("content-type") ?? "";

	return (
		accept.includes("text/html") ||
		contentType.includes("form-urlencoded") ||
		contentType.includes("multipart/form-data")
	);
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}
