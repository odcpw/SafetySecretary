import { type NextRequest, NextResponse } from "next/server";
import { readSessionCookie } from "../../../../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../../../lib/auth/session";
import { prisma } from "../../../../../../lib/db";
import { DEFAULT_LOCALE, type Locale } from "../../../../../../lib/i18n/types";
import {
	createManualCauseNode,
	createFiveWhysTurn,
	FiveWhysDispatchError,
	FiveWhysProviderError,
	type IncidentCauseNode,
	IncidentCauseNotFoundError,
	InvalidCauseReferenceError,
	readFiveWhysMockProviderFromEnv,
	type FiveWhysTurnInput,
} from "../../../../../../lib/incident/five-whys";

export const runtime = "nodejs";

const coachUnavailableWarning = "CAUSE_COACH_UNAVAILABLE";

type CausesTurnRouteContext = {
	params: Promise<{ id: string }> | { id: string };
};

type ParsedBody = Map<string, unknown>;

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
	request: NextRequest,
	context: CausesTurnRouteContext,
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);
	const session = await resolveValidRequest(request, id);

	if (session instanceof NextResponse) {
		return session;
	}

	const parsed = parseTurnPayload(await readBody(request));

	if (!parsed.ok) {
		return invalidTurnResponse(request, id, parsed.code);
	}

	const locale = await loadUserLocale(session.userId);
	const mockProvider = readFiveWhysMockProviderFromEnv();
	const turn = await createCoachedOrManualTurn(
		{
			incidentId: id,
			locale,
			parentId: parsed.payload.parentId,
			tenantId: session.tenantId,
			timelineEventId: parsed.payload.timelineEventId,
			userAnswer: parsed.payload.userAnswer,
			userId: session.userId,
		},
		mockProvider ? { env: process.env, mockProvider } : {},
	);

	if (typeof turn === "string") {
		return invalidTurnResponse(request, id, turn);
	}

	if (!turn.node) {
		return NextResponse.json({ code: "INCIDENT_NOT_FOUND" }, { status: 404 });
	}

	if (wantsHtmlRedirect(request)) {
		return NextResponse.redirect(
			new URL(`/incidents/${id}/causes`, request.url),
			303,
		);
	}

	return NextResponse.json(
		{
			node: serializeCauseNode(turn.node),
			...(turn.warning ? { warning: turn.warning } : {}),
		},
		{ status: 201 },
	);
}

async function createCoachedOrManualTurn(
	input: FiveWhysTurnInput,
	dispatchOptions: Parameters<typeof createFiveWhysTurn>[1],
): Promise<
	| {
			node: IncidentCauseNode | null;
			warning?: typeof coachUnavailableWarning;
	  }
	| string
> {
	try {
		return {
			node: await createFiveWhysTurn(input, dispatchOptions),
		};
	} catch (error) {
		const knownError = turnError(error);

		if (knownError) {
			if (knownError === "CAUSE_LLM_FAILED") {
				return {
					node: await createManualCauseNode(input.tenantId, input.incidentId, {
						isRootCause: false,
						parentId: input.parentId,
						question: null,
						statement: input.userAnswer,
						timelineEventId: input.timelineEventId,
					}),
					warning: coachUnavailableWarning,
				};
			}

			return knownError;
		}

		throw error;
	}
}

function parseTurnPayload(body: ParsedBody):
	| {
			ok: true;
			payload: {
				parentId: string | null;
				timelineEventId: string | null;
				userAnswer: string;
			};
	  }
	| { ok: false; code: string } {
	const parentId = nullableUuidValue(body.get("parentId"));
	const timelineEventId = nullableUuidValue(body.get("timelineEventId"));
	const userAnswer = stringValue(body.get("answer"));

	if (parentId === undefined || timelineEventId === undefined || !userAnswer) {
		return { code: "INVALID_CAUSE_PAYLOAD", ok: false };
	}

	if (!parentId && !timelineEventId) {
		return { code: "INVALID_CAUSE_PARENT", ok: false };
	}

	return {
		ok: true,
		payload: {
			parentId,
			timelineEventId,
			userAnswer,
		},
	};
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

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "tenantId" | "userId"> | null> {
	return validateSession(readSessionCookie(request.cookies));
}

async function loadUserLocale(userId: string): Promise<Locale> {
	const user = await prisma.user.findUnique({
		select: { uiLocale: true },
		where: { id: userId },
	});

	return user?.uiLocale ?? DEFAULT_LOCALE;
}

async function readBody(request: NextRequest): Promise<ParsedBody> {
	const contentType = request.headers.get("content-type") ?? "";

	if (contentType.includes("application/json")) {
		const json = (await request.json().catch(() => null)) as Record<
			string,
			unknown
		> | null;
		return new Map(Object.entries(json ?? {}));
	}

	const formData = await request.formData().catch(() => null);
	const body = new Map<string, unknown>();

	for (const [key, value] of formData?.entries() ?? []) {
		body.set(key, value);
	}

	return body;
}

function turnError(error: unknown): string | null {
	if (error instanceof IncidentCauseNotFoundError) {
		return error.code;
	}

	if (error instanceof InvalidCauseReferenceError) {
		return error.code;
	}

	if (error instanceof FiveWhysDispatchError) {
		return "CAUSE_LLM_FAILED";
	}

	if (error instanceof FiveWhysProviderError) {
		return "CAUSE_LLM_FAILED";
	}

	return null;
}

function invalidTurnResponse(
	request: NextRequest,
	incidentId: string,
	code: string,
): NextResponse {
	if (wantsHtmlRedirect(request)) {
		const url = new URL(`/incidents/${incidentId}/causes`, request.url);
		url.searchParams.set("error", code);
		return NextResponse.redirect(url, 303);
	}

	const status = code === "CAUSE_LLM_FAILED" ? 502 : 400;
	return NextResponse.json({ code }, { status });
}

function serializeCauseNode(node: IncidentCauseNode) {
	return {
		...node,
		createdAt: node.createdAt.toISOString(),
		updatedAt: node.updatedAt.toISOString(),
	};
}

function nullableUuidValue(value: unknown): string | null | undefined {
	const text = stringValue(value);

	if (!text) {
		return null;
	}

	return isUuid(text) ? text : undefined;
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function wantsHtmlRedirect(request: NextRequest): boolean {
	const accept = request.headers.get("accept") ?? "";
	const contentType = request.headers.get("content-type") ?? "";

	if (accept.includes("application/json")) {
		return false;
	}

	return (
		accept.includes("text/html") ||
		contentType.includes("application/x-www-form-urlencoded")
	);
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}
