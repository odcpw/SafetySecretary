import { z } from "zod";

export const HAZARD_CATEGORY_CODES = [
	"MECHANICAL",
	"FALLS",
	"ELECTRICAL",
	"HAZARDOUS_SUBSTANCES",
	"FIRE_EXPLOSION",
	"THERMAL",
	"PHYSICAL_AGENTS",
	"ENVIRONMENTAL",
	"MUSCULOSKELETAL",
	"PSYCHOSOCIAL",
	"UNEXPECTED_ACTIONS",
	"WORK_ORGANISATION",
] as const;

// eventType — how the harm happened (accident-mechanism axis). SINGLE SOURCE OF
// TRUTH: the coach (apply-operation.ts), both incident API routes, and the
// incident_case.event_type SQL CHECK constraint must all agree with this list.
// Additive only — appending is safe; removing/renaming orphans existing records.
// Keep in lockstep with EVENT_TYPE_LABELS (labels.ts), the coach-prompt enum,
// and db/sql migration 00360.
export const EVENT_TYPE_CODES = [
	"SLIP_TRIP_FALL",
	"FALL_FROM_HEIGHT",
	"STRUCK_BY",
	"CAUGHT_IN_BETWEEN",
	"CUT_PUNCTURE",
	"MANUAL_HANDLING",
	"CONTACT_HOT_COLD",
	"CONTACT_WITH_CHEMICAL",
	"ELECTRICITY",
	"VEHICLE_TRAFFIC",
	"FIRE_EXPLOSION",
	"HARMFUL_EXPOSURE",
	"PROPERTY_DAMAGE",
	"OTHER",
] as const;

export type EventTypeCode = (typeof EVENT_TYPE_CODES)[number];

export const SEVERITY_CODES = ["A", "B", "C", "D", "E"] as const;

export const LIKELIHOOD_CODES = ["1", "2", "3", "4", "5"] as const;

export const RISK_BAND_CODES = ["HIGH", "MEDIUM", "LOW"] as const;

export const CONTROL_HIERARCHY_CODES = [
	"SUBSTITUTION",
	"TECHNICAL",
	"ORGANIZATIONAL",
	"PPE",
] as const;

export type HazardCategoryCode = (typeof HAZARD_CATEGORY_CODES)[number];
export type SeverityCode = (typeof SEVERITY_CODES)[number];
export type LikelihoodCode = (typeof LIKELIHOOD_CODES)[number];
export type RiskBandCode = (typeof RISK_BAND_CODES)[number];
export type ControlHierarchyCode = (typeof CONTROL_HIERARCHY_CODES)[number];

export const CONTROL_HIERARCHY_LETTERS: Record<ControlHierarchyCode, string> = {
	SUBSTITUTION: "S",
	TECHNICAL: "T",
	ORGANIZATIONAL: "O",
	PPE: "P",
} as const;

export const TAXONOMY_CANONICAL_CODES = {
	categories: HAZARD_CATEGORY_CODES,
	severity: SEVERITY_CODES,
	likelihood: LIKELIHOOD_CODES,
	riskBands: RISK_BAND_CODES,
	controlHierarchy: CONTROL_HIERARCHY_CODES,
} as const;

const requiredText = z.string().trim().min(1, "must not be empty");
const requiredLabel = z.string().trim().min(1, "label must not be empty");

const categorySchema = z
	.object({
		code: z.enum(HAZARD_CATEGORY_CODES),
		label: requiredLabel,
		description: requiredText,
		examples: z.array(requiredText).min(1, "examples must not be empty"),
	})
	.strict();

const severitySchema = z
	.object({
		code: z.enum(SEVERITY_CODES),
		label: requiredLabel,
		anchor: requiredText,
	})
	.strict();

const likelihoodSchema = z
	.object({
		code: z.enum(LIKELIHOOD_CODES),
		label: requiredLabel,
		anchor: requiredText,
	})
	.strict();

const riskBandSchema = z
	.object({
		code: z.enum(RISK_BAND_CODES),
		label: requiredLabel,
	})
	.strict();

const controlHierarchySchema = z
	.object({
		code: z.enum(CONTROL_HIERARCHY_CODES),
		letter: z.enum(["S", "T", "O", "P"]),
		label: requiredLabel,
	})
	.strict()
	.superRefine((entry, context) => {
		const expectedLetter = CONTROL_HIERARCHY_LETTERS[entry.code];

		if (entry.letter !== expectedLetter) {
			context.addIssue({
				code: "custom",
				path: ["letter"],
				message: `letter must be ${expectedLetter} for ${entry.code}`,
			});
		}
	});

export const TaxonomyFileSchema = z
	.object({
		categories: z.array(categorySchema),
		severity: z.array(severitySchema),
		likelihood: z.array(likelihoodSchema),
		riskBands: z.array(riskBandSchema),
		controlHierarchy: z.array(controlHierarchySchema),
	})
	.strict()
	.superRefine((fixture, context) => {
		enforceExactCodeSet(
			"categories",
			fixture.categories,
			HAZARD_CATEGORY_CODES,
			context,
		);
		enforceExactCodeSet("severity", fixture.severity, SEVERITY_CODES, context);
		enforceExactCodeSet(
			"likelihood",
			fixture.likelihood,
			LIKELIHOOD_CODES,
			context,
		);
		enforceExactCodeSet(
			"riskBands",
			fixture.riskBands,
			RISK_BAND_CODES,
			context,
		);
		enforceExactCodeSet(
			"controlHierarchy",
			fixture.controlHierarchy,
			CONTROL_HIERARCHY_CODES,
			context,
		);
	});

export type TaxonomyFile = z.infer<typeof TaxonomyFileSchema>;

type CodeEntry = { code: string };

function enforceExactCodeSet(
	path: keyof typeof TAXONOMY_CANONICAL_CODES,
	entries: readonly CodeEntry[],
	expectedCodes: readonly string[],
	context: z.RefinementCtx,
) {
	const seen = new Map<string, number>();

	entries.forEach((entry, index) => {
		if (seen.has(entry.code)) {
			context.addIssue({
				code: "custom",
				path: [path, index, "code"],
				message: `duplicate code ${entry.code}`,
			});
			return;
		}

		seen.set(entry.code, index);
	});

	const missingCodes = expectedCodes.filter((code) => !seen.has(code));

	if (missingCodes.length > 0) {
		context.addIssue({
			code: "custom",
			path: [path],
			message: `missing code(s): ${missingCodes.join(", ")}`,
		});
	}

	if (entries.length !== expectedCodes.length) {
		context.addIssue({
			code: "custom",
			path: [path],
			message: `expected ${expectedCodes.length} entries, received ${entries.length}`,
		});
	}
}
