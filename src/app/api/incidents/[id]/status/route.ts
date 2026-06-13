import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../../../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../../lib/auth/session";
import { withTenantConnection } from "../../../../../lib/db";
import {
	applyWorkflowAction,
	type IncidentWorkflowStage,
	InvalidWorkflowTransitionError,
	isWorkflowStage,
	isWorkflowStageAction,
} from "../../../../../lib/incident/workflow-stage";

export const runtime = "nodejs";

type StatusRouteContext = {
	params: Promise<{ id: string }> | { id: string };
};

type WorkflowStageRow = {
	id: string;
	workflowStage: string;
	closedAt: Date | null;
	updatedAt: Date;
};

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
	request: NextRequest,
	context: StatusRouteContext,
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);

	if (!isUuid(id)) {
		return NextResponse.json({ code: "INVALID_INCIDENT_ID" }, { status: 400 });
	}

	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	const action = stringValue((await readBody(request)).get("action"));

	if (!action || !isWorkflowStageAction(action)) {
		return NextResponse.json(
			{ code: "INVALID_WORKFLOW_ACTION" },
			{ status: 400 },
		);
	}

	const current = await loadWorkflowStage(session.tenantId, id);

	if (!current) {
		return NextResponse.json({ code: "INCIDENT_NOT_FOUND" }, { status: 404 });
	}

	const fromStage: IncidentWorkflowStage = isWorkflowStage(
		current.workflowStage,
	)
		? current.workflowStage
		: "CAPTURE";

	let nextStage: IncidentWorkflowStage;

	try {
		nextStage = applyWorkflowAction(fromStage, action);
	} catch (caught) {
		if (caught instanceof InvalidWorkflowTransitionError) {
			return NextResponse.json(
				{ code: caught.code, from: caught.from },
				{ status: 409 },
			);
		}

		throw caught;
	}

	const updated = await updateWorkflowStage(session.tenantId, id, nextStage);

	if (!updated) {
		return NextResponse.json({ code: "INCIDENT_NOT_FOUND" }, { status: 404 });
	}

	if (wantsHtmlRedirect(request)) {
		return NextResponse.redirect(new URL(`/incidents/${id}`, request.url), 303);
	}

	return NextResponse.json({ incident: serializeWorkflowStage(updated) });
}

async function loadWorkflowStage(
	tenantId: string,
	incidentId: string,
): Promise<WorkflowStageRow | null> {
	const rows = await withTenantConnection(
		tenantId,
		async (tx) =>
			tx.$queryRaw<WorkflowStageRow[]>`
			SELECT
				id::text AS id,
				workflow_stage::text AS "workflowStage",
				closed_at AS "closedAt",
				updated_at AS "updatedAt"
			FROM incident_case
			WHERE id = ${incidentId}::uuid
			LIMIT 1
		`,
	);

	return rows[0] ?? null;
}

async function updateWorkflowStage(
	tenantId: string,
	incidentId: string,
	nextStage: IncidentWorkflowStage,
): Promise<WorkflowStageRow | null> {
	// Stamp closed_at when the case closes; clear it again on any reopen.
	const closedAt = nextStage === "CLOSED" ? new Date() : null;

	const rows = await withTenantConnection(
		tenantId,
		async (tx) =>
			tx.$queryRaw<WorkflowStageRow[]>`
			UPDATE incident_case
			SET
				workflow_stage = ${nextStage}::incident_workflow_stage,
				closed_at = ${closedAt}::timestamptz,
				updated_at = CURRENT_TIMESTAMP
			WHERE id = ${incidentId}::uuid
			RETURNING
				id::text AS id,
				workflow_stage::text AS "workflowStage",
				closed_at AS "closedAt",
				updated_at AS "updatedAt"
		`,
	);

	return rows[0] ?? null;
}

function serializeWorkflowStage(row: WorkflowStageRow) {
	return {
		...row,
		closedAt: row.closedAt?.toISOString() ?? null,
		updatedAt: row.updatedAt.toISOString(),
	};
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
		contentType.includes("form-urlencoded") ||
		contentType.includes("multipart/form-data")
	);
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}
