import { randomUUID } from "node:crypto";
import { withTenantConnection } from "../../db";
import { syncIncidentActionBridge } from "../../incident/action-bridge";
import {
	computePotentialRiskBand,
	deriveActualSeverityFromOutcome,
	parseActualInjuryOutcome,
	parseIncidentType,
	parsePotentialLikelihood,
	parsePotentialSeverity,
} from "../../incident/classification";
import { EVENT_TYPE_CODES, HAZARD_CATEGORY_CODES } from "../../taxonomy/schema";
import {
	type AgentIncidentFieldUpdatePayload,
	AgentOperationKind,
	type AgentStructuredOperation,
} from "../types";

export type IncidentCoachApplyResult =
	| {
			ok: true;
			appliedKind: AgentStructuredOperation["kind"];
			recordId: string | null;
	  }
	| {
			ok: false;
			code:
				| "ASK_ONLY_OPERATION"
				| "CAUSE_NODE_REQUIRED"
				| "INCIDENT_NOT_FOUND"
				| "INVALID_FIELD_VALUE"
				| "OUTPUT_DRAFT_NOT_PERSISTED"
				| "PERSON_ACCOUNT_REQUIRED"
				| "UNRESOLVED_OPERATION_REFERENCE"
				| "UNSUPPORTED_OPERATION";
	  };

