import { randomUUID } from "node:crypto";
import { withTenantConnection } from "../db";

export type CoachFeedback = {
	readonly id: string;
	readonly incidentId: string;
	readonly userId: string;
	readonly rating: number;
	readonly comment: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
};

export type SerializedCoachFeedback = {
	readonly id: string;
	readonly incidentId: string;
	readonly rating: number;
	readonly comment: string | null;
	readonly createdAt: string;
	readonly updatedAt: string;
};

export type CoachFeedbackInput = {
	readonly rating: number;
	readonly comment: string | null;
};

export class CoachFeedbackValidationError extends Error {
	readonly code: "INVALID_RATING" | "COMMENT_TOO_LONG";

	constructor(code: "INVALID_RATING" | "COMMENT_TOO_LONG") {
		super(code);
		this.code = code;
		this.name = "CoachFeedbackValidationError";
	}
}

type CoachFeedbackRow = {
	readonly id: string;
	readonly incidentId: string;
	readonly userId: string;
	readonly rating: number;
	readonly comment: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
};

type CoachFeedbackLookupRow = {
	readonly incidentId: string;
	readonly feedbackId: string | null;
	readonly userId: string | null;
	readonly rating: number | null;
	readonly comment: string | null;
	readonly createdAt: Date | null;
	readonly updatedAt: Date | null;
};

const maxCommentLength = 2000;

export async function getCoachFeedback(
	tenantId: string,
	incidentId: string,
	userId: string,
): Promise<{ incidentExists: boolean; feedback: CoachFeedback | null }> {
	const rows = await withTenantConnection(
		tenantId,
		async (tx) =>
			tx.$queryRaw<CoachFeedbackLookupRow[]>`
			SELECT
				incident.id::text AS "incidentId",
				feedback.id::text AS "feedbackId",
				feedback.user_id::text AS "userId",
				feedback.rating::int AS rating,
				feedback.comment_text AS comment,
				feedback.created_at AS "createdAt",
				feedback.updated_at AS "updatedAt"
			FROM incident_case incident
			LEFT JOIN incident_coach_feedback feedback
				ON feedback.case_id = incident.id
				AND feedback.user_id = ${userId}::uuid
			WHERE incident.id = ${incidentId}::uuid
			LIMIT 1
		`,
	);
	const row = rows[0];

	if (!row) {
		return { feedback: null, incidentExists: false };
	}

	if (
		!row.feedbackId ||
		!row.userId ||
		!row.rating ||
		!row.createdAt ||
		!row.updatedAt
	) {
		return { feedback: null, incidentExists: true };
	}

	return {
		feedback: {
			comment: row.comment,
			createdAt: row.createdAt,
			id: row.feedbackId,
			incidentId: row.incidentId,
			rating: row.rating,
			updatedAt: row.updatedAt,
			userId: row.userId,
		},
		incidentExists: true,
	};
}

export async function upsertCoachFeedback(input: {
	readonly tenantId: string;
	readonly incidentId: string;
	readonly userId: string;
	readonly feedback: CoachFeedbackInput;
}): Promise<CoachFeedback | null> {
	const rows = await withTenantConnection(
		input.tenantId,
		async (tx) =>
			tx.$queryRaw<CoachFeedbackRow[]>`
			INSERT INTO incident_coach_feedback (
				id,
				case_id,
				user_id,
				rating,
				comment_text
			)
			SELECT
				${randomUUID()}::uuid,
				incident.id,
				${input.userId}::uuid,
				${input.feedback.rating},
				${input.feedback.comment}
			FROM incident_case incident
			WHERE incident.id = ${input.incidentId}::uuid
			ON CONFLICT (case_id, user_id)
			DO UPDATE SET
				rating = EXCLUDED.rating,
				comment_text = EXCLUDED.comment_text,
				updated_at = CURRENT_TIMESTAMP
			RETURNING
				id::text,
				case_id::text AS "incidentId",
				user_id::text AS "userId",
				rating::int,
				comment_text AS comment,
				created_at AS "createdAt",
				updated_at AS "updatedAt"
		`,
	);

	return rows[0] ?? null;
}

export function parseCoachFeedbackPayload(
	body: Map<string, unknown>,
): CoachFeedbackInput {
	const rating = numericRating(body.get("rating"));
	const comment = nullableComment(body.get("comment"));

	return { comment, rating };
}

export function serializeCoachFeedback(
	feedback: CoachFeedback,
): SerializedCoachFeedback {
	return {
		comment: feedback.comment,
		createdAt: feedback.createdAt.toISOString(),
		id: feedback.id,
		incidentId: feedback.incidentId,
		rating: feedback.rating,
		updatedAt: feedback.updatedAt.toISOString(),
	};
}

function numericRating(value: unknown): number {
	const numeric =
		typeof value === "number"
			? value
			: typeof value === "string"
				? Number(value)
				: Number.NaN;

	if (!Number.isInteger(numeric) || numeric < 1 || numeric > 4) {
		throw new CoachFeedbackValidationError("INVALID_RATING");
	}

	return numeric;
}

function nullableComment(value: unknown): string | null {
	const text = typeof value === "string" ? value.trim() : "";

	if (text.length > maxCommentLength) {
		throw new CoachFeedbackValidationError("COMMENT_TOO_LONG");
	}

	return text ? text : null;
}
