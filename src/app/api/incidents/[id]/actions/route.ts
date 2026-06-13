import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../../../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../../lib/auth/session";
import { withTenantConnection } from "../../../../../lib/db";
import {
	deleteIncidentActionBridge,
	linkUnlinkedIncidentActionsForCase,
	syncIncidentActionBridge,
} from "../../../../../lib/incident/action-bridge";

export const runtime = "nodejs";

type ActionsRouteContext = {
	params: Promise<{ id: string }> | { id: string };
};

type ParsedBody = Map<string, unknown>;

type IncidentActionType =
	| "SUBSTITUTION"
	| "TECHNICAL"
	| "ORGANIZATIONAL"
	| "PPE";
type IncidentActionStatus = "OPEN" | "IN_PROGRESS" | "COMPLETE";

type IncidentCauseActionRow = {
	id: string;
	causeNodeId: string;
	causeStatement: string;
	actionItemId: string | null;
	orderIndex: number;
	description: string;
	ownerRole: string | null;
	dueDate: Date | string | null;
	actionType: IncidentActionType;
	status: IncidentActionStatus;
	createdAt: Date;
	updatedAt: Date;
};

const actionTypes = new Set<IncidentActionType>([
	"SUBSTITUTION",
	"TECHNICAL",
	"ORGANIZATIONAL",
	"PPE",
]);
const actionStatuses = new Set<IncidentActionStatus>([
	"OPEN",
	"IN_PROGRESS",
	"COMPLETE",
]);
const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(
	request: NextRequest,
	context: ActionsRouteContext,
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);
	const session = await resolveValidRequest(request, id);

	if (session instanceof NextResponse) {
		return session;
	}

	const actions = await loadIncidentCauseActions(session.tenantId, id);

	if (actions === null) {
		return NextResponse.json({ code: "INCIDENT_NOT_FOUND" }, { status: 404 });
	}

	return NextResponse.json({ actions: actions.map(serializeAction) });
}

export async function POST(
	request: NextRequest,
	context: ActionsRouteContext,
): Promise<NextResponse> {
	const body = await readBody(request);
	const action = stringValue(body.get("_action"));

	if (action === "delete") {
		return deleteActionRequest(request, context, body);
	}

	if (action === "update") {
		return updateActionRequest(request, context, body);
	}

	return createActionRequest(request, context, body);
}

export async function PATCH(
	request: NextRequest,
	context: ActionsRouteContext,
): Promise<NextResponse> {
	return updateActionRequest(request, context, await readBody(request));
}

export async function DELETE(
	request: NextRequest,
	context: ActionsRouteContext,
): Promise<NextResponse> {
	return deleteActionRequest(request, context, await readBody(request));
}

async function createActionRequest(
	request: NextRequest,
	context: ActionsRouteContext,
	body: ParsedBody,
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);
	const session = await resolveValidRequest(request, id);

	if (session instanceof NextResponse) {
		return session;
	}

	const parsed = parseCreatePayload(body);

	if (!parsed.ok) {
		return invalidActionResponse(request, id, parsed.code);
	}

	const action = await createIncidentCauseAction(
		session.tenantId,
		id,
		parsed.payload,
	);

	if (!action) {
		return NextResponse.json({ code: "CAUSE_NODE_NOT_FOUND" }, { status: 404 });
	}

	if (wantsHtmlRedirect(request)) {
		return NextResponse.redirect(
			new URL(`/incidents/${id}/actions`, request.url),
			303,
		);
	}

	return NextResponse.json(
		{ action: serializeAction(action) },
		{ status: 201 },
	);
}

async function updateActionRequest(
	request: NextRequest,
	context: ActionsRouteContext,
	body: ParsedBody,
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);
	const session = await resolveValidRequest(request, id);

	if (session instanceof NextResponse) {
		return session;
	}

	const parsed = parseUpdatePayload(body);

	if (!parsed.ok) {
		return invalidActionResponse(request, id, parsed.code);
	}

	const action = await updateIncidentCauseAction(
		session.tenantId,
		id,
		parsed.payload,
	);

	if (!action) {
		return NextResponse.json(
			{ code: "INCIDENT_ACTION_NOT_FOUND" },
			{ status: 404 },
		);
	}

	if (wantsHtmlRedirect(request)) {
		return NextResponse.redirect(
			new URL(`/incidents/${id}/actions`, request.url),
			303,
		);
	}

	return NextResponse.json({ action: serializeAction(action) });
}

async function deleteActionRequest(
	request: NextRequest,
	context: ActionsRouteContext,
	body: ParsedBody,
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);
	const session = await resolveValidRequest(request, id);

	if (session instanceof NextResponse) {
		return session;
	}

	const actionId = stringValue(body.get("actionId"));

	if (!isUuid(actionId)) {
		return invalidActionResponse(request, id, "INVALID_ACTION_ID");
	}

	const deleted = await deleteIncidentCauseAction(
		session.tenantId,
		id,
		actionId,
	);

	if (!deleted) {
		return NextResponse.json(
			{ code: "INCIDENT_ACTION_NOT_FOUND" },
			{ status: 404 },
		);
	}

	if (wantsHtmlRedirect(request)) {
		return NextResponse.redirect(
			new URL(`/incidents/${id}/actions`, request.url),
			303,
		);
	}

	return NextResponse.json({ ok: true });
}