export async function applyIncidentCoachOperation(input: {
	readonly tenantId: string;
	readonly incidentId: string;
	readonly operation: AgentStructuredOperation;
	readonly editedText?: string | null;
	readonly operationRecordMap?: Readonly<Record<string, string>>;
}): Promise<IncidentCoachApplyResult> {
	const editedText = cleanText(input.editedText);

	return withTenantConnection(input.tenantId, async (tx) => {
		const incidentExists = await tx.$queryRaw<Array<{ id: string }>>`
			SELECT id::text AS id
			FROM incident_case
			WHERE id = ${input.incidentId}::uuid
			LIMIT 1
		`;

		if (incidentExists.length === 0) {
			return { code: "INCIDENT_NOT_FOUND", ok: false };
		}

		switch (input.operation.kind) {
			case AgentOperationKind.AskQuestion:
				return { code: "ASK_ONLY_OPERATION", ok: false };

			case AgentOperationKind.Fact: {
				// Facts are case-level established statements. Attribution to a
				// person is OPTIONAL — only when an explicit account source is
				// given (e.g. conflicting witness accounts). No person required.
				const accountId = await accountIdForFactOperation(
					tx,
					input.incidentId,
					input.operation,
				);
				const recordId = randomUUID();
				const text = editedText ?? input.operation.payload.text;
				const orderIndex = await nextFactOrderIndex(tx, input.incidentId);
				await tx.$executeRaw`
					INSERT INTO incident_fact (
						id,
						case_id,
						account_id,
						order_index,
						text
					) VALUES (
						${recordId}::uuid,
						${input.incidentId}::uuid,
						${accountId}::uuid,
						${orderIndex},
						${text}
					)
				`;
				return { appliedKind: input.operation.kind, ok: true, recordId };
			}

			case AgentOperationKind.TimelineEvent: {
				const recordId = randomUUID();
				const payload = input.operation.payload;
				const orderIndex = await nextTimelineOrderIndex(tx, input.incidentId);
				const timeLabel = payload.phase
					? `${phaseLabel(payload.phase)} — ${payload.title}`
					: payload.title;
				await tx.$executeRaw`
					INSERT INTO incident_timeline_event (
						id,
						case_id,
						order_index,
						time_label,
						text,
						confidence
					) VALUES (
						${recordId}::uuid,
						${input.incidentId}::uuid,
						${orderIndex},
						${timeLabel},
						${editedText ?? payload.narrative ?? payload.title},
						'LIKELY'::incident_timeline_confidence
					)
				`;
				return { appliedKind: input.operation.kind, ok: true, recordId };
			}

			case AgentOperationKind.CauseNode: {
				const recordId = randomUUID();
				const payload = input.operation.payload;
				const parentReference = resolveOperationReference(
					payload.parentId,
					input.operationRecordMap,
				);
				if (!parentReference.ok) {
					return { code: "UNRESOLVED_OPERATION_REFERENCE", ok: false };
				}
				const parentId = parentReference.value
					? await existingCauseNodeId(
							tx,
							input.incidentId,
							parentReference.value,
						)
					: null;
				if (parentReference.value && !parentId) {
					return { code: "UNRESOLVED_OPERATION_REFERENCE", ok: false };
				}
				// Durable de-duplication guard: the coach re-emits cause_node
				// operations for causes already in the record on later turns, and
				// accepting each one would pile up duplicate nodes (the live bug:
				// 6 nodes for 2 real causes). Serialize per case with the same
				// advisory lock the re-parent path uses, then no-op if a cause with
				// the same normalized statement already exists — resolving to that
				// node's id so any same-response parent/child wiring still works
				// against the existing node. Only exact-text duplicates are blocked;
				// genuinely different causes are never merged.
				await tx.$queryRaw`
					SELECT pg_advisory_xact_lock(hashtextextended(${input.incidentId}, 0))::text
				`;
				const statement = editedText ?? payload.label;
				const duplicateId = await existingCauseNodeIdByStatement(
					tx,
					input.incidentId,
					statement,
				);
				if (duplicateId) {
					return {
						appliedKind: input.operation.kind,
						ok: true,
						recordId: duplicateId,
					};
				}
				const orderIndex = await nextCauseOrderIndex(tx, input.incidentId);
				const branchStatus =
					payload.branchStatus ??
					(payload.isRootCause ? "ROOT_REACHED" : "OPEN");
				await tx.$executeRaw`
					INSERT INTO incident_cause_node (
						id,
						case_id,
						parent_id,
						order_index,
						statement,
						question,
						is_root_cause,
						branch_status
					) VALUES (
						${recordId}::uuid,
						${input.incidentId}::uuid,
						${parentId}::uuid,
						${orderIndex},
						${statement},
						NULL,
						${payload.isRootCause ?? false},
						${branchStatus}
					)
				`;
				return { appliedKind: input.operation.kind, ok: true, recordId };
			}

			case AgentOperationKind.CauseUpdate: {
				const payload = input.operation.payload;
				const causeReference = resolveOperationReference(
					payload.causeId,
					input.operationRecordMap,
				);
				if (!causeReference.ok) {
					return { code: "UNRESOLVED_OPERATION_REFERENCE", ok: false };
				}
				const causeNodeId = await existingCauseNodeId(
					tx,
					input.incidentId,
					causeReference.value,
				);
				if (!causeNodeId) {
					return { code: "UNRESOLVED_OPERATION_REFERENCE", ok: false };
				}
				if (payload.parentId !== undefined) {
					const parentReference = resolveOperationReference(
						payload.parentId,
						input.operationRecordMap,
					);
					if (!parentReference.ok) {
						return { code: "UNRESOLVED_OPERATION_REFERENCE", ok: false };
					}
					const reparent = await reparentCauseNode(
						tx,
						input.incidentId,
						causeNodeId,
						parentReference.value,
					);
					if (!reparent.ok) {
						return reparent;
					}
				}
				const statement = editedText ?? cleanText(payload.statement);
				await tx.$executeRaw`
					UPDATE incident_cause_node
					SET statement = COALESCE(${statement}, statement),
						is_root_cause = COALESCE(${payload.isRootCause ?? null}, is_root_cause),
						branch_status = COALESCE(${payload.branchStatus ?? null}, branch_status),
						updated_at = CURRENT_TIMESTAMP
					WHERE id = ${causeNodeId}::uuid
						AND case_id = ${input.incidentId}::uuid
				`;
				return {
					appliedKind: input.operation.kind,
					ok: true,
					recordId: causeNodeId,
				};
			}

			case AgentOperationKind.StopAction: {
				const payload = input.operation.payload;
				const linkedCauseReference = resolveOperationReference(
					payload.linkedCauseNodeId,
					input.operationRecordMap,
				);
				if (!linkedCauseReference.ok) {
					return { code: "UNRESOLVED_OPERATION_REFERENCE", ok: false };
				}
				const causeNodeId = linkedCauseReference.value
					? await existingCauseNodeId(
							tx,
							input.incidentId,
							linkedCauseReference.value,
						)
					: await soleCauseNodeId(tx, input.incidentId);
				if (linkedCauseReference.value && !causeNodeId) {
					return { code: "UNRESOLVED_OPERATION_REFERENCE", ok: false };
				}
				// No link given and the case has zero or several causes: the
				// target is ambiguous, so demand an explicit link rather than
				// silently attaching the measure to an arbitrary cause.
				if (!causeNodeId) {
					return { code: "CAUSE_NODE_REQUIRED", ok: false };
				}
				const description = editedText ?? payload.title;
				const owner = cleanText(payload.owner);
				const dueDate = parseDueDate(payload.dueDate);
				const actionType = actionTypeForStopClass(payload.stopClass);
				// Same-cause measure de-duplication: the coach often proposes an
				// early, ownerless measure and then a refined owner+dated version of
				// the SAME measure on the same cause, and accepting both leaves two
				// near-identical rows (the live bug). If an existing action on this
				// exact cause is a near-duplicate (high token-overlap, see
				// isNearDuplicateAction), update that row in place — adopting the
				// refined wording and back-filling owner/due-date/action-type only
				// where the new op supplies a value the old row was missing — and
				// return its id instead of inserting a second row. Comparison is
				// strictly within one cause and uses a high threshold; when in doubt
				// we insert, since a false split is far less harmful than merging two
				// genuinely different measures. Serialize per case with the same
				// advisory lock the cause paths use so concurrent applies on one case
				// see each other's rows.
				await tx.$queryRaw`
					SELECT pg_advisory_xact_lock(hashtextextended(${input.incidentId}, 0))::text
				`;
				const duplicateActionId = await nearDuplicateActionId(
					tx,
					causeNodeId,
					description,
				);
				if (duplicateActionId) {
					await tx.$executeRaw`
						UPDATE incident_cause_action
						SET description = ${description},
							owner_role = CASE
								WHEN btrim(COALESCE(owner_role, '')) = '' THEN ${owner}
								ELSE owner_role
							END,
							due_date = COALESCE(due_date, ${dueDate}::date),
							action_type = CASE
								WHEN action_type IS NULL THEN ${actionType}::incident_action_type
								ELSE action_type
							END,
							updated_at = CURRENT_TIMESTAMP
						WHERE id = ${duplicateActionId}::uuid
							AND cause_node_id = ${causeNodeId}::uuid
					`;
					await syncIncidentActionBridge(tx, {
						actionId: duplicateActionId,
						incidentId: input.incidentId,
						tenantId: input.tenantId,
					});
					return {
						appliedKind: input.operation.kind,
						ok: true,
						recordId: duplicateActionId,
					};
				}
				const recordId = randomUUID();
				const orderIndex = await nextActionOrderIndex(tx, causeNodeId);
				await tx.$executeRaw`
					INSERT INTO incident_cause_action (
						id,
						cause_node_id,
						order_index,
						description,
						owner_role,
						due_date,
						action_type,
						status
					) VALUES (
						${recordId}::uuid,
						${causeNodeId}::uuid,
						${orderIndex},
						${description},
						${owner},
						${dueDate}::date,
						${actionType}::incident_action_type,
						'OPEN'::incident_action_status
					)
				`;
				await syncIncidentActionBridge(tx, {
					actionId: recordId,
					incidentId: input.incidentId,
					tenantId: input.tenantId,
				});
				return { appliedKind: input.operation.kind, ok: true, recordId };
			}

			case AgentOperationKind.IncidentFieldUpdate:
				return applyIncidentFieldUpdate(
					tx,
					input.incidentId,
					input.operation.payload,
					editedText,
					input.operation.kind,
				);

			case AgentOperationKind.HiraFollowupNote: {
				const text = editedText ?? input.operation.payload.note;
				await tx.$executeRaw`
					UPDATE incident_case
					SET hira_followup_needed = true,
						hira_followup_text = ${text},
						updated_at = CURRENT_TIMESTAMP
					WHERE id = ${input.incidentId}::uuid
				`;
				return {
					appliedKind: input.operation.kind,
					ok: true,
					recordId: input.incidentId,
				};
			}

			case AgentOperationKind.OutputSectionDraft:
				return { code: "OUTPUT_DRAFT_NOT_PERSISTED", ok: false };

			default:
				return { code: "UNSUPPORTED_OPERATION", ok: false };
		}
	});
}

