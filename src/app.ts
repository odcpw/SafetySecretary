import express from "express";
import cors from "cors";
import raCasesRouter from "./routes/raCasesRouter";
import jhaCasesRouter from "./routes/jhaCasesRouter";
import incidentCasesRouter from "./routes/incidentCasesRouter";
import llmJobsRouter from "./routes/llmJobsRouter";
import attachmentsRouter from "./routes/attachmentsRouter";
import incidentAttachmentsRouter from "./routes/incidentAttachmentsRouter";
import jhaAttachmentsRouter from "./routes/jhaAttachmentsRouter";
import authRouter from "./routes/authRouter";
import demoRouter from "./routes/demoRouter";
import adminAuthRouter from "./routes/adminAuthRouter";
import adminRouter from "./routes/adminRouter";
import { requireOrgSession } from "./middleware/sessionAuth";
import { attachTenantServices } from "./middleware/tenantContext";
import { requireOrgRole } from "./middleware/roleAuth";
import { csrfProtection } from "./middleware/csrfProtection";
import { env } from "./config/env";
import { tenantErrorHandler } from "./middleware/tenantErrorHandler";

export const createApp = () => {
  const app = express();

  const normalizeOrigin = (origin: string) => origin.replace(/\/$/, "");
  const allowedOrigins = new Set(env.allowedOrigins.map(normalizeOrigin));
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) {
          return callback(null, false);
        }
        if (allowedOrigins.size === 0) {
          return callback(null, false);
        }
        return callback(null, allowedOrigins.has(normalizeOrigin(origin)));
      },
      credentials: true
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(csrfProtection);

  app.get("/healthz", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRouter);
  app.use("/api/demo", requireOrgSession, requireOrgRole(["OWNER", "ADMIN"]), demoRouter);
  app.use("/api/admin/auth", adminAuthRouter);
  app.use("/api/admin", adminRouter);
  app.use(
    "/api/ra-cases/:id/attachments",
    requireOrgSession,
    requireOrgRole(["OWNER", "ADMIN"]),
    attachTenantServices,
    attachmentsRouter
  );
  app.use(
    "/api/ra-cases",
    requireOrgSession,
    requireOrgRole(["OWNER", "ADMIN"]),
    attachTenantServices,
    raCasesRouter
  );
  app.use(
    "/api/incident-cases/:id/attachments",
    requireOrgSession,
    requireOrgRole(["OWNER", "ADMIN"]),
    attachTenantServices,
    incidentAttachmentsRouter
  );
  app.use(
    "/api/incident-cases",
    requireOrgSession,
    requireOrgRole(["OWNER", "ADMIN"]),
    attachTenantServices,
    incidentCasesRouter
  );
  app.use(
    "/api/jha-cases/:id/attachments",
    requireOrgSession,
    requireOrgRole(["OWNER", "ADMIN"]),
    attachTenantServices,
    jhaAttachmentsRouter
  );
  app.use(
    "/api/jha-cases",
    requireOrgSession,
    requireOrgRole(["OWNER", "ADMIN"]),
    attachTenantServices,
    jhaCasesRouter
  );
  app.use("/api/llm-jobs", requireOrgSession, llmJobsRouter);

  app.use(tenantErrorHandler);

  return app;
};
