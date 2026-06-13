import { type NextRequest, NextResponse } from "next/server";
import { parseStructuredOperation } from "../../../../../../../lib/agent";
import { applyIncidentCoachOperation } from "../../../../../../../lib/agent/incident-investigation/apply-operation";
import { SESSION_COOKIE_NAME } from "../../../../../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../../../../lib/auth/session";
import {
	clearCoachOperationDecision,
	listCoachMessages,
	recordCoachOperationDecision,
} from "../../../../../../../lib/incident/coach-chat";

export const runtime = "nodejs";

type ChatApplyRouteContext = {
	params: Promise<{ id: string }> | { id: string };
};

type ChatApplyRequestBody = {
	messageId?: unknown;
	operationId?: unknown;
	action?: unknown;
	editedText?: unknown;
	operationRecordMap?: unknown;
};

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
	request: NextRequest,
	context: ChatApplyRouteContext,
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);

	if (!isUuid(id)) {
		return NextResponse.json({ code: "INVALID_INCIDENT_ID" }, { status: 400 });
	}

	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	const body = ((await request.json().catch(() => ({}))) ??
		{}) as ChatApplyRequestBody;
	const messageId = stringValue(body.messageId);
	const operationId = stringValue(body.operationId);
	const action = stringValue(body.action);

	if (!isUuid(messageId) || !operationId) {
		return NextResponse.json({ code: "INVALID_REQUEST" }, { status: 400 });
	}

	if (action !== "apply" && action !== "dismiss") {
		return NextResponse.json({ code: "INVALID_REQUEST" }, { status: 400 });
	}

	const messages = await listCoachMessages(session.tenantId, id);

	if (!messages) {
		return NextResponse.json({ code: "INCIDENT_NOT_FOUND" }, { status: 404 });
	}

	const message = messages.find((candidate) => candidate.id === messageId);

	if (!message) {
		return NextResponse.json({ code: "MESSAGE_NOT_FOUND" }, { status: 404 });
	}

	const storedOperation = message.operations.find(
		(candidate) => candidate.id === operationId,
	);

	if (!storedOperation) {
		return NextResponse.json(
			{ code: "OPERATION_NOT_IN_MESSAGE" },
			{ status: 409 },
		);
	}

	if (message.operationDecisions[operationId]) {
		return NextResponse.json({ code: "ALREADY_DECIDED" }, { status: 409 });
	}

	// Re-validate the stored operation rather than trusting persisted JSONB.
	const operation = (() => {
		try {
			return parseStructuredOperation(storedOperation);
		} catch {
			return null;
		}
	})();

	if (!operation) {
		return NextResponse.json({ code: "INVALID_OPERATION" }, { status: 409 });
	}

	if (action === "dismiss") {
		const recorded = await recordCoachOperationDecision({
			decision: { recordId: null, status: "dismissed" },
			incidentId: id,
			messageId,
			onlyIfUndecided: true,
			operationId,
			tenantId: session.tenantId,
		});

		if (!recorded) {
			return NextResponse.json({ code: "ALREADY_DECIDED" }, { status: 409 });
		}

		return NextResponse.json({ ok: true, status: "dismissed" });
	}

	// Claim the decision first so a replayed or concurrent request cannot
	// apply the same operation twice; release the claim if the apply fails.
	const claimed = await recordCoachOperationDecision({
		decision: { recordId: null, status: "applied" },
		incidentId: id,
		messageId,
		onlyIfUndecided: true,
		operationId,
		tenantId: session.tenantId,
	});

	if (!claimed) {
		return NextResponse.json({ code: "ALREADY_DECIDED" }, { status: 409 });
	}

	const applied = await applyIncidentCoachOperation({
		editedText: stringValue(body.editedText) || null,
		incidentId: id,
		operation,
		operationRecordMap: operationRecordMapValue(body.operationRecordMap),
		tenantId: session.tenantId,
	}).catch(async (error) => {
		await clearCoachOperationDecision({
			incidentId: id,
			messageId,
			operationId,
			tenantId: session.tenantId,
		});
		throw error;
	});

	if (!applied.ok) {
		await clearCoachOperationDecision({
			incidentId: id,
			messageId,
			operationId,
			tenantId: session.tenantId,
		});
		return NextResponse.json({ code: applied.code }, { status: 409 });
	}

	await recordCoachOperationDecision({
		decision: { recordId: applied.recordId, status: "applied" },
		incidentId: id,
		messageId,
		operationId,
		tenantId: session.tenantId,
	});

	return NextResponse.json({
		applied: { kind: applied.appliedKind, recordId: applied.recordId },
		ok: true,
		status: "applied",
	});
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "tenantId" | "userId"> | null> {
	return validateSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
}

function operationRecordMapValue(
	value: unknown,
): Readonly<Record<string, string>> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		return {};
	}

	const entries = Object.entries(value as Record<string, unknown>).filter(
		(entry): entry is [string, string] => typeof entry[1] === "string",
	);

	return Object.fromEntries(entries);
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}
