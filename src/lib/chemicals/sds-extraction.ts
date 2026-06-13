import { randomUUID } from "node:crypto";
import { withTenantConnection } from "../db/tenancy";
import {
	type DispatchOptions,
	type DispatchResult,
	dispatch,
} from "../llm/dispatch";
import { KindEnum, type LLMTextRequest } from "../llm/types";
import {
	type ChemicalControlReviewStatus,
	type ChemicalControlType,
	isChemicalControlType,
	prepareChemicalControlForStorage,
} from "./chemical-control";
import { getChemicalProfileDetail } from "./queries";

export const SDS_EXTRACTION_PROMPT_PURPOSE = "chemical.sds.extract-controls";

export type SdsExtractionDraft = {
	readonly controlType: ChemicalControlType;
	readonly controlText: string;
	readonly sdsSection: string;
	readonly sourceExcerpt: string;
	readonly pageLineRef: string | null;
	readonly extractionConfidence: number | null;
};

export type SdsExtractionDispatch = (
	req: LLMTextRequest,
	options?: DispatchOptions,
) => Promise<DispatchResult>;

export type ExtractSdsControlsInput = {
	readonly tenantId: string;
	readonly userId: string;
	readonly profileId: string;
	readonly sourceFilename: string;
	readonly sourceStoragePath: string;
	readonly sdsText: string;
	readonly locale: string;
	readonly dispatchSdsExtraction?: SdsExtractionDispatch;
	readonly dispatchOptions?: DispatchOptions;
};

export type ReviewSdsControlInput = {
	readonly tenantId: string;
	readonly userId: string;
	readonly profileId: string;
	readonly controlId: string;
	readonly decision: Exclude<ChemicalControlReviewStatus, "pending">;
	readonly now?: Date;
};

export class SdsExtractionError extends Error {
	readonly code:
		| "chemical_profile_not_found"
		| "invalid_sds_text"
		| "llm_extraction_failed"
		| "invalid_sds_extraction_response"
		| "sds_control_not_found"
		| "invalid_sds_review_decision";

	constructor(
		code:
			| "chemical_profile_not_found"
			| "invalid_sds_text"
			| "llm_extraction_failed"
			| "invalid_sds_extraction_response"
			| "sds_control_not_found"
			| "invalid_sds_review_decision",
		message: string,
	) {
		super(message);
		this.code = code;
		this.name = new.target.name;
	}
}

export async function extractSdsControls(input: ExtractSdsControlsInput) {
	const profile = await getChemicalProfileDetail(
		input.tenantId,
		input.profileId,
	);
	if (!profile) {
		throw new SdsExtractionError(
			"chemical_profile_not_found",
			"Chemical profile was not found for this tenant.",
		);
	}

	const sdsText = normalizeSdsText(input.sdsText);
	const req: LLMTextRequest = {
		options: {
			kind: KindEnum.Authoring,
			locale: input.locale,
			promptPurpose: SDS_EXTRACTION_PROMPT_PURPOSE,
			requiresVision: false,
			tenantId: input.tenantId,
			userId: input.userId,
			workflowId: input.profileId,
		},
		prompt: buildSdsExtractionPrompt({
			productName: profile.productName,
			sdsText,
		}),
	};
	const result = await (input.dispatchSdsExtraction ?? dispatch)(
		req,
		input.dispatchOptions,
	);

	if (!result.ok) {
		throw new SdsExtractionError(
			"llm_extraction_failed",
			`SDS extraction failed: ${result.code}.`,
		);
	}

	const drafts = parseSdsExtractionResponse(result.response.text);
	const modelMarker = [
		result.response.provider ?? "unknown-provider",
		result.response.model ?? "unknown-model",
	].join(":");

	await insertDraftControls({
		drafts,
		modelMarker,
		profileId: input.profileId,
		sourceFilename: input.sourceFilename,
		sourceStoragePath: input.sourceStoragePath,
		tenantId: input.tenantId,
		userId: input.userId,
	});

	const updated = await getChemicalProfileDetail(
		input.tenantId,
		input.profileId,
	);
	if (!updated) {
		throw new SdsExtractionError(
			"chemical_profile_not_found",
			"Chemical profile disappeared after SDS extraction.",
		);
	}

	return updated;
}

