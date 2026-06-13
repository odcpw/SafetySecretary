import { randomUUID } from "node:crypto";
import { withTenantConnection } from "../db/tenancy";
import {
	type ChemicalControlReviewStatus,
	type ChemicalControlType,
	isChemicalControlReviewStatus,
	isChemicalControlType,
} from "./chemical-control";
import {
	type ChemicalProfileExtractionStatus,
	type ChemicalProfileStatus,
	isChemicalProfileExtractionStatus,
	isChemicalProfileStatus,
	prepareChemicalProfileForStorage,
} from "./chemical-profile";

export type ChemicalProfileListFilters = {
	readonly profileStatus?: string | null;
	readonly search?: string | null;
};

export type ChemicalProfileListRow = {
	readonly id: string;
	readonly tenantId: string;
	readonly productName: string;
	readonly manufacturer: string;
	readonly casNumber: string | null;
	readonly unNumber: string | null;
	readonly profileStatus: ChemicalProfileStatus;
	readonly sdsReviewed: boolean;
	readonly sdsReviewedByUserId: string | null;
	readonly sdsReviewedAt: Date | null;
	readonly extractionStatus: ChemicalProfileExtractionStatus;
	readonly storagePath: string | null;
	readonly controlCount: number;
	readonly openReviewCount: number;
	readonly createdAt: Date;
	readonly updatedAt: Date;
};

export type ChemicalProfileDetail = ChemicalProfileListRow & {
	readonly sdsAttachments: readonly ChemicalProfileSdsAttachment[];
	readonly sdsControls: readonly ChemicalProfileSdsControl[];
	readonly controls: readonly ChemicalProfileControlSummary[];
};

export type ChemicalProfileSdsAttachment = {
	readonly fileName: string;
	readonly storagePath: string;
};

export type ChemicalProfileControlSummary = {
	readonly controlType: ChemicalControlType;
	readonly count: number;
	readonly pendingCount: number;
};

export type ChemicalProfileSdsControl = {
	readonly id: string;
	readonly controlType: ChemicalControlType;
	readonly controlText: string;
	readonly reviewStatus: ChemicalControlReviewStatus;
	readonly reviewedByUserId: string | null;
	readonly reviewedAt: Date | null;
	readonly sortOrder: number;
	readonly sdsSection: string;
	readonly sourceExcerpt: string;
	readonly pageLineRef: string | null;
	readonly sourceFilename: string;
	readonly sourceStoragePath: string;
	readonly extractionModelMarker: string;
	readonly extractionConfidence: number | null;
};

type ChemicalProfileRow = {
	id: string;
	tenantId: string;
	productName: string;
	manufacturer: string;
	casNumber: string | null;
	unNumber: string | null;
	profileStatus: string;
	sdsReviewed: boolean;
	sdsReviewedByUserId: string | null;
	sdsReviewedAt: Date | null;
	extractionStatus: string;
	storagePath: string | null;
	controlCount: number | bigint;
	openReviewCount: number | bigint;
	createdAt: Date;
	updatedAt: Date;
};

type ChemicalControlSummaryRow = {
	controlType: string;
	count: number | bigint;
	pendingCount: number | bigint;
};

type ChemicalSdsControlRow = {
	id: string;
	controlType: string;
	controlText: string;
	reviewStatus: string;
	reviewedByUserId: string | null;
	reviewedAt: Date | null;
	sortOrder: number | bigint;
	sdsSection: string | null;
	sourceExcerpt: string | null;
	pageLineRef: string | null;
	sourceFilename: string | null;
	sourceStoragePath: string | null;
	extractionModelMarker: string | null;
	extractionConfidence: number | null;
};