type Tx = Parameters<Parameters<typeof withTenantConnection>[1]>[0];

const nullableTextFieldColumns: Partial<
	Record<AgentIncidentFieldUpdatePayload["field"], string>
> = {
	areaText: "area_text",
	bodyPart: "body_part",
	coordinatorName: "coordinator_name",
	departmentText: "department_text",
	immediateCause: "immediate_cause",
	incidentTimeNote: "incident_time_note",
	injuryNature: "injury_nature",
	location: "location",
	potentialOutcomeText: "potential_outcome_text",
	processInvolved: "process_involved",
	shiftText: "shift_text",
	workActivity: "work_activity",
};

const workTypeCodes = new Set([
	"MAINTENANCE",
	"OPERATIONS",
	"CLEANING",
	"LOGISTICS",
	"CONSTRUCTION",
	"OFFICE",
	"OTHER",
]);
const eventTypeCodes = new Set<string>(EVENT_TYPE_CODES);
const controlFailureCodes = new Set([
	"MISSING",
	"INADEQUATE",
	"BYPASSED",
	"NOT_USED",
	"UNKNOWN",
]);
const hazardCategoryCodes = new Set<string>(HAZARD_CATEGORY_CODES);

async function applyIncidentFieldUpdate(
	tx: Tx,
	incidentId: string,
	payload: AgentIncidentFieldUpdatePayload,
	editedText: string | null,
	appliedKind: AgentStructuredOperation["kind"],
): Promise<IncidentCoachApplyResult> {
	const rawValue = editedText ?? payload.value;
	const text =
		typeof rawValue === "string"
			? rawValue.trim()
			: typeof rawValue === "number"
				? String(rawValue)
				: "";
	const applied: IncidentCoachApplyResult = {
		appliedKind,
		ok: true,
		recordId: incidentId,
	};
	const invalid: IncidentCoachApplyResult = {
		code: "INVALID_FIELD_VALUE",
		ok: false,
	};

	const simpleColumn = Object.hasOwn(nullableTextFieldColumns, payload.field)
		? nullableTextFieldColumns[payload.field]
		: undefined;
	if (simpleColumn) {
		await updateColumn(tx, incidentId, simpleColumn, text || null);
		return applied;
	}

	switch (payload.field) {
		case "title": {
			if (!text) {
				return invalid;
			}
			await updateColumn(tx, incidentId, "title", text);
			return applied;
		}

		case "incidentType": {
			const incidentType = parseIncidentType(text);
			if (!incidentType) {
				return invalid;
			}
			await tx.$executeRawUnsafe(
				"UPDATE incident_case SET incident_type = $1::incident_type, updated_at = CURRENT_TIMESTAMP WHERE id = $2::uuid",
				incidentType,
				incidentId,
			);
			return applied;
		}

		case "actualInjuryOutcome": {
			const outcome = parseActualInjuryOutcome(text);
			if (!outcome) {
				return invalid;
			}
			const derivedSeverity = deriveActualSeverityFromOutcome(outcome);
			await tx.$executeRawUnsafe(
				"UPDATE incident_case SET actual_injury_outcome = $1::incident_actual_injury_outcome, actual_severity_code = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3::uuid",
				outcome,
				derivedSeverity,
				incidentId,
			);
			return applied;
		}

		case "potentialSeverityCode": {
			const severity = parsePotentialSeverity(text);
			if (!severity) {
				return invalid;
			}
			await tx.$executeRawUnsafe(
				"UPDATE incident_case SET potential_severity_code = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2::uuid",
				severity,
				incidentId,
			);
			await recomputePotentialRiskBand(tx, incidentId);
			return applied;
		}

		case "potentialLikelihoodCode": {
			const likelihood = parsePotentialLikelihood(text);
			if (!likelihood) {
				return invalid;
			}
			await tx.$executeRawUnsafe(
				"UPDATE incident_case SET potential_likelihood_code = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2::uuid",
				likelihood,
				incidentId,
			);
			await recomputePotentialRiskBand(tx, incidentId);
			return applied;
		}

		case "hazardCategoryCode": {
			if (text && !hazardCategoryCodes.has(text)) {
				return invalid;
			}
			await updateColumn(tx, incidentId, "hazard_category_code", text || null);
			return applied;
		}

		case "workType": {
			if (text && !workTypeCodes.has(text)) {
				return invalid;
			}
			await updateColumn(tx, incidentId, "work_type", text || null);
			return applied;
		}

		case "eventType": {
			if (text && !eventTypeCodes.has(text)) {
				return invalid;
			}
			await updateColumn(tx, incidentId, "event_type", text || null);
			return applied;
		}

		case "controlFailure": {
			if (text && !controlFailureCodes.has(text)) {
				return invalid;
			}
			await updateColumn(tx, incidentId, "control_failure", text || null);
			return applied;
		}

		case "lostDays": {
			if (!text) {
				await tx.$executeRawUnsafe(
					"UPDATE incident_case SET lost_days = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1::uuid",
					incidentId,
				);
				return applied;
			}
			const lostDays = Number(text);
			if (!Number.isInteger(lostDays) || lostDays < 0) {
				return invalid;
			}
			await tx.$executeRawUnsafe(
				"UPDATE incident_case SET lost_days = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2::uuid",
				lostDays,
				incidentId,
			);
			return applied;
		}

		case "incidentAt": {
			if (!text) {
				return invalid;
			}
			const incidentAt = new Date(text);
			if (Number.isNaN(incidentAt.getTime())) {
				return invalid;
			}
			await tx.$executeRawUnsafe(
				"UPDATE incident_case SET incident_at = $1::timestamptz, updated_at = CURRENT_TIMESTAMP WHERE id = $2::uuid",
				incidentAt.toISOString(),
				incidentId,
			);
			return applied;
		}

		default:
			return { code: "UNSUPPORTED_OPERATION", ok: false };
	}
}

