// Numeric scale for severity and likelihood (1-5)
export const NUMERIC_SCALE = ["1", "2", "3", "4", "5"] as const;

// Legacy string scales for backwards compatibility
export const SEVERITY_SCALE = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const LIKELIHOOD_SCALE = ["RARE", "UNLIKELY", "POSSIBLE", "LIKELY", "ALMOST_CERTAIN"] as const;

// Template severity (E lowest → A highest) for matrix column order
export const TEMPLATE_SEVERITY_SCALE = ["E", "D", "C", "B", "A"] as const;

export interface RiskMatrixSettings {
  rows: number;
  columns: number;
  rowLabels: string[];
  columnLabels: string[];
  riskBuckets: { label: string; color: string }[];
}

const STORAGE_KEY = "safetysecretary:riskMatrixSettings";

const defaultSettings: RiskMatrixSettings = {
  rows: 5,
  columns: 5,
  rowLabels: [
    "1 Certain to occur",
    "2 Likely to occur",
    "3 Possible to occur",
    "4 Unlikely to occur",
    "5 Extremely unlikely"
  ],
  columnLabels: ["E Negligible", "D Minor", "C Major", "B Hazardous", "A Catastrophic"],
  riskBuckets: [
    { label: "Negligible Risk", color: "#0f9d58" },
    { label: "Minor Risk", color: "#8bc34a" },
    { label: "Moderate Risk", color: "#f4c20d" },
    { label: "High Risk", color: "#f57c00" },
    { label: "Extreme Risk", color: "#d93025" }
  ]
};

export const getDefaultMatrixSettings = (): RiskMatrixSettings => ({
  ...defaultSettings,
  rowLabels: [...defaultSettings.rowLabels],
  columnLabels: [...defaultSettings.columnLabels],
  riskBuckets: defaultSettings.riskBuckets.map((bucket) => ({ ...bucket }))
});

export const loadMatrixSettings = (): RiskMatrixSettings => {
  if (typeof window === "undefined") {
    return getDefaultMatrixSettings();
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return getDefaultMatrixSettings();
    }
    const parsed = JSON.parse(raw) as RiskMatrixSettings;
    return {
      ...getDefaultMatrixSettings(),
      ...parsed,
      rowLabels: parsed.rowLabels ?? defaultSettings.rowLabels,
      columnLabels: parsed.columnLabels ?? defaultSettings.columnLabels,
      riskBuckets: parsed.riskBuckets ?? defaultSettings.riskBuckets
    };
  } catch {
    return getDefaultMatrixSettings();
  }
};

export const persistMatrixSettings = (settings: RiskMatrixSettings) => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
};

// Parse severity/likelihood value to 0-based index
// Supports both numeric ("1"-"5") and legacy string formats
const parseRiskLevel = (value: string): number => {
  const normalized = value.trim().toUpperCase();

  // Try numeric first (most common)
  const numericIdx = NUMERIC_SCALE.indexOf(normalized as (typeof NUMERIC_SCALE)[number]);
  if (numericIdx >= 0) return numericIdx;

  // Try template severity letters (E->0 ... A->4)
  const templateSeverityIdx = TEMPLATE_SEVERITY_SCALE.indexOf(
    normalized as (typeof TEMPLATE_SEVERITY_SCALE)[number]
  );
  if (templateSeverityIdx >= 0) return templateSeverityIdx;

  // Try legacy severity strings
  const severityIdx = SEVERITY_SCALE.indexOf(normalized as (typeof SEVERITY_SCALE)[number]);
  if (severityIdx >= 0) {
    // Map 4-level scale to 5-level (0->0, 1->1, 2->3, 3->4)
    return severityIdx === 0 ? 0 : severityIdx === 1 ? 1 : severityIdx === 2 ? 3 : 4;
  }

  // Try legacy likelihood strings
  const likelihoodIdx = LIKELIHOOD_SCALE.indexOf(normalized as (typeof LIKELIHOOD_SCALE)[number]);
  if (likelihoodIdx >= 0) return likelihoodIdx;

  return -1;
};

export const projectAssessmentToCell = (
  severity?: string | null,
  likelihood?: string | null,
  settings?: RiskMatrixSettings
): { row: number; column: number } | null => {
  if (!settings || !severity || !likelihood) {
    return null;
  }

  const severityIdx = parseRiskLevel(severity);
  const likelihoodIdx = parseRiskLevel(likelihood);

  if (severityIdx < 0 || likelihoodIdx < 0) {
    return null;
  }

  const scaleMax = Math.max(NUMERIC_SCALE.length - 1, 1);

  const normalizedRow = likelihoodIdx / scaleMax;
  const normalizedCol = severityIdx / scaleMax;

  const row = Math.min(settings.rows - 1, Math.max(0, Math.round(normalizedRow * (settings.rows - 1))));
  const column = Math.min(
    settings.columns - 1,
    Math.max(0, Math.round(normalizedCol * (settings.columns - 1)))
  );

  return { row, column };
};

export const getRiskColorForAssessment = (
  severity?: string | null,
  likelihood?: string | null,
  settings?: RiskMatrixSettings
): string => {
  if (!settings) {
    return "#cbd5f5";
  }
  const cell = projectAssessmentToCell(severity, likelihood, settings);
  if (!cell) {
    return "#cbd5f5";
  }
  const bucketCount = settings.riskBuckets.length;
  if (!bucketCount) {
    return "#cbd5f5";
  }

  // Exact template mapping when using the default 5x5 setup.
  if (settings.rows === 5 && settings.columns === 5 && bucketCount >= 5) {
    const templateBucketByCell: number[][] = [
      // Likelihood 1..5 rows (0..4), Severity E..A columns (0..4)
      [1, 2, 3, 4, 4],
      [0, 1, 2, 3, 4],
      [0, 1, 2, 2, 3],
      [0, 0, 1, 2, 2],
      [0, 0, 0, 1, 1]
    ];
    const bucketIndex = templateBucketByCell[cell.row]?.[cell.column];
    if (typeof bucketIndex === "number") {
      return settings.riskBuckets[bucketIndex]?.color ?? "#cbd5f5";
    }
  }

  const normalizedRow = settings.rows > 1 ? cell.row / (settings.rows - 1) : 0;
  const normalizedCol = settings.columns > 1 ? cell.column / (settings.columns - 1) : 0;
  const normalized = (normalizedRow + normalizedCol) / 2;
  const bucketIndex = Math.min(
    bucketCount - 1,
    Math.max(0, Math.round(normalized * (bucketCount - 1)))
  );
  return settings.riskBuckets[bucketIndex]?.color ?? "#cbd5f5";
};
