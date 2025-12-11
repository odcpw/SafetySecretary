import type { Request, Response } from "express";
import express from "express";
import { AppLocals } from "../types/app";

export const raCasesRouter = express.Router();

const getServices = (req: Request): AppLocals => req.app.locals as AppLocals;

const requireParam = (req: Request, res: Response, key: string): string | null => {
  const value = (req.params as Record<string, string | undefined>)[key];
  if (!value) {
    res.status(400).json({ error: `${key} parameter is required` });
    return null;
  }
  return value;
};

raCasesRouter.get("/", async (req: Request, res: Response) => {
  try {
    const { createdBy, limit } = req.query as { createdBy?: string; limit?: string };
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    const { raService } = getServices(req);
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

    const { raService } = getServices(req);
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
    const { raService } = getServices(req);
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
    const { raService } = getServices(req);
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
    const { raService } = getServices(req);
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
    const { raService } = getServices(req);
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

    const { raService, llmJobManager } = getServices(req);
    const raCase = await raService.getCaseById(caseId);
    if (!raCase) {
      return res.status(404).json({ error: "Not found" });
    }

    const job = llmJobManager.enqueueStepsExtraction({ caseId, description });
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

    const { raService } = getServices(req);
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

    const { raService, llmJobManager } = getServices(req);
    const raCase = await raService.getCaseById(caseId);
    if (!raCase) {
      return res.status(404).json({ error: "Not found" });
    }

    const job = llmJobManager.enqueueHazardExtraction({ caseId, narrative });
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
    const { raService, llmJobManager } = getServices(req);
    const raCase = await raService.getCaseById(caseId);
    if (!raCase) {
      return res.status(404).json({ error: "Not found" });
    }
    const job = llmJobManager.enqueueControlExtraction({ caseId, notes });
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
    const { raService, llmJobManager } = getServices(req);
    const raCase = await raService.getCaseById(caseId);
    if (!raCase) {
      return res.status(404).json({ error: "Not found" });
    }
    const job = llmJobManager.enqueueActionExtraction({ caseId, notes });
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

    const { raService } = getServices(req);
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

    const { raService } = getServices(req);
    const updated = await raService.updateHazard(caseId, hazardId, req.body);
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

    const { raService } = getServices(req);
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
    if (!Array.isArray(ratings)) {
      return res.status(400).json({ error: "ratings must be an array" });
    }
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }

    const { raService } = getServices(req);
    const updated = await raService.setHazardRiskRatings(caseId, ratings);
    if (!updated) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json({ hazards: updated.hazards });
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

    const { raService } = getServices(req);
    const control = await raService.addProposedControl(caseId, { hazardId, description, hierarchy });
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

    const { raService } = getServices(req);
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
    if (!Array.isArray(ratings)) {
      return res.status(400).json({ error: "ratings must be an array" });
    }
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }

    const { raService } = getServices(req);
    const updated = await raService.setResidualRiskRatings(caseId, ratings);
    if (!updated) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json({ hazards: updated.hazards });
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

    const { raService } = getServices(req);
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

    const { raService } = getServices(req);
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

    const { raService } = getServices(req);
    const updated = await raService.updateAction(caseId, actionId, req.body);
    if (!updated) {
      return res.status(404).json({ error: "Not found" });
    }
    res.json(updated);
  } catch (error) {
    console.error("[raCasesRouter] updateAction", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

raCasesRouter.get("/:id/export/pdf", async (req: Request, res: Response) => {
  try {
    const caseId = requireParam(req, res, "id");
    if (!caseId) {
      return;
    }
    const { raService, reportService } = getServices(req);
    const raCase = await raService.getCaseById(caseId);
    if (!raCase) {
      return res.status(404).json({ error: "Not found" });
    }

    const pdf = await reportService.generatePdfForCase(raCase);
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
    const { raService, reportService } = getServices(req);
    const raCase = await raService.getCaseById(caseId);
    if (!raCase) {
      return res.status(404).json({ error: "Not found" });
    }

    const workbook = await reportService.generateXlsxForCase(raCase);
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

    const { raService, llmService } = getServices(req);
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
        stepIds: h.stepIds
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

    const { raService } = getServices(req);
    const raCase = await raService.getCaseById(caseId);
    if (!raCase) {
      return res.status(404).json({ error: "Not found" });
    }

    // Normalize intent to support synonyms
    const intent = command.intent === "update" ? "modify" : command.intent;
    const { target, location, data } = command;

    const normalizeSeverity = (value: unknown): string | undefined => {
      const normalized = typeof value === "string" ? value.trim().toUpperCase().replace(/\s+/g, "_") : "";
      return ["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(normalized) ? normalized : undefined;
    };
    const normalizeLikelihood = (value: unknown): string | undefined => {
      const normalized = typeof value === "string" ? value.trim().toUpperCase().replace(/\s+/g, "_") : "";
      return ["RARE", "UNLIKELY", "POSSIBLE", "LIKELY", "ALMOST_CERTAIN"].includes(normalized)
        ? normalized
        : undefined;
    };

    const reindexSteps = (steps: typeof raCase.steps) =>
      steps.map((step, index) => ({
        ...step,
        orderIndex: index
      }));

    if (target === "step") {
      if (intent === "modify" && (location?.stepId || location?.stepIndex !== undefined)) {
        // Find the step and update via updateSteps (replaces all steps)
        const stepIndex = location?.stepIndex ?? raCase.steps.findIndex((s) => s.id === location?.stepId);
        if (stepIndex >= 0 && stepIndex < raCase.steps.length) {
          const updatedSteps = reindexSteps(raCase.steps.map((step, i) => {
            if (i === stepIndex) {
              return {
                ...step,
                activity: data.activity ?? step.activity,
                equipment: data.equipment ?? step.equipment,
                substances: data.substances ?? step.substances,
                description: data.description ?? step.description
              };
            }
            return step;
          }));
          await raService.updateSteps(caseId, updatedSteps);
        }
      } else if (intent === "add" || intent === "insert") {
        // Add new step to the end or after specified position
        const insertIndex = location?.insertAfter !== undefined
          ? raCase.steps.findIndex((s) => s.id === location.insertAfter) + 1
          : raCase.steps.length;
        const newStep = {
          activity: data.activity ?? "New step",
          equipment: data.equipment ?? [],
          substances: data.substances ?? [],
          description: data.description ?? null,
          orderIndex: insertIndex
        };
        const updatedSteps = reindexSteps([
          ...raCase.steps.slice(0, insertIndex),
          newStep,
          ...raCase.steps.slice(insertIndex)
        ]);
        await raService.updateSteps(caseId, updatedSteps);
      } else if (intent === "delete" && (location?.stepId || location?.stepIndex !== undefined)) {
        const removeIndex = location?.stepIndex ?? raCase.steps.findIndex((s) => s.id === location?.stepId);
        if (removeIndex >= 0 && removeIndex < raCase.steps.length) {
          const updatedSteps = reindexSteps(raCase.steps.filter((_, idx) => idx !== removeIndex));
          await raService.updateSteps(caseId, updatedSteps);
        }
      }
    } else if (target === "hazard") {
      if (intent === "modify" && location?.hazardId) {
        await raService.updateHazard(caseId, location.hazardId, data);
      } else if (intent === "add") {
        const stepId = location?.stepId ?? raCase.steps[0]?.id;
        if (stepId) {
          await raService.addManualHazard(caseId, {
            stepId,
            label: data.label ?? "New hazard",
            description: data.description,
            categoryCode: data.categoryCode,
            existingControls: data.existingControls
          });
        }
      } else if (intent === "delete" && location?.hazardId) {
        await raService.deleteHazard(caseId, location.hazardId);
      }
    } else if (target === "control") {
      if (intent === "add") {
        const hazardId = location?.hazardId ?? raCase.hazards[0]?.id;
        if (hazardId) {
          await raService.addProposedControl(caseId, {
            hazardId,
            description: data.description ?? "New control",
            hierarchy: data.hierarchy
          });
        }
      } else if (intent === "delete" && location?.controlId) {
        await raService.deleteProposedControl(caseId, location.controlId);
      }
    } else if (target === "action") {
      if (intent === "add") {
        await raService.addAction(caseId, {
          hazardId: location?.hazardId ?? raCase.hazards[0]?.id,
          description: data.description ?? "New action",
          owner: data.owner,
          dueDate: data.dueDate
        });
      } else if (intent === "modify" && location?.actionId) {
        await raService.updateAction(caseId, location.actionId, data);
      } else if (intent === "delete" && location?.actionId) {
        await raService.deleteAction(caseId, location.actionId);
      }
    } else if (target === "assessment") {
      const hazardId = location?.hazardId ?? raCase.hazards[0]?.id;
      const severity = normalizeSeverity((data as any).severity);
      const likelihood = normalizeLikelihood((data as any).likelihood);
      const requestedType = typeof (data as any).assessmentType === "string"
        ? (data as any).assessmentType.toLowerCase()
        : null;
      const isResidual = requestedType === "residual" || raCase.phase === "RESIDUAL_RISK";

      if (hazardId && severity && likelihood) {
        if (isResidual) {
          await raService.setResidualRiskRatings(caseId, [{ hazardId, severity, likelihood }]);
        } else {
          await raService.setHazardRiskRatings(caseId, [{ hazardId, severity, likelihood }]);
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
