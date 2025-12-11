import PDFDocument from "pdfkit";
import { RiskAssessmentCaseDto } from "./raService";
import ExcelJS from "exceljs";

const SEVERITY_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const LIKELIHOOD_LEVELS = ["RARE", "UNLIKELY", "POSSIBLE", "LIKELY", "ALMOST_CERTAIN"];
const RISK_BUCKETS = [
  { label: "Very Low", color: "0f9d58" },
  { label: "Low", color: "8bc34a" },
  { label: "Moderate", color: "f4c20d" },
  { label: "High", color: "f57c00" },
  { label: "Extreme", color: "d93025" }
];

export class ReportService {
  async generatePdfForCase(raCase: RiskAssessmentCaseDto): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ autoFirstPage: false, margin: 50 });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (error: Error) => reject(error));

      this.renderCover(doc, raCase);
      this.renderSteps(doc, raCase);
      this.renderHazardTable(doc, raCase);
      this.renderActionPlan(doc, raCase);
      this.renderRiskMatrix(doc, raCase);

      doc.end();
    });
  }

  async generateXlsxForCase(raCase: RiskAssessmentCaseDto): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "SafetySecretary";
    workbook.created = new Date();

    this.buildHiraSheet(workbook, raCase);
    this.buildMatrixSheet(workbook, raCase);
    this.buildActionsSheet(workbook, raCase);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private buildHiraSheet(workbook: ExcelJS.Workbook, raCase: RiskAssessmentCaseDto) {
    const sheet = workbook.addWorksheet("HIRA Table");
    const headers = [
      "Step #",
      "Activity",
      "Equipment",
      "Substances",
      "Hazard",
      "Description",
      "Category",
      "Existing Controls",
      "Proposed Controls",
      "Baseline Severity",
      "Baseline Likelihood",
      "Baseline Risk",
      "Residual Severity",
      "Residual Likelihood",
      "Residual Risk",
      "Action",
      "Owner",
      "Due Date",
      "Status"
    ];
    sheet.columns = headers.map((header) => ({ header, width: 18 }));
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE5E7EB" }
    };

    const actionsByHazard = raCase.actions.reduce<Record<string, typeof raCase.actions>>((acc, action) => {
      if (!action.hazardId) return acc;
      acc[action.hazardId] = acc[action.hazardId] ?? [];
      acc[action.hazardId]!.push(action);
      return acc;
    }, {});

    raCase.steps.forEach((step, stepIndex) => {
      const hazardsForStep = raCase.hazards.filter((hazard) => hazard.stepIds.includes(step.id));
      if (!hazardsForStep.length) {
        sheet.addRow([
          stepIndex + 1,
          step.activity,
          (step.equipment ?? []).join(", "),
          (step.substances ?? []).join(", "),
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          ""
        ]);
        return;
      }

      hazardsForStep.forEach((hazard, hazardIndex) => {
        const baseline = hazard.baselineAssessment;
        const residual = hazard.residualAssessment;
        const proposedControls =
          hazard.proposedControls?.map((c) => (c.hierarchy ? `${c.description} (${c.hierarchy})` : c.description)) ??
          [];
        const hazardActions = actionsByHazard[hazard.id] ?? [];
        const action = hazardActions[0];
        sheet.addRow([
          `${stepIndex + 1}.${hazardIndex + 1}`,
          hazardIndex === 0 ? step.activity : "",
          hazardIndex === 0 ? (step.equipment ?? []).join(", ") : "",
          hazardIndex === 0 ? (step.substances ?? []).join(", ") : "",
          hazard.label,
          hazard.description ?? "",
          hazard.categoryCode ?? "",
          (hazard.existingControls ?? []).join("\n"),
          proposedControls.join("\n"),
          baseline?.severity ?? "",
          baseline?.likelihood ?? "",
          baseline ? `${baseline.severity} x ${baseline.likelihood}` : "",
          residual?.severity ?? "",
          residual?.likelihood ?? "",
          residual ? `${residual.severity} x ${residual.likelihood}` : "",
          action?.description ?? "",
          action?.owner ?? "",
          action?.dueDate ? new Date(action.dueDate).toLocaleDateString() : "",
          action?.status ?? ""
        ]);
      });
    });

    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.alignment = { vertical: "top", wrapText: true };
      row.border = {
        top: { style: "thin", color: { argb: "FFE5E7EB" } },
        bottom: { style: "thin", color: { argb: "FFE5E7EB" } }
      };
    });
  }

  private buildMatrixSheet(workbook: ExcelJS.Workbook, raCase: RiskAssessmentCaseDto) {
    const sheet = workbook.addWorksheet("Risk Matrix");
    sheet.getCell("A1").value = "Baseline risk distribution";
    sheet.getCell("A1").font = { bold: true, size: 14 };

    const offsetRow = 3;
    const offsetCol = 2;

    // Headers
    LIKELIHOOD_LEVELS.forEach((likelihood, idx) => {
      const cell = sheet.getCell(offsetRow, offsetCol + idx + 1);
      cell.value = likelihood;
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center" };
    });
    SEVERITY_LEVELS.forEach((severity, idx) => {
      const cell = sheet.getCell(offsetRow + idx + 1, offsetCol);
      cell.value = severity;
      cell.font = { bold: true };
      cell.alignment = { horizontal: "center" };
    });

    const counts: Record<string, Record<string, number>> = {};
    SEVERITY_LEVELS.forEach((sev) => {
      counts[sev] = {};
      LIKELIHOOD_LEVELS.forEach((lik) => {
        counts[sev]![lik] = 0;
      });
    });

    raCase.hazards.forEach((hazard) => {
      const severity = hazard.baselineAssessment?.severity;
      const likelihood = hazard.baselineAssessment?.likelihood;
      if (severity && likelihood && counts[severity]) {
        counts[severity]![likelihood] = (counts[severity]![likelihood] ?? 0) + 1;
      }
    });

    LIKELIHOOD_LEVELS.forEach((likelihood, colIdx) => {
      SEVERITY_LEVELS.forEach((severity, rowIdx) => {
        const cell = sheet.getCell(offsetRow + rowIdx + 1, offsetCol + colIdx + 1);
        const count = counts[severity]?.[likelihood] ?? 0;
        cell.value = count || "";
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: this.getRiskColor(severity, likelihood) }
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FFE5E7EB" } },
          left: { style: "thin", color: { argb: "FFE5E7EB" } },
          bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
          right: { style: "thin", color: { argb: "FFE5E7EB" } }
        };
      });
    });

    sheet.columns.forEach((col) => {
      col.width = 16;
    });
  }

  private buildActionsSheet(workbook: ExcelJS.Workbook, raCase: RiskAssessmentCaseDto) {
    const sheet = workbook.addWorksheet("Action Plan");
    sheet.columns = [
      { header: "Action", width: 40 },
      { header: "Hazard", width: 30 },
      { header: "Owner", width: 18 },
      { header: "Due Date", width: 16 },
      { header: "Status", width: 12 }
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE5E7EB" }
    };

    raCase.actions.forEach((action) => {
      const hazard = action.hazardId ? raCase.hazards.find((h) => h.id === action.hazardId) : null;
      sheet.addRow([
        action.description,
        hazard?.label ?? "Unassigned",
        action.owner ?? "",
        action.dueDate ? new Date(action.dueDate).toLocaleDateString() : "",
        action.status
      ]);
    });

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      row.alignment = { vertical: "middle", wrapText: true };
    });
  }

  private getRiskColor(severity?: string | null, likelihood?: string | null): string {
    if (!severity || !likelihood) {
      return "FFCbd5f5";
    }
    const severityIdx = SEVERITY_LEVELS.indexOf(severity);
    const likelihoodIdx = LIKELIHOOD_LEVELS.indexOf(likelihood);
    if (severityIdx === -1 || likelihoodIdx === -1) {
      return "FFCbd5f5";
    }

    const rows = 5;
    const cols = 5;
    const normalizedRow = likelihoodIdx / (LIKELIHOOD_LEVELS.length - 1);
    const normalizedCol = severityIdx / (SEVERITY_LEVELS.length - 1);
    const row = Math.min(rows - 1, Math.max(0, Math.round(normalizedRow * (rows - 1))));
    const col = Math.min(cols - 1, Math.max(0, Math.round(normalizedCol * (cols - 1))));
    const normalized = (row / (rows - 1) + col / (cols - 1)) / 2;
    const bucketIndex = Math.min(RISK_BUCKETS.length - 1, Math.max(0, Math.round(normalized * (RISK_BUCKETS.length - 1))));
    const color = RISK_BUCKETS[bucketIndex]?.color ?? "cbd5f5";
    return color.startsWith("FF") ? color : `FF${color}`;
  }

  private renderCover(doc: PDFKit.PDFDocument, raCase: RiskAssessmentCaseDto) {
    doc.addPage();
    doc.fontSize(20).text("Risk Assessment Summary", { align: "center" });
    doc.moveDown();
    doc.fontSize(12);
    doc.text(`Activity: ${raCase.activityName}`);
    doc.text(`Location: ${raCase.location ?? "—"}`);
    doc.text(`Team: ${raCase.team ?? "—"}`);
    doc.text(`Phase: ${raCase.phase}`);
    const createdAt = raCase.createdAt instanceof Date ? raCase.createdAt : new Date(raCase.createdAt);
    doc.text(`Created: ${createdAt.toISOString()}`);
  }

  private renderSteps(doc: PDFKit.PDFDocument, raCase: RiskAssessmentCaseDto) {
    doc.addPage();
    doc.fontSize(16).text("Process Steps", { underline: true });
    doc.moveDown(0.5);
    raCase.steps.forEach((step, index) => {
      doc.fontSize(12).text(`${index + 1}. ${step.activity}`);
      // Show equipment and substances if present
      if (step.equipment && step.equipment.length > 0) {
        doc.fontSize(10).text(`Equipment: ${step.equipment.join(", ")}`, { indent: 20 });
      }
      if (step.substances && step.substances.length > 0) {
        doc.fontSize(10).text(`Substances: ${step.substances.join(", ")}`, { indent: 20 });
      }
      if (step.description) {
        doc.fontSize(10).text(step.description, { indent: 20 });
      }
      doc.moveDown(0.5);
    });
  }

  private renderHazardTable(doc: PDFKit.PDFDocument, raCase: RiskAssessmentCaseDto) {
    const actionsByHazard = raCase.actions.reduce<Record<string, string[]>>((acc, action) => {
      if (action.hazardId) {
        acc[action.hazardId] = acc[action.hazardId] ?? [];
        const owner = action.owner ? ` (${action.owner})` : "";
        const due = action.dueDate ? ` due ${new Date(action.dueDate).toLocaleDateString()}` : "";
        acc[action.hazardId]!.push(`${action.description}${owner}${due}`);
      }
      return acc;
    }, {});

    doc.addPage();
    doc.fontSize(16).text("Step-by-Step Hazard Table", { underline: true });
    doc.moveDown(0.5);

    raCase.steps.forEach((step, index) => {
      const stepHazards = raCase.hazards.filter((hazard) => hazard.stepIds.includes(step.id));
      doc.fontSize(13).text(`${index + 1}. ${step.activity}`, { underline: true });
      doc.moveDown(0.2);
      if (!stepHazards.length) {
        doc.fontSize(10).text("No hazards recorded for this step.", { indent: 10 });
        doc.moveDown(0.4);
        return;
      }

      stepHazards.forEach((hazard, hazardIndex) => {
        doc.fontSize(12).text(`${index + 1}.${hazardIndex + 1} ${hazard.label}`, { indent: 10 });
        if (hazard.description) {
          doc.fontSize(10).text(hazard.description, { indent: 16 });
        }

        doc
          .fontSize(10)
          .text(
            `Risk (baseline): ${this.formatRisk(hazard.baselineAssessment?.severity, hazard.baselineAssessment?.likelihood)}`,
            { indent: 16 }
          );
        // Existing controls are now stored directly on hazard as string array
        doc.text(
          `Existing controls: ${
            hazard.existingControls && hazard.existingControls.length > 0
              ? hazard.existingControls.join("; ")
              : "—"
          }`,
          { indent: 16 }
        );
        // Proposed controls from control discussion phase
        if (hazard.proposedControls && hazard.proposedControls.length > 0) {
          doc.text(
            `Proposed controls: ${hazard.proposedControls.map((c) => c.description).join("; ")}`,
            { indent: 16 }
          );
        }
        doc.text(
          `Risk (residual): ${this.formatRisk(
            hazard.residualAssessment?.severity,
            hazard.residualAssessment?.likelihood
          )}`,
          { indent: 16 }
        );

        const hazardActions = actionsByHazard[hazard.id];
        if (hazardActions && hazardActions.length) {
          doc.text("Actions:", { indent: 16 });
          hazardActions.forEach((action) => doc.text(`• ${action}`, { indent: 24 }));
        }

        doc.moveDown(0.4);
      });
      doc.moveDown(0.4);
    });
  }

  private renderActionPlan(doc: PDFKit.PDFDocument, raCase: RiskAssessmentCaseDto) {
    doc.addPage();
    doc.fontSize(16).text("Action Plan", { underline: true });
    doc.moveDown(0.5);

    if (!raCase.actions.length) {
      doc.fontSize(12).text("No actions recorded.");
      return;
    }

    raCase.actions.forEach((action, index) => {
      const hazard = action.hazardId
        ? raCase.hazards.find((item) => item.id === action.hazardId)
        : undefined;
      doc.fontSize(12).text(`${index + 1}. ${action.description}`);
      doc.fontSize(10).text(
        `Hazard: ${hazard ? hazard.label : "Unassigned"} | Owner: ${action.owner ?? "—"} | Due: ${
          action.dueDate ? new Date(action.dueDate).toLocaleDateString() : "—"
        } | Status: ${action.status}`
      );
      doc.moveDown(0.5);
    });
  }

  private renderRiskMatrix(doc: PDFKit.PDFDocument, raCase: RiskAssessmentCaseDto) {
    const matrix: Record<string, Record<string, number>> = {};
    SEVERITY_LEVELS.forEach((severity) => {
      const row: Record<string, number> = {};
      LIKELIHOOD_LEVELS.forEach((likelihood) => {
        row[likelihood] = 0;
      });
      matrix[severity] = row;
    });

    raCase.hazards.forEach((hazard) => {
      const severity = hazard.baselineAssessment?.severity;
      const likelihood = hazard.baselineAssessment?.likelihood;
      if (severity && likelihood) {
        const severityRow = matrix[severity];
        if (!severityRow) {
          return;
        }
        severityRow[likelihood] = (severityRow[likelihood] ?? 0) + 1;
      }
    });

    doc.addPage();
    doc.fontSize(16).text("Risk Matrix (current)", { underline: true });
    doc.moveDown(0.5);

    const cellWidth = 80;
    const cellHeight = 30;
    const originX = doc.x;
    let y = doc.y + cellHeight;

    // Draw headers
    doc.fontSize(10);
    LIKELIHOOD_LEVELS.forEach((likelihood, index) => {
      doc.text(likelihood, originX + cellWidth * (index + 1), doc.y, { width: cellWidth, align: "center" });
    });
    doc.moveDown(0.5);

    SEVERITY_LEVELS.forEach((severity) => {
      doc.text(severity, originX, y, { width: cellWidth, align: "center" });
      LIKELIHOOD_LEVELS.forEach((likelihood, index) => {
        const count = matrix[severity]?.[likelihood] ?? 0;
        doc.text(
          count ? String(count) : "-",
          originX + cellWidth * (index + 1),
          y,
          { width: cellWidth, align: "center" }
        );
      });
      y += cellHeight;
    });

    doc.moveDown(1);
    doc.fontSize(9).text("Numbers show hazard counts per severity/likelihood combination.");
  }

  private formatRisk(severity?: string | null, likelihood?: string | null) {
    if (!severity || !likelihood) {
      return "n/a";
    }
    return `${severity} x ${likelihood}`;
  }
}

export type ReportServiceType = ReportService;
