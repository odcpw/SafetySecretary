import { type NextRequest, NextResponse } from "next/server";
import { FINDINGS_WITHOUT_ACTION_SOURCE_QUEUE } from "../../../lib/actions/finding-queue";
import {
	ActionMutationValidationError,
	createActionFromFindingQueue,
	createActionItem,
	parseActionCreatePayload,
	parsePublicActionCreatePayload,
} from "../../../lib/actions/mutations";
import {
	listActionItems,
	serializeActionItemDetail,
	serializeActionItemListRow,
} from "../../../lib/actions/queries";
import { readSessionCookie } from "../../../lib/auth/cookies";
import { verifyCsrfRequest } from "../../../lib/auth/csrf";
import {
	type ValidatedSession,
	validateSession,
} from "../../../lib/auth/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	const actions = await listActionItems(session.tenantId, {
		assignee: request.nextUrl.searchParams.get("assignee"),
		department: request.nextUrl.searchParams.get("department"),
		due: request.nextUrl.searchParams.get("due"),
		originType: request.nextUrl.searchParams.get("origin"),
		status: request.nextUrl.searchParams.get("status"),
	});

	return NextResponse.json({
		actions: actions.map(serializeActionItemListRow),
	});
}

export async function POST(request: NextRequest): Promise<NextResponse> {
	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	if (!verifyCsrfRequest(request.headers, session.id)) {
		return NextResponse.json({ code: "CSRF_REQUIRED" }, { status: 403 });
	}

	const body = await readBody(request);
	const sourceQueue = stringBodyValue(body, "sourceQueue");
	const payload =
		sourceQueue === FINDINGS_WITHOUT_ACTION_SOURCE_QUEUE
			? parseActionCreatePayload(body)
			: parsePublicActionCreatePayload(body);

	if (
		!payload ||
		(sourceQueue === FINDINGS_WITHOUT_ACTION_SOURCE_QUEUE && !payload.originId)
	) {
		return NextResponse.json(
			{ code: "INVALID_ACTION_PAYLOAD" },
			{ status: 400 },
		);
	}

	const action = await (sourceQueue === FINDINGS_WITHOUT_ACTION_SOURCE_QUEUE
		? createActionFromFindingQueue({
				action: payload,
				actorUserId: session.userId,
				findingId: payload.originId ?? "",
				tenantId: session.tenantId,
			})
		: createActionItem({
				action: payload,
				actorUserId: session.userId,
				tenantId: session.tenantId,
			})
	).catch((error: unknown) => {
		if (error instanceof ActionMutationValidationError) {
			return "invalid-payload" as const;
		}
		throw error;
	});

	if (action === "invalid-payload") {
		return NextResponse.json(
			{ code: "INVALID_ACTION_PAYLOAD" },
			{ status: 400 },
		);
	}

	return NextResponse.json(
		{ action: serializeActionItemDetail(action) },
		{ status: 201 },
	);
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "id" | "tenantId" | "userId"> | null> {
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

function stringBodyValue(
	body: Map<string, unknown>,
	key: string,
): string | null {
	const value = body.get(key);
	const text = typeof value === "string" ? value.trim() : "";

	return text.length > 0 ? text : null;
}
