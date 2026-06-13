export const CHEMICAL_CONTROL_TYPES = [
	"use_control",
	"ppe",
	"glove_type",
	"eye_protection",
	"respiratory",
	"environmental",
	"storage",
	"handling",
	"first_aid",
	"fire_fighting",
	"spill_response",
] as const;

export const CHEMICAL_CONTROL_SOURCE_PROVENANCES = [
	"manual",
	"sds_extraction",
] as const;

export const CHEMICAL_CONTROL_REVIEW_STATUSES = [
	"pending",
	"approved",
	"rejected",
] as const;

export type ChemicalControlType = (typeof CHEMICAL_CONTROL_TYPES)[number];
export type ChemicalControlSourceProvenance =
	(typeof CHEMICAL_CONTROL_SOURCE_PROVENANCES)[number];
export type ChemicalControlReviewStatus =
	(typeof CHEMICAL_CONTROL_REVIEW_STATUSES)[number];

export type ChemicalControlInput = {
	readonly tenantId: string;
	readonly chemicalProfileId: string;
	readonly controlType: ChemicalControlType;
	readonly controlText: string;
	readonly sourceProvenance?: ChemicalControlSourceProvenance | null;
	readonly reviewStatus?: ChemicalControlReviewStatus | null;
	readonly reviewedByUserId?: string | null;
	readonly reviewedAt?: Date | string | null;
	readonly sortOrder?: number | null;
	readonly sdsSection?: string | null;
	readonly sourceExcerpt?: string | null;
	readonly pageLineRef?: string | null;
	readonly sourceFilename?: string | null;
	readonly sourceStoragePath?: string | null;
	readonly extractionModelMarker?: string | null;
	readonly extractionConfidence?: number | null;
};

export type ChemicalControlRecord = {
	readonly chemicalProfileId: string;
	readonly controlType: ChemicalControlType;
	readonly controlText: string;
	readonly sourceProvenance: ChemicalControlSourceProvenance;
	readonly reviewStatus: ChemicalControlReviewStatus;
	readonly reviewedByUserId: string | null;
	readonly reviewedAt: Date | null;
	readonly sortOrder: number;
	readonly sdsSection: string | null;
	readonly sourceExcerpt: string | null;
	readonly pageLineRef: string | null;
	readonly sourceFilename: string | null;
	readonly sourceStoragePath: string | null;
	readonly extractionModelMarker: string | null;
	readonly extractionConfidence: number | null;
};

export class ChemicalControlValidationError extends Error {
	readonly code = "invalid_chemical_control";

	constructor(message: string) {
		super(message);
		this.name = new.target.name;
	}
}

export function prepareChemicalControlForStorage(
	input: ChemicalControlInput,
): ChemicalControlRecord {
	const tenantId = requiredText(input.tenantId, "tenantId").toLowerCase();
	const sourceProvenance = input.sourceProvenance ?? "manual";
	if (!isChemicalControlSourceProvenance(sourceProvenance)) {
		throw new ChemicalControlValidationError(
			`Unsupported chemical control source provenance: ${String(sourceProvenance)}`,
		);
	}

	const reviewStatus = input.reviewStatus ?? "pending";
	if (!isChemicalControlReviewStatus(reviewStatus)) {
		throw new ChemicalControlValidationError(
			`Unsupported chemical control review status: ${String(reviewStatus)}`,
		);
	}

	const controlType = input.controlType;
	if (!isChemicalControlType(controlType)) {
		throw new ChemicalControlValidationError(
			`Unsupported chemical control type: ${String(controlType)}`,
		);
	}

	const reviewedByUserId =
		optionalText(input.reviewedByUserId, "reviewedByUserId")?.toLowerCase() ??
		null;
	const reviewedAt = optionalDate(input.reviewedAt, "reviewedAt");
	assertReviewPair(reviewStatus, reviewedByUserId, reviewedAt);

	const sourceStoragePath = optionalText(
		input.sourceStoragePath,
		"sourceStoragePath",
	);
	if (sourceStoragePath) {
		assertStoragePathBelongsToTenant(sourceStoragePath, tenantId);
	}

	const record: ChemicalControlRecord = {
		chemicalProfileId: requiredText(
			input.chemicalProfileId,
			"chemicalProfileId",
		).toLowerCase(),
		controlText: requiredText(input.controlText, "controlText"),
		controlType,
		extractionConfidence: optionalConfidence(input.extractionConfidence),
		extractionModelMarker: optionalText(
			input.extractionModelMarker,
			"extractionModelMarker",
		),
		pageLineRef: optionalText(input.pageLineRef, "pageLineRef"),
		reviewStatus,
		reviewedAt,
		reviewedByUserId,
		sdsSection: optionalText(input.sdsSection, "sdsSection"),
		sortOrder: optionalSortOrder(input.sortOrder),
		sourceExcerpt: optionalText(input.sourceExcerpt, "sourceExcerpt"),
		sourceFilename: optionalText(input.sourceFilename, "sourceFilename"),
		sourceProvenance,
		sourceStoragePath,
	};

	assertExtractionProvenance(record);

	return record;
}

