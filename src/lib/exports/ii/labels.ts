import { t } from "../../i18n/t";
import type { Locale, MessageKey } from "../../i18n/types";
import {
	type ControlHierarchyCode,
	getCategoryLabel,
	getControlHierarchyLabel,
	getLikelihoodLabel,
	getRiskBandLabel,
	getSeverityLabel,
	type HazardCategoryCode,
	type LikelihoodCode,
	type RiskBandCode,
	type SeverityCode,
	type TaxonomyLocale,
} from "../../taxonomy";

export type IIExportLabels = {
	titles: {
		fullReport: string;
		commsOnePager: string;
		managerOnePager: string;
	};
	onePager: {
		facts: string;
		whatHappened: string;
		causes: string;
		actions: string;
		lessonsLearned: string;
		asTeamMember: string;
		asFrontlineManager: string;
		asExecutive: string;
	};
	sections: {
		actionPlan: string;
		causeTree: string;
		changesBeingMade: string;
		factsTimeline: string;
		hiraFollowup: string;
		incidentSummary: string;
		overview: string;
		personsInvolved: string;
		photos: string;
		rootCauses: string;
		statementFacts: string;
		teamMemberActions: string;
		timeline: string;
	};
	fields: {
		actual: string;
		bodyPart: string;
		coordinator: string;
		department: string;
		due: string;
		expected: string;
		hazardCategory: string;
		incidentTime: string;
		incidentType: string;
		injuryNature: string;
		actualInjuryOutcome: string;
		actualSeverity: string;
		location: string;
		lostDays: string;
		owner: string;
		potentialLikelihood: string;
		potentialOutcome: string;
		potentialRisk: string;
		potentialSeverity: string;
		status: string;
		title: string;
		workActivity: string;
	};
	fallbacks: {
		hiraFollowupNeeded: string;
		noCorrectiveActions: string;
		noCauseTree: string;
		noPersons: string;
		noRootCauses: string;
		noTimeline: string;
		notRecorded: string;
		open: string;
		teamDefault: string;
		timelinePhoto: string;
		timelinePhotoFor: string;
		unassigned: string;
		unspecified: string;
		untimed: string;
	};
	markers: {
		parked: string;
		rootCause: string;
	};
	prefixes: {
		rootCause: string;
		supportCorrectiveAction: string;
	};
	tableHeaders: {
		cause: string;
		due: string;
		measure: string;
		owner: string;
		status: string;
		stop: string;
	};
};

