import { type NextRequest, NextResponse } from "next/server";
import { readSessionCookie } from "../../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../lib/auth/session";
import {
	loadProcessMap,
	type ProcessEdge,
	type ProcessFlow,
	type ProcessMap,
	type ProcessNode,
	type ProcessResource,
} from "../../../../lib/process-map";
import { computeProcessMapReadiness } from "../../../../lib/process-map/readiness";

export const runtime = "nodejs";

type ProcessMapRouteContext = {
	params: Promise<{ id: string }> | { id: string };
};

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
	request: NextRequest,
	context: ProcessMapRouteContext,
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);

	if (!isUuid(id)) {
		return NextResponse.json(
			{ code: "INVALID_PROCESS_MAP_ID" },
			{ status: 400 },
		);
	}

	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	const record = await loadProcessMap(session.tenantId, id);

	if (!record) {
		return NextResponse.json(
			{ code: "PROCESS_MAP_NOT_FOUND" },
			{ status: 404 },
		);
	}

	return NextResponse.json({
		edges: record.edges.map(serializeProcessEdge),
		flows: record.flows.map(serializeProcessFlow),
		map: serializeProcessMap(record.map),
		nodes: record.nodes.map(serializeProcessNode),
		readiness: computeProcessMapReadiness(record),
		resources: record.resources.map(serializeProcessResource),
	});
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

function serializeProcessNode(node: ProcessNode) {
	return {
		...node,
		createdAt: node.createdAt.toISOString(),
		updatedAt: node.updatedAt.toISOString(),
	};
}

function serializeProcessEdge(edge: ProcessEdge) {
	return {
		...edge,
		createdAt: edge.createdAt.toISOString(),
		updatedAt: edge.updatedAt.toISOString(),
	};
}

function serializeProcessFlow(flow: ProcessFlow) {
	return {
		...flow,
		createdAt: flow.createdAt.toISOString(),
		updatedAt: flow.updatedAt.toISOString(),
	};
}

function serializeProcessResource(resource: ProcessResource) {
	return {
		...resource,
		createdAt: resource.createdAt.toISOString(),
		updatedAt: resource.updatedAt.toISOString(),
	};
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}