/**
 * Re-parents a cause node within its case. Serialized per case with an
 * advisory lock and guarded by a terminating ancestor walk so concurrent
 * moves cannot persist a cycle.
 */
async function reparentCauseNode(
	tx: Tx,
	incidentId: string,
	causeNodeId: string,
	newParentId: string | null,
): Promise<{ ok: true } | Extract<IncidentCoachApplyResult, { ok: false }>> {
	if (newParentId === causeNodeId) {
		return { code: "UNRESOLVED_OPERATION_REFERENCE", ok: false };
	}

	await tx.$queryRaw`
		SELECT pg_advisory_xact_lock(hashtextextended(${incidentId}, 0))::text
	`;

	if (newParentId) {
		const ancestors = await tx.$queryRaw<Array<{ id: string }>>`
			WITH RECURSIVE ancestor AS (
				SELECT id, parent_id
				FROM incident_cause_node
				WHERE id = ${newParentId}::uuid
					AND case_id = ${incidentId}::uuid
				UNION
				SELECT node.id, node.parent_id
				FROM incident_cause_node node
				JOIN ancestor ON node.id = ancestor.parent_id
				WHERE node.case_id = ${incidentId}::uuid
			)
			SELECT id::text AS id
			FROM ancestor
		`;

		if (ancestors.length === 0) {
			return { code: "UNRESOLVED_OPERATION_REFERENCE", ok: false };
		}

		if (
			ancestors.some(
				(ancestor) => ancestor.id.toLowerCase() === causeNodeId.toLowerCase(),
			)
		) {
			return { code: "UNRESOLVED_OPERATION_REFERENCE", ok: false };
		}
	}

	await tx.$executeRaw`
		UPDATE incident_cause_node
		SET parent_id = ${newParentId}::uuid,
			updated_at = CURRENT_TIMESTAMP
		WHERE id = ${causeNodeId}::uuid
			AND case_id = ${incidentId}::uuid
	`;

	return { ok: true };
}

