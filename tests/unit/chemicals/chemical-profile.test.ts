import assert from "node:assert/strict";
import test from "node:test";

const chemicalProfileModulePath =
	"../../../src/lib/chemicals/chemical-profile.ts";
const {
	CHEMICAL_PROFILE_EXTRACTION_STATUSES,
	CHEMICAL_PROFILE_STATUSES,
	ChemicalProfileValidationError,
	isChemicalProfileExtractionStatus,
	isChemicalProfileStatus,
	prepareChemicalProfileForStorage,
} = (await import(
	chemicalProfileModulePath
)) as typeof import("../../../src/lib/chemicals/chemical-profile");

const tenantId = "11111111-1111-4111-8111-111111111111";
const reviewerId = "22222222-2222-4222-8222-222222222222";

test("chemical profile status constants cover accepted schema values", () => {
	assert.deepEqual(CHEMICAL_PROFILE_STATUSES, ["draft", "active", "archived"]);
	assert.deepEqual(CHEMICAL_PROFILE_EXTRACTION_STATUSES, [
		"none",
		"pending",
		"extracted",
		"review_required",
		"approved",
	]);

	assert.equal(isChemicalProfileStatus("active"), true);
	assert.equal(isChemicalProfileStatus("deleted"), false);
	assert.equal(isChemicalProfileExtractionStatus("review_required"), true);
	assert.equal(isChemicalProfileExtractionStatus("ready"), false);
});

test("prepareChemicalProfileForStorage trims text and applies defaults", () => {
	const record = prepareChemicalProfileForStorage({
		casNumber: " 64-17-5 ",
		manufacturer: " Example Supplier ",
		productName: " Synthetic solvent ",
		tenantId,
		unNumber: null,
	});

	assert.deepEqual(record, {
		casNumber: "64-17-5",
		extractionStatus: "none",
		manufacturer: "Example Supplier",
		productName: "Synthetic solvent",
		profileStatus: "draft",
		sdsReviewed: false,
		sdsReviewedAt: null,
		sdsReviewedByUserId: null,
		storagePath: null,
		tenantId,
		unNumber: null,
	});
});

test("SDS review requires reviewer and timestamp when marked reviewed", () => {
	assert.throws(
		() =>
			prepareChemicalProfileForStorage({
				manufacturer: "Example Supplier",
				productName: "Synthetic solvent",
				sdsReviewed: true,
				sdsReviewedByUserId: reviewerId,
				tenantId,
			}),
		ChemicalProfileValidationError,
	);

	const record = prepareChemicalProfileForStorage({
		manufacturer: "Example Supplier",
		productName: "Synthetic solvent",
		sdsReviewed: true,
		sdsReviewedAt: "2026-05-05T08:00:00.000Z",
		sdsReviewedByUserId: reviewerId,
		tenantId,
	});

	assert.equal(record.sdsReviewed, true);
	assert.equal(record.sdsReviewedByUserId, reviewerId);
	assert.equal(record.sdsReviewedAt?.toISOString(), "2026-05-05T08:00:00.000Z");
});

test("chemical profile validation rejects wrong status and cross-tenant SDS paths", () => {
	assert.throws(
		() =>
			prepareChemicalProfileForStorage({
				extractionStatus: "ready" as never,
				manufacturer: "Example Supplier",
				productName: "Synthetic solvent",
				tenantId,
			}),
		ChemicalProfileValidationError,
	);

	assert.throws(() =>
		prepareChemicalProfileForStorage({
			manufacturer: "Example Supplier",
			productName: "Synthetic solvent",
			storagePath:
				"tenants/33333333-3333-4333-8333-333333333333/attachments/44444444-4444-4444-8444-444444444444.pdf",
			tenantId,
		}),
	);
});
