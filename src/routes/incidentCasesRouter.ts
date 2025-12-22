import type { Request, Response } from "express";
import type { Prisma } from "@prisma/client";
import express from "express";
import { AppLocals } from "../types/app";
import type { CreateIncidentCaseInput } from "../types/incident";
import { IncidentActionType, IncidentTimelineConfidence, IncidentType } from "../types/incident";

export const incidentCasesRouter = express.Router();

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

const INCIDENT_TYPES = new Set(Object.values(IncidentType) as IncidentType[]);
const CONFIDENCE_LEVELS = new Set(Object.values(IncidentTimelineConfidence) as IncidentTimelineConfidence[]);
const ACTION_TYPES = new Set(Object.values(IncidentActionType) as IncidentActionType[]);

const normalizeIncidentType = (value: unknown): IncidentType | undefined => {
  const normalized = typeof value === "string" ? value.trim().toUpperCase().replace(/\s+/g, "_") : "";
  return INCIDENT_TYPES.has(normalized as IncidentType)
    ? (normalized as IncidentType)
    : undefined;
};

const normalizeConfidence = (value: unknown): IncidentTimelineConfidence | undefined => {
  const normalized = typeof value === "string" ? value.trim().toUpperCase().replace(/\s+/g, "_") : "";
  return CONFIDENCE_LEVELS.has(normalized as IncidentTimelineConfidence)
    ? (normalized as IncidentTimelineConfidence)
    : undefined;
};

const normalizeActionType = (value: unknown): IncidentActionType | undefined => {
  const normalized = typeof value === "string" ? value.trim().toUpperCase().replace(/\s+/g, "_") : "";
  return ACTION_TYPES.has(normalized as IncidentActionType)
    ? (normalized as IncidentActionType)
    : undefined;
};

