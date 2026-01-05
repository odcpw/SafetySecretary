export const TEMPLATE_SEVERITY_LEVELS = ["A", "B", "C", "D", "E"] as const;
export type TemplateSeverityLevel = (typeof TEMPLATE_SEVERITY_LEVELS)[number];

export const TEMPLATE_LIKELIHOOD_LEVELS = ["1", "2", "3", "4", "5"] as const;
export type TemplateLikelihoodLevel = (typeof TEMPLATE_LIKELIHOOD_LEVELS)[number];

export const TEMPLATE_SEVERITY_LABEL: Record<TemplateSeverityLevel, string> = {
  A: "Death",
  B: "Irreversible Injury",
  C: "Lost Time Injury",
  D: "Medical Treatment",
  E: "First Aid"
};

export const TEMPLATE_LIKELIHOOD_LABEL: Record<TemplateLikelihoodLevel, string> = {
  "1": "Frequent",
  "2": "Likely",
  "3": "Possible",
  "4": "Unlikely",
  "5": "Rare"
};

