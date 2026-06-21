import { type NextRequest, NextResponse } from "next/server";
import { readSessionCookie } from "../../../../../lib/auth/cookies";
import { verifyCsrfRequest } from "../../../../../lib/auth/csrf";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../../lib/auth/session";
import { prisma, withTenantConnection } from "../../../../../lib/db";
import { isWorkflowVisionConsent } from "../../../../../lib/llm/consent";
import { LLMProviderErrorCode } from "../../../../../lib/llm/errors";

export const runtime = "nodejs";

type IncidentVisionConsentRouteContext = {
	params: Promise<{ id: string }> | { id: string };
};

type IncidentVisionConsentRow = {
	id: string;
	visionConsent: "ASK" | "ALWAYS" | "NEVER";
};

type IncidentVisionConsentPayload =
	| { ok: true; visionConsent: IncidentVisionConsentRow["visionConsent"] }
	| { code: "INVALID_VISION_CONSENT"; ok: false };

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
	request: NextRequest,
	context: IncidentVisionConsentRouteContext,
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

	const payload = await readVisionConsentPayload(request);

	if (!payload.ok) {
		return NextResponse.json({ code: payload.code }, { status: 400 });
	}

	const incident = await writeIncidentVisionConsent(
		session.tenantId,
		id,
		payload.visionConsent,
	);

	if (!incident) {
		return NextResponse.json({ code: "INCIDENT_NOT_FOUND" }, { status: 404 });
	}

	const body: Record<string, unknown> = {
		id: incident.id,
		visionConsent: incident.visionConsent,
	};

	if (incident.visionConsent === "NEVER") {
		body.code = LLMProviderErrorCode.VisionUnavailableWorkflow;
	}

	return NextResponse.json(body);
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

async function writeIncidentVisionConsent(
	tenantId: string,
	incidentId: string,
	visionConsent: IncidentVisionConsentRow["visionConsent"],
): Promise<IncidentVisionConsentRow | null> {
	const rows = await withTenantConnection(
		tenantId,
		async (tx) =>
			tx.$queryRaw<IncidentVisionConsentRow[]>`
				UPDATE incident_case
				SET
					vision_consent = ${visionConsent}::incident_vision_consent,
					updated_at = CURRENT_TIMESTAMP
				WHERE id = ${incidentId}::uuid
				RETURNING
					id::text AS id,
					vision_consent::text AS "visionConsent"
			`,
	);

	return rows[0] ?? null;
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "id" | "tenantId" | "userId"> | null> {
	return validateSession(readSessionCookie(request.cookies));
}

async function readVisionConsentPayload(
	request: NextRequest,
): Promise<IncidentVisionConsentPayload> {
	const contentType = request.headers.get("content-type") ?? "";
	const body = contentType.includes("application/json")
		? ((await request.json().catch(() => null)) as Record<
				string,
				unknown
			> | null)
		: Object.fromEntries((await request.formData().catch(() => null)) ?? []);
	const visionConsent = body?.visionConsent ?? body?.consent;

	if (!isWorkflowVisionConsent(visionConsent)) {
		return { code: "INVALID_VISION_CONSENT", ok: false };
	}

	return {
		ok: true,
		visionConsent,
	};
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}
