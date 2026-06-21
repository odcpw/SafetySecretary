import { type NextRequest, NextResponse } from "next/server";
import { readSessionCookie } from "../../../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../../lib/auth/session";
import { withTenantConnection } from "../../../../../lib/db";
import type { Locale } from "../../../../../lib/i18n/types";
import { parseIncidentContentLanguage } from "../../../../../lib/incident/locale";

export const runtime = "nodejs";

type IncidentRouteContext = {
	params: Promise<{ id: string }> | { id: string };
};

type IncidentLanguageRow = {
	id: string;
	contentLanguage: Locale;
	updatedAt: Date;
};

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
	request: NextRequest,
	context: IncidentRouteContext,
): Promise<NextResponse> {
	return updateContentLanguageRequest(request, context);
}

export async function POST(
	request: NextRequest,
	context: IncidentRouteContext,
): Promise<NextResponse> {
	return updateContentLanguageRequest(request, context);
}

async function updateContentLanguageRequest(
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

	const contentLanguage = parseIncidentContentLanguage(
		(await readBody(request)).get("contentLanguage"),
	);

	if (!contentLanguage) {
		return NextResponse.json(
			{ code: "INVALID_CONTENT_LANGUAGE" },
			{ status: 400 },
		);
	}

	const incident = await updateContentLanguage({
		contentLanguage,
		incidentId: id,
		tenantId: session.tenantId,
	});

	if (!incident) {
		return NextResponse.json({ code: "INCIDENT_NOT_FOUND" }, { status: 404 });
	}

	return NextResponse.json({
		incident: {
			...incident,
			updatedAt: incident.updatedAt.toISOString(),
		},
	});
}

async function updateContentLanguage(input: {
	contentLanguage: Locale;
	incidentId: string;
	tenantId: string;
}): Promise<IncidentLanguageRow | null> {
	const rows = await withTenantConnection(
		input.tenantId,
		async (tx) =>
			tx.$queryRaw<IncidentLanguageRow[]>`
			UPDATE incident_case
			SET
				content_language = ${input.contentLanguage}::shared.language_code,
				updated_at = CURRENT_TIMESTAMP
			WHERE id = ${input.incidentId}::uuid
			RETURNING
				id::text AS id,
				content_language::text AS "contentLanguage",
				updated_at AS "updatedAt"
		`,
	);

	return rows[0] ?? null;
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "tenantId" | "userId"> | null> {
	return validateSession(readSessionCookie(request.cookies));
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

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}
