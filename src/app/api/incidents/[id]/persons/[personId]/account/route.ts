import { randomUUID } from "node:crypto";
import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "../../../../../../../lib/auth/cookies";
import {
	type ValidatedSession,
	validateSession,
} from "../../../../../../../lib/auth/session";
import { withTenantConnection } from "../../../../../../../lib/db";

export const runtime = "nodejs";

type AccountRouteContext = {
	params:
		| Promise<{ id: string; personId: string }>
		| { id: string; personId: string };
};

type IncidentPersonRow = {
	id: string;
	caseId: string;
	role: string;
	name: string | null;
	otherInfo: string | null;
};

type AccountRow = {
	id: string;
	caseId: string;
	personId: string;
	rawStatement: string | null;
	createdAt: Date;
	updatedAt: Date;
};

type FactRow = {
	id: string;
	accountId: string;
	orderIndex: number;
	text: string;
	createdAt: Date;
	updatedAt: Date;
};

type PersonalEventRow = {
	id: string;
	accountId: string;
	orderIndex: number;
	eventAt: Date | null;
	timeLabel: string | null;
	text: string;
	createdAt: Date;
	updatedAt: Date;
};

type AccountPayload = {
	rawStatement: string | null;
	facts: Array<{ text: string }>;
	personalEvents: Array<{
		eventAt: Date | null;
		timeLabel: string | null;
		text: string;
	}>;
};

const uuidPattern =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
	request: NextRequest,
	context: AccountRouteContext,
): Promise<NextResponse> {
	const { id, personId } = await Promise.resolve(context.params);
	const session = await resolveValidRequest(request, id, personId);

	if (session instanceof NextResponse) {
		return session;
	}

	const account = await loadAccount(session.tenantId, id, personId);

	if (!account) {
		return NextResponse.json({ code: "PERSON_NOT_FOUND" }, { status: 404 });
	}

	return NextResponse.json({ account: serializeAccountPayload(account) });
}

export async function POST(
	request: NextRequest,
	context: AccountRouteContext,
): Promise<NextResponse> {
	return saveAccountRequest(request, context);
}

export async function PATCH(
	request: NextRequest,
	context: AccountRouteContext,
): Promise<NextResponse> {
	return saveAccountRequest(request, context);
}

async function saveAccountRequest(
	request: NextRequest,
	context: AccountRouteContext,
): Promise<NextResponse> {
	const { id, personId } = await Promise.resolve(context.params);
	const session = await resolveValidRequest(request, id, personId);

	if (session instanceof NextResponse) {
		return session;
	}

	const parsed = await parseAccountPayload(request);

	if (!parsed.ok) {
		if (wantsHtmlRedirect(request)) {
			return redirectToAccount(request, id, personId, parsed.code);
		}

		return NextResponse.json({ code: parsed.code }, { status: 400 });
	}

	const saved = await saveAccount(
		session.tenantId,
		id,
		personId,
		parsed.payload,
	);

	if (!saved) {
		return NextResponse.json({ code: "PERSON_NOT_FOUND" }, { status: 404 });
	}

	if (wantsHtmlRedirect(request)) {
		return NextResponse.redirect(
			new URL(`/incidents/${id}/persons`, request.url),
			303,
		);
	}

	return NextResponse.json({ account: serializeAccountPayload(saved) });
}

async function resolveValidRequest(
	request: NextRequest,
	incidentId: string,
	personId: string,
): Promise<Pick<ValidatedSession, "tenantId" | "userId"> | NextResponse> {
	if (!isUuid(incidentId)) {
		return NextResponse.json({ code: "INVALID_INCIDENT_ID" }, { status: 400 });
	}

	if (!isUuid(personId)) {
		return NextResponse.json({ code: "INVALID_PERSON_ID" }, { status: 400 });
	}

	const session = await resolveSession(request);

	if (!session) {
		return NextResponse.json({ code: "AUTH_REQUIRED" }, { status: 401 });
	}

	return session;
}

