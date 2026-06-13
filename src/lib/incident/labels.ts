/**
 * One localized source for the human-readable display labels of the incident
 * classification enums shown on the coach workbench (the record panel and the
 * coach's proposal cards).
 *
 * Why a dedicated client-safe module: the canonical taxonomy labels live in
 * `fixtures/taxonomy/taxonomy.<locale>.json` and are read via `loadTaxonomy`,
 * which uses `node:fs` and so cannot run in the client components under
 * `src/components/incident/coach/*`. The hazard-category and severity labels
 * here are copied verbatim from those fixtures (kept in sync with them); the
 * incident-type and actual-outcome labels mirror the `incident.type.*` /
 * `incident.actualInjuryOutcome.*` entries in `src/lib/i18n/messages.*.json`
 * (the same strings the incident register at /incidents renders). Event-type
 * labels are authored here because no localized source existed for them.
 *
 * German is Swiss-style: real ä/ö/ü, "ss" (never "ß").
 */

export type LabelLocale = "de" | "en" | "fr" | "it";

const FALLBACK_LOCALE: LabelLocale = "en";
const SUPPORTED_LOCALES = new Set<string>(["de", "en", "fr", "it"]);

function normalizeLocale(locale: string): LabelLocale {
	return SUPPORTED_LOCALES.has(locale)
		? (locale as LabelLocale)
		: FALLBACK_LOCALE;
}

type LabelMap = Readonly<Record<string, Record<LabelLocale, string>>>;

/**
 * Humanize an unknown code as a safe last resort: "SLIP_TRIP_FALL" → "Slip trip
 * fall". Known codes never reach this — every enum below covers its full set.
 */
function humanize(code: string): string {
	const text = code.replaceAll("_", " ").trim().toLowerCase();

	if (!text) {
		return code;
	}

	return text.charAt(0).toUpperCase() + text.slice(1);
}

function lookup(map: LabelMap, code: string, locale: LabelLocale): string {
	const entry = map[code];

	if (!entry) {
		return humanize(code);
	}

	return entry[locale] ?? entry[FALLBACK_LOCALE] ?? humanize(code);
}

// incidentType — mirrors incident.type.* in src/lib/i18n/messages.*.json.
const INCIDENT_TYPE_LABELS: LabelMap = {
	NEAR_MISS: {
		de: "Beinaheereignis",
		en: "Near miss",
		fr: "Presqu'accident",
		it: "Mancato incidente",
	},
	ACCIDENT: { de: "Unfall", en: "Accident", fr: "Accident", it: "Infortunio" },
	PROPERTY_DAMAGE: {
		de: "Sachschaden",
		en: "Property damage",
		fr: "Dégât matériel",
		it: "Danno materiale",
	},
	// Legacy classification values some older records still carry.
	FIRST_AID: {
		de: "Erste Hilfe",
		en: "First aid",
		fr: "Premiers secours",
		it: "Primo soccorso",
	},
	LOST_TIME: {
		de: "Ausfallzeit",
		en: "Lost time",
		fr: "Arrêt de travail",
		it: "Assenza dal lavoro",
	},
};

// actualInjuryOutcome — mirrors incident.actualInjuryOutcome.* in messages.*.
const ACTUAL_INJURY_OUTCOME_LABELS: LabelMap = {
	UNKNOWN: { de: "Unbekannt", en: "Unknown", fr: "Inconnu", it: "Sconosciuto" },
	NO_INJURY: {
		de: "Keine Verletzung",
		en: "No injury",
		fr: "Aucune blessure",
		it: "Nessuna lesione",
	},
	FIRST_AID: {
		de: "Erste Hilfe",
		en: "First aid",
		fr: "Premiers secours",
		it: "Primo soccorso",
	},
	MEDICAL_TREATMENT: {
		de: "Medizinische Behandlung",
		en: "Medical treatment",
		fr: "Traitement médical",
		it: "Trattamento medico",
	},
	LOST_TIME: {
		de: "Verletzung mit Arbeitsausfall",
		en: "Lost time injury",
		fr: "Blessure avec arrêt de travail",
		it: "Infortunio con assenza dal lavoro",
	},
	IRREVERSIBLE_INJURY: {
		de: "Irreversibler Gesundheitsschaden",
		en: "Irreversible injury",
		fr: "Atteinte irréversible à la santé",
		it: "Danno irreversibile alla salute",
	},
	FATALITY: { de: "Tod", en: "Death", fr: "Décès", it: "Decesso" },
};

