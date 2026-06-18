import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../../../../../../../lib/auth/cookies";
import { verifyCsrfToken } from "../../../../../../../lib/auth/csrf";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../../../../lib/auth/session";
import { updateCoachPhotoCaption } from "../../../../../../../lib/incident/coach-photos";

export const runtime = "nodejs";

type CoachPhotoRouteContext = {
	params:
		| Promise<{ id: string; photoId: string }>
		| { id: string; photoId: string };
};

type CoachPhotoPatchRequestBody = {
	caption?: unknown;
};

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
	request: NextRequest,
	context: CoachPhotoRouteContext,
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

	if (!verifyCsrfToken(request.headers.get("x-ssfw-csrf"), session.id)) {
		return NextResponse.json({ code: "CSRF_REQUIRED" }, { status: 403 });
	}

	const body = ((await request.json().catch(() => null)) ??
		{}) as CoachPhotoPatchRequestBody;
	const caption = body.caption ?? null;

	if (caption !== null && typeof caption !== "string") {
		return NextResponse.json({ code: "INVALID_CAPTION" }, { status: 400 });
	}

	const photo = await updateCoachPhotoCaption({
		caption,
		incidentId: id,
		photoId,
		tenantId: session.tenantId,
	});

	if (!photo) {
		return NextResponse.json({ code: "PHOTO_NOT_FOUND" }, { status: 404 });
	}

	return NextResponse.json({ photo });
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "id" | "tenantId" | "userId"> | null> {
	return validateSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}
