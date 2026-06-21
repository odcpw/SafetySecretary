import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { readSessionCookie } from "../../../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../../lib/auth/session";
import { withTenantConnection } from "../../../../../lib/db";

export const runtime = "nodejs";

type PersonsRouteContext = {
	params: Promise<{ id: string }> | { id: string };
};

type IncidentPersonRole = "witness" | "injured" | "coordinator" | "supervisor";

type IncidentPersonRow = {
	id: string;
	caseId: string;
	role: IncidentPersonRole;
	name: string | null;
	otherInfo: string | null;
	yearsWithCompany: number | null;
	createdAt: Date;
	updatedAt: Date;
};

type PersonPayload = {
	personId?: string;
	role: IncidentPersonRole;
	name: string | null;
	otherInfo: string | null;
	yearsWithCompany: number | null;
};

type ParsedBody = Map<string, unknown>;

const validRoles = new Set<IncidentPersonRole>([
	"witness",
	"injured",
	"coordinator",
	"supervisor",
]);
const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
	request: NextRequest,
	context: PersonsRouteContext,
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);

	if (!isUuid(id)) {
		return NextResponse.json({ code: "INVALID_INCIDENT_ID" }, { status: 400 });
	}

	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	const persons = await listPersons(session.tenantId, id);

	if (!persons) {
		return NextResponse.json({ code: "INCIDENT_NOT_FOUND" }, { status: 404 });
	}

	return NextResponse.json({ persons: persons.map(serializePerson) });
}

export async function POST(
	request: NextRequest,
	context: PersonsRouteContext,
): Promise<NextResponse> {
	const body = await readBody(request);
	const action = stringValue(body.get("_action"));

	if (action === "delete") {
		return deletePersonRequest(request, context, body);
	}

	if (action === "update") {
		return updatePersonRequest(request, context, body);
	}

	return createPersonRequest(request, context, body);
}

export async function PATCH(
	request: NextRequest,
	context: PersonsRouteContext,
): Promise<NextResponse> {
	return updatePersonRequest(request, context, await readBody(request));
}

export async function DELETE(
	request: NextRequest,
	context: PersonsRouteContext,
): Promise<NextResponse> {
	return deletePersonRequest(request, context, await readBody(request));
}

async function createPersonRequest(
	request: NextRequest,
	context: PersonsRouteContext,
	body: ParsedBody,
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);
	const session = await resolveValidRequest(request, id);

	if (session instanceof NextResponse) {
		return session;
	}

	const parsed = parsePersonPayload(body, false);

	if (!parsed.ok) {
		if (wantsHtmlRedirect(request)) {
			return redirectToPersons(request, id, parsed.code);
		}

		return NextResponse.json({ code: parsed.code }, { status: 400 });
	}

	const person = await createPerson(session.tenantId, id, parsed.payload);

	if (!person) {
		return NextResponse.json({ code: "INCIDENT_NOT_FOUND" }, { status: 404 });
	}

	if (wantsHtmlRedirect(request)) {
		return NextResponse.redirect(
			new URL(`/incidents/${id}/persons`, request.url),
			303,
		);
	}

	return NextResponse.json(
		{ person: serializePerson(person) },
		{ status: 201 },
	);
}

async function updatePersonRequest(
	request: NextRequest,
	context: PersonsRouteContext,
	body: ParsedBody,
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);
	const session = await resolveValidRequest(request, id);

	if (session instanceof NextResponse) {
		return session;
	}

	const parsed = parsePersonPayload(body, true);

	if (!parsed.ok) {
		if (wantsHtmlRedirect(request)) {
			return redirectToPersons(request, id, parsed.code);
		}

		return NextResponse.json({ code: parsed.code }, { status: 400 });
	}

	const person = await updatePerson(session.tenantId, id, parsed.payload);

	if (!person) {
		return NextResponse.json({ code: "PERSON_NOT_FOUND" }, { status: 404 });
	}

	if (wantsHtmlRedirect(request)) {
		return NextResponse.redirect(
			new URL(`/incidents/${id}/persons`, request.url),
			303,
		);
	}

	return NextResponse.json({ person: serializePerson(person) });
}

async function deletePersonRequest(
	request: NextRequest,
	context: PersonsRouteContext,
	body: ParsedBody,
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);
	const session = await resolveValidRequest(request, id);

	if (session instanceof NextResponse) {
		return session;
	}

	const personId = stringValue(body.get("personId"));

	if (!isUuid(personId)) {
		if (wantsHtmlRedirect(request)) {
			return redirectToPersons(request, id, "INVALID_PERSON_ID");
		}

		return NextResponse.json({ code: "INVALID_PERSON_ID" }, { status: 400 });
	}

	const deleted = await deletePerson(session.tenantId, id, personId);

	if (!deleted) {
		return NextResponse.json({ code: "PERSON_NOT_FOUND" }, { status: 404 });
	}

	if (wantsHtmlRedirect(request)) {
		return NextResponse.redirect(
			new URL(`/incidents/${id}/persons`, request.url),
			303,
		);
	}

	return NextResponse.json({ ok: true });
}

async function resolveValidRequest(
	request: NextRequest,
	incidentId: string,
): Promise<Pick<ValidatedSession, "tenantId" | "userId"> | NextResponse> {
	if (!isUuid(incidentId)) {
		return NextResponse.json({ code: "INVALID_INCIDENT_ID" }, { status: 400 });
	}

	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	return session;
}

