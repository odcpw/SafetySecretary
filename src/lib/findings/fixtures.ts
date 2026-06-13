import { t } from "../i18n/t";
import type { Locale, MessageKey } from "../i18n/types";

type LocalizedText = Record<Locale, string>;

function localized(text: LocalizedText): LocalizedText {
	return text;
}

export const FINDING_TYPES = [
	"safety_walk",
	"audit",
	"inspection",
	"meeting",
	"toolbox_talk",
] as const;

export const FINDING_STATUSES = [
	"open",
	"action_created",
	"resolved",
	"dismissed",
] as const;

export const FINDING_SEVERITIES = ["low", "medium", "high", "watch"] as const;

export type FindingType = (typeof FINDING_TYPES)[number];
export type FindingStatus = (typeof FINDING_STATUSES)[number];
export type FindingSeverity = (typeof FINDING_SEVERITIES)[number];

export const FINDING_TYPE_LABEL_KEYS = {
	audit: "finding.type.audit",
	inspection: "finding.type.inspection",
	meeting: "finding.type.meeting",
	safety_walk: "finding.type.safetyWalk",
	toolbox_talk: "finding.type.toolboxTalk",
} as const satisfies Record<FindingType, MessageKey>;

export const FINDING_STATUS_LABEL_KEYS = {
	action_created: "finding.status.actionCreated",
	dismissed: "finding.status.dismissed",
	open: "finding.status.open",
	resolved: "finding.status.resolved",
} as const satisfies Record<FindingStatus, MessageKey>;

export const FINDING_SEVERITY_LABEL_KEYS = {
	high: "finding.severity.high",
	low: "finding.severity.low",
	medium: "finding.severity.medium",
	watch: "finding.severity.watch",
} as const satisfies Record<FindingSeverity, MessageKey>;

export const FINDING_MESSAGE_KEYS = [
	"finding.capture.photoLabel",
	"finding.capture.quickNote",
	"finding.checklist.addEvidence",
	"finding.checklist.assignOwner",
	"finding.checklist.confirmControl",
	"finding.empty.body",
	"finding.empty.cta",
	"finding.empty.title",
	"finding.field.department",
	"finding.field.description",
	"finding.field.dueDate",
	"finding.field.location",
	"finding.field.observedBy",
	"finding.field.owner",
	"finding.field.severity",
	"finding.field.status",
	"finding.field.title",
	"finding.field.type",
	"finding.goodCatch.badge",
	"finding.goodCatch.body",
	"finding.list.filters",
	"finding.list.title",
	"finding.noBlame.note",
	"finding.severity.high",
	"finding.severity.low",
	"finding.severity.medium",
	"finding.severity.watch",
	"finding.status.actionCreated",
	"finding.status.dismissed",
	"finding.status.open",
	"finding.status.resolved",
	"finding.type.audit",
	"finding.type.inspection",
	"finding.type.meeting",
	"finding.type.safetyWalk",
	"finding.type.toolboxTalk",
] as const satisfies readonly MessageKey[];

export type FindingFixture = {
	id: string;
	department: LocalizedText;
	description: LocalizedText;
	dueDate: string | null;
	goodCatch: boolean;
	location: LocalizedText;
	observedByRole: LocalizedText;
	ownerRole: LocalizedText | null;
	severity: FindingSeverity;
	status: FindingStatus;
	title: LocalizedText;
	type: FindingType;
};

