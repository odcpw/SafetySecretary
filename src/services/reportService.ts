import PDFDocument from "pdfkit";
import path from "node:path";
import fs from "node:fs/promises";
import { env } from "../config/env";
import { AttachmentDto, RiskAssessmentCaseDto } from "./raService";
import { IncidentCaseDto } from "./incidentService";
import { JhaCaseDto } from "./jhaService";
import ExcelJS from "exceljs";
import { getTemplateRiskBand, type TemplateRiskBand } from "./templateRiskMatrix";
import { decryptAttachment } from "./attachmentCrypto";
import { createReportTranslator, type ReportTranslator } from "./reportTranslations";

const SEVERITY_LEVELS = ["E", "D", "C", "B", "A"] as const;
const LIKELIHOOD_LEVELS = ["1", "2", "3", "4", "5"] as const;
const RISK_BAND_COLORS: Record<TemplateRiskBand, string> = {
  NEGLIGIBLE: "0f9d58",
  MINOR: "8bc34a",
  MODERATE: "f4c20d",
  HIGH: "f57c00",
  EXTREME: "d93025"
};

export class ReportService {
  async generatePdfForCase(
    raCase: RiskAssessmentCaseDto,
    opts?: { attachments?: AttachmentDto[]; storageRoot?: string; encryptionKey?: Buffer | null; locale?: string }
  ): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ autoFirstPage: false, margin: 50 });
      const chunks: Buffer[] = [];
      const attachments = opts?.attachments ?? [];
      const storageRoot = opts?.storageRoot ?? env.attachmentsDir;
      const encryptionKey = opts?.encryptionKey ?? null;
      const i18n = createReportTranslator(opts?.locale);

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (error: Error) => reject(error));

      const render = async () => {
        this.renderCover(doc, raCase, i18n);
        this.renderSteps(doc, raCase, i18n);
        this.renderHazardTable(doc, raCase, i18n);
        this.renderActionPlan(doc, raCase, i18n);
        this.renderRiskMatrix(doc, raCase, i18n);
        if (attachments.length) {
          await this.renderPhotos(doc, raCase, attachments, storageRoot, encryptionKey, i18n);
        }
        doc.end();
      };
      void render();
    });
  }

  async generateXlsxForCase(
    raCase: RiskAssessmentCaseDto,
    opts?: { attachments?: AttachmentDto[]; storageRoot?: string; encryptionKey?: Buffer | null; locale?: string }
  ): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "SafetySecretary";
    workbook.created = new Date();
    const attachments = opts?.attachments ?? [];
    const storageRoot = opts?.storageRoot ?? env.attachmentsDir;
    const encryptionKey = opts?.encryptionKey ?? null;
    const i18n = createReportTranslator(opts?.locale);

    this.buildRiskAssessmentSheet(workbook, raCase, i18n);
    this.buildMatrixSheet(workbook, raCase, i18n);
    this.buildRiskGuidanceSheet(workbook, i18n);
    this.buildActionsSheet(workbook, raCase, i18n);
    if (attachments.length) {
      await this.buildPhotosSheet(workbook, raCase, attachments, storageRoot, encryptionKey, i18n);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  async generateIncidentPdf(incidentCase: IncidentCaseDto, opts?: { locale?: string }): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      const i18n = createReportTranslator(opts?.locale);

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (error: Error) => reject(error));

      const placeholder = i18n.t("common.placeholder");
      const safeText = (value: string | null | undefined) => (value ? value : placeholder);
      const truncate = (value: string, max = 120) => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

      doc.fontSize(18).text(i18n.t("incident.title"), { align: "left" });
      doc.moveDown(0.6);
      doc.fontSize(11);

      const incidentTypeLabel = i18n.t(`domain.incidentTypes.${incidentCase.incidentType}`, {
        fallback: incidentCase.incidentType
      });
      const incidentDate = incidentCase.incidentAt
        ? i18n.formatDateTime(incidentCase.incidentAt)
        : safeText(incidentCase.incidentTimeNote);
      const metaLines = [
        `${i18n.t("incident.meta.title")}: ${safeText(incidentCase.title)}`,
        `${i18n.t("incident.meta.type")}: ${incidentTypeLabel}`,
        `${i18n.t("incident.meta.dateTime")}: ${incidentDate}`,
        `${i18n.t("incident.meta.location")}: ${safeText(incidentCase.location)}`,
        `${i18n.t("incident.meta.coordinator")}: ${incidentCase.coordinatorRole}${
          incidentCase.coordinatorName ? ` (${incidentCase.coordinatorName})` : ""
        }`
      ];
      metaLines.forEach((line) => doc.text(line));

      doc.moveDown(0.8);
      doc.fontSize(13).text(i18n.t("incident.mergedTimeline"), { underline: true });
      doc.moveDown(0.3);

      const maxTimeline = 10;
      const timelineRows = incidentCase.timelineEvents.slice(0, maxTimeline);
      timelineRows.forEach((event, index) => {
        const timeLabel = event.timeLabel ? truncate(event.timeLabel, 24) : `#${index + 1}`;
        const confidence = event.confidence
          ? i18n.t(`domain.incidentConfidence.${event.confidence}`, { fallback: event.confidence })
          : placeholder;
        const line = `${timeLabel} | ${truncate(event.text, 110)} | ${confidence}`;
        doc.fontSize(10).text(line);
      });
      if (incidentCase.timelineEvents.length > maxTimeline) {
        doc.fontSize(9).fillColor("#666").text(i18n.t("incident.timelineTruncated"));
        doc.fillColor("#000");
      }

      doc.moveDown(0.8);
      doc.fontSize(13).text(i18n.t("incident.deviationsTitle"), { underline: true });
      doc.moveDown(0.3);

      const maxDeviations = 6;
      const deviations = incidentCase.deviations.slice(0, maxDeviations);
      if (!deviations.length) {
        doc.fontSize(10).text(i18n.t("incident.noDeviations"));
      } else {
        deviations.forEach((deviation, index) => {
          doc.fontSize(10).text(
            `${index + 1}. ${i18n.t("incident.changeLabel")}: ${truncate(
              deviation.changeObserved ?? deviation.actual ?? i18n.t("incident.unspecified"),
              120
            )}`
          );
          const causes = deviation.causes ?? [];
          causes.slice(0, 2).forEach((cause) => {
            doc
              .fontSize(9)
              .fillColor("#333")
              .text(`   • ${i18n.t("incident.causeLabel")}: ${truncate(cause.statement, 120)}`);
          });
          doc.fillColor("#000");
        });
      }
      if (incidentCase.deviations.length > maxDeviations) {
        doc.fontSize(9).fillColor("#666").text(i18n.t("incident.deviationsTruncated"));
        doc.fillColor("#000");
      }

      doc.moveDown(0.8);
      doc.fontSize(13).text(i18n.t("incident.actionsTitle"), { underline: true });
      doc.moveDown(0.3);

      const actions: Array<{
        description: string;
        ownerRole?: string | null;
        dueDate?: Date | null;
        actionType?: string | null;
      }> = [];
      incidentCase.deviations.forEach((deviation) => {
        deviation.causes.forEach((cause) => {
          cause.actions.forEach((action) => actions.push(action));
        });
      });

      const maxActions = 8;
      const actionRows = actions.slice(0, maxActions);
      if (!actionRows.length) {
        doc.fontSize(10).text(i18n.t("incident.noActions"));
      } else {
        actionRows.forEach((action, index) => {
          const owner = action.ownerRole ? ` (${action.ownerRole})` : "";
          const due = action.dueDate
            ? ` ${i18n.t("common.dueInline", { values: { date: i18n.formatDate(action.dueDate) } })}`
            : "";
          const typeLabel = action.actionType
            ? i18n.t(`domain.incidentActionTypes.${action.actionType}`, { fallback: action.actionType })
            : "";
          const type = typeLabel ? ` [${typeLabel}]` : "";
          doc.fontSize(10).text(`${index + 1}. ${truncate(action.description, 120)}${type}${owner}${due}`);
        });
      }
      if (actions.length > maxActions) {
        doc.fontSize(9).fillColor("#666").text(i18n.t("incident.actionsTruncated"));
        doc.fillColor("#000");
      }

      doc.end();
    });
  }

  private buildRiskAssessmentSheet(
    workbook: ExcelJS.Workbook,
    raCase: RiskAssessmentCaseDto,
    i18n: ReportTranslator
  ) {
    const sheet = workbook.addWorksheet(i18n.t("worksheets.riskAssessment"));
    const headers =
      i18n.get<string[]>("xlsx.riskAssessmentHeaders") ??
      [
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

    const equipmentLabel = i18n.t("ra.equipmentLabel");
    const substancesLabel = i18n.t("ra.substancesLabel");
    const resolveRiskLabel = (severity?: string | null, likelihood?: string | null) => {
      if (!severity || !likelihood) return "";
      const band = getTemplateRiskBand(severity as any, likelihood as any);
      return i18n.t(`domain.riskBands.${band}`, { fallback: "" });
    };

    raCase.steps.forEach((step, stepIndex) => {
      const activityDescription = [
        step.activity,
        (step.equipment ?? []).length ? `${equipmentLabel}: ${(step.equipment ?? []).join(", ")}` : "",
        (step.substances ?? []).length ? `${substancesLabel}: ${(step.substances ?? []).join(", ")}` : "",
        step.description ?? ""
      ]
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n");

      const hazardsForStep = raCase.hazards.filter((hazard) => hazard.stepId === step.id);
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
          hazard.proposedControls?.map((c) => {
            if (!c.hierarchy) return c.description;
            const hierarchyLabel = i18n.t(`domain.controlHierarchy.${c.hierarchy}`, { fallback: c.hierarchy });
            return `${c.description} (${hierarchyLabel})`;
          }) ??
          [];
        const hazardActions = actionsByHazard[hazard.id] ?? [];
        const actionHeadlines = hazardActions.map((action) => action.description).filter(Boolean).join("\n");
        const actionOwner = hazardActions.map((action) => action.owner).find((owner) => owner) ?? "";
        const hazardType = hazard.categoryCode
          ? i18n.t(`domain.hazardCategories.${hazard.categoryCode}`, { fallback: hazard.categoryCode })
          : "";
        sheet.addRow([
          stepIndex + 1,
          hazardIndex === 0 ? activityDescription : "",
          hazard.categoryCode ?? "",
          hazardType,
          hazard.label,
          hazard.description ?? "",
          "",
          (hazard.existingControls ?? []).join("\n"),
          proposedControls.join("\n"),
          "",
          baseline?.likelihood ?? "",
          baseline?.severity ?? "",
          resolveRiskLabel(baseline?.severity, baseline?.likelihood) || baseline?.riskRating || "",
          actionHeadlines,
          residual?.likelihood ?? "",
          residual?.severity ?? "",
          resolveRiskLabel(residual?.severity, residual?.likelihood) || residual?.riskRating || "",
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

  private buildMatrixSheet(workbook: ExcelJS.Workbook, raCase: RiskAssessmentCaseDto, i18n: ReportTranslator) {
    const sheet = workbook.addWorksheet(i18n.t("worksheets.riskProfiles"));
    const matrixTitles = i18n.get<{ baseline: string; residual: string }>("xlsx.matrixTitles");

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

      // Template orientation: Severity across columns (E..A), Likelihood down rows (1..5).
      SEVERITY_LEVELS.forEach((severity, idx) => {
        const cell = sheet.getCell(headerRow, headerCol + idx);
        cell.value = severity;
        cell.font = { bold: true };
        cell.alignment = { horizontal: "center" };
      });
      LIKELIHOOD_LEVELS.forEach((likelihood, idx) => {
        const cell = sheet.getCell(headerRow + idx + 1, opts.offsetCol);
        cell.value = likelihood;
        cell.font = { bold: true };
        cell.alignment = { horizontal: "center" };
      });

      const counts: Record<string, Record<string, number>> = {};
      LIKELIHOOD_LEVELS.forEach((lik) => {
        counts[lik] = {};
        SEVERITY_LEVELS.forEach((sev) => {
          counts[lik]![sev] = 0;
        });
      });

      raCase.hazards.forEach((hazard) => {
        const { severity, likelihood } = opts.read(hazard);
        if (severity && likelihood && counts[likelihood]) {
          counts[likelihood]![severity] = (counts[likelihood]![severity] ?? 0) + 1;
        }
      });

      SEVERITY_LEVELS.forEach((severity, colIdx) => {
        LIKELIHOOD_LEVELS.forEach((likelihood, rowIdx) => {
          const cell = sheet.getCell(headerRow + rowIdx + 1, headerCol + colIdx);
          const count = counts[likelihood]?.[severity] ?? 0;
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
      title: matrixTitles?.baseline ?? "Current Matrix (baseline)",
      offsetRow: 1,
      offsetCol: 1,
      read: (hazard) => ({
        severity: hazard.baseline?.severity ?? null,
        likelihood: hazard.baseline?.likelihood ?? null
      })
    });

    renderMatrix({
      title: matrixTitles?.residual ?? "Target Matrix (residual)",
      offsetRow: 12,
      offsetCol: 1,
      read: (hazard) => ({
        severity: hazard.residual?.severity ?? null,
        likelihood: hazard.residual?.likelihood ?? null
      })
    });

    sheet.columns.forEach((col) => {
      col.width = Math.max(col.width ?? 0, 16);
    });
  }

  private buildRiskGuidanceSheet(workbook: ExcelJS.Workbook, i18n: ReportTranslator) {
    const sheet = workbook.addWorksheet(i18n.t("worksheets.riskBands"));
    const headers =
      i18n.get<string[]>("xlsx.riskGuidanceHeaders") ?? ["Risk band", "Decision", "Approver", "Timescale"];
    sheet.columns = headers.map((header) => ({ header, width: 22 }));

    const bands: TemplateRiskBand[] = ["EXTREME", "HIGH", "MODERATE", "MINOR", "NEGLIGIBLE"];
    bands.forEach((band) => {
      const label = i18n.t(`domain.riskBands.${band}`, { fallback: band });
      const decision = i18n.t(`riskGuidance.${band}.decision`);
      const approver = i18n.t(`riskGuidance.${band}.approver`);
      const timescale = i18n.t(`riskGuidance.${band}.timescale`);
      sheet.addRow([label, decision, approver, timescale]);
    });

    sheet.getRow(1).font = { bold: true };
    sheet.eachRow({ includeEmpty: false }, (row, idx) => {
      row.alignment = { vertical: "top", wrapText: true };
      if (idx > 1) {
        row.height = 36;
      }
    });
  }

  private buildActionsSheet(workbook: ExcelJS.Workbook, raCase: RiskAssessmentCaseDto, i18n: ReportTranslator) {
    const sheet = workbook.addWorksheet(i18n.t("worksheets.actionPlan"));
    const headers =
      i18n.get<string[]>("xlsx.actionPlanHeaders") ??
      [
        "Nr.",
        "CURRENT level of risk",
        "RECOMMENDATIONS (mitigations / control measures)",
        "TARGET level of risk",
        "RESOURCES NEEDED",
        "MANAGEMENT DECISION",
        "EXPLANATION / OTHER COMMENTS",
        "First name / Surname",
        "Date",
        "Signature",
        "DEADLINE",
        "RESPONSIBLE",
        "STATUS"
      ];
    const widths = [6, 18, 45, 18, 22, 20, 26, 20, 14, 16, 14, 20, 12];
    sheet.columns = headers.map((header, index) => ({ header, width: widths[index] ?? 18 }));
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE5E7EB" }
    };

    const resolveRiskLabel = (severity?: string | null, likelihood?: string | null, fallback?: string | null) => {
      if (!severity || !likelihood) return fallback ?? "";
      const band = getTemplateRiskBand(severity as any, likelihood as any);
      return i18n.t(`domain.riskBands.${band}`, { fallback: band });
    };

    raCase.actions.forEach((action, index) => {
      const hazard = action.hazardId ? raCase.hazards.find((h) => h.id === action.hazardId) : null;
      const currentRisk = resolveRiskLabel(
        hazard?.baseline?.severity,
        hazard?.baseline?.likelihood,
        hazard?.baseline?.riskRating ?? ""
      );
      const targetRisk = resolveRiskLabel(
        hazard?.residual?.severity,
        hazard?.residual?.likelihood,
        hazard?.residual?.riskRating ?? ""
      );
      const statusLabel = action.status
        ? i18n.t(`domain.actionStatus.${action.status}`, { fallback: action.status })
        : "";
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
        action.dueDate ? i18n.formatDate(action.dueDate) : "",
        action.owner ?? "",
        statusLabel
      ]);
    });

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      row.alignment = { vertical: "middle", wrapText: true };
    });
  }

  private async buildPhotosSheet(
    workbook: ExcelJS.Workbook,
    raCase: RiskAssessmentCaseDto,
    attachments: AttachmentDto[],
    storageRoot: string,
    encryptionKey: Buffer | null,
    i18n: ReportTranslator
  ) {
    const sheet = workbook.addWorksheet(i18n.t("worksheets.photos"));
    const headers = i18n.get<string[]>("xlsx.photosHeaders") ?? ["#", "Context", "Filename", "Preview"];
    const widths = [6, 36, 40, 55];
    sheet.columns = headers.map((header, index) => ({ header, width: widths[index] ?? 18 }));
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
          return i18n.t("ra.photoContext.step", {
            values: { index: stepIndex + 1, activity: step.activity }
          });
        }
      }
      if (attachment.hazardId) {
        const hazard = raCase.hazards.find((item) => item.id === attachment.hazardId);
        if (hazard) {
          return i18n.t("ra.photoContext.hazard", { values: { label: hazard.label } });
        }
      }
      return i18n.t("ra.photoContext.unassigned");
    };

    const isImage = (mimeType: string) => mimeType.startsWith("image/");
    const imageExtension = (mimeType: string): "png" | "jpeg" | null => {
      if (mimeType === "image/png") return "png";
      if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpeg";
      return null;
    };

    const resolveStoragePath = (storageKey: string) => {
      const root = path.resolve(storageRoot);
      const filePath = path.resolve(root, storageKey);
      if (!filePath.startsWith(root + path.sep)) {
        throw new Error("Invalid storageKey");
      }
      return filePath;
    };

    for (let index = 0; index < attachments.length; index += 1) {
      const attachment = attachments[index]!;
      const rowNumber = index + 2;
      sheet.addRow([index + 1, resolveContext(attachment), attachment.originalName, ""]);

      if (!isImage(attachment.mimeType)) {
        continue;
      }
      const ext = imageExtension(attachment.mimeType);
      if (!ext) {
        continue;
      }

      try {
        const filePath = resolveStoragePath(attachment.storageKey);
        const raw = await fs.readFile(filePath);
        const buffer = encryptionKey ? decryptAttachment(raw, encryptionKey) : raw;
        const imageBuffer: Buffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
        const imageId = workbook.addImage({ buffer: imageBuffer as any, extension: ext });
        sheet.getRow(rowNumber).height = 120;
        sheet.addImage(imageId, {
          tl: { col: 3, row: rowNumber - 1 },
          ext: { width: 360, height: 160 }
        });
      } catch {
        // Ignore missing/unsupported image files in export.
      }
    }

    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.alignment = { vertical: "top", wrapText: true };
    });
  }

  private getRiskColor(severity?: string | null, likelihood?: string | null): string {
    if (!severity || !likelihood) {
      return "FFCbd5f5";
    }
    if (!SEVERITY_LEVELS.includes(severity as any) || !LIKELIHOOD_LEVELS.includes(likelihood as any)) {
      return "FFCbd5f5";
    }
    const band = getTemplateRiskBand(severity as any, likelihood as any);
    const color = RISK_BAND_COLORS[band] ?? "cbd5f5";
    return color.startsWith("FF") ? color : `FF${color}`;
  }

  private renderCover(doc: PDFKit.PDFDocument, raCase: RiskAssessmentCaseDto, i18n: ReportTranslator) {
    doc.addPage();
    doc.fontSize(20).text(i18n.t("ra.coverTitle"), { align: "center" });
    doc.moveDown();
    doc.fontSize(12);
    const placeholder = i18n.t("common.placeholder");
    const phaseLabel = i18n.t(`domain.phases.${raCase.phase}`, { fallback: raCase.phase });
    doc.text(`${i18n.t("ra.cover.activity")}: ${raCase.activityName}`);
    doc.text(`${i18n.t("ra.cover.location")}: ${raCase.location ?? placeholder}`);
    doc.text(`${i18n.t("ra.cover.team")}: ${raCase.team ?? placeholder}`);
    doc.text(`${i18n.t("ra.cover.phase")}: ${phaseLabel}`);
    const createdAt = raCase.createdAt instanceof Date ? raCase.createdAt : new Date(raCase.createdAt);
    doc.text(`${i18n.t("ra.cover.created")}: ${i18n.formatDateTime(createdAt)}`);
  }

  private renderSteps(doc: PDFKit.PDFDocument, raCase: RiskAssessmentCaseDto, i18n: ReportTranslator) {
    doc.addPage();
    doc.fontSize(16).text(i18n.t("ra.stepsTitle"), { underline: true });
    doc.moveDown(0.5);
    raCase.steps.forEach((step, index) => {
      doc.fontSize(12).text(`${index + 1}. ${step.activity}`);
      // Show equipment and substances if present
      if (step.equipment && step.equipment.length > 0) {
        doc.fontSize(10).text(`${i18n.t("ra.equipmentLabel")}: ${step.equipment.join(", ")}`, { indent: 20 });
      }
      if (step.substances && step.substances.length > 0) {
        doc.fontSize(10).text(`${i18n.t("ra.substancesLabel")}: ${step.substances.join(", ")}`, { indent: 20 });
      }
      if (step.description) {
        doc.fontSize(10).text(step.description, { indent: 20 });
      }
      doc.moveDown(0.5);
    });
  }

  private renderHazardTable(doc: PDFKit.PDFDocument, raCase: RiskAssessmentCaseDto, i18n: ReportTranslator) {
    const placeholder = i18n.t("common.placeholder");
    const actionsByHazard = raCase.actions.reduce<Record<string, string[]>>((acc, action) => {
      if (action.hazardId) {
        acc[action.hazardId] = acc[action.hazardId] ?? [];
        const owner = action.owner ? ` (${action.owner})` : "";
        const due = action.dueDate
          ? ` ${i18n.t("common.dueInline", { values: { date: i18n.formatDate(action.dueDate) } })}`
          : "";
        acc[action.hazardId]!.push(`${action.description}${owner}${due}`);
      }
      return acc;
    }, {});

    doc.addPage();
    doc.fontSize(16).text(i18n.t("ra.hazardTableTitle"), { underline: true });
    doc.moveDown(0.5);

    raCase.steps.forEach((step, index) => {
      const stepHazards = raCase.hazards.filter((hazard) => hazard.stepId === step.id);
      doc.fontSize(13).text(`${index + 1}. ${step.activity}`, { underline: true });
      doc.moveDown(0.2);
      if (!stepHazards.length) {
        doc.fontSize(10).text(i18n.t("ra.noHazardsForStep"), { indent: 10 });
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
            `${i18n.t("ra.riskBaselineLabel")}: ${this.formatRisk(
              hazard.baseline?.severity,
              hazard.baseline?.likelihood,
              i18n
            )}`,
            { indent: 16 }
          );
        // Existing controls are now stored directly on hazard as string array
        doc.text(
          `${i18n.t("ra.existingControlsLabel")}: ${
            hazard.existingControls && hazard.existingControls.length > 0
              ? hazard.existingControls.join("; ")
              : placeholder
          }`,
          { indent: 16 }
        );
        // Proposed controls from control discussion phase
        if (hazard.proposedControls && hazard.proposedControls.length > 0) {
          doc.text(
            `${i18n.t("ra.proposedControlsLabel")}: ${hazard.proposedControls
              .map((c) => c.description)
              .join("; ")}`,
            { indent: 16 }
          );
        }
        doc.text(
          `${i18n.t("ra.riskResidualLabel")}: ${this.formatRisk(
            hazard.residual?.severity,
            hazard.residual?.likelihood,
            i18n
          )}`,
          { indent: 16 }
        );

        const hazardActions = actionsByHazard[hazard.id];
        if (hazardActions && hazardActions.length) {
          doc.text(`${i18n.t("ra.actionsLabel")}:`, { indent: 16 });
          hazardActions.forEach((action) => doc.text(`• ${action}`, { indent: 24 }));
        }

        doc.moveDown(0.4);
      });
      doc.moveDown(0.4);
    });
  }

  private renderActionPlan(doc: PDFKit.PDFDocument, raCase: RiskAssessmentCaseDto, i18n: ReportTranslator) {
    doc.addPage();
    doc.fontSize(16).text(i18n.t("ra.actionPlanTitle"), { underline: true });
    doc.moveDown(0.5);

    if (!raCase.actions.length) {
      doc.fontSize(12).text(i18n.t("ra.noActions"));
      return;
    }

    raCase.actions.forEach((action, index) => {
      const hazard = action.hazardId
        ? raCase.hazards.find((item) => item.id === action.hazardId)
        : undefined;
      const placeholder = i18n.t("common.placeholder");
      const hazardLabel = hazard ? hazard.label : i18n.t("common.unassigned");
      const ownerLabel = action.owner ?? placeholder;
      const dueLabel = action.dueDate ? i18n.formatDate(action.dueDate) : placeholder;
      const statusLabel = action.status
        ? i18n.t(`domain.actionStatus.${action.status}`, { fallback: action.status })
        : placeholder;
      doc.fontSize(12).text(`${index + 1}. ${action.description}`);
      doc.fontSize(10).text(
        `${i18n.t("ra.hazardLabel")}: ${hazardLabel} | ${i18n.t("ra.ownerLabel")}: ${ownerLabel} | ${i18n.t(
          "ra.dueLabel"
        )}: ${dueLabel} | ${i18n.t("ra.statusLabel")}: ${statusLabel}`
      );
      doc.moveDown(0.5);
    });
  }

  private renderRiskMatrix(doc: PDFKit.PDFDocument, raCase: RiskAssessmentCaseDto, i18n: ReportTranslator) {
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
    doc.fontSize(16).text(i18n.t("ra.riskMatrixTitle"), { underline: true });
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
    doc.fontSize(9).text(i18n.t("ra.riskMatrixFooter"));
  }

  private async renderPhotos(
    doc: PDFKit.PDFDocument,
    raCase: RiskAssessmentCaseDto,
    attachments: AttachmentDto[],
    storageRoot: string,
    encryptionKey: Buffer | null,
    i18n: ReportTranslator
  ) {
    const resolveContext = (attachment: AttachmentDto) => {
      if (attachment.stepId) {
        const stepIndex = raCase.steps.findIndex((step) => step.id === attachment.stepId);
        const step = raCase.steps[stepIndex];
        if (step) {
          return i18n.t("ra.photoContext.step", {
            values: { index: stepIndex + 1, activity: step.activity }
          });
        }
      }
      if (attachment.hazardId) {
        const hazard = raCase.hazards.find((item) => item.id === attachment.hazardId);
        if (hazard) {
          return i18n.t("ra.photoContext.hazard", { values: { label: hazard.label } });
        }
      }
      return i18n.t("ra.photoContext.unassigned");
    };

    const resolveStoragePath = (storageKey: string) => {
      const root = path.resolve(storageRoot);
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
    doc.fontSize(16).text(i18n.t("ra.photosTitle"), { underline: true });
    doc.moveDown(0.5);

    for (const attachment of photos) {
      doc.fontSize(11).text(resolveContext(attachment));
      doc.fontSize(9).text(attachment.originalName);
      const filePath = resolveStoragePath(attachment.storageKey);
      try {
        const raw = await fs.readFile(filePath);
        const buffer = encryptionKey ? decryptAttachment(raw, encryptionKey) : raw;
        doc.image(buffer, { fit: [450, 300], align: "center" });
      } catch {
        doc.fontSize(9).text(i18n.t("ra.unableToEmbed"), { oblique: true });
      }
      doc.moveDown(0.8);
    }
  }

  private formatRisk(severity?: string | null, likelihood?: string | null, i18n?: ReportTranslator) {
    if (!severity || !likelihood) {
      return i18n?.t("common.notAvailable") ?? "n/a";
    }
    return `${severity} x ${likelihood}`;
  }

  // JHA PDF Export
  async generateJhaPdf(jhaCase: JhaCaseDto, opts?: { locale?: string }): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ autoFirstPage: false, margin: 50, bufferPages: true });
      const chunks: Buffer[] = [];
      const i18n = createReportTranslator(opts?.locale);

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", (error: Error) => reject(error));

      this.renderJhaDocument(doc, jhaCase, i18n);
      this.renderJhaPageNumbers(doc, i18n);

      doc.end();
    });
  }

  // JHA XLSX Export
  async generateJhaXlsx(jhaCase: JhaCaseDto, opts?: { locale?: string }): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "SafetySecretary";
    workbook.created = new Date();
    const i18n = createReportTranslator(opts?.locale);

    this.buildJhaSheet(workbook, jhaCase, i18n);

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  private renderJhaDocument(doc: PDFKit.PDFDocument, jhaCase: JhaCaseDto, i18n: ReportTranslator) {
    const placeholder = i18n.t("common.placeholder");
    const headers =
      i18n.get<string[]>("xlsx.jhaHeaders") ?? ["Step #", "Job Step", "Hazard", "Consequence", "Controls"];
    doc.addPage();
    const marginLeft = doc.page.margins.left;
    const marginRight = doc.page.margins.right;
    const pageWidth = doc.page.width - marginLeft - marginRight;
    const rowPadding = 4;

    const formatDateValue = (value: string | Date | null | undefined) => {
      if (!value) return placeholder;
      const parsed = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return placeholder;
      }
      const hasTime = parsed.getHours() !== 0 || parsed.getMinutes() !== 0;
      return hasTime ? i18n.formatDateTime(parsed) : i18n.formatDate(parsed);
    };

    const renderHeader = () => {
      const headerTop = doc.page.margins.top;
      const docDate = i18n.t("jha.pdf.documentDate");
      doc.fontSize(16).text(i18n.t("jha.title"), marginLeft, headerTop, { width: pageWidth });
      doc.fontSize(9).text(`${docDate}: ${i18n.formatDate(new Date())}`, marginLeft, headerTop, {
        width: pageWidth,
        align: "right"
      });
      doc.moveDown(0.4);
      doc.moveTo(marginLeft, doc.y).lineTo(marginLeft + pageWidth, doc.y).stroke();
      doc.moveDown(0.6);
    };

    const renderMetaBlock = () => {
      const leftRows: Array<[string, string]> = [
        [i18n.t("jha.jobTitle"), jhaCase.jobTitle],
        [i18n.t("jha.site"), jhaCase.site ?? placeholder],
        [i18n.t("jha.supervisor"), jhaCase.supervisor ?? placeholder],
        [i18n.t("jha.workersInvolved"), jhaCase.workersInvolved ?? placeholder],
        [i18n.t("jha.jobDate"), formatDateValue(jhaCase.jobDate ?? null)]
      ];
      const rightRows: Array<[string, string]> = [
        [i18n.t("jha.revision"), jhaCase.revision ?? placeholder],
        [i18n.t("jha.preparedBy"), jhaCase.preparedBy ?? placeholder],
        [i18n.t("jha.reviewedBy"), jhaCase.reviewedBy ?? placeholder],
        [i18n.t("jha.approvedBy"), jhaCase.approvedBy ?? placeholder],
        [i18n.t("jha.signoffDate"), formatDateValue(jhaCase.signoffDate ?? null)]
      ];
      const columnGap = 24;
      const columnWidth = (pageWidth - columnGap) / 2;
      const startY = doc.y;
      let leftY = startY;
      let rightY = startY;

      const renderRows = (rows: Array<[string, string]>, x: number, yStart: number) => {
        let cursor = yStart;
        rows.forEach(([label, value]) => {
          doc.fontSize(9).text(`${label}: ${value}`, x, cursor, { width: columnWidth });
          cursor = doc.y + 2;
        });
        return cursor;
      };

      leftY = renderRows(leftRows, marginLeft, startY);
      rightY = renderRows(rightRows, marginLeft + columnWidth + columnGap, startY);
      doc.y = Math.max(leftY, rightY) + 6;
    };

    const columnRatios = [0.08, 0.22, 0.22, 0.22, 0.26];
    const columnWidths = columnRatios.map((ratio) => Math.floor(pageWidth * ratio));
    columnWidths[columnWidths.length - 1] =
      pageWidth - columnWidths.slice(0, columnWidths.length - 1).reduce((sum, width) => sum + width, 0);

    const drawRow = (cells: string[], isHeader = false) => {
      doc.fontSize(9).font(isHeader ? "Helvetica-Bold" : "Helvetica");
      const availableWidth = columnWidths.map((width) => width - rowPadding * 2);
      const heights = cells.map((text, index) => doc.heightOfString(text, { width: availableWidth[index] }));
      const rowHeight = Math.max(18, ...heights) + rowPadding * 2;
      const pageBottom = doc.page.height - doc.page.margins.bottom;
      if (doc.y + rowHeight > pageBottom) {
        doc.addPage();
        renderHeader();
        renderTableHeader();
      }

      let x = marginLeft;
      const y = doc.y;
      cells.forEach((text, index) => {
        const width = columnWidths[index] ?? 0;
        if (isHeader) {
          doc.save();
          doc.fillColor("#E5E7EB").rect(x, y, width, rowHeight).fill();
          doc.restore();
        }
        doc.rect(x, y, width, rowHeight).stroke();
        doc.fontSize(9).font(isHeader ? "Helvetica-Bold" : "Helvetica");
        doc.text(text, x + rowPadding, y + rowPadding, { width: width - rowPadding * 2 });
        x += width;
      });
      doc.y = y + rowHeight;
    };

    const renderTableHeader = () => {
      drawRow(headers, true);
    };

    const rows: string[][] = [];
    const sortedSteps = [...jhaCase.steps].sort((a, b) => a.orderIndex - b.orderIndex);
    const sortedHazards = [...jhaCase.hazards].sort((a, b) => a.orderIndex - b.orderIndex);
    sortedSteps.forEach((step, stepIndex) => {
      const hazards = sortedHazards.filter((hazard) => hazard.stepId === step.id);
      if (!hazards.length) {
        rows.push([
          `${stepIndex + 1}`,
          step.label,
          i18n.t("jha.noHazardsForStep"),
          placeholder,
          placeholder
        ]);
        return;
      }
      hazards.forEach((hazard) => {
        rows.push([
          `${stepIndex + 1}`,
          step.label,
          hazard.hazard,
          hazard.consequence ?? placeholder,
          hazard.controls && hazard.controls.length ? hazard.controls.join("\n") : placeholder
        ]);
      });
    });

    renderHeader();
    renderMetaBlock();
    renderTableHeader();

    rows.forEach((row) => {
      drawRow(row);
    });

    const footerHeight = 72;
    const pageBottom = doc.page.height - doc.page.margins.bottom;
    if (doc.y + footerHeight > pageBottom) {
      doc.addPage();
      renderHeader();
    } else {
      doc.moveDown(0.8);
    }

    const footerLabels = [
      i18n.t("jha.pdf.preparedSignature"),
      i18n.t("jha.pdf.reviewedSignature"),
      i18n.t("jha.pdf.approvedSignature")
    ];
    const footerDateLabel = i18n.t("jha.pdf.documentDate");
    const lineWidth = (pageWidth - 20) / footerLabels.length;
    const footerY = doc.y;

    footerLabels.forEach((label, index) => {
      const x = marginLeft + index * lineWidth;
      doc.fontSize(9).text(label, x, footerY, { width: lineWidth - 10 });
      doc.moveTo(x, footerY + 20).lineTo(x + lineWidth - 10, footerY + 20).stroke();
    });

    doc.fontSize(9).text(footerDateLabel, marginLeft, footerY + 32, { width: 120 });
    doc.moveTo(marginLeft + 70, footerY + 44).lineTo(marginLeft + 200, footerY + 44).stroke();
  }

  private renderJhaPageNumbers(doc: PDFKit.PDFDocument, i18n: ReportTranslator) {
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i += 1) {
      doc.switchToPage(i);
      const pageLabel = i18n.t("jha.pdf.pageLabel", { values: { page: i + 1, total: range.count } });
      doc.fontSize(8).text(pageLabel, doc.page.margins.left, doc.page.height - doc.page.margins.bottom + 10, {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
        align: "right"
      });
    }
  }

  private buildJhaSheet(workbook: ExcelJS.Workbook, jhaCase: JhaCaseDto, i18n: ReportTranslator) {
    const sheet = workbook.addWorksheet(i18n.t("worksheets.jha"));
    const placeholder = i18n.t("common.placeholder");

    // Header info
    sheet.getCell("A1").value = i18n.t("jha.title");
    sheet.getCell("A1").font = { bold: true, size: 16 };
    sheet.getCell("A2").value = `${i18n.t("jha.jobTitle")}: ${jhaCase.jobTitle}`;
    sheet.getCell("A3").value = `${i18n.t("jha.site")}: ${jhaCase.site ?? placeholder}`;
    sheet.getCell("A4").value = `${i18n.t("jha.supervisor")}: ${jhaCase.supervisor ?? placeholder}`;
    sheet.getCell("A5").value = `${i18n.t("jha.workersInvolved")}: ${jhaCase.workersInvolved ?? placeholder}`;
    const formatDateCell = (value: string | Date | null | undefined) => {
      if (!value) return null;
      const parsed = value instanceof Date ? value : new Date(value);
      if (Number.isNaN(parsed.getTime())) {
        return null;
      }
      const hasTime = parsed.getHours() !== 0 || parsed.getMinutes() !== 0;
      return hasTime ? i18n.formatDateTime(parsed) : i18n.formatDate(parsed);
    };
    const jobDateLabel = formatDateCell(jhaCase.jobDate);
    if (jobDateLabel) {
      sheet.getCell("A6").value = `${i18n.t("jha.jobDate")}: ${jobDateLabel}`;
    }

    // Table headers
    const tableStartRow = 8;
    const headers =
      i18n.get<string[]>("xlsx.jhaHeaders") ?? ["Step #", "Job Step", "Hazard", "Consequence", "Controls"];
    sheet.columns = headers.map((header, idx) => ({
      header,
      key: `col${idx}`,
      width: idx === 4 ? 40 : idx === 1 || idx === 2 ? 30 : 15
    }));

    const headerRow = sheet.getRow(tableStartRow);
    headers.forEach((header, idx) => {
      headerRow.getCell(idx + 1).value = header;
    });
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFE5E7EB" }
    };

    let currentRow = tableStartRow + 1;
    jhaCase.steps.forEach((step, stepIndex) => {
      const stepHazards = jhaCase.hazards.filter((hazard) => hazard.stepId === step.id);

      if (!stepHazards.length) {
        const row = sheet.getRow(currentRow);
        row.getCell(1).value = stepIndex + 1;
        row.getCell(2).value = step.label;
        row.getCell(3).value = placeholder;
        row.getCell(4).value = placeholder;
        row.getCell(5).value = placeholder;
        currentRow++;
        return;
      }

      stepHazards.forEach((hazard, hazardIndex) => {
        const row = sheet.getRow(currentRow);
        row.getCell(1).value = stepIndex + 1;
        row.getCell(2).value = hazardIndex === 0 ? step.label : "";
        row.getCell(3).value = hazard.hazard;
        row.getCell(4).value = hazard.consequence ?? placeholder;
        row.getCell(5).value = (hazard.controls ?? []).join("\n");
        row.alignment = { vertical: "top", wrapText: true };
        currentRow++;
      });
    });

    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber >= tableStartRow) {
        row.alignment = { vertical: "top", wrapText: true };
        row.border = {
          top: { style: "thin", color: { argb: "FFE5E7EB" } },
          bottom: { style: "thin", color: { argb: "FFE5E7EB" } }
        };
      }
    });

    // Sign-off section
    const signoffRow = currentRow + 2;
    sheet.getCell(signoffRow, 1).value = `${i18n.t("jha.preparedBy")}:`;
    sheet.getCell(signoffRow, 2).value = jhaCase.preparedBy ?? "";
    sheet.getCell(signoffRow + 1, 1).value = `${i18n.t("jha.reviewedBy")}:`;
    sheet.getCell(signoffRow + 1, 2).value = jhaCase.reviewedBy ?? "";
    sheet.getCell(signoffRow + 2, 1).value = `${i18n.t("jha.approvedBy")}:`;
    sheet.getCell(signoffRow + 2, 2).value = jhaCase.approvedBy ?? "";
    const signoffLabel = formatDateCell(jhaCase.signoffDate);
    if (signoffLabel) {
      sheet.getCell(signoffRow + 3, 1).value = `${i18n.t("jha.signoffDate")}:`;
      sheet.getCell(signoffRow + 3, 2).value = signoffLabel;
    }
  }
}

export type ReportServiceType = ReportService;
