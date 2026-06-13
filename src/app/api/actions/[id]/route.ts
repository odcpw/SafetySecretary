import { type NextRequest, NextResponse } from "next/server";
import {
	ActionMutationValidationError,
	parseActionUpdatePayload,
	softDeleteActionItem,
	updateActionItem,
} from "../../../../lib/actions/mutations";
import {
	getActionItemDetail,
	serializeActionItemDetail,
} from "../../../../lib/actions/queries";
import {
	CSRF_COOKIE_NAME,
	SESSION_COOKIE_NAME,
} from "../../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../lib/auth/session";

export const runtime = "nodejs";

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = {
	params: Promise<{ id: string }> | { id: string };
};

export async function GET(
	request: NextRequest,
	context: RouteContext,
): Promise<NextResponse> {
	const session = await resolveSession(request);
	const { id } = await Promise.resolve(context.params);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	if (!isUuid(id)) {
		return NextResponse.json({ code: "INVALID_ACTION_ID" }, { status: 400 });
	}

	const action = await getActionItemDetail(session.tenantId, id);

	if (!action) {
		return NextResponse.json({ code: "ACTION_NOT_FOUND" }, { status: 404 });
	}

	return NextResponse.json({ action: serializeActionItemDetail(action) });
}

export async function PATCH(
	request: NextRequest,
	context: RouteContext,
): Promise<NextResponse> {
	const session = await resolveSession(request);
	const { id } = await Promise.resolve(context.params);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	if (!hasValidCsrfToken(request)) {
		return NextResponse.json({ code: "CSRF_REQUIRED" }, { status: 403 });
	}

	if (!isUuid(id)) {
		return NextResponse.json({ code: "INVALID_ACTION_ID" }, { status: 400 });
	}

	const payload = parseActionUpdatePayload(await readBody(request));

	if (!payload) {
		return NextResponse.json(
			{ code: "INVALID_ACTION_PAYLOAD" },
			{ status: 400 },
		);
	}

	const action = await updateActionItem({
		action: payload,
		actionItemId: id,
		actorUserId: session.userId,
		tenantId: session.tenantId,
	}).catch((error: unknown) => {
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

	if (!action) {
		return NextResponse.json({ code: "ACTION_NOT_FOUND" }, { status: 404 });
	}

	return NextResponse.json({ action: serializeActionItemDetail(action) });
}

export async function DELETE(
	request: NextRequest,
	context: RouteContext,
): Promise<NextResponse> {
	const session = await resolveSession(request);
	const { id } = await Promise.resolve(context.params);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	if (!hasValidCsrfToken(request)) {
		return NextResponse.json({ code: "CSRF_REQUIRED" }, { status: 403 });
	}

	if (!isUuid(id)) {
		return NextResponse.json({ code: "INVALID_ACTION_ID" }, { status: 400 });
	}

	const action = await softDeleteActionItem({
		actionItemId: id,
		tenantId: session.tenantId,
	});

	if (!action) {
		return NextResponse.json({ code: "ACTION_NOT_FOUND" }, { status: 404 });
	}

	return NextResponse.json({ action: serializeActionItemDetail(action) });
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

function hasValidCsrfToken(request: NextRequest): boolean {
	const csrfCookie = request.cookies.get(CSRF_COOKIE_NAME)?.value;
	const csrfHeader = request.headers.get("x-ssfw-csrf");

	return Boolean(csrfCookie && csrfHeader && csrfCookie === csrfHeader);
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}
