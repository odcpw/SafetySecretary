import type { NextFunction, Request, Response } from "express";
import { demoConfig, env } from "../config/env";
import { AppLocals } from "../types/app";
import { normalizeOrgSlug } from "../services/registryService";

const parseCookies = (header?: string): Record<string, string> => {
  if (!header) return {};
  return header.split(";").reduce<Record<string, string>>((acc, part) => {
    const [key, ...rest] = part.trim().split("=");
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join("="));
    return acc;
  }, {});
};

const getCookie = (req: Request, name: string): string | null => {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[name] ?? null;
};

export const buildCookieOptions = (maxAgeMs: number) => ({
  httpOnly: true,
  sameSite: env.cookieSameSite as "lax" | "strict" | "none",
  secure: env.cookieSecure,
  path: "/",
  maxAge: maxAgeMs
});

export const clearCookieOptions = () => ({
  httpOnly: true,
  sameSite: env.cookieSameSite as "lax" | "strict" | "none",
  secure: env.cookieSecure,
  path: "/",
  maxAge: 0
});

export const sessionTtlMs = (rememberMe: boolean) => {
  if (rememberMe) {
    return env.rememberSessionDays * 24 * 60 * 60 * 1000;
  }
  return env.sessionTtlHours * 60 * 60 * 1000;
};

export const requireOrgSession = async (req: Request, res: Response, next: NextFunction) => {
  const { registryService } = req.app.locals as AppLocals;
  const sessionId = getCookie(req, env.sessionCookieName);
  if (!sessionId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const session = await registryService.getOrgSession(sessionId);
  if (!session) {
    res.clearCookie(env.sessionCookieName, clearCookieOptions());
    return res.status(401).json({ error: "Session expired" });
  }

  const now = Date.now();
  if (session.expiresAt.getTime() <= now) {
    await registryService.deleteOrgSession(session.id);
    res.clearCookie(env.sessionCookieName, clearCookieOptions());
    return res.status(401).json({ error: "Session expired" });
  }

  if (session.user.status !== "ACTIVE") {
    return res.status(403).json({ error: "Account unavailable" });
  }
  if (session.org.status !== "ACTIVE") {
    return res.status(403).json({ error: "Organization unavailable" });
  }

  const ttlMs = sessionTtlMs(session.rememberMe);
  const refreshed = new Date(now + ttlMs);
  await registryService.refreshOrgSession(session.id, refreshed);
  res.cookie(env.sessionCookieName, session.id, buildCookieOptions(ttlMs));
  req.authSessionId = session.id;

  const demoSlug = demoConfig.orgSlug ? normalizeOrgSlug(demoConfig.orgSlug) : null;
  const isDemo = Boolean(demoConfig.enabled && demoSlug && session.org.slug === demoSlug);

  req.auth = {
    orgId: session.org.id,
    orgSlug: session.org.slug,
    orgName: session.org.name,
    orgRole: session.user.role,
    userId: session.user.id,
    username: session.user.username,
    email: session.user.email,
    locale: session.user.locale,
    storageRoot: session.org.storageRoot,
    dbConnectionString: session.org.dbConnectionString,
    encryptionKeyRef: session.org.encryptionKeyRef,
    isDemo
  };

  return next();
};

export const requirePlatformAdmin = async (req: Request, res: Response, next: NextFunction) => {
  const { registryService } = req.app.locals as AppLocals;
  const sessionId = getCookie(req, env.adminSessionCookieName);
  if (!sessionId) {
    return res.status(401).json({ error: "Admin authentication required" });
  }

  const session = await registryService.getPlatformSession(sessionId);
  if (!session) {
    res.clearCookie(env.adminSessionCookieName, clearCookieOptions());
    return res.status(401).json({ error: "Admin session expired" });
  }

  const now = Date.now();
  if (session.expiresAt.getTime() <= now) {
    await registryService.deletePlatformSession(session.id);
    res.clearCookie(env.adminSessionCookieName, clearCookieOptions());
    return res.status(401).json({ error: "Admin session expired" });
  }

  if (session.admin.status !== "ACTIVE") {
    return res.status(403).json({ error: "Admin account disabled" });
  }

  const ttlMs = env.sessionTtlHours * 60 * 60 * 1000;
  const refreshed = new Date(now + ttlMs);
  await registryService.refreshPlatformSession(session.id, refreshed);
  res.cookie(env.adminSessionCookieName, session.id, buildCookieOptions(ttlMs));
  req.platformSessionId = session.id;

  req.platformAuth = {
    adminId: session.admin.id,
    username: session.admin.username,
    email: session.admin.email
  };

  return next();
};
