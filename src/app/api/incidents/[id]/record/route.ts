import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { buildIncidentInvestigationAgentContext } from "../../../../../lib/agent/incident-investigation/context";
import { INCIDENT_COACH_SKILL } from "../../../../../lib/agent/skills/incident-coach-v1";
import {
	AgentSurface,
	AgentWorkflowType,
} from "../../../../../lib/agent/types";
import { readSessionCookie } from "../../../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../../lib/auth/session";
import { KindEnum } from "../../../../../lib/llm";

export const runtime = "nodejs";

type RecordRouteContext = {
	params: Promise<{ id: string }> | { id: string };
};

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
	request: NextRequest,
	context: RecordRouteContext,
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);

	if (!isUuid(id)) {
		return NextResponse.json({ code: "INVALID_INCIDENT_ID" }, { status: 400 });
	}

	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	const bundle = await buildIncidentInvestigationAgentContext({
		metadata: {
			createdAt: new Date().toISOString(),
			kind: KindEnum.Authoring,
			locale: "en",
			requiresVision: false,
			runId: randomUUID(),
			skill: {
				id: INCIDENT_COACH_SKILL.id,
				section: "record-view",
				version: INCIDENT_COACH_SKILL.version,
			},
			surface: AgentSurface.Workbench,
			tenantId: session.tenantId,
			userId: session.userId,
			workflowId: id,
			workflowType: AgentWorkflowType.Ii,
		},
	});

	if (!bundle) {
		return NextResponse.json({ code: "INCIDENT_NOT_FOUND" }, { status: 404 });
	}

	return NextResponse.json({ record: bundle.workflowSnapshot.sections });
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "tenantId" | "userId"> | null> {
	return validateSession(readSessionCookie(request.cookies));
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}