export async function reviewSdsExtractedControl(input: ReviewSdsControlInput) {
	if (!["approved", "rejected"].includes(input.decision)) {
		throw new SdsExtractionError(
			"invalid_sds_review_decision",
			"SDS review decision must be approved or rejected.",
		);
	}

	const reviewedAt = input.now ?? new Date();
	const updated = await withTenantConnection(input.tenantId, async (tx) => {
		const rows = await tx.$queryRaw<Array<{ id: string }>>`
			SELECT control.id::text
			FROM chemical_control control
			INNER JOIN chemical_profile profile
				ON profile.id = control.chemical_profile_id
				AND profile.storage_path = control.source_storage_path
			WHERE control.id = ${input.controlId}::uuid
				AND control.chemical_profile_id = ${input.profileId}::uuid
				AND control.source_provenance = 'sds_extraction'::chemical_control_source_provenance
				AND control.review_status = 'pending'::chemical_control_review_status
			LIMIT 1
		`;

		if (!rows[0]) {
			return false;
		}

		await tx.$executeRaw`
			UPDATE chemical_control control
			SET review_status = ${input.decision}::chemical_control_review_status,
				reviewed_by_user_id = ${input.userId}::uuid,
				reviewed_at = ${reviewedAt}::timestamptz,
				updated_at = CURRENT_TIMESTAMP
			FROM chemical_profile profile
			WHERE control.id = ${input.controlId}::uuid
				AND control.chemical_profile_id = profile.id
				AND profile.id = ${input.profileId}::uuid
				AND profile.storage_path = control.source_storage_path
				AND control.source_provenance = 'sds_extraction'::chemical_control_source_provenance
				AND control.review_status = 'pending'::chemical_control_review_status
		`;

		const stats = await tx.$queryRaw<
			Array<{ pendingCount: number; approvedCount: number }>
		>`
			SELECT
				count(*) FILTER (WHERE review_status = 'pending')::integer AS "pendingCount",
				count(*) FILTER (WHERE review_status = 'approved')::integer AS "approvedCount"
			FROM chemical_control control
			INNER JOIN chemical_profile profile
				ON profile.id = control.chemical_profile_id
				AND profile.storage_path = control.source_storage_path
			WHERE control.chemical_profile_id = ${input.profileId}::uuid
				AND control.source_provenance = 'sds_extraction'::chemical_control_source_provenance
		`;
		const nextStatus =
			Number(stats[0]?.pendingCount ?? 0) > 0
				? "review_required"
				: Number(stats[0]?.approvedCount ?? 0) > 0
					? "approved"
					: "extracted";

		await tx.$executeRaw`
			UPDATE chemical_profile
			SET extraction_status = ${nextStatus}::chemical_profile_extraction_status,
				sds_reviewed = (${nextStatus} = 'approved'),
				sds_reviewed_by_user_id = CASE WHEN ${nextStatus} = 'approved' THEN ${input.userId}::uuid ELSE sds_reviewed_by_user_id END,
				sds_reviewed_at = CASE WHEN ${nextStatus} = 'approved' THEN ${reviewedAt}::timestamptz ELSE sds_reviewed_at END,
				updated_at = CURRENT_TIMESTAMP
			WHERE id = ${input.profileId}::uuid
		`;

		return true;
	});

	if (!updated) {
		throw new SdsExtractionError(
			"sds_control_not_found",
			"SDS-extracted control was not found for this chemical profile.",
		);
	}

	const profile = await getChemicalProfileDetail(
		input.tenantId,
		input.profileId,
	);
	if (!profile) {
		throw new SdsExtractionError(
			"chemical_profile_not_found",
			"Chemical profile disappeared after SDS review.",
		);
	}

	return profile;
}

