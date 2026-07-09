import { type NextRequest, NextResponse } from "next/server";
import { readSessionCookie } from "../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../lib/auth/session";
import { listProcessMaps, type ProcessMap } from "../../../lib/process-map";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	const maps = await listProcessMaps(session.tenantId);
	return NextResponse.json({ maps: maps.map(serializeProcessMap) });
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "tenantId" | "userId"> | null> {
	return validateSession(readSessionCookie(request.cookies));
}

function serializeProcessMap(map: ProcessMap) {
	return {
		...map,
		createdAt: map.createdAt.toISOString(),
		deletedAt: map.deletedAt?.toISOString() ?? null,
		updatedAt: map.updatedAt.toISOString(),
	};
}
