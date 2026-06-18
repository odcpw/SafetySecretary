export {
  adminPrisma,
  dropTenantSchema,
  prisma,
  provisionTenantSchema,
  tenantDatabaseNames,
  withSharedConnection,
  withTenantConnection,
} from "./tenancy";
export type { DbExecutor, TenantConnectionClient, TenantDatabaseNames } from "./tenancy";
