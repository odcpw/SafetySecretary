import { type NextRequest, NextResponse } from "next/server";
import { readSessionCookie } from "../../../../../../../../lib/auth/cookies";
import { verifyCsrfRequest } from "../../../../../../../../lib/auth/csrf";
import {
	readNamedHeader,
	VISION_MODAL_GRANTED_HEADER_NAMES,
} from "../../../../../../../../lib/auth/headers";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../../../../../lib/auth/session";
import {
	CoachDispatchError,
	CoachIncidentNotFoundError,
	CoachProviderError,
} from "../../../../../../../../lib/incident/coach-chat";
import { analyseCoachPhoto } from "../../../../../../../../lib/incident/coach-photos";
import { DispatchErrorCode } from "../../../../../../../../lib/llm/dispatch";

export const runtime = "nodejs";

type CoachPhotoAnalyseRouteContext = {
	params:
		| Promise<{ id: string; photoId: string }>
		| { id: string; photoId: string };
};

type CoachPhotoAnalyseRequestBody = {
	locale?: unknown;
};

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
	request: NextRequest,
	context: CoachPhotoAnalyseRouteContext,
): Promise<NextResponse> {
	const { id, photoId } = await Promise.resolve(context.params);

	if (!isUuid(id)) {
		return NextResponse.json({ code: "INVALID_INCIDENT_ID" }, { status: 400 });
	}

	if (!isUuid(photoId)) {
		return NextResponse.json({ code: "INVALID_PHOTO_ID" }, { status: 400 });
	}

	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	if (!verifyCsrfRequest(request.headers, session.id)) {
		return NextResponse.json({ code: "CSRF_REQUIRED" }, { status: 403 });
	}

	const body = ((await request.json().catch(() => ({}))) ??
		{}) as CoachPhotoAnalyseRequestBody;

	try {
		const analysis = await analyseCoachPhoto({
			incidentId: id,
			justGrantedVisionConsent:
				readNamedHeader(request.headers, VISION_MODAL_GRANTED_HEADER_NAMES) ===
				"true",
			locale: stringValue(body.locale) || "en",
			photoId,
			tenantId: session.tenantId,
			userId: session.userId,
		});

		if (!analysis) {
			return NextResponse.json({ code: "PHOTO_NOT_FOUND" }, { status: 404 });
		}

		return NextResponse.json({
			message: analysis.message,
			suggestedCaption: analysis.suggestedCaption,
		});
	} catch (error) {
		if (error instanceof CoachDispatchError) {
			if (error.result.code === DispatchErrorCode.VisionConsentRequired) {
				return NextResponse.json(
					{ code: "VISION_CONSENT_REQUIRED" },
					{ status: 409 },
				);
			}

			if (error.result.code === "monthly_cap_exceeded") {
				return NextResponse.json(
					{ code: "MONTHLY_CAP_EXCEEDED" },
					{ status: 503 },
				);
			}

			return NextResponse.json(
				{ code: error.result.code.toUpperCase() },
				{ status: 409 },
			);
		}

		if (error instanceof CoachProviderError) {
			return NextResponse.json({ code: "PROVIDER_FAILED" }, { status: 502 });
		}

		if (error instanceof CoachIncidentNotFoundError) {
			return NextResponse.json({ code: "INCIDENT_NOT_FOUND" }, { status: 404 });
		}

		throw error;
	}
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "id" | "tenantId" | "userId"> | null> {
	return validateSession(readSessionCookie(request.cookies));
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}