incidentCasesRouter.get("/", async (req: Request, res: Response) => {
  try {
    const { createdBy, limit } = req.query as { createdBy?: string; limit?: string };
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    const normalizedCreatedBy =
      typeof createdBy === "string" && createdBy.trim().length > 0 ? createdBy.trim() : null;
    const listParams: { createdBy?: string | null; limit?: number } = {};
    if (normalizedCreatedBy) {
      listParams.createdBy = normalizedCreatedBy;
    }
    if (!Number.isNaN(parsedLimit ?? NaN) && typeof parsedLimit === "number") {
      listParams.limit = parsedLimit;
    }
    const { incidentService } = getTenantServices(req);
    const cases = await incidentService.listCases(listParams);
    res.json({ cases });
  } catch (error) {
    console.error("[incidentCasesRouter] listCases", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

incidentCasesRouter.post("/", async (req: Request, res: Response) => {
  try {
    const { title, incidentAt, incidentTimeNote, location, incidentType, coordinatorRole, coordinatorName, workflowStage } =
      req.body;
    if (!title || typeof title !== "string") {
      return res.status(400).json({ error: "title is required" });
    }
    const normalizedType = normalizeIncidentType(incidentType);
    if (!normalizedType) {
      return res.status(400).json({ error: "incidentType is required" });
    }
    if (!coordinatorRole || typeof coordinatorRole !== "string") {
      return res.status(400).json({ error: "coordinatorRole is required" });
    }

    const { incidentService } = getTenantServices(req);
    const createPayload: CreateIncidentCaseInput = {
      title,
      incidentAt,
      incidentTimeNote,
      location,
      incidentType: normalizedType,
      coordinatorRole,
      coordinatorName
    };
    if (typeof workflowStage === "string") {
      createPayload.workflowStage = workflowStage;
    }
    const incidentCase = await incidentService.createCase(createPayload);
    res.status(201).json(incidentCase);
  } catch (error) {
    console.error("[incidentCasesRouter] createCase", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

incidentCasesRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) return;

    const { incidentService } = getTenantServices(req);
    const incidentCase = await incidentService.getCaseById(caseId);
    if (!incidentCase) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(incidentCase);
  } catch (error) {
    console.error("[incidentCasesRouter] getCase", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

incidentCasesRouter.patch("/:id", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) return;

    const patch = typeof req.body === "object" && req.body ? req.body : {};
    const normalizedType = patch.incidentType ? normalizeIncidentType(patch.incidentType) : undefined;
    if (patch.incidentType && !normalizedType) {
      return res.status(400).json({ error: "incidentType must be valid" });
    }

    const { incidentService } = getTenantServices(req);
    const updateInput: Partial<CreateIncidentCaseInput> = {};
    if (patch.title !== undefined) {
      updateInput.title = patch.title;
    }
    if (patch.incidentAt !== undefined) {
      updateInput.incidentAt = patch.incidentAt;
    }
    if (patch.incidentTimeNote !== undefined) {
      updateInput.incidentTimeNote = patch.incidentTimeNote;
    }
    if (patch.location !== undefined) {
      updateInput.location = patch.location;
    }
    if (normalizedType !== undefined) {
      updateInput.incidentType = normalizedType;
    }
    if (patch.coordinatorRole !== undefined) {
      updateInput.coordinatorRole = patch.coordinatorRole;
    }
    if (patch.coordinatorName !== undefined) {
      updateInput.coordinatorName = patch.coordinatorName;
    }
    if (patch.workflowStage !== undefined) {
      updateInput.workflowStage = patch.workflowStage;
    }
    const updated = await incidentService.updateCaseMeta(caseId, updateInput);
    if (!updated) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(updated);
  } catch (error) {
    console.error("[incidentCasesRouter] updateCase", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

incidentCasesRouter.delete("/:id", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) return;

    const { incidentService } = getTenantServices(req);
    const deleted = await incidentService.deleteCase(caseId);
    if (!deleted) {
      return res.status(404).json({ error: "Not found" });
    }
    res.status(204).send();
  } catch (error) {
    console.error("[incidentCasesRouter] deleteCase", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

incidentCasesRouter.post("/:id/persons", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) return;

    const { role, name, otherInfo } = req.body ?? {};
    if (!role || typeof role !== "string") {
      return res.status(400).json({ error: "role is required" });
    }

    const { incidentService } = getTenantServices(req);
    const created = await incidentService.addPerson(caseId, { role, name, otherInfo });
    if (!created) {
      return res.status(404).json({ error: "Not found" });
    }
    res.status(201).json(created);
  } catch (error) {
    console.error("[incidentCasesRouter] addPerson", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

incidentCasesRouter.put("/:id/persons/:personId", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) return;
    const personId = requireParam(req, res, "personId");
    if (!personId) return;

    const { role, name, otherInfo } = req.body ?? {};
    if (!role || typeof role !== "string") {
      return res.status(400).json({ error: "role is required" });
    }

    const { incidentService } = getTenantServices(req);
    const updated = await incidentService.updatePerson(caseId, personId, { role, name, otherInfo });
    if (!updated) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(updated);
  } catch (error) {
    console.error("[incidentCasesRouter] updatePerson", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

incidentCasesRouter.post("/:id/accounts", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) return;

    const { personId, rawStatement } = req.body ?? {};
    if (!personId || typeof personId !== "string") {
      return res.status(400).json({ error: "personId is required" });
    }

    const { incidentService } = getTenantServices(req);
    const created = await incidentService.addAccount(caseId, personId, rawStatement);
    if (!created) {
      return res.status(404).json({ error: "Not found" });
    }
    res.status(201).json(created);
  } catch (error) {
    console.error("[incidentCasesRouter] addAccount", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

incidentCasesRouter.put("/:id/accounts/:accountId", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) return;
    const accountId = requireParam(req, res, "accountId");
    if (!accountId) return;

    const { rawStatement } = req.body ?? {};

    const { incidentService } = getTenantServices(req);
    const updated = await incidentService.updateAccount(caseId, accountId, rawStatement);
    if (!updated) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(updated);
  } catch (error) {
    console.error("[incidentCasesRouter] updateAccount", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

incidentCasesRouter.put("/:id/accounts/:accountId/personal-events", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) return;
    const accountId = requireParam(req, res, "accountId");
    if (!accountId) return;

    const { events } = req.body ?? {};
    if (!Array.isArray(events)) {
      return res.status(400).json({ error: "events must be an array" });
    }

    const normalized = events
      .map((event: any, index: number) => {
        if (typeof event?.text !== "string") return null;
        return {
          id: typeof event.id === "string" ? event.id : undefined,
          accountId,
          orderIndex: typeof event.orderIndex === "number" ? event.orderIndex : index,
          eventAt: typeof event.eventAt === "string" ? event.eventAt : null,
          timeLabel: typeof event.timeLabel === "string" ? event.timeLabel : null,
          text: event.text
        };
      })
      .filter(Boolean);

    if (normalized.length !== events.length) {
      return res.status(400).json({ error: "events contain invalid entries" });
    }

    const { incidentService } = getTenantServices(req);
    const ok = await incidentService.replaceAccountPersonalEvents(caseId, accountId, normalized as any);
    if (!ok) {
      return res.status(404).json({ error: "Not found" });
    }
    const updated = await incidentService.getCaseById(caseId);
    if (!updated) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(updated);
  } catch (error) {
    console.error("[incidentCasesRouter] update personal events", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

incidentCasesRouter.post("/:id/accounts/:accountId/extract", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) return;
    const accountId = requireParam(req, res, "accountId");
    if (!accountId) return;

    const { statement } = req.body ?? {};
    if (!statement || typeof statement !== "string") {
      return res.status(400).json({ error: "statement is required" });
    }

    const { incidentService } = getTenantServices(req);
    const llmJobManager = getLlmJobManager(req);
    const tenantDbUrl = requireTenantDbUrl(req, res);
    if (!tenantDbUrl) {
      return;
    }
    await incidentService.updateAccount(caseId, accountId, statement);
    const job = llmJobManager.enqueueIncidentWitnessExtraction({
      caseId,
      accountId,
      statement,
      tenantDbUrl
    });
    res.status(202).json(job);
  } catch (error) {
    console.error("[incidentCasesRouter] extract account", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

incidentCasesRouter.post("/:id/narrative/extract", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) return;

    const { narrative } = req.body ?? {};
    if (!narrative || typeof narrative !== "string") {
      return res.status(400).json({ error: "narrative is required" });
    }

    const { incidentService } = getTenantServices(req);
    const llmJobManager = getLlmJobManager(req);
    const tenantDbUrl = requireTenantDbUrl(req, res);
    if (!tenantDbUrl) {
      return;
    }

    const updated = await incidentService.updateAssistantDraft(caseId, { narrative });
    if (!updated) {
      return res.status(404).json({ error: "Not found" });
    }

    const job = llmJobManager.enqueueIncidentNarrativeExtraction({
      caseId,
      narrative,
      tenantDbUrl
    });
    res.status(202).json(job);
  } catch (error) {
    console.error("[incidentCasesRouter] extract narrative", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

incidentCasesRouter.post("/:id/assistant/facts", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) return;

    const { narrative } = req.body ?? {};
    if (!narrative || typeof narrative !== "string") {
      return res.status(400).json({ error: "narrative is required" });
    }

    const llmJobManager = getLlmJobManager(req);
    const tenantDbUrl = requireTenantDbUrl(req, res);
    if (!tenantDbUrl) {
      return;
    }

    const job = llmJobManager.enqueueIncidentFacts({
      caseId,
      narrative,
      tenantDbUrl
    });
    res.status(202).json(job);
  } catch (error) {
    console.error("[incidentCasesRouter] assistant facts", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

incidentCasesRouter.post("/:id/assistant/causes", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) return;

    const llmJobManager = getLlmJobManager(req);
    const tenantDbUrl = requireTenantDbUrl(req, res);
    if (!tenantDbUrl) {
      return;
    }

    const job = llmJobManager.enqueueIncidentCauseCoaching({ caseId, tenantDbUrl });
    res.status(202).json(job);
  } catch (error) {
    console.error("[incidentCasesRouter] assistant causes", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

incidentCasesRouter.post("/:id/assistant/root-causes", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) return;

    const { causeNodeIds } = req.body ?? {};
    if (causeNodeIds !== undefined && !Array.isArray(causeNodeIds)) {
      return res.status(400).json({ error: "causeNodeIds must be an array" });
    }
    let normalizedIds: string[] | null = null;
    if (Array.isArray(causeNodeIds)) {
      normalizedIds = causeNodeIds.filter((id: unknown): id is string => typeof id === "string");
      if (normalizedIds.length !== causeNodeIds.length) {
        return res.status(400).json({ error: "causeNodeIds must contain strings" });
      }
    }

    const llmJobManager = getLlmJobManager(req);
    const tenantDbUrl = requireTenantDbUrl(req, res);
    if (!tenantDbUrl) {
      return;
    }

    const job = llmJobManager.enqueueIncidentRootCauseCoaching({
      caseId,
      tenantDbUrl,
      ...(normalizedIds ? { causeNodeIds: normalizedIds } : {})
    });
    res.status(202).json(job);
  } catch (error) {
    console.error("[incidentCasesRouter] assistant root causes", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

incidentCasesRouter.post("/:id/assistant/actions", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) return;

    const { causeNodeIds } = req.body ?? {};
    if (causeNodeIds !== undefined && !Array.isArray(causeNodeIds)) {
      return res.status(400).json({ error: "causeNodeIds must be an array" });
    }
    let normalizedIds: string[] | null = null;
    if (Array.isArray(causeNodeIds)) {
      normalizedIds = causeNodeIds.filter((id: unknown): id is string => typeof id === "string");
      if (normalizedIds.length !== causeNodeIds.length) {
        return res.status(400).json({ error: "causeNodeIds must contain strings" });
      }
    }

    const llmJobManager = getLlmJobManager(req);
    const tenantDbUrl = requireTenantDbUrl(req, res);
    if (!tenantDbUrl) {
      return;
    }

    const job = llmJobManager.enqueueIncidentActionCoaching({
      caseId,
      tenantDbUrl,
      ...(normalizedIds ? { causeNodeIds: normalizedIds } : {})
    });
    res.status(202).json(job);
  } catch (error) {
    console.error("[incidentCasesRouter] assistant actions", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

incidentCasesRouter.post("/:id/timeline/merge", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) return;

    const llmJobManager = getLlmJobManager(req);
    const tenantDbUrl = requireTenantDbUrl(req, res);
    if (!tenantDbUrl) {
      return;
    }
    const job = llmJobManager.enqueueIncidentTimelineMerge({ caseId, tenantDbUrl });
    res.status(202).json(job);
  } catch (error) {
    console.error("[incidentCasesRouter] merge timeline", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

incidentCasesRouter.put("/:id/assistant-draft", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) return;

    const { narrative, draft } = req.body ?? {};
    if (draft !== undefined && draft !== null && typeof draft !== "object") {
      return res.status(400).json({ error: "draft must be an object or null" });
    }
    if (narrative !== undefined && narrative !== null && typeof narrative !== "string") {
      return res.status(400).json({ error: "narrative must be a string or null" });
    }

    const { incidentService } = getTenantServices(req);
    const draftInput: { narrative?: string | null; draft?: Prisma.InputJsonValue | null } = {};
    if (narrative !== undefined) {
      draftInput.narrative = narrative;
    }
    if (draft !== undefined) {
      draftInput.draft = draft as Prisma.InputJsonValue | null;
    }
    const updated = await incidentService.updateAssistantDraft(caseId, draftInput);
    if (!updated) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(updated);
  } catch (error) {
    console.error("[incidentCasesRouter] update assistant draft", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

incidentCasesRouter.post("/:id/assistant-draft/apply", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) return;

    const { timeline } = req.body ?? {};
    const { incidentService } = getTenantServices(req);
    const incidentCase = await incidentService.getCaseById(caseId);
    if (!incidentCase) {
      return res.status(404).json({ error: "Not found" });
    }

    const draftTimeline = Array.isArray(timeline)
      ? timeline
      : Array.isArray((incidentCase.assistantDraft as any)?.timeline)
        ? (incidentCase.assistantDraft as any).timeline
        : null;

    if (!draftTimeline) {
      return res.status(400).json({ error: "No assistant timeline available to apply" });
    }

    const normalizedEvents = draftTimeline
      .map((event: any, index: number) => {
        if (typeof event?.text !== "string") return null;
        const confidence = event.confidence ? normalizeConfidence(event.confidence) : undefined;
        if (event.confidence && !confidence) {
          return null;
        }
        return {
          orderIndex: typeof event.orderIndex === "number" ? event.orderIndex : index,
          eventAt: typeof event.eventAt === "string" ? event.eventAt : null,
          timeLabel: typeof event.timeLabel === "string" ? event.timeLabel : null,
          text: event.text,
          confidence: confidence ?? "LIKELY"
        };
      })
      .filter(Boolean);

    if (!normalizedEvents.length) {
      return res.status(400).json({ error: "No valid timeline events to apply" });
    }

    const updated = await incidentService.updateTimelineEvents(caseId, normalizedEvents as any);
    if (!updated) {
      return res.status(404).json({ error: "Not found" });
    }

    res.json(updated);
  } catch (error) {
    console.error("[incidentCasesRouter] apply assistant draft", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

incidentCasesRouter.post("/:id/timeline/check", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) return;

    const llmJobManager = getLlmJobManager(req);
    const tenantDbUrl = requireTenantDbUrl(req, res);
    if (!tenantDbUrl) {
      return;
    }
    const job = llmJobManager.enqueueIncidentConsistencyCheck({ caseId, tenantDbUrl });
    res.status(202).json(job);
  } catch (error) {
    console.error("[incidentCasesRouter] consistency check", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

incidentCasesRouter.put("/:id/timeline", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) return;

    const { events } = req.body ?? {};
    if (!Array.isArray(events)) {
      return res.status(400).json({ error: "events must be an array" });
    }

    const normalizedEvents = events
      .map((event: any, index: number) => {
        if (typeof event?.text !== "string") return null;
        const confidence = event.confidence ? normalizeConfidence(event.confidence) : undefined;
        if (event.confidence && !confidence) {
          return null;
        }
        return {
          id: typeof event.id === "string" ? event.id : undefined,
          orderIndex: typeof event.orderIndex === "number" ? event.orderIndex : index,
          eventAt: typeof event.eventAt === "string" ? event.eventAt : null,
          timeLabel: typeof event.timeLabel === "string" ? event.timeLabel : null,
          text: event.text,
          confidence: confidence
        };
      })
      .filter(Boolean);

    if (normalizedEvents.length !== events.length) {
      return res.status(400).json({ error: "events contain invalid entries" });
    }

    const { incidentService } = getTenantServices(req);
    const updated = await incidentService.updateTimelineEvents(caseId, normalizedEvents as any);
    if (!updated) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(updated);
  } catch (error) {
    console.error("[incidentCasesRouter] update timeline", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

incidentCasesRouter.put("/:id/deviations", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) return;

    const { deviations } = req.body ?? {};
    if (!Array.isArray(deviations)) {
      return res.status(400).json({ error: "deviations must be an array" });
    }

    const normalized = deviations
      .map((item: any, index: number) => {
        if (typeof item !== "object" || !item) return null;
        return {
          id: typeof item.id === "string" ? item.id : undefined,
          timelineEventId: typeof item.timelineEventId === "string" ? item.timelineEventId : null,
          orderIndex: typeof item.orderIndex === "number" ? item.orderIndex : index,
          expected: typeof item.expected === "string" ? item.expected : null,
          actual: typeof item.actual === "string" ? item.actual : null,
          changeObserved: typeof item.changeObserved === "string" ? item.changeObserved : null
        };
      })
      .filter(Boolean);

    if (normalized.length !== deviations.length) {
      return res.status(400).json({ error: "deviations contain invalid entries" });
    }

    const { incidentService } = getTenantServices(req);
    const updated = await incidentService.updateDeviations(caseId, normalized as any);
    if (!updated) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(updated);
  } catch (error) {
    console.error("[incidentCasesRouter] update deviations", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

incidentCasesRouter.put("/:id/causes", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) return;

    const { causes } = req.body ?? {};
    if (!Array.isArray(causes)) {
      return res.status(400).json({ error: "causes must be an array" });
    }

    const normalized = causes
      .map((item: any, index: number) => {
        if (typeof item?.deviationId !== "string" || typeof item?.statement !== "string") {
          return null;
        }
        return {
          id: typeof item.id === "string" ? item.id : undefined,
          deviationId: item.deviationId,
          orderIndex: typeof item.orderIndex === "number" ? item.orderIndex : index,
          statement: item.statement
        };
      })
      .filter(Boolean);

    if (normalized.length !== causes.length) {
      return res.status(400).json({ error: "causes contain invalid entries" });
    }

    const { incidentService } = getTenantServices(req);
    const updated = await incidentService.updateCauses(caseId, normalized as any);
    if (!updated) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(updated);
  } catch (error) {
    console.error("[incidentCasesRouter] update causes", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

incidentCasesRouter.put("/:id/actions", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) return;

    const { actions } = req.body ?? {};
    if (!Array.isArray(actions)) {
      return res.status(400).json({ error: "actions must be an array" });
    }

    const normalized = actions
      .map((item: any, index: number) => {
        if (typeof item?.causeId !== "string" || typeof item?.description !== "string") {
          return null;
        }
        const actionType = item.actionType ? normalizeActionType(item.actionType) : undefined;
        if (item.actionType && !actionType) {
          return null;
        }
        return {
          id: typeof item.id === "string" ? item.id : undefined,
          causeId: item.causeId,
          orderIndex: typeof item.orderIndex === "number" ? item.orderIndex : index,
          description: item.description,
          ownerRole: typeof item.ownerRole === "string" ? item.ownerRole : null,
          dueDate: typeof item.dueDate === "string" ? item.dueDate : null,
          actionType: actionType
        };
      })
      .filter(Boolean);

    if (normalized.length !== actions.length) {
      return res.status(400).json({ error: "actions contain invalid entries" });
    }

    const { incidentService } = getTenantServices(req);
    const updated = await incidentService.updateActions(caseId, normalized as any);
    if (!updated) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(updated);
  } catch (error) {
    console.error("[incidentCasesRouter] update actions", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

incidentCasesRouter.put("/:id/cause-nodes", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) return;

    const { nodes } = req.body ?? {};
    if (!Array.isArray(nodes)) {
      return res.status(400).json({ error: "nodes must be an array" });
    }

    const normalized = nodes
      .map((node: any, index: number) => {
        if (typeof node?.statement !== "string") return null;
        return {
          id: typeof node.id === "string" ? node.id : undefined,
          parentId: typeof node.parentId === "string" ? node.parentId : null,
          timelineEventId: typeof node.timelineEventId === "string" ? node.timelineEventId : null,
          orderIndex: typeof node.orderIndex === "number" ? node.orderIndex : index,
          statement: node.statement,
          question: typeof node.question === "string" ? node.question : null,
          isRootCause: typeof node.isRootCause === "boolean" ? node.isRootCause : false
        };
      })
      .filter(Boolean);

    if (normalized.length !== nodes.length) {
      return res.status(400).json({ error: "nodes contain invalid entries" });
    }

    const { incidentService } = getTenantServices(req);
    const updated = await incidentService.updateCauseNodes(caseId, normalized as any);
    if (!updated) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(updated);
  } catch (error) {
    console.error("[incidentCasesRouter] update cause nodes", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

incidentCasesRouter.put("/:id/cause-actions", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) return;

    const { actions } = req.body ?? {};
    if (!Array.isArray(actions)) {
      return res.status(400).json({ error: "actions must be an array" });
    }

    const normalized = actions
      .map((action: any, index: number) => {
        if (typeof action?.description !== "string" || typeof action?.causeNodeId !== "string") return null;
        const actionType = action.actionType ? normalizeActionType(action.actionType) : undefined;
        if (action.actionType && !actionType) {
          return null;
        }
        return {
          id: typeof action.id === "string" ? action.id : undefined,
          causeNodeId: action.causeNodeId,
          orderIndex: typeof action.orderIndex === "number" ? action.orderIndex : index,
          description: action.description,
          ownerRole: typeof action.ownerRole === "string" ? action.ownerRole : null,
          dueDate: typeof action.dueDate === "string" ? action.dueDate : null,
          actionType: actionType ?? null
        };
      })
      .filter(Boolean);

    if (normalized.length !== actions.length) {
      return res.status(400).json({ error: "actions contain invalid entries" });
    }

    const { incidentService } = getTenantServices(req);
    const updated = await incidentService.updateCauseActions(caseId, normalized as any);
    if (!updated) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(updated);
  } catch (error) {
    console.error("[incidentCasesRouter] update cause actions", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

incidentCasesRouter.get("/:id/export/pdf", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) return;

    const { incidentService } = getTenantServices(req);
    const reportService = getReportService(req);
    const incidentCase = await incidentService.getCaseById(caseId);
    if (!incidentCase) {
      return res.status(404).json({ error: "Not found" });
    }

    const pdfOptions = req.auth?.locale ? { locale: req.auth.locale } : undefined;
    const pdfBuffer = await reportService.generateIncidentPdf(incidentCase, pdfOptions);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="incident-${caseId}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error("[incidentCasesRouter] export pdf", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default incidentCasesRouter;
