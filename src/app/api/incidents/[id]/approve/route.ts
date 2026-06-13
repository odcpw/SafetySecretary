import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../../../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../../lib/auth/session";
import {
	UnsupportedSnapshotWorkflowError,
	WorkflowNotFoundError,
} from "../../../../../lib/incident/serialise";
import { approve } from "../../../../../lib/snapshots/approve";
import type { ApprovalSnapshot } from "../../../../../lib/snapshots/types";

export const runtime = "nodejs";

type ApproveRouteContext = {
	params: Promise<{ id: string }> | { id: string };
};

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
	request: NextRequest,
	context: ApproveRouteContext,
): Promise<NextResponse> {
	const { id: caseId } = await Promise.resolve(context.params);

	if (!isUuid(caseId)) {
		return NextResponse.json(
			{ message: "Incident case id must be a UUID." },
			{ status: 400 },
		);
	}

	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json(
			{ message: "Authentication required." },
			{ status: 401 },
		);
	}

	try {
		const snapshot = await approve(caseId, "II", session.userId, {
			tenantId: session.tenantId,
		});

		return NextResponse.json(
			{
				snapshot: serializeApprovalSnapshot(snapshot),
			},
			{ status: 201 },
		);
	} catch (error) {
		if (error instanceof WorkflowNotFoundError) {
			return NextResponse.json(
				{ message: "Incident case was not found." },
				{ status: 404 },
			);
		}

		if (error instanceof UnsupportedSnapshotWorkflowError) {
			return NextResponse.json(
				{ message: error.message, code: error.code },
				{ status: 400 },
			);
		}

		return NextResponse.json(
			{ message: "Incident approval snapshot could not be created." },
			{ status: 500 },
		);
	}
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "userId" | "tenantId"> | null> {
	return validateSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
}

function serializeApprovalSnapshot(snapshot: ApprovalSnapshot) {
	return {
		id: snapshot.id,
		workflowType: snapshot.workflowType,
		hiraCaseId: snapshot.hiraCaseId,
		jhaCaseId: snapshot.jhaCaseId,
		iiCaseId: snapshot.iiCaseId,
		versionLabel: snapshot.versionLabel,
		approvedBy: snapshot.approvedBy,
		approvedAt: snapshot.approvedAt.toISOString(),
		schemaVersion: snapshot.schemaVersion,
		workflowData: snapshot.workflowData,
		artifactRefs: snapshot.artifactRefs,
		attachmentRefs: snapshot.attachmentRefs,
	};
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}