async function recomputePotentialRiskBand(
	tx: Tx,
	incidentId: string,
): Promise<void> {
	const rows = await tx.$queryRaw<
		Array<{ severity: string | null; likelihood: string | null }>
	>`
		SELECT
			potential_severity_code AS severity,
			potential_likelihood_code AS likelihood
		FROM incident_case
		WHERE id = ${incidentId}::uuid
		LIMIT 1
	`;
	const row = rows[0];
	const severity = parsePotentialSeverity(row?.severity ?? "");
	const likelihood = parsePotentialLikelihood(row?.likelihood ?? "");
	const band =
		severity && likelihood
			? computePotentialRiskBand(severity, likelihood)
			: null;

	await tx.$executeRawUnsafe(
		"UPDATE incident_case SET potential_risk_band = $1 WHERE id = $2::uuid",
		band,
		incidentId,
	);
}

async function updateColumn(
	tx: Tx,
	incidentId: string,
	column: string,
	value: string | null,
): Promise<void> {
	await tx.$executeRawUnsafe(
		`UPDATE incident_case SET ${column} = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2::uuid`,
		value,
		incidentId,
	);
}

async function accountIdForFactOperation(
	tx: Tx,
	incidentId: string,
	operation: Extract<
		AgentStructuredOperation,
		{ kind: typeof AgentOperationKind.Fact }
	>,
): Promise<string | null> {
	// Attribute ONLY when the coach explicitly names an account source. A fact
	// with no source is a case-level statement (account_id stays null) — we no
	// longer auto-attach to "the sole account", which silently put general facts
	// in one person's mouth.
	const sourceAccountId = operation.sourceRefs.find(
		(ref) => ref.type === "incident_account" && isUuid(ref.id),
	)?.id;

	if (!sourceAccountId) {
		return null;
	}

	const rows = await tx.$queryRaw<Array<{ id: string }>>`
		SELECT id::text AS id
		FROM incident_account
		WHERE id = ${sourceAccountId}::uuid
			AND case_id = ${incidentId}::uuid
		LIMIT 1
	`;
	return rows[0]?.id ?? null;
}

