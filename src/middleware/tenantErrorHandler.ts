import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";

const CONNECTION_ERROR_CODES = new Set(["P1000", "P1001", "P1002", "P1003", "P1017"]);

const isTenantConnectionError = (error: unknown) => {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return true;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return CONNECTION_ERROR_CODES.has(error.code);
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    return true;
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes("database") && message.includes("connect");
  }
  return false;
};

export const tenantErrorHandler = (error: unknown, req: Request, res: Response, next: NextFunction) => {
  if (req.auth && isTenantConnectionError(error)) {
    return res.status(503).json({
      error: "Service temporarily unavailable for your organization.",
      code: "TENANT_UNAVAILABLE"
    });
  }
  return next(error);
};
