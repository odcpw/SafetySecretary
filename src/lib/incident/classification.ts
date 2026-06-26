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

const severityRank: Record<SeverityCode, number> = {
	A: 0,
	B: 1,
	C: 2,
	D: 3,
	E: 4,
};

export function normalizePotentialSeverityForEvidence(
	proposed: SeverityCode,
	evidence: string,
): SeverityCode {
	const text = normalizeSeverityEvidence(evidence);
	if (hasCredibleFatalToxicExposure(text) || hasFatalPath(text)) {
		return "A";
	}
	if (hasIrreversibleInjuryPath(text) && isLessSevereThan(proposed, "B")) {
		return "B";
	}
	if (hasLostTimeOrHospitalPath(text) && isLessSevereThan(proposed, "C")) {
		return "C";
	}
	return proposed;
}

function isLessSevereThan(
	proposed: SeverityCode,
	minimum: SeverityCode,
): boolean {
	return severityRank[proposed] > severityRank[minimum];
}

function hasFatalPath(text: string): boolean {
	return /\b(fatal|fatality|death|dead|die|died|killed|kill|lethal|tod|toedlich|todlich)\b/.test(
		text,
	);
}

function hasCredibleFatalToxicExposure(text: string): boolean {
	const hasToxicAgent =
		/\b(hcn|hydrogen cyanide|cyanide|cyanwasserstoff|zyanwasserstoff|blausaure|blausaeure)\b/.test(
			text,
		) || /\b(toxic|toxisch|poison|poisoning|vergiftung|gas)\b/.test(text);
	const hasExposurePath =
		/\b(exposure|exposed|inhale|inhalation|poisoning|respiratory|alarm|ppm|monitor|evacuat|delayed|missed|lone|alone|continued|weiter|verzoegert|verzogert|alarmierung)\b/.test(
			text,
		);
	return hasToxicAgent && hasExposurePath;
}

function hasIrreversibleInjuryPath(text: string): boolean {
	return /\b(amput|teilamput|irreversible|permanent|lasting|dauerhaft|bleibend|disab|invalid|verkürzt|verkurzt|verkuerzt|funktionsbeeintraechtigung|funktionsbeeintrachtigung|tendon|nerve|sehne|nerv)\b/.test(
		text,
	);
}

function hasLostTimeOrHospitalPath(text: string): boolean {
	return /\b(hospital|hospitalisation|hospitalization|admitted|admission|clinic|chirurgie|luks|spital|krankenhaus|arbeitsausfall|lost time|missed work|off work|days off|ausfall|stationaer|stationar)\b/.test(
		text,
	);
}

function normalizeSeverityEvidence(value: string): string {
	return value
		.toLowerCase()
		.normalize("NFKD")
		.replace(/\p{Diacritic}/gu, "");
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
