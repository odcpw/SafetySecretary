import { describe, expect, it } from "vitest";
import { TEMPLATE_RISK_BAND_LABEL, getTemplateRiskBand } from "../src/services/templateRiskMatrix";
import type { TemplateLikelihoodLevel, TemplateSeverityLevel } from "../src/types/templateRisk";

describe("template risk matrix (5x5)", () => {
  it("matches the HIRA template mapping for all 25 combinations", () => {
    const rows: Array<[TemplateLikelihoodLevel, Record<TemplateSeverityLevel, string>]> = [
      ["1", { E: "Minor Risk", D: "Moderate Risk", C: "High Risk", B: "Extreme Risk", A: "Extreme Risk" }],
      ["2", { E: "Negligible Risk", D: "Minor Risk", C: "Moderate Risk", B: "High Risk", A: "Extreme Risk" }],
      ["3", { E: "Negligible Risk", D: "Minor Risk", C: "Moderate Risk", B: "Moderate Risk", A: "High Risk" }],
      ["4", { E: "Negligible Risk", D: "Negligible Risk", C: "Minor Risk", B: "Moderate Risk", A: "Moderate Risk" }],
      ["5", { E: "Negligible Risk", D: "Negligible Risk", C: "Negligible Risk", B: "Minor Risk", A: "Minor Risk" }]
    ];

    for (const [likelihood, severityToLabel] of rows) {
      for (const severity of Object.keys(severityToLabel) as TemplateSeverityLevel[]) {
        const expectedLabel = severityToLabel[severity];
        const band = getTemplateRiskBand(severity, likelihood);
        expect(TEMPLATE_RISK_BAND_LABEL[band]).toBe(expectedLabel);
      }
    }
  });
});
