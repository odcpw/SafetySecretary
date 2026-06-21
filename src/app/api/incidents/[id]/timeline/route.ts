import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { readSessionCookie } from "../../../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../../lib/auth/session";
import { withTenantConnection } from "../../../../../lib/db";

export const runtime = "nodejs";

type TimelineRouteContext = {
	params: Promise<{ id: string }> | { id: string };
};

type IncidentTimelineConfidence = "CONFIRMED" | "LIKELY" | "UNCLEAR";

type TimelineEventRow = {
	id: string;
	caseId: string;
	orderIndex: number;
	eventAt: Date | null;
	timeLabel: string | null;
	text: string;
	confidence: IncidentTimelineConfidence;
	createdAt: Date;
	updatedAt: Date;
};

type TimelineSourceRow = {
	id: string;
	timelineEventId: string;
	accountId: string;
	personId: string;
	personRole: string;
	personName: string | null;
};

type TimelineAttachmentRow = {
	id: string;
	eventId: string;
	storageKey: string;
	filename: string | null;
	mimeType: string | null;
	sizeBytes: bigint | number | null;
	createdAt: Date;
	createdById: string;
};

type TimelineEventPayload = {
	eventId?: string;
	eventAt: Date | null;
	timeLabel: string | null;
	text: string;
	confidence: IncidentTimelineConfidence;
	sourcePersonIds: string[];
};

type ParsedBody = {
	value(name: string): unknown;
	values(name: string): unknown[];
};

const validConfidenceValues = new Set<IncidentTimelineConfidence>([
	"CONFIRMED",
	"LIKELY",
	"UNCLEAR",
]);
const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class InvalidTimelineSourceError extends Error {
	constructor() {
		super("INVALID_TIMELINE_SOURCE");
	}
}

export async function GET(
	request: NextRequest,
	context: TimelineRouteContext,
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);
	const session = await resolveValidRequest(request, id);

	if (session instanceof NextResponse) {
		return session;
	}

	const timeline = await loadTimeline(session.tenantId, id);

	if (!timeline) {
		return NextResponse.json({ code: "INCIDENT_NOT_FOUND" }, { status: 404 });
	}

	return NextResponse.json({
		events: serializeTimelineEvents(timeline.events),
	});
}

export async function POST(
	request: NextRequest,
	context: TimelineRouteContext,
): Promise<NextResponse> {
	const body = await readBody(request);
	const action = stringValue(body.value("_action"));

	if (action === "delete") {
		return deleteTimelineEventRequest(request, context, body);
	}

	if (action === "update") {
		return updateTimelineEventRequest(request, context, body);
	}

	return createTimelineEventRequest(request, context, body);
}

export async function PATCH(
	request: NextRequest,
	context: TimelineRouteContext,
): Promise<NextResponse> {
	return updateTimelineEventRequest(request, context, await readBody(request));
}

export async function DELETE(
	request: NextRequest,
	context: TimelineRouteContext,
): Promise<NextResponse> {
	return deleteTimelineEventRequest(request, context, await readBody(request));
}

async function createTimelineEventRequest(
	request: NextRequest,
	context: TimelineRouteContext,
	body: ParsedBody,
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);
	const session = await resolveValidRequest(request, id);

	if (session instanceof NextResponse) {
		return session;
	}

	const parsed = parseTimelinePayload(body, false);

	if (!parsed.ok) {
		return invalidTimelineResponse(request, id, parsed.code);
	}

	const event = await createTimelineEvent(
		session.tenantId,
		id,
		parsed.payload,
	).catch((error: unknown) => {
		if (error instanceof InvalidTimelineSourceError) {
			return "INVALID_TIMELINE_SOURCE" as const;
		}
		throw error;
	});

	if (event === "INVALID_TIMELINE_SOURCE") {
		return invalidTimelineResponse(request, id, event);
	}

	if (!event) {
		return NextResponse.json({ code: "INCIDENT_NOT_FOUND" }, { status: 404 });
	}

	if (wantsHtmlRedirect(request)) {
		return NextResponse.redirect(
			new URL(`/incidents/${id}/timeline`, request.url),
			303,
		);
	}

	return NextResponse.json(
		{ event: serializeTimelineEvent(event) },
		{ status: 201 },
	);
}

