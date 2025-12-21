import { Router, Request, Response } from "express";
import { env } from "../config/env";
import { requirePlatformAdmin } from "../middleware/sessionAuth";
import { RegistryService, normalizeOrgSlug } from "../services/registryService";
import { TenantProvisioner } from "../services/tenantProvisioner";
import { hashPassword } from "../services/passwordHasher";
import { AppLocals } from "../types/app";
import type { OrgRole, OrgUser, UserStatus } from "../../prisma/generated/registry";

const adminRouter = Router();

const getRegistry = (req: Request): RegistryService => (req.app.locals as AppLocals).registryService;

adminRouter.post("/bootstrap", async (req: Request, res: Response) => {
  const { token, username, email, password } = req.body ?? {};
  if (!env.adminBootstrapToken) {
    return res.status(400).json({ error: "Bootstrap token not configured" });
  }
  if (token !== env.adminBootstrapToken) {
    return res.status(403).json({ error: "Invalid bootstrap token" });
  }
  if (typeof username !== "string" || typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "username, email, and password are required" });
  }

  const registry = getRegistry(req);
  const existingCount = await registry.countPlatformAdmins();
  if (existingCount > 0) {
    return res.status(409).json({ error: "Platform admin already initialized" });
  }
  const passwordHash = await hashPassword(password);
  const admin = await registry.createPlatformAdmin({
    username: username.trim(),
    email: email.trim(),
    passwordHash
  });
  return res.status(201).json({ id: admin.id, username: admin.username, email: admin.email });
});

adminRouter.get("/orgs", requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const registry = getRegistry(req);
    const orgs = await registry.listOrganizations();
    res.json({ orgs });
  } catch (error) {
    console.error("[adminRouter] list orgs", error);
    res.status(500).json({ error: "Failed to list organizations" });
  }
});

adminRouter.post("/orgs", requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { slug, name, storageRoot, dbConnectionString } = req.body ?? {};
    if (typeof slug !== "string" || typeof name !== "string") {
      return res.status(400).json({ error: "slug and name are required" });
    }
    const normalized = normalizeOrgSlug(slug);
    if (!normalized) {
      return res.status(400).json({ error: "slug is invalid" });
    }

    const provisioner = new TenantProvisioner(getRegistry(req));
    const input = {
      slug: normalized,
      name: name.trim(),
      ...(typeof storageRoot === "string" ? { storageRoot } : {}),
      ...(typeof dbConnectionString === "string" ? { dbConnectionString } : {})
    };
    const result = await provisioner.provisionOrg(input);

    res.status(201).json(result);
  } catch (error) {
    console.error("[adminRouter] provision org", error);
    res.status(500).json({ error: "Failed to provision org" });
  }
});

adminRouter.get("/orgs/:orgId/users", requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    if (!orgId) {
      return res.status(400).json({ error: "orgId is required" });
    }
    const registry = getRegistry(req);
    const org = await registry.getOrganizationById(orgId);
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }
    const users = await registry.listOrgUsers(orgId);
    res.json({ users });
  } catch (error) {
    console.error("[adminRouter] list org users", error);
    res.status(500).json({ error: "Failed to list users" });
  }
});

adminRouter.post("/orgs/:orgId/users", requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const { username, email, password, role } = req.body ?? {};
    if (!orgId) {
      return res.status(400).json({ error: "orgId is required" });
    }
    if (typeof username !== "string" || typeof email !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "username, email, and password are required" });
    }
    const normalizedRole = typeof role === "string" ? role.toUpperCase() : "ADMIN";
    const allowedRoles = ["OWNER", "ADMIN", "MEMBER"];
    if (!allowedRoles.includes(normalizedRole)) {
      return res.status(400).json({ error: "role must be OWNER, ADMIN, or MEMBER" });
    }
    const passwordHash = await hashPassword(password);

    const registry = getRegistry(req);
    const org = await registry.getOrganizationById(orgId);
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }
    const user = await registry.createOrgUser({
      orgId,
      username: username.trim(),
      email: email.trim(),
      passwordHash,
      role: normalizedRole as OrgRole
    });
    res.status(201).json({ id: user.id, username: user.username, email: user.email, role: user.role });
  } catch (error) {
    console.error("[adminRouter] create org user", error);
    res.status(500).json({ error: "Failed to create user" });
  }
});

