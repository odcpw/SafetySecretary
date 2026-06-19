import process from "node:process";
import { PrismaClient } from "@prisma/client";

type TenantSchemaRow = {
  schemaName: string;
};

type TenantRow = {
  id: string;
};

type OrphanTenantSchema = {
  schemaName: string;
  tenantId: string;
};

type OrphanTenantRole = {
  roleName: string;
  tenantId: string;
};

type TenantMissingSchema = {
  schemaName: string;
  tenantId: string;
  tenantName: string;
};

type ParsedArgs = {
  confirmDrop?: string;
  drop: boolean;
  forceProduction: boolean;
  json: boolean;
  targetTenantId?: string;
};

const tenantIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const tenantSchemaPattern =
  /^tenant_([0-9a-f]{8})_([0-9a-f]{4})_([0-9a-f]{4})_([0-9a-f]{4})_([0-9a-f]{12})$/;
const tenantRolePattern =
  /^role_tenant_([0-9a-f]{8})_([0-9a-f]{4})_([0-9a-f]{4})_([0-9a-f]{4})_([0-9a-f]{12})$/;

async function main(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  if (args.drop) {
    validateDropRequest(args);
  }

  const prisma = buildAdminPrisma();
  try {
    const orphanSchemas = await orphanTenantSchemas(prisma);
    const orphanRoles = await orphanTenantRoles(prisma);
    const missingSchemas = await tenantsMissingSchemas(prisma);
    const report = {
      drop: args.drop,
      missingSchemas,
      orphanRoles,
      orphanSchemas,
      targetTenantId: args.targetTenantId ?? null,
    };

    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printReport(report);
    }

    if (!args.drop || !args.targetTenantId) {
      return;
    }

    const orphanSchema = orphanSchemas.find(
      (schema) => schema.tenantId === args.targetTenantId,
    );
    const orphanRole = orphanRoles.find(
      (role) => role.tenantId === args.targetTenantId,
    );

    if (!orphanSchema && !orphanRole) {
      throw new Error(
        `Refusing to drop ${args.targetTenantId}: no orphan schema or orphan role matches that tenant id.`,
      );
    }

    if (orphanSchema) {
      await prisma.$executeRaw`
        SELECT "shared"."drop_tenant_schema"(${orphanSchema.tenantId}::uuid)
      `;
      console.log(`Dropped ${orphanSchema.schemaName}`);
    }

    if (orphanRole) {
      assertTenantRoleName(orphanRole.roleName);
      await prisma.$executeRawUnsafe(`DROP ROLE IF EXISTS ${quoteIdent(orphanRole.roleName)}`);
      console.log(`Dropped role ${orphanRole.roleName}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = [...argv];
  const parsed: ParsedArgs = {
    drop: false,
    forceProduction: false,
    json: false,
  };

  while (args.length > 0) {
    const arg = args.shift();

    if (arg === "--") {
      continue;
    }

    if (arg === "--drop") {
      parsed.drop = true;
      continue;
    }

    if (arg === "--json") {
      parsed.json = true;
      continue;
    }

    if (arg === "--force-production") {
      parsed.forceProduction = true;
      continue;
    }

    if (arg === "--tenant-id") {
      parsed.targetTenantId = normalizeTenantId(requireValue(arg, args.shift()));
      continue;
    }

    if (arg === "--schema") {
      parsed.targetTenantId = tenantIdFromSchemaName(requireValue(arg, args.shift()));
      continue;
    }

    if (arg === "--confirm-drop") {
      parsed.confirmDrop = normalizeTenantId(requireValue(arg, args.shift()));
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return parsed;
}

function validateDropRequest(args: ParsedArgs): void {
  if (!args.targetTenantId) {
    throw new Error(
      "Refusing to drop without --tenant-id <uuid> or --schema <tenant_uuid_schema>.",
    );
  }

  if (args.confirmDrop !== args.targetTenantId) {
    throw new Error(
      `Refusing to drop ${args.targetTenantId}: pass --confirm-drop ${args.targetTenantId}.`,
    );
  }

  if (process.env.NODE_ENV !== "development" && !args.forceProduction) {
    throw new Error(
      "Refusing to drop tenant schemas unless NODE_ENV=development or --force-production is set.",
    );
  }
}

async function orphanTenantSchemas(
  prisma: PrismaClient,
): Promise<OrphanTenantSchema[]> {
  const tenantSchemas = await prisma.$queryRaw<TenantSchemaRow[]>`
    SELECT nspname AS "schemaName"
    FROM pg_catalog.pg_namespace
    WHERE nspname ~ '^tenant_[0-9a-f_]{36}$'
    ORDER BY nspname
  `;
  const tenants = await prisma.$queryRaw<TenantRow[]>`
    SELECT id::text AS id
    FROM "shared"."tenants"
  `;
  const tenantIds = new Set(tenants.map((tenant) => tenant.id));

  return tenantSchemas
    .map((row) => ({
      schemaName: row.schemaName,
      tenantId: tenantIdFromSchemaName(row.schemaName),
    }))
    .filter((schema) => !tenantIds.has(schema.tenantId));
}

async function orphanTenantRoles(
  prisma: PrismaClient,
): Promise<OrphanTenantRole[]> {
  const rows = await prisma.$queryRaw<Array<{ roleName: string }>>`
    SELECT rolname AS "roleName"
    FROM pg_catalog.pg_roles
    WHERE rolname ~ '^role_tenant_[0-9a-f_]{36}$'
    ORDER BY rolname
  `;
  const tenantSchemas = await prisma.$queryRaw<TenantSchemaRow[]>`
    SELECT nspname AS "schemaName"
    FROM pg_catalog.pg_namespace
    WHERE nspname ~ '^tenant_[0-9a-f_]{36}$'
  `;
  const tenants = await prisma.$queryRaw<TenantRow[]>`
    SELECT id::text AS id
    FROM "shared"."tenants"
  `;
  const schemaTenantIds = new Set(
    tenantSchemas.map((row) => tenantIdFromSchemaName(row.schemaName)),
  );
  const liveTenantIds = new Set(tenants.map((tenant) => tenant.id));

  return rows
    .map((row) => ({
      roleName: row.roleName,
      tenantId: tenantIdFromRoleName(row.roleName),
    }))
    .filter(
      (role) =>
        !schemaTenantIds.has(role.tenantId) && !liveTenantIds.has(role.tenantId),
    );
}

async function tenantsMissingSchemas(
  prisma: PrismaClient,
): Promise<TenantMissingSchema[]> {
  const tenants = await prisma.$queryRaw<Array<{ id: string; name: string }>>`
    SELECT id::text AS id, name
    FROM "shared"."tenants"
    ORDER BY name, id
  `;
  const tenantSchemas = await prisma.$queryRaw<TenantSchemaRow[]>`
    SELECT nspname AS "schemaName"
    FROM pg_catalog.pg_namespace
    WHERE nspname ~ '^tenant_[0-9a-f_]{36}$'
  `;
  const schemaNames = new Set(tenantSchemas.map((row) => row.schemaName));

  return tenants
    .map((tenant) => ({
      schemaName: schemaNameFromTenantId(tenant.id),
      tenantId: tenant.id,
      tenantName: tenant.name,
    }))
    .filter((tenant) => !schemaNames.has(tenant.schemaName));
}

function printReport(report: {
  missingSchemas: TenantMissingSchema[];
  orphanRoles: OrphanTenantRole[];
  orphanSchemas: OrphanTenantSchema[];
}): void {
  console.log(`Orphan tenant schemas: ${report.orphanSchemas.length}`);
  for (const orphan of report.orphanSchemas) {
    console.log(`- ${orphan.schemaName} (${orphan.tenantId})`);
  }
  console.log(`Orphan tenant roles: ${report.orphanRoles.length}`);
  for (const orphan of report.orphanRoles) {
    console.log(`- ${orphan.roleName} (${orphan.tenantId})`);
  }
  console.log(`Tenants missing schemas: ${report.missingSchemas.length}`);
  for (const missing of report.missingSchemas) {
    console.log(
      `- ${missing.tenantName} (${missing.tenantId}) expected ${missing.schemaName}`,
    );
  }
}

function tenantIdFromSchemaName(schemaName: string): string {
  const match = tenantSchemaPattern.exec(schemaName);
  if (!match) {
    throw new Error(`Invalid tenant schema name: ${schemaName}`);
  }

  return match.slice(1).join("-");
}

function tenantIdFromRoleName(roleName: string): string {
  const match = tenantRolePattern.exec(roleName);
  if (!match) {
    throw new Error(`Invalid tenant role name: ${roleName}`);
  }

  return match.slice(1).join("-");
}

function schemaNameFromTenantId(tenantId: string): string {
  return `tenant_${normalizeTenantId(tenantId).replaceAll("-", "_")}`;
}

function normalizeTenantId(value: string): string {
  const normalized = value.toLowerCase();
  if (!tenantIdPattern.test(normalized)) {
    throw new Error(`Invalid tenant id: ${value}`);
  }
  return normalized;
}

function assertTenantRoleName(roleName: string): void {
  if (!tenantRolePattern.test(roleName)) {
    throw new Error(`Invalid tenant role name: ${roleName}`);
  }
}

function requireValue(flag: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function quoteIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function buildAdminPrisma(): PrismaClient {
  return new PrismaClient({
    datasourceUrl: process.env.ADMIN_DATABASE_URL ?? process.env.DATABASE_URL,
  });
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