// severity (A–E) — copied verbatim from fixtures/taxonomy/taxonomy.*.json.
const SEVERITY_LABELS: LabelMap = {
	A: { de: "Tod", en: "Death", fr: "Décès", it: "Decesso" },
	B: {
		de: "Irreversibler Gesundheitsschaden",
		en: "Irreversible injury",
		fr: "Atteinte irréversible à la santé",
		it: "Danno irreversibile alla salute",
	},
	C: {
		de: "Verletzung mit Arbeitsausfall",
		en: "Lost time injury",
		fr: "Blessure avec arrêt de travail",
		it: "Infortunio con assenza dal lavoro",
	},
	D: {
		de: "Medizinische Behandlung",
		en: "Medical treatment",
		fr: "Traitement médical",
		it: "Trattamento medico",
	},
	E: {
		de: "Erste Hilfe",
		en: "First aid",
		fr: "Premiers secours",
		it: "Primo soccorso",
	},
};

// Heading labels for the honest actual-vs-potential damage presentation.
// "Tatsächlicher Schaden" is the actual harm (derived from the injury outcome);
// "Möglicher Schaden" is the worst-credible potential severity. The incident
// post-mortem does not judge likelihood, so there is no risk band heading.
// Swiss German: real ä/ö/ü, "ss" (never "ß").
const INCIDENT_FIELD_HEADING_LABELS: LabelMap = {
	actualHarm: {
		de: "Tatsächlicher Schaden",
		en: "Actual harm",
		fr: "Dommage réel",
		it: "Danno effettivo",
	},
	potentialHarm: {
		de: "Möglicher Schaden",
		en: "Potential harm",
		fr: "Dommage possible",
		it: "Danno possibile",
	},
};

// hazardCategory — copied verbatim from fixtures/taxonomy/taxonomy.*.json.
const HAZARD_CATEGORY_LABELS: LabelMap = {
	MECHANICAL: {
		de: "Mechanische Gefährdungen",
		en: "Mechanical hazards",
		fr: "Phénomènes dangereux mécaniques",
		it: "Pericoli di natura meccanica",
	},
	FALLS: {
		de: "Sturzgefährdungen",
		en: "Fall hazards",
		fr: "Phénomènes dangereux de chute",
		it: "Pericolo di caduta",
	},
	ELECTRICAL: {
		de: "Elektrische Gefährdungen",
		en: "Electrical hazards",
		fr: "Phénomènes dangereux électriques",
		it: "Pericoli di natura elettrica",
	},
	HAZARDOUS_SUBSTANCES: {
		de: "Gesundheitsgefährdende Stoffe (chemisch / biologisch)",
		en: "Harmful substances (chemical / biological)",
		fr: "Substances nocives (chimiques, biologiques)",
		it: "Sostanze nocive (chimiche / biologiche)",
	},
	FIRE_EXPLOSION: {
		de: "Brand- und Explosionsgefährdungen",
		en: "Fire and explosion hazards",
		fr: "Substances inflammables ou explosives",
		it: "Pericoli di incendio e di esplosione",
	},
	THERMAL: {
		de: "Thermische Gefährdungen",
		en: "Thermal hazards",
		fr: "Phénomènes dangereux thermiques",
		it: "Pericoli di natura termica",
	},
	PHYSICAL_AGENTS: {
		de: "Spezielle physikalische Belastungen",
		en: "Specific physical agents",
		fr: "Contraintes physiques particulières",
		it: "Sollecitazioni fisiche particolari",
	},
	ENVIRONMENTAL: {
		de: "Belastungen durch Arbeitsumgebungsbedingungen",
		en: "Environmental conditions",
		fr: "Contraintes liées à l'environnement de travail",
		it: "Sollecitazioni dovute a condizioni ambientali",
	},
	MUSCULOSKELETAL: {
		de: "Belastungen am Bewegungsapparat",
		en: "Musculoskeletal strain",
		fr: "Contraintes exercées sur l'appareil locomoteur",
		it: "Sollecitazione all'apparato locomotore",
	},
	PSYCHOSOCIAL: {
		de: "Psychische Belastungen",
		en: "Psychosocial strain",
		fr: "Contraintes psychiques",
		it: "Sollecitazioni psichiche",
	},
	UNEXPECTED_ACTIONS: {
		de: "Unerwartete Aktionen",
		en: "Unexpected actions (control / power failures)",
		fr: "Actions inattendues",
		it: "Azioni inaspettate",
	},
	WORK_ORGANISATION: {
		de: "Arbeitsorganisation",
		en: "Work organisation",
		fr: "Organisation du travail",
		it: "Organizzazione del lavoro",
	},
};

