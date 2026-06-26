export type PotentialSeverityCode = "A" | "B" | "C" | "D" | "E";

const severityCodes: readonly PotentialSeverityCode[] = ["A", "B", "C", "D", "E"];
const severitySet = new Set<string>(severityCodes);

const severityRank: Record<PotentialSeverityCode, number> = {
	A: 0,
	B: 1,
	C: 2,
	D: 3,
	E: 4,
};

export function parsePotentialSeverity(value: unknown): PotentialSeverityCode | null {
	const text = typeof value === "string" ? value.trim() : "";
	return severitySet.has(text) ? (text as PotentialSeverityCode) : null;
}

export function normalizePotentialSeverityForEvidence(
	proposed: PotentialSeverityCode,
	evidence: string,
): PotentialSeverityCode {
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
	proposed: PotentialSeverityCode,
	minimum: PotentialSeverityCode,
): boolean {
	return severityRank[proposed] > severityRank[minimum];
}

function hasFatalPath(text: string): boolean {
	return /\b(fatal|fatality|death|dead|die|died|killed|kill|lethal|tod|tödlich|toedlich|todlich)\b/.test(
		text,
	);
}

function hasCredibleFatalToxicExposure(text: string): boolean {
	const hasToxicAgent =
		/\b(hcn|hydrogen cyanide|cyanide|cyanwasserstoff|zyanwasserstoff|blausäure|blausaure|blausaeure)\b/.test(
			text,
		) || /\b(toxic|toxisch|poison|poisoning|vergiftung|gas)\b/.test(text);
	const hasExposurePath =
		/\b(exposure|exposed|inhale|inhalation|poisoning|respiratory|alarm|ppm|monitor|evacuat|delayed|missed|lone|alone|continued|weiter|verzögert|verzoegert|verzogert|alarmierung)\b/.test(
			text,
		);
	return hasToxicAgent && hasExposurePath;
}

function hasIrreversibleInjuryPath(text: string): boolean {
	return /\b(amput|teilamput|irreversible|permanent|lasting|dauerhaft|bleibend|disab|invalid|verkürzt|verkurzt|verkuerzt|funktionsbeeinträchtigung|funktionsbeeintraechtigung|funktionsbeeintrachtigung|tendon|nerve|sehne|nerv)\b/.test(
		text,
	);
}

function hasLostTimeOrHospitalPath(text: string): boolean {
	return /\b(hospital|hospitalisation|hospitalization|admitted|admission|clinic|chirurgie|luks|spital|krankenhaus|arbeitsausfall|lost time|missed work|off work|days off|ausfall|stationär|stationaer|stationar)\b/.test(
		text,
	);
}

function normalizeSeverityEvidence(value: string): string {
	return value.toLowerCase().normalize("NFC");
}
