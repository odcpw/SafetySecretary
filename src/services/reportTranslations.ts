import { isSupportedLocale, type SupportedLocale } from "../config/locales";

type TranslateOptions = {
  fallback?: string;
  values?: Record<string, string | number>;
};

export type ReportTranslator = {
  locale: SupportedLocale;
  t: (key: string, options?: TranslateOptions) => string;
  get: <T = unknown>(key: string) => T | undefined;
  formatDate: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string;
  formatDateTime: (value: string | Date, options?: Intl.DateTimeFormatOptions) => string;
};

const REPORT_TRANSLATIONS = {
  en: {
    common: {
      placeholder: "—",
      notAvailable: "n/a",
      unassigned: "Unassigned",
      dueInline: "due {date}"
    },
    incident: {
      title: "Incident Investigation Summary",
      meta: {
        title: "Title",
        type: "Type",
        dateTime: "Date/Time",
        location: "Location",
        coordinator: "Coordinator"
      },
      mergedTimeline: "Merged Timeline",
      timelineTruncated: "Timeline truncated for one-page summary.",
      deviationsTitle: "Deviations & Causes",
      noDeviations: "No deviations recorded.",
      changeLabel: "Change",
      unspecified: "Unspecified",
      causeLabel: "Cause",
      deviationsTruncated: "Deviations truncated for one-page summary.",
      actionsTitle: "Actions",
      noActions: "No actions recorded.",
      actionsTruncated: "Actions truncated for one-page summary."
    },
    ra: {
      coverTitle: "Risk Assessment Summary",
      cover: {
        activity: "Activity",
        location: "Location",
        team: "Team",
        phase: "Phase",
        created: "Created"
      },
      stepsTitle: "Process Steps",
      equipmentLabel: "Equipment",
      substancesLabel: "Substances",
      hazardTableTitle: "Step-by-Step Hazard Table",
      noHazardsForStep: "No hazards recorded for this step.",
      riskBaselineLabel: "Risk (baseline)",
      existingControlsLabel: "Existing controls",
      proposedControlsLabel: "Proposed controls",
      riskResidualLabel: "Risk (residual)",
      actionsLabel: "Actions",
      actionPlanTitle: "Action Plan",
      noActions: "No actions recorded.",
      hazardLabel: "Hazard",
      ownerLabel: "Owner",
      dueLabel: "Due",
      statusLabel: "Status",
      riskMatrixTitle: "Risk Matrix (current)",
      riskMatrixFooter: "Numbers show hazard counts per severity/likelihood combination.",
      photosTitle: "Photos",
      unableToEmbed: "(Unable to embed image)",
      photoContext: {
        step: "Step {index}: {activity}",
        hazard: "Hazard: {label}",
        unassigned: "Unassigned"
      }
    },
    worksheets: {
      riskAssessment: "Risk Assessment",
      riskProfiles: "Risk Profiles",
      riskBands: "Risk Bands",
      actionPlan: "Action Plan & Mgt Validation",
      photos: "Photos",
      jha: "Job Hazard Analysis"
    },
    xlsx: {
      riskAssessmentHeaders: [
        "N°",
        "Description of activity (incl. equipment/tools/materials/substances)",
        "Code",
        "Type of hazard",
        "Description of the hazard",
        "Description of the potential consequences",
        "Person at risk",
        "Health & Safety Requirements (mandatory)",
        "Other recommended preventive and control measures",
        "Effectiveness / contributing factors",
        "Likelihood (baseline)",
        "Severity (baseline)",
        "Level of risk (baseline)",
        "Recommendations of actions to mitigate (headlines)",
        "Likelihood (residual)",
        "Severity (residual)",
        "Level of risk (residual)",
        "Measures to monitor/review residual risk",
        "Responsibility to monitor/review"
      ],
      riskGuidanceHeaders: ["Risk band", "Decision", "Approver", "Timescale"],
      actionPlanHeaders: [
        "Nr.",
        "CURRENT level of risk",
        "RECOMMENDATIONS (mitigations / control measures)",
        "TARGET level of risk",
        "RESOURCES NEEDED",
        "MANAGEMENT DECISION",
        "EXPLANATION / OTHER COMMENTS",
        "First name / Surname",
        "Date",
        "Signature",
        "DEADLINE",
        "RESPONSIBLE",
        "STATUS"
      ],
      photosHeaders: ["#", "Context", "Filename", "Preview"],
      jhaHeaders: ["Step #", "Job Step", "Hazard", "Consequence", "Controls"],
      matrixTitles: {
        baseline: "Current Matrix (baseline)",
        residual: "Target Matrix (residual)"
      }
    },
    jha: {
      title: "Job Hazard Analysis",
      jobTitle: "Job Title",
      site: "Site",
      supervisor: "Supervisor",
      workersInvolved: "Workers Involved",
      jobDate: "Job Date",
      revision: "Revision",
      preparedBy: "Prepared By",
      reviewedBy: "Reviewed By",
      approvedBy: "Approved By",
      signoffDate: "Sign-off Date",
      pdf: {
        documentDate: "Document Date",
        preparedSignature: "Prepared by (signature)",
        reviewedSignature: "Reviewed by (signature)",
        approvedSignature: "Approved by (signature)",
        pageLabel: "Page {page} of {total}"
      },
      stepsTitle: "Job Steps and Hazards",
      noHazardsForStep: "No hazards recorded for this step.",
      consequenceLabel: "Consequence",
      controlsLabel: "Controls"
    },
    domain: {
      hazardCategories: {
        MECHANICAL: "Mechanical",
        FALLS: "Falls",
        ELECTRICAL: "Electrical",
        HAZARDOUS_SUBSTANCES: "Hazardous Substances",
        FIRE_EXPLOSION: "Fire & Explosion",
        THERMAL: "Thermal",
        PHYSICAL: "Physical",
        ENVIRONMENTAL: "Environmental",
        ERGONOMIC: "Ergonomic",
        PSYCHOLOGICAL: "Psychological",
        CONTROL_FAILURES: "Control Failures",
        POWER_FAILURE: "Power Failure",
        ORGANIZATIONAL: "Organizational"
      },
      riskBands: {
        EXTREME: "Extreme Risk",
        HIGH: "High Risk",
        MODERATE: "Moderate Risk",
        MINOR: "Minor Risk",
        NEGLIGIBLE: "Negligible Risk"
      },
      actionStatus: {
        OPEN: "Open",
        IN_PROGRESS: "In Progress",
        COMPLETE: "Complete"
      },
      controlHierarchy: {
        SUBSTITUTION: "Substitution",
        TECHNICAL: "Technical",
        ORGANIZATIONAL: "Organizational",
        PPE: "PPE"
      },
      incidentTypes: {
        NEAR_MISS: "Near miss",
        FIRST_AID: "First aid",
        LOST_TIME: "Lost time",
        PROPERTY_DAMAGE: "Property damage"
      },
      incidentConfidence: {
        CONFIRMED: "Confirmed",
        LIKELY: "Likely",
        UNCLEAR: "Unclear"
      },
      incidentActionTypes: {
        ENGINEERING: "Engineering",
        ORGANISATIONAL: "Organisational",
        PPE: "PPE",
        TRAINING: "Training"
      },
      phases: {
        PROCESS_STEPS: "Process Description",
        HAZARD_IDENTIFICATION: "Hazard Identification",
        RISK_RATING: "Baseline Risk Assessment",
        CONTROL_DISCUSSION: "Controls & Residual Risk",
        ACTIONS: "Action Plan",
        RESIDUAL_RISK: "Residual Risk",
        COMPLETE: "Complete"
      }
    },
    riskGuidance: {
      EXTREME: {
        decision: "Treat (stop immediately until mitigated)",
        approver: "Station Manager",
        timescale: "Mitigate now"
      },
      HIGH: {
        decision: "Treat",
        approver: "Unit/Dpt Head / BL leader",
        timescale: "Mitigate within 1-3 weeks"
      },
      MODERATE: {
        decision: "Treat or tolerate (ALARP review)",
        approver: "Unit/Dpt Head / BL leader",
        timescale: "Mitigate within 1-3 months"
      },
      MINOR: {
        decision: "Tolerate",
        approver: "Supervisor",
        timescale: "Monitor controls"
      },
      NEGLIGIBLE: {
        decision: "Tolerate",
        approver: "Supervisor",
        timescale: "Monitor controls"
      }
    }
  },
  fr: {
    common: {
      placeholder: "—",
      notAvailable: "n/a",
      unassigned: "Non assigne",
      dueInline: "echeance {date}"
    },
    incident: {
      title: "Resume d'enquete d'incident",
      meta: {
        title: "Titre",
        type: "Type",
        dateTime: "Date/heure",
        location: "Lieu",
        coordinator: "Coordinateur"
      },
      mergedTimeline: "Chronologie fusionnee",
      timelineTruncated: "Chronologie tronquee pour le resume d'une page.",
      deviationsTitle: "Deviations et causes",
      noDeviations: "Aucune deviation enregistree.",
      changeLabel: "Changement",
      unspecified: "Non precise",
      causeLabel: "Cause",
      deviationsTruncated: "Deviations tronquees pour le resume d'une page.",
      actionsTitle: "Actions",
      noActions: "Aucune action enregistree.",
      actionsTruncated: "Actions tronquees pour le resume d'une page."
    },
    ra: {
      coverTitle: "Resume d'evaluation des risques",
      cover: {
        activity: "Activite",
        location: "Lieu",
        team: "Equipe",
        phase: "Phase",
        created: "Cree"
      },
      stepsTitle: "Etapes du processus",
      equipmentLabel: "Equipement",
      substancesLabel: "Substances",
      hazardTableTitle: "Table des dangers par etape",
      noHazardsForStep: "Aucun danger enregistre pour cette etape.",
      riskBaselineLabel: "Risque (base)",
      existingControlsLabel: "Controles existants",
      proposedControlsLabel: "Controles proposes",
      riskResidualLabel: "Risque (residuel)",
      actionsLabel: "Actions",
      actionPlanTitle: "Plan d'action",
      noActions: "Aucune action enregistree.",
      hazardLabel: "Danger",
      ownerLabel: "Responsable",
      dueLabel: "Echeance",
      statusLabel: "Statut",
      riskMatrixTitle: "Matrice de risque (actuelle)",
      riskMatrixFooter: "Les nombres indiquent le nombre de dangers par combinaison gravite/probabilite.",
      photosTitle: "Photos",
      unableToEmbed: "(Impossible d'inserer l'image)",
      photoContext: {
        step: "Etape {index}: {activity}",
        hazard: "Danger : {label}",
        unassigned: "Non assigne"
      }
    },
    worksheets: {
      riskAssessment: "Evaluation des risques",
      riskProfiles: "Profils de risque",
      riskBands: "Bandes de risque",
      actionPlan: "Plan d'action et validation",
      photos: "Photos",
      jha: "Analyse des dangers du travail"
    },
    xlsx: {
      riskAssessmentHeaders: [
        "N°",
        "Description de l'activite (equipement/outils/materiels/substances)",
        "Code",
        "Type de danger",
        "Description du danger",
        "Description des consequences potentielles",
        "Personne a risque",
        "Exigences sante/securite (obligatoire)",
        "Autres mesures preventives recommandees",
        "Efficacite / facteurs contributifs",
        "Probabilite (base)",
        "Gravite (base)",
        "Niveau de risque (base)",
        "Recommandations d'actions d'attenuation (titres)",
        "Probabilite (residuel)",
        "Gravite (residuel)",
        "Niveau de risque (residuel)",
        "Mesures pour surveiller le risque residuel",
        "Responsable du suivi"
      ],
      riskGuidanceHeaders: ["Bande de risque", "Decision", "Approbateur", "Echeance"],
      actionPlanHeaders: [
        "No.",
        "Niveau de risque actuel",
        "Recommandations (attenuation / mesures)",
        "Niveau de risque cible",
        "Ressources necessaires",
        "Decision de gestion",
        "Explication / autres commentaires",
        "Prenom / Nom",
        "Date",
        "Signature",
        "Echeance",
        "Responsable",
        "Statut"
      ],
      photosHeaders: ["#", "Contexte", "Nom du fichier", "Apercu"],
      jhaHeaders: ["Etape #", "Etape de travail", "Danger", "Consequence", "Mesures"],
      matrixTitles: {
        baseline: "Matrice actuelle (base)",
        residual: "Matrice cible (residuel)"
      }
    },
    jha: {
      title: "Analyse des dangers du travail",
      jobTitle: "Titre du poste",
      site: "Site",
      supervisor: "Superviseur",
      workersInvolved: "Travailleurs impliques",
      jobDate: "Date du travail",
      revision: "Revision",
      preparedBy: "Prepare par",
      reviewedBy: "Revu par",
      approvedBy: "Approuve par",
      signoffDate: "Date de validation",
      pdf: {
        documentDate: "Date du document",
        preparedSignature: "Prepare par (signature)",
        reviewedSignature: "Revu par (signature)",
        approvedSignature: "Approuve par (signature)",
        pageLabel: "Page {page} sur {total}"
      },
      stepsTitle: "Etapes et dangers",
      noHazardsForStep: "Aucun danger enregistre pour cette etape.",
      consequenceLabel: "Consequence",
      controlsLabel: "Mesures"
    },
    domain: {
      hazardCategories: {
        MECHANICAL: "Mecanique",
        FALLS: "Chutes",
        ELECTRICAL: "Electrique",
        HAZARDOUS_SUBSTANCES: "Substances dangereuses",
        FIRE_EXPLOSION: "Incendie et explosion",
        THERMAL: "Thermique",
        PHYSICAL: "Physique",
        ENVIRONMENTAL: "Environnemental",
        ERGONOMIC: "Ergonomique",
        PSYCHOLOGICAL: "Psychologique",
        CONTROL_FAILURES: "Defaillances de controle",
        POWER_FAILURE: "Panne d'alimentation",
        ORGANIZATIONAL: "Organisationnel"
      },
      riskBands: {
        EXTREME: "Risque extreme",
        HIGH: "Risque eleve",
        MODERATE: "Risque modere",
        MINOR: "Risque mineur",
        NEGLIGIBLE: "Risque negligeable"
      },
      actionStatus: {
        OPEN: "Ouvert",
        IN_PROGRESS: "En cours",
        COMPLETE: "Termine"
      },
      controlHierarchy: {
        SUBSTITUTION: "Substitution",
        TECHNICAL: "Technique",
        ORGANIZATIONAL: "Organisationnel",
        PPE: "EPI"
      },
      incidentTypes: {
        NEAR_MISS: "Presque accident",
        FIRST_AID: "Premiers secours",
        LOST_TIME: "Arret de travail",
        PROPERTY_DAMAGE: "Dommages materiels"
      },
      incidentConfidence: {
        CONFIRMED: "Confirme",
        LIKELY: "Probable",
        UNCLEAR: "Incertain"
      },
      incidentActionTypes: {
        ENGINEERING: "Technique",
        ORGANISATIONAL: "Organisationnel",
        PPE: "EPI",
        TRAINING: "Formation"
      },
      phases: {
        PROCESS_STEPS: "Description du processus",
        HAZARD_IDENTIFICATION: "Identification des dangers",
        RISK_RATING: "Evaluation du risque de base",
        CONTROL_DISCUSSION: "Mesures et risque residuel",
        ACTIONS: "Plan d'action",
        RESIDUAL_RISK: "Risque residuel",
        COMPLETE: "Termine"
      }
    },
    riskGuidance: {
      EXTREME: {
        decision: "Traiter (arreter immediatement jusqu'a mitigation)",
        approver: "Responsable de station",
        timescale: "Mitiger maintenant"
      },
      HIGH: {
        decision: "Traiter",
        approver: "Chef d'unite / responsable BL",
        timescale: "Mitiger sous 1-3 semaines"
      },
      MODERATE: {
        decision: "Traiter ou tolerer (revue ALARP)",
        approver: "Chef d'unite / responsable BL",
        timescale: "Mitiger sous 1-3 mois"
      },
      MINOR: {
        decision: "Tolerer",
        approver: "Superviseur",
        timescale: "Surveiller les controles"
      },
      NEGLIGIBLE: {
        decision: "Tolerer",
        approver: "Superviseur",
        timescale: "Surveiller les controles"
      }
    }
  },
  de: {
    common: {
      placeholder: "—",
      notAvailable: "n/a",
      unassigned: "Nicht zugewiesen",
      dueInline: "faellig {date}"
    },
    incident: {
      title: "Zusammenfassung der Unfalluntersuchung",
      meta: {
        title: "Titel",
        type: "Typ",
        dateTime: "Datum/Uhrzeit",
        location: "Ort",
        coordinator: "Koordinator"
      },
      mergedTimeline: "Zusammengefuhrte Timeline",
      timelineTruncated: "Timeline fur Einseiten-Zusammenfassung gekurzt.",
      deviationsTitle: "Abweichungen und Ursachen",
      noDeviations: "Keine Abweichungen erfasst.",
      changeLabel: "Aenderung",
      unspecified: "Nicht angegeben",
      causeLabel: "Ursache",
      deviationsTruncated: "Abweichungen fur Einseiten-Zusammenfassung gekurzt.",
      actionsTitle: "Aktionen",
      noActions: "Keine Aktionen erfasst.",
      actionsTruncated: "Aktionen fur Einseiten-Zusammenfassung gekurzt."
    },
    ra: {
      coverTitle: "Zusammenfassung der Risikobewertung",
      cover: {
        activity: "Aktivitat",
        location: "Ort",
        team: "Team",
        phase: "Phase",
        created: "Erstellt"
      },
      stepsTitle: "Prozessschritte",
      equipmentLabel: "Ausrustung",
      substancesLabel: "Stoffe",
      hazardTableTitle: "Gefahrentabelle nach Schritten",
      noHazardsForStep: "Keine Gefahren fur diesen Schritt erfasst.",
      riskBaselineLabel: "Risiko (Basis)",
      existingControlsLabel: "Bestehende Kontrollen",
      proposedControlsLabel: "Vorgeschlagene Kontrollen",
      riskResidualLabel: "Risiko (Rest)",
      actionsLabel: "Aktionen",
      actionPlanTitle: "Aktionsplan",
      noActions: "Keine Aktionen erfasst.",
      hazardLabel: "Gefahr",
      ownerLabel: "Verantwortlich",
      dueLabel: "Faellig",
      statusLabel: "Status",
      riskMatrixTitle: "Risikomatrix (aktuell)",
      riskMatrixFooter: "Zahlen zeigen die Anzahl der Gefahren je Schweregrad/Wahrscheinlichkeit.",
      photosTitle: "Fotos",
      unableToEmbed: "(Bild konnte nicht eingebettet werden)",
      photoContext: {
        step: "Schritt {index}: {activity}",
        hazard: "Gefahr: {label}",
        unassigned: "Nicht zugewiesen"
      }
    },
    worksheets: {
      riskAssessment: "Risikobewertung",
      riskProfiles: "Risikoprofile",
      riskBands: "Risikostufen",
      actionPlan: "Aktionsplan und Freigabe",
      photos: "Fotos",
      jha: "Arbeitsgefahrenanalyse"
    },
    xlsx: {
      riskAssessmentHeaders: [
        "Nr.",
        "Beschreibung der Aktivitat (inkl. Ausrustung/Werkzeuge/Materialien/Stoffe)",
        "Code",
        "Art der Gefahr",
        "Beschreibung der Gefahr",
        "Beschreibung der moglichen Folgen",
        "Person im Risiko",
        "Arbeitsschutzanforderungen (pflichtig)",
        "Weitere empfohlene Schutz- und Kontrollmassnahmen",
        "Wirksamkeit / beitragende Faktoren",
        "Wahrscheinlichkeit (Basis)",
        "Schweregrad (Basis)",
        "Risikostufe (Basis)",
        "Empfehlungen zur Minderung (Stichpunkte)",
        "Wahrscheinlichkeit (Rest)",
        "Schweregrad (Rest)",
        "Risikostufe (Rest)",
        "Massnahmen zur Ueberwachung des Restrisikos",
        "Verantwortung fur Ueberwachung"
      ],
      riskGuidanceHeaders: ["Risikostufe", "Entscheidung", "Freigabe", "Zeitplan"],
      actionPlanHeaders: [
        "Nr.",
        "Aktuelles Risikoniveau",
        "Empfehlungen (Minderung / Massnahmen)",
        "Zielrisiko",
        "Benotigte Ressourcen",
        "Managemententscheidung",
        "Erlaeuterung / weitere Kommentare",
        "Vorname / Nachname",
        "Datum",
        "Unterschrift",
        "Frist",
        "Verantwortlich",
        "Status"
      ],
      photosHeaders: ["#", "Kontext", "Dateiname", "Vorschau"],
      jhaHeaders: ["Schritt #", "Arbeitsschritt", "Gefahr", "Konsequenz", "Kontrollen"],
      matrixTitles: {
        baseline: "Aktuelle Matrix (Basis)",
        residual: "Zielmatrix (Rest)"
      }
    },
    jha: {
      title: "Arbeitsgefahrenanalyse",
      jobTitle: "Arbeitsbezeichnung",
      site: "Standort",
      supervisor: "Vorgesetzter",
      workersInvolved: "Beteiligte Mitarbeiter",
      jobDate: "Arbeitsdatum",
      revision: "Revision",
      preparedBy: "Erstellt von",
      reviewedBy: "Geprueft von",
      approvedBy: "Freigegeben von",
      signoffDate: "Freigabedatum",
      pdf: {
        documentDate: "Dokumentdatum",
        preparedSignature: "Erstellt von (Unterschrift)",
        reviewedSignature: "Geprueft von (Unterschrift)",
        approvedSignature: "Freigegeben von (Unterschrift)",
        pageLabel: "Seite {page} von {total}"
      },
      stepsTitle: "Arbeitsschritte und Gefahren",
      noHazardsForStep: "Keine Gefahren fur diesen Schritt erfasst.",
      consequenceLabel: "Konsequenz",
      controlsLabel: "Kontrollen"
    },
    domain: {
      hazardCategories: {
        MECHANICAL: "Mechanisch",
        FALLS: "Sturze",
        ELECTRICAL: "Elektrisch",
        HAZARDOUS_SUBSTANCES: "Gefahrstoffe",
        FIRE_EXPLOSION: "Brand und Explosion",
        THERMAL: "Thermisch",
        PHYSICAL: "Physikalisch",
        ENVIRONMENTAL: "Umwelt",
        ERGONOMIC: "Ergonomisch",
        PSYCHOLOGICAL: "Psychologisch",
        CONTROL_FAILURES: "Kontrollausfalle",
        POWER_FAILURE: "Stromausfall",
        ORGANIZATIONAL: "Organisatorisch"
      },
      riskBands: {
        EXTREME: "Extremes Risiko",
        HIGH: "Hohes Risiko",
        MODERATE: "Moderates Risiko",
        MINOR: "Geringes Risiko",
        NEGLIGIBLE: "Vernachlassigbares Risiko"
      },
      actionStatus: {
        OPEN: "Offen",
        IN_PROGRESS: "In Arbeit",
        COMPLETE: "Abgeschlossen"
      },
      controlHierarchy: {
        SUBSTITUTION: "Substitution",
        TECHNICAL: "Technisch",
        ORGANIZATIONAL: "Organisatorisch",
        PPE: "PSA"
      },
      incidentTypes: {
        NEAR_MISS: "Beinaheunfall",
        FIRST_AID: "Erste Hilfe",
        LOST_TIME: "Arbeitsausfall",
        PROPERTY_DAMAGE: "Sachschaden"
      },
      incidentConfidence: {
        CONFIRMED: "Bestaetigt",
        LIKELY: "Wahrscheinlich",
        UNCLEAR: "Unklar"
      },
      incidentActionTypes: {
        ENGINEERING: "Technisch",
        ORGANISATIONAL: "Organisatorisch",
        PPE: "PSA",
        TRAINING: "Training"
      },
      phases: {
        PROCESS_STEPS: "Prozessbeschreibung",
        HAZARD_IDENTIFICATION: "Gefahrenermittlung",
        RISK_RATING: "Basisrisikobewertung",
        CONTROL_DISCUSSION: "Massnahmen und Restrisiko",
        ACTIONS: "Aktionsplan",
        RESIDUAL_RISK: "Restrisiko",
        COMPLETE: "Abgeschlossen"
      }
    },
    riskGuidance: {
      EXTREME: {
        decision: "Behandeln (sofort stoppen bis gemindert)",
        approver: "Stationsleiter",
        timescale: "Sofort mindern"
      },
      HIGH: {
        decision: "Behandeln",
        approver: "Abteilungsleiter / BL-Leiter",
        timescale: "Mindern in 1-3 Wochen"
      },
      MODERATE: {
        decision: "Behandeln oder tolerieren (ALARP-Prufung)",
        approver: "Abteilungsleiter / BL-Leiter",
        timescale: "Mindern in 1-3 Monaten"
      },
      MINOR: {
        decision: "Tolerieren",
        approver: "Vorgesetzter",
        timescale: "Kontrollen uberwachen"
      },
      NEGLIGIBLE: {
        decision: "Tolerieren",
        approver: "Vorgesetzter",
        timescale: "Kontrollen uberwachen"
      }
    }
  }
} as const;