const labelsByLocale: Record<Locale, IIExportLabels> = {
	de: {
		fields: {
			actual: "tatsächlich",
			bodyPart: "Körperteil",
			coordinator: "Koordination",
			department: "Abteilung / Bereich",
			due: "fällig",
			expected: "Erwartet",
			hazardCategory: "Gefährdungsart",
			incidentTime: "Ereigniszeit",
			incidentType: "Ereignistyp",
			injuryNature: "Verletzungsart",
			actualInjuryOutcome: "Tatsächlicher Verletzungsausgang",
			actualSeverity: "Tatsächliche Schwere",
			location: "Ort",
			lostDays: "Ausfalltage",
			owner: "Verantwortung",
			potentialLikelihood: "Potenzielle Wahrscheinlichkeit",
			potentialOutcome: "Potenzielle Auswirkung",
			potentialRisk: "Potenzielles Risiko",
			potentialSeverity: "Potenzielle Schwere",
			status: "Status",
			title: "Titel",
			workActivity: "Tätigkeit",
		},
		fallbacks: {
			hiraFollowupNeeded: "HIRA-Nacharbeit erforderlich.",
			noCauseTree: "Kein Ursachenbaum erfasst.",
			noCorrectiveActions: "Keine Korrekturmassnahmen erfasst.",
			noPersons: "Keine Personen erfasst.",
			noRootCauses: "Keine Grundursachen erfasst.",
			noTimeline: "Keine Timeline-Ereignisse erfasst.",
			notRecorded: "nicht erfasst",
			open: "offen",
			teamDefault:
				"Befolgen Sie die aktualisierten Kontrollen und melden Sie unsichere Bedingungen sofort.",
			timelinePhoto: "Timeline-Foto",
			timelinePhotoFor: "Timeline-Foto zu",
			unassigned: "nicht zugewiesen",
			unspecified: "Nicht angegeben",
			untimed: "Ohne Zeitangabe",
		},
		markers: {
			parked: "parkiert — ausserhalb des Einflussbereichs des Teams",
			rootCause: "Grundursache",
		},
		prefixes: {
			rootCause: "Grundursache: ",
			supportCorrectiveAction: "Unterstützen Sie die Korrekturmassnahme",
		},
		sections: {
			actionPlan: "Massnahmenplan",
			causeTree: "Ursachenbaum",
			changesBeingMade: "Umgesetzte Änderungen",
			factsTimeline: "Fakten & Timeline",
			hiraFollowup: "HIRA-Nacharbeit",
			incidentSummary: "Ereigniszusammenfassung",
			overview: "Übersicht",
			personsInvolved: "Beteiligte Personen",
			photos: "Fotos",
			rootCauses: "Grundursachen",
			statementFacts: "Fakten aus den Aussagen",
			teamMemberActions: "Was jedes Teammitglied tun muss",
			timeline: "Timeline",
		},
		tableHeaders: {
			cause: "Ursache",
			due: "Fällig",
			measure: "Massnahme",
			owner: "Verantwortung",
			status: "Status",
			stop: "S/T/O/P",
		},
		onePager: {
			actions: "Was wir ändern",
			asExecutive: "Als Geschäftsleitung",
			asFrontlineManager: "Als direkte Führungskraft",
			asTeamMember: "Als Teammitglied",
			causes: "Ursachen",
			facts: "Fakten",
			lessonsLearned: "Gelernte Lektionen",
			whatHappened: "Was geschah",
		},
		titles: {
			commsOnePager: "II-Kommunikation auf einer Seite",
			fullReport: "II-Vollbericht",
			managerOnePager: "Ereignis auf einen Blick",
		},
	},
	en: {
		fields: {
			actual: "actual",
			bodyPart: "Body part",
			coordinator: "Coordinator",
			department: "Department / area",
			due: "due",
			expected: "Expected",
			hazardCategory: "Hazard family",
			incidentTime: "Incident time",
			incidentType: "Incident type",
			injuryNature: "Injury type",
			actualInjuryOutcome: "Actual injury outcome",
			actualSeverity: "Actual severity",
			location: "Location",
			lostDays: "Lost days",
			owner: "owner",
			potentialLikelihood: "Potential likelihood",
			potentialOutcome: "Potential outcome",
			potentialRisk: "Potential risk",
			potentialSeverity: "Potential severity",
			status: "status",
			title: "Title",
			workActivity: "Task / activity",
		},
		fallbacks: {
			hiraFollowupNeeded: "HIRA follow-up needed.",
			noCauseTree: "No cause tree recorded.",
			noCorrectiveActions: "No corrective actions recorded.",
			noPersons: "No persons recorded.",
			noRootCauses: "No root causes recorded.",
			noTimeline: "No timeline events recorded.",
			notRecorded: "not recorded",
			open: "open",
			teamDefault:
				"Follow the updated controls and raise unsafe conditions immediately.",
			timelinePhoto: "Timeline photo",
			timelinePhotoFor: "Timeline photo for",
			unassigned: "unassigned",
			unspecified: "Unspecified",
			untimed: "Untimed",
		},
		markers: {
			parked: "parked — beyond team scope",
			rootCause: "root cause",
		},
		prefixes: {
			rootCause: "Root cause: ",
			supportCorrectiveAction: "Support the corrective action",
		},
		sections: {
			actionPlan: "Action plan",
			causeTree: "Cause tree",
			changesBeingMade: "Changes being made",
			factsTimeline: "Facts & timeline",
			hiraFollowup: "HIRA follow-up note",
			incidentSummary: "Incident summary",
			overview: "Overview",
			personsInvolved: "Persons involved",
			photos: "Photos",
			rootCauses: "Root causes",
			statementFacts: "Statement facts",
			teamMemberActions: "What every team member needs to do",
			timeline: "Timeline",
		},
		tableHeaders: {
			cause: "Cause",
			due: "Due",
			measure: "Measure",
			owner: "Owner",
			status: "Status",
			stop: "S/T/O/P",
		},
		onePager: {
			actions: "What we're changing",
			asExecutive: "As executive management",
			asFrontlineManager: "As a frontline manager",
			asTeamMember: "As a team member",
			causes: "Causes",
			facts: "Facts",
			lessonsLearned: "Lessons learned",
			whatHappened: "What happened",
		},
		titles: {
			commsOnePager: "II communications one-pager",
			fullReport: "II full report",
			managerOnePager: "Incident at a glance",
		},
	},
	fr: {
		fields: {
			actual: "réel",
			bodyPart: "Partie du corps",
			coordinator: "Coordination",
			department: "Département / secteur",
			due: "échéance",
			expected: "Attendu",
			hazardCategory: "Famille de dangers",
			incidentTime: "Heure de l'incident",
			incidentType: "Type d'incident",
			injuryNature: "Type de blessure",
			actualInjuryOutcome: "Issue réelle de la blessure",
			actualSeverity: "Gravité réelle",
			location: "Lieu",
			lostDays: "Jours perdus",
			owner: "responsable",
			potentialLikelihood: "Probabilité potentielle",
			potentialOutcome: "Issue potentielle",
			potentialRisk: "Risque potentiel",
			potentialSeverity: "Gravité potentielle",
			status: "statut",
			title: "Titre",
			workActivity: "Tâche / activité",
		},
		fallbacks: {
			hiraFollowupNeeded: "Suivi HIRA requis.",
			noCauseTree: "Aucun arbre des causes enregistré.",
			noCorrectiveActions: "Aucune action corrective enregistrée.",
			noPersons: "Aucune personne enregistrée.",
			noRootCauses: "Aucune cause racine enregistrée.",
			noTimeline: "Aucun événement de timeline enregistré.",
			notRecorded: "non enregistré",
			open: "ouvert",
			teamDefault:
				"Appliquer les contrôles mis à jour et signaler immédiatement les conditions dangereuses.",
			timelinePhoto: "Photo de la timeline",
			timelinePhotoFor: "Photo de la timeline pour",
			unassigned: "non attribué",
			unspecified: "Non précisé",
			untimed: "Sans heure",
		},
		markers: {
			parked: "en attente — hors de portée de l'équipe",
			rootCause: "cause racine",
		},
		prefixes: {
			rootCause: "Cause racine : ",
			supportCorrectiveAction: "Soutenir l'action corrective",
		},
		sections: {
			actionPlan: "Plan d'action",
			causeTree: "Arbre des causes",
			changesBeingMade: "Changements en cours",
			factsTimeline: "Faits & timeline",
			hiraFollowup: "Note de suivi HIRA",
			incidentSummary: "Résumé de l'incident",
			overview: "Vue d'ensemble",
			personsInvolved: "Personnes impliquées",
			photos: "Photos",
			rootCauses: "Causes racines",
			statementFacts: "Faits issus des déclarations",
			teamMemberActions: "Ce que chaque membre de l'équipe doit faire",
			timeline: "Timeline",
		},
		tableHeaders: {
			cause: "Cause",
			due: "Échéance",
			measure: "Mesure",
			owner: "Responsable",
			status: "Statut",
			stop: "S/T/O/P",
		},
		onePager: {
			actions: "Ce que nous changeons",
			asExecutive: "En tant que direction",
			asFrontlineManager: "En tant que responsable de terrain",
			asTeamMember: "En tant que membre de l'équipe",
			causes: "Causes",
			facts: "Faits",
			lessonsLearned: "Leçons retenues",
			whatHappened: "Ce qui s'est passé",
		},
		titles: {
			commsOnePager: "Communication II d'une page",
			fullReport: "Rapport II complet",
			managerOnePager: "L'incident en un coup d'œil",
		},
	},
	it: {
		fields: {
			actual: "effettivo",
			bodyPart: "Parte del corpo",
			coordinator: "Coordinamento",
			department: "Reparto / area",
			due: "scadenza",
			expected: "Previsto",
			hazardCategory: "Famiglia di pericoli",
			incidentTime: "Ora dell'incidente",
			incidentType: "Tipo di incidente",
			injuryNature: "Tipo di lesione",
			actualInjuryOutcome: "Esito effettivo della lesione",
			actualSeverity: "Gravità effettiva",
			location: "Luogo",
			lostDays: "Giorni persi",
			owner: "responsabile",
			potentialLikelihood: "Probabilità potenziale",
			potentialOutcome: "Esito potenziale",
			potentialRisk: "Rischio potenziale",
			potentialSeverity: "Gravità potenziale",
			status: "stato",
			title: "Titolo",
			workActivity: "Compito / attività",
		},
		fallbacks: {
			hiraFollowupNeeded: "Follow-up HIRA richiesto.",
			noCauseTree: "Nessun albero delle cause registrato.",
			noCorrectiveActions: "Nessuna azione correttiva registrata.",
			noPersons: "Nessuna persona registrata.",
			noRootCauses: "Nessuna causa radice registrata.",
			noTimeline: "Nessun evento nella timeline registrato.",
			notRecorded: "non registrato",
			open: "aperto",
			teamDefault:
				"Seguire i controlli aggiornati e segnalare immediatamente le condizioni non sicure.",
			timelinePhoto: "Foto della timeline",
			timelinePhotoFor: "Foto della timeline per",
			unassigned: "non assegnato",
			unspecified: "Non specificato",
			untimed: "Senza orario",
		},
		markers: {
			parked: "parcheggiata — oltre la portata del team",
			rootCause: "causa radice",
		},
		prefixes: {
			rootCause: "Causa radice: ",
			supportCorrectiveAction: "Sostenere l'azione correttiva",
		},
		sections: {
			actionPlan: "Piano d'azione",
			causeTree: "Albero delle cause",
			changesBeingMade: "Modifiche in corso",
			factsTimeline: "Fatti & timeline",
			hiraFollowup: "Nota di follow-up HIRA",
			incidentSummary: "Sintesi dell'incidente",
			overview: "Panoramica",
			personsInvolved: "Persone coinvolte",
			photos: "Foto",
			rootCauses: "Cause radice",
			statementFacts: "Fatti dalle dichiarazioni",
			teamMemberActions: "Cosa deve fare ogni membro del team",
			timeline: "Timeline",
		},
		tableHeaders: {
			cause: "Causa",
			due: "Scadenza",
			measure: "Misura",
			owner: "Responsabile",
			status: "Stato",
			stop: "S/T/O/P",
		},
		onePager: {
			actions: "Cosa stiamo cambiando",
			asExecutive: "Come direzione",
			asFrontlineManager: "Come responsabile di reparto",
			asTeamMember: "Come membro del team",
			causes: "Cause",
			facts: "Fatti",
			lessonsLearned: "Lezioni apprese",
			whatHappened: "Cosa è successo",
		},
		titles: {
			commsOnePager: "Comunicazione II in una pagina",
			fullReport: "Rapporto II completo",
			managerOnePager: "L'incidente in sintesi",
		},
	},
};

