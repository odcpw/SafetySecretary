import { type Prisma, PrismaClient } from "@prisma/client";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tenantSuffixPattern = /^[0-9a-f_]{36}$/;
const schemaNamePattern = /^tenant_[0-9a-f_]{36}$/;
const roleNamePattern = /^role_tenant_[0-9a-f_]{36}$/;
const appLoginRolePattern = /^[a-z_][a-z0-9_]{0,62}$/;

const globalForPrisma = globalThis as typeof globalThis & {
  safetySecretaryPrisma?: PrismaClient;
  safetySecretaryAdminPrisma?: PrismaClient;
};

export const prisma = globalForPrisma.safetySecretaryPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.safetySecretaryPrisma = prisma;
}

// Privilege seam (F4-db-privilege-split): tenant DDL — schema/role
// provisioning, schema drops, CREATE ROLE — must be able to run under a
// dedicated high-privilege admin connection that is distinct from the
// request-time application connection. When ADMIN_DATABASE_URL is set we build
// a separate client on that connection string; when it is unset we fall back to
// the shared request connection so existing deploys behave identically. Full
// enforcement (least-privilege app role with no tenant DML / DDL) additionally
// requires running db/sql/00440_tenant_db_roles.sql and granting the role.
function buildAdminPrisma(): PrismaClient {
  const adminDatabaseUrl = process.env.ADMIN_DATABASE_URL?.trim();

  if (!adminDatabaseUrl) {
    return prisma;
  }

  return new PrismaClient({ datasourceUrl: adminDatabaseUrl });
}

export const adminPrisma =
  globalForPrisma.safetySecretaryAdminPrisma ?? buildAdminPrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.safetySecretaryAdminPrisma = adminPrisma;
}

// Resolve which executor a DDL operation should run on. When the admin
// connection is configured (ADMIN_DATABASE_URL set) DDL runs on the admin pool,
// which intentionally steps outside any caller transaction so role/schema
// management is not bound to least-privilege request roles. When it is unset
// (and admin therefore equals the shared client) we keep the caller's executor
// — preserving the current in-transaction behavior exactly.
function tenantDdlExecutor(client: DbExecutor): DbExecutor {
  if (adminPrisma === prisma) {
    return client;
  }

  return adminPrisma;
}

export type TenantConnectionClient = Prisma.TransactionClient;
export type DbExecutor = PrismaClient | Prisma.TransactionClient;

export type TenantDatabaseNames = {
  tenantId: string;
  tenantSuffix: string;
  schemaName: string;
  roleName: string;
};

export type TenantProvisioningOptions = {
  appLoginRole?: string | null;
};

type TenantConnectionCallback<T> = (client: TenantConnectionClient) => Promise<T> | T;

type TenantTransactionOptions = {
  isolationLevel?: Prisma.TransactionIsolationLevel;
  maxWait?: number;
  timeout?: number;
};

export function tenantDatabaseNames(tenantId: string): TenantDatabaseNames {
  if (!uuidPattern.test(tenantId)) {
    throw new Error(`Invalid tenantId: expected canonical UUID, got "${tenantId}"`);
  }

  const normalizedTenantId = tenantId.toLowerCase();
  const tenantSuffix = normalizedTenantId.replaceAll("-", "_");

  if (!tenantSuffixPattern.test(tenantSuffix)) {
    throw new Error(`Invalid tenant identifier suffix derived from tenantId: ${tenantSuffix}`);
  }

  const schemaName = `tenant_${tenantSuffix}`;
  const roleName = `role_tenant_${tenantSuffix}`;

  if (!schemaNamePattern.test(schemaName)) {
    throw new Error(`Invalid tenant schema name derived from tenantId: ${schemaName}`);
  }

  if (!roleNamePattern.test(roleName)) {
    throw new Error(`Invalid tenant role name derived from tenantId: ${roleName}`);
  }

  return {
    tenantId: normalizedTenantId,
    tenantSuffix,
    schemaName,
    roleName,
  };
}

export function validateAppLoginRole(appLoginRole: string): string {
  if (!appLoginRolePattern.test(appLoginRole)) {
    throw new Error(`Invalid app login role name: ${appLoginRole}`);
  }

  return appLoginRole;
}

function configuredAppLoginRole(options?: TenantProvisioningOptions): string | null {
  const appLoginRole =
    options?.appLoginRole ??
    process.env.SAFETY_SECRETARY_APP_LOGIN_ROLE ??
    process.env.DATABASE_APP_LOGIN_ROLE ??
    null;

  if (!appLoginRole) {
    return null;
  }

  return validateAppLoginRole(appLoginRole);
}

export async function provisionTenantSchema(
  tenantId: string,
  client: DbExecutor = adminPrisma,
  options?: TenantProvisioningOptions,
): Promise<TenantDatabaseNames> {
  const names = tenantDatabaseNames(tenantId);
  const appLoginRole = configuredAppLoginRole(options);
  const ddlClient = tenantDdlExecutor(client);

  if (appLoginRole) {
    await ddlClient.$executeRaw`SELECT "shared"."provision_tenant_schema"(${names.tenantId}::uuid, ${appLoginRole}::name)`;
  } else {
    await ddlClient.$executeRaw`SELECT "shared"."provision_tenant_schema"(${names.tenantId}::uuid)`;
  }

  return names;
}

export async function dropTenantSchema(
  tenantId: string,
  client: DbExecutor = adminPrisma,
): Promise<TenantDatabaseNames> {
  const names = tenantDatabaseNames(tenantId);
  const ddlClient = tenantDdlExecutor(client);

  await ddlClient.$executeRaw`SELECT "shared"."drop_tenant_schema"(${names.tenantId}::uuid)`;

  return names;
}

export async function withTenantConnection<T>(
  tenantId: string | null | undefined,
  fn: TenantConnectionCallback<T>,
  options?: TenantTransactionOptions,
): Promise<T> {
  if (!tenantId) {
    return withSharedConnection(fn, options);
  }

  const names = tenantDatabaseNames(tenantId);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE ${names.roleName}`);
    await tx.$executeRawUnsafe(`SET LOCAL search_path = ${names.schemaName}, shared`);

    return fn(tx);
  }, options);
}

export async function withSharedConnection<T>(
  fn: TenantConnectionCallback<T>,
  options?: TenantTransactionOptions,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL ROLE NONE");
    await tx.$executeRawUnsafe("SET LOCAL search_path = shared");

    return fn(tx);
  }, options);
}
