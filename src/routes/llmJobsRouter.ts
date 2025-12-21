import { Router, Request, Response } from "express";
import { AppLocals } from "../types/app";

const llmJobsRouter = Router();

const getManager = (req: Request) => (req.app.locals as AppLocals).llmJobManager;

const requireTenantDbUrl = (req: Request, res: Response) => {
  if (!req.auth) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return req.auth.dbConnectionString;
};

llmJobsRouter.get("/:id", (req: Request, res: Response) => {
  const manager = getManager(req);
  const jobId = req.params.id;
  if (!jobId) {
    return res.status(400).json({ error: "id parameter is required" });
  }
  const tenantDbUrl = requireTenantDbUrl(req, res);
  if (!tenantDbUrl) {
    return;
  }
  const job = manager.getJob(jobId, tenantDbUrl);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  return res.json(job);
});

export default llmJobsRouter;