adminRouter.patch("/orgs/:orgId/users/:userId", requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { orgId, userId } = req.params;
    const { role, status, email, username } = req.body ?? {};
    if (!orgId || !userId) {
      return res.status(400).json({ error: "orgId and userId are required" });
    }
    const registry = getRegistry(req);
    const user = await registry.getOrgUserById(userId);
    if (!user || user.orgId !== orgId) {
      return res.status(404).json({ error: "User not found" });
    }

    const patch: Partial<OrgUser> = {};
    if (typeof role === "string") {
      const normalizedRole = role.toUpperCase();
      if (!["OWNER", "ADMIN", "MEMBER"].includes(normalizedRole)) {
        return res.status(400).json({ error: "role must be OWNER, ADMIN, or MEMBER" });
      }
      patch.role = normalizedRole as OrgRole;
    }
    if (typeof status === "string") {
      const normalizedStatus = status.toUpperCase();
      if (!["ACTIVE", "LOCKED", "DISABLED"].includes(normalizedStatus)) {
        return res.status(400).json({ error: "status must be ACTIVE, LOCKED, or DISABLED" });
      }
      patch.status = normalizedStatus as UserStatus;
    }
    if (typeof email === "string") {
      patch.email = email.trim();
    }
    if (typeof username === "string") {
      patch.username = username.trim();
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({ error: "No updates provided" });
    }

    const updated = await registry.updateOrgUser(userId, patch);
    res.json({ id: updated.id, username: updated.username, email: updated.email, role: updated.role, status: updated.status });
  } catch (error) {
    console.error("[adminRouter] update org user", error);
    res.status(500).json({ error: "Failed to update user" });
  }
});

adminRouter.post("/orgs/:orgId/users/:userId/unlock", requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { orgId, userId } = req.params;
    if (!orgId || !userId) {
      return res.status(400).json({ error: "orgId and userId are required" });
    }
    const registry = getRegistry(req);
    const user = await registry.getOrgUserById(userId);
    if (!user || user.orgId !== orgId) {
      return res.status(404).json({ error: "User not found" });
    }
    const updated = await registry.updateOrgUser(userId, {
      status: "ACTIVE",
      failedAttempts: 0,
      lockedUntil: null
    });
    res.json({ id: updated.id, username: updated.username, email: updated.email, status: updated.status });
  } catch (error) {
    console.error("[adminRouter] unlock user", error);
    res.status(500).json({ error: "Failed to unlock user" });
  }
});

adminRouter.post("/orgs/:orgId/users/:userId/revoke-sessions", requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { orgId, userId } = req.params;
    if (!orgId || !userId) {
      return res.status(400).json({ error: "orgId and userId are required" });
    }
    const registry = getRegistry(req);
    const user = await registry.getOrgUserById(userId);
    if (!user || user.orgId !== orgId) {
      return res.status(404).json({ error: "User not found" });
    }
    const count = await registry.deleteOrgSessionsForUser(userId);
    res.json({ revoked: count });
  } catch (error) {
    console.error("[adminRouter] revoke user sessions", error);
    res.status(500).json({ error: "Failed to revoke sessions" });
  }
});

adminRouter.post("/orgs/:orgId/revoke-sessions", requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    if (!orgId) {
      return res.status(400).json({ error: "orgId is required" });
    }
    const registry = getRegistry(req);
    const org = await registry.getOrganizationById(orgId);
    if (!org) {
      return res.status(404).json({ error: "Organization not found" });
    }
    const count = await registry.deleteOrgSessionsForOrg(orgId);
    res.json({ revoked: count });
  } catch (error) {
    console.error("[adminRouter] revoke org sessions", error);
    res.status(500).json({ error: "Failed to revoke org sessions" });
  }
});

adminRouter.post("/orgs/:orgId/users/:userId/password", requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { orgId, userId } = req.params;
    const { password } = req.body ?? {};
    if (!orgId || !userId || typeof password !== "string") {
      return res.status(400).json({ error: "orgId, userId, and password are required" });
    }
    const registry = getRegistry(req);
    const user = await registry.getOrgUserById(userId);
    if (!user || user.orgId !== orgId) {
      return res.status(404).json({ error: "User not found" });
    }
    const passwordHash = await hashPassword(password);
    const updated = await registry.updateOrgUser(userId, { passwordHash });
    res.json({ id: updated.id, username: updated.username, email: updated.email });
  } catch (error) {
    console.error("[adminRouter] reset password", error);
    res.status(500).json({ error: "Failed to update password" });
  }
});

adminRouter.get("/audit/logins", requirePlatformAdmin, async (req: Request, res: Response) => {
  try {
    const { orgId, limit } = req.query as { orgId?: string; limit?: string };
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    const registry = getRegistry(req);
    const params: { orgId?: string; limit?: number } = {};
    if (typeof orgId === "string" && orgId.trim()) {
      params.orgId = orgId.trim();
    }
    if (typeof parsedLimit === "number" && Number.isFinite(parsedLimit)) {
      params.limit = parsedLimit;
    }
    const entries = await registry.listLoginAudit(params);
    res.json({ entries });
  } catch (error) {
    console.error("[adminRouter] list login audit", error);
    res.status(500).json({ error: "Failed to load audit log" });
  }
});

export default adminRouter;
