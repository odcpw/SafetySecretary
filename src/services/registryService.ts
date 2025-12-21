import registryClient from "./registryClient";
import { randomBytes } from "crypto";
import type {
  AdminStatus,
  LoginAudit,
  Organization,
  OrgRole,
  OrgSession,
  OrgUser,
  PlatformAdmin,
  PlatformSession
} from "../../prisma/generated/registry";

const ORG_SLUG_REGEX = /^[a-z][a-z0-9-]{1,30}[a-z0-9]$/;

export const normalizeOrgSlug = (value: string): string | null => {
  const normalized = value.trim().toLowerCase();
  if (!ORG_SLUG_REGEX.test(normalized)) {
    return null;
  }
  return normalized;
};

export class RegistryService {
  constructor(private readonly db = registryClient) {}

  async connect(): Promise<void> {
    await this.db.$connect();
  }

  async disconnect(): Promise<void> {
    await this.db.$disconnect();
  }

  async getOrganizationBySlug(slug: string): Promise<Organization | null> {
    return this.db.organization.findUnique({ where: { slug } });
  }

  async getOrganizationById(id: string): Promise<Organization | null> {
    return this.db.organization.findUnique({ where: { id } });
  }

  async createOrganization(input: {
    slug: string;
    name: string;
    dbConnectionString: string;
    storageRoot: string;
    encryptionKeyRef?: string | null;
  }): Promise<Organization> {
    return this.db.organization.create({
      data: {
        slug: input.slug,
        name: input.name,
        dbConnectionString: input.dbConnectionString,
        storageRoot: input.storageRoot,
        encryptionKeyRef: input.encryptionKeyRef ?? null
      }
    });
  }

  async updateOrganization(orgId: string, patch: Partial<Organization>): Promise<Organization> {
    return this.db.organization.update({
      where: { id: orgId },
      data: patch
    });
  }

  async listOrganizations(): Promise<Organization[]> {
    return this.db.organization.findMany({ orderBy: { createdAt: "desc" } });
  }

  async createOrgUser(input: {
    orgId: string;
    username: string;
    email: string;
    passwordHash: string;
    role: OrgRole;
  }): Promise<OrgUser> {
    return this.db.orgUser.create({
      data: {
        orgId: input.orgId,
        username: input.username,
        email: input.email,
        passwordHash: input.passwordHash,
        role: input.role
      }
    });
  }

  async listOrgUsers(orgId: string): Promise<OrgUser[]> {
    return this.db.orgUser.findMany({ where: { orgId }, orderBy: { createdAt: "asc" } });
  }

  async updateOrgUser(userId: string, patch: Partial<OrgUser>): Promise<OrgUser> {
    return this.db.orgUser.update({
      where: { id: userId },
      data: patch
    });
  }

  async getOrgUserByUsername(orgId: string, username: string): Promise<OrgUser | null> {
    return this.db.orgUser.findFirst({
      where: { orgId, username }
    });
  }

  async getOrgUserById(userId: string): Promise<OrgUser | null> {
    return this.db.orgUser.findUnique({ where: { id: userId } });
  }

