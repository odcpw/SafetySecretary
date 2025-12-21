import type { Request, Response } from "express";
import express from "express";
import { AppLocals } from "../types/app";
import { TEMPLATE_LIKELIHOOD_LEVELS, TEMPLATE_SEVERITY_LEVELS } from "../types/templateRisk";
import type { AttachmentDto } from "../services/raService";

export const raCasesRouter = express.Router();

const getTenantServices = (req: Request) => {
  if (!req.tenantServices) {
    throw new Error("Tenant services not available");
  }
  return req.tenantServices;
};

const getLlmJobManager = (req: Request) => (req.app.locals as AppLocals).llmJobManager;
const getReportService = (req: Request) => (req.app.locals as AppLocals).reportService;
const getLlmService = (req: Request) => (req.app.locals as AppLocals).llmService;

const requireTenantDbUrl = (req: Request, res: Response) => {
  if (!req.auth) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return req.auth.dbConnectionString;
};

const resolveEncryptionKey = async (req: Request, res: Response) => {
  if (!req.auth) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  const registry = (req.app.locals as AppLocals).registryService;
  const keyRef = req.auth.encryptionKeyRef ?? (await registry.ensureOrgEncryptionKey(req.auth.orgId));
  if (!keyRef) {
    res.status(500).json({ error: "Encryption key unavailable" });
    return null;
  }
  const key = Buffer.from(keyRef, "base64");
  if (key.length !== 32) {
    res.status(500).json({ error: "Encryption key invalid" });
    return null;
  }
  req.auth.encryptionKeyRef = keyRef;
  return key;
};

const requireParam = (req: Request, res: Response, key: string): string | null => {
  const value = (req.params as Record<string, string | undefined>)[key];
  if (!value) {
    res.status(400).json({ error: `${key} parameter is required` });
    return null;
  }
  return value;
};

const SEVERITY_LEVELS = TEMPLATE_SEVERITY_LEVELS;
const LIKELIHOOD_LEVELS = TEMPLATE_LIKELIHOOD_LEVELS;
const CONTROL_HIERARCHY_LEVELS = ["SUBSTITUTION", "TECHNICAL", "ORGANIZATIONAL", "PPE"] as const;
const ACTION_STATUSES = ["OPEN", "IN_PROGRESS", "COMPLETE"] as const;
const HAZARD_CATEGORY_CODES = [
  "MECHANICAL",
  "FALLS",
  "ELECTRICAL",
  "HAZARDOUS_SUBSTANCES",
  "FIRE_EXPLOSION",
  "THERMAL",
  "PHYSICAL",
  "ENVIRONMENTAL",
  "ERGONOMIC",
  "PSYCHOLOGICAL",
  "CONTROL_FAILURES",
  "POWER_FAILURE",
  "ORGANIZATIONAL"
] as const;

type SeverityLevelNormalized = (typeof SEVERITY_LEVELS)[number];
type LikelihoodLevelNormalized = (typeof LIKELIHOOD_LEVELS)[number];
type ControlHierarchyNormalized = (typeof CONTROL_HIERARCHY_LEVELS)[number];
type ActionStatusNormalized = (typeof ACTION_STATUSES)[number];
type HazardCategoryCodeNormalized = (typeof HAZARD_CATEGORY_CODES)[number];

const normalizeSeverity = (value: unknown): SeverityLevelNormalized | undefined => {
  const normalized =
    typeof value === "string" ? value.trim().toUpperCase() : "";
  return SEVERITY_LEVELS.includes(normalized as SeverityLevelNormalized)
    ? (normalized as SeverityLevelNormalized)
    : undefined;
};

const normalizeLikelihood = (value: unknown): LikelihoodLevelNormalized | undefined => {
  const normalized =
    typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : "";
  return LIKELIHOOD_LEVELS.includes(normalized as LikelihoodLevelNormalized)
    ? (normalized as LikelihoodLevelNormalized)
    : undefined;
};

const normalizeHierarchy = (value: unknown): ControlHierarchyNormalized | undefined => {
  const normalized =
    typeof value === "string" ? value.trim().toUpperCase().replace(/\s+/g, "_") : "";
  return CONTROL_HIERARCHY_LEVELS.includes(normalized as ControlHierarchyNormalized)
    ? (normalized as ControlHierarchyNormalized)
    : undefined;
};

const normalizeActionStatus = (value: unknown): ActionStatusNormalized | undefined => {
  const normalized =
    typeof value === "string" ? value.trim().toUpperCase().replace(/\s+/g, "_") : "";
  return ACTION_STATUSES.includes(normalized as ActionStatusNormalized)
    ? (normalized as ActionStatusNormalized)
    : undefined;
};

const normalizeCategoryCode = (value: unknown): HazardCategoryCodeNormalized | undefined => {
  const normalized =
    typeof value === "string" ? value.trim().toUpperCase().replace(/\s+/g, "_") : "";
  return HAZARD_CATEGORY_CODES.includes(normalized as HazardCategoryCodeNormalized)
    ? (normalized as HazardCategoryCodeNormalized)
    : undefined;
};

const normalizeStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
};

type RiskRatingNormalized = {
  hazardId: string;
  severity: SeverityLevelNormalized;
  likelihood: LikelihoodLevelNormalized;
};

const normalizeRiskRatings = (
  ratings: unknown
): { normalized: RiskRatingNormalized[]; clearIds: string[]; errors: string[] } => {
  const errors: string[] = [];
  if (!Array.isArray(ratings)) {
    return { normalized: [], clearIds: [], errors: ["ratings must be an array"] };
  }

  const normalized: RiskRatingNormalized[] = [];
  const clearIds: string[] = [];

  ratings.forEach((rating: any, index: number) => {
    const hazardId = typeof rating?.hazardId === "string" ? rating.hazardId : null;
    if (!hazardId) {
      errors.push(`ratings[${index}].hazardId is required`);
      return;
    }
    const severityRaw = rating?.severity;
    const likelihoodRaw = rating?.likelihood;
    const severityEmpty = severityRaw === null || severityRaw === undefined || String(severityRaw).trim() === "";
    const likelihoodEmpty = likelihoodRaw === null || likelihoodRaw === undefined || String(likelihoodRaw).trim() === "";

    if (severityEmpty && likelihoodEmpty) {
      clearIds.push(hazardId);
      return;
    }
    if (severityEmpty || likelihoodEmpty) {
      errors.push(`ratings[${index}] must include both severity and likelihood`);
      return;
    }

    const severity = normalizeSeverity(severityRaw);
    const likelihood = normalizeLikelihood(likelihoodRaw);
    if (!severity) {
      errors.push(`ratings[${index}].severity must be one of ${SEVERITY_LEVELS.join(", ")}`);
    }
    if (!likelihood) {
      errors.push(`ratings[${index}].likelihood must be one of ${LIKELIHOOD_LEVELS.join(", ")}`);
    }
    if (!severity || !likelihood) {
      return;
    }
    normalized.push({ hazardId, severity, likelihood });
  });

  return { normalized, clearIds, errors };
};