export const FINDING_FIXTURES = [
	{
		department: localized({
			de: "Produktion",
			en: "Production",
			fr: "Production",
			it: "Produzione",
		}),
		description: localized({
			de: "Schutz war beim Einrichten offen; Bedienperson stoppte und fragte nach Hilfe.",
			en: "Guard was open during setup; operator stopped and asked for help.",
			fr: "Protecteur ouvert pendant le réglage; l'opérateur a stoppé et demandé de l'aide.",
			it: "Riparo aperto durante l'allestimento; l'operatore si è fermato e ha chiesto aiuto.",
		}),
		dueDate: "2026-05-20",
		goodCatch: true,
		id: "finding-fixture-safety-walk-good-catch",
		location: localized({
			de: "Linie 2 Umrüstung",
			en: "Line 2 changeover",
			fr: "Changement ligne 2",
			it: "Cambio linea 2",
		}),
		observedByRole: localized({
			de: "Schichtleitung",
			en: "Shift lead",
			fr: "Chef d'équipe",
			it: "Capoturno",
		}),
		ownerRole: localized({
			de: "Leitung Instandhaltung",
			en: "Maintenance lead",
			fr: "Responsable maintenance",
			it: "Responsabile manutenzione",
		}),
		severity: "medium",
		status: "action_created",
		title: localized({
			de: "Schutz beim Einrichten offen",
			en: "Guard opened during setup",
			fr: "Protecteur ouvert pendant le réglage",
			it: "Riparo aperto durante l'allestimento",
		}),
		type: "safety_walk",
	},
	{
		department: localized({
			de: "Lager",
			en: "Warehouse",
			fr: "Magasin",
			it: "Magazzino",
		}),
		description: localized({
			de: "Markierter Fussweg war teilweise durch leere Paletten blockiert.",
			en: "Marked pedestrian route was partly blocked by empty pallets.",
			fr: "Le chemin piéton marqué était partiellement bloqué par des palettes vides.",
			it: "Il percorso pedonale segnato era parzialmente bloccato da pallet vuoti.",
		}),
		dueDate: null,
		goodCatch: false,
		id: "finding-fixture-audit-route",
		location: localized({
			de: "Wareneingang Gang",
			en: "Goods-in aisle",
			fr: "Allée réception",
			it: "Corridoio ricezione merci",
		}),
		observedByRole: localized({
			de: "Sicherheitsfachperson",
			en: "Safety specialist",
			fr: "Spécialiste sécurité",
			it: "Specialista sicurezza",
		}),
		ownerRole: localized({
			de: "Lagerleitung",
			en: "Warehouse supervisor",
			fr: "Responsable magasin",
			it: "Responsabile magazzino",
		}),
		severity: "low",
		status: "open",
		title: localized({
			de: "Fussweg teilweise blockiert",
			en: "Pedestrian route partly blocked",
			fr: "Chemin piéton partiellement bloqué",
			it: "Percorso pedonale parzialmente bloccato",
		}),
		type: "audit",
	},
	{
		department: localized({
			de: "Instandhaltung",
			en: "Maintenance",
			fr: "Maintenance",
			it: "Manutenzione",
		}),
		description: localized({
			de: "Inspektion bestätigte, dass die temporäre Kabelabdeckung wieder sitzt.",
			en: "Inspection confirmed the temporary cable cover is back in place.",
			fr: "L'inspection confirme que le cache-câble temporaire est remis en place.",
			it: "L'ispezione ha confermato che la copertura temporanea del cavo è di nuovo in posizione.",
		}),
		dueDate: null,
		goodCatch: false,
		id: "finding-fixture-inspection-resolved",
		location: localized({
			de: "Kompressorraum",
			en: "Compressor room",
			fr: "Local compresseur",
			it: "Locale compressore",
		}),
		observedByRole: localized({
			de: "Instandhaltungstechniker",
			en: "Maintenance technician",
			fr: "Technicien maintenance",
			it: "Tecnico manutenzione",
		}),
		ownerRole: null,
		severity: "watch",
		status: "resolved",
		title: localized({
			de: "Temporäre Kabelabdeckung geprüft",
			en: "Temporary cable cover verified",
			fr: "Cache-câble temporaire vérifié",
			it: "Copertura temporanea del cavo verificata",
		}),
		type: "inspection",
	},
	{
		department: localized({
			de: "Montage",
			en: "Assembly",
			fr: "Assemblage",
			it: "Assemblaggio",
		}),
		description: localized({
			de: "Team meldete in der Morgenbesprechung ein wiederkehrendes Greifproblem.",
			en: "Team raised a repeated reach issue at the morning meeting.",
			fr: "L'équipe a signalé un problème de portée récurrent pendant la réunion du matin.",
			it: "Il team ha segnalato un problema ricorrente di raggiungimento nella riunione del mattino.",
		}),
		dueDate: "2026-05-28",
		goodCatch: false,
		id: "finding-fixture-meeting-ergonomics",
		location: localized({
			de: "Montagezelle 4",
			en: "Assembly cell 4",
			fr: "Cellule assemblage 4",
			it: "Cella assemblaggio 4",
		}),
		observedByRole: localized({
			de: "Teammoderation",
			en: "Team facilitator",
			fr: "Animateur d'équipe",
			it: "Facilitatore del team",
		}),
		ownerRole: localized({
			de: "Prozesseigner",
			en: "Process owner",
			fr: "Propriétaire du processus",
			it: "Responsabile di processo",
		}),
		severity: "high",
		status: "action_created",
		title: localized({
			de: "Wiederkehrendes Greifproblem",
			en: "Repeated reach issue",
			fr: "Problème de portée récurrent",
			it: "Problema ricorrente di raggiungimento",
		}),
		type: "meeting",
	},
	{
		department: localized({
			de: "Auftragnehmer",
			en: "Contractors",
			fr: "Sous-traitants",
			it: "Appaltatori",
		}),
		description: localized({
			de: "Punkt aus Toolbox-Gespräch wurde notiert, brauchte aber keine Nachverfolgung.",
			en: "Toolbox discussion item was noted but did not require follow-up.",
			fr: "Le point du toolbox talk a été noté mais ne demandait pas de suivi.",
			it: "Il punto del toolbox talk è stato annotato ma non richiedeva seguito.",
		}),
		dueDate: null,
		goodCatch: false,
		id: "finding-fixture-toolbox-dismissed",
		location: localized({
			de: "Laderampe",
			en: "Loading bay",
			fr: "Quai de chargement",
			it: "Baia di carico",
		}),
		observedByRole: localized({
			de: "Standortkoordination",
			en: "Site coordinator",
			fr: "Coordinateur de site",
			it: "Coordinatore del sito",
		}),
		ownerRole: null,
		severity: "low",
		status: "dismissed",
		title: localized({
			de: "Keine Nachverfolgung nach Toolbox-Punkt",
			en: "No follow-up after toolbox item",
			fr: "Pas de suivi après le point toolbox",
			it: "Nessun seguito dopo il punto toolbox",
		}),
		type: "toolbox_talk",
	},
] as const satisfies readonly FindingFixture[];

