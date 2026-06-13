import assert from "node:assert/strict";
import test from "node:test";

const chemicalControlModulePath =
	"../../../src/lib/chemicals/chemical-control.ts";
const {
	CHEMICAL_CONTROL_REVIEW_STATUSES,
	CHEMICAL_CONTROL_SOURCE_PROVENANCES,
	CHEMICAL_CONTROL_TYPES,
	ChemicalControlValidationError,
	isChemicalControlOperationallyUsable,
	isChemicalControlReviewStatus,
	isChemicalControlSourceProvenance,
	isChemicalControlType,
	prepareChemicalControlForStorage,
} = (await import(
	chemicalControlModulePath
)) as typeof import("../../../src/lib/chemicals/chemical-control");

const tenantId = "11111111-1111-4111-8111-111111111111";
const otherTenantId = "33333333-3333-4333-8333-333333333333";
const profileId = "22222222-2222-4222-8222-222222222222";
const reviewerId = "44444444-4444-4444-8444-444444444444";

test("chemical control constants cover accepted schema values", () => {
	assert.deepEqual(CHEMICAL_CONTROL_TYPES, [
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
	]);
	assert.deepEqual(CHEMICAL_CONTROL_SOURCE_PROVENANCES, [
		"manual",
		"sds_extraction",
	]);
	assert.deepEqual(CHEMICAL_CONTROL_REVIEW_STATUSES, [
		"pending",
		"approved",
		"rejected",
	]);

	assert.equal(isChemicalControlType("ppe"), true);
	assert.equal(isChemicalControlType("engineering"), false);
	assert.equal(isChemicalControlSourceProvenance("sds_extraction"), true);
	assert.equal(isChemicalControlSourceProvenance("imported"), false);
	assert.equal(isChemicalControlReviewStatus("approved"), true);
	assert.equal(isChemicalControlReviewStatus("active"), false);
});

test("prepareChemicalControlForStorage trims manual controls and applies defaults", () => {
	const record = prepareChemicalControlForStorage({
		chemicalProfileId: ` ${profileId} `,
		controlText: " Wear splash goggles ",
		controlType: "eye_protection",
		tenantId: ` ${tenantId} `,
	});

	assert.deepEqual(record, {
		chemicalProfileId: profileId,
		controlText: "Wear splash goggles",
		controlType: "eye_protection",
		extractionConfidence: null,
		extractionModelMarker: null,
		pageLineRef: null,
		reviewStatus: "pending",
		reviewedAt: null,
		reviewedByUserId: null,
		sdsSection: null,
		sortOrder: 0,
		sourceExcerpt: null,
		sourceFilename: null,
		sourceProvenance: "manual",
		sourceStoragePath: null,
	});
	assert.equal(isChemicalControlOperationallyUsable(record), true);
});

test("SDS-extracted controls require provenance and approval before use", () => {
	assert.throws(
		() =>
			prepareChemicalControlForStorage({
				chemicalProfileId: profileId,
				controlText: "Use local exhaust ventilation",
				controlType: "use_control",
				sourceProvenance: "sds_extraction",
				tenantId,
			}),
		ChemicalControlValidationError,
	);

	const pending = prepareChemicalControlForStorage({
		chemicalProfileId: profileId,
		controlText: "Use local exhaust ventilation",
		controlType: "use_control",
		extractionConfidence: 0.72,
		extractionModelMarker: "mock-llm-fixture",
		pageLineRef: "p. 4",
		sdsSection: "Section 8 - Exposure Controls",
		sourceExcerpt: "Use local exhaust ventilation.",
		sourceFilename: "fixture-sds.pdf",
		sourceProvenance: "sds_extraction",
		sourceStoragePath: `tenants/${tenantId}/attachments/fixture-sds.pdf`,
		tenantId,
	});

	assert.equal(pending.reviewStatus, "pending");
	assert.equal(isChemicalControlOperationallyUsable(pending), false);

	const approved = prepareChemicalControlForStorage({
		...pending,
		reviewStatus: "approved",
		reviewedAt: "2026-05-05T08:00:00.000Z",
		reviewedByUserId: reviewerId.toUpperCase(),
		tenantId,
	});

	assert.equal(approved.reviewedByUserId, reviewerId);
	assert.equal(isChemicalControlOperationallyUsable(approved), true);
});

test("chemical control validation rejects review, confidence, and storage-path drift", () => {
	assert.throws(
		() =>
			prepareChemicalControlForStorage({
				chemicalProfileId: profileId,
				controlText: "Wear gloves",
				controlType: "glove_type",
				reviewStatus: "approved",
				tenantId,
			}),
		ChemicalControlValidationError,
	);

	assert.throws(
		() =>
			prepareChemicalControlForStorage({
				chemicalProfileId: profileId,
				controlText: "Wear gloves",
				controlType: "glove_type",
				reviewedByUserId: reviewerId,
				tenantId,
			}),
		ChemicalControlValidationError,
	);

	assert.throws(
		() =>
			prepareChemicalControlForStorage({
				chemicalProfileId: profileId,
				controlText: "Wear gloves",
				controlType: "glove_type",
				reviewedAt: "2026-05-05T08:00:00.000Z",
				tenantId,
			}),
		ChemicalControlValidationError,
	);

	assert.throws(
		() =>
			prepareChemicalControlForStorage({
				chemicalProfileId: profileId,
				controlText: "Keep away from drains",
				controlType: "environmental",
				extractionConfidence: 1.2,
				tenantId,
			}),
		ChemicalControlValidationError,
	);

	assert.throws(() =>
		prepareChemicalControlForStorage({
			chemicalProfileId: profileId,
			controlText: "Store locked",
			controlType: "storage",
			sourceStoragePath: `tenants/${otherTenantId}/attachments/fixture-sds.pdf`,
			tenantId,
		}),
	);
});
