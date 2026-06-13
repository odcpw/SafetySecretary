import { withTenantConnection } from "../db/tenancy";
import {
	type ChemicalControlType,
	isChemicalControlType,
} from "./chemical-control";
import {
	type ChemicalProfileStatus,
	isChemicalProfileStatus,
} from "./chemical-profile";

export type ChemicalControlGroupProfile = {
	readonly id: string;
	readonly productName: string;
	readonly manufacturer: string;
	readonly profileStatus: ChemicalProfileStatus;
};

export type ChemicalControlGroup = {
	readonly controlType: ChemicalControlType;
	readonly controlText: string;
	readonly controlCount: number;
	readonly profileCount: number;
	readonly profiles: readonly ChemicalControlGroupProfile[];
};

type ChemicalControlGroupRow = {
	controlType: string;
	controlText: string;
	controlCount: number | bigint;
	profileCount: number | bigint;
	profiles: unknown;
};

type ChemicalControlGroupProfileRow = {
	id?: unknown;
	productName?: unknown;
	manufacturer?: unknown;
	profileStatus?: unknown;
};

export async function listChemicalControlGroups(
	tenantId: string,
): Promise<ChemicalControlGroup[]> {
	return withTenantConnection(tenantId, async (tx) => {
		const rows = await tx.$queryRaw<ChemicalControlGroupRow[]>`
			WITH control_groups AS (
				SELECT
					control.control_type::text AS control_type,
					btrim(control.control_text) AS control_text,
					count(*)::integer AS control_count,
					count(DISTINCT control.chemical_profile_id)::integer AS profile_count
				FROM chemical_control control
				WHERE btrim(control.control_text) <> ''
				GROUP BY control.control_type, btrim(control.control_text)
			),
			profile_links AS (
				SELECT DISTINCT
					control.control_type::text AS control_type,
					btrim(control.control_text) AS control_text,
					profile.id::text AS profile_id,
					profile.product_name,
					profile.manufacturer,
					profile.profile_status::text AS profile_status
				FROM chemical_control control
				INNER JOIN chemical_profile profile
					ON profile.id = control.chemical_profile_id
				WHERE btrim(control.control_text) <> ''
			)
			SELECT
				control_groups.control_type AS "controlType",
				control_groups.control_text AS "controlText",
				control_groups.control_count AS "controlCount",
				control_groups.profile_count AS "profileCount",
				jsonb_agg(
					jsonb_build_object(
						'id', profile_links.profile_id,
						'productName', profile_links.product_name,
						'manufacturer', profile_links.manufacturer,
						'profileStatus', profile_links.profile_status
					)
					ORDER BY
						profile_links.product_name ASC,
						profile_links.manufacturer ASC,
						profile_links.profile_id ASC
				) AS profiles
			FROM control_groups
			INNER JOIN profile_links
				ON profile_links.control_type = control_groups.control_type
				AND profile_links.control_text = control_groups.control_text
			GROUP BY
				control_groups.control_type,
				control_groups.control_text,
				control_groups.control_count,
				control_groups.profile_count
			ORDER BY
				control_groups.profile_count DESC,
				control_groups.control_count DESC,
				control_groups.control_type ASC,
				control_groups.control_text ASC
		`;

		return rows.map(mapControlGroupRow);
	});
}

export function serializeChemicalControlGroup(
	group: ChemicalControlGroup,
): SerializedChemicalControlGroup {
	return group;
}

export type SerializedChemicalControlGroup = ChemicalControlGroup;

function mapControlGroupRow(
	row: ChemicalControlGroupRow,
): ChemicalControlGroup {
	if (!isChemicalControlType(row.controlType)) {
		throw new Error("INVALID_CHEMICAL_CONTROL_TYPE");
	}

	return {
		controlCount: Number(row.controlCount),
		controlText: row.controlText,
		controlType: row.controlType,
		profileCount: Number(row.profileCount),
		profiles: parseProfiles(row.profiles),
	};
}

function parseProfiles(value: unknown): ChemicalControlGroupProfile[] {
	if (!Array.isArray(value)) {
		throw new Error("INVALID_CHEMICAL_CONTROL_GROUP_PROFILES");
	}

	return value.map((item) => {
		const profile = item as ChemicalControlGroupProfileRow;
		const profileStatus = profile.profileStatus;

		if (!isChemicalProfileStatus(profileStatus)) {
			throw new Error("INVALID_CHEMICAL_PROFILE_STATUS");
		}

		if (
			typeof profile.id !== "string" ||
			typeof profile.productName !== "string" ||
			typeof profile.manufacturer !== "string"
		) {
			throw new Error("INVALID_CHEMICAL_CONTROL_GROUP_PROFILE");
		}

		return {
			id: profile.id,
			manufacturer: profile.manufacturer,
			productName: profile.productName,
			profileStatus,
		};
	});
}