export type RenderedFindingFixture = {
	id: string;
	fieldLabels: Record<
		| "department"
		| "description"
		| "dueDate"
		| "location"
		| "observedBy"
		| "owner"
		| "severity"
		| "status"
		| "title"
		| "type",
		string
	>;
	goodCatch: {
		badge: string;
		body: string;
		enabled: boolean;
	};
	location: string;
	noBlameNote: string;
	observedByRole: string;
	ownerRole: string | null;
	severityLabel: string;
	statusLabel: string;
	title: string;
	typeLabel: string;
};

export function renderFindingFixture(
	finding: FindingFixture,
	locale: Locale,
): RenderedFindingFixture {
	return {
		fieldLabels: {
			department: t("finding.field.department", locale),
			description: t("finding.field.description", locale),
			dueDate: t("finding.field.dueDate", locale),
			location: t("finding.field.location", locale),
			observedBy: t("finding.field.observedBy", locale),
			owner: t("finding.field.owner", locale),
			severity: t("finding.field.severity", locale),
			status: t("finding.field.status", locale),
			title: t("finding.field.title", locale),
			type: t("finding.field.type", locale),
		},
		goodCatch: {
			badge: t("finding.goodCatch.badge", locale),
			body: t("finding.goodCatch.body", locale),
			enabled: finding.goodCatch,
		},
		id: finding.id,
		location: finding.location[locale],
		noBlameNote: t("finding.noBlame.note", locale),
		observedByRole: finding.observedByRole[locale],
		ownerRole: finding.ownerRole?.[locale] ?? null,
		severityLabel: t(FINDING_SEVERITY_LABEL_KEYS[finding.severity], locale),
		statusLabel: t(FINDING_STATUS_LABEL_KEYS[finding.status], locale),
		title: finding.title[locale],
		typeLabel: t(FINDING_TYPE_LABEL_KEYS[finding.type], locale),
	};
}