export function buildSdsExtractionPrompt(input: {
	readonly productName: string;
	readonly sdsText: string;
}): string {
	return [
		"Extract workplace safety controls from the following SDS text.",
		"Return JSON only with this shape:",
		'{"controls":[{"controlType":"use_control|ppe|glove_type|eye_protection|respiratory|environmental|storage|handling|first_aid|fire_fighting|spill_response","controlText":"...","sdsSection":"Section number and title","sourceExcerpt":"short verbatim SDS excerpt","pageLineRef":"page/line if available","confidence":0.0}]}',
		"Do not invent controls that are not supported by the SDS excerpt.",
		`Product: ${input.productName}`,
		"SDS text:",
		input.sdsText,
	].join("\n\n");
}

export function parseSdsExtractionResponse(
	responseText: string,
): readonly SdsExtractionDraft[] {
	const jsonText = extractJsonObject(responseText);
	let parsed: unknown;

	try {
		parsed = JSON.parse(jsonText);
	} catch (error) {
		throw new SdsExtractionError(
			"invalid_sds_extraction_response",
			`SDS extraction response was not JSON: ${(error as Error).message}`,
		);
	}

	const controls = record(parsed).controls;
	if (!Array.isArray(controls) || controls.length === 0) {
		throw new SdsExtractionError(
			"invalid_sds_extraction_response",
			"SDS extraction response must contain at least one control.",
		);
	}

	return controls.map((control, index) => normalizeDraft(control, index));
}

async function insertDraftControls(input: {
	readonly tenantId: string;
	readonly profileId: string;
	readonly sourceFilename: string;
	readonly sourceStoragePath: string;
	readonly modelMarker: string;
	readonly drafts: readonly SdsExtractionDraft[];
	readonly userId: string;
}): Promise<void> {
	await withTenantConnection(input.tenantId, async (tx) => {
		const profileRows = await tx.$queryRaw<Array<{ id: string }>>`
			SELECT id::text
			FROM chemical_profile
			WHERE id = ${input.profileId}::uuid
			FOR UPDATE
		`;

		if (!profileRows[0]) {
			throw new SdsExtractionError(
				"chemical_profile_not_found",
				"Chemical profile was not found for this tenant.",
			);
		}

		const sortRows = await tx.$queryRaw<Array<{ nextSortOrder: number }>>`
			SELECT COALESCE(max(sort_order) + 1, 0)::integer AS "nextSortOrder"
			FROM chemical_control
			WHERE chemical_profile_id = ${input.profileId}::uuid
		`;
		const baseSortOrder = Number(sortRows[0]?.nextSortOrder ?? 0);

		await tx.$executeRaw`
			UPDATE chemical_control
			SET review_status = 'rejected'::chemical_control_review_status,
				reviewed_by_user_id = ${input.userId}::uuid,
				reviewed_at = CURRENT_TIMESTAMP,
				updated_at = CURRENT_TIMESTAMP
			WHERE chemical_profile_id = ${input.profileId}::uuid
				AND source_provenance = 'sds_extraction'::chemical_control_source_provenance
				AND review_status <> 'rejected'::chemical_control_review_status
		`;

		for (const [index, draft] of input.drafts.entries()) {
			const controlId = randomUUID();
			const record = prepareChemicalControlForStorage({
				chemicalProfileId: input.profileId,
				controlText: draft.controlText,
				controlType: draft.controlType,
				extractionConfidence: draft.extractionConfidence,
				extractionModelMarker: input.modelMarker,
				pageLineRef: draft.pageLineRef,
				reviewStatus: "pending",
				sdsSection: draft.sdsSection,
				sortOrder: baseSortOrder + index,
				sourceExcerpt: draft.sourceExcerpt,
				sourceFilename: input.sourceFilename,
				sourceProvenance: "sds_extraction",
				sourceStoragePath: input.sourceStoragePath,
				tenantId: input.tenantId,
			});

			await tx.$executeRaw`
				INSERT INTO chemical_control (
					id,
					chemical_profile_id,
					control_type,
					control_text,
					source_provenance,
					review_status,
					sort_order,
					sds_section,
					source_excerpt,
					page_line_ref,
					source_filename,
					source_storage_path,
					extraction_model_marker,
					extraction_confidence
				) VALUES (
					${controlId}::uuid,
					${record.chemicalProfileId}::uuid,
					${record.controlType}::chemical_control_type,
					${record.controlText},
					${record.sourceProvenance}::chemical_control_source_provenance,
					${record.reviewStatus}::chemical_control_review_status,
					${record.sortOrder},
					${record.sdsSection},
					${record.sourceExcerpt},
					${record.pageLineRef},
					${record.sourceFilename},
					${record.sourceStoragePath},
					${record.extractionModelMarker},
					${record.extractionConfidence}
				)
			`;
		}

		await tx.$executeRaw`
			UPDATE chemical_profile
			SET storage_path = ${input.sourceStoragePath},
				extraction_status = 'review_required'::chemical_profile_extraction_status,
				sds_reviewed = false,
				sds_reviewed_by_user_id = NULL,
				sds_reviewed_at = NULL,
				updated_at = CURRENT_TIMESTAMP
			WHERE id = ${input.profileId}::uuid
		`;
	});
}