/**
 * The cause id to attach an UNLINKED action to — but ONLY when the case has
 * exactly one cause, so the link is unambiguous. With zero or several causes a
 * missing link is genuinely ambiguous: returning null makes the caller demand
 * an explicit linkedCauseNodeId instead of silently attaching to "the first"
 * cause (which lands the measure on the wrong cause). The coach prompt already
 * requires every action to name its cause; this is the backstop, not a guess.
 */
async function soleCauseNodeId(
	tx: Tx,
	incidentId: string,
): Promise<string | null> {
	const rows = await tx.$queryRaw<Array<{ id: string }>>`
		SELECT id::text AS id
		FROM incident_cause_node
		WHERE case_id = ${incidentId}::uuid
		ORDER BY order_index ASC, created_at ASC, id ASC
		LIMIT 2
	`;
	return rows.length === 1 ? (rows[0]?.id ?? null) : null;
}

async function existingCauseNodeId(
	tx: Tx,
	incidentId: string,
	candidateId: string | null | undefined,
): Promise<string | null> {
	if (!isUuid(candidateId ?? null)) {
		return null;
	}

	const rows = await tx.$queryRaw<Array<{ id: string }>>`
		SELECT id::text AS id
		FROM incident_cause_node
		WHERE id = ${candidateId}::uuid
			AND case_id = ${incidentId}::uuid
		LIMIT 1
	`;
	return rows[0]?.id ?? null;
}

/**
 * Find an existing cause node in this case whose statement matches `candidate`
 * after normalization (trim + collapse internal whitespace + case-insensitive).
 * Used to no-op duplicate cause_node inserts. The same normalization is applied
 * on both sides in SQL — `lower(btrim(regexp_replace(text, '[[:space:]]+', ' ',
 * 'g')))` — using a POSIX bracket class rather than `\s` so it does not depend
 * on the regex-escape mode. Returns the earliest matching node so re-parenting
 * wires against the original.
 */
async function existingCauseNodeIdByStatement(
	tx: Tx,
	incidentId: string,
	candidate: string | null | undefined,
): Promise<string | null> {
	const normalized = normalizeCauseStatement(candidate);
	if (!normalized) {
		return null;
	}

	const rows = await tx.$queryRaw<Array<{ id: string }>>`
		SELECT id::text AS id
		FROM incident_cause_node
		WHERE case_id = ${incidentId}::uuid
			AND lower(btrim(regexp_replace(statement, '[[:space:]]+', ' ', 'g'))) = ${normalized}
		ORDER BY order_index ASC, created_at ASC, id ASC
		LIMIT 1
	`;
	return rows[0]?.id ?? null;
}

