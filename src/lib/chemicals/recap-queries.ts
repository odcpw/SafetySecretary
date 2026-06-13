import { withSharedConnection, withTenantConnection } from "../db/tenancy";
import { tenantPrefix } from "../storage/keys";
import {
	type ChemicalControlType,
	isChemicalControlType,
} from "./chemical-control";

export type ChemicalRecapControl = {
	readonly id: string;
	readonly controlType: ChemicalControlType;
	readonly controlText: string;
	readonly reviewedAt: Date;
	readonly reviewedByUserEmail: string | null;
	readonly sdsSection: string | null;
	readonly sourceExcerpt: string | null;
	readonly pageLineRef: string | null;
	readonly sourceFilename: string | null;
	readonly sourceStoragePath: string | null;
	readonly sourceStorageIsImage: boolean;
};

export type ChemicalRecapCard = {
	readonly id: string;
	readonly productName: string;
	readonly manufacturer: string;
	readonly casNumber: string | null;
	readonly unNumber: string | null;
	readonly sdsReviewed: boolean;
	readonly sdsReviewedAt: Date | null;
	readonly sdsReviewedByUserEmail: string | null;
	readonly storagePath: string | null;
	readonly controls: readonly ChemicalRecapControl[];
};

export type SerializedChemicalRecapControl = Omit<
	ChemicalRecapControl,
	"reviewedAt"
> & {
	readonly reviewedAt: string;
};

export type SerializedChemicalRecapCard = Omit<
	ChemicalRecapCard,
	"controls" | "sdsReviewedAt"
> & {
	readonly controls: readonly SerializedChemicalRecapControl[];
	readonly sdsReviewedAt: string | null;
};

type ChemicalRecapRow = {
	profileId: string;
	productName: string;
	manufacturer: string;
	casNumber: string | null;
	unNumber: string | null;
	sdsReviewed: boolean;
	sdsReviewedAt: Date | null;
	sdsReviewedByUserId: string | null;
	storagePath: string | null;
	controlId: string;
	controlType: string;
	controlText: string;
	reviewedAt: Date;
	reviewedByUserId: string | null;
	sdsSection: string | null;
	sourceExcerpt: string | null;
	pageLineRef: string | null;
	sourceFilename: string | null;
	sourceStoragePath: string | null;
};

type UserEmailRow = {
	id: string;
	email: string;
};

type MutableChemicalRecapCard = Omit<ChemicalRecapCard, "controls"> & {
	controls: ChemicalRecapControl[];
};

export async function listChemicalRecapCards(
	tenantId: string,
): Promise<ChemicalRecapCard[]> {
	const rows = await withTenantConnection(tenantId, async (tx) => {
		const rows = await tx.$queryRaw<ChemicalRecapRow[]>`
			SELECT
				profile.id::text AS "profileId",
				profile.product_name AS "productName",
				profile.manufacturer,
				profile.cas_number AS "casNumber",
				profile.un_number AS "unNumber",
				profile.sds_reviewed AS "sdsReviewed",
				profile.sds_reviewed_at AS "sdsReviewedAt",
				profile.sds_reviewed_by_user_id::text AS "sdsReviewedByUserId",
				profile.storage_path AS "storagePath",
				control.id::text AS "controlId",
				control.control_type::text AS "controlType",
				control.control_text AS "controlText",
				control.reviewed_at AS "reviewedAt",
				control.reviewed_by_user_id::text AS "reviewedByUserId",
				control.sds_section AS "sdsSection",
				control.source_excerpt AS "sourceExcerpt",
				control.page_line_ref AS "pageLineRef",
				control.source_filename AS "sourceFilename",
				control.source_storage_path AS "sourceStoragePath"
			FROM chemical_profile profile
			INNER JOIN chemical_control control
				ON control.chemical_profile_id = profile.id
				AND control.review_status = 'approved'::chemical_control_review_status
				AND control.reviewed_at IS NOT NULL
				AND control.reviewed_by_user_id IS NOT NULL
			WHERE profile.profile_status <> 'archived'::chemical_profile_status
			ORDER BY
				profile.product_name ASC,
				profile.manufacturer ASC,
				profile.id ASC,
				CASE
					WHEN control.control_type IN ('first_aid', 'fire_fighting', 'spill_response')
					THEN 0
					ELSE 1
				END ASC,
				control.sort_order ASC,
				control.control_type ASC,
				control.id ASC
		`;

		return rows;
	});

	const userEmailById = await loadUserEmailMap(tenantId, rows);

	return groupRecapRows(tenantId, rows, userEmailById);
}