// eventType — authored here; codes from the agent's eventType enum (see
// src/lib/agent/incident-investigation/apply-operation.ts and coach-prompt.ts).
const EVENT_TYPE_LABELS: LabelMap = {
	SLIP_TRIP_FALL: {
		de: "Ausrutschen/Stolpern/Sturz",
		en: "Slip, trip or fall",
		fr: "Glissade, trébuchement ou chute",
		it: "Scivolamento, inciampo o caduta",
	},
	FALL_FROM_HEIGHT: {
		de: "Absturz aus Höhe",
		en: "Fall from height",
		fr: "Chute de hauteur",
		it: "Caduta dall'alto",
	},
	STRUCK_BY: {
		de: "Getroffen von/Anstossen an Gegenstand",
		en: "Struck by or against an object",
		fr: "Heurté par ou contre un objet",
		it: "Colpito da o contro un oggetto",
	},
	CAUGHT_IN_BETWEEN: {
		de: "Eingeklemmt oder erfasst",
		en: "Caught in or between",
		fr: "Coincé ou happé",
		it: "Schiacciato o incastrato",
	},
	CUT_PUNCTURE: {
		de: "Schnitt oder Stich",
		en: "Cut or puncture",
		fr: "Coupure ou piqûre",
		it: "Taglio o puntura",
	},
	MANUAL_HANDLING: {
		de: "Manuelle Handhabung/Überlastung",
		en: "Manual handling or overexertion",
		fr: "Manutention manuelle ou surmenage",
		it: "Movimentazione manuale o sovraccarico",
	},
	CONTACT_HOT_COLD: {
		de: "Kontakt mit Hitze oder Kälte",
		en: "Contact with heat or cold",
		fr: "Contact avec chaud ou froid",
		it: "Contatto con caldo o freddo",
	},
	CONTACT_WITH_CHEMICAL: {
		de: "Kontakt mit Chemikalie/Gefahrstoff",
		en: "Contact with a chemical",
		fr: "Contact avec un produit chimique",
		it: "Contatto con sostanza chimica",
	},
	ELECTRICITY: {
		de: "Stromkontakt/Stromschlag",
		en: "Electrical contact or shock",
		fr: "Contact électrique ou électrocution",
		it: "Contatto elettrico o scossa",
	},
	VEHICLE_TRAFFIC: {
		de: "Fahrzeug/Stapler/Verkehr",
		en: "Vehicle, forklift or traffic",
		fr: "Véhicule, chariot ou circulation",
		it: "Veicolo, carrello o traffico",
	},
	FIRE_EXPLOSION: {
		de: "Brand/Explosion",
		en: "Fire or explosion",
		fr: "Incendie ou explosion",
		it: "Incendio o esplosione",
	},
	HARMFUL_EXPOSURE: {
		de: "Schädliche Einwirkung (Lärm, Strahlung, Staub, biologisch)",
		en: "Harmful exposure (noise, radiation, dust, biological)",
		fr: "Exposition nocive (bruit, rayonnement, poussière, biologique)",
		it: "Esposizione nociva (rumore, radiazioni, polvere, biologico)",
	},
	PROPERTY_DAMAGE: {
		de: "Sachschaden (kein Personenschaden)",
		en: "Property damage (no injury)",
		fr: "Dégât matériel (sans blessé)",
		it: "Danno materiale (senza infortunio)",
	},
	OTHER: { de: "Sonstiges", en: "Other", fr: "Autre", it: "Altro" },
};