/**
 * Normalize a cause statement for duplicate comparison: trim, collapse internal
 * whitespace runs to a single space, and lower-case. Mirrors the SQL expression
 * in existingCauseNodeIdByStatement so JS and Postgres agree on equivalence.
 */
function normalizeCauseStatement(
	value: string | null | undefined,
): string | null {
	const text = value?.replace(/\s+/g, " ").trim().toLowerCase();
	return text ? text : null;
}

/**
 * High threshold for treating two measures as the same. Jaccard similarity of
 * their normalized word sets must be at least this for an UPDATE-in-place rather
 * than a second row. 0.6 is deliberately conservative: a reworded refinement of
 * one measure ("Install bracket" → "Install a fixed charger bracket by the
 * door") clears it, while two genuinely different measures on the same cause stay
 * well below it. When in doubt we insert — a false split is far less harmful than
 * merging two distinct controls.
 */
export const ACTION_DEDUP_JACCARD_THRESHOLD = 0.6;

/**
 * Tokenize a measure description for near-duplicate comparison: lower-case, split
 * on any non-alphanumeric run, drop empties. Returns a Set of distinct word
 * tokens (word-set semantics — repetition does not change similarity).
 */
export function actionDescriptionTokens(
	value: string | null | undefined,
): ReadonlySet<string> {
	// Unicode-aware: this is a 4-language product (DE/FR/EN/IT). Splitting on
	// ASCII-only would shatter accented words (é, ü, à, ô…) into junk fragments,
	// inflating false similarity. Split on Unicode non-alphanumerics instead.
	const tokens = (value ?? "")
		.normalize("NFC")
		.toLowerCase()
		.split(/[^\p{L}\p{N}]+/u)
		.filter((token) => token.length > 0);
	return new Set(tokens);
}

/**
 * Jaccard similarity (|intersection| / |union|) of the two descriptions' word
 * sets, in [0, 1]. Two empty descriptions are treated as fully dissimilar (0) so
 * blank text never triggers a merge.
 */
export function actionSimilarity(
	a: string | null | undefined,
	b: string | null | undefined,
): number {
	const left = actionDescriptionTokens(a);
	const right = actionDescriptionTokens(b);
	if (left.size === 0 || right.size === 0) {
		return 0;
	}
	let intersection = 0;
	for (const token of left) {
		if (right.has(token)) {
			intersection += 1;
		}
	}
	const union = left.size + right.size - intersection;
	return union === 0 ? 0 : intersection / union;
}

/**
 * Whether two measure descriptions are near-duplicates of each other — i.e. the
 * second is a reworded refinement of the first rather than a distinct measure.
 * Pure so the dedup decision can be unit-tested without a database.
 */
export function isNearDuplicateAction(
	a: string | null | undefined,
	b: string | null | undefined,
): boolean {
	return actionSimilarity(a, b) >= ACTION_DEDUP_JACCARD_THRESHOLD;
}

/**
 * Find an existing action on the SAME cause whose description is a near-duplicate
 * of `candidate` (see isNearDuplicateAction). Compares only within the one cause,
 * picks the best (highest-similarity) match, and breaks ties toward the earliest
 * row so a refinement folds into the original. Returns null when nothing clears
 * the threshold, so the caller inserts a fresh row.
 */