const incidentTypeKeys: Record<string, MessageKey> = {
	ACCIDENT: "incident.type.accident",
	FIRST_AID: "incident.type.firstAid",
	LOST_TIME: "incident.type.lostTime",
	NEAR_MISS: "incident.type.nearMiss",
	PROPERTY_DAMAGE: "incident.type.propertyDamage",
};

const actualInjuryOutcomeKeys: Record<string, MessageKey> = {
	FATALITY: "incident.actualInjuryOutcome.fatality",
	FIRST_AID: "incident.actualInjuryOutcome.firstAid",
	IRREVERSIBLE_INJURY: "incident.actualInjuryOutcome.irreversibleInjury",
	LOST_TIME: "incident.actualInjuryOutcome.lostTime",
	MEDICAL_TREATMENT: "incident.actualInjuryOutcome.medicalTreatment",
	NO_INJURY: "incident.actualInjuryOutcome.noInjury",
	UNKNOWN: "incident.actualInjuryOutcome.unknown",
};

const timelineConfidenceKeys: Record<string, MessageKey> = {
	CONFIRMED: "incident.timeline.confidence.CONFIRMED",
	LIKELY: "incident.timeline.confidence.LIKELY",
	UNCLEAR: "incident.timeline.confidence.UNCLEAR",
};

