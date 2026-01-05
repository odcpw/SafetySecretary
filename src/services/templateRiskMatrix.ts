import type { TemplateLikelihoodLevel, TemplateSeverityLevel } from "../types/templateRisk";

export type TemplateRiskBand = "HIGH" | "MEDIUM" | "LOW";

export const TEMPLATE_RISK_BAND_LABEL: Record<TemplateRiskBand, string> = {
  HIGH: "High Risk",
  MEDIUM: "Medium Risk",
  LOW: "Low Risk"
};

// Industry-standard 5x5 risk matrix with 3-level distribution
// LOW: scores 1-8, MEDIUM: scores 9-16, HIGH: scores 17-25
export const TEMPLATE_RISK_MATRIX: Record<TemplateLikelihoodLevel, Record<TemplateSeverityLevel, TemplateRiskBand>> =
  {
    "1": { E: "LOW", D: "MEDIUM", C: "MEDIUM", B: "HIGH", A: "HIGH" },
    "2": { E: "LOW", D: "LOW", C: "MEDIUM", B: "HIGH", A: "HIGH" },
    "3": { E: "LOW", D: "LOW", C: "MEDIUM", B: "MEDIUM", A: "HIGH" },
    "4": { E: "LOW", D: "LOW", C: "LOW", B: "LOW", A: "MEDIUM" },
    "5": { E: "LOW", D: "LOW", C: "LOW", B: "LOW", A: "LOW" }
  };

export const getTemplateRiskBand = (
  severity: TemplateSeverityLevel,
  likelihood: TemplateLikelihoodLevel
): TemplateRiskBand => {
  return TEMPLATE_RISK_MATRIX[likelihood][severity];
};