export async function listChemicalProfiles(
	tenantId: string,
	filters: ChemicalProfileListFilters = {},
): Promise<ChemicalProfileListRow[]> {
	const profileStatus = normalizeProfileStatusFilter(filters.profileStatus);
	const search = normalizeSearch(filters.search);

	return withTenantConnection(tenantId, async (tx) => {
		const rows = await tx.$queryRaw<ChemicalProfileRow[]>`
				SELECT
					profile.id::text AS id,
					profile.tenant_id::text AS "tenantId",
					profile.product_name AS "productName",
					profile.manufacturer,
					profile.cas_number AS "casNumber",
					profile.un_number AS "unNumber",
					profile.profile_status::text AS "profileStatus",
					profile.sds_reviewed AS "sdsReviewed",
					profile.sds_reviewed_by_user_id::text AS "sdsReviewedByUserId",
					profile.sds_reviewed_at AS "sdsReviewedAt",
					profile.extraction_status::text AS "extractionStatus",
					profile.storage_path AS "storagePath",
					COALESCE(control_counts.control_count, 0)::integer AS "controlCount",
					COALESCE(control_counts.open_review_count, 0)::integer AS "openReviewCount",
					profile.created_at AS "createdAt",
					profile.updated_at AS "updatedAt"
				FROM chemical_profile profile
				LEFT JOIN LATERAL (
					SELECT
						count(*)::integer AS control_count,
						count(*) FILTER (WHERE review_status = 'pending')::integer AS open_review_count
					FROM chemical_control control
					WHERE control.chemical_profile_id = profile.id
						AND (
							control.source_provenance <> 'sds_extraction'::chemical_control_source_provenance
							OR control.review_status <> 'rejected'::chemical_control_review_status
							OR control.source_storage_path = profile.storage_path
						)
				) control_counts ON true
				WHERE (${profileStatus}::chemical_profile_status IS NULL OR profile.profile_status = ${profileStatus}::chemical_profile_status)
					AND (
						${search}::text IS NULL
						OR profile.product_name ILIKE '%' || ${search}::text || '%'
						OR profile.manufacturer ILIKE '%' || ${search}::text || '%'
						OR profile.cas_number ILIKE '%' || ${search}::text || '%'
					)
				ORDER BY
					CASE WHEN profile.profile_status = 'archived' THEN 1 ELSE 0 END,
					profile.updated_at DESC,
					profile.product_name ASC
			`;

		return rows.map(mapProfileRow);
	});
}

