import { t } from "../i18n/t";
import type { Locale, MessageKey } from "../i18n/types";
import type { ChemicalControlType } from "./chemical-control";

export type { ChemicalControlType } from "./chemical-control";
export { CHEMICAL_CONTROL_TYPES } from "./chemical-control";

export const CHEMICAL_EXTRACTION_STATUSES = [
	"none",
	"pending",
	"extracted",
	"review_required",
	"approved",
] as const;

export type ChemicalExtractionStatus =
	(typeof CHEMICAL_EXTRACTION_STATUSES)[number];

export const CHEMICAL_EXTRACTION_STATUS_LABEL_KEYS = {
	approved: "chemical.extraction.approved",
	extracted: "chemical.extraction.extracted",
	none: "chemical.extraction.none",
	pending: "chemical.extraction.pending",
	review_required: "chemical.extraction.reviewRequired",
} as const satisfies Record<ChemicalExtractionStatus, MessageKey>;

export const CHEMICAL_CONTROL_TYPE_LABEL_KEYS = {
	environmental: "chemical.control.environmental",
	eye_protection: "chemical.control.eyeProtection",
	fire_fighting: "chemical.control.fireFighting",
	first_aid: "chemical.control.firstAid",
	glove_type: "chemical.control.gloveType",
	handling: "chemical.control.handling",
	ppe: "chemical.control.ppe",
	respiratory: "chemical.control.respiratory",
	spill_response: "chemical.control.spillResponse",
	storage: "chemical.control.storage",
	use_control: "chemical.control.useControl",
} as const satisfies Record<ChemicalControlType, MessageKey>;

export const CHEMICAL_MESSAGE_KEYS = [
	"chemical.control.environmental",
	"chemical.control.eyeProtection",
	"chemical.control.fireFighting",
	"chemical.control.firstAid",
	"chemical.control.gloveType",
	"chemical.control.handling",
	"chemical.control.ppe",
	"chemical.control.respiratory",
	"chemical.control.spillResponse",
	"chemical.control.storage",
	"chemical.control.useControl",
	"chemical.empty.body",
	"chemical.empty.cta",
	"chemical.empty.title",
	"chemical.extraction.approved",
	"chemical.extraction.extracted",
	"chemical.extraction.none",
	"chemical.extraction.pending",
	"chemical.extraction.reviewRequired",
	"chemical.field.casNumber",
	"chemical.field.department",
	"chemical.field.hazardPictograms",
	"chemical.field.name",
	"chemical.field.owner",
	"chemical.field.storageLocation",
	"chemical.field.supplier",
	"chemical.field.unNumber",
	"chemical.field.usage",
	"chemical.list.filters",
	"chemical.list.title",
	"chemical.profileStatus.active",
	"chemical.profileStatus.all",
	"chemical.profileStatus.archived",
	"chemical.profileStatus.draft",
	"chemical.quickCard.criticalCheck",
	"chemical.quickCard.reviewedSource",
	"chemical.quickCard.spillExposureFirstAction",
	"chemical.recap.controls",
	"chemical.recap.lastReviewed",
	"chemical.recap.openReviews",
	"chemical.recap.sdsCoverage",
	"chemical.review.approve",
	"chemical.review.approved",
	"chemical.review.pending",
	"chemical.review.reject",
	"chemical.review.rejected",
	"chemical.sds.confidence",
	"chemical.sds.currentFile",
	"chemical.sds.excerpt",
	"chemical.sds.extractControls",
	"chemical.sds.extractionText",
	"chemical.sds.model",
	"chemical.sds.reviewFailed",
	"chemical.sds.reviewQueue",
	"chemical.sds.section",
	"chemical.sds.uploadFailed",
	"chemical.sds.uploadHint",
	"chemical.sds.uploadLabel",
] as const satisfies readonly MessageKey[];

export type ChemicalProfileFixture = {
	id: string;
	casNumber: string;
	controls: readonly ChemicalControlType[];
	department: string;
	extractionStatus: ChemicalExtractionStatus;
	hazardPictograms: string[];
	name: string;
	ownerRole: string;
	sdsFileName: string | null;
	storageLocation: string;
	supplier: string;
	usage: string;
};

