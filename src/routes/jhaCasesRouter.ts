import type { Request, Response } from "express";
import express from "express";
import { AppLocals } from "../types/app";

export const jhaCasesRouter = express.Router();

const getTenantServices = (req: Request) => {
  if (!req.tenantServices) {
    throw new Error("Tenant services not available");
  }
  return req.tenantServices;
};

const getLlmJobManager = (req: Request) => (req.app.locals as AppLocals).llmJobManager;
const getReportService = (req: Request) => (req.app.locals as AppLocals).reportService;

const requireTenantDbUrl = (req: Request, res: Response) => {
  if (!req.auth) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return req.auth.dbConnectionString;
};

const requireParam = (req: Request, res: Response, key: string): string | null => {
  const value = (req.params as Record<string, string | undefined>)[key];
  if (!value) {
    res.status(400).json({ error: `${key} parameter is required` });
    return null;
  }
  return value;
};

// List JHA cases
jhaCasesRouter.get("/", async (req: Request, res: Response) => {
  try {
    const { createdBy, limit } = req.query as { createdBy?: string; limit?: string };
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    const { jhaService } = getTenantServices(req);
    const normalizedCreatedBy =
      typeof createdBy === "string" && createdBy.trim().length > 0 ? createdBy.trim() : null;
    const listParams: { createdBy?: string | null; limit?: number } = {};
    if (normalizedCreatedBy) {
      listParams.createdBy = normalizedCreatedBy;
    }
    if (!Number.isNaN(parsedLimit ?? NaN) && typeof parsedLimit === "number") {
      listParams.limit = parsedLimit;
    }
    const cases = await jhaService.listCases(listParams);
    res.json({ cases });
  } catch (error) {
    console.error("[jhaCasesRouter] listCases", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Create a new JHA case
jhaCasesRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { jobTitle, site, supervisor, workersInvolved, jobDate, revision, preparedBy, reviewedBy, approvedBy, signoffDate } = req.body;
    if (!jobTitle || typeof jobTitle !== "string") {
      return res.status(400).json({ error: "jobTitle is required" });
    }

    const { jhaService } = getTenantServices(req);
    const jhaCase = await jhaService.createCase({
      jobTitle,
      site,
      supervisor,
      workersInvolved,
      jobDate,
      revision,
      preparedBy,
      reviewedBy,
      approvedBy,
      signoffDate
    });
    res.status(201).json(jhaCase);
  } catch (error) {
    console.error("[jhaCasesRouter] createCase", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get a single JHA case
jhaCasesRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }
    const { jhaService } = getTenantServices(req);
    const jhaCase = await jhaService.getCaseById(caseId);
    if (!jhaCase) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(jhaCase);
  } catch (error) {
    console.error("[jhaCasesRouter] getCase", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update JHA case metadata
jhaCasesRouter.patch("/:id", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }
    const { jhaService } = getTenantServices(req);
    const updated = await jhaService.updateCaseMeta(caseId, req.body);
    if (!updated) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(updated);
  } catch (error) {
    console.error("[jhaCasesRouter] updateCaseMeta", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete a JHA case
jhaCasesRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }
    const { jhaService } = getTenantServices(req);
    const deleted = await jhaService.deleteCase(caseId);
    if (!deleted) {
      return res.status(404).json({ error: "Not found" });
    }
    res.status(204).send();
  } catch (error) {
    console.error("[jhaCasesRouter] deleteCase", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update steps for a JHA case
jhaCasesRouter.put("/:id/steps", async (req: Request, res: Response) => {
  try {
    const { steps } = req.body;
    if (!Array.isArray(steps)) {
      return res.status(400).json({ error: "steps must be an array" });
    }
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }

    const { jhaService } = getTenantServices(req);
    const updated = await jhaService.updateSteps(caseId, steps);
    if (!updated) {
      return res.status(404).json({ error: "Not found" });
    }

    res.json({ steps: updated.steps });
  } catch (error) {
    console.error("[jhaCasesRouter] updateSteps", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update hazards for a JHA case
jhaCasesRouter.put("/:id/hazards", async (req: Request, res: Response) => {
  try {
    const { hazards } = req.body;
    if (!Array.isArray(hazards)) {
      return res.status(400).json({ error: "hazards must be an array" });
    }
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }

    const { jhaService } = getTenantServices(req);
    const updated = await jhaService.updateHazards(caseId, hazards);
    if (!updated) {
      return res.status(404).json({ error: "Not found" });
    }

    res.json({ hazards: updated.hazards });
  } catch (error) {
    console.error("[jhaCasesRouter] updateHazards", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Replace JHA rows manually (step/hazard/consequence/controls)
jhaCasesRouter.put("/:id/rows", async (req: Request, res: Response) => {
  try {
    const { rows } = req.body;
    if (!Array.isArray(rows)) {
      return res.status(400).json({ error: "rows must be an array" });
    }
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }

    const { jhaService } = getTenantServices(req);
    const updated = await jhaService.replaceRowsFromExtraction(caseId, rows);
    if (!updated) {
      return res.status(404).json({ error: "Not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error("[jhaCasesRouter] updateRows", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Extract JHA rows from job description using LLM
jhaCasesRouter.post("/:id/rows/extract", async (req: Request, res: Response) => {
  try {
    const { jobDescription } = req.body;
    if (!jobDescription || typeof jobDescription !== "string") {
      return res.status(400).json({ error: "jobDescription is required" });
    }
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }

    const { jhaService } = getTenantServices(req);
    const llmJobManager = getLlmJobManager(req);
    const tenantDbUrl = requireTenantDbUrl(req, res);
    if (!tenantDbUrl) {
      return;
    }
    const jhaCase = await jhaService.getCaseById(caseId);
    if (!jhaCase) {
      return res.status(404).json({ error: "Not found" });
    }
    const job = llmJobManager.enqueueJhaRowExtraction({ caseId, jobDescription, tenantDbUrl });
    res.status(202).json(job);
  } catch (error) {
    console.error("[jhaCasesRouter] extractRows", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Export JHA case as PDF
jhaCasesRouter.get("/:id/export/pdf", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }
    const { jhaService } = getTenantServices(req);
    const reportService = getReportService(req);
    const jhaCase = await jhaService.getCaseById(caseId);
    if (!jhaCase) {
      return res.status(404).json({ error: "Not found" });
    }

    const pdfOptions = req.auth?.locale ? { locale: req.auth.locale } : undefined;
    const pdf = await reportService.generateJhaPdf(jhaCase, pdfOptions);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="jha-${caseId}.pdf"`);
    res.send(pdf);
  } catch (error) {
    console.error("[jhaCasesRouter] exportPdf", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Export JHA case as XLSX
jhaCasesRouter.get("/:id/export/xlsx", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }
    const { jhaService } = getTenantServices(req);
    const reportService = getReportService(req);
    const jhaCase = await jhaService.getCaseById(caseId);
    if (!jhaCase) {
      return res.status(404).json({ error: "Not found" });
    }

    const workbookOptions = req.auth?.locale ? { locale: req.auth.locale } : undefined;
    const workbook = await reportService.generateJhaXlsx(jhaCase, workbookOptions);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="jha-${caseId}.xlsx"`);
    res.send(workbook);
  } catch (error) {
    console.error("[jhaCasesRouter] exportXlsx", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// List attachments for a JHA case
jhaCasesRouter.get("/:id/attachments", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }
    const { jhaService } = getTenantServices(req);
    const jhaCase = await jhaService.getCaseById(caseId);
    if (!jhaCase) {
      return res.status(404).json({ error: "Not found" });
    }

    const attachments = await jhaService.listAttachments(caseId);
    res.json({ attachments });
  } catch (error) {
    console.error("[jhaCasesRouter] listAttachments", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default jhaCasesRouter;
