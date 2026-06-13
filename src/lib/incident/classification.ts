import {
	LIKELIHOOD_CODES,
	RISK_BAND_CODES,
	SEVERITY_CODES,
	type LikelihoodCode,
	type RiskBandCode,
	type SeverityCode,
} from "../taxonomy/schema";
import { lookupRiskBand } from "../methodology/risk-matrix";

export type IncidentType = "NEAR_MISS" | "ACCIDENT" | "PROPERTY_DAMAGE";

export type IncidentActualInjuryOutcome =
	| "UNKNOWN"
	| "NO_INJURY"
	| "FIRST_AID"
	| "MEDICAL_TREATMENT"
	| "LOST_TIME"
	| "IRREVERSIBLE_INJURY"
	| "FATALITY";

export const INCIDENT_TYPE_CODES: readonly IncidentType[] = [
	"NEAR_MISS",
	"ACCIDENT",
	"PROPERTY_DAMAGE",
];

export const INCIDENT_ACTUAL_INJURY_OUTCOME_CODES: readonly IncidentActualInjuryOutcome[] =
	[
		"UNKNOWN",
		"NO_INJURY",
		"FIRST_AID",
		"MEDICAL_TREATMENT",
		"LOST_TIME",
		"IRREVERSIBLE_INJURY",
		"FATALITY",
	];

const incidentTypeSet = new Set<string>(INCIDENT_TYPE_CODES);
const actualInjuryOutcomeSet = new Set<string>(
	INCIDENT_ACTUAL_INJURY_OUTCOME_CODES,
);
const severitySet = new Set<string>(SEVERITY_CODES);
const likelihoodSet = new Set<string>(LIKELIHOOD_CODES);
const riskBandSet = new Set<string>(RISK_BAND_CODES);

export function parseIncidentType(value: string): IncidentType | null {
	if (value === "FIRST_AID" || value === "LOST_TIME") {
		return "ACCIDENT";
	}

	return incidentTypeSet.has(value) ? (value as IncidentType) : null;
}

export function parseActualInjuryOutcome(
	value: unknown,
	rawIncidentType = "",
): IncidentActualInjuryOutcome | null {
	if (rawIncidentType === "FIRST_AID" || rawIncidentType === "LOST_TIME") {
		return rawIncidentType;
	}

	const text = stringValue(value);
	return actualInjuryOutcomeSet.has(text)
		? (text as IncidentActualInjuryOutcome)
		: null;
}

export function defaultActualInjuryOutcomeFor(
	incidentType: IncidentType,
): IncidentActualInjuryOutcome {
	return incidentType === "ACCIDENT" ? "UNKNOWN" : "NO_INJURY";
}

export function normalizeIncidentClassification(row: {
	actualInjuryOutcome?: string | null;
	incidentType: string;
}): {
	actualInjuryOutcome: IncidentActualInjuryOutcome;
	incidentType: IncidentType;
} {
	if (row.incidentType === "FIRST_AID" || row.incidentType === "LOST_TIME") {
		return {
			actualInjuryOutcome: parseActualInjuryOutcome(
				row.actualInjuryOutcome,
				row.incidentType,
			) ?? row.incidentType,
			incidentType: "ACCIDENT",
		};
	}

	const incidentType = parseIncidentType(row.incidentType) ?? "NEAR_MISS";

	return {
		actualInjuryOutcome:
			parseActualInjuryOutcome(row.actualInjuryOutcome) ??
			defaultActualInjuryOutcomeFor(incidentType),
		incidentType,
	};
}

export function parseSeverity(value: unknown): SeverityCode | null {
	const text = stringValue(value);
	return severitySet.has(text) ? (text as SeverityCode) : null;
}

export function parsePotentialSeverity(value: unknown): SeverityCode | null {
	return parseSeverity(value);
}

export function deriveActualSeverityFromOutcome(
	outcome: IncidentActualInjuryOutcome,
): SeverityCode | null {
	switch (outcome) {
		case "FATALITY":
			return "A";
		case "IRREVERSIBLE_INJURY":
			return "B";
		case "LOST_TIME":
			return "C";
		case "MEDICAL_TREATMENT":
			return "D";
		case "FIRST_AID":
			return "E";
		case "NO_INJURY":
		case "UNKNOWN":
			return null;
	}
}

export function parsePotentialLikelihood(value: unknown): LikelihoodCode | null {
	const text = stringValue(value);
	return likelihoodSet.has(text) ? (text as LikelihoodCode) : null;
}

export function parsePotentialRiskBand(value: unknown): RiskBandCode | null {
	const text = stringValue(value);
	return riskBandSet.has(text) ? (text as RiskBandCode) : null;
}

export function computePotentialRiskBand(
	severity: SeverityCode,
	likelihood: LikelihoodCode,
): RiskBandCode {
	return lookupRiskBand(severity, likelihood);
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}
