import { t } from "../i18n/t";
import type { Locale, MessageKey } from "../i18n/types";
import type { ChemicalControlType } from "./chemical-control";
import type { ChemicalProfileStatus } from "./chemical-profile";
import {
	CHEMICAL_CONTROL_TYPE_LABEL_KEYS,
	CHEMICAL_EXTRACTION_STATUS_LABEL_KEYS,
	type ChemicalExtractionStatus,
} from "./fixtures";

export type ChemicalProfileViewLabels = {
	readonly actions: {
		readonly add: string;
		readonly cancel: string;
		readonly close: string;
		readonly delete: string;
		readonly grouping: string;
		readonly recap: string;
		readonly save: string;
	};
	readonly empty: {
		readonly body: string;
		readonly cta: string;
		readonly title: string;
	};
	readonly error: string;
	readonly fields: {
		readonly casNumber: string;
		readonly manufacturer: string;
		readonly name: string;
		readonly storagePath: string;
		readonly unNumber: string;
	};
	readonly filters: {
		readonly all: string;
		readonly label: string;
		readonly search: string;
	};
	readonly profileStatus: Record<ChemicalProfileStatus, string>;
	readonly controlTypes: Record<ChemicalControlType, string>;
	readonly extractionStatus: Record<ChemicalExtractionStatus, string>;
	readonly recap: {
		readonly controls: string;
		readonly openReviews: string;
	};
	readonly sds: {
		readonly approve: string;
		readonly approved: string;
		readonly confidence: string;
		readonly currentFile: string;
		readonly excerpt: string;
		readonly extractControls: string;
		readonly extractionText: string;
		readonly model: string;
		readonly pendingReview: string;
		readonly reject: string;
		readonly rejected: string;
		readonly reviewFailed: string;
		readonly reviewQueue: string;
		readonly section: string;
		readonly status: string;
		readonly uploadFailed: string;
		readonly uploadHint: string;
		readonly uploadLabel: string;
	};
	readonly title: string;
};

export type ChemicalControlGroupingViewLabels = {
	readonly actions: {
		readonly next: string;
		readonly previous: string;
	};
	readonly controlTypes: Record<ChemicalControlType, string>;
	readonly counts: {
		readonly controlCountTemplate: string;
		readonly profileCountTemplate: string;
	};
	readonly empty: {
		readonly body: string;
		readonly title: string;
	};
	readonly fields: {
		readonly controlText: string;
		readonly manufacturer: string;
		readonly profile: string;
		readonly status: string;
	};
	readonly profileStatus: Record<ChemicalProfileStatus, string>;
};

export type ChemicalRecapViewLabels = {
	readonly actions: {
		readonly next: string;
		readonly previous: string;
		readonly print: string;
	};
	readonly controlTypes: Record<ChemicalControlType, string>;
	readonly empty: {
		readonly body: string;
		readonly title: string;
	};
	readonly fields: {
		readonly casNumber: string;
		readonly controlText: string;
		readonly controlType: string;
		readonly generalUse: string;
		readonly none: string;
		readonly reviewedByAt: string;
		readonly reviewedSource: string;
		readonly sdsFile: string;
		readonly sdsReviewed: string;
		readonly unNumber: string;
		readonly usageContext: string;
	};
	readonly sections: {
		readonly criticalChecks: string;
		readonly firstActions: string;
		readonly photos: string;
	};
	readonly templates: {
		readonly reviewedByAt: string;
	};
};