const actionStatusKeys: Record<string, MessageKey> = {
	COMPLETE: "incident.actions.status.COMPLETE",
	IN_PROGRESS: "incident.actions.status.IN_PROGRESS",
	OPEN: "incident.actions.status.OPEN",
};

const actionTypeKeys: Record<string, MessageKey> = {
	SUBSTITUTION: "incident.actions.type.SUBSTITUTION",
	TECHNICAL: "incident.actions.type.TECHNICAL",
	ORGANIZATIONAL: "incident.actions.type.ORGANIZATIONAL",
	PPE: "incident.actions.type.PPE",
	ENGINEERING: "incident.actions.type.ENGINEERING",
	ORGANISATIONAL: "incident.actions.type.ORGANISATIONAL",
	TRAINING: "incident.actions.type.TRAINING",
};

export function iiExportLabels(locale: Locale): IIExportLabels {
	return labelsByLocale[locale];
}

export function localizeIncidentType(code: string, locale: Locale): string {
	return localizeMessageCode(code, locale, incidentTypeKeys);
}

export function localizeActualInjuryOutcome(
	code: string,
	locale: Locale,
): string {
	return localizeMessageCode(code, locale, actualInjuryOutcomeKeys);
}

export function localizeTimelineConfidence(
	code: string,
	locale: Locale,
): string {
	return localizeMessageCode(code, locale, timelineConfidenceKeys);
}

