import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../../../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../../lib/auth/session";
import { withTenantConnection } from "../../../../../lib/db";

export const runtime = "nodejs";

type IncidentRouteContext = {
	params: Promise<{ id: string }> | { id: string };
};

type HiraFollowupRow = {
	id: string;
	hiraFollowupNeeded: boolean;
	hiraFollowupText: string | null;
	updatedAt: Date;
};

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

	const followup = await loadHiraFollowup(session.tenantId, id);

	if (!followup) {
		return NextResponse.json({ code: "INCIDENT_NOT_FOUND" }, { status: 404 });
	}

	return NextResponse.json({ followup: serializeFollowup(followup) });
}

export async function PATCH(
	request: NextRequest,
	context: IncidentRouteContext,
): Promise<NextResponse> {
	return updateHiraFollowupRequest(request, context);
}

export async function POST(
	request: NextRequest,
	context: IncidentRouteContext,
): Promise<NextResponse> {
	return updateHiraFollowupRequest(request, context);
}

async function updateHiraFollowupRequest(
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

	const body = await readBody(request);
	const hiraFollowupNeeded = booleanValue(body.get("hiraFollowupNeeded"));
	const hiraFollowupText = hiraFollowupNeeded
		? nullableStringValue(body.get("hiraFollowupText"))
		: null;
	const followup = await updateHiraFollowup({
		hiraFollowupNeeded,
		hiraFollowupText,
		incidentId: id,
		tenantId: session.tenantId,
	});

	if (!followup) {
		return NextResponse.json({ code: "INCIDENT_NOT_FOUND" }, { status: 404 });
	}

	if (wantsHtmlRedirect(request)) {
		return NextResponse.redirect(new URL(`/incidents/${id}`, request.url), 303);
	}

	return NextResponse.json({ followup: serializeFollowup(followup) });
}

async function loadHiraFollowup(
	tenantId: string,
	incidentId: string,
): Promise<HiraFollowupRow | null> {
	const rows = await withTenantConnection(
		tenantId,
		async (tx) =>
			tx.$queryRaw<HiraFollowupRow[]>`
			SELECT
				id::text AS id,
				hira_followup_needed AS "hiraFollowupNeeded",
				hira_followup_text AS "hiraFollowupText",
				updated_at AS "updatedAt"
			FROM incident_case
			WHERE id = ${incidentId}::uuid
			LIMIT 1
		`,
	);

	return rows[0] ?? null;
}

async function updateHiraFollowup(input: {
	hiraFollowupNeeded: boolean;
	hiraFollowupText: string | null;
	incidentId: string;
	tenantId: string;
}): Promise<HiraFollowupRow | null> {
	const rows = await withTenantConnection(
		input.tenantId,
		async (tx) =>
			tx.$queryRaw<HiraFollowupRow[]>`
			UPDATE incident_case
			SET
				hira_followup_needed = ${input.hiraFollowupNeeded},
				hira_followup_text = ${input.hiraFollowupText},
				updated_at = CURRENT_TIMESTAMP
			WHERE id = ${input.incidentId}::uuid
			RETURNING
				id::text AS id,
				hira_followup_needed AS "hiraFollowupNeeded",
				hira_followup_text AS "hiraFollowupText",
				updated_at AS "updatedAt"
		`,
	);

	return rows[0] ?? null;
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "tenantId" | "userId"> | null> {
	return validateSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
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

function serializeFollowup(row: HiraFollowupRow) {
	return {
		...row,
		updatedAt: row.updatedAt.toISOString(),
	};
}

function booleanValue(value: unknown): boolean {
	return value === true || value === "true" || value === "on" || value === "1";
}

function nullableStringValue(value: unknown): string | null {
	const text = typeof value === "string" ? value.trim() : "";
	return text ? text : null;
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