  async createOrgSession(input: {
    orgUserId: string;
    orgId: string;
    expiresAt: Date;
    rememberMe: boolean;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<OrgSession> {
    return this.db.orgSession.create({
      data: {
        orgUserId: input.orgUserId,
        orgId: input.orgId,
        expiresAt: input.expiresAt,
        rememberMe: input.rememberMe,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null
      }
    });
  }

  async getOrgSession(sessionId: string): Promise<(OrgSession & { user: OrgUser; org: Organization }) | null> {
    return this.db.orgSession.findUnique({
      where: { id: sessionId },
      include: { user: true, org: true }
    });
  }

  async refreshOrgSession(sessionId: string, expiresAt: Date): Promise<void> {
    await this.db.orgSession.update({
      where: { id: sessionId },
      data: { expiresAt, lastSeenAt: new Date() }
    });
  }

  async deleteOrgSession(sessionId: string): Promise<void> {
    await this.db.orgSession.delete({ where: { id: sessionId } });
  }

  async deleteOrgSessionsForUser(userId: string): Promise<number> {
    const result = await this.db.orgSession.deleteMany({ where: { orgUserId: userId } });
    return result.count;
  }

  async deleteOrgSessionsForOrg(orgId: string): Promise<number> {
    const result = await this.db.orgSession.deleteMany({ where: { orgId } });
    return result.count;
  }

  async recordLoginAttempt(input: {
    orgId?: string | null;
    orgSlug?: string | null;
    orgUserId?: string | null;
    username?: string | null;
    success: boolean;
    failureReason?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    await this.db.loginAudit.create({
      data: {
        orgId: input.orgId ?? null,
        orgSlug: input.orgSlug ?? null,
        orgUserId: input.orgUserId ?? null,
        username: input.username ?? null,
        success: input.success,
        failureReason: input.failureReason ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null
      }
    });
  }

  async listLoginAudit(input?: { orgId?: string; limit?: number }): Promise<LoginAudit[]> {
    const limit = input?.limit && input.limit > 0 ? Math.min(input.limit, 200) : 50;
    return this.db.loginAudit.findMany({
      ...(input?.orgId ? { where: { orgId: input.orgId } } : {}),
      orderBy: { createdAt: "desc" },
      take: limit
    });
  }

  async ensureOrgEncryptionKey(orgId: string): Promise<string> {
    const org = await this.db.organization.findUnique({ where: { id: orgId } });
    if (!org) {
      throw new Error("Organization not found");
    }
    if (org.encryptionKeyRef) {
      return org.encryptionKeyRef;
    }
    const key = randomBytes(32).toString("base64");
    const updated = await this.db.organization.update({
      where: { id: orgId },
      data: { encryptionKeyRef: key }
    });
    return updated.encryptionKeyRef ?? key;
  }

  async createPlatformAdmin(input: {
    username: string;
    email: string;
    passwordHash: string;
  }): Promise<PlatformAdmin> {
    return this.db.platformAdmin.create({
      data: {
        username: input.username,
        email: input.email,
        passwordHash: input.passwordHash
      }
    });
  }

  async countPlatformAdmins(): Promise<number> {
    return this.db.platformAdmin.count();
  }

  async getPlatformAdminByUsername(username: string): Promise<PlatformAdmin | null> {
    return this.db.platformAdmin.findUnique({ where: { username } });
  }

  async updatePlatformAdmin(adminId: string, patch: Partial<PlatformAdmin>): Promise<PlatformAdmin> {
    return this.db.platformAdmin.update({ where: { id: adminId }, data: patch });
  }

  async createPlatformSession(input: {
    adminId: string;
    expiresAt: Date;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<PlatformSession> {
    return this.db.platformSession.create({
      data: {
        adminId: input.adminId,
        expiresAt: input.expiresAt,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null
      }
    });
  }

  async getPlatformSession(sessionId: string): Promise<(PlatformSession & { admin: PlatformAdmin }) | null> {
    return this.db.platformSession.findUnique({
      where: { id: sessionId },
      include: { admin: true }
    });
  }

  async refreshPlatformSession(sessionId: string, expiresAt: Date): Promise<void> {
    await this.db.platformSession.update({
      where: { id: sessionId },
      data: { expiresAt, lastSeenAt: new Date() }
    });
  }

  async deletePlatformSession(sessionId: string): Promise<void> {
    await this.db.platformSession.delete({ where: { id: sessionId } });
  }

  async deletePlatformSessionsForAdmin(adminId: string): Promise<number> {
    const result = await this.db.platformSession.deleteMany({ where: { adminId } });
    return result.count;
  }

  async disablePlatformAdmin(adminId: string): Promise<void> {
    await this.db.platformAdmin.update({
      where: { id: adminId },
      data: { status: "DISABLED" as AdminStatus }
    });
  }
}