export async function getChemicalProfileDetail(
	tenantId: string,
	profileId: string,
): Promise<ChemicalProfileDetail | null> {
	return withTenantConnection(tenantId, async (tx) => {
		const profileRows = await tx.$queryRaw<ChemicalProfileRow[]>`
			SELECT
				profile.id::text AS id,
				profile.tenant_id::text AS "tenantId",
				profile.product_name AS "productName",
				profile.manufacturer,
				profile.cas_number AS "casNumber",
				profile.un_number AS "unNumber",
				profile.profile_status::text AS "profileStatus",
				profile.sds_reviewed AS "sdsReviewed",
				profile.sds_reviewed_by_user_id::text AS "sdsReviewedByUserId",
				profile.sds_reviewed_at AS "sdsReviewedAt",
				profile.extraction_status::text AS "extractionStatus",
				profile.storage_path AS "storagePath",
				COALESCE(control_counts.control_count, 0)::integer AS "controlCount",
				COALESCE(control_counts.open_review_count, 0)::integer AS "openReviewCount",
				profile.created_at AS "createdAt",
				profile.updated_at AS "updatedAt"
			FROM chemical_profile profile
			LEFT JOIN LATERAL (
				SELECT
					count(*)::integer AS control_count,
					count(*) FILTER (WHERE review_status = 'pending')::integer AS open_review_count
				FROM chemical_control control
				WHERE control.chemical_profile_id = profile.id
					AND (
						control.source_provenance <> 'sds_extraction'::chemical_control_source_provenance
						OR control.review_status <> 'rejected'::chemical_control_review_status
						OR control.source_storage_path = profile.storage_path
					)
			) control_counts ON true
			WHERE profile.id = ${profileId}::uuid
			LIMIT 1
		`;
		const profile = profileRows[0];

		if (!profile) {
			return null;
		}

		const controls = await tx.$queryRaw<ChemicalControlSummaryRow[]>`
			SELECT
				control_type::text AS "controlType",
				count(*)::integer AS count,
				count(*) FILTER (WHERE review_status = 'pending')::integer AS "pendingCount"
			FROM chemical_control
			WHERE chemical_profile_id = ${profileId}::uuid
				AND (
					source_provenance <> 'sds_extraction'::chemical_control_source_provenance
					OR review_status <> 'rejected'::chemical_control_review_status
					OR source_storage_path = ${profile.storagePath}::text
				)
			GROUP BY control_type
			ORDER BY control_type ASC
		`;
		const sdsControls = await tx.$queryRaw<ChemicalSdsControlRow[]>`
			SELECT
				id::text,
				control_type::text AS "controlType",
				control_text AS "controlText",
				review_status::text AS "reviewStatus",
				reviewed_by_user_id::text AS "reviewedByUserId",
				reviewed_at AS "reviewedAt",
				sort_order AS "sortOrder",
				sds_section AS "sdsSection",
				source_excerpt AS "sourceExcerpt",
				page_line_ref AS "pageLineRef",
				source_filename AS "sourceFilename",
				source_storage_path AS "sourceStoragePath",
				extraction_model_marker AS "extractionModelMarker",
				extraction_confidence AS "extractionConfidence"
			FROM chemical_control
			WHERE chemical_profile_id = ${profileId}::uuid
				AND source_provenance = 'sds_extraction'::chemical_control_source_provenance
				AND source_storage_path = ${profile.storagePath}::text
			ORDER BY sort_order ASC, created_at ASC
		`;

		return {
			...mapProfileRow(profile),
			controls: controls.map(mapControlSummary),
			sdsControls: sdsControls.map(mapSdsControl),
			sdsAttachments: profile.storagePath
				? [
						{
							fileName: fileNameFromStoragePath(profile.storagePath),
							storagePath: profile.storagePath,
						},
					]
				: [],
		};
	});
}

function mapControlSummary(
	control: ChemicalControlSummaryRow,
): ChemicalProfileControlSummary {
	if (!isChemicalControlType(control.controlType)) {
		throw new Error("INVALID_CHEMICAL_CONTROL_TYPE");
	}

	return {
		controlType: control.controlType,
		count: Number(control.count),
		pendingCount: Number(control.pendingCount),
	};
}

function mapSdsControl(
	control: ChemicalSdsControlRow,
): ChemicalProfileSdsControl {
	if (!isChemicalControlType(control.controlType)) {
		throw new Error("INVALID_CHEMICAL_CONTROL_TYPE");
	}

	if (!isChemicalControlReviewStatus(control.reviewStatus)) {
		throw new Error("INVALID_CHEMICAL_CONTROL_REVIEW_STATUS");
	}

	if (
		!control.sdsSection ||
		!control.sourceExcerpt ||
		!control.sourceFilename ||
		!control.sourceStoragePath ||
		!control.extractionModelMarker
	) {
		throw new Error("INVALID_SDS_CONTROL_PROVENANCE");
	}

	return {
		controlText: control.controlText,
		controlType: control.controlType,
		extractionConfidence: control.extractionConfidence,
		extractionModelMarker: control.extractionModelMarker,
		id: control.id,
		pageLineRef: control.pageLineRef,
		reviewStatus: control.reviewStatus,
		reviewedAt: control.reviewedAt,
		reviewedByUserId: control.reviewedByUserId,
		sdsSection: control.sdsSection,
		sortOrder: Number(control.sortOrder),
		sourceExcerpt: control.sourceExcerpt,
		sourceFilename: control.sourceFilename,
		sourceStoragePath: control.sourceStoragePath,
	};
}

