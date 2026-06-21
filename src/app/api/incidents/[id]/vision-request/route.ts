import { type NextRequest, NextResponse } from "next/server";
import { readSessionCookie } from "../../../../../lib/auth/cookies";
import { verifyCsrfRequest } from "../../../../../lib/auth/csrf";
import {
	readNamedHeader,
	VISION_MODAL_GRANTED_HEADER_NAMES,
} from "../../../../../lib/auth/headers";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../../lib/auth/session";
import { prisma, withTenantConnection } from "../../../../../lib/db";
import { LLMProviderErrorCode } from "../../../../../lib/llm/errors";

export const runtime = "nodejs";

type IncidentVisionRequestRouteContext = {
	params: Promise<{ id: string }> | { id: string };
};

type IncidentVisionConsentRow = {
	id: string;
	visionConsent: "ASK" | "ALWAYS" | "NEVER";
};

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
	request: NextRequest,
	context: IncidentVisionRequestRouteContext,
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

	const companyVision = await readCompanyVisionState(
		session.tenantId,
		session.userId,
	);

	if (companyVision === null) {
		return NextResponse.json(
			{ code: "TENANT_MEMBERSHIP_REQUIRED" },
			{ status: 403 },
		);
	}

	if (!companyVision) {
		return NextResponse.json(
			{ code: LLMProviderErrorCode.VisionUnavailableCompany },
			{ status: 409 },
		);
	}

	const incident = await readIncidentVisionConsent(session.tenantId, id);

	if (!incident) {
		return NextResponse.json({ code: "INCIDENT_NOT_FOUND" }, { status: 404 });
	}

	if (incident.visionConsent === "NEVER") {
		return NextResponse.json(
			{ code: LLMProviderErrorCode.VisionUnavailableWorkflow },
			{ status: 409 },
		);
	}

	if (
		incident.visionConsent === "ASK" &&
		readNamedHeader(request.headers, VISION_MODAL_GRANTED_HEADER_NAMES) !==
			"true"
	) {
		return NextResponse.json(
			{ code: "VISION_CONSENT_REQUIRED" },
			{ status: 409 },
		);
	}

	return NextResponse.json(
		{
			id: incident.id,
			requested: true,
			visionConsent: incident.visionConsent,
		},
		{ status: 202 },
	);
}

async function readCompanyVisionState(
	tenantId: string,
	userId: string,
): Promise<boolean | null> {
	const tenant = await prisma.tenant.findFirst({
		select: { visionEnabled: true },
		where: {
			id: tenantId,
			memberships: {
				some: { userId },
			},
		},
	});

	return tenant?.visionEnabled ?? null;
}

async function readIncidentVisionConsent(
	tenantId: string,
	incidentId: string,
): Promise<IncidentVisionConsentRow | null> {
	const rows = await withTenantConnection(
		tenantId,
		async (tx) =>
			tx.$queryRaw<IncidentVisionConsentRow[]>`
				SELECT
					id::text AS id,
					vision_consent::text AS "visionConsent"
				FROM incident_case
				WHERE id = ${incidentId}::uuid
				LIMIT 1
			`,
	);

	return rows[0] ?? null;
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "id" | "tenantId" | "userId"> | null> {
	return validateSession(readSessionCookie(request.cookies));
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}
