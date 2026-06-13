import { t } from "../i18n/t";
import type { Locale, MessageKey } from "../i18n/types";
import type { ActionOriginType } from "./origin-contract";

type LocalizedText = Record<Locale, string>;

function localized(text: LocalizedText): LocalizedText {
	return text;
}

export const ACTION_BOARD_STATUSES = [
	"open",
	"in_progress",
	"completed",
	"cancelled",
	"overdue",
] as const;

export const ACTION_BOARD_ORIGINS = [
	"hira",
	"jha",
	"incident",
	"finding",
	"safety_walk",
	"audit",
	"toolbox_talk",
	"manual",
] as const;

export const ACTION_BOARD_DUE_FILTERS = [
	"all",
	"due_today",
	"due_this_week",
	"overdue",
	"no_due_date",
] as const;

export const ACTION_BOARD_ATTACHMENT_TYPES = [
	"evidence",
	"photo",
	"export",
] as const;

export type ActionBoardStatus = (typeof ACTION_BOARD_STATUSES)[number];
export type ActionBoardOrigin = (typeof ACTION_BOARD_ORIGINS)[number];
export type ActionBoardDueFilter = (typeof ACTION_BOARD_DUE_FILTERS)[number];
export type ActionBoardAttachmentType =
	(typeof ACTION_BOARD_ATTACHMENT_TYPES)[number];

export const ACTION_BOARD_STATUS_LABEL_KEYS = {
	cancelled: "actionBoard.status.cancelled",
	completed: "actionBoard.status.completed",
	in_progress: "actionBoard.status.inProgress",
	open: "actionBoard.status.open",
	overdue: "actionBoard.status.overdue",
} as const satisfies Record<ActionBoardStatus, MessageKey>;

export const ACTION_BOARD_ORIGIN_LABEL_KEYS = {
	audit: "actionBoard.origin.audit",
	finding: "actionBoard.origin.finding",
	hira: "actionBoard.origin.hira",
	incident: "actionBoard.origin.incident",
	jha: "actionBoard.origin.jha",
	manual: "actionBoard.origin.manual",
	safety_walk: "actionBoard.origin.safetyWalk",
	toolbox_talk: "actionBoard.origin.toolboxTalk",
} as const satisfies Record<ActionBoardOrigin, MessageKey>;

export const ACTION_BOARD_ACTION_ORIGIN_LABEL_KEYS = {
	audit_inspection: "actionBoard.origin.audit",
	campaign: "actionBoard.origin.campaign",
	creative_artifact: "actionBoard.origin.creativeArtifact",
	hira: "actionBoard.origin.hira",
	ii: "actionBoard.origin.incident",
	jha: "actionBoard.origin.jha",
	manual: "actionBoard.origin.manual",
	meeting: "actionBoard.origin.meeting",
	roadmap: "actionBoard.origin.roadmap",
	safety_day: "actionBoard.origin.safetyDay",
	safety_moment: "actionBoard.origin.safetyMoment",
	safety_walk: "actionBoard.origin.safetyWalk",
	toolbox_talk: "actionBoard.origin.toolboxTalk",
} as const satisfies Record<ActionOriginType, MessageKey>;

export const ACTION_BOARD_DUE_FILTER_LABEL_KEYS = {
	all: "actionBoard.dueFilter.all",
	due_this_week: "actionBoard.dueFilter.dueThisWeek",
	due_today: "actionBoard.dueFilter.dueToday",
	no_due_date: "actionBoard.dueFilter.noDueDate",
	overdue: "actionBoard.dueFilter.overdue",
} as const satisfies Record<ActionBoardDueFilter, MessageKey>;

export const ACTION_BOARD_ATTACHMENT_LABEL_KEYS = {
	evidence: "actionBoard.attachment.evidence",
	export: "actionBoard.attachment.export",
	photo: "actionBoard.attachment.photo",
} as const satisfies Record<ActionBoardAttachmentType, MessageKey>;

export const ACTION_BOARD_PRIORITY_LABEL_KEYS = {
	critical: "actionBoard.priority.critical",
	high: "actionBoard.priority.high",
	low: "actionBoard.priority.low",
	medium: "actionBoard.priority.medium",
} as const satisfies Record<"critical" | "high" | "low" | "medium", MessageKey>;

