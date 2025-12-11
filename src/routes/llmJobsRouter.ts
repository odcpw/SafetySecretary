import { Router, Request, Response } from "express";
import { AppLocals } from "../types/app";

const llmJobsRouter = Router();

const getManager = (req: Request) => (req.app.locals as AppLocals).llmJobManager;

llmJobsRouter.get("/:id", (req: Request, res: Response) => {
  const manager = getManager(req);
  const jobId = req.params.id;
  if (!jobId) {
    return res.status(400).json({ error: "id parameter is required" });
  }
  const job = manager.getJob(jobId);
  if (!job) {
    return res.status(404).json({ error: "Job not found" });
  }
  return res.json(job);
});

export default llmJobsRouter;