export function serializeChemicalRecapCard(
	card: ChemicalRecapCard,
): SerializedChemicalRecapCard {
	return {
		...card,
		controls: card.controls.map((control) => ({
			...control,
			reviewedAt: control.reviewedAt.toISOString(),
		})),
		sdsReviewedAt: card.sdsReviewedAt?.toISOString() ?? null,
	};
}

function groupRecapRows(
	tenantId: string,
	rows: ChemicalRecapRow[],
	userEmailById: ReadonlyMap<string, string>,
): ChemicalRecapCard[] {
	const cards = new Map<string, MutableChemicalRecapCard>();

	for (const row of rows) {
		const control = mapControl(tenantId, row, userEmailById);
		const existing = cards.get(row.profileId);

		if (existing) {
			existing.controls.push(control);
			continue;
		}

		cards.set(row.profileId, {
			casNumber: row.casNumber,
			controls: [control],
			id: row.profileId,
			manufacturer: row.manufacturer,
			productName: row.productName,
			sdsReviewed: row.sdsReviewed,
			sdsReviewedAt: row.sdsReviewedAt,
			sdsReviewedByUserEmail: emailFor(row.sdsReviewedByUserId, userEmailById),
			storagePath: safeTenantStoragePath(row.storagePath, tenantId),
			unNumber: row.unNumber,
		});
	}

	return [...cards.values()];
}

function mapControl(
	tenantId: string,
	row: ChemicalRecapRow,
	userEmailById: ReadonlyMap<string, string>,
): ChemicalRecapControl {
	if (!isChemicalControlType(row.controlType)) {
		throw new Error("INVALID_CHEMICAL_CONTROL_TYPE");
	}

	const sourceStoragePath = safeTenantStoragePath(
		row.sourceStoragePath,
		tenantId,
	);

	return {
		controlText: row.controlText,
		controlType: row.controlType,
		id: row.controlId,
		pageLineRef: row.pageLineRef,
		reviewedAt: row.reviewedAt,
		reviewedByUserEmail: emailFor(row.reviewedByUserId, userEmailById),
		sdsSection: row.sdsSection,
		sourceExcerpt: row.sourceExcerpt,
		sourceFilename: row.sourceFilename,
		sourceStorageIsImage: isImageStoragePath(sourceStoragePath),
		sourceStoragePath,
	};
}

async function loadUserEmailMap(
	tenantId: string,
	rows: readonly ChemicalRecapRow[],
): Promise<ReadonlyMap<string, string>> {
	const userIds = [
		...new Set(
			rows.flatMap((row) =>
				[row.sdsReviewedByUserId, row.reviewedByUserId].filter(Boolean),
			),
		),
	];

	if (userIds.length === 0) {
		return new Map();
	}

	return withSharedConnection(async (tx) => {
		const users = await tx.$queryRaw<UserEmailRow[]>`
			SELECT account.id::text, account.email::text
			FROM users account
			INNER JOIN tenant_memberships membership
				ON membership.user_id = account.id
				AND membership.tenant_id = ${tenantId}::uuid
			WHERE account.id::text = ANY(${userIds}::text[])
		`;

		return new Map(users.map((user) => [user.id, user.email]));
	});
}

function emailFor(
	userId: string | null,
	userEmailById: ReadonlyMap<string, string>,
): string | null {
	return userId ? (userEmailById.get(userId) ?? null) : null;
}

function safeTenantStoragePath(
	storagePath: string | null,
	tenantId: string,
): string | null {
	if (!storagePath) {
		return null;
	}

	const prefix = `${tenantPrefix(tenantId)}/`;
	const segments = storagePath.split("/");

	if (
		!storagePath.startsWith(prefix) ||
		storagePath.length <= prefix.length ||
		segments.some(
			(segment) =>
				segment.length === 0 ||
				segment === "." ||
				segment === ".." ||
				segment.includes("\\"),
		)
	) {
		return null;
	}

	return storagePath;
}

function isImageStoragePath(storagePath: string | null): boolean {
	return /\.(avif|gif|jpe?g|png|webp)$/i.test(storagePath ?? "");
}