export const ACTION_BOARD_VERIFICATION_LABEL_KEYS = {
	needed: "actionBoard.verification.needed",
	needs_follow_up: "actionBoard.verification.needsFollowUp",
	not_required: "actionBoard.verification.notRequired",
	verified: "actionBoard.verification.verified",
} as const satisfies Record<
	"needed" | "needs_follow_up" | "not_required" | "verified",
	MessageKey
>;

export const ACTION_BOARD_EFFECTIVENESS_LABEL_KEYS = {
	effective: "actionBoard.effectiveness.effective",
	needs_follow_up: "actionBoard.effectiveness.needsFollowUp",
	unknown: "actionBoard.effectiveness.unknown",
} as const satisfies Record<
	"effective" | "needs_follow_up" | "unknown",
	MessageKey
>;

export const ACTION_BOARD_MESSAGE_KEYS = [
	"actionBoard.attachment.evidence",
	"actionBoard.attachment.export",
	"actionBoard.attachment.photo",
	"actionBoard.detail.addAttachment",
	"actionBoard.detail.closeAction",
	"actionBoard.detail.editAction",
	"actionBoard.detail.markComplete",
	"actionBoard.detail.needsFollowUp",
	"actionBoard.detail.reopenAction",
	"actionBoard.dueFilter.all",
	"actionBoard.dueFilter.dueThisWeek",
	"actionBoard.dueFilter.dueToday",
	"actionBoard.dueFilter.noDueDate",
	"actionBoard.dueFilter.overdue",
	"actionBoard.effectiveness.effective",
	"actionBoard.effectiveness.needsFollowUp",
	"actionBoard.effectiveness.unknown",
	"actionBoard.empty.noActions.body",
	"actionBoard.empty.noActions.cta",
	"actionBoard.empty.noActions.title",
	"actionBoard.empty.noMatches.body",
	"actionBoard.empty.noMatches.cta",
	"actionBoard.empty.noMatches.title",
	"actionBoard.field.assignee",
	"actionBoard.field.attachments",
	"actionBoard.field.department",
	"actionBoard.field.description",
	"actionBoard.field.dueDate",
	"actionBoard.field.effectiveness",
	"actionBoard.field.isSafetyCritical",
	"actionBoard.field.origin",
	"actionBoard.field.originCreatedAt",
	"actionBoard.field.originId",
	"actionBoard.field.originLabel",
	"actionBoard.field.priority",
	"actionBoard.field.status",
	"actionBoard.field.title",
	"actionBoard.field.verifiedAt",
	"actionBoard.field.verifiedBy",
	"actionBoard.field.verificationNote",
	"actionBoard.field.verificationStatus",
	"actionBoard.filter.assignee",
	"actionBoard.filter.department",
	"actionBoard.filter.due",
	"actionBoard.filter.origin",
	"actionBoard.filter.status",
	"actionBoard.form.attachmentDescription",
	"actionBoard.form.attachmentFile",
	"actionBoard.form.attachmentsTitle",
	"actionBoard.form.backToBoard",
	"actionBoard.form.closureFields",
	"actionBoard.form.createDescription",
	"actionBoard.form.createFollowUp",
	"actionBoard.form.createTitle",
	"actionBoard.form.editDescription",
	"actionBoard.form.editTitle",
	"actionBoard.form.followUpBody",
	"actionBoard.form.followUpTitle",
	"actionBoard.form.followUpTitlePrefix",
	"actionBoard.form.manualOriginHelp",
	"actionBoard.form.mutableFields",
	"actionBoard.form.noAttachments",
	"actionBoard.form.originFields",
	"actionBoard.form.removeAttachment",
	"actionBoard.form.removeFailed",
	"actionBoard.form.reopenAction",
	"actionBoard.form.saveFailed",
	"actionBoard.form.statusOnlyBlocked",
	"actionBoard.form.uploadAttachment",
	"actionBoard.form.uploadFailed",
	"actionBoard.list.filters",
	"actionBoard.list.title",
	"actionBoard.metric.completedThisWeek",
	"actionBoard.metric.assigneeBreakdown",
	"actionBoard.metric.departmentBreakdown",
	"actionBoard.metric.dueSoon",
	"actionBoard.metric.findingsWithoutAction",
	"actionBoard.metric.needsFollowUp",
	"actionBoard.metric.noBreakdown",
	"actionBoard.metric.open",
	"actionBoard.metric.openQueue",
	"actionBoard.metric.originBreakdown",
	"actionBoard.metric.overdue",
	"actionBoard.metric.pendingSdsReviews",
	"actionBoard.metric.relatedQueues",
	"actionBoard.metric.statusBreakdown",
	"actionBoard.metric.unverifiedClosures",
	"actionBoard.metric.weeklyRhythmBody",
	"actionBoard.metric.weeklyRhythmTitle",
	"actionBoard.origin.audit",
	"actionBoard.origin.campaign",
	"actionBoard.origin.creativeArtifact",
	"actionBoard.origin.finding",
	"actionBoard.origin.hira",
	"actionBoard.origin.incident",
	"actionBoard.origin.jha",
	"actionBoard.origin.manual",
	"actionBoard.origin.meeting",
	"actionBoard.origin.roadmap",
	"actionBoard.origin.safetyDay",
	"actionBoard.origin.safetyMoment",
	"actionBoard.origin.safetyWalk",
	"actionBoard.origin.toolboxTalk",
	"actionBoard.priority.critical",
	"actionBoard.priority.high",
	"actionBoard.priority.low",
	"actionBoard.priority.medium",
	"actionBoard.status.cancelled",
	"actionBoard.status.completed",
	"actionBoard.status.inProgress",
	"actionBoard.status.open",
	"actionBoard.status.overdue",
	"actionBoard.verification.needed",
	"actionBoard.verification.needsFollowUp",
	"actionBoard.verification.notRequired",
	"actionBoard.verification.verified",
] as const satisfies readonly MessageKey[];