async function nearDuplicateActionId(
	tx: Tx,
	causeNodeId: string,
	candidate: string | null | undefined,
): Promise<string | null> {
	if (actionDescriptionTokens(candidate).size === 0) {
		return null;
	}

	// SAFETY GATE: only ever fold a new measure into an existing row that looks
	// like an UNFINISHED earlier proposal — one still missing an owner or a due
	// date. That is exactly the bug pattern (early ownerless measure → refined
	// owner+dated version). A genuinely-different, FINISHED measure (owner AND
	// due date set) can never be a merge target, so we cannot silently destroy a
	// complete distinct control even if the wording happens to look similar.
	const rows = await tx.$queryRaw<
		Array<{ id: string; description: string | null }>
	>`
		SELECT id::text AS id, description
		FROM incident_cause_action
		WHERE cause_node_id = ${causeNodeId}::uuid
			AND (btrim(COALESCE(owner_role, '')) = '' OR due_date IS NULL)
		ORDER BY order_index ASC, created_at ASC, id ASC
	`;

	let bestId: string | null = null;
	let bestScore = 0;
	for (const row of rows) {
		const score = actionSimilarity(candidate, row.description);
		if (score >= ACTION_DEDUP_JACCARD_THRESHOLD && score > bestScore) {
			bestScore = score;
			bestId = row.id;
		}
	}
	return bestId;
}

async function nextFactOrderIndex(tx: Tx, incidentId: string): Promise<number> {
	const rows = await tx.$queryRaw<Array<{ orderIndex: number }>>`
		SELECT COALESCE(MAX(order_index) + 1, 0)::int AS "orderIndex"
		FROM incident_fact
		WHERE case_id = ${incidentId}::uuid
	`;
	return rows[0]?.orderIndex ?? 0;
}

async function nextTimelineOrderIndex(
	tx: Tx,
	incidentId: string,
): Promise<number> {
	const rows = await tx.$queryRaw<Array<{ orderIndex: number }>>`
		SELECT COALESCE(MAX(order_index) + 1, 0)::int AS "orderIndex"
		FROM incident_timeline_event
		WHERE case_id = ${incidentId}::uuid
	`;
	return rows[0]?.orderIndex ?? 0;
}

async function nextCauseOrderIndex(
	tx: Tx,
	incidentId: string,
): Promise<number> {
	const rows = await tx.$queryRaw<Array<{ orderIndex: number }>>`
		SELECT COALESCE(MAX(order_index) + 1, 0)::int AS "orderIndex"
		FROM incident_cause_node
		WHERE case_id = ${incidentId}::uuid
	`;
	return rows[0]?.orderIndex ?? 0;
}

async function nextActionOrderIndex(
	tx: Tx,
	causeNodeId: string,
): Promise<number> {
	const rows = await tx.$queryRaw<Array<{ orderIndex: number }>>`
		SELECT COALESCE(MAX(order_index) + 1, 0)::int AS "orderIndex"
		FROM incident_cause_action
		WHERE cause_node_id = ${causeNodeId}::uuid
	`;
	return rows[0]?.orderIndex ?? 0;
}

function phaseLabel(phase: "before" | "event" | "after"): string {
	if (phase === "before") {
		return "Before";
	}

	if (phase === "after") {
		return "After";
	}

	return "Event";
}

function actionTypeForStopClass(
	stopClass: "S" | "T" | "O" | "P",
): "SUBSTITUTION" | "TECHNICAL" | "ORGANIZATIONAL" | "PPE" {
	if (stopClass === "S") {
		return "SUBSTITUTION";
	}

	if (stopClass === "T") {
		return "TECHNICAL";
	}

	if (stopClass === "P") {
		return "PPE";
	}

	return "ORGANIZATIONAL";
}

function cleanText(value: string | null | undefined): string | null {
	const text = value?.trim();
	return text ? text : null;
}

function parseDueDate(value: string | null | undefined): string | null {
	const text = value?.trim();

	if (!text) {
		return null;
	}

	const parsed = new Date(text);

	if (Number.isNaN(parsed.getTime())) {
		return null;
	}

	return parsed.toISOString().slice(0, 10);
}

type OperationReferenceResolution =
	| { readonly ok: true; readonly value: string | null }
	| { readonly ok: false };

function resolveOperationReference(
	value: string | null | undefined,
	operationRecordMap: Readonly<Record<string, string>> | undefined,
): OperationReferenceResolution {
	if (!value) {
		return { ok: true, value: null };
	}

	if (isUuid(value ?? null)) {
		return { ok: true, value };
	}

	const mapped = operationRecordMap?.[value] ?? null;
	if (!isUuid(mapped ?? null)) {
		return { ok: false };
	}

	return { ok: true, value: mapped };
}

function isUuid(value: string | null | undefined): value is string {
	return (
		typeof value === "string" &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			value,
		)
	);
}
