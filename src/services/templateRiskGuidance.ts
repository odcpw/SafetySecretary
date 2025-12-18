import type { TemplateRiskBand } from "./templateRiskMatrix";
import { TEMPLATE_RISK_BAND_LABEL } from "./templateRiskMatrix";

export type TemplateRiskGuidance = {
  label: string;
  decision: string;
  approver: string;
  timescale: string;
};

export const TEMPLATE_RISK_GUIDANCE: Record<TemplateRiskBand, TemplateRiskGuidance> = {
  EXTREME: {
    label: TEMPLATE_RISK_BAND_LABEL.EXTREME,
    decision: "Treat (stop immediately until mitigated)",
    approver: "Station Manager",
    timescale: "Mitigate now"
  },
  HIGH: {
    label: TEMPLATE_RISK_BAND_LABEL.HIGH,
    decision: "Treat",
    approver: "Unit/Dpt Head / BL leader",
    timescale: "Mitigate within 1–3 weeks"
  },
  MODERATE: {
    label: TEMPLATE_RISK_BAND_LABEL.MODERATE,
    decision: "Treat or tolerate (ALARP review)",
    approver: "Unit/Dpt Head / BL leader",
    timescale: "Mitigate within 1–3 months"
  },
  MINOR: {
    label: TEMPLATE_RISK_BAND_LABEL.MINOR,
    decision: "Tolerate",
    approver: "Supervisor",
    timescale: "Monitor controls"
  },
  NEGLIGIBLE: {
    label: TEMPLATE_RISK_BAND_LABEL.NEGLIGIBLE,
    decision: "Tolerate",
    approver: "Supervisor",
    timescale: "Monitor controls"
  }
};