const normalizeKey = (key: string) => key.split(".").filter(Boolean);

const getTranslationValue = (locale: SupportedLocale, key: string) => {
  const parts = normalizeKey(key);
  let current: any = REPORT_TRANSLATIONS[locale];
  for (const part of parts) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = current[part];
  }
  return current;
};

const interpolate = (template: string, values?: Record<string, string | number>) => {
  if (!values) return template;
  return Object.entries(values).reduce((acc, [key, value]) => {
    return acc.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));
  }, template);
};

export const createReportTranslator = (locale?: string): ReportTranslator => {
  const safeLocale: SupportedLocale = locale && isSupportedLocale(locale) ? locale : "en";

  const get = <T = unknown>(key: string): T | undefined => {
    return (getTranslationValue(safeLocale, key) ?? getTranslationValue("en", key)) as T | undefined;
  };

  const t = (key: string, options?: TranslateOptions) => {
    const translation = (getTranslationValue(safeLocale, key) ??
      getTranslationValue("en", key) ??
      options?.fallback ??
      key) as string;
    return interpolate(translation, options?.values);
  };

  const formatDate = (value: string | Date, options?: Intl.DateTimeFormatOptions) => {
    const date = typeof value === "string" ? new Date(value) : value;
    return new Intl.DateTimeFormat(safeLocale, options ?? { year: "numeric", month: "short", day: "numeric" }).format(
      date
    );
  };

  const formatDateTime = (value: string | Date, options?: Intl.DateTimeFormatOptions) => {
    const date = typeof value === "string" ? new Date(value) : value;
    return new Intl.DateTimeFormat(
      safeLocale,
      options ?? { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
    ).format(date);
  };

  return {
    locale: safeLocale,
    t,
    get,
    formatDate,
    formatDateTime
  };
};
