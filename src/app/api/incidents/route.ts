import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { readLocaleCookie, readSessionCookie } from "../../../lib/auth/cookies";
import { resolveUiLocale } from "../../../lib/auth/locale";
import {
	type ValidatedSession,
	validateSession,
} from "../../../lib/auth/session";
import { prisma, withTenantConnection } from "../../../lib/db";
import { DEFAULT_LOCALE, type Locale } from "../../../lib/i18n/types";
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
} from "../../../lib/incident/classification";
import {
	type IncidentLanguageContext,
	resolveIncidentContentLanguage,
} from "../../../lib/incident/locale";
import {
	EVENT_TYPE_CODES,
	HAZARD_CATEGORY_CODES,
} from "../../../lib/taxonomy/schema";
import {
	notifyOperatorCaseStarted,
	scheduleOperatorNotification,
	type CaseSummary,
} from "../../../lib/operator/notifications";

export const runtime = "nodejs";

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
	incidentAt: Date | null;
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
	contentLanguage: Locale;
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
const maxCaseNumberAttempts = 5;

export async function GET(request: NextRequest): Promise<NextResponse> {
	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	const incidents = await listIncidents(session.tenantId);
	return NextResponse.json({ incidents: incidents.map(serializeIncident) });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	if (wantsDraft(request)) {
		return createDraftIncident(request, session);
	}

	const parsed = await readIncidentPayload(request, session);

	if (!parsed.ok) {
		return NextResponse.json({ code: parsed.code }, { status: 400 });
	}

	const incident = await createIncident({
		createdById: session.userId,
		payload: parsed.payload,
		tenantId: session.tenantId,
	});
	queueCaseStartedNotification(incident, session);

	if (wantsHtmlRedirect(request)) {
		return NextResponse.redirect(
			new URL(`/incidents/${incident.id}/coach`, request.url),
			303,
		);
	}

	return NextResponse.json(
		{
			incident: serializeIncident(incident),
			redirectTo: `/incidents/${incident.id}/coach`,
		},
		{ status: 201 },
	);
}

/**
 * Chat-first entry point: create a minimal blank draft so the coach chat opens
 * immediately, with the form record panel as the editable surface. No payload
 * validation; everything except the sensible defaults is left null/empty for
 * the coach to fill in. Content language follows the single-source locale
 * resolution (user.uiLocale → locale cookie → Accept-Language), so a
 * French user's new incident is created with content_language='fr'.
 */
async function createDraftIncident(
	request: NextRequest,
	session: Pick<ValidatedSession, "tenantId" | "userId">,
): Promise<NextResponse> {
	const languageContext = await loadIncidentLanguageContext(request, session);
	const contentLanguage =
		resolveIncidentContentLanguage(null, languageContext) ?? DEFAULT_LOCALE;
	const incidentType: IncidentType = "NEAR_MISS";
	const payload: IncidentPayload = {
		actualInjuryOutcome: "UNKNOWN",
		actualSeverityCode: null,
		actualSeverityReason: null,
		areaText: null,
		bodyPart: null,
		contentLanguage,
		contractorFlag: null,
		controlFailure: null,
		contributingCauses: [],
		coordinatorName: null,
		coordinatorRole: "Investigation coordinator",
		departmentText: null,
		eventType: null,
		hazardCategoryCode: null,
		immediateCause: null,
		// A fresh chat-first draft has no known incident date yet. Storing now()
		// would record the moment "New" was clicked as the incident time, which
		// is a fabricated fact. Leave it null; the coach sets it once the
		// conversation reveals the real date/time.
		incidentAt: null,
		incidentTimeZone: defaultIncidentTimeZone,
		incidentType,
		injuryNature: null,
		location: null,
		lostDays: null,
		potentialLikelihoodCode: null,
		potentialOutcomeText: null,
		potentialRiskBand: null,
		potentialSeverityCode: null,
		ppeRequired: [],
		ppeWorn: [],
		processInvolved: null,
		reportableUvg: null,
		timeInRoleBand: null,
		title: "New investigation",
		workActivity: null,
		workType: null,
	};

	const incident = await createIncident({
		createdById: session.userId,
		payload,
		tenantId: session.tenantId,
	});
	queueCaseStartedNotification(incident, session);

	return NextResponse.json(
		{
			incident: serializeIncident(incident),
			redirectTo: `/incidents/${incident.id}/coach`,
		},
		{ status: 201 },
	);
}