export const CHEMICAL_PROFILE_FIXTURES = [
	{
		casNumber: "64-17-5",
		controls: ["use_control", "glove_type", "eye_protection", "storage"],
		department: "Process lab",
		extractionStatus: "review_required",
		hazardPictograms: ["GHS02", "GHS07"],
		id: "chem-fixture-solvent-a",
		name: "Synthetic solvent A",
		ownerRole: "Lab lead",
		sdsFileName: "synthetic-solvent-a-sds.pdf",
		storageLocation: "Flammables cabinet",
		supplier: "Example SDS Lab",
		usage: "Small-batch cleaning",
	},
	{
		casNumber: "1310-73-2",
		controls: ["ppe", "eye_protection", "first_aid", "spill_response"],
		department: "Maintenance",
		extractionStatus: "approved",
		hazardPictograms: ["GHS05"],
		id: "chem-fixture-alkali-cleaner",
		name: "Mock alkali cleaner",
		ownerRole: "Maintenance supervisor",
		sdsFileName: "mock-alkali-cleaner-sds.pdf",
		storageLocation: "Locked cleaning store",
		supplier: "Example Process Supplies",
		usage: "Scheduled floor cleaning",
	},
	{
		casNumber: "67-64-1",
		controls: ["handling", "respiratory", "fire_fighting"],
		department: "Paint shop",
		extractionStatus: "extracted",
		hazardPictograms: ["GHS02", "GHS07"],
		id: "chem-fixture-thinner",
		name: "Example thinner blend",
		ownerRole: "Paint shop lead",
		sdsFileName: "example-thinner-blend-sds.pdf",
		storageLocation: "Ventilated cabinet",
		supplier: "Fixture Coatings",
		usage: "Tool cleaning",
	},
	{
		casNumber: "7722-64-7",
		controls: ["environmental", "storage", "spill_response"],
		department: "Water treatment",
		extractionStatus: "pending",
		hazardPictograms: ["GHS03", "GHS07", "GHS09"],
		id: "chem-fixture-oxidizer",
		name: "Training oxidizer granulate",
		ownerRole: "Utilities lead",
		sdsFileName: "training-oxidizer-granulate-sds.pdf",
		storageLocation: "Oxidizer shelf",
		supplier: "Demo Water Systems",
		usage: "Training fixture dosing",
	},
	{
		casNumber: "n/a",
		controls: ["use_control", "handling"],
		department: "Workshop",
		extractionStatus: "none",
		hazardPictograms: [],
		id: "chem-fixture-unclassified-oil",
		name: "Placeholder machine oil",
		ownerRole: "Workshop lead",
		sdsFileName: null,
		storageLocation: "Service bench",
		supplier: "To be confirmed",
		usage: "Fixture lubrication task",
	},
] as const satisfies readonly ChemicalProfileFixture[];

export type RenderedChemicalProfileFixture = {
	id: string;
	controlLabels: string[];
	fieldLabels: Record<
		| "casNumber"
		| "department"
		| "hazardPictograms"
		| "name"
		| "owner"
		| "storageLocation"
		| "supplier"
		| "usage",
		string
	>;
	name: string;
	quickCardLabels: {
		criticalCheck: string;
		reviewedSource: string;
		spillExposureFirstAction: string;
	};
	recapLabels: {
		controls: string;
		lastReviewed: string;
		openReviews: string;
		sdsCoverage: string;
	};
	reviewActions: {
		approve: string;
		reject: string;
	};
	sdsLabels: {
		currentFile: string;
		uploadHint: string;
		uploadLabel: string;
	};
	statusLabel: string;
};

export function renderChemicalProfileFixture(
	profile: ChemicalProfileFixture,
	locale: Locale,
): RenderedChemicalProfileFixture {
	return {
		controlLabels: profile.controls.map((control) =>
			t(CHEMICAL_CONTROL_TYPE_LABEL_KEYS[control], locale),
		),
		fieldLabels: {
			casNumber: t("chemical.field.casNumber", locale),
			department: t("chemical.field.department", locale),
			hazardPictograms: t("chemical.field.hazardPictograms", locale),
			name: t("chemical.field.name", locale),
			owner: t("chemical.field.owner", locale),
			storageLocation: t("chemical.field.storageLocation", locale),
			supplier: t("chemical.field.supplier", locale),
			usage: t("chemical.field.usage", locale),
		},
		id: profile.id,
		name: profile.name,
		quickCardLabels: {
			criticalCheck: t("chemical.quickCard.criticalCheck", locale),
			reviewedSource: t("chemical.quickCard.reviewedSource", locale),
			spillExposureFirstAction: t(
				"chemical.quickCard.spillExposureFirstAction",
				locale,
			),
		},
		recapLabels: {
			controls: t("chemical.recap.controls", locale),
			lastReviewed: t("chemical.recap.lastReviewed", locale),
			openReviews: t("chemical.recap.openReviews", locale),
			sdsCoverage: t("chemical.recap.sdsCoverage", locale),
		},
		reviewActions: {
			approve: t("chemical.review.approve", locale),
			reject: t("chemical.review.reject", locale),
		},
		sdsLabels: {
			currentFile: t("chemical.sds.currentFile", locale),
			uploadHint: t("chemical.sds.uploadHint", locale),
			uploadLabel: t("chemical.sds.uploadLabel", locale),
		},
		statusLabel: t(
			CHEMICAL_EXTRACTION_STATUS_LABEL_KEYS[profile.extractionStatus],
			locale,
		),
	};
}
