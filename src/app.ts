import express from "express";
import cors from "cors";
import raCasesRouter from "./routes/raCasesRouter";
import llmJobsRouter from "./routes/llmJobsRouter";

export const createApp = () => {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/healthz", (_req, res) => res.json({ ok: true }));
  app.use("/api/ra-cases", raCasesRouter);
  app.use("/api/llm-jobs", llmJobsRouter);

  return app;
};