async function loadIncidentCauseActions(
	tenantId: string,
	incidentId: string,
): Promise<IncidentCauseActionRow[] | null> {
	return withTenantConnection(tenantId, async (tx) => {
		const incidentRows = await tx.$queryRaw<Array<{ id: string }>>`
			SELECT id::text AS id
			FROM incident_case
			WHERE id = ${incidentId}::uuid
			LIMIT 1
		`;

		if (incidentRows.length === 0) {
			return null;
		}

		await linkUnlinkedIncidentActionsForCase(tx, {
			incidentId,
			tenantId,
		});

		return tx.$queryRaw<IncidentCauseActionRow[]>`
			SELECT
				action.id::text AS id,
				action.cause_node_id::text AS "causeNodeId",
				node.statement AS "causeStatement",
				action.action_item_id::text AS "actionItemId",
				action.order_index AS "orderIndex",
				action.description,
				action.owner_role AS "ownerRole",
				action.due_date AS "dueDate",
				action.action_type::text AS "actionType",
				action.status::text AS status,
				action.created_at AS "createdAt",
				action.updated_at AS "updatedAt"
			FROM incident_cause_action action
			JOIN incident_cause_node node ON node.id = action.cause_node_id
			WHERE node.case_id = ${incidentId}::uuid
			ORDER BY node.order_index ASC, node.created_at ASC, action.order_index ASC, action.created_at ASC, action.id ASC
		`;
	});
}

async function createIncidentCauseAction(
	tenantId: string,
	incidentId: string,
	payload: {
		actionType: IncidentActionType;
		causeNodeId: string;
		description: string;
		dueDate: string | null;
		ownerRole: string | null;
		status: IncidentActionStatus;
	},
): Promise<IncidentCauseActionRow | null> {
	return withTenantConnection(tenantId, async (tx) => {
		const causeRows = await tx.$queryRaw<Array<{ orderIndex: number }>>`
			SELECT COALESCE(MAX(action.order_index) + 1, 0) AS "orderIndex"
			FROM incident_cause_node node
			LEFT JOIN incident_cause_action action ON action.cause_node_id = node.id
			WHERE node.id = ${payload.causeNodeId}::uuid
				AND node.case_id = ${incidentId}::uuid
		`;

		if (causeRows.length === 0) {
			return null;
		}

		const inserted = await tx.$queryRaw<IncidentCauseActionRow[]>`
			INSERT INTO incident_cause_action (
				id,
				cause_node_id,
				order_index,
				description,
				owner_role,
				due_date,
				action_type,
				status
			)
			SELECT
				${randomUUID()}::uuid,
				node.id,
				${causeRows[0]?.orderIndex ?? 0},
				${payload.description},
				${payload.ownerRole},
				${payload.dueDate}::date,
				${payload.actionType}::incident_action_type,
				${payload.status}::incident_action_status
			FROM incident_cause_node node
			WHERE node.id = ${payload.causeNodeId}::uuid
				AND node.case_id = ${incidentId}::uuid
			RETURNING
				id::text AS id,
				cause_node_id::text AS "causeNodeId",
				(SELECT statement FROM incident_cause_node WHERE id = cause_node_id) AS "causeStatement",
				action_item_id::text AS "actionItemId",
				order_index AS "orderIndex",
				description,
				owner_role AS "ownerRole",
				due_date AS "dueDate",
				action_type::text AS "actionType",
				status::text AS status,
				created_at AS "createdAt",
				updated_at AS "updatedAt"
		`;

		const action = inserted[0] ?? null;
		if (!action) {
			return null;
		}

		const actionItemId = await syncIncidentActionBridge(tx, {
			actionId: action.id,
			incidentId,
			tenantId,
		});

		return {
			...action,
			actionItemId,
		};
	});
}

async function updateIncidentCauseAction(
	tenantId: string,
	incidentId: string,
	payload: {
		actionId: string;
		actionType: IncidentActionType;
		description: string;
		dueDate: string | null;
		ownerRole: string | null;
		status: IncidentActionStatus;
	},
): Promise<IncidentCauseActionRow | null> {
	return withTenantConnection(tenantId, async (tx) => {
		const rows = await tx.$queryRaw<IncidentCauseActionRow[]>`
			UPDATE incident_cause_action AS action
			SET
				description = ${payload.description},
				owner_role = ${payload.ownerRole},
				due_date = ${payload.dueDate}::date,
				action_type = ${payload.actionType}::incident_action_type,
				status = ${payload.status}::incident_action_status,
				updated_at = CURRENT_TIMESTAMP
			FROM incident_cause_node AS node
			WHERE action.id = ${payload.actionId}::uuid
				AND action.cause_node_id = node.id
				AND node.case_id = ${incidentId}::uuid
			RETURNING
				action.id::text AS id,
				action.cause_node_id::text AS "causeNodeId",
				node.statement AS "causeStatement",
				action.action_item_id::text AS "actionItemId",
				action.order_index AS "orderIndex",
				action.description,
				action.owner_role AS "ownerRole",
				action.due_date AS "dueDate",
				action.action_type::text AS "actionType",
				action.status::text AS status,
				action.created_at AS "createdAt",
				action.updated_at AS "updatedAt"
		`;

		const action = rows[0] ?? null;
		if (!action) {
			return null;
		}

		const actionItemId = await syncIncidentActionBridge(tx, {
			actionId: action.id,
			incidentId,
			tenantId,
		});

		return {
			...action,
			actionItemId,
		};
	});
}

