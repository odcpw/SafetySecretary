import { type NextRequest, NextResponse } from "next/server";
import { readSessionCookie } from "../../../../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../../../lib/auth/session";
import {
	CoachDispatchError,
	CoachIncidentNotFoundError,
	CoachProviderError,
	listCoachMessages,
	runCoachChatTurn,
} from "../../../../../../lib/incident/coach-chat";

export const runtime = "nodejs";

type CoachChatRouteContext = {
	params: Promise<{ id: string }> | { id: string };
};

type CoachChatRequestBody = {
	message?: unknown;
	locale?: unknown;
};

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
	request: NextRequest,
	context: CoachChatRouteContext,
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);

	if (!isUuid(id)) {
		return NextResponse.json({ code: "INVALID_INCIDENT_ID" }, { status: 400 });
	}

	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	const messages = await listCoachMessages(session.tenantId, id);

	if (!messages) {
		return NextResponse.json({ code: "INCIDENT_NOT_FOUND" }, { status: 404 });
	}

	return NextResponse.json({ messages });
}

export async function POST(
	request: NextRequest,
	context: CoachChatRouteContext,
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);

	if (!isUuid(id)) {
		return NextResponse.json({ code: "INVALID_INCIDENT_ID" }, { status: 400 });
	}

	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	const body = ((await request.json().catch(() => ({}))) ??
		{}) as CoachChatRequestBody;
	const message = stringValue(body.message);

	if (!message) {
		return NextResponse.json({ code: "MESSAGE_REQUIRED" }, { status: 400 });
	}

	try {
		const result = await runCoachChatTurn({
			incidentId: id,
			locale: stringValue(body.locale) || "en",
			message,
			tenantId: session.tenantId,
			userId: session.userId,
		});

		if (!result) {
			return NextResponse.json({ code: "INCIDENT_NOT_FOUND" }, { status: 404 });
		}

		return NextResponse.json(result);
	} catch (error) {
		if (error instanceof CoachDispatchError) {
			return NextResponse.json(
				{ code: error.result.code.toUpperCase() },
				{ status: 503 },
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
): Promise<Pick<ValidatedSession, "tenantId" | "userId"> | null> {
	return validateSession(readSessionCookie(request.cookies));
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}
