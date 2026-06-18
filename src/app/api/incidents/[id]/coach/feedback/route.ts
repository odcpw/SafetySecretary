import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../../../../../../lib/auth/cookies";
import { verifyCsrfToken } from "../../../../../../lib/auth/csrf";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../../../lib/auth/session";
import {
	CoachFeedbackValidationError,
	type CoachFeedbackInput,
	getCoachFeedback,
	parseCoachFeedbackPayload,
	serializeCoachFeedback,
	upsertCoachFeedback,
} from "../../../../../../lib/incident/coach-feedback";

export const runtime = "nodejs";

type CoachFeedbackRouteContext = {
	params: Promise<{ id: string }> | { id: string };
};

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Comfortably above the 2000-char comment limit plus the small numeric/string
// fields, while keeping an oversized or chunked body from being fully buffered.
const maxBodyBytes = 8 * 1024;

class RequestBodyTooLargeError extends Error {}

export async function GET(
	request: NextRequest,
	context: CoachFeedbackRouteContext,
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);

	if (!isUuid(id)) {
		return NextResponse.json({ code: "INVALID_INCIDENT_ID" }, { status: 400 });
	}

	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	const result = await getCoachFeedback(session.tenantId, id, session.userId);

	if (!result.incidentExists) {
		return NextResponse.json({ code: "INCIDENT_NOT_FOUND" }, { status: 404 });
	}

	return NextResponse.json({
		feedback: result.feedback ? serializeCoachFeedback(result.feedback) : null,
	});
}

export async function POST(
	request: NextRequest,
	context: CoachFeedbackRouteContext,
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);

	if (!isUuid(id)) {
		return NextResponse.json({ code: "INVALID_INCIDENT_ID" }, { status: 400 });
	}

	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	if (!verifyCsrfToken(request.headers.get("x-ssfw-csrf"), session.id)) {
		return NextResponse.json({ code: "CSRF_REQUIRED" }, { status: 403 });
	}

	let payload: CoachFeedbackInput;

	try {
		payload = parseCoachFeedbackPayload(await readBody(request));
	} catch (error) {
		if (error instanceof RequestBodyTooLargeError) {
			return NextResponse.json(
				{ code: "FEEDBACK_PAYLOAD_TOO_LARGE" },
				{ status: 413 },
			);
		}

		if (error instanceof CoachFeedbackValidationError) {
			return NextResponse.json(
				{ code: "INVALID_FEEDBACK_PAYLOAD", reason: error.code },
				{ status: 400 },
			);
		}

		throw error;
	}

	const feedback = await upsertCoachFeedback({
		feedback: payload,
		incidentId: id,
		tenantId: session.tenantId,
		userId: session.userId,
	});

	if (!feedback) {
		return NextResponse.json({ code: "INCIDENT_NOT_FOUND" }, { status: 404 });
	}

	return NextResponse.json({ feedback: serializeCoachFeedback(feedback) });
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "id" | "tenantId" | "userId"> | null> {
	return validateSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
}

async function readBody(request: NextRequest): Promise<Map<string, unknown>> {
	const declaredLength = Number(request.headers.get("content-length"));

	if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
		throw new RequestBodyTooLargeError();
	}

	const contentType = request.headers.get("content-type") ?? "";

	if (contentType.includes("application/json")) {
		const text = await readBoundedText(request);
		let body: Record<string, unknown> | null;

		try {
			body = text ? (JSON.parse(text) as Record<string, unknown>) : null;
		} catch {
			body = null;
		}

		return new Map(Object.entries(body ?? {}));
	}

	const formData = await request.formData().catch(() => null);
	return new Map(formData?.entries() ?? []);
}

async function readBoundedText(request: NextRequest): Promise<string> {
	const reader = request.body?.getReader();

	if (!reader) {
		return "";
	}

	const decoder = new TextDecoder();
	let text = "";

	while (true) {
		const { done, value } = await reader.read();

		if (done) {
			break;
		}

		text += decoder.decode(value, { stream: true });

		if (text.length > maxBodyBytes) {
			await reader.cancel();
			throw new RequestBodyTooLargeError();
		}
	}

	return text + decoder.decode();
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}