raCasesRouter.get("/", async (req: Request, res: Response) => {
  try {
    const { createdBy, limit } = req.query as { createdBy?: string; limit?: string };
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    const { raService } = getTenantServices(req);
    const normalizedCreatedBy =
      typeof createdBy === "string" && createdBy.trim().length > 0 ? createdBy.trim() : null;
    const listParams: { createdBy?: string | null; limit?: number } = {};
    if (normalizedCreatedBy) {
      listParams.createdBy = normalizedCreatedBy;
    }
    if (!Number.isNaN(parsedLimit ?? NaN) && typeof parsedLimit === "number") {
      listParams.limit = parsedLimit;
    }
    const cases = await raService.listCases(listParams);
    res.json({ cases });
  } catch (error) {
    console.error("[raCasesRouter] listCases", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

raCasesRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { activityName, location, team } = req.body;
    if (!activityName || typeof activityName !== "string") {
      return res.status(400).json({ error: "activityName is required" });
    }

    const { raService } = getTenantServices(req);
    const raCase = await raService.createCase({ activityName, location, team });
    res.status(201).json(raCase);
  } catch (error) {
    console.error("[raCasesRouter] createCase", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

raCasesRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }
    const { raService } = getTenantServices(req);
    const raCase = await raService.getCaseById(caseId);
    if (!raCase) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(raCase);
  } catch (error) {
    console.error("[raCasesRouter] getCase", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

raCasesRouter.patch("/:id", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }
    const { raService } = getTenantServices(req);
    const updated = await raService.updateCaseMeta(caseId, req.body);
    if (!updated) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(updated);
  } catch (error) {
    console.error("[raCasesRouter] updateCaseMeta", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

raCasesRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }
    const { raService } = getTenantServices(req);
    const deleted = await raService.deleteCase(caseId);
    if (!deleted) {
      return res.status(404).json({ error: "Not found" });
    }
    res.status(204).send();
  } catch (error) {
    console.error("[raCasesRouter] deleteCase", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

raCasesRouter.post("/:id/advance-phase", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }
    const { raService } = getTenantServices(req);
    const updated = await raService.advancePhase(caseId);
    if (!updated) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json({ id: updated.id, phase: updated.phase });
  } catch (error) {
    console.error("[raCasesRouter] advancePhase", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

raCasesRouter.post("/:id/steps/extract", async (req: Request, res: Response) => {
  try {
    const { description } = req.body;
    if (!description || typeof description !== "string") {
      return res.status(400).json({ error: "description is required" });
    }
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }

    const { raService } = getTenantServices(req);
    const llmJobManager = getLlmJobManager(req);
    const tenantDbUrl = requireTenantDbUrl(req, res);
    if (!tenantDbUrl) {
      return;
    }
    const raCase = await raService.getCaseById(caseId);
    if (!raCase) {
      return res.status(404).json({ error: "Not found" });
    }

    const job = llmJobManager.enqueueStepsExtraction({ caseId, description, tenantDbUrl });
    res.status(202).json(job);
  } catch (error) {
    console.error("[raCasesRouter] extractSteps", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

raCasesRouter.put("/:id/steps", async (req: Request, res: Response) => {
  try {
    const { steps } = req.body;
    if (!Array.isArray(steps)) {
      return res.status(400).json({ error: "steps must be an array" });
    }
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }

    const { raService } = getTenantServices(req);
    const updated = await raService.updateSteps(caseId, steps);
    if (!updated) {
      return res.status(404).json({ error: "Not found" });
    }

    res.json({ steps: updated.steps });
  } catch (error) {
    console.error("[raCasesRouter] updateSteps", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

raCasesRouter.post("/:id/hazards/extract", async (req: Request, res: Response) => {
  try {
    const { narrative } = req.body;
    if (!narrative || typeof narrative !== "string") {
      return res.status(400).json({ error: "narrative is required" });
    }
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }

    const { raService } = getTenantServices(req);
    const llmJobManager = getLlmJobManager(req);
    const tenantDbUrl = requireTenantDbUrl(req, res);
    if (!tenantDbUrl) {
      return;
    }
    const raCase = await raService.getCaseById(caseId);
    if (!raCase) {
      return res.status(404).json({ error: "Not found" });
    }

    const job = llmJobManager.enqueueHazardExtraction({ caseId, narrative, tenantDbUrl });
    res.status(202).json(job);
  } catch (error) {
    console.error("[raCasesRouter] extractHazards", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

raCasesRouter.post("/:id/controls/extract", async (req: Request, res: Response) => {
  try {
    const { notes } = req.body;
    if (!notes || typeof notes !== "string") {
      return res.status(400).json({ error: "notes is required" });
    }
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }
    const { raService } = getTenantServices(req);
    const llmJobManager = getLlmJobManager(req);
    const tenantDbUrl = requireTenantDbUrl(req, res);
    if (!tenantDbUrl) {
      return;
    }
    const raCase = await raService.getCaseById(caseId);
    if (!raCase) {
      return res.status(404).json({ error: "Not found" });
    }
    const job = llmJobManager.enqueueControlExtraction({ caseId, notes, tenantDbUrl });
    res.status(202).json(job);
  } catch (error) {
    console.error("[raCasesRouter] extractControls", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

raCasesRouter.post("/:id/actions/extract", async (req: Request, res: Response) => {
  try {
    const { notes } = req.body;
    if (!notes || typeof notes !== "string") {
      return res.status(400).json({ error: "notes is required" });
    }
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }
    const { raService } = getTenantServices(req);
    const llmJobManager = getLlmJobManager(req);
    const tenantDbUrl = requireTenantDbUrl(req, res);
    if (!tenantDbUrl) {
      return;
    }
    const raCase = await raService.getCaseById(caseId);
    if (!raCase) {
      return res.status(404).json({ error: "Not found" });
    }
    const job = llmJobManager.enqueueActionExtraction({ caseId, notes, tenantDbUrl });
    res.status(202).json(job);
  } catch (error) {
    console.error("[raCasesRouter] extractActions", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

raCasesRouter.post("/:id/hazards", async (req: Request, res: Response) => {
  try {
    const { stepId, label, description } = req.body;
    if (!stepId || !label || !description) {
      return res.status(400).json({ error: "stepId, label and description are required" });
    }
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }

    const { raService } = getTenantServices(req);
    const hazard = await raService.addManualHazard(caseId, { stepId, label, description });
    if (!hazard) {
      return res.status(404).json({ error: "Not found" });
    }
    res.status(201).json(hazard);
  } catch (error) {
    console.error("[raCasesRouter] addManualHazard", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

raCasesRouter.put("/:id/hazards/:hazardId", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }
    const hazardId = requireParam(req, res, "hazardId");
    if (!hazardId) {
      return;
    }

    const { raService } = getTenantServices(req);
    const patchRaw = typeof req.body === "object" && req.body ? req.body : {};
    const errors: string[] = [];
    const safePatch: any = {};

    const labelRaw = (patchRaw as any).label;
    const descriptionRaw = (patchRaw as any).description;
    const categoryRaw = (patchRaw as any).categoryCode;
    const existingControlsRaw = (patchRaw as any).existingControls;
    const stepIdRaw = (patchRaw as any).stepId;

    if (labelRaw !== undefined) {
      if (typeof labelRaw !== "string" || !labelRaw.trim()) {
        errors.push("label must be a non-empty string");
      } else {
        safePatch.label = labelRaw.trim();
      }
    }
    if (descriptionRaw !== undefined) {
      if (typeof descriptionRaw === "string" || descriptionRaw === null) {
        safePatch.description = typeof descriptionRaw === "string" ? descriptionRaw : null;
      } else {
        errors.push("description must be a string or null");
      }
    }
    if (categoryRaw !== undefined) {
      if (categoryRaw === null) {
        safePatch.categoryCode = null;
      } else if (typeof categoryRaw === "string") {
        const normalizedCategory = normalizeCategoryCode(categoryRaw);
        if (!normalizedCategory) {
          errors.push(`categoryCode must be one of ${HAZARD_CATEGORY_CODES.join(", ")}`);
        } else {
          safePatch.categoryCode = normalizedCategory;
        }
      } else {
        errors.push("categoryCode must be a string or null");
      }
    }
    if (existingControlsRaw !== undefined) {
      const normalizedControls = normalizeStringArray(existingControlsRaw);
      if (normalizedControls === undefined) {
        errors.push("existingControls must be an array of strings");
      } else {
        safePatch.existingControls = normalizedControls;
      }
    }
    if (stepIdRaw !== undefined) {
      if (typeof stepIdRaw !== "string" || !stepIdRaw.trim()) {
        errors.push("stepId must be a non-empty string");
      } else {
        const stepId = stepIdRaw.trim();
        const raCase = await raService.getCaseById(caseId);
        if (!raCase) {
          return res.status(404).json({ error: "Not found" });
        }
        const validStepIds = new Set(raCase.steps.map((s) => s.id));
        if (!validStepIds.has(stepId)) {
          errors.push("stepId must reference an existing step in this case");
        } else {
          safePatch.stepId = stepId;
        }
      }
    }

    if (errors.length) {
      return res.status(400).json({ error: "Invalid hazard patch", details: errors });
    }

    const updated = await raService.updateHazard(caseId, hazardId, safePatch);
    if (!updated) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(updated);
  } catch (error) {
    console.error("[raCasesRouter] updateHazard", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

raCasesRouter.delete("/:id/hazards/:hazardId", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }
    const hazardId = requireParam(req, res, "hazardId");
    if (!hazardId) {
      return;
    }

    const { raService } = getTenantServices(req);
    const removed = await raService.deleteHazard(caseId, hazardId);
    if (!removed) {
      return res.status(404).json({ error: "Not found" });
    }
    res.status(204).send();
  } catch (error) {
    console.error("[raCasesRouter] deleteHazard", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

raCasesRouter.put("/:id/hazards/risk", async (req: Request, res: Response) => {
  try {
    const { ratings } = req.body;
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }

    const { normalized, clearIds, errors } = normalizeRiskRatings(ratings);
    if (errors.length) {
      return res.status(400).json({ error: "Invalid ratings", details: errors });
    }

    const { raService } = getTenantServices(req);
    const raCase = await raService.getCaseById(caseId);
    if (!raCase) {
      return res.status(404).json({ error: "Case not found" });
    }
    const updated = normalized.length
      ? await raService.setHazardRiskRatings(caseId, normalized)
      : raCase;
    if (!updated) {
      const requestedHazardIds = [...new Set(normalized.map((item) => item.hazardId))];
      const knownHazards = new Set(raCase.hazards.map((hazard) => hazard.id));
      const missingHazardIds = requestedHazardIds.filter((id) => !knownHazards.has(id));
      return res.status(400).json({
        error: "Hazards do not belong to case",
        details: { missingHazardIds }
      });
    }

    if (clearIds.length) {
      const cleared = await raService.clearHazardRiskRatings(caseId, clearIds, "BASELINE");
      if (!cleared) {
        return res.status(400).json({ error: "Unable to clear ratings" });
      }
    }

    const refreshed = await raService.getCaseById(caseId);
    if (!refreshed) {
      return res.status(404).json({ error: "Case not found" });
    }
    res.json({ hazards: refreshed.hazards });
  } catch (error) {
    console.error("[raCasesRouter] setHazardRiskRatings", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Add proposed controls for a hazard (from control discussion phase)
raCasesRouter.post("/:id/hazards/:hazardId/proposed-controls", async (req: Request, res: Response) => {
  try {
    const { description, hierarchy } = req.body;
    if (!description || typeof description !== "string") {
      return res.status(400).json({ error: "description is required" });
    }
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }
    const hazardId = requireParam(req, res, "hazardId");
    if (!hazardId) {
      return;
    }

    const { raService } = getTenantServices(req);
    const errors: string[] = [];
    const normalizedHierarchy =
      hierarchy !== undefined ? normalizeHierarchy(hierarchy) : undefined;
    if (hierarchy !== undefined && !normalizedHierarchy) {
      errors.push(`hierarchy must be one of ${CONTROL_HIERARCHY_LEVELS.join(", ")}`);
    }
    if (errors.length) {
      return res.status(400).json({ error: "Invalid control data", details: errors });
    }

    const payload: { hazardId: string; description: string; hierarchy?: any } = { hazardId, description };
    if (normalizedHierarchy !== undefined) {
      payload.hierarchy = normalizedHierarchy;
    }
    const control = await raService.addProposedControl(caseId, payload as any);
    if (!control) {
      return res.status(404).json({ error: "Not found" });
    }
    res.status(201).json(control);
  } catch (error) {
    console.error("[raCasesRouter] addProposedControl", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Delete a proposed control
raCasesRouter.delete("/:id/hazards/:hazardId/proposed-controls/:controlId", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }
    const controlId = req.params.controlId;
    if (!controlId) {
      return res.status(400).json({ error: "controlId parameter is required" });
    }

    const { raService } = getTenantServices(req);
    const deleted = await raService.deleteProposedControl(caseId, controlId);
    if (!deleted) {
      return res.status(404).json({ error: "Not found" });
    }
    res.status(204).send();
  } catch (error) {
    console.error("[raCasesRouter] deleteProposedControl", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

raCasesRouter.put("/:id/hazards/residual-risk", async (req: Request, res: Response) => {
  try {
    const { ratings } = req.body;
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }

    const { normalized, clearIds, errors } = normalizeRiskRatings(ratings);
    if (errors.length) {
      return res.status(400).json({ error: "Invalid ratings", details: errors });
    }

    const { raService } = getTenantServices(req);
    const raCase = await raService.getCaseById(caseId);
    if (!raCase) {
      return res.status(404).json({ error: "Case not found" });
    }
    const updated = normalized.length
      ? await raService.setResidualRiskRatings(caseId, normalized)
      : raCase;
    if (!updated) {
      const requestedHazardIds = [...new Set(normalized.map((item) => item.hazardId))];
      const knownHazards = new Set(raCase.hazards.map((hazard) => hazard.id));
      const missingHazardIds = requestedHazardIds.filter((id) => !knownHazards.has(id));
      return res.status(400).json({
        error: "Hazards do not belong to case",
        details: { missingHazardIds }
      });
    }

    if (clearIds.length) {
      const cleared = await raService.clearHazardRiskRatings(caseId, clearIds, "RESIDUAL");
      if (!cleared) {
        return res.status(400).json({ error: "Unable to clear ratings" });
      }
    }

    const refreshed = await raService.getCaseById(caseId);
    if (!refreshed) {
      return res.status(404).json({ error: "Case not found" });
    }
    res.json({ hazards: refreshed.hazards });
  } catch (error) {
    console.error("[raCasesRouter] setResidualRiskRatings", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

raCasesRouter.put("/:id/steps/:stepId/hazards/order", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }
    const stepId = requireParam(req, res, "stepId");
    if (!stepId) {
      return;
    }
    const { hazardIds } = req.body;
    if (!Array.isArray(hazardIds)) {
      return res.status(400).json({ error: "hazardIds must be an array" });
    }

    const { raService } = getTenantServices(req);
    const raCase = await raService.getCaseById(caseId);
    if (!raCase) {
      return res.status(404).json({ error: "Not found" });
    }
    if (!raCase.steps.some((step) => step.id === stepId)) {
      return res.status(404).json({ error: "Not found" });
    }
    const hazardIdsForStep = new Set(
      raCase.hazards.filter((hazard) => hazard.stepId === stepId).map((hazard) => hazard.id)
    );
    const invalidHazardIds = hazardIds.filter((hazardId: any) => typeof hazardId !== "string" || !hazardIdsForStep.has(hazardId));
    if (invalidHazardIds.length) {
      return res.status(400).json({ error: "Invalid hazardIds", details: invalidHazardIds });
    }

    const success = await raService.reorderHazardsForStep(caseId, stepId, hazardIds);
    if (!success) {
      return res.status(404).json({ error: "Not found" });
    }
    res.status(204).send();
  } catch (error) {
    console.error("[raCasesRouter] reorderHazardsForStep", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

raCasesRouter.put("/:id/hazards/:hazardId/actions/order", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }
    const hazardId = requireParam(req, res, "hazardId");
    if (!hazardId) {
      return;
    }
    const { actionIds } = req.body;
    if (!Array.isArray(actionIds)) {
      return res.status(400).json({ error: "actionIds must be an array" });
    }
    const normalized = actionIds
      .filter((id: unknown): id is string => typeof id === "string" && id.trim().length > 0)
      .map((id: string) => id.trim());

    const { raService } = getTenantServices(req);
    const reordered = await raService.reorderActionsForHazard(caseId, hazardId, normalized);
    if (!reordered) {
      return res.status(404).json({ error: "Not found" });
    }
    res.status(204).send();
  } catch (error) {
    console.error("[raCasesRouter] reorderActionsForHazard", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

raCasesRouter.post("/:id/actions", async (req: Request, res: Response) => {
  try {
    const { hazardId, description, owner, dueDate } = req.body;
    if (!hazardId || !description) {
      return res.status(400).json({ error: "hazardId and description are required" });
    }
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }

    const { raService } = getTenantServices(req);
    const action = await raService.addAction(caseId, { hazardId, description, owner, dueDate });
    if (!action) {
      return res.status(404).json({ error: "Not found" });
    }
    res.status(201).json(action);
  } catch (error) {
    console.error("[raCasesRouter] addAction", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

raCasesRouter.put("/:id/actions/:actionId", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }
    const actionId = requireParam(req, res, "actionId");
    if (!actionId) {
      return;
    }

    const { raService } = getTenantServices(req);
    const patchRaw = typeof req.body === "object" && req.body ? req.body : {};
    const errors: string[] = [];
    const safePatch: any = {};

    const descriptionRaw = (patchRaw as any).description;
    const ownerRaw = (patchRaw as any).owner;
    const dueDateRaw = (patchRaw as any).dueDate;
    const statusRaw = (patchRaw as any).status;

    if (descriptionRaw !== undefined) {
      if (typeof descriptionRaw !== "string") {
        errors.push("description must be a string");
      } else {
        safePatch.description = descriptionRaw;
      }
    }
    if (ownerRaw !== undefined) {
      if (typeof ownerRaw !== "string" && ownerRaw !== null) {
        errors.push("owner must be a string or null");
      } else {
        safePatch.owner = ownerRaw;
      }
    }
    if (dueDateRaw !== undefined) {
      if (typeof dueDateRaw !== "string" && dueDateRaw !== null) {
        errors.push("dueDate must be a string or null");
      } else {
        safePatch.dueDate = dueDateRaw;
      }
    }
    if (statusRaw !== undefined) {
      const normalizedStatus = normalizeActionStatus(statusRaw);
      if (!normalizedStatus) {
        errors.push(`status must be one of ${ACTION_STATUSES.join(", ")}`);
      } else {
        safePatch.status = normalizedStatus;
      }
    }
    if (errors.length) {
      return res.status(400).json({ error: "Invalid action patch", details: errors });
    }

    const updated = await raService.updateAction(caseId, actionId, safePatch);
    if (!updated) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(updated);
  } catch (error) {
    console.error("[raCasesRouter] updateAction", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

raCasesRouter.delete("/:id/actions/:actionId", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }
    const actionId = requireParam(req, res, "actionId");
    if (!actionId) {
      return;
    }

    const { raService } = getTenantServices(req);
    const deleted = await raService.deleteAction(caseId, actionId);
    if (!deleted) {
      return res.status(404).json({ error: "Not found" });
    }
    res.status(204).send();
  } catch (error) {
    console.error("[raCasesRouter] deleteAction", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

raCasesRouter.get("/:id/export/pdf", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }
    const { raService } = getTenantServices(req);
    const reportService = getReportService(req);
    const raCase = await raService.getCaseById(caseId);
    if (!raCase) {
      return res.status(404).json({ error: "Not found" });
    }

    const attachments = await raService.listAttachments(caseId);
    const storageRoot = req.auth?.storageRoot;
    const encryptionKey = await resolveEncryptionKey(req, res);
    if (!encryptionKey) {
      return;
    }
    const pdfOptions: {
      attachments: AttachmentDto[];
      storageRoot?: string;
      encryptionKey: Buffer;
      locale?: string;
    } = {
      attachments,
      encryptionKey
    };
    if (storageRoot) {
      pdfOptions.storageRoot = storageRoot;
    }
    if (req.auth?.locale) {
      pdfOptions.locale = req.auth.locale;
    }
    const pdf = await reportService.generatePdfForCase(raCase, pdfOptions);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="ra-${caseId}.pdf"`);
    res.send(pdf);
  } catch (error) {
    console.error("[raCasesRouter] exportPdf", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

raCasesRouter.get("/:id/export/xlsx", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }
    const { raService } = getTenantServices(req);
    const reportService = getReportService(req);
    const raCase = await raService.getCaseById(caseId);
    if (!raCase) {
      return res.status(404).json({ error: "Not found" });
    }

    const attachments = await raService.listAttachments(caseId);
    const storageRoot = req.auth?.storageRoot;
    const encryptionKey = await resolveEncryptionKey(req, res);
    if (!encryptionKey) {
      return;
    }
    const workbookOptions: {
      attachments: AttachmentDto[];
      storageRoot?: string;
      encryptionKey: Buffer;
      locale?: string;
    } = {
      attachments,
      encryptionKey
    };
    if (storageRoot) {
      workbookOptions.storageRoot = storageRoot;
    }
    if (req.auth?.locale) {
      workbookOptions.locale = req.auth.locale;
    }
    const workbook = await reportService.generateXlsxForCase(raCase, workbookOptions);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename=\"ra-${caseId}.xlsx\"`);
    res.send(workbook);
  } catch (error) {
    console.error("[raCasesRouter] exportXlsx", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Parse contextual update from natural language (returns commands, does not apply them)
raCasesRouter.post("/:id/contextual-update/parse", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }
    const { userInput, currentPhase } = req.body;
    if (!userInput || typeof userInput !== "string") {
      return res.status(400).json({ error: "userInput is required" });
    }

    const { raService } = getTenantServices(req);
    const llmService = getLlmService(req);
    const raCase = await raService.getCaseById(caseId);
    if (!raCase) {
      return res.status(404).json({ error: "Not found" });
    }

    // Build table state for LLM context
    const tableState = {
      steps: raCase.steps.map((s) => ({
        id: s.id,
        activity: s.activity,
        equipment: s.equipment,
        substances: s.substances
      })),
      hazards: raCase.hazards.map((h) => ({
        id: h.id,
        label: h.label,
        description: h.description,
        categoryCode: h.categoryCode,
        existingControls: h.existingControls,
        stepId: h.stepId,
        ...(h.baseline ? { baseline: h.baseline } : {}),
        ...(h.residual ? { residual: h.residual } : {})
      })),
      actions: raCase.actions.map((a) => ({
        id: a.id,
        description: a.description,
        hazardId: a.hazardId
      }))
    };

    const result = await llmService.parseContextualUpdate({
      userInput,
      currentPhase: currentPhase ?? raCase.phase,
      tableState
    });

    const summary = result.summary ?? (result.commands.length ? `${result.commands.length} update(s)` : "No updates parsed");
    res.json({
      ...result,
      summary,
      needsClarification: result.needsClarification ?? false
    });
  } catch (error) {
    console.error("[raCasesRouter] parseContextualUpdate", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Apply a contextual update command
raCasesRouter.post("/:id/contextual-update/apply", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }
    const { command } = req.body;
    if (!command || !command.intent || !command.target) {
      return res.status(400).json({ error: "command with intent and target is required" });
    }

    const { raService } = getTenantServices(req);
    const raCase = await raService.getCaseById(caseId);
    if (!raCase) {
      return res.status(404).json({ error: "Not found" });
    }

    const errors: string[] = [];
    const rawIntent = typeof command.intent === "string" ? command.intent.trim().toLowerCase() : "";
    const intent = rawIntent === "update" ? "modify" : rawIntent;
    const rawTarget = typeof command.target === "string" ? command.target.trim().toLowerCase() : "";
    const target = rawTarget;
    const location = typeof command.location === "object" && command.location ? command.location : {};
    const data = typeof command.data === "object" && command.data ? command.data : {};

    const allowedIntents = ["add", "modify", "delete", "insert"];
    const allowedTargets = ["step", "hazard", "control", "action", "assessment"];
    if (!allowedIntents.includes(intent)) {
      errors.push(`intent must be one of ${allowedIntents.join(", ")}`);
    }
    if (!allowedTargets.includes(target)) {
      errors.push(`target must be one of ${allowedTargets.join(", ")}`);
    }
    if (errors.length) {
      return res.status(400).json({ error: "Invalid command", details: errors });
    }

    const reindexSteps = (steps: Array<any>) =>
      steps.map((step, index) => ({
        id: step.id,
        activity: step.activity,
        equipment: step.equipment ?? [],
        substances: step.substances ?? [],
        description: step.description ?? null,
        orderIndex: index
      }));

    if (target === "step") {
      if (intent === "modify") {
        const idxRaw = (location as any).stepIndex;
        const stepIndex =
          typeof idxRaw === "number"
            ? idxRaw
            : typeof idxRaw === "string"
              ? Number.parseInt(idxRaw, 10)
              : raCase.steps.findIndex((s) => s.id === (location as any).stepId);
        if (!Number.isFinite(stepIndex) || stepIndex < 0 || stepIndex >= raCase.steps.length) {
          return res.status(400).json({ error: "Invalid step location" });
        }
        const activityRaw = (data as any).activity;
        const equipmentRaw = (data as any).equipment;
        const substancesRaw = (data as any).substances;
        const descriptionRaw = (data as any).description;

        if (activityRaw !== undefined && typeof activityRaw !== "string") {
          errors.push("data.activity must be a string");
        }
        if (equipmentRaw !== undefined && normalizeStringArray(equipmentRaw) === undefined) {
          errors.push("data.equipment must be an array of strings");
        }
        if (substancesRaw !== undefined && normalizeStringArray(substancesRaw) === undefined) {
          errors.push("data.substances must be an array of strings");
        }
        if (
          descriptionRaw !== undefined &&
          typeof descriptionRaw !== "string" &&
          descriptionRaw !== null
        ) {
          errors.push("data.description must be a string or null");
        }
        if (errors.length) {
          return res.status(400).json({ error: "Invalid step data", details: errors });
        }

        const updatedSteps = reindexSteps(
          raCase.steps.map((step, i) =>
            i === stepIndex
              ? {
                  ...step,
                  activity: typeof activityRaw === "string" ? activityRaw : step.activity,
                  equipment:
                    equipmentRaw !== undefined ? normalizeStringArray(equipmentRaw) ?? step.equipment : step.equipment,
                  substances:
                    substancesRaw !== undefined
                      ? normalizeStringArray(substancesRaw) ?? step.substances
                      : step.substances,
                  description:
                    descriptionRaw !== undefined ? (descriptionRaw as any) : step.description
                }
              : step
          )
        );
        await raService.updateSteps(caseId, updatedSteps);
      } else if (intent === "add" || intent === "insert") {
        const insertAfter = (location as any).insertAfter;
        let insertIndex = raCase.steps.length;
        if (insertAfter !== undefined) {
          const foundIndex = raCase.steps.findIndex((s) => s.id === insertAfter);
          if (foundIndex < 0) {
            return res.status(400).json({ error: "insertAfter does not match any stepId" });
          }
          insertIndex = foundIndex + 1;
        }

        const activityRaw = (data as any).activity;
        const equipmentRaw = (data as any).equipment;
        const substancesRaw = (data as any).substances;
        const descriptionRaw = (data as any).description;

        if (activityRaw !== undefined && typeof activityRaw !== "string") {
          errors.push("data.activity must be a string");
        }
        if (equipmentRaw !== undefined && normalizeStringArray(equipmentRaw) === undefined) {
          errors.push("data.equipment must be an array of strings");
        }
        if (substancesRaw !== undefined && normalizeStringArray(substancesRaw) === undefined) {
          errors.push("data.substances must be an array of strings");
        }
        if (
          descriptionRaw !== undefined &&
          typeof descriptionRaw !== "string" &&
          descriptionRaw !== null
        ) {
          errors.push("data.description must be a string or null");
        }
        if (errors.length) {
          return res.status(400).json({ error: "Invalid step data", details: errors });
        }

        const newStep = {
          activity: typeof activityRaw === "string" ? activityRaw : "New step",
          equipment: equipmentRaw !== undefined ? normalizeStringArray(equipmentRaw) ?? [] : [],
          substances: substancesRaw !== undefined ? normalizeStringArray(substancesRaw) ?? [] : [],
          description: descriptionRaw ?? null,
          orderIndex: insertIndex
        };
        const updatedSteps = reindexSteps([
          ...raCase.steps.slice(0, insertIndex),
          newStep,
          ...raCase.steps.slice(insertIndex)
        ]);
        await raService.updateSteps(caseId, updatedSteps);
      } else if (intent === "delete") {
        const idxRaw = (location as any).stepIndex;
        const removeIndex =
          typeof idxRaw === "number"
            ? idxRaw
            : typeof idxRaw === "string"
              ? Number.parseInt(idxRaw, 10)
              : raCase.steps.findIndex((s) => s.id === (location as any).stepId);
        if (!Number.isFinite(removeIndex) || removeIndex < 0 || removeIndex >= raCase.steps.length) {
          return res.status(400).json({ error: "Invalid step location" });
        }
        const updatedSteps = reindexSteps(raCase.steps.filter((_, idx) => idx !== removeIndex));
        await raService.updateSteps(caseId, updatedSteps);
      }
    } else if (target === "hazard") {
      const hazardId = (location as any).hazardId;
      if ((intent === "modify" || intent === "delete") && typeof hazardId !== "string") {
        return res.status(400).json({ error: "hazardId is required for this intent" });
      }
      if ((intent === "modify" || intent === "delete") && typeof hazardId === "string") {
        const exists = raCase.hazards.some((h) => h.id === hazardId);
        if (!exists) {
          return res.status(400).json({ error: "Invalid hazardId" });
        }
      }
      if (intent === "modify" && typeof hazardId === "string") {
        const patch: any = {};
        const labelRaw = (data as any).label;
        const descriptionRaw = (data as any).description;
        const categoryRaw = (data as any).categoryCode;
        const existingControlsRaw = (data as any).existingControls;
        const stepIdRaw = (data as any).stepId;

        if (labelRaw !== undefined) {
          if (typeof labelRaw !== "string" || !labelRaw.trim()) {
            errors.push("data.label must be a non-empty string");
          } else {
            patch.label = labelRaw.trim();
          }
        }
        if (descriptionRaw !== undefined) {
          if (typeof descriptionRaw === "string" || descriptionRaw === null) {
            patch.description = typeof descriptionRaw === "string" ? descriptionRaw : null;
          } else {
            errors.push("data.description must be a string or null");
          }
        }
        if (categoryRaw !== undefined) {
          if (categoryRaw === null) {
            patch.categoryCode = null;
          } else if (typeof categoryRaw === "string") {
            const normalizedCategory = normalizeCategoryCode(categoryRaw);
            if (!normalizedCategory) {
              errors.push(`data.categoryCode must be one of ${HAZARD_CATEGORY_CODES.join(", ")}`);
            } else {
              patch.categoryCode = normalizedCategory;
            }
          } else {
            errors.push("data.categoryCode must be a string or null");
          }
        }
        if (existingControlsRaw !== undefined) {
          const normalizedControls = normalizeStringArray(existingControlsRaw);
          if (!normalizedControls) {
            errors.push("data.existingControls must be an array of strings");
          } else {
            patch.existingControls = normalizedControls;
          }
        }
        if (stepIdRaw !== undefined) {
          if (typeof stepIdRaw !== "string" || !stepIdRaw.trim()) {
            errors.push("data.stepId must be a non-empty string");
          } else {
            const stepId = stepIdRaw.trim();
            const validStepIds = new Set(raCase.steps.map((s) => s.id));
            if (!validStepIds.has(stepId)) {
              errors.push("data.stepId must reference an existing step in this case");
            } else {
              patch.stepId = stepId;
            }
          }
        }

        if (errors.length) {
          return res.status(400).json({ error: "Invalid hazard data", details: errors });
        }

        const updatedHazard = await raService.updateHazard(caseId, hazardId, patch);
        if (!updatedHazard) {
          return res.status(404).json({ error: "Not found" });
        }
      } else if (intent === "add") {
        const locationStepId = (location as any).stepId;
        const stepId =
          typeof locationStepId === "string" ? locationStepId : raCase.steps[0]?.id;
        if (!stepId) {
          return res.status(400).json({ error: "Cannot add hazard without a step" });
        }
        if (!raCase.steps.some((s) => s.id === stepId)) {
          return res.status(400).json({ error: "Invalid stepId" });
        }
        const labelRaw = (data as any).label;
        const descriptionRaw = (data as any).description;
        const categoryRaw = (data as any).categoryCode;
        const existingControlsRaw = (data as any).existingControls;

        const label =
          typeof labelRaw === "string" && labelRaw.trim().length > 0 ? labelRaw.trim() : "New hazard";
        if (labelRaw !== undefined && typeof labelRaw !== "string") {
          errors.push("data.label must be a string");
        }
        if (
          descriptionRaw !== undefined &&
          typeof descriptionRaw !== "string" &&
          descriptionRaw !== null
        ) {
          errors.push("data.description must be a string or null");
        }
        let categoryCode: string | null | undefined = undefined;
        if (categoryRaw !== undefined) {
          if (categoryRaw === null) {
            categoryCode = null;
          } else if (typeof categoryRaw === "string") {
            const normalizedCategory = normalizeCategoryCode(categoryRaw);
            if (!normalizedCategory) {
              errors.push(`data.categoryCode must be one of ${HAZARD_CATEGORY_CODES.join(", ")}`);
            } else {
              categoryCode = normalizedCategory;
            }
          } else {
            errors.push("data.categoryCode must be a string or null");
          }
        }
        let existingControls: string[] | undefined = undefined;
        if (existingControlsRaw !== undefined) {
          const normalizedControls = normalizeStringArray(existingControlsRaw);
          if (!normalizedControls) {
            errors.push("data.existingControls must be an array of strings");
          } else {
            existingControls = normalizedControls;
          }
        }
        if (errors.length) {
          return res.status(400).json({ error: "Invalid hazard data", details: errors });
        }

        const createdHazard = await raService.addManualHazard(caseId, {
          stepId,
          label,
          description: typeof descriptionRaw === "string" ? descriptionRaw : undefined,
          categoryCode,
          existingControls
        } as any);
        if (!createdHazard) {
          return res.status(404).json({ error: "Not found" });
        }
      } else if (intent === "delete" && typeof hazardId === "string") {
        const removed = await raService.deleteHazard(caseId, hazardId);
        if (!removed) {
          return res.status(404).json({ error: "Not found" });
        }
      }
    } else if (target === "control") {
      if (intent === "add") {
        const hazardId = (location as any).hazardId ?? raCase.hazards[0]?.id;
        if (typeof hazardId !== "string") {
          return res.status(400).json({ error: "hazardId is required to add a control" });
        }
        if (!raCase.hazards.some((h) => h.id === hazardId)) {
          return res.status(400).json({ error: "Invalid hazardId" });
        }
        const descriptionRaw = (data as any).description;
        const hierarchyRaw = (data as any).hierarchy;
        if (descriptionRaw !== undefined && typeof descriptionRaw !== "string") {
          errors.push("data.description must be a string");
        }
        const hierarchy =
          hierarchyRaw !== undefined ? normalizeHierarchy(hierarchyRaw) : undefined;
        if (hierarchyRaw !== undefined && !hierarchy) {
          errors.push(`data.hierarchy must be one of ${CONTROL_HIERARCHY_LEVELS.join(", ")}`);
        }
        if (errors.length) {
          return res.status(400).json({ error: "Invalid control data", details: errors });
        }
        const updatedCaseForControl = await raService.addProposedControl(caseId, {
          hazardId,
          description: typeof descriptionRaw === "string" ? descriptionRaw : "New control",
          hierarchy
        } as any);
        if (!updatedCaseForControl) {
          return res.status(404).json({ error: "Not found" });
        }
      } else if (intent === "delete") {
        const controlId = (location as any).controlId;
        if (typeof controlId !== "string") {
          return res.status(400).json({ error: "controlId is required to delete a control" });
        }
        const exists = raCase.hazards.some((h) =>
          (h as any).proposedControls?.some((c: any) => c.id === controlId)
        );
        if (!exists) {
          return res.status(400).json({ error: "Invalid controlId" });
        }
        const deleted = await raService.deleteProposedControl(caseId, controlId);
        if (!deleted) {
          return res.status(404).json({ error: "Not found" });
        }
      }
    } else if (target === "action") {
      if (intent === "add") {
        const hazardId = (location as any).hazardId ?? raCase.hazards[0]?.id;
        if (typeof hazardId !== "string") {
          return res.status(400).json({ error: "hazardId is required to add an action" });
        }
        if (!raCase.hazards.some((h) => h.id === hazardId)) {
          return res.status(400).json({ error: "Invalid hazardId" });
        }
        const descriptionRaw = (data as any).description;
        const ownerRaw = (data as any).owner;
        const dueDateRaw = (data as any).dueDate;
        if (descriptionRaw !== undefined && typeof descriptionRaw !== "string") {
          errors.push("data.description must be a string");
        }
        if (ownerRaw !== undefined && typeof ownerRaw !== "string") {
          errors.push("data.owner must be a string");
        }
        if (dueDateRaw !== undefined && typeof dueDateRaw !== "string") {
          errors.push("data.dueDate must be a string");
        }
        if (errors.length) {
          return res.status(400).json({ error: "Invalid action data", details: errors });
        }
        const createdAction = await raService.addAction(caseId, {
          hazardId,
          description: typeof descriptionRaw === "string" ? descriptionRaw : "New action",
          owner: typeof ownerRaw === "string" ? ownerRaw : undefined,
          dueDate: typeof dueDateRaw === "string" ? dueDateRaw : undefined
        } as any);
        if (!createdAction) {
          return res.status(404).json({ error: "Not found" });
        }
      } else if (intent === "modify") {
        const actionId = (location as any).actionId;
        if (typeof actionId !== "string") {
          return res.status(400).json({ error: "actionId is required to modify an action" });
        }
        if (!raCase.actions.some((a) => a.id === actionId)) {
          return res.status(400).json({ error: "Invalid actionId" });
        }
        const patch: any = {};
        const descriptionRaw = (data as any).description;
        const ownerRaw = (data as any).owner;
        const dueDateRaw = (data as any).dueDate;
        const statusRaw = (data as any).status;
        if (descriptionRaw !== undefined) {
          if (typeof descriptionRaw !== "string") {
            errors.push("data.description must be a string");
          } else {
            patch.description = descriptionRaw;
          }
        }
        if (ownerRaw !== undefined) {
          if (typeof ownerRaw !== "string" && ownerRaw !== null) {
            errors.push("data.owner must be a string or null");
          } else {
            patch.owner = ownerRaw;
          }
        }
        if (dueDateRaw !== undefined) {
          if (typeof dueDateRaw !== "string" && dueDateRaw !== null) {
            errors.push("data.dueDate must be a string or null");
          } else {
            patch.dueDate = dueDateRaw;
	          }
	        }
	        if (statusRaw !== undefined) {
	          const normalizedStatus = normalizeActionStatus(statusRaw);
	          if (!normalizedStatus) {
	            errors.push(`data.status must be one of ${ACTION_STATUSES.join(", ")}`);
	          } else {
	            patch.status = normalizedStatus;
	          }
	        }
	        if (errors.length) {
	          return res.status(400).json({ error: "Invalid action data", details: errors });
	        }
	        const updatedAction = await raService.updateAction(caseId, actionId, patch);
	        if (!updatedAction) {
	          return res.status(404).json({ error: "Not found" });
	        }
	      } else if (intent === "delete") {
	        const actionId = (location as any).actionId;
	        if (typeof actionId !== "string") {
	          return res.status(400).json({ error: "actionId is required to delete an action" });
	        }
	        if (!raCase.actions.some((a) => a.id === actionId)) {
	          return res.status(400).json({ error: "Invalid actionId" });
	        }
	        const removed = await raService.deleteAction(caseId, actionId);
	        if (!removed) {
	          return res.status(404).json({ error: "Not found" });
	        }
	      }
	    } else if (target === "assessment") {
	      const hazardId = (location as any).hazardId ?? raCase.hazards[0]?.id;
	      if (typeof hazardId !== "string") {
	        return res.status(400).json({ error: "hazardId is required to update an assessment" });
	      }
      const requestedType =
        typeof (data as any).assessmentType === "string"
          ? (data as any).assessmentType.toLowerCase()
          : null;
      const isResidual =
        requestedType === "residual" ||
        raCase.phase === "CONTROL_DISCUSSION" ||
        raCase.phase === "ACTIONS";

	      const hazard = raCase.hazards.find((h) => h.id === hazardId);
	      if (!hazard) {
	        return res.status(400).json({ error: "Invalid hazardId" });
	      }
	      const currentSnapshot = isResidual
	        ? hazard.residual
	        : hazard.baseline;

      const severityRaw = (data as any).severity;
      const likelihoodRaw = (data as any).likelihood;
      const severity =
        severityRaw !== undefined ? normalizeSeverity(severityRaw) : currentSnapshot?.severity;
      const likelihood =
        likelihoodRaw !== undefined ? normalizeLikelihood(likelihoodRaw) : currentSnapshot?.likelihood;

      if (severityRaw !== undefined && !severity) {
        errors.push(`data.severity must be one of ${SEVERITY_LEVELS.join(", ")}`);
      }
      if (likelihoodRaw !== undefined && !likelihood) {
        errors.push(`data.likelihood must be one of ${LIKELIHOOD_LEVELS.join(", ")}`);
      }
      if (!severity || !likelihood) {
        errors.push("severity and likelihood are required");
      }
      if (errors.length) {
        return res.status(400).json({ error: "Invalid assessment data", details: errors });
      }

      if (!severity || !likelihood) {
        return res
          .status(400)
          .json({ error: "Invalid assessment data", details: ["severity and likelihood are required"] });
      }

	      if (isResidual) {
	        const updatedRatings = await raService.setResidualRiskRatings(caseId, [{ hazardId, severity, likelihood }]);
	        if (!updatedRatings) {
	          return res.status(404).json({ error: "Not found" });
	        }
	      } else {
	        const updatedRatings = await raService.setHazardRiskRatings(caseId, [{ hazardId, severity, likelihood }]);
	        if (!updatedRatings) {
	          return res.status(404).json({ error: "Not found" });
	        }
	      }
    }

    // Return updated case
    const updatedCase = await raService.getCaseById(caseId);
    res.json(updatedCase);
  } catch (error) {
    console.error("[raCasesRouter] applyContextualUpdate", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default raCasesRouter;
