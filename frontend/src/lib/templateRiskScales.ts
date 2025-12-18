import type { LikelihoodChoice, SeverityChoice } from "@/types/riskAssessment";

export const TEMPLATE_SEVERITY_OPTIONS: Array<{ value: SeverityChoice; label: string; helper: string }> = [
  { value: "A", label: "A — Catastrophic", helper: "Death / multiple serious injuries" },
  { value: "B", label: "B — Hazardous", helper: "Irreversible injury" },
  { value: "C", label: "C — Major", helper: "Lost time injury" },
  { value: "D", label: "D — Minor", helper: "Medical treatment (no lost time)" },
  { value: "E", label: "E — Negligible", helper: "First aid" }
];

export const TEMPLATE_LIKELIHOOD_OPTIONS: Array<{ value: LikelihoodChoice; label: string; helper: string }> = [
  { value: "1", label: "1 — Certain to occur", helper: "Common/repeating; occurs regularly" },
  { value: "2", label: "2 — Likely to occur", helper: "Known to occur; happened >1x" },
  { value: "3", label: "3 — Possible to occur", helper: "Could occur; happened once" },
  { value: "4", label: "4 — Unlikely to occur", helper: "Could occur but not likely; known in industry" },
  { value: "5", label: "5 — Extremely unlikely", helper: "Practically impossible; exceptional" }
];

