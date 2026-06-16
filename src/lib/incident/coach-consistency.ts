export type ManualIncidentRecordChangeArea =
	| "overview"
	| "facts"
	| "causes"
	| "actions";

export type ManualIncidentRecordChange = {
	readonly area: ManualIncidentRecordChangeArea;
	readonly summary: string;
};

const introByLocale: Record<string, string> = {
	de: "Ich habe den Untersuchungsdatensatz manuell geändert.",
	en: "I manually changed the investigation record.",
	fr: "J'ai modifié manuellement le dossier d'enquête.",
	it: "Ho modificato manualmente il record dell'indagine.",
};

const instructionByLocale: Record<string, string> = {
	de: "Bitte prüfe den aktuellen Datensatz auf logische Konsistenz. Prüfe Fakten, Zeitlinie, Ursachen, Ursache-Wirkungs-Beziehungen, Massnahmen, Abhängigkeiten, mögliche Schwere und HIRA-Folgen. Wenn etwas nicht mehr trägt, erkläre es kurz und erstelle normale Vorschläge zur Genehmigung. Wenn alles weiterhin passt, sag das klar und erstelle keine Vorschläge.",
	en: "Please review the current record for logical consistency. Check facts, timeline, causes, causal dependencies, measures, dependencies, potential severity, and HIRA follow-up. If something no longer holds, explain it briefly and create normal approval-card proposals. If everything still holds, say so clearly and create no proposals.",
	fr: "Vérifie la cohérence logique du dossier actuel. Contrôle les faits, la chronologie, les causes, les liens de causalité, les mesures, les dépendances, la gravité potentielle et le suivi HIRA. Si quelque chose ne tient plus, explique-le brièvement et crée des propositions normales à approuver. Si tout tient encore, dis-le clairement et ne crée aucune proposition.",
	it: "Controlla la coerenza logica del record attuale. Verifica fatti, cronologia, cause, dipendenze causali, misure, dipendenze, gravità potenziale e follow-up HIRA. Se qualcosa non regge più, spiegalo brevemente e crea normali proposte da approvare. Se tutto regge ancora, dillo chiaramente e non creare proposte.",
};

export function buildManualEditConsistencyReviewMessage(input: {
	readonly locale: string;
	readonly changes: readonly ManualIncidentRecordChange[];
}): string {
	const base = input.locale.split("-")[0]?.toLowerCase() ?? "en";
	const intro = introByLocale[base] ?? introByLocale.en;
	const instruction = instructionByLocale[base] ?? instructionByLocale.en;
	const changes = input.changes
		.map((change) => ({
			area: change.area,
			summary: change.summary.trim(),
		}))
		.filter((change) => change.summary)
		.map((change) => `- ${change.area}: ${change.summary}`);

	return [
		intro,
		"",
		"Changes:",
		...(changes.length > 0 ? changes : ["- record: manual edit"]),
		"",
		instruction,
	].join("\n");
}
