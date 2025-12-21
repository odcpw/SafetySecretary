import { Router, Request, Response } from "express";
import { demoConfig, env } from "../config/env";
import { isSupportedLocale } from "../config/locales";
import { RegistryService, normalizeOrgSlug } from "../services/registryService";
import { hashPassword, verifyPassword } from "../services/passwordHasher";
import { buildCookieOptions, clearCookieOptions, requireOrgSession, sessionTtlMs } from "../middleware/sessionAuth";
import { AppLocals } from "../types/app";
import { randomBytes } from "crypto";
import type { Organization, OrgUser } from "../../prisma/generated/registry";

const authRouter = Router();

const getRegistry = (req: Request): RegistryService => (req.app.locals as AppLocals).registryService;

const getRequestMeta = (req: Request) => ({
  ipAddress: req.ip ?? null,
  userAgent: req.headers["user-agent"] ?? null
});

authRouter.post("/login", async (req: Request, res: Response) => {
  const { orgSlug, username, password, rememberMe } = req.body ?? {};
  if (typeof orgSlug !== "string" || typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "orgSlug, username, and password are required" });
  }

  const registry = getRegistry(req);
  const normalizedSlug = normalizeOrgSlug(orgSlug);
  const normalizedUsername = username.trim();
  const meta = getRequestMeta(req);

  if (!normalizedSlug) {
    await registry.recordLoginAttempt({
      orgSlug,
      username: normalizedUsername,
      success: false,
      failureReason: "invalid_org_slug",
      ...meta
    });
    return res.status(400).json({ error: "Organization slug is invalid" });
  }

  const org = await registry.getOrganizationBySlug(normalizedSlug);
  if (!org || org.status !== "ACTIVE") {
    await registry.recordLoginAttempt({
      orgId: org?.id ?? null,
      orgSlug: normalizedSlug,
      username: normalizedUsername,
      success: false,
      failureReason: "org_not_found",
      ...meta
    });
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const user = await registry.getOrgUserByUsername(org.id, normalizedUsername);
  if (!user) {
    await registry.recordLoginAttempt({
      orgId: org.id,
      orgSlug: normalizedSlug,
      username: normalizedUsername,
      success: false,
      failureReason: "user_not_found",
      ...meta
    });
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const now = Date.now();
  if (user.status === "LOCKED") {
    if (user.lockedUntil && user.lockedUntil.getTime() > now) {
      return res.status(423).json({
        error: "Account locked",
        remainingAttempts: 0,
        lockedUntil: user.lockedUntil.toISOString()
      });
    }
    await registry.updateOrgUser(user.id, {
      status: "ACTIVE",
      failedAttempts: 0,
      lockedUntil: null
    });
  }

  if (user.status !== "ACTIVE") {
    return res.status(403).json({ error: "Account unavailable" });
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    const failedAttempts = user.failedAttempts + 1;
    const remaining = Math.max(0, 5 - failedAttempts);
    const lockedUntil = failedAttempts >= 5 ? new Date(now + 15 * 60 * 1000) : null;
    await registry.updateOrgUser(user.id, {
      failedAttempts,
      lockedUntil,
      status: lockedUntil ? "LOCKED" : user.status,
      lastFailedAt: new Date(now)
    });
    await registry.recordLoginAttempt({
      orgId: org.id,
      orgSlug: normalizedSlug,
      orgUserId: user.id,
      username: normalizedUsername,
      success: false,
      failureReason: lockedUntil ? "locked_out" : "invalid_password",
      ...meta
    });
    return res.status(401).json({
      error: "Invalid credentials",
      remainingAttempts: remaining,
      lockedUntil: lockedUntil ? lockedUntil.toISOString() : null
    });
  }

  await registry.deleteOrgSessionsForUser(user.id);

  const expiresAt = new Date(now + sessionTtlMs(Boolean(rememberMe)));
  const session = await registry.createOrgSession({
    orgUserId: user.id,
    orgId: org.id,
    expiresAt,
    rememberMe: Boolean(rememberMe),
    ...meta
  });

  await registry.updateOrgUser(user.id, {
    failedAttempts: 0,
    lockedUntil: null,
    status: "ACTIVE",
    lastLoginAt: new Date(now)
  });

  await registry.recordLoginAttempt({
    orgId: org.id,
    orgSlug: normalizedSlug,
    orgUserId: user.id,
    username: normalizedUsername,
    success: true,
    ...meta
  });

  res.cookie(env.sessionCookieName, session.id, buildCookieOptions(expiresAt.getTime() - now));

  return res.json({
    org: { id: org.id, name: org.name, slug: org.slug },
    user: { id: user.id, username: user.username, email: user.email, role: user.role, locale: user.locale },
    session: { expiresAt: expiresAt.toISOString() }
  });
});