export async function createChemicalProfile(input: {
	readonly profile: ChemicalProfileMutationPayload;
	readonly tenantId: string;
}): Promise<ChemicalProfileDetail> {
	const record = prepareChemicalProfileForStorage({
		...input.profile,
		tenantId: input.tenantId,
	});
	const profileId = randomUUID();

	await withTenantConnection(input.tenantId, async (tx) => {
		await tx.$executeRaw`
			INSERT INTO chemical_profile (
				id,
				tenant_id,
				product_name,
				manufacturer,
				cas_number,
				un_number,
				profile_status,
				sds_reviewed,
				sds_reviewed_by_user_id,
				sds_reviewed_at,
				extraction_status,
				storage_path
			) VALUES (
				${profileId}::uuid,
				${record.tenantId}::uuid,
				${record.productName},
				${record.manufacturer},
				${record.casNumber},
				${record.unNumber},
				${record.profileStatus}::chemical_profile_status,
				${record.sdsReviewed},
				${record.sdsReviewedByUserId}::uuid,
				${record.sdsReviewedAt}::timestamptz,
				${record.extractionStatus}::chemical_profile_extraction_status,
				${record.storagePath}
			)
		`;
	});

	const created = await getChemicalProfileDetail(input.tenantId, profileId);
	if (!created) {
		throw new Error("CHEMICAL_PROFILE_CREATE_FAILED");
	}

	return created;
}

export async function updateChemicalProfile(input: {
	readonly profile: ChemicalProfileMutationPayload;
	readonly profileId: string;
	readonly tenantId: string;
}): Promise<ChemicalProfileDetail | null> {
	const record = prepareChemicalProfileForStorage({
		...input.profile,
		tenantId: input.tenantId,
	});

	await withTenantConnection(input.tenantId, async (tx) => {
		await tx.$executeRaw`
			UPDATE chemical_profile
			SET
				product_name = ${record.productName},
				manufacturer = ${record.manufacturer},
				cas_number = ${record.casNumber},
				un_number = ${record.unNumber},
				profile_status = ${record.profileStatus}::chemical_profile_status,
				updated_at = CURRENT_TIMESTAMP
			WHERE id = ${input.profileId}::uuid
		`;
	});

	return getChemicalProfileDetail(input.tenantId, input.profileId);
}

export async function archiveChemicalProfile(input: {
	readonly profileId: string;
	readonly tenantId: string;
}): Promise<ChemicalProfileDetail | null> {
	await withTenantConnection(input.tenantId, async (tx) => {
		await tx.$executeRaw`
			UPDATE chemical_profile
			SET profile_status = 'archived'::chemical_profile_status,
				updated_at = CURRENT_TIMESTAMP
			WHERE id = ${input.profileId}::uuid
		`;
	});

	return getChemicalProfileDetail(input.tenantId, input.profileId);
}

export function serializeChemicalProfile(
	profile: ChemicalProfileDetail,
): SerializedChemicalProfileDetail;
export function serializeChemicalProfile(
	profile: ChemicalProfileListRow,
): SerializedChemicalProfileListRow;
export function serializeChemicalProfile(
	profile: ChemicalProfileDetail | ChemicalProfileListRow,
): SerializedChemicalProfileDetail | SerializedChemicalProfileListRow {
	const serialized = {
		...profile,
		createdAt: profile.createdAt.toISOString(),
		sdsReviewedAt: profile.sdsReviewedAt?.toISOString() ?? null,
		updatedAt: profile.updatedAt.toISOString(),
	};

	if ("sdsControls" in profile) {
		return {
			...serialized,
			sdsControls: profile.sdsControls.map((control) => ({
				...control,
				reviewedAt: control.reviewedAt?.toISOString() ?? null,
			})),
		};
	}

	return serialized;
}