function normalizeSdsText(value: string): string {
	const text = value.trim();
	if (text.length < 20) {
		throw new SdsExtractionError(
			"invalid_sds_text",
			"SDS text for extraction must contain at least 20 characters.",
		);
	}

	return text.slice(0, 40_000);
}

function normalizeDraft(value: unknown, index: number): SdsExtractionDraft {
	const draft = record(value);
	const controlType = stringValue(draft.controlType);
	if (!isChemicalControlType(controlType)) {
		throw new SdsExtractionError(
			"invalid_sds_extraction_response",
			`SDS control ${index + 1} has unsupported controlType.`,
		);
	}

	return {
		controlText: requiredString(draft.controlText, "controlText", index),
		controlType,
		extractionConfidence: nullableConfidence(draft.confidence),
		pageLineRef: nullableString(draft.pageLineRef),
		sdsSection: requiredString(draft.sdsSection, "sdsSection", index),
		sourceExcerpt: requiredString(draft.sourceExcerpt, "sourceExcerpt", index),
	};
}

function requiredString(value: unknown, field: string, index: number): string {
	const text = stringValue(value);
	if (!text) {
		throw new SdsExtractionError(
			"invalid_sds_extraction_response",
			`SDS control ${index + 1} requires ${field}.`,
		);
	}

	return text;
}

function nullableString(value: unknown): string | null {
	const text = stringValue(value);
	return text || null;
}

function nullableConfidence(value: unknown): number | null {
	if (value === null || value === undefined || value === "") {
		return null;
	}

	const confidence = Number(value);
	if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
		throw new SdsExtractionError(
			"invalid_sds_extraction_response",
			"SDS extraction confidence must be between 0 and 1.",
		);
	}

	return confidence;
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function record(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) {
		throw new SdsExtractionError(
			"invalid_sds_extraction_response",
			"SDS extraction response must be an object.",
		);
	}

	return value as Record<string, unknown>;
}

function extractJsonObject(value: string): string {
	const first = value.indexOf("{");
	const last = value.lastIndexOf("}");

	if (first < 0 || last <= first) {
		throw new SdsExtractionError(
			"invalid_sds_extraction_response",
			"SDS extraction response did not contain a JSON object.",
		);
	}

	return value.slice(first, last + 1);
}