async function updateTimelineEventRequest(
	request: NextRequest,
	context: TimelineRouteContext,
	body: ParsedBody,
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);
	const session = await resolveValidRequest(request, id);

	if (session instanceof NextResponse) {
		return session;
	}

	const parsed = parseTimelinePayload(body, true);

	if (!parsed.ok) {
		return invalidTimelineResponse(request, id, parsed.code);
	}

	const event = await updateTimelineEvent(
		session.tenantId,
		id,
		parsed.payload,
	).catch((error: unknown) => {
		if (error instanceof InvalidTimelineSourceError) {
			return "INVALID_TIMELINE_SOURCE" as const;
		}
		throw error;
	});

	if (event === "INVALID_TIMELINE_SOURCE") {
		return invalidTimelineResponse(request, id, event);
	}

	if (!event) {
		return NextResponse.json(
			{ code: "TIMELINE_EVENT_NOT_FOUND" },
			{ status: 404 },
		);
	}

	if (wantsHtmlRedirect(request)) {
		return NextResponse.redirect(
			new URL(`/incidents/${id}/timeline`, request.url),
			303,
		);
	}

	return NextResponse.json({ event: serializeTimelineEvent(event) });
}

async function deleteTimelineEventRequest(
	request: NextRequest,
	context: TimelineRouteContext,
	body: ParsedBody,
): Promise<NextResponse> {
	const { id } = await Promise.resolve(context.params);
	const session = await resolveValidRequest(request, id);

	if (session instanceof NextResponse) {
		return session;
	}

	const eventId = stringValue(body.value("eventId"));

	if (!isUuid(eventId)) {
		return invalidTimelineResponse(request, id, "INVALID_TIMELINE_EVENT_ID");
	}

	const deleted = await deleteTimelineEvent(session.tenantId, id, eventId);

	if (!deleted) {
		return NextResponse.json(
			{ code: "TIMELINE_EVENT_NOT_FOUND" },
			{ status: 404 },
		);
	}

	if (wantsHtmlRedirect(request)) {
		return NextResponse.redirect(
			new URL(`/incidents/${id}/timeline`, request.url),
			303,
		);
	}

	return NextResponse.json({ ok: true });
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

async function loadTimeline(
	tenantId: string,
	incidentId: string,
): Promise<{ events: TimelineEventView[] } | null> {
	return withTenantConnection(tenantId, async (tx) => {
		const cases = await tx.$queryRaw<Array<{ id: string }>>`
			SELECT id::text AS id
			FROM incident_case
			WHERE id = ${incidentId}::uuid
			LIMIT 1
		`;

		if (!cases[0]) {
			return null;
		}

		const [events, sources, attachments] = await Promise.all([
			tx.$queryRaw<TimelineEventRow[]>`
				SELECT
					id::text AS id,
					case_id::text AS "caseId",
					order_index AS "orderIndex",
					event_at AS "eventAt",
					time_label AS "timeLabel",
					text,
					confidence::text AS confidence,
					created_at AS "createdAt",
					updated_at AS "updatedAt"
				FROM incident_timeline_event
				WHERE case_id = ${incidentId}::uuid
				ORDER BY event_at ASC NULLS LAST, order_index ASC, created_at ASC, id ASC
			`,
			timelineSourcesQuery(tx, incidentId),
			timelineAttachmentsQuery(tx, incidentId),
		]);

		return {
			events: mergeTimelineRows(events, sources, attachments),
		};
	});
}

type TenantTx = Parameters<Parameters<typeof withTenantConnection>[1]>[0];

function timelineSourcesQuery(
	tx: TenantTx,
	incidentId: string,
): Promise<TimelineSourceRow[]> {
	return tx.$queryRaw<TimelineSourceRow[]>`
		SELECT
			source.id::text AS id,
			source.timeline_event_id::text AS "timelineEventId",
			source.account_id::text AS "accountId",
			person.id::text AS "personId",
			person.role AS "personRole",
			person.name AS "personName"
		FROM incident_timeline_source source
		JOIN incident_timeline_event event
			ON event.id = source.timeline_event_id
		JOIN incident_account account
			ON account.id = source.account_id
		JOIN incident_person person
			ON person.id = account.person_id
		WHERE event.case_id = ${incidentId}::uuid
		ORDER BY event.event_at ASC NULLS LAST, person.name ASC NULLS LAST, person.id ASC
	`;
}

function timelineAttachmentsQuery(
	tx: TenantTx,
	incidentId: string,
): Promise<TimelineAttachmentRow[]> {
	return tx.$queryRaw<TimelineAttachmentRow[]>`
		SELECT
			attachment.id::text AS id,
			attachment.event_id::text AS "eventId",
			attachment.storage_key AS "storageKey",
			attachment.filename,
			attachment.mime_type AS "mimeType",
			attachment.size_bytes AS "sizeBytes",
			attachment.created_at AS "createdAt",
			attachment.created_by::text AS "createdById"
		FROM incident_attachment attachment
		JOIN incident_timeline_event event
			ON event.id = attachment.event_id
		WHERE event.case_id = ${incidentId}::uuid
		ORDER BY attachment.created_at ASC, attachment.id ASC
	`;
}

async function createTimelineEvent(
	tenantId: string,
	incidentId: string,
	payload: TimelineEventPayload,
): Promise<TimelineEventView | null> {
	const eventId = randomUUID();

	return withTenantConnection(tenantId, async (tx) => {
		const rows = await tx.$queryRaw<TimelineEventRow[]>`
			INSERT INTO incident_timeline_event (
				id,
				case_id,
				order_index,
				event_at,
				time_label,
				text,
				confidence
			)
			SELECT
				${eventId}::uuid,
				incident_case.id,
				COALESCE(
					(
						SELECT MAX(order_index) + 1
						FROM incident_timeline_event
						WHERE case_id = ${incidentId}::uuid
					),
					0
				),
				${payload.eventAt}::timestamptz,
				${payload.timeLabel},
				${payload.text},
				${payload.confidence}::incident_timeline_confidence
			FROM incident_case
			WHERE incident_case.id = ${incidentId}::uuid
			RETURNING
				id::text AS id,
				case_id::text AS "caseId",
				order_index AS "orderIndex",
				event_at AS "eventAt",
				time_label AS "timeLabel",
				text,
				confidence::text AS confidence,
				created_at AS "createdAt",
				updated_at AS "updatedAt"
		`;
		const event = rows[0];

		if (!event) {
			return null;
		}

		await replaceTimelineSources(
			tx,
			incidentId,
			event.id,
			payload.sourcePersonIds,
		);
		return loadTimelineEventRows(tx, incidentId, event.id);
	});
}

async function updateTimelineEvent(
	tenantId: string,
	incidentId: string,
	payload: TimelineEventPayload,
): Promise<TimelineEventView | null> {
	return withTenantConnection(tenantId, async (tx) => {
		const rows = await tx.$queryRaw<TimelineEventRow[]>`
			UPDATE incident_timeline_event
			SET
				event_at = ${payload.eventAt}::timestamptz,
				time_label = ${payload.timeLabel},
				text = ${payload.text},
				confidence = ${payload.confidence}::incident_timeline_confidence,
				updated_at = CURRENT_TIMESTAMP
			WHERE id = ${payload.eventId}::uuid
				AND case_id = ${incidentId}::uuid
			RETURNING
				id::text AS id,
				case_id::text AS "caseId",
				order_index AS "orderIndex",
				event_at AS "eventAt",
				time_label AS "timeLabel",
				text,
				confidence::text AS confidence,
				created_at AS "createdAt",
				updated_at AS "updatedAt"
		`;

		if (!rows[0]) {
			return null;
		}

		await replaceTimelineSources(
			tx,
			incidentId,
			stringValue(payload.eventId),
			payload.sourcePersonIds,
		);
		return loadTimelineEventRows(tx, incidentId, stringValue(payload.eventId));
	});
}

async function deleteTimelineEvent(
	tenantId: string,
	incidentId: string,
	eventId: string,
): Promise<boolean> {
	return withTenantConnection(tenantId, async (tx) => {
		const rows = await tx.$queryRaw<Array<{ id: string }>>`
			DELETE FROM incident_timeline_event
			WHERE id = ${eventId}::uuid
				AND case_id = ${incidentId}::uuid
			RETURNING id::text AS id
		`;

		return Boolean(rows[0]);
	});
}

async function replaceTimelineSources(
	tx: TenantTx,
	incidentId: string,
	eventId: string,
	personIds: string[],
): Promise<void> {
	await tx.$executeRaw`
		DELETE FROM incident_timeline_source
		WHERE timeline_event_id = ${eventId}::uuid
	`;

	for (const personId of personIds) {
		const rows = await tx.$queryRaw<Array<{ accountId: string }>>`
			SELECT account.id::text AS "accountId"
			FROM incident_account account
			JOIN incident_person person
				ON person.id = account.person_id
			WHERE person.id = ${personId}::uuid
				AND person.case_id = ${incidentId}::uuid
			LIMIT 1
		`;
		const accountId = rows[0]?.accountId;

		if (!accountId) {
			throw new InvalidTimelineSourceError();
		}

		await tx.$executeRaw`
			INSERT INTO incident_timeline_source (
				id,
				timeline_event_id,
				account_id
			) VALUES (
				${randomUUID()}::uuid,
				${eventId}::uuid,
				${accountId}::uuid
			)
		`;
	}
}

async function loadTimelineEventRows(
	tx: TenantTx,
	incidentId: string,
	eventId: string,
): Promise<TimelineEventView | null> {
	const [events, sources, attachments] = await Promise.all([
		tx.$queryRaw<TimelineEventRow[]>`
			SELECT
				id::text AS id,
				case_id::text AS "caseId",
				order_index AS "orderIndex",
				event_at AS "eventAt",
				time_label AS "timeLabel",
				text,
				confidence::text AS confidence,
				created_at AS "createdAt",
				updated_at AS "updatedAt"
			FROM incident_timeline_event
			WHERE id = ${eventId}::uuid
				AND case_id = ${incidentId}::uuid
			LIMIT 1
		`,
		tx.$queryRaw<TimelineSourceRow[]>`
			SELECT
				source.id::text AS id,
				source.timeline_event_id::text AS "timelineEventId",
				source.account_id::text AS "accountId",
				person.id::text AS "personId",
				person.role AS "personRole",
				person.name AS "personName"
			FROM incident_timeline_source source
			JOIN incident_account account
				ON account.id = source.account_id
			JOIN incident_person person
				ON person.id = account.person_id
			WHERE source.timeline_event_id = ${eventId}::uuid
			ORDER BY person.name ASC NULLS LAST, person.id ASC
		`,
		tx.$queryRaw<TimelineAttachmentRow[]>`
			SELECT
				id::text AS id,
				event_id::text AS "eventId",
				storage_key AS "storageKey",
				filename,
				mime_type AS "mimeType",
				size_bytes AS "sizeBytes",
				created_at AS "createdAt",
				created_by::text AS "createdById"
			FROM incident_attachment
			WHERE event_id = ${eventId}::uuid
			ORDER BY created_at ASC, id ASC
		`,
	]);

	return mergeTimelineRows(events, sources, attachments)[0] ?? null;
}

type TimelineEventView = TimelineEventRow & {
	attachments: TimelineAttachmentRow[];
	sources: TimelineSourceRow[];
};

function mergeTimelineRows(
	events: TimelineEventRow[],
	sources: TimelineSourceRow[],
	attachments: TimelineAttachmentRow[],
): TimelineEventView[] {
	return events.map((event) => ({
		...event,
		attachments: attachments.filter(
			(attachment) => attachment.eventId === event.id,
		),
		sources: sources.filter((source) => source.timelineEventId === event.id),
	}));
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "tenantId" | "userId"> | null> {
	return validateSession(readSessionCookie(request.cookies));
}

async function readBody(request: NextRequest): Promise<ParsedBody> {
	const contentType = request.headers.get("content-type") ?? "";
	const values = new Map<string, unknown[]>();

	if (contentType.includes("application/json")) {
		const body = (await request.json().catch(() => null)) as Record<
			string,
			unknown
		> | null;

		for (const [key, value] of Object.entries(body ?? {})) {
			values.set(key, Array.isArray(value) ? value : [value]);
		}

		return parsedBody(values);
	}

	const formData = await request.formData().catch(() => null);

	for (const [key, value] of formData?.entries() ?? []) {
		values.set(key, [...(values.get(key) ?? []), value]);
	}

	return parsedBody(values);
}

function parsedBody(values: Map<string, unknown[]>): ParsedBody {
	return {
		value(name) {
			return values.get(name)?.at(-1);
		},
		values(name) {
			return values.get(name) ?? [];
		},
	};
}

function parseTimelinePayload(
	body: ParsedBody,
	requireEventId: boolean,
):
	| { ok: true; payload: TimelineEventPayload }
	| {
			ok: false;
			code:
				| "INVALID_TIMELINE_EVENT_ID"
				| "INVALID_TIMELINE_PAYLOAD"
				| "INVALID_TIMELINE_SOURCE";
	  } {
	const eventId = stringValue(body.value("eventId"));

	if (requireEventId && !isUuid(eventId)) {
		return { code: "INVALID_TIMELINE_EVENT_ID", ok: false };
	}

	const eventAt = parseEventAt(stringValue(body.value("eventAt")));
	const text = stringValue(body.value("text"));
	const confidence = stringValue(body.value("confidence"));
	const sourcePersonIds = parseSourcePersonIds(body);

	if (
		eventAt === undefined ||
		!text ||
		!validConfidenceValues.has(confidence as IncidentTimelineConfidence)
	) {
		return { code: "INVALID_TIMELINE_PAYLOAD", ok: false };
	}

	if (!sourcePersonIds.every(isUuid)) {
		return { code: "INVALID_TIMELINE_SOURCE", ok: false };
	}

	return {
		ok: true,
		payload: {
			confidence: confidence as IncidentTimelineConfidence,
			eventAt,
			eventId: requireEventId ? eventId : undefined,
			sourcePersonIds,
			text,
			timeLabel: nullableStringValue(body.value("timeLabel")),
		},
	};
}

function parseSourcePersonIds(body: ParsedBody): string[] {
	const directValues = body.values("sourcePersonIds");
	const jsonValue = stringValue(body.value("sourcePersonIdsJson"));
	const parsedJson = jsonValue ? parseJson(jsonValue) : null;
	const sourceValues =
		Array.isArray(parsedJson) && directValues.length === 0
			? parsedJson
			: directValues;
	const sourcePersonIds = new Set<string>();

	for (const value of sourceValues) {
		const text = stringValue(value);

		if (text) {
			sourcePersonIds.add(text);
		}
	}

	return [...sourcePersonIds];
}

function parseEventAt(value: string): Date | null | undefined {
	if (!value) {
		return null;
	}

	const eventAt = new Date(value);
	return Number.isNaN(eventAt.getTime()) ? undefined : eventAt;
}

function parseJson(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

function serializeTimelineEvents(events: TimelineEventView[]) {
	return events.map(serializeTimelineEvent);
}

function serializeTimelineEvent(event: TimelineEventView) {
	return {
		...event,
		attachments: event.attachments.map((attachment) => ({
			...attachment,
			createdAt: attachment.createdAt.toISOString(),
			sizeBytes:
				attachment.sizeBytes === null ? null : Number(attachment.sizeBytes),
		})),
		createdAt: event.createdAt.toISOString(),
		eventAt: event.eventAt?.toISOString() ?? null,
		updatedAt: event.updatedAt.toISOString(),
	};
}

function invalidTimelineResponse(
	request: NextRequest,
	incidentId: string,
	code: string,
): NextResponse {
	if (wantsHtmlRedirect(request)) {
		const url = new URL(`/incidents/${incidentId}/timeline`, request.url);
		url.searchParams.set("error", code);
		return NextResponse.redirect(url, 303);
	}

	return NextResponse.json({ code }, { status: 400 });
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function nullableStringValue(value: unknown): string | null {
	const text = stringValue(value);
	return text ? text : null;
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
