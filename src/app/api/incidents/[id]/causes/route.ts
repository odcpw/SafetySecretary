import { type NextRequest, NextResponse } from "next/server";
import { readSessionCookie } from "../../../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../../lib/auth/session";
import {
	type CauseBranchStatus,
	type CauseNodeUpdate,
	createManualCauseNode,
	deleteCauseNode,
	type IncidentCauseNode,
	IncidentCauseNotFoundError,
	InvalidCauseReferenceError,
	loadIncidentCauseTree,
	updateCauseNode,
} from "../../../../../lib/incident/five-whys";

export const runtime = "nodejs";

type CausesRouteContext = {
	params: Promise<{ id: string }> | { id: string };
};

type ParsedBody = Map<string, unknown>;

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
	request: NextRequest,
	context: CausesRouteContext,
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);
	const session = await resolveValidRequest(request, id);

	if (session instanceof NextResponse) {
		return session;
	}

	const tree = await loadIncidentCauseTree(session.tenantId, id);

	if (!tree) {
		return NextResponse.json({ code: "INCIDENT_NOT_FOUND" }, { status: 404 });
	}

	return NextResponse.json({
		nodes: tree.nodes.map(serializeCauseNode),
		timelineEvents: tree.timelineEvents.map((event) => ({
			...event,
			eventAt: event.eventAt?.toISOString() ?? null,
		})),
	});
}

export async function POST(
	request: NextRequest,
	context: CausesRouteContext,
): Promise<NextResponse> {
	const body = await readBody(request);
	const action = stringValue(body.get("_action"));

	if (action === "delete") {
		return deleteCauseNodeRequest(request, context, body);
	}

	if (action === "update") {
		return updateCauseNodeRequest(request, context, body);
	}

	return createCauseNodeRequest(request, context, body);
}

export async function PATCH(
	request: NextRequest,
	context: CausesRouteContext,
): Promise<NextResponse> {
	return updateCauseNodeRequest(request, context, await readBody(request));
}

export async function DELETE(
	request: NextRequest,
	context: CausesRouteContext,
): Promise<NextResponse> {
	return deleteCauseNodeRequest(request, context, await readBody(request));
}

async function createCauseNodeRequest(
	request: NextRequest,
	context: CausesRouteContext,
	body: ParsedBody,
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);
	const session = await resolveValidRequest(request, id);

	if (session instanceof NextResponse) {
		return session;
	}

	const parsed = parseCreatePayload(body);

	if (!parsed.ok) {
		return invalidCauseResponse(request, id, parsed.code);
	}

	const node = await createManualCauseNode(
		session.tenantId,
		id,
		parsed.payload,
	).catch(causeMutationError);

	if (typeof node === "string") {
		return invalidCauseResponse(request, id, node);
	}

	if (!node) {
		return NextResponse.json({ code: "INCIDENT_NOT_FOUND" }, { status: 404 });
	}

	if (wantsHtmlRedirect(request)) {
		return NextResponse.redirect(
			new URL(`/incidents/${id}/causes`, request.url),
			303,
		);
	}

	return NextResponse.json({ node: serializeCauseNode(node) }, { status: 201 });
}

async function updateCauseNodeRequest(
	request: NextRequest,
	context: CausesRouteContext,
	body: ParsedBody,
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);
	const session = await resolveValidRequest(request, id);

	if (session instanceof NextResponse) {
		return session;
	}

	const parsed = parseUpdatePayload(body);

	if (!parsed.ok) {
		return invalidCauseResponse(request, id, parsed.code);
	}

	const node = await updateCauseNode(
		session.tenantId,
		id,
		parsed.payload,
	).catch(causeMutationError);

	if (typeof node === "string") {
		return invalidCauseResponse(request, id, node);
	}

	if (!node) {
		return NextResponse.json({ code: "CAUSE_NODE_NOT_FOUND" }, { status: 404 });
	}

	if (wantsHtmlRedirect(request)) {
		return NextResponse.redirect(
			new URL(`/incidents/${id}/causes`, request.url),
			303,
		);
	}

	return NextResponse.json({ node: serializeCauseNode(node) });
}

