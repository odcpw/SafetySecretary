import { type NextRequest, NextResponse } from "next/server";
import { readSessionCookie } from "../../../../../lib/auth/cookies";
import { verifyCsrfRequest } from "../../../../../lib/auth/csrf";
import {
	LAST_MEMBER_MESSAGE,
	removeMember,
} from "../../../../../lib/auth/membership";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../../lib/auth/session";

export const runtime = "nodejs";

type MemberRouteContext = {
	params: Promise<{ memberId: string }> | { memberId: string };
};

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function DELETE(
	request: NextRequest,
	context: MemberRouteContext,
): Promise<NextResponse> {
	const { memberId } = await Promise.resolve(context.params);

	if (!isUuid(memberId)) {
		return NextResponse.json({ code: "INVALID_MEMBER_ID" }, { status: 400 });
	}

	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	if (!verifyCsrfRequest(request.headers, session.id)) {
		return NextResponse.json({ code: "CSRF_REQUIRED" }, { status: 403 });
	}

	const result = await removeMember(
		session.tenantId,
		memberId.toLowerCase(),
		session.userId,
	);

	if (result.status === "actor_not_member") {
		return NextResponse.json(
			{ code: "TENANT_MEMBERSHIP_REQUIRED" },
			{ status: 403 },
		);
	}

	if (result.status === "target_not_member") {
		return NextResponse.json({ code: "MEMBER_NOT_FOUND" }, { status: 404 });
	}

	if (result.status === "last_member") {
		return NextResponse.json(
			{
				code: "LAST_MEMBER",
				message: LAST_MEMBER_MESSAGE,
			},
			{ status: 409 },
		);
	}

	return NextResponse.json({
		deletedMemberships: result.deletedMemberships,
		deletedSessions: result.deletedSessions,
		status: result.status,
	});
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "id" | "tenantId" | "userId"> | null> {
	return validateSession(readSessionCookie(request.cookies));
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}