export type SerializedChemicalProfileListRow = Omit<
	ChemicalProfileListRow,
	"createdAt" | "sdsReviewedAt" | "updatedAt"
> & {
	readonly createdAt: string;
	readonly sdsReviewedAt: string | null;
	readonly updatedAt: string;
};

export type SerializedChemicalProfileDetail = Omit<
	ChemicalProfileDetail,
	"createdAt" | "sdsControls" | "sdsReviewedAt" | "updatedAt"
> & {
	readonly createdAt: string;
	readonly sdsControls: readonly SerializedChemicalProfileSdsControl[];
	readonly sdsReviewedAt: string | null;
	readonly updatedAt: string;
};

export type SerializedChemicalProfileSdsControl = Omit<
	ChemicalProfileSdsControl,
	"reviewedAt"
> & {
	readonly reviewedAt: string | null;
};

function mapProfileRow(row: ChemicalProfileRow): ChemicalProfileListRow {
	const profileStatus = row.profileStatus;
	const extractionStatus = row.extractionStatus;

	if (!isChemicalProfileStatus(profileStatus)) {
		throw new Error("INVALID_CHEMICAL_PROFILE_STATUS");
	}

	if (!isChemicalProfileExtractionStatus(extractionStatus)) {
		throw new Error("INVALID_CHEMICAL_EXTRACTION_STATUS");
	}

	return {
		casNumber: row.casNumber,
		controlCount: Number(row.controlCount),
		createdAt: row.createdAt,
		extractionStatus,
		id: row.id,
		manufacturer: row.manufacturer,
		openReviewCount: Number(row.openReviewCount),
		productName: row.productName,
		profileStatus,
		sdsReviewed: row.sdsReviewed,
		sdsReviewedAt: row.sdsReviewedAt,
		sdsReviewedByUserId: row.sdsReviewedByUserId,
		storagePath: row.storagePath,
		tenantId: row.tenantId,
		unNumber: row.unNumber,
		updatedAt: row.updatedAt,
	};
}

function normalizeProfileStatusFilter(
	value: ChemicalProfileListFilters["profileStatus"],
): ChemicalProfileStatus | null {
	if (!value || value === "all") {
		return null;
	}

	return isChemicalProfileStatus(value) ? value : null;
}

function normalizeSearch(value: string | null | undefined): string | null {
	const search = value?.trim();
	return search ? search : null;
}

function fileNameFromStoragePath(storagePath: string): string {
	const [fileName] = storagePath.split("/").reverse();
	return fileName || storagePath;
}

export type ChemicalProfileMutationPayload = {
	readonly productName: string;
	readonly manufacturer: string;
	readonly casNumber?: string | null;
	readonly unNumber?: string | null;
	readonly profileStatus?: ChemicalProfileStatus | null;
	readonly storagePath?: string | null;
};

export function parseChemicalProfilePayload(
	body: Map<string, unknown> | Record<string, unknown>,
): ChemicalProfileMutationPayload | null {
	const get = (key: string): unknown =>
		body instanceof Map ? body.get(key) : body[key];
	const productName = stringValue(get("productName"));
	const manufacturer = stringValue(get("manufacturer"));
	const profileStatus = stringValue(get("profileStatus"));
	const normalizedProfileStatus: ChemicalProfileStatus = profileStatus
		? (profileStatus as ChemicalProfileStatus)
		: "draft";

	if (
		!productName ||
		!manufacturer ||
		(profileStatus && !isChemicalProfileStatus(profileStatus))
	) {
		return null;
	}

	return {
		casNumber: nullableStringValue(get("casNumber")),
		manufacturer,
		productName,
		profileStatus: normalizedProfileStatus,
		storagePath: nullableStringValue(get("storagePath")),
		unNumber: nullableStringValue(get("unNumber")),
	};
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function nullableStringValue(value: unknown): string | null {
	const text = stringValue(value);
	return text ? text : null;
}
