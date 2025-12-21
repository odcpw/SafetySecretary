import type { NextFunction, Request, Response } from "express";
import { AppLocals } from "../types/app";

export const attachTenantServices = (req: Request, res: Response, next: NextFunction) => {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (!req.auth.dbConnectionString) {
    return res.status(503).json({
      error: "Service temporarily unavailable for your organization.",
      code: "TENANT_UNAVAILABLE"
    });
  }
  const { tenantServiceFactory } = req.app.locals as AppLocals;
  req.tenantServices = tenantServiceFactory.getServices(req.auth.dbConnectionString);
  return next();
};