async function deleteCauseNodeRequest(
	request: NextRequest,
	context: CausesRouteContext,
	body: ParsedBody,
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);
	const session = await resolveValidRequest(request, id);

	if (session instanceof NextResponse) {
		return session;
	}

	const nodeId = stringValue(body.get("nodeId"));

	if (!isUuid(nodeId)) {
		return invalidCauseResponse(request, id, "INVALID_CAUSE_NODE_ID");
	}

	const deleted = await deleteCauseNode(session.tenantId, id, nodeId);

	if (!deleted) {
		return NextResponse.json({ code: "CAUSE_NODE_NOT_FOUND" }, { status: 404 });
	}

	if (wantsHtmlRedirect(request)) {
		return NextResponse.redirect(
			new URL(`/incidents/${id}/causes`, request.url),
			303,
		);
	}

	return NextResponse.json({ ok: true });
}

function parseCreatePayload(body: ParsedBody):
	| {
			ok: true;
			payload: {
				parentId: string | null;
				timelineEventId: string | null;
				statement: string;
				question: string | null;
				isRootCause: boolean;
			};
	  }
	| { ok: false; code: string } {
	const parentId = nullableUuidValue(body.get("parentId"));
	const timelineEventId = nullableUuidValue(body.get("timelineEventId"));
	const statement = stringValue(body.get("statement"));

	if (parentId === undefined || timelineEventId === undefined || !statement) {
		return { code: "INVALID_CAUSE_PAYLOAD", ok: false };
	}

	return {
		ok: true,
		payload: {
			isRootCause: booleanValue(body.get("isRootCause")),
			parentId,
			question: nullableStringValue(body.get("question")),
			statement,
			timelineEventId,
		},
	};
}

function parseUpdatePayload(
	body: ParsedBody,
): { ok: true; payload: CauseNodeUpdate } | { ok: false; code: string } {
	const nodeId = stringValue(body.get("nodeId"));
	const statement = stringValue(body.get("statement"));

	if (!isUuid(nodeId)) {
		return { code: "INVALID_CAUSE_NODE_ID", ok: false };
	}

	if (!statement) {
		return { code: "INVALID_CAUSE_PAYLOAD", ok: false };
	}

	const payload: CauseNodeUpdate = {
		isRootCause: booleanValue(body.get("isRootCause")),
		nodeId,
		question: nullableStringValue(body.get("question")),
		statement,
	};

	if (body.has("parentId")) {
		const parentId = nullableUuidValue(body.get("parentId"));

		if (parentId === undefined) {
			return { code: "INVALID_CAUSE_PARENT", ok: false };
		}

		payload.parentId = parentId;
	}

	if (body.has("beforeId")) {
		const beforeId = nullableUuidValue(body.get("beforeId"));

		if (beforeId === undefined) {
			return { code: "INVALID_CAUSE_BEFORE", ok: false };
		}

		payload.beforeId = beforeId;
	}

	const branchStatus = stringValue(body.get("branchStatus"));

	if (branchStatus) {
		if (!isBranchStatus(branchStatus)) {
			return { code: "INVALID_CAUSE_PAYLOAD", ok: false };
		}

		payload.branchStatus = branchStatus;
	}

	return { ok: true, payload };
}

function isBranchStatus(value: string): value is CauseBranchStatus {
	return value === "OPEN" || value === "ROOT_REACHED" || value === "PARKED";
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

function causeMutationError(error: unknown): string | null {
	if (error instanceof IncidentCauseNotFoundError) {
		return error.code;
	}

	if (error instanceof InvalidCauseReferenceError) {
		return error.code;
	}

	throw error;
}

function invalidCauseResponse(
	request: NextRequest,
	incidentId: string,
	code: string,
): NextResponse {
	if (wantsHtmlRedirect(request)) {
		const url = new URL(`/incidents/${incidentId}/causes`, request.url);
		url.searchParams.set("error", code);
		return NextResponse.redirect(url, 303);
	}

	return NextResponse.json({ code }, { status: 400 });
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

function nullableStringValue(value: unknown): string | null {
	const text = stringValue(value);
	return text ? text : null;
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function booleanValue(value: unknown): boolean {
	return value === true || value === "true" || value === "on" || value === "1";
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
