import PDFDocument from "pdfkit";
import path from "node:path";
import { env } from "../config/env";
import { AttachmentDto, RiskAssessmentCaseDto } from "./raService";
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
  async generatePdfForCase(
    raCase: RiskAssessmentCaseDto,
    opts?: { attachments?: AttachmentDto[] }
  ): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ autoFirstPage: false, margin: 50 });
      const chunks: Buffer[] = [];
      const attachments = opts?.attachments ?? [];

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (error: Error) => reject(error));

      this.renderCover(doc, raCase);
      this.renderSteps(doc, raCase);
      this.renderHazardTable(doc, raCase);
      this.renderActionPlan(doc, raCase);
      this.renderRiskMatrix(doc, raCase);
      if (attachments.length) {
        void this.renderPhotos(doc, raCase, attachments);
      }

      doc.end();
    });
  }

  async generateXlsxForCase(
    raCase: RiskAssessmentCaseDto,
    opts?: { attachments?: AttachmentDto[] }
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "SafetySecretary";
    workbook.created = new Date();
    const attachments = opts?.attachments ?? [];

    this.buildRiskAssessmentSheet(workbook, raCase);
    this.buildMatrixSheet(workbook, raCase);
    this.buildActionsSheet(workbook, raCase);
    if (attachments.length) {
      this.buildPhotosSheet(workbook, raCase, attachments);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private buildRiskAssessmentSheet(workbook: ExcelJS.Workbook, raCase: RiskAssessmentCaseDto) {
    const sheet = workbook.addWorksheet("Risk Assessment");
    const headers = [
      "N°",
      "Description of activity (incl. equipment/tools/materials/substances)",
      "Code",
      "Type of hazard",
      "Description of the hazard",
      "Description of the potential consequences",
      "Person at risk",
      "Health & Safety Requirements (mandatory)",
      "Other recommended preventive and control measures",
      "Effectiveness / contributing factors",
      "Likelihood (baseline)",
      "Severity (baseline)",
      "Level of risk (baseline)",
      "Recommendations of actions to mitigate (headlines)",
      "Likelihood (residual)",
      "Severity (residual)",
      "Level of risk (residual)",
      "Measures to monitor/review residual risk",
      "Responsibility to monitor/review"
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
      const activityDescription = [
        step.activity,
        (step.equipment ?? []).length ? `Equipment: ${(step.equipment ?? []).join(", ")}` : "",
        (step.substances ?? []).length ? `Substances: ${(step.substances ?? []).join(", ")}` : "",
        step.description ?? ""
      ]
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n");

      const hazardsForStep = raCase.hazards.filter((hazard) => hazard.stepIds.includes(step.id));
      if (!hazardsForStep.length) {
        sheet.addRow([
          stepIndex + 1,
          activityDescription,
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
          "",
          "",
          "",
          ""
        ]);
        return;
      }

      hazardsForStep.forEach((hazard, hazardIndex) => {
        const baseline = hazard.baseline;
        const residual = hazard.residual;
        const proposedControls =
          hazard.proposedControls?.map((c) => (c.hierarchy ? `${c.description} (${c.hierarchy})` : c.description)) ??
          [];
        const hazardActions = actionsByHazard[hazard.id] ?? [];
        const actionHeadlines = hazardActions.map((action) => action.description).filter(Boolean).join("\n");
        const actionOwner = hazardActions.map((action) => action.owner).find((owner) => owner) ?? "";
        sheet.addRow([
          stepIndex + 1,
          hazardIndex === 0 ? activityDescription : "",
          hazard.categoryCode ?? "",
          hazard.categoryCode ?? "",
          hazard.label,
          hazard.description ?? "",
          "",
          (hazard.existingControls ?? []).join("\n"),
          proposedControls.join("\n"),
          "",
          baseline?.likelihood ?? "",
          baseline?.severity ?? "",
          baseline?.riskRating ?? (baseline ? `${baseline.severity} x ${baseline.likelihood}` : ""),
          actionHeadlines,
          residual?.likelihood ?? "",
          residual?.severity ?? "",
          residual?.riskRating ?? (residual ? `${residual.severity} x ${residual.likelihood}` : ""),
          "",
          actionOwner
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
    const sheet = workbook.addWorksheet("Risk Profiles");

    const renderMatrix = (opts: {
      title: string;
      offsetRow: number;
      offsetCol: number;
      read: (hazard: RiskAssessmentCaseDto["hazards"][number]) => { severity?: string | null; likelihood?: string | null };
    }) => {
      sheet.getCell(opts.offsetRow, opts.offsetCol).value = opts.title;
      sheet.getCell(opts.offsetRow, opts.offsetCol).font = { bold: true, size: 14 };

      const headerRow = opts.offsetRow + 2;
      const headerCol = opts.offsetCol + 1;

      LIKELIHOOD_LEVELS.forEach((likelihood, idx) => {
        const cell = sheet.getCell(headerRow, headerCol + idx);
        cell.value = likelihood;
        cell.font = { bold: true };
        cell.alignment = { horizontal: "center" };
      });
      SEVERITY_LEVELS.forEach((severity, idx) => {
        const cell = sheet.getCell(headerRow + idx + 1, opts.offsetCol);
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
        const { severity, likelihood } = opts.read(hazard);
        if (severity && likelihood && counts[severity]) {
          counts[severity]![likelihood] = (counts[severity]![likelihood] ?? 0) + 1;
        }
      });

      LIKELIHOOD_LEVELS.forEach((likelihood, colIdx) => {
        SEVERITY_LEVELS.forEach((severity, rowIdx) => {
          const cell = sheet.getCell(headerRow + rowIdx + 1, headerCol + colIdx);
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
    };

    renderMatrix({
      title: "Current Matrix (baseline)",
      offsetRow: 1,
      offsetCol: 1,
      read: (hazard) => ({ severity: hazard.baseline?.severity, likelihood: hazard.baseline?.likelihood })
    });

    renderMatrix({
      title: "Target Matrix (residual)",
      offsetRow: 12,
      offsetCol: 1,
      read: (hazard) => ({ severity: hazard.residual?.severity, likelihood: hazard.residual?.likelihood })
    });

    sheet.columns.forEach((col) => {
      col.width = Math.max(col.width ?? 0, 16);
    });
  }

  private buildActionsSheet(workbook: ExcelJS.Workbook, raCase: RiskAssessmentCaseDto) {
    const sheet = workbook.addWorksheet("Action Plan & Mgt Validation");
    sheet.columns = [
      { header: "Nr.", width: 6 },
      { header: "CURRENT level of risk", width: 18 },
      { header: "RECOMMENDATIONS (mitigations / control measures)", width: 45 },
      { header: "TARGET level of risk", width: 18 },
      { header: "RESOURCES NEEDED", width: 22 },
      { header: "MANAGEMENT DECISION", width: 20 },
      { header: "EXPLANATION / OTHER COMMENTS", width: 26 },
      { header: "First name / Surname", width: 20 },
      { header: "Date", width: 14 },
      { header: "Signature", width: 16 },
      { header: "DEADLINE", width: 14 },
      { header: "RESPONSIBLE", width: 20 },
      { header: "STATUS", width: 12 }
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE5E7EB" }
    };

    raCase.actions.forEach((action, index) => {
      const hazard = action.hazardId ? raCase.hazards.find((h) => h.id === action.hazardId) : null;
      const currentRisk = hazard?.baseline?.riskRating ?? "";
      const targetRisk = hazard?.residual?.riskRating ?? "";
      sheet.addRow([
        index + 1,
        currentRisk,
        action.description,
        targetRisk,
        "",
        "",
        "",
        action.owner ?? "",
        "",
        "",
        action.dueDate ? new Date(action.dueDate).toLocaleDateString() : "",
        action.owner ?? "",
        action.status
      ]);
    });

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      row.alignment = { vertical: "middle", wrapText: true };
    });
  }

  private buildPhotosSheet(workbook: ExcelJS.Workbook, raCase: RiskAssessmentCaseDto, attachments: AttachmentDto[]) {
    const sheet = workbook.addWorksheet("Photos");
    sheet.columns = [
      { header: "#", width: 6 },
      { header: "Context", width: 36 },
      { header: "Filename", width: 40 },
      { header: "Preview", width: 55 }
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE5E7EB" }
    };

    const resolveContext = (attachment: AttachmentDto) => {
      if (attachment.stepId) {
        const stepIndex = raCase.steps.findIndex((step) => step.id === attachment.stepId);
        const step = raCase.steps[stepIndex];
        if (step) {
          return `Step ${stepIndex + 1}: ${step.activity}`;
        }
      }
      if (attachment.hazardId) {
        const hazard = raCase.hazards.find((item) => item.id === attachment.hazardId);
        if (hazard) {
          return `Hazard: ${hazard.label}`;
        }
      }
      return "Unassigned";
    };

    const isImage = (mimeType: string) => mimeType.startsWith("image/");
    const imageExtension = (mimeType: string): "png" | "jpeg" | null => {
      if (mimeType === "image/png") return "png";
      if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpeg";
      return null;
    };

    const resolveStoragePath = (storageKey: string) => {
      const root = path.resolve(env.attachmentsDir);
      const filePath = path.resolve(root, storageKey);
      if (!filePath.startsWith(root + path.sep)) {
        throw new Error("Invalid storageKey");
      }
      return filePath;
    };

    attachments.forEach((attachment, index) => {
      const rowNumber = index + 2;
      sheet.addRow([index + 1, resolveContext(attachment), attachment.originalName, ""]);

      if (!isImage(attachment.mimeType)) {
        return;
      }
      const ext = imageExtension(attachment.mimeType);
      if (!ext) {
        return;
      }

      try {
        const filePath = resolveStoragePath(attachment.storageKey);
        const imageId = workbook.addImage({ filename: filePath, extension: ext });
        sheet.getRow(rowNumber).height = 120;
        sheet.addImage(imageId, {
          tl: { col: 3, row: rowNumber - 1 },
          ext: { width: 360, height: 160 }
        });
      } catch {
        // Ignore missing/unsupported image files in export.
      }
    });

    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.alignment = { vertical: "top", wrapText: true };
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
            `Risk (baseline): ${this.formatRisk(hazard.baseline?.severity, hazard.baseline?.likelihood)}`,
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
            hazard.residual?.severity,
            hazard.residual?.likelihood
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
      const severity = hazard.baseline?.severity;
      const likelihood = hazard.baseline?.likelihood;
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

  private renderPhotos(doc: PDFKit.PDFDocument, raCase: RiskAssessmentCaseDto, attachments: AttachmentDto[]) {
    const resolveContext = (attachment: AttachmentDto) => {
      if (attachment.stepId) {
        const stepIndex = raCase.steps.findIndex((step) => step.id === attachment.stepId);
        const step = raCase.steps[stepIndex];
        if (step) {
          return `Step ${stepIndex + 1}: ${step.activity}`;
        }
      }
      if (attachment.hazardId) {
        const hazard = raCase.hazards.find((item) => item.id === attachment.hazardId);
        if (hazard) {
          return `Hazard: ${hazard.label}`;
        }
      }
      return "Unassigned";
    };

    const resolveStoragePath = (storageKey: string) => {
      const root = path.resolve(env.attachmentsDir);
      const filePath = path.resolve(root, storageKey);
      if (!filePath.startsWith(root + path.sep)) {
        throw new Error("Invalid storageKey");
      }
      return filePath;
    };

    const photos = attachments.filter((attachment) => attachment.mimeType.startsWith("image/"));
    if (!photos.length) {
      return;
    }

    doc.addPage();
    doc.fontSize(16).text("Photos", { underline: true });
    doc.moveDown(0.5);

    photos.forEach((attachment) => {
      doc.fontSize(11).text(resolveContext(attachment));
      doc.fontSize(9).text(attachment.originalName);
      const filePath = resolveStoragePath(attachment.storageKey);
      try {
        doc.image(filePath, { fit: [450, 300], align: "center" });
      } catch {
        doc.fontSize(9).text("(Unable to embed image)", { oblique: true });
      }
      doc.moveDown(0.8);
    });
  }

  private formatRisk(severity?: string | null, likelihood?: string | null) {
    if (!severity || !likelihood) {
      return "n/a";
    }
    return `${severity} x ${likelihood}`;
  }
}

export type ReportServiceType = ReportService;