export function chemicalProfileViewLabels(
	locale: Locale,
): ChemicalProfileViewLabels {
	return {
		actions: {
			add: tr("chemical.empty.cta", locale),
			cancel: tr("action.cancel", locale),
			close: tr("action.close", locale),
			delete: tr("action.delete", locale),
			grouping: tr("chemical.grouping.link", locale),
			recap: tr("chemical.recap.link", locale),
			save: tr("action.save", locale),
		},
		empty: {
			body: tr("chemical.empty.body", locale),
			cta: tr("chemical.empty.cta", locale),
			title: tr("chemical.empty.title", locale),
		},
		controlTypes: {
			environmental: tr(CHEMICAL_CONTROL_TYPE_LABEL_KEYS.environmental, locale),
			eye_protection: tr(
				CHEMICAL_CONTROL_TYPE_LABEL_KEYS.eye_protection,
				locale,
			),
			fire_fighting: tr(CHEMICAL_CONTROL_TYPE_LABEL_KEYS.fire_fighting, locale),
			first_aid: tr(CHEMICAL_CONTROL_TYPE_LABEL_KEYS.first_aid, locale),
			glove_type: tr(CHEMICAL_CONTROL_TYPE_LABEL_KEYS.glove_type, locale),
			handling: tr(CHEMICAL_CONTROL_TYPE_LABEL_KEYS.handling, locale),
			ppe: tr(CHEMICAL_CONTROL_TYPE_LABEL_KEYS.ppe, locale),
			respiratory: tr(CHEMICAL_CONTROL_TYPE_LABEL_KEYS.respiratory, locale),
			spill_response: tr(
				CHEMICAL_CONTROL_TYPE_LABEL_KEYS.spill_response,
				locale,
			),
			storage: tr(CHEMICAL_CONTROL_TYPE_LABEL_KEYS.storage, locale),
			use_control: tr(CHEMICAL_CONTROL_TYPE_LABEL_KEYS.use_control, locale),
		} satisfies Record<ChemicalControlType, string>,
		error: tr("error.generic.body", locale),
		extractionStatus: {
			approved: tr(CHEMICAL_EXTRACTION_STATUS_LABEL_KEYS.approved, locale),
			extracted: tr(CHEMICAL_EXTRACTION_STATUS_LABEL_KEYS.extracted, locale),
			none: tr(CHEMICAL_EXTRACTION_STATUS_LABEL_KEYS.none, locale),
			pending: tr(CHEMICAL_EXTRACTION_STATUS_LABEL_KEYS.pending, locale),
			review_required: tr(
				CHEMICAL_EXTRACTION_STATUS_LABEL_KEYS.review_required,
				locale,
			),
		} satisfies Record<ChemicalExtractionStatus, string>,
		fields: {
			casNumber: tr("chemical.field.casNumber", locale),
			manufacturer: tr("chemical.field.supplier", locale),
			name: tr("chemical.field.name", locale),
			storagePath: tr("chemical.sds.currentFile", locale),
			unNumber: tr("chemical.field.unNumber", locale),
		},
		filters: {
			all: tr("chemical.profileStatus.all", locale),
			label: tr("chemical.list.filters", locale),
			search: tr("common.search", locale),
		},
		profileStatus: {
			active: tr("chemical.profileStatus.active", locale),
			archived: tr("chemical.profileStatus.archived", locale),
			draft: tr("chemical.profileStatus.draft", locale),
		},
		recap: {
			controls: tr("chemical.recap.controls", locale),
			openReviews: tr("chemical.recap.openReviews", locale),
		},
		sds: {
			approve: tr("action.approve", locale),
			approved: tr("chemical.review.approved", locale),
			confidence: tr("chemical.sds.confidence", locale),
			currentFile: tr("chemical.sds.currentFile", locale),
			excerpt: tr("chemical.sds.excerpt", locale),
			extractControls: tr("chemical.sds.extractControls", locale),
			extractionText: tr("chemical.sds.extractionText", locale),
			model: tr("chemical.sds.model", locale),
			pendingReview: tr("chemical.review.pending", locale),
			reject: tr("chemical.review.reject", locale),
			rejected: tr("chemical.review.rejected", locale),
			reviewFailed: tr("chemical.sds.reviewFailed", locale),
			reviewQueue: tr("chemical.sds.reviewQueue", locale),
			section: tr("chemical.sds.section", locale),
			status: tr("actionBoard.field.status", locale),
			uploadFailed: tr("chemical.sds.uploadFailed", locale),
			uploadHint: tr("chemical.sds.uploadHint", locale),
			uploadLabel: tr("chemical.sds.uploadLabel", locale),
		},
		title: tr("chemical.list.title", locale),
	};
}