export type ActionBoardFixture = {
	id: string;
	assignee: LocalizedText;
	attachments: readonly ActionBoardAttachmentType[];
	department: LocalizedText;
	description: LocalizedText;
	dueDate: string | null;
	origin: ActionBoardOrigin;
	status: ActionBoardStatus;
	title: LocalizedText;
};

export const ACTION_BOARD_FIXTURES = [
	{
		assignee: localized({
			de: "Leitung Instandhaltung",
			en: "Maintenance lead",
			fr: "Responsable maintenance",
			it: "Responsabile manutenzione",
		}),
		attachments: ["photo", "evidence"],
		department: localized({
			de: "Produktion",
			en: "Production",
			fr: "Production",
			it: "Produzione",
		}),
		description: localized({
			de: "Schutzschalter prüfen und Bedienpersonen über den sicheren Einrichtmodus informieren.",
			en: "Check the guard switch and brief operators on the safe setup mode.",
			fr: "Vérifier l'interrupteur du protecteur et informer les opérateurs sur le mode de réglage sûr.",
			it: "Controllare l'interruttore del riparo e informare gli operatori sulla modalità di allestimento sicura.",
		}),
		dueDate: "2026-05-12",
		id: "action-fixture-hira-guard",
		origin: "hira",
		status: "open",
		title: localized({
			de: "Schutz beim Einrichten absichern",
			en: "Secure guard during setup",
			fr: "Sécuriser le protecteur pendant le réglage",
			it: "Mettere in sicurezza il riparo durante l'allestimento",
		}),
	},
	{
		assignee: localized({
			de: "Baustellenkoordination",
			en: "Site coordinator",
			fr: "Coordinateur de site",
			it: "Coordinatore del sito",
		}),
		attachments: ["evidence"],
		department: localized({
			de: "Bauprojekt",
			en: "Construction project",
			fr: "Projet de construction",
			it: "Progetto di costruzione",
		}),
		description: localized({
			de: "Zugang zur Hubarbeitsbühne mit Auftragnehmern abstimmen und im Tagesbriefing bestätigen.",
			en: "Coordinate access to the mobile elevating platform with contractors and confirm it in the daily briefing.",
			fr: "Coordonner l'accès à la nacelle avec les sous-traitants et le confirmer dans le briefing quotidien.",
			it: "Coordinare l'accesso alla piattaforma elevabile con gli appaltatori e confermarlo nel briefing giornaliero.",
		}),
		dueDate: "2026-05-05",
		id: "action-fixture-jha-access",
		origin: "jha",
		status: "in_progress",
		title: localized({
			de: "Zugang zur Hubarbeitsbühne klären",
			en: "Clarify platform access",
			fr: "Clarifier l'accès à la nacelle",
			it: "Chiarire l'accesso alla piattaforma",
		}),
	},
	{
		assignee: localized({
			de: "Sicherheitsfachperson",
			en: "Safety specialist",
			fr: "Spécialiste sécurité",
			it: "Specialista sicurezza",
		}),
		attachments: ["export"],
		department: localized({
			de: "Logistik",
			en: "Logistics",
			fr: "Logistique",
			it: "Logistica",
		}),
		description: localized({
			de: "Korrekturmassnahme aus der Untersuchung nachverfolgen und Wirksamkeit mit dem Team prüfen.",
			en: "Follow up the corrective action from the investigation and check effectiveness with the team.",
			fr: "Suivre la mesure corrective issue de l'enquête et vérifier son efficacité avec l'équipe.",
			it: "Seguire la misura correttiva dell'indagine e verificarne l'efficacia con il team.",
		}),
		dueDate: "2026-05-01",
		id: "action-fixture-incident-follow-up",
		origin: "incident",
		status: "overdue",
		title: localized({
			de: "Wirksamkeit der Massnahme prüfen",
			en: "Check corrective action effectiveness",
			fr: "Vérifier l'efficacité de la mesure",
			it: "Verificare l'efficacia della misura",
		}),
	},
	{
		assignee: localized({
			de: "Schichtleitung",
			en: "Shift lead",
			fr: "Chef d'équipe",
			it: "Capoturno",
		}),
		attachments: [],
		department: localized({
			de: "Lager",
			en: "Warehouse",
			fr: "Magasin",
			it: "Magazzino",
		}),
		description: localized({
			de: "Markierung am Fussweg erneuern und Palettenabstellplatz nochmals mit dem Team klären.",
			en: "Refresh the pedestrian route marking and confirm the pallet staging area with the team.",
			fr: "Rafraîchir le marquage du chemin piéton et confirmer la zone palettes avec l'équipe.",
			it: "Rinnovare la segnaletica del percorso pedonale e confermare l'area pallet con il team.",
		}),
		dueDate: "2026-05-08",
		id: "action-fixture-finding-route",
		origin: "finding",
		status: "completed",
		title: localized({
			de: "Fussweg wieder freihalten",
			en: "Keep pedestrian route clear",
			fr: "Garder le chemin piéton libre",
			it: "Mantenere libero il percorso pedonale",
		}),
	},
	{
		assignee: localized({
			de: "Teammoderation",
			en: "Team facilitator",
			fr: "Animateur d'équipe",
			it: "Facilitatore del team",
		}),
		attachments: ["photo"],
		department: localized({
			de: "Montage",
			en: "Assembly",
			fr: "Assemblage",
			it: "Assemblaggio",
		}),
		description: localized({
			de: "Provisorische Ablage entfernen und bessere Greifposition im nächsten Teamgespräch bestätigen.",
			en: "Remove the temporary shelf and confirm a better reach position in the next team discussion.",
			fr: "Retirer l'étagère provisoire et confirmer une meilleure zone de prise lors du prochain échange d'équipe.",
			it: "Rimuovere il ripiano provvisorio e confermare una posizione di presa migliore nella prossima discussione del team.",
		}),
		dueDate: null,
		id: "action-fixture-safety-walk-ergonomics",
		origin: "safety_walk",
		status: "cancelled",
		title: localized({
			de: "Provisorische Ablage entfernen",
			en: "Remove temporary shelf",
			fr: "Retirer l'étagère provisoire",
			it: "Rimuovere il ripiano provvisorio",
		}),
	},
	{
		assignee: localized({
			de: "Prozesseigner",
			en: "Process owner",
			fr: "Propriétaire du processus",
			it: "Responsabile di processo",
		}),
		attachments: ["evidence"],
		department: localized({
			de: "Qualität",
			en: "Quality",
			fr: "Qualité",
			it: "Qualità",
		}),
		description: localized({
			de: "Auditpunkt im Wochenmeeting besprechen und entscheiden, ob ein SOP-Hinweis angepasst wird.",
			en: "Discuss the audit point in the weekly meeting and decide whether to update the SOP note.",
			fr: "Discuter le point d'audit en réunion hebdomadaire et décider si la note SOP doit être adaptée.",
			it: "Discutere il punto di audit nella riunione settimanale e decidere se aggiornare la nota SOP.",
		}),
		dueDate: "2026-05-15",
		id: "action-fixture-audit-sop",
		origin: "audit",
		status: "open",
		title: localized({
			de: "Auditpunkt im SOP klären",
			en: "Clarify audit point in SOP",
			fr: "Clarifier le point d'audit dans la SOP",
			it: "Chiarire il punto di audit nella SOP",
		}),
	},
] as const satisfies readonly ActionBoardFixture[];

