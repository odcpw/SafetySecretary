export const CHEMICAL_PROFILE_STATUSES = [
	"draft",
	"active",
	"archived",
] as const;

export const CHEMICAL_PROFILE_EXTRACTION_STATUSES = [
	"none",
	"pending",
	"extracted",
	"review_required",
	"approved",
] as const;

export type ChemicalProfileStatus = (typeof CHEMICAL_PROFILE_STATUSES)[number];
export type ChemicalProfileExtractionStatus =
	(typeof CHEMICAL_PROFILE_EXTRACTION_STATUSES)[number];

export type ChemicalProfileInput = {
	readonly tenantId: string;
	readonly productName: string;
	readonly manufacturer: string;
	readonly casNumber?: string | null;
	readonly unNumber?: string | null;
	readonly profileStatus?: ChemicalProfileStatus | null;
	readonly sdsReviewed?: boolean | null;
	readonly sdsReviewedByUserId?: string | null;
	readonly sdsReviewedAt?: Date | string | null;
	readonly extractionStatus?: ChemicalProfileExtractionStatus | null;
	readonly storagePath?: string | null;
};

export type ChemicalProfileRecord = {
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
};

export class ChemicalProfileValidationError extends Error {
	readonly code = "invalid_chemical_profile";

	constructor(message: string) {
		super(message);
		this.name = new.target.name;
	}
}

export function prepareChemicalProfileForStorage(
	input: ChemicalProfileInput,
): ChemicalProfileRecord {
	const tenantId = requiredText(input.tenantId, "tenantId").toLowerCase();
	const storagePath = optionalText(input.storagePath, "storagePath");

	if (storagePath) {
		assertStoragePathBelongsToTenant(storagePath, tenantId);
	}

	const profileStatus = input.profileStatus ?? "draft";
	if (!isChemicalProfileStatus(profileStatus)) {
		throw new ChemicalProfileValidationError(
			`Unsupported chemical profile status: ${String(profileStatus)}`,
		);
	}

	const extractionStatus = input.extractionStatus ?? "none";
	if (!isChemicalProfileExtractionStatus(extractionStatus)) {
		throw new ChemicalProfileValidationError(
			`Unsupported chemical extraction status: ${String(extractionStatus)}`,
		);
	}

	const sdsReviewed = input.sdsReviewed ?? false;
	const sdsReviewedByUserId = optionalText(
		input.sdsReviewedByUserId,
		"sdsReviewedByUserId",
	);
	const sdsReviewedAt = optionalDate(input.sdsReviewedAt, "sdsReviewedAt");

	if (sdsReviewed && (!sdsReviewedByUserId || !sdsReviewedAt)) {
		throw new ChemicalProfileValidationError(
			"SDS review requires both reviewer user id and review timestamp.",
		);
	}

	return {
		casNumber: optionalText(input.casNumber, "casNumber"),
		extractionStatus,
		manufacturer: requiredText(input.manufacturer, "manufacturer"),
		productName: requiredText(input.productName, "productName"),
		profileStatus,
		sdsReviewed,
		sdsReviewedAt,
		sdsReviewedByUserId,
		storagePath,
		tenantId,
		unNumber: optionalText(input.unNumber, "unNumber"),
	};
}

export function isChemicalProfileStatus(
	value: unknown,
): value is ChemicalProfileStatus {
	return (
		typeof value === "string" &&
		(CHEMICAL_PROFILE_STATUSES as readonly string[]).includes(value)
	);
}

export function isChemicalProfileExtractionStatus(
	value: unknown,
): value is ChemicalProfileExtractionStatus {
	return (
		typeof value === "string" &&
		(CHEMICAL_PROFILE_EXTRACTION_STATUSES as readonly string[]).includes(value)
	);
}

function requiredText(value: unknown, label: string): string {
	if (typeof value !== "string" || value.trim() === "") {
		throw new ChemicalProfileValidationError(`${label} must not be blank.`);
	}

	return value.trim();
}

function optionalText(value: unknown, label: string): string | null {
	if (value === null || value === undefined) {
		return null;
	}

	if (typeof value !== "string") {
		throw new ChemicalProfileValidationError(`${label} must be a string.`);
	}

	const trimmed = value.trim();
	if (trimmed === "") {
		throw new ChemicalProfileValidationError(`${label} must not be blank.`);
	}

	return trimmed;
}

function optionalDate(value: unknown, label: string): Date | null {
	if (value === null || value === undefined) {
		return null;
	}

	const date = value instanceof Date ? value : new Date(String(value));

	if (Number.isNaN(date.getTime())) {
		throw new ChemicalProfileValidationError(`${label} must be a valid date.`);
	}

	return date;
}

function assertStoragePathBelongsToTenant(
	storagePath: string,
	tenantId: string,
): void {
	const prefix = `tenants/${tenantId}/`;

	if (!storagePath.startsWith(prefix) || storagePath.length <= prefix.length) {
		throw new ChemicalProfileValidationError(
			"storagePath must belong to the chemical profile tenant.",
		);
	}
}