async function loadAccount(
	tenantId: string,
	incidentId: string,
	personId: string,
): Promise<{
	account: AccountRow | null;
	facts: FactRow[];
	person: IncidentPersonRow;
	personalEvents: PersonalEventRow[];
} | null> {
	return withTenantConnection(tenantId, async (tx) => {
		const persons = await tx.$queryRaw<IncidentPersonRow[]>`
			SELECT
				id::text AS id,
				case_id::text AS "caseId",
				role,
				name,
				other_info AS "otherInfo"
			FROM incident_person
			WHERE id = ${personId}::uuid
				AND case_id = ${incidentId}::uuid
			LIMIT 1
		`;
		const person = persons[0];

		if (!person) {
			return null;
		}

		const accounts = await tx.$queryRaw<AccountRow[]>`
			SELECT
				id::text AS id,
				case_id::text AS "caseId",
				person_id::text AS "personId",
				raw_statement AS "rawStatement",
				created_at AS "createdAt",
				updated_at AS "updatedAt"
			FROM incident_account
			WHERE person_id = ${personId}::uuid
			LIMIT 1
		`;
		const account = accounts[0] ?? null;

		if (!account) {
			return { account: null, facts: [], person, personalEvents: [] };
		}

		const [facts, personalEvents] = await Promise.all([
			tx.$queryRaw<FactRow[]>`
				SELECT
					id::text AS id,
					account_id::text AS "accountId",
					order_index AS "orderIndex",
					text,
					created_at AS "createdAt",
					updated_at AS "updatedAt"
				FROM incident_fact
				WHERE account_id = ${account.id}::uuid
				ORDER BY order_index ASC, id ASC
			`,
			tx.$queryRaw<PersonalEventRow[]>`
				SELECT
					id::text AS id,
					account_id::text AS "accountId",
					order_index AS "orderIndex",
					event_at AS "eventAt",
					time_label AS "timeLabel",
					text,
					created_at AS "createdAt",
					updated_at AS "updatedAt"
				FROM incident_personal_event
				WHERE account_id = ${account.id}::uuid
				ORDER BY order_index ASC, id ASC
			`,
		]);

		return { account, facts, person, personalEvents };
	});
}

async function saveAccount(
	tenantId: string,
	incidentId: string,
	personId: string,
	payload: AccountPayload,
): Promise<{
	account: AccountRow;
	facts: FactRow[];
	person: IncidentPersonRow;
	personalEvents: PersonalEventRow[];
} | null> {
	return withTenantConnection(tenantId, async (tx) => {
		const persons = await tx.$queryRaw<IncidentPersonRow[]>`
			SELECT
				id::text AS id,
				case_id::text AS "caseId",
				role,
				name,
				other_info AS "otherInfo"
			FROM incident_person
			WHERE id = ${personId}::uuid
				AND case_id = ${incidentId}::uuid
			LIMIT 1
		`;
		const person = persons[0];

		if (!person) {
			return null;
		}

		const accountId = await ensureAccount(
			tx,
			incidentId,
			personId,
			payload.rawStatement,
		);

		await tx.$executeRaw`
			DELETE FROM incident_personal_event
			WHERE account_id = ${accountId}::uuid
		`;
		await tx.$executeRaw`
			DELETE FROM incident_fact
			WHERE account_id = ${accountId}::uuid
		`;

		for (const [index, fact] of payload.facts.entries()) {
			await tx.$executeRaw`
				INSERT INTO incident_fact (
					id,
					account_id,
					order_index,
					text
				) VALUES (
					${randomUUID()}::uuid,
					${accountId}::uuid,
					${index},
					${fact.text}
				)
			`;
		}

		for (const [index, event] of payload.personalEvents.entries()) {
			await tx.$executeRaw`
				INSERT INTO incident_personal_event (
					id,
					account_id,
					order_index,
					event_at,
					time_label,
					text
				) VALUES (
					${randomUUID()}::uuid,
					${accountId}::uuid,
					${index},
					${event.eventAt}::timestamptz,
					${event.timeLabel},
					${event.text}
				)
			`;
		}

		const saved = await loadAccountRows(tx, accountId);

		return {
			account: saved.account,
			facts: saved.facts,
			person,
			personalEvents: saved.personalEvents,
		};
	});
}

