import type { TemplateLikelihoodLevel, TemplateSeverityLevel } from "../types/templateRisk";

export type TemplateRiskBand = "EXTREME" | "HIGH" | "MODERATE" | "MINOR" | "NEGLIGIBLE";

export const TEMPLATE_RISK_BAND_LABEL: Record<TemplateRiskBand, string> = {
  EXTREME: "Extreme Risk",
  HIGH: "High Risk",
  MODERATE: "Moderate Risk",
  MINOR: "Minor Risk",
  NEGLIGIBLE: "Negligible Risk"
};

// Source: "Liste" worksheet risk matrix in `HIRA Template SWP.xlsm` (sheet7.xml, range F11:J15).
export const TEMPLATE_RISK_MATRIX: Record<TemplateLikelihoodLevel, Record<TemplateSeverityLevel, TemplateRiskBand>> =
  {
    "1": { E: "MINOR", D: "MODERATE", C: "HIGH", B: "EXTREME", A: "EXTREME" },
    "2": { E: "NEGLIGIBLE", D: "MINOR", C: "MODERATE", B: "HIGH", A: "EXTREME" },
    "3": { E: "NEGLIGIBLE", D: "MINOR", C: "MODERATE", B: "MODERATE", A: "HIGH" },
    "4": { E: "NEGLIGIBLE", D: "NEGLIGIBLE", C: "MINOR", B: "MODERATE", A: "MODERATE" },
    "5": { E: "NEGLIGIBLE", D: "NEGLIGIBLE", C: "NEGLIGIBLE", B: "MINOR", A: "MINOR" }
  };

export const getTemplateRiskBand = (
  severity: TemplateSeverityLevel,
  likelihood: TemplateLikelihoodLevel
): TemplateRiskBand => {
  return TEMPLATE_RISK_MATRIX[likelihood][severity];
};
