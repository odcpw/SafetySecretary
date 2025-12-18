export const TEMPLATE_SEVERITY_LEVELS = ["A", "B", "C", "D", "E"] as const;
export type TemplateSeverityLevel = (typeof TEMPLATE_SEVERITY_LEVELS)[number];

export const TEMPLATE_LIKELIHOOD_LEVELS = ["1", "2", "3", "4", "5"] as const;
export type TemplateLikelihoodLevel = (typeof TEMPLATE_LIKELIHOOD_LEVELS)[number];

export const TEMPLATE_SEVERITY_LABEL: Record<TemplateSeverityLevel, string> = {
  A: "Catastrophic",
  B: "Hazardous",
  C: "Major",
  D: "Minor",
  E: "Negligible"
};

export const TEMPLATE_LIKELIHOOD_LABEL: Record<TemplateLikelihoodLevel, string> = {
  "1": "Certain to occur",
  "2": "Likely to occur",
  "3": "Possible to occur",
  "4": "Unlikely to occur",
  "5": "Extremely unlikely to occur"
};

