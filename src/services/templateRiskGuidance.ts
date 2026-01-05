import type { TemplateRiskBand } from "./templateRiskMatrix";
import { TEMPLATE_RISK_BAND_LABEL } from "./templateRiskMatrix";

export type TemplateRiskGuidance = {
  label: string;
  decision: string;
  approver: string;
  timescale: string;
};

export const TEMPLATE_RISK_GUIDANCE: Record<TemplateRiskBand, TemplateRiskGuidance> = {
  HIGH: {
    label: TEMPLATE_RISK_BAND_LABEL.HIGH,
    decision: "Treat",
    approver: "Unit/Dpt Head / BL leader",
    timescale: "Mitigate within 1–3 weeks"
  },
  MEDIUM: {
    label: TEMPLATE_RISK_BAND_LABEL.MEDIUM,
    decision: "Tolerate with monitoring",
    approver: "Supervisor",
    timescale: "Review controls quarterly"
  },
  LOW: {
    label: TEMPLATE_RISK_BAND_LABEL.LOW,
    decision: "Tolerate",
    approver: "Supervisor",
    timescale: "Monitor controls"
  }
};

