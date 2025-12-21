import type { Request, Response } from "express";
import express from "express";
import { demoConfig } from "../config/env";
import { normalizeOrgSlug } from "../services/registryService";
import { resetDemoData, seedDemoIncident, seedDemoJha, seedDemoRiskAssessment } from "../services/demoSeed";
import { AppLocals } from "../types/app";

const demoRouter = express.Router();

const requireDemoAccess = (req: Request, res: Response): string | null => {
  if (!req.auth) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  if (!demoConfig.enabled) {
    res.status(403).json({ error: "Demo mode is disabled" });
    return null;
  }
  const demoSlug = demoConfig.orgSlug ? normalizeOrgSlug(demoConfig.orgSlug) : null;
  if (!demoSlug || !demoConfig.dbUrl) {
    res.status(500).json({ error: "Demo mode is misconfigured" });
    return null;
  }
  if (req.auth.orgSlug !== demoSlug) {
    res.status(403).json({ error: "Demo reset is only available for the demo organization" });
    return null;
  }
  if (req.auth.dbConnectionString !== demoConfig.dbUrl) {
    res.status(403).json({ error: "Demo reset is only available for the demo database" });
    return null;
  }
  return demoSlug;
};

demoRouter.post("/reset", async (req: Request, res: Response) => {
  try {
    const demoSlug = requireDemoAccess(req, res);
    if (!demoSlug) return;

    const { tenantDbManager, tenantServiceFactory } = req.app.locals as AppLocals;
    const result = await resetDemoData({
      tenantDbManager,
      tenantServiceFactory,
      connectionString: req.auth!.dbConnectionString,
      createdBy: req.auth!.username
    });
    res.json(result);
  } catch (error) {
    console.error("[demoRouter] reset demo data", error);
    res.status(500).json({ error: "Unable to reset demo data" });
  }
});

demoRouter.post("/seed/ra", async (req: Request, res: Response) => {
  try {
    const demoSlug = requireDemoAccess(req, res);
    if (!demoSlug) return;

    const { tenantServiceFactory } = req.app.locals as AppLocals;
    const { raService } = tenantServiceFactory.getServices(req.auth!.dbConnectionString);
    const id = await seedDemoRiskAssessment(raService, req.auth!.username);
    res.json({ id });
  } catch (error) {
    console.error("[demoRouter] seed risk assessment", error);
    res.status(500).json({ error: "Unable to seed demo risk assessment" });
  }
});

demoRouter.post("/seed/jha", async (req: Request, res: Response) => {
  try {
    const demoSlug = requireDemoAccess(req, res);
    if (!demoSlug) return;

    const { tenantServiceFactory } = req.app.locals as AppLocals;
    const { jhaService } = tenantServiceFactory.getServices(req.auth!.dbConnectionString);
    const id = await seedDemoJha(jhaService, req.auth!.username);
    res.json({ id });
  } catch (error) {
    console.error("[demoRouter] seed JHA", error);
    res.status(500).json({ error: "Unable to seed demo JHA" });
  }
});

demoRouter.post("/seed/incident", async (req: Request, res: Response) => {
  try {
    const demoSlug = requireDemoAccess(req, res);
    if (!demoSlug) return;

    const { tenantServiceFactory } = req.app.locals as AppLocals;
    const { incidentService } = tenantServiceFactory.getServices(req.auth!.dbConnectionString);
    const id = await seedDemoIncident(incidentService, req.auth!.username);
    res.json({ id });
  } catch (error) {
    console.error("[demoRouter] seed incident", error);
    res.status(500).json({ error: "Unable to seed demo incident" });
  }
});

export default demoRouter;
