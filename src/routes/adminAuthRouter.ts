import { Router, Request, Response } from "express";
import { env } from "../config/env";
import { RegistryService } from "../services/registryService";
import { verifyPassword } from "../services/passwordHasher";
import { buildCookieOptions, clearCookieOptions, requirePlatformAdmin } from "../middleware/sessionAuth";
import { AppLocals } from "../types/app";

const adminAuthRouter = Router();

const getRegistry = (req: Request): RegistryService => (req.app.locals as AppLocals).registryService;

const getRequestMeta = (req: Request) => ({
  ipAddress: req.ip,
  userAgent: req.headers["user-agent"] ?? null
});

adminAuthRouter.post("/login", async (req: Request, res: Response) => {
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "username and password are required" });
  }

  const registry = getRegistry(req);
  const admin = await registry.getPlatformAdminByUsername(username.trim());
  if (!admin || admin.status !== "ACTIVE") {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const isValid = await verifyPassword(password, admin.passwordHash);
  if (!isValid) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  await registry.deletePlatformSessionsForAdmin(admin.id);

  const now = Date.now();
  const expiresAt = new Date(now + env.sessionTtlHours * 60 * 60 * 1000);
  const session = await registry.createPlatformSession({
    adminId: admin.id,
    expiresAt,
    ...getRequestMeta(req)
  });

  await registry.updatePlatformAdmin(admin.id, { lastLoginAt: new Date(now) });

  res.cookie(env.adminSessionCookieName, session.id, buildCookieOptions(expiresAt.getTime() - now));

  return res.json({
    admin: { id: admin.id, username: admin.username, email: admin.email },
    session: { expiresAt: expiresAt.toISOString() }
  });
});

adminAuthRouter.post("/logout", requirePlatformAdmin, async (req: Request, res: Response) => {
  const registry = getRegistry(req);
  if (req.platformSessionId) {
    await registry.deletePlatformSession(req.platformSessionId);
  }
  res.clearCookie(env.adminSessionCookieName, clearCookieOptions());
  return res.status(204).send();
});

adminAuthRouter.get("/me", requirePlatformAdmin, (req: Request, res: Response) => {
  if (!req.platformAuth) {
    return res.status(401).json({ error: "Admin authentication required" });
  }
  return res.json({ admin: req.platformAuth });
});

export default adminAuthRouter;
