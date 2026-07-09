import { type NextRequest, NextResponse } from "next/server";
import { readSessionCookie } from "../../../../../../lib/auth/cookies";
import { verifyCsrfRequest } from "../../../../../../lib/auth/csrf";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../../../lib/auth/session";
import {
	type ProcessNode,
	type ProcessNodeSourceConfidence,
	updateProcessNode,
} from "../../../../../../lib/process-map";

export const runtime = "nodejs";

type ProcessNodeRouteContext = {
	params: Promise<{ id: string; nodeId: string }> | { id: string; nodeId: string };
};

type ProcessNodePatchPayload = {
	sourceConfidence?: ProcessNodeSourceConfidence;
	whoWouldKnow?: string | null;
};

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validSourceConfidence = new Set(["DIRECT", "HEARSAY"]);

export async function PATCH(
	request: NextRequest,
	context: ProcessNodeRouteContext,
): Promise<NextResponse> {
	const { id, nodeId } = await Promise.resolve(context.params);

	if (!isUuid(id)) {
		return NextResponse.json(
			{ code: "INVALID_PROCESS_MAP_ID" },
			{ status: 400 },
		);
	}
	if (!isUuid(nodeId)) {
		return NextResponse.json(
			{ code: "INVALID_PROCESS_NODE_ID" },
			{ status: 400 },
		);
	}

	const session = await resolveSession(request);
	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}
	if (!verifyCsrfRequest(request.headers, session.id)) {
		return NextResponse.json({ code: "CSRF_INVALID" }, { status: 403 });
	}

	const parsed = await readPatchPayload(request);
	if (!parsed.ok) {
		return NextResponse.json({ code: parsed.code }, { status: 400 });
	}

	const node = await updateProcessNode(session.tenantId, id, nodeId, parsed.payload);
	if (!node) {
		return NextResponse.json(
			{ code: "PROCESS_NODE_NOT_FOUND" },
			{ status: 404 },
		);
	}

	return NextResponse.json({ node: serializeProcessNode(node) });
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "id" | "tenantId" | "userId"> | null> {
	return validateSession(readSessionCookie(request.cookies));
}

async function readPatchPayload(
	request: NextRequest,
): Promise<
	| { ok: true; payload: ProcessNodePatchPayload }
	| { ok: false; code: string }
> {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return { code: "INVALID_JSON", ok: false };
	}

	if (!body || typeof body !== "object" || Array.isArray(body)) {
		return { code: "INVALID_PROCESS_NODE_PATCH", ok: false };
	}

	const entries = Object.entries(body);
	if (
		entries.some(
			([key]) => key !== "whoWouldKnow" && key !== "sourceConfidence",
		)
	) {
		return { code: "INVALID_PROCESS_NODE_PATCH", ok: false };
	}

	const input = body as Record<string, unknown>;
	const payload: ProcessNodePatchPayload = {};

	if ("whoWouldKnow" in input) {
		if (input.whoWouldKnow !== null && typeof input.whoWouldKnow !== "string") {
			return { code: "INVALID_WHO_WOULD_KNOW", ok: false };
		}
		payload.whoWouldKnow =
			typeof input.whoWouldKnow === "string"
				? input.whoWouldKnow.trim() || null
				: null;
	}

	if ("sourceConfidence" in input) {
		if (
			typeof input.sourceConfidence !== "string" ||
			!validSourceConfidence.has(input.sourceConfidence)
		) {
			return { code: "INVALID_SOURCE_CONFIDENCE", ok: false };
		}
		payload.sourceConfidence =
			input.sourceConfidence as ProcessNodeSourceConfidence;
	}

	return { ok: true, payload };
}

function serializeProcessNode(node: ProcessNode) {
	return {
		...node,
		createdAt: node.createdAt.toISOString(),
		updatedAt: node.updatedAt.toISOString(),
	};
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}
