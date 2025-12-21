import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const normalizeOrigin = (origin: string) => origin.replace(/\/$/, "");

const getRequestHost = (req: Request) => req.get("host");

const getHostname = (value: string) => {
  try {
    return new URL(value).hostname;
  } catch {
    return null;
  }
};

export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const origin = req.headers.origin;
  if (!origin || origin === "null") {
    return next();
  }

  const allowed = new Set(env.allowedOrigins.map(normalizeOrigin));
  if (allowed.size === 0) {
    const requestHost = getRequestHost(req);
    if (requestHost) {
      const requestHostname = requestHost.split(":")[0];
      const originHostname = getHostname(origin);
      if (originHostname && originHostname === requestHostname) {
        return next();
      }
    }
  }

  if (!allowed.has(normalizeOrigin(origin))) {
    return res.status(403).json({ error: "Blocked by CSRF protection" });
  }

  return next();
};