function queueCaseStartedNotification(
	incident: IncidentRow,
	session: Pick<ValidatedSession, "tenantId" | "userId">,
): void {
	scheduleOperatorNotification("case started", () =>
		notifyOperatorCaseStarted({
			caseId: incident.id,
			tenantId: session.tenantId,
			userId: session.userId,
			summary: incidentSummary(incident),
		}),
	);
}

function incidentSummary(incident: IncidentRow): CaseSummary {
	return {
		caseId: incident.id,
		caseNumber: incident.caseNumber,
		title: incident.title,
		workflowStage: incident.workflowStage,
		createdAt: incident.createdAt,
		closedAt: incident.closedAt,
	};
}

async function listIncidents(tenantId: string): Promise<IncidentRow[]> {
	return withTenantConnection(
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
			ORDER BY updated_at DESC, created_at DESC, title ASC
		`,
	);
}

async function createIncident(input: {
	createdById: string;
	payload: IncidentPayload;
	tenantId: string;
}): Promise<IncidentRow> {
	const incidentId = randomUUID();

	for (let attempt = 1; attempt <= maxCaseNumberAttempts; attempt += 1) {
		try {
			const rows = await withTenantConnection(input.tenantId, async (tx) => {
				const caseNumber = await createCaseNumber(tx, input.payload.incidentAt);
				return tx.$queryRaw<IncidentRow[]>`
					INSERT INTO incident_case (
						id,
						case_number,
						title,
						incident_at,
						incident_time_note,
						location,
						incident_type,
						actual_injury_outcome,
						actual_severity_code,
						actual_severity_reason,
						potential_outcome_text,
						potential_severity_code,
						potential_likelihood_code,
						potential_risk_band,
						hazard_category_code,
						department_text,
						area_text,
						work_activity,
						work_type,
						event_type,
						process_involved,
						ppe_required,
						ppe_worn,
						injury_nature,
						body_part,
						lost_days,
						contractor_flag,
						time_in_role_band,
						reportable_uvg,
						control_failure,
						immediate_cause,
						contributing_causes,
						coordinator_role,
						coordinator_name,
						content_language,
						created_by
					) VALUES (
						${incidentId}::uuid,
						${caseNumber},
						${input.payload.title},
						${input.payload.incidentAt}::timestamptz,
						${input.payload.incidentTimeZone},
						${input.payload.location},
						${input.payload.incidentType}::incident_type,
						${input.payload.actualInjuryOutcome}::incident_actual_injury_outcome,
						${input.payload.actualSeverityCode},
						${input.payload.actualSeverityReason},
						${input.payload.potentialOutcomeText},
						${input.payload.potentialSeverityCode},
						${input.payload.potentialLikelihoodCode},
						${input.payload.potentialRiskBand},
						${input.payload.hazardCategoryCode},
						${input.payload.departmentText},
						${input.payload.areaText},
						${input.payload.workActivity},
						${input.payload.workType},
						${input.payload.eventType},
						${input.payload.processInvolved},
						${input.payload.ppeRequired}::text[],
						${input.payload.ppeWorn}::text[],
						${input.payload.injuryNature},
						${input.payload.bodyPart},
						${input.payload.lostDays},
						${input.payload.contractorFlag},
						${input.payload.timeInRoleBand},
						${input.payload.reportableUvg},
						${input.payload.controlFailure},
						${input.payload.immediateCause},
						${input.payload.contributingCauses}::text[],
						${input.payload.coordinatorRole},
						${input.payload.coordinatorName},
						${input.payload.contentLanguage}::shared.language_code,
						${input.createdById}::uuid
					)
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
				`;
			});

			const incident = rows[0];
			if (!incident) {
				throw new Error("Incident insert returned no row");
			}
			return incident;
		} catch (error) {
			if (attempt === maxCaseNumberAttempts || !isCaseNumberConflict(error)) {
				throw error;
			}
		}
	}

	throw new Error("Incident case number allocation failed");
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "tenantId" | "userId"> | null> {
	return validateSession(readSessionCookie(request.cookies));
}

async function readIncidentPayload(
	request: NextRequest,
	session: Pick<ValidatedSession, "tenantId" | "userId">,
): Promise<
	| { ok: true; payload: IncidentPayload }
	| { ok: false; code: "INVALID_CONTENT_LANGUAGE" | "INVALID_INCIDENT_PAYLOAD" }
> {
	const body = await readBody(request);
	const languageContext = await loadIncidentLanguageContext(request, session);
	const contentLanguage = resolveIncidentContentLanguage(
		body.get("contentLanguage"),
		languageContext,
	);
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
	const potentialLikelihoodCode = parsePotentialLikelihood(
		rawPotentialLikelihood,
	);
	const potentialPairIsInvalid =
		!rawPotentialSeverity ||
		!potentialSeverityCode ||
		(Boolean(rawPotentialLikelihood) && !potentialLikelihoodCode);
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

	if (!contentLanguage) {
		return { code: "INVALID_CONTENT_LANGUAGE", ok: false };
	}

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
			contentLanguage,
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

async function loadIncidentLanguageContext(
	request: NextRequest,
	session: Pick<ValidatedSession, "tenantId" | "userId">,
): Promise<IncidentLanguageContext> {
	const [tenant, user] = await Promise.all([
		prisma.tenant.findUnique({
			select: { defaultLanguage: true },
			where: { id: session.tenantId },
		}),
		prisma.user.findUnique({
			select: { uiLocale: true },
			where: { id: session.userId },
		}),
	]);

	// The creator's effective language follows the single source of truth:
	// persisted user.uiLocale first, then the locale cookie, then the
	// browser Accept-Language. This is what makes a new incident's stored
	// content_language match the language the user is actually working in.
	const creatorUiLocale = resolveUiLocale({
		acceptLanguageHeader: request.headers.get("accept-language"),
		cookieLocale: readLocaleCookie(request.cookies),
		userLocale: user?.uiLocale,
	});

	return {
		companyDefaultLanguage: tenant?.defaultLanguage ?? DEFAULT_LOCALE,
		creatorUiLocale,
	};
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

async function createCaseNumber(
	tx: Parameters<Parameters<typeof withTenantConnection>[1]>[0],
	incidentAt: Date | null,
): Promise<string> {
	// The case number is an administrative identifier, not a record of when the
	// incident occurred. When the incident date is still unknown (a fresh draft),
	// derive the sequence from the year the record is being opened. If the coach
	// later sets a real incident_at, the already-assigned case number is kept.
	const year = (incidentAt ?? new Date()).getUTCFullYear();
	const yearPattern = `^II-${year}-([0-9]+)$`;
	const yearMatcher = `^II-${year}-[0-9]+$`;
	const rows = await tx.$queryRaw<Array<{ nextNumber: number }>>`
		SELECT (COALESCE(MAX(substring(case_number FROM ${yearPattern})::int), 0) + 1)::int AS "nextNumber"
		FROM incident_case
		WHERE case_number ~ ${yearMatcher}
	`;
	const nextNumber = rows[0]?.nextNumber ?? 1;
	return `II-${year}-${String(nextNumber).padStart(3, "0")}`;
}

function isCaseNumberConflict(error: unknown): boolean {
	if (!error || typeof error !== "object") {
		return false;
	}

	const candidate = error as {
		code?: string;
		message?: string;
		meta?: { code?: string; message?: string };
	};
	const text = [
		candidate.code,
		candidate.meta?.code,
		candidate.meta?.message,
		candidate.message,
	]
		.filter(Boolean)
		.join(" ");

	return (
		text.includes("23505") &&
		(text.includes("incident_case_case_number_key") ||
			text.includes("case_number"))
	);
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

function wantsDraft(request: NextRequest): boolean {
	return request.nextUrl.searchParams.get("draft") === "1";
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