async function listPersons(
	tenantId: string,
	incidentId: string,
): Promise<IncidentPersonRow[] | null> {
	return withTenantConnection(tenantId, async (tx) => {
		const cases = await tx.$queryRaw<Array<{ id: string }>>`
			SELECT id::text AS id
			FROM incident_case
			WHERE id = ${incidentId}::uuid
			LIMIT 1
		`;

		if (!cases[0]) {
			return null;
		}

		return tx.$queryRaw<IncidentPersonRow[]>`
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
			WHERE case_id = ${incidentId}::uuid
			ORDER BY created_at ASC, id ASC
		`;
	});
}

async function createPerson(
	tenantId: string,
	incidentId: string,
	payload: PersonPayload,
): Promise<IncidentPersonRow | null> {
	const personId = randomUUID();

	return withTenantConnection(tenantId, async (tx) => {
		const rows = await tx.$queryRaw<IncidentPersonRow[]>`
			INSERT INTO incident_person (
				id,
				case_id,
				role,
				name,
				other_info,
				years_with_company
			)
			SELECT
				${personId}::uuid,
				incident_case.id,
				${payload.role},
				${payload.name},
				${payload.otherInfo},
				${payload.yearsWithCompany}
			FROM incident_case
			WHERE incident_case.id = ${incidentId}::uuid
			RETURNING
				id::text AS id,
				case_id::text AS "caseId",
				role,
				name,
				other_info AS "otherInfo",
				years_with_company AS "yearsWithCompany",
				created_at AS "createdAt",
				updated_at AS "updatedAt"
		`;

		return rows[0] ?? null;
	});
}

async function updatePerson(
	tenantId: string,
	incidentId: string,
	payload: PersonPayload,
): Promise<IncidentPersonRow | null> {
	return withTenantConnection(tenantId, async (tx) => {
		const rows = await tx.$queryRaw<IncidentPersonRow[]>`
			UPDATE incident_person
			SET
				role = ${payload.role},
				name = ${payload.name},
				other_info = ${payload.otherInfo},
				years_with_company = ${payload.yearsWithCompany},
				updated_at = CURRENT_TIMESTAMP
			WHERE id = ${payload.personId}::uuid
				AND case_id = ${incidentId}::uuid
			RETURNING
				id::text AS id,
				case_id::text AS "caseId",
				role,
				name,
				other_info AS "otherInfo",
				years_with_company AS "yearsWithCompany",
				created_at AS "createdAt",
				updated_at AS "updatedAt"
		`;

		return rows[0] ?? null;
	});
}

async function deletePerson(
	tenantId: string,
	incidentId: string,
	personId: string,
): Promise<boolean> {
	return withTenantConnection(tenantId, async (tx) => {
		const rows = await tx.$queryRaw<Array<{ id: string }>>`
			DELETE FROM incident_person
			WHERE id = ${personId}::uuid
				AND case_id = ${incidentId}::uuid
			RETURNING id::text AS id
		`;

		return Boolean(rows[0]);
	});
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "tenantId" | "userId"> | null> {
	return validateSession(readSessionCookie(request.cookies));
}

async function readBody(request: NextRequest): Promise<ParsedBody> {
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

function parsePersonPayload(
	body: ParsedBody,
	requirePersonId: boolean,
):
	| { ok: true; payload: PersonPayload }
	| {
			ok: false;
			code:
				| "INVALID_PERSON_ID"
				| "INVALID_PERSON_PAYLOAD"
				| "INVALID_PERSON_ROLE";
	  } {
	const personId = stringValue(body.get("personId"));
	const role = stringValue(body.get("role"));

	if (requirePersonId && !isUuid(personId)) {
		return { code: "INVALID_PERSON_ID", ok: false };
	}

	if (!validRoles.has(role as IncidentPersonRole)) {
		return { code: "INVALID_PERSON_ROLE", ok: false };
	}

	const name = nullableStringValue(body.get("name"));
	const otherInfo = nullableStringValue(body.get("otherInfo"));
	const yearsWithCompany = parseNonNegativeInteger(
		body.get("yearsWithCompany"),
	);

	if (yearsWithCompany === false || (!name && !otherInfo)) {
		return { code: "INVALID_PERSON_PAYLOAD", ok: false };
	}

	return {
		ok: true,
		payload: {
			name,
			otherInfo,
			personId: requirePersonId ? personId : undefined,
			role: role as IncidentPersonRole,
			yearsWithCompany,
		},
	};
}

function serializePerson(row: IncidentPersonRow) {
	return {
		...row,
		createdAt: row.createdAt.toISOString(),
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
	if (value === null || value === undefined || value === "") {
		return null;
	}

	const text =
		typeof value === "number" && Number.isInteger(value)
			? String(value)
			: stringValue(value);

	if (!/^\d+$/.test(text)) {
		return false;
	}

	const parsed = Number.parseInt(text, 10);
	return Number.isSafeInteger(parsed) ? parsed : false;
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

function redirectToPersons(
	request: NextRequest,
	incidentId: string,
	errorCode: string,
): NextResponse {
	const url = new URL(`/incidents/${incidentId}/persons`, request.url);
	url.searchParams.set("error", errorCode);
	return NextResponse.redirect(url, 303);
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}
