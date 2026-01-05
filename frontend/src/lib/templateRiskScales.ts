import type { LikelihoodChoice, SeverityChoice } from "@/types/riskAssessment";

export const TEMPLATE_SEVERITY_OPTIONS: Array<{ value: SeverityChoice; label: string; helper: string }> = [
  { value: "A", label: "A — Death", helper: "Single or multiple fatalities" },
  { value: "B", label: "B — Irreversible Injury", helper: "Permanent disability or irreversible health effects" },
  { value: "C", label: "C — Lost Time Injury", helper: "Injury resulting in time away from work" },
  { value: "D", label: "D — Medical Treatment", helper: "Injury requiring professional medical treatment, no lost work time" },
  { value: "E", label: "E — First Aid", helper: "Minor injury requiring basic first aid only" }
];

export const TEMPLATE_LIKELIHOOD_OPTIONS: Array<{ value: LikelihoodChoice; label: string; helper: string }> = [
  { value: "1", label: "1 — Frequent", helper: "Common/repeating; occurs regularly" },
  { value: "2", label: "2 — Likely", helper: "Known to occur; happened >1x" },
  { value: "3", label: "3 — Possible", helper: "Could occur; happened once" },
  { value: "4", label: "4 — Unlikely", helper: "Could occur but not likely; known in industry" },
  { value: "5", label: "5 — Rare", helper: "Practically impossible; exceptional" }
];