async function ensureAccount(
	tx: Parameters<Parameters<typeof withTenantConnection>[1]>[0],
	incidentId: string,
	personId: string,
	rawStatement: string | null,
): Promise<string> {
	const existing = await tx.$queryRaw<Array<{ id: string }>>`
		SELECT id::text AS id
		FROM incident_account
		WHERE person_id = ${personId}::uuid
		LIMIT 1
	`;
	const existingId = existing[0]?.id;

	if (existingId) {
		await tx.$executeRaw`
			UPDATE incident_account
			SET raw_statement = ${rawStatement},
				updated_at = CURRENT_TIMESTAMP
			WHERE id = ${existingId}::uuid
		`;
		return existingId;
	}

	const accountId = randomUUID();

	await tx.$executeRaw`
		INSERT INTO incident_account (
			id,
			case_id,
			person_id,
			raw_statement
		) VALUES (
			${accountId}::uuid,
			${incidentId}::uuid,
			${personId}::uuid,
			${rawStatement}
		)
	`;

	return accountId;
}

async function loadAccountRows(
	tx: Parameters<Parameters<typeof withTenantConnection>[1]>[0],
	accountId: string,
): Promise<{
	account: AccountRow;
	facts: FactRow[];
	personalEvents: PersonalEventRow[];
}> {
	const [accounts, facts, personalEvents] = await Promise.all([
		tx.$queryRaw<AccountRow[]>`
			SELECT
				id::text AS id,
				case_id::text AS "caseId",
				person_id::text AS "personId",
				raw_statement AS "rawStatement",
				created_at AS "createdAt",
				updated_at AS "updatedAt"
			FROM incident_account
			WHERE id = ${accountId}::uuid
			LIMIT 1
		`,
		tx.$queryRaw<FactRow[]>`
			SELECT
				id::text AS id,
				account_id::text AS "accountId",
				order_index AS "orderIndex",
				text,
				created_at AS "createdAt",
				updated_at AS "updatedAt"
			FROM incident_fact
			WHERE account_id = ${accountId}::uuid
			ORDER BY order_index ASC, id ASC
		`,
		tx.$queryRaw<PersonalEventRow[]>`
			SELECT
				id::text AS id,
				account_id::text AS "accountId",
				order_index AS "orderIndex",
				event_at AS "eventAt",
				time_label AS "timeLabel",
				text,
				created_at AS "createdAt",
				updated_at AS "updatedAt"
			FROM incident_personal_event
			WHERE account_id = ${accountId}::uuid
			ORDER BY order_index ASC, id ASC
		`,
	]);

	const account = accounts[0];

	if (!account) {
		throw new Error("INCIDENT_ACCOUNT_SAVE_INVARIANT");
	}

	return { account, facts, personalEvents };
}

async function resolveSession(
	request: NextRequest,
): Promise<Pick<ValidatedSession, "tenantId" | "userId"> | null> {
	return validateSession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
}

async function parseAccountPayload(
	request: NextRequest,
): Promise<
	| { ok: true; payload: AccountPayload }
	| { ok: false; code: "INVALID_ACCOUNT_PAYLOAD" }
> {
	const contentType = request.headers.get("content-type") ?? "";

	if (contentType.includes("application/json")) {
		const body = (await request.json().catch(() => null)) as Record<
			string,
			unknown
		> | null;
		const parsed = parseFactsAndEvents(
			body?.facts ?? body?.factsJson,
			body?.personalEvents ?? body?.personalEventsJson,
			body?.rawStatement,
		);
		return parsed
			? { ok: true, payload: parsed }
			: { code: "INVALID_ACCOUNT_PAYLOAD", ok: false };
	}

	const formData = await request.formData().catch(() => null);
	const parsed = parseFactsAndEvents(
		stringValue(formData?.get("factsJson")),
		stringValue(formData?.get("personalEventsJson")),
		formData?.get("rawStatement"),
	);
	return parsed
		? { ok: true, payload: parsed }
		: { code: "INVALID_ACCOUNT_PAYLOAD", ok: false };
}