authRouter.post("/demo-login", async (req: Request, res: Response) => {
  if (!demoConfig.enabled) {
    return res.status(403).json({ error: "Demo login is disabled" });
  }

  const registry = getRegistry(req);
  const meta = getRequestMeta(req);
  const now = Date.now();
  const normalizedSlug = demoConfig.orgSlug ? normalizeOrgSlug(demoConfig.orgSlug) : null;

  if (!normalizedSlug || !demoConfig.orgName || !demoConfig.dbUrl || !demoConfig.storageRoot) {
    return res.status(500).json({ error: "Demo login is misconfigured" });
  }

  let org = await registry.getOrganizationBySlug(normalizedSlug);
  if (!org) {
    org = await registry.createOrganization({
      slug: normalizedSlug,
      name: demoConfig.orgName,
      dbConnectionString: demoConfig.dbUrl,
      storageRoot: demoConfig.storageRoot
    });
  } else {
    const updates: Partial<Organization> = {};
    if (org.name !== demoConfig.orgName) {
      updates.name = demoConfig.orgName;
    }
    if (org.dbConnectionString !== demoConfig.dbUrl) {
      updates.dbConnectionString = demoConfig.dbUrl;
    }
    if (org.storageRoot !== demoConfig.storageRoot) {
      updates.storageRoot = demoConfig.storageRoot;
    }
    if (org.status !== "ACTIVE") {
      updates.status = "ACTIVE";
    }
    if (Object.keys(updates).length > 0) {
      org = await registry.updateOrganization(org.id, updates);
    }
  }

  if (!demoConfig.userUsername || !demoConfig.userEmail) {
    return res.status(500).json({ error: "Demo login is misconfigured" });
  }

  let user = await registry.getOrgUserByUsername(org.id, demoConfig.userUsername);
  if (!user) {
    const passwordSeed = randomBytes(32).toString("base64");
    const passwordHash = await hashPassword(passwordSeed);
    user = await registry.createOrgUser({
      orgId: org.id,
      username: demoConfig.userUsername,
      email: demoConfig.userEmail,
      passwordHash,
      role: "OWNER"
    });
  } else {
    const updates: Partial<OrgUser> = {};
    if (user.email !== demoConfig.userEmail) {
      updates.email = demoConfig.userEmail;
    }
    if (user.role !== "OWNER") {
      updates.role = "OWNER";
    }
    if (user.status !== "ACTIVE") {
      updates.status = "ACTIVE";
      updates.failedAttempts = 0;
      updates.lockedUntil = null;
    }
    if (Object.keys(updates).length > 0) {
      user = await registry.updateOrgUser(user.id, updates);
    }
  }

  await registry.deleteOrgSessionsForUser(user.id);

  const expiresAt = new Date(now + sessionTtlMs(true));
  const session = await registry.createOrgSession({
    orgUserId: user.id,
    orgId: org.id,
    expiresAt,
    rememberMe: true,
    ...meta
  });

  await registry.updateOrgUser(user.id, {
    failedAttempts: 0,
    lockedUntil: null,
    status: "ACTIVE",
    lastLoginAt: new Date(now)
  });

  await registry.recordLoginAttempt({
    orgId: org.id,
    orgSlug: normalizedSlug,
    orgUserId: user.id,
    username: user.username,
    success: true,
    failureReason: "demo_login",
    ...meta
  });

  res.cookie(env.sessionCookieName, session.id, buildCookieOptions(expiresAt.getTime() - now));

  return res.json({
    org: { id: org.id, name: org.name, slug: org.slug },
    user: { id: user.id, username: user.username, email: user.email, role: user.role, locale: user.locale },
    session: { expiresAt: expiresAt.toISOString() }
  });
});

authRouter.post("/logout", requireOrgSession, async (req: Request, res: Response) => {
  const registry = getRegistry(req);
  if (req.authSessionId) {
    await registry.deleteOrgSession(req.authSessionId);
  }
  res.clearCookie(env.sessionCookieName, clearCookieOptions());
  return res.status(204).send();
});

authRouter.get("/me", requireOrgSession, (req: Request, res: Response) => {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }
  return res.json({ user: req.auth });
});

authRouter.patch("/me/locale", requireOrgSession, async (req: Request, res: Response) => {
  if (!req.auth) {
    return res.status(401).json({ error: "Authentication required" });
  }
  const { locale } = req.body ?? {};
  if (typeof locale !== "string" || !isSupportedLocale(locale)) {
    return res.status(400).json({ error: "locale must be one of en, fr, de" });
  }
  const registry = getRegistry(req);
  await registry.updateOrgUser(req.auth.userId, { locale });
  req.auth.locale = locale;
  return res.json({ locale });
});

export default authRouter;