// workType — codes from the agent's workType enum (apply-operation.ts /
// coach-prompt.ts). Authored here; no prior localized source.
const WORK_TYPE_LABELS: LabelMap = {
	MAINTENANCE: {
		de: "Instandhaltung",
		en: "Maintenance",
		fr: "Maintenance",
		it: "Manutenzione",
	},
	OPERATIONS: {
		de: "Betrieb",
		en: "Operations",
		fr: "Exploitation",
		it: "Esercizio",
	},
	CLEANING: {
		de: "Reinigung",
		en: "Cleaning",
		fr: "Nettoyage",
		it: "Pulizia",
	},
	LOGISTICS: {
		de: "Logistik",
		en: "Logistics",
		fr: "Logistique",
		it: "Logistica",
	},
	CONSTRUCTION: {
		de: "Bau/Montage",
		en: "Construction",
		fr: "Construction",
		it: "Costruzione",
	},
	OFFICE: { de: "Büro", en: "Office", fr: "Bureau", it: "Ufficio" },
	OTHER: { de: "Sonstiges", en: "Other", fr: "Autre", it: "Altro" },
};

// controlFailure — codes from the agent's controlFailure enum. "Versagen der
// Massnahme": how the protective control failed. Swiss German keeps "ss".
const CONTROL_FAILURE_LABELS: LabelMap = {
	MISSING: {
		de: "Schutzmassnahme fehlte",
		en: "Control missing",
		fr: "Mesure manquante",
		it: "Misura mancante",
	},
	INADEQUATE: {
		de: "Schutzmassnahme unzureichend",
		en: "Control inadequate",
		fr: "Mesure inadéquate",
		it: "Misura inadeguata",
	},
	BYPASSED: {
		de: "Schutzmassnahme umgangen",
		en: "Control bypassed",
		fr: "Mesure contournée",
		it: "Misura elusa",
	},
	NOT_USED: {
		de: "Schutzmassnahme nicht genutzt",
		en: "Control not used",
		fr: "Mesure non utilisée",
		it: "Misura non utilizzata",
	},
	UNKNOWN: { de: "Unbekannt", en: "Unknown", fr: "Inconnu", it: "Sconosciuto" },
};

export function incidentTypeLabel(code: string, locale: string): string {
	return lookup(INCIDENT_TYPE_LABELS, code, normalizeLocale(locale));
}

export function outcomeLabel(code: string, locale: string): string {
	return lookup(ACTUAL_INJURY_OUTCOME_LABELS, code, normalizeLocale(locale));
}

export function severityLabel(code: string, locale: string): string {
	return lookup(SEVERITY_LABELS, code, normalizeLocale(locale));
}

/** Heading for the actual-vs-potential damage presentation. */
export type IncidentFieldHeading = "actualHarm" | "potentialHarm";

export function incidentFieldHeading(
	heading: IncidentFieldHeading,
	locale: string,
): string {
	return lookup(
		INCIDENT_FIELD_HEADING_LABELS,
		heading,
		normalizeLocale(locale),
	);
}

export function eventTypeLabel(code: string, locale: string): string {
	return lookup(EVENT_TYPE_LABELS, code, normalizeLocale(locale));
}

export function hazardCategoryLabel(code: string, locale: string): string {
	return lookup(HAZARD_CATEGORY_LABELS, code, normalizeLocale(locale));
}

export function workTypeLabel(code: string, locale: string): string {
	return lookup(WORK_TYPE_LABELS, code, normalizeLocale(locale));
}

export function controlFailureLabel(code: string, locale: string): string {
	return lookup(CONTROL_FAILURE_LABELS, code, normalizeLocale(locale));
}

/**
 * Day-first 24h date/time for the record panel, matching the register list's
 * European reading: "11.06.2026, 09:42" (dd.MM.yyyy, HH:mm). Deterministic —
 * built from explicit fields so no runtime locale can flip it to month-first.
 * Returns null for empty or unparseable input.
 */
// All incident date/times are stored as UTC instants but mean a moment in
// Switzerland. Render in a fixed Swiss zone so the displayed time matches what
// the manager confirmed, regardless of the server's local timezone (the coach
// is told the same zone — see coach-prompt CURRENT DATE/TIME).
export const INCIDENT_TIME_ZONE = "Europe/Zurich";

export function dateTimeLabel(value: string | null | undefined): string | null {
	if (!value) {
		return null;
	}

	const date = new Date(value);

	if (Number.isNaN(date.getTime())) {
		return null;
	}

	const parts = new Intl.DateTimeFormat("en-GB", {
		timeZone: INCIDENT_TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).formatToParts(date);
	const part = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((entry) => entry.type === type)?.value ?? "";

	return `${part("day")}.${part("month")}.${part("year")}, ${part("hour")}:${part("minute")}`;
}
