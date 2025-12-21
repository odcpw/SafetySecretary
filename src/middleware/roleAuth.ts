import type { NextFunction, Request, Response } from "express";
import type { OrgRole } from "../../prisma/generated/registry";

export const requireOrgRole = (allowed: OrgRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (!allowed.includes(req.auth.orgRole)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    return next();
  };
};