export function isChemicalControlType(
	value: unknown,
): value is ChemicalControlType {
	return (
		typeof value === "string" &&
		(CHEMICAL_CONTROL_TYPES as readonly string[]).includes(value)
	);
}

export function isChemicalControlSourceProvenance(
	value: unknown,
): value is ChemicalControlSourceProvenance {
	return (
		typeof value === "string" &&
		(CHEMICAL_CONTROL_SOURCE_PROVENANCES as readonly string[]).includes(value)
	);
}

export function isChemicalControlReviewStatus(
	value: unknown,
): value is ChemicalControlReviewStatus {
	return (
		typeof value === "string" &&
		(CHEMICAL_CONTROL_REVIEW_STATUSES as readonly string[]).includes(value)
	);
}

export function isChemicalControlOperationallyUsable(
	control: Pick<ChemicalControlRecord, "reviewStatus" | "sourceProvenance">,
): boolean {
	if (control.sourceProvenance === "sds_extraction") {
		return control.reviewStatus === "approved";
	}

	return control.reviewStatus !== "rejected";
}

function assertExtractionProvenance(control: ChemicalControlRecord): void {
	if (control.sourceProvenance !== "sds_extraction") {
		return;
	}

	const missingFields = [
		["sdsSection", control.sdsSection],
		["sourceExcerpt", control.sourceExcerpt],
		["sourceFilename", control.sourceFilename],
		["sourceStoragePath", control.sourceStoragePath],
		["extractionModelMarker", control.extractionModelMarker],
	]
		.filter(([, value]) => value === null)
		.map(([field]) => field);

	if (missingFields.length > 0) {
		throw new ChemicalControlValidationError(
			`SDS-extracted controls require provenance fields: ${missingFields.join(", ")}.`,
		);
	}
}

function assertReviewPair(
	reviewStatus: ChemicalControlReviewStatus,
	reviewedByUserId: string | null,
	reviewedAt: Date | null,
): void {
	const hasReviewer = reviewedByUserId !== null;
	const hasReviewTimestamp = reviewedAt !== null;

	if (reviewStatus === "pending" && (hasReviewer || hasReviewTimestamp)) {
		throw new ChemicalControlValidationError(
			"Pending controls must not have review user or timestamp.",
		);
	}

	if (reviewStatus !== "pending" && (!hasReviewer || !hasReviewTimestamp)) {
		throw new ChemicalControlValidationError(
			"Approved or rejected controls require both reviewer user id and review timestamp.",
		);
	}
}

function requiredText(value: unknown, label: string): string {
	if (typeof value !== "string" || value.trim() === "") {
		throw new ChemicalControlValidationError(`${label} must not be blank.`);
	}

	return value.trim();
}

function optionalText(value: unknown, label: string): string | null {
	if (value === null || value === undefined) {
		return null;
	}

	if (typeof value !== "string") {
		throw new ChemicalControlValidationError(`${label} must be a string.`);
	}

	const trimmed = value.trim();
	if (trimmed === "") {
		throw new ChemicalControlValidationError(`${label} must not be blank.`);
	}

	return trimmed;
}

function optionalDate(value: unknown, label: string): Date | null {
	if (value === null || value === undefined) {
		return null;
	}

	const date = value instanceof Date ? value : new Date(String(value));

	if (Number.isNaN(date.getTime())) {
		throw new ChemicalControlValidationError(`${label} must be a valid date.`);
	}

	return date;
}

function optionalSortOrder(value: number | null | undefined): number {
	if (value === null || value === undefined) {
		return 0;
	}

	if (!Number.isInteger(value) || value < 0) {
		throw new ChemicalControlValidationError(
			"sortOrder must be a non-negative integer.",
		);
	}

	return value;
}

function optionalConfidence(value: number | null | undefined): number | null {
	if (value === null || value === undefined) {
		return null;
	}

	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new ChemicalControlValidationError(
			"extractionConfidence must be between 0 and 1.",
		);
	}

	return value;
}

function assertStoragePathBelongsToTenant(
	storagePath: string,
	tenantId: string,
): void {
	const prefix = `tenants/${tenantId}/`;

	if (!storagePath.startsWith(prefix) || storagePath.length <= prefix.length) {
		throw new ChemicalControlValidationError(
			"sourceStoragePath must belong to the chemical control tenant.",
		);
	}
}