export function chemicalControlGroupingViewLabels(
	locale: Locale,
): ChemicalControlGroupingViewLabels {
	return {
		actions: {
			next: tr("action.continue", locale),
			previous: tr("action.back", locale),
		},
		controlTypes: controlTypeLabels(locale),
		counts: {
			controlCountTemplate: tr("chemical.grouping.controlCount", locale),
			profileCountTemplate: tr("chemical.grouping.profileCount", locale),
		},
		empty: {
			body: tr("chemical.grouping.empty.body", locale),
			title: tr("chemical.grouping.empty.title", locale),
		},
		fields: {
			controlText: tr("chemical.grouping.controlText", locale),
			manufacturer: tr("chemical.field.supplier", locale),
			profile: tr("chemical.field.name", locale),
			status: tr("actionBoard.field.status", locale),
		},
		profileStatus: {
			active: tr("chemical.profileStatus.active", locale),
			archived: tr("chemical.profileStatus.archived", locale),
			draft: tr("chemical.profileStatus.draft", locale),
		},
	};
}

export function chemicalRecapViewLabels(
	locale: Locale,
): ChemicalRecapViewLabels {
	return {
		actions: {
			next: tr("action.continue", locale),
			previous: tr("action.back", locale),
			print: tr("chemical.recap.print", locale),
		},
		controlTypes: controlTypeLabels(locale),
		empty: {
			body: tr("chemical.recap.empty.body", locale),
			title: tr("chemical.recap.empty.title", locale),
		},
		fields: {
			casNumber: tr("chemical.field.casNumber", locale),
			controlText: tr("chemical.grouping.controlText", locale),
			controlType: tr("chemical.recap.controlType", locale),
			generalUse: tr("chemical.recap.generalUse", locale),
			none: tr("chemical.recap.none", locale),
			reviewedByAt: tr("chemical.recap.reviewedByAt", locale),
			reviewedSource: tr("chemical.quickCard.reviewedSource", locale),
			sdsFile: tr("chemical.sds.currentFile", locale),
			sdsReviewed: tr("chemical.recap.sdsReviewed", locale),
			unNumber: tr("chemical.field.unNumber", locale),
			usageContext: tr("chemical.field.usage", locale),
		},
		sections: {
			criticalChecks: tr("chemical.quickCard.criticalCheck", locale),
			firstActions: tr("chemical.quickCard.spillExposureFirstAction", locale),
			photos: tr("actionBoard.attachment.photo", locale),
		},
		templates: {
			reviewedByAt: tr("chemical.recap.reviewedByAtTemplate", locale),
		},
	};
}

function controlTypeLabels(
	locale: Locale,
): Record<ChemicalControlType, string> {
	return {
		environmental: tr(CHEMICAL_CONTROL_TYPE_LABEL_KEYS.environmental, locale),
		eye_protection: tr(CHEMICAL_CONTROL_TYPE_LABEL_KEYS.eye_protection, locale),
		fire_fighting: tr(CHEMICAL_CONTROL_TYPE_LABEL_KEYS.fire_fighting, locale),
		first_aid: tr(CHEMICAL_CONTROL_TYPE_LABEL_KEYS.first_aid, locale),
		glove_type: tr(CHEMICAL_CONTROL_TYPE_LABEL_KEYS.glove_type, locale),
		handling: tr(CHEMICAL_CONTROL_TYPE_LABEL_KEYS.handling, locale),
		ppe: tr(CHEMICAL_CONTROL_TYPE_LABEL_KEYS.ppe, locale),
		respiratory: tr(CHEMICAL_CONTROL_TYPE_LABEL_KEYS.respiratory, locale),
		spill_response: tr(CHEMICAL_CONTROL_TYPE_LABEL_KEYS.spill_response, locale),
		storage: tr(CHEMICAL_CONTROL_TYPE_LABEL_KEYS.storage, locale),
		use_control: tr(CHEMICAL_CONTROL_TYPE_LABEL_KEYS.use_control, locale),
	} satisfies Record<ChemicalControlType, string>;
}

function tr(key: MessageKey, locale: Locale): string {
	return t(key, locale);
}