async function deleteIncidentCauseAction(
	tenantId: string,
	incidentId: string,
	actionId: string,
): Promise<boolean> {
	return withTenantConnection(tenantId, async (tx) => {
		return deleteIncidentActionBridge(tx, {
			actionId,
			incidentId,
			tenantId,
		});
	});
}

function parseCreatePayload(body: ParsedBody):
	| {
			ok: true;
			payload: {
				actionType: IncidentActionType;
				causeNodeId: string;
				description: string;
				dueDate: string | null;
				ownerRole: string | null;
				status: IncidentActionStatus;
			};
	  }
	| { ok: false; code: string } {
	const causeNodeId = stringValue(body.get("causeNodeId"));
	const description = stringValue(body.get("description"));
	const actionType = actionTypeValue(body.get("actionType"));
	const dueDate = dueDateValue(body.get("dueDate"));
	const status = statusValue(body.get("status")) ?? "OPEN";

	if (!isUuid(causeNodeId)) {
		return { code: "INVALID_CAUSE_NODE_ID", ok: false };
	}

	if (!description) {
		return { code: "INVALID_ACTION_PAYLOAD", ok: false };
	}

	if (!actionType) {
		return { code: "INVALID_ACTION_TYPE", ok: false };
	}

	if (dueDate === undefined) {
		return { code: "INVALID_DUE_DATE", ok: false };
	}

	return {
		ok: true,
		payload: {
			actionType,
			causeNodeId,
			description,
			dueDate,
			ownerRole: nullableStringValue(body.get("ownerRole")),
			status,
		},
	};
}

function parseUpdatePayload(body: ParsedBody):
	| {
			ok: true;
			payload: {
				actionId: string;
				actionType: IncidentActionType;
				description: string;
				dueDate: string | null;
				ownerRole: string | null;
				status: IncidentActionStatus;
			};
	  }
	| { ok: false; code: string } {
	const actionId = stringValue(body.get("actionId"));
	const description = stringValue(body.get("description"));
	const actionType = actionTypeValue(body.get("actionType"));
	const dueDate = dueDateValue(body.get("dueDate"));
	const status = statusValue(body.get("status"));

	if (!isUuid(actionId)) {
		return { code: "INVALID_ACTION_ID", ok: false };
	}

	if (!description) {
		return { code: "INVALID_ACTION_PAYLOAD", ok: false };
	}

	if (!actionType) {
		return { code: "INVALID_ACTION_TYPE", ok: false };
	}

	if (!status) {
		return { code: "INVALID_ACTION_STATUS", ok: false };
	}

	if (dueDate === undefined) {
		return { code: "INVALID_DUE_DATE", ok: false };
	}

	return {
		ok: true,
		payload: {
			actionId,
			actionType,
			description,
			dueDate,
			ownerRole: nullableStringValue(body.get("ownerRole")),
			status,
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
	return validateSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
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

function invalidActionResponse(
	request: NextRequest,
	incidentId: string,
	code: string,
): NextResponse {
	if (wantsHtmlRedirect(request)) {
		const url = new URL(`/incidents/${incidentId}/actions`, request.url);
		url.searchParams.set("error", code);
		return NextResponse.redirect(url, 303);
	}

	return NextResponse.json({ code }, { status: 400 });
}

function serializeAction(action: IncidentCauseActionRow) {
	return {
		...action,
		dueDate: dateOnly(action.dueDate),
		createdAt: action.createdAt.toISOString(),
		updatedAt: action.updatedAt.toISOString(),
	};
}

function actionTypeValue(value: unknown): IncidentActionType | null {
	const text = stringValue(value);
	return actionTypes.has(text as IncidentActionType)
		? (text as IncidentActionType)
		: null;
}

function statusValue(value: unknown): IncidentActionStatus | null {
	const text = stringValue(value);
	return actionStatuses.has(text as IncidentActionStatus)
		? (text as IncidentActionStatus)
		: null;
}

function dueDateValue(value: unknown): string | null | undefined {
	const text = stringValue(value);

	if (!text) {
		return null;
	}

	return dateOnlyPattern.test(text) ? text : undefined;
}

function nullableStringValue(value: unknown): string | null {
	const text = stringValue(value);
	return text ? text : null;
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function dateOnly(value: Date | string | null): string | null {
	if (!value) {
		return null;
	}

	if (value instanceof Date) {
		return value.toISOString().slice(0, 10);
	}

	return value.slice(0, 10);
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
