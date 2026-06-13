/**
 * The single shared "is this investigation ready?" check. One definition of
 * what a complete-enough record looks like, derived fresh from record state
 * (never stored). It produces SOFT gaps, not hard blocks: the UI surfaces them
 * as reminders, and the coach's close protocol is gated separately by the
 * phase signal (cause-tree.ts buildPhaseSignal). The user can always close or
 * export anyway — this informs, it does not enforce.
 *
 * Counts mirror the open-branch rule in cause-tree.ts (childless leaf that is
 * not rooted, parked, or already treated) so the UI hint and the coach signal
 * agree on what "open" means.
 */

export type ReadinessGapKey =
	| "incidentTime"
	| "potentialSeverity"
	| "noCauses"
	| "noRoot"
	| "openBranches"
	| "noMeasures"
	| "actionsIncomplete"
	| "hiraUndescribed";

export type ReadinessGap = {
	readonly key: ReadinessGapKey;
	readonly count?: number;
};

export type ReadinessResult = {
	readonly ready: boolean;
	readonly gaps: readonly ReadinessGap[];
};

type ReadinessCause = {
	readonly id: string;
	readonly parentId: string | null;
	readonly isRootCause?: boolean;
	readonly branchStatus?: "OPEN" | "ROOT_REACHED" | "PARKED";
};

type ReadinessAction = {
	readonly causeNodeId: string;
	readonly ownerRole: string | null;
	readonly dueDate: string | null;
};

export type ReadinessInput = {
	readonly incidentAt: string | null;
	readonly potentialSeverity: string | null;
	readonly hiraFollowupNeeded?: boolean;
	readonly hiraFollowupText?: string | null;
	readonly causes: readonly ReadinessCause[];
	readonly actions: readonly ReadinessAction[];
};

function countOpenBranches(
	causes: readonly ReadinessCause[],
	actions: readonly ReadinessAction[],
): number {
	const parentIds = new Set<string>();
	for (const cause of causes) {
		if (cause.parentId) {
			parentIds.add(cause.parentId);
		}
	}
	const measured = new Set<string>();
	for (const action of actions) {
		measured.add(action.causeNodeId);
	}

	let open = 0;
	for (const cause of causes) {
		const hasChild = parentIds.has(cause.id);
		const isRoot =
			Boolean(cause.isRootCause) || cause.branchStatus === "ROOT_REACHED";
		const isParked = cause.branchStatus === "PARKED";
		if (!hasChild && !isRoot && !isParked && !measured.has(cause.id)) {
			open += 1;
		}
	}
	return open;
}

export function assessIncidentReadiness(
	input: ReadinessInput,
): ReadinessResult {
	const gaps: ReadinessGap[] = [];
	const causes = input.causes ?? [];
	const actions = input.actions ?? [];

	if (!input.incidentAt) {
		gaps.push({ key: "incidentTime" });
	}
	if (!input.potentialSeverity) {
		gaps.push({ key: "potentialSeverity" });
	}

	if (causes.length === 0) {
		gaps.push({ key: "noCauses" });
	} else {
		const anyRoot = causes.some(
			(cause) =>
				Boolean(cause.isRootCause) || cause.branchStatus === "ROOT_REACHED",
		);
		if (!anyRoot) {
			gaps.push({ key: "noRoot" });
		}
		const openBranches = countOpenBranches(causes, actions);
		if (openBranches > 0) {
			gaps.push({ key: "openBranches", count: openBranches });
		}
		if (actions.length === 0) {
			gaps.push({ key: "noMeasures" });
		}
	}

	const incompleteActions = actions.filter(
		(action) => !action.ownerRole || !action.dueDate,
	).length;
	if (incompleteActions > 0) {
		gaps.push({ key: "actionsIncomplete", count: incompleteActions });
	}

	if (input.hiraFollowupNeeded && !(input.hiraFollowupText ?? "").trim()) {
		gaps.push({ key: "hiraUndescribed" });
	}

	return { ready: gaps.length === 0, gaps };
}

// Localized copy for the soft readiness notice. Self-contained (kept out of the
// large CoachCopy map) since this is one small, self-describing feature.
export type ReadinessCopy = {
	readonly title: string;
	readonly note: string;
	readonly gaps: Record<ReadinessGapKey, string>;
};

const READINESS_COPY: Record<string, ReadinessCopy> = {
	en: {
		title: "Before closing or exporting",
		note: "Reminders, not blockers — you can still close or export.",
		gaps: {
			incidentTime: "Incident date and time not set",
			potentialSeverity: "Possible harm (worst credible) not assessed",
			noCauses: "No causes identified yet",
			noRoot: "No root cause reached on any branch yet",
			openBranches: "Cause branches still open",
			noMeasures: "No measures yet",
			actionsIncomplete: "Measures missing an owner or due date",
			hiraUndescribed: "Risk-assessment follow-up flagged but not described",
		},
	},
	de: {
		title: "Vor dem Abschliessen oder Exportieren",
		note: "Hinweise, keine Sperren — du kannst trotzdem abschliessen oder exportieren.",
		gaps: {
			incidentTime: "Datum und Uhrzeit des Vorfalls fehlen",
			potentialSeverity:
				"Möglicher Schaden (realistisch schlimmster) nicht beurteilt",
			noCauses: "Noch keine Ursachen erfasst",
			noRoot: "Auf keinem Ast eine Grundursache erreicht",
			openBranches: "Ursachen-Äste noch offen",
			noMeasures: "Noch keine Massnahmen",
			actionsIncomplete: "Massnahmen ohne Verantwortliche oder Termin",
			hiraUndescribed:
				"Risikobeurteilung als Folgeschritt markiert, aber nicht beschrieben",
		},
	},
	fr: {
		title: "Avant de clôturer ou d'exporter",
		note: "Des rappels, pas des blocages — vous pouvez tout de même clôturer ou exporter.",
		gaps: {
			incidentTime: "Date et heure de l'événement non renseignées",
			potentialSeverity: "Dommage possible (pire cas crédible) non évalué",
			noCauses: "Aucune cause identifiée pour l'instant",
			noRoot: "Aucune cause racine atteinte sur une branche",
			openBranches: "Branches de causes encore ouvertes",
			noMeasures: "Aucune mesure pour l'instant",
			actionsIncomplete: "Mesures sans responsable ou sans échéance",
			hiraUndescribed:
				"Évaluation des risques signalée en suivi mais non décrite",
		},
	},
	it: {
		title: "Prima di chiudere o esportare",
		note: "Promemoria, non blocchi — puoi comunque chiudere o esportare.",
		gaps: {
			incidentTime: "Data e ora dell'evento non impostate",
			potentialSeverity: "Danno possibile (peggiore credibile) non valutato",
			noCauses: "Nessuna causa ancora identificata",
			noRoot: "Nessuna causa radice raggiunta su alcun ramo",
			openBranches: "Rami delle cause ancora aperti",
			noMeasures: "Nessuna misura ancora",
			actionsIncomplete: "Misure senza responsabile o scadenza",
			hiraUndescribed:
				"Valutazione dei rischi segnalata come seguito ma non descritta",
		},
	},
};

export function readinessCopy(locale: string): ReadinessCopy {
	const base = locale.split("-")[0]?.toLowerCase() ?? "en";
	return READINESS_COPY[base] ?? READINESS_COPY.en;
}