function parseFactsAndEvents(
	factsInput: unknown,
	eventsInput: unknown,
	rawStatementInput: unknown,
): AccountPayload | null {
	const factsSource =
		typeof factsInput === "string" ? parseJson(factsInput || "[]") : factsInput;
	const eventsSource =
		typeof eventsInput === "string"
			? parseJson(eventsInput || "[]")
			: eventsInput;
	const facts = parseFacts(factsSource);
	const personalEvents = parsePersonalEvents(eventsSource);

	if (!facts || !personalEvents) {
		return null;
	}

	return {
		facts,
		personalEvents,
		rawStatement: nullableStringValue(rawStatementInput),
	};
}

function parseFacts(input: unknown): Array<{ text: string }> | null {
	if (!Array.isArray(input)) {
		return null;
	}

	const facts: Array<{ text: string }> = [];

	for (const item of input) {
		const text = stringValue(recordValue(item, "text"));

		if (!text) {
			return null;
		}

		facts.push({ text });
	}

	return facts;
}

function parsePersonalEvents(input: unknown): Array<{
	eventAt: Date | null;
	timeLabel: string | null;
	text: string;
}> | null {
	if (!Array.isArray(input)) {
		return null;
	}

	const events: Array<{
		eventAt: Date | null;
		timeLabel: string | null;
		text: string;
	}> = [];

	for (const item of input) {
		const text = stringValue(recordValue(item, "text"));
		const eventAtRaw = stringValue(recordValue(item, "eventAt"));
		const eventAt = eventAtRaw ? new Date(eventAtRaw) : null;

		if (!text || (eventAt && Number.isNaN(eventAt.getTime()))) {
			return null;
		}

		events.push({
			eventAt,
			text,
			timeLabel: nullableStringValue(recordValue(item, "timeLabel")),
		});
	}

	return events;
}

function serializeAccountPayload(input: {
	account: AccountRow | null;
	facts: FactRow[];
	person: IncidentPersonRow;
	personalEvents: PersonalEventRow[];
}) {
	return {
		account: input.account
			? {
					...input.account,
					createdAt: input.account.createdAt.toISOString(),
					updatedAt: input.account.updatedAt.toISOString(),
				}
			: null,
		facts: input.facts.map((fact) => ({
			...fact,
			createdAt: fact.createdAt.toISOString(),
			updatedAt: fact.updatedAt.toISOString(),
		})),
		person: input.person,
		personalEvents: input.personalEvents.map((event) => ({
			...event,
			createdAt: event.createdAt.toISOString(),
			eventAt: event.eventAt?.toISOString() ?? null,
			updatedAt: event.updatedAt.toISOString(),
		})),
	};
}

function parseJson(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

function recordValue(input: unknown, key: string): unknown {
	return input && typeof input === "object" && !Array.isArray(input)
		? (input as Record<string, unknown>)[key]
		: undefined;
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

	return (
		accept.includes("text/html") ||
		contentType.includes("form-urlencoded") ||
		contentType.includes("multipart/form-data")
	);
}

function redirectToAccount(
	request: NextRequest,
	incidentId: string,
	personId: string,
	errorCode: string,
): NextResponse {
	const url = new URL(
		`/incidents/${incidentId}/persons/${personId}/account`,
		request.url,
	);
	url.searchParams.set("error", errorCode);
	return NextResponse.redirect(url, 303);
}

function isUuid(value: string | null | undefined): value is string {
	return typeof value === "string" && uuidPattern.test(value);
}
