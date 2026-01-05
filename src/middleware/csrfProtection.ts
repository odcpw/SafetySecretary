import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Public auth endpoints that don't have a session yet to protect
const CSRF_EXEMPT_PATHS = new Set(["/api/auth/login", "/api/auth/demo-login"]);

const normalizeOrigin = (origin: string) => origin.replace(/\/$/, "");

const getRequestHost = (req: Request) => req.get("host");

const getRequestOrigin = (req: Request) => {
  const host = getRequestHost(req);
  if (!host) {
    return null;
  }
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protoValue = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  const protocol = (protoValue ?? req.protocol).split(",")[0]?.trim();
  if (!protocol) {
    return null;
  }
  return `${protocol}://${host}`;
};

export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Skip CSRF for public auth endpoints (no session exists yet to protect)
  if (CSRF_EXEMPT_PATHS.has(req.path)) {
    return next();
  }

  const origin = req.headers.origin;
  if (!origin || origin === "null") {
    return next();
  }

  const allowed = new Set(env.allowedOrigins.map(normalizeOrigin));
  if (allowed.size === 0) {
    const requestOrigin = getRequestOrigin(req);
    if (requestOrigin && normalizeOrigin(origin) === normalizeOrigin(requestOrigin)) {
      return next();
    }
  }

  if (!allowed.has(normalizeOrigin(origin))) {
    return res.status(403).json({ error: "Blocked by CSRF protection" });
  }

  return next();
};