export function localizeActionStatus(code: string, locale: Locale): string {
	return localizeMessageCode(code, locale, actionStatusKeys);
}

export function localizeActionType(code: string, locale: Locale): string {
	return localizeMessageCode(code, locale, actionTypeKeys);
}

export function iiExportHazardCategoryLabel(
	code: HazardCategoryCode,
	locale: Locale,
): string {
	return getCategoryLabel(code, taxonomyLocale(locale));
}

export function iiExportSeverityLabel(
	code: SeverityCode,
	locale: Locale,
): string {
	return getSeverityLabel(code, taxonomyLocale(locale));
}

export function iiExportLikelihoodLabel(
	code: LikelihoodCode,
	locale: Locale,
): string {
	return getLikelihoodLabel(code, taxonomyLocale(locale));
}

export function iiExportRiskBandLabel(
	code: RiskBandCode,
	locale: Locale,
): string {
	return getRiskBandLabel(code, taxonomyLocale(locale));
}

export function iiExportControlHierarchyLabel(
	code: ControlHierarchyCode,
	locale: Locale,
): string {
	return getControlHierarchyLabel(code, taxonomyLocale(locale));
}

function localizeMessageCode(
	code: string,
	locale: Locale,
	keyMap: Record<string, MessageKey>,
): string {
	const key = keyMap[code];

	return key ? t(key, locale) : code;
}

function taxonomyLocale(locale: Locale): TaxonomyLocale {
	return locale;
}