export type RenderedActionBoardFixture = {
	id: string;
	assignee: string;
	attachmentLabels: readonly string[];
	department: string;
	description: string;
	dueDate: string | null;
	fieldLabels: {
		assignee: string;
		attachments: string;
		department: string;
		description: string;
		dueDate: string;
		origin: string;
		status: string;
		title: string;
	};
	originLabel: string;
	statusLabel: string;
	title: string;
};

export function renderActionBoardFixture(
	action: ActionBoardFixture,
	locale: Locale,
): RenderedActionBoardFixture {
	return {
		assignee: action.assignee[locale],
		attachmentLabels: action.attachments.map((attachment) =>
			t(ACTION_BOARD_ATTACHMENT_LABEL_KEYS[attachment], locale),
		),
		department: action.department[locale],
		description: action.description[locale],
		dueDate: action.dueDate,
		fieldLabels: {
			assignee: t("actionBoard.field.assignee", locale),
			attachments: t("actionBoard.field.attachments", locale),
			department: t("actionBoard.field.department", locale),
			description: t("actionBoard.field.description", locale),
			dueDate: t("actionBoard.field.dueDate", locale),
			origin: t("actionBoard.field.origin", locale),
			status: t("actionBoard.field.status", locale),
			title: t("actionBoard.field.title", locale),
		},
		id: action.id,
		originLabel: t(ACTION_BOARD_ORIGIN_LABEL_KEYS[action.origin], locale),
		statusLabel: t(ACTION_BOARD_STATUS_LABEL_KEYS[action.status], locale),
		title: action.title[locale],
	};
}

export function actionBoardLabels(locale: Locale) {
	return {
		detail: {
			addAttachment: t("actionBoard.detail.addAttachment", locale),
			closeAction: t("actionBoard.detail.closeAction", locale),
			editAction: t("actionBoard.detail.editAction", locale),
			markComplete: t("actionBoard.detail.markComplete", locale),
			needsFollowUp: t("actionBoard.detail.needsFollowUp", locale),
			reopenAction: t("actionBoard.detail.reopenAction", locale),
		},
		dueFilters: Object.fromEntries(
			ACTION_BOARD_DUE_FILTERS.map((filter) => [
				filter,
				t(ACTION_BOARD_DUE_FILTER_LABEL_KEYS[filter], locale),
			]),
		) as Record<ActionBoardDueFilter, string>,
		empty: {
			noActions: {
				body: t("actionBoard.empty.noActions.body", locale),
				cta: t("actionBoard.empty.noActions.cta", locale),
				title: t("actionBoard.empty.noActions.title", locale),
			},
			noMatches: {
				body: t("actionBoard.empty.noMatches.body", locale),
				cta: t("actionBoard.empty.noMatches.cta", locale),
				title: t("actionBoard.empty.noMatches.title", locale),
			},
		},
		fields: {
			assignee: t("actionBoard.field.assignee", locale),
			attachments: t("actionBoard.field.attachments", locale),
			department: t("actionBoard.field.department", locale),
			description: t("actionBoard.field.description", locale),
			dueDate: t("actionBoard.field.dueDate", locale),
			effectiveness: t("actionBoard.field.effectiveness", locale),
			isSafetyCritical: t("actionBoard.field.isSafetyCritical", locale),
			origin: t("actionBoard.field.origin", locale),
			originCreatedAt: t("actionBoard.field.originCreatedAt", locale),
			originId: t("actionBoard.field.originId", locale),
			originLabel: t("actionBoard.field.originLabel", locale),
			priority: t("actionBoard.field.priority", locale),
			status: t("actionBoard.field.status", locale),
			title: t("actionBoard.field.title", locale),
			verifiedAt: t("actionBoard.field.verifiedAt", locale),
			verifiedBy: t("actionBoard.field.verifiedBy", locale),
			verificationNote: t("actionBoard.field.verificationNote", locale),
			verificationStatus: t("actionBoard.field.verificationStatus", locale),
		},
		filters: {
			all: t("chemical.profileStatus.all", locale),
			assignee: t("actionBoard.filter.assignee", locale),
			department: t("actionBoard.filter.department", locale),
			due: t("actionBoard.filter.due", locale),
			origin: t("actionBoard.filter.origin", locale),
			status: t("actionBoard.filter.status", locale),
		},
		form: {
			attachmentDescription: t(
				"actionBoard.form.attachmentDescription",
				locale,
			),
			attachmentFile: t("actionBoard.form.attachmentFile", locale),
			attachmentsTitle: t("actionBoard.form.attachmentsTitle", locale),
			backToBoard: t("actionBoard.form.backToBoard", locale),
			closureFields: t("actionBoard.form.closureFields", locale),
			createDescription: t("actionBoard.form.createDescription", locale),
			createFollowUp: t("actionBoard.form.createFollowUp", locale),
			createTitle: t("actionBoard.form.createTitle", locale),
			editDescription: t("actionBoard.form.editDescription", locale),
			editTitle: t("actionBoard.form.editTitle", locale),
			followUpBody: t("actionBoard.form.followUpBody", locale),
			followUpTitle: t("actionBoard.form.followUpTitle", locale),
			followUpTitlePrefix: t("actionBoard.form.followUpTitlePrefix", locale),
			manualOriginHelp: t("actionBoard.form.manualOriginHelp", locale),
			mutableFields: t("actionBoard.form.mutableFields", locale),
			noAttachments: t("actionBoard.form.noAttachments", locale),
			originFields: t("actionBoard.form.originFields", locale),
			removeAttachment: t("actionBoard.form.removeAttachment", locale),
			removeFailed: t("actionBoard.form.removeFailed", locale),
			reopenAction: t("actionBoard.form.reopenAction", locale),
			saveFailed: t("actionBoard.form.saveFailed", locale),
			statusOnlyBlocked: t("actionBoard.form.statusOnlyBlocked", locale),
			uploadAttachment: t("actionBoard.form.uploadAttachment", locale),
			uploadFailed: t("actionBoard.form.uploadFailed", locale),
		},
		list: {
			filters: t("actionBoard.list.filters", locale),
			title: t("actionBoard.list.title", locale),
		},
		metrics: {
			assigneeBreakdown: t("actionBoard.metric.assigneeBreakdown", locale),
			completedThisWeek: t("actionBoard.metric.completedThisWeek", locale),
			departmentBreakdown: t("actionBoard.metric.departmentBreakdown", locale),
			dueSoon: t("actionBoard.metric.dueSoon", locale),
			findingsWithoutAction: t(
				"actionBoard.metric.findingsWithoutAction",
				locale,
			),
			needsFollowUp: t("actionBoard.metric.needsFollowUp", locale),
			noBreakdown: t("actionBoard.metric.noBreakdown", locale),
			open: t("actionBoard.metric.open", locale),
			openQueue: t("actionBoard.metric.openQueue", locale),
			originBreakdown: t("actionBoard.metric.originBreakdown", locale),
			overdue: t("actionBoard.metric.overdue", locale),
			pendingSdsReviews: t("actionBoard.metric.pendingSdsReviews", locale),
			relatedQueues: t("actionBoard.metric.relatedQueues", locale),
			statusBreakdown: t("actionBoard.metric.statusBreakdown", locale),
			unverifiedClosures: t("actionBoard.metric.unverifiedClosures", locale),
			weeklyRhythmBody: t("actionBoard.metric.weeklyRhythmBody", locale),
			weeklyRhythmTitle: t("actionBoard.metric.weeklyRhythmTitle", locale),
		},
	};
}
