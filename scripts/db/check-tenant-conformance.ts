import process from "node:process";
import { PrismaClient } from "@prisma/client";

type Issue = {
  details?: unknown;
  message: string;
  severity: "error" | "warning";
  scope: string;
};

type SchemaTableCount = {
  schema: string;
  tables: number;
};

type TableNameRow = {
  tableName: string;
};

type IndexNameRow = {
  indexName: string;
  tableName: string;
};

type RoleGrantRow = {
  privilegeType: string;
  tableName: string;
};

type DuplicateCaseNumberRow = {
  caseNumber: string;
  count: number;
};

const tenantSchemaPattern = /^tenant_[0-9a-f_]{36}$/;
const appLoginRolePattern = /^[a-z_][a-z0-9_]{0,62}$/;

const expectedSharedTables = [
  "invitations",
  "magic_link_request_limits",
  "magic_link_tokens",
  "oauth_identities",
  "raw_sql_migrations",
  "sessions",
  "tenant_domains",
  "tenant_memberships",
  "tenants",
  "user_acknowledgements",
  "users",
].sort();

const expectedTenantTables = [
  "action_attachment",
  "action_item",
  "approval_snapshot",
  "chemical_control",
  "chemical_profile",
  "cost_ledger_entry",
  "finding",
  "generated_artifact",
  "incident_account",
  "incident_attachment",
  "incident_case",
  "incident_cause_action",
  "incident_cause_node",
  "incident_coach_feedback",
  "incident_coach_message",
  "incident_deviation",
  "incident_fact",
  "incident_person",
  "incident_personal_event",
  "incident_timeline_event",
  "incident_timeline_source",
  "vision_call_audit",
].sort();

const requiredTenantIndexes = new Map<string, string[]>([
  [
    "action_item",
    [
      "action_item_origin_idx",
      "action_item_pkey",
      "action_item_status_idx",
    ],
  ],
  [
    "incident_case",
    [
      "incident_case_case_number_key",
      "incident_case_created_by_idx",
      "incident_case_pkey",
      "incident_case_workflow_stage_idx",
    ],
  ],
  [
    "incident_coach_feedback",
    [
      "incident_coach_feedback_case_updated_idx",
      "incident_coach_feedback_case_user_key",
      "incident_coach_feedback_pkey",
    ],
  ],
  [
    "incident_coach_message",
    ["incident_coach_message_case_created_idx", "incident_coach_message_pkey"],
  ],
]);

async function main(argv: string[]): Promise<void> {
  const json = argv.includes("--json");
  const prisma = new PrismaClient();

  try {
    const report = await checkConformance(prisma);
    if (json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printTextReport(report);
    }

    if (report.issues.some((issue) => issue.severity === "error")) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function checkConformance(prisma: PrismaClient): Promise<{
  issues: Issue[];
  sharedTables: string[];
  tenantSchemas: SchemaTableCount[];
}> {
  const issues: Issue[] = [];
  const sharedTables = await tableNames(prisma, "shared");
  compareSet({
    actual: sharedTables,
    expected: expectedSharedTables,
    issues,
    label: "shared tables",
    scope: "shared",
    severity: "error",
  });

  const tenantSchemas = await prisma.$queryRaw<SchemaTableCount[]>`
    SELECT n.nspname AS schema, count(c.oid)::int AS tables
    FROM pg_catalog.pg_namespace n
    LEFT JOIN pg_catalog.pg_class c
      ON c.relnamespace = n.oid AND c.relkind IN ('r', 'p')
    WHERE n.nspname ~ '^tenant_[0-9a-f_]{36}$'
    GROUP BY n.nspname
    ORDER BY n.nspname
  `;

  if (tenantSchemas.length === 0) {
    issues.push({
      message: "No tenant schemas found; tenant conformance could not be exercised.",
      scope: "tenant",
      severity: "warning",
    });
  }

  for (const tenant of tenantSchemas) {
    assertTenantSchemaName(tenant.schema);
    const tables = await tableNames(prisma, tenant.schema);
    compareSet({
      actual: tables,
      expected: expectedTenantTables,
      issues,
      label: "tenant tables",
      scope: tenant.schema,
      severity: "error",
    });

    const tableSet = new Set(tables);
    await checkTenantIndexes(prisma, tenant.schema, tableSet, issues);
    await checkDuplicateCaseNumbers(prisma, tenant.schema, tableSet, issues);
    await checkTenantRoleDmlGrants(prisma, tenant.schema, tableSet, issues);
  }

  await checkAppLoginRoleDirectTenantGrants(prisma, tenantSchemas, issues);

  const unvalidatedForeignKeys = await prisma.$queryRaw<
    Array<{ constraintName: string; schema: string; tableName: string }>
  >`
    SELECT
      connamespace::regnamespace::text AS schema,
      conrelid::regclass::text AS "tableName",
      conname AS "constraintName"
    FROM pg_catalog.pg_constraint
    WHERE contype = 'f'
      AND connamespace::regnamespace::text ~ '^tenant_[0-9a-f_]{36}$'
      AND NOT convalidated
    ORDER BY 1, 2, 3
  `;
  if (unvalidatedForeignKeys.length > 0) {
    issues.push({
      details: unvalidatedForeignKeys,
      message: "Tenant foreign keys must be validated.",
      scope: "tenant",
      severity: "error",
    });
  }

  return { issues, sharedTables, tenantSchemas };
}

async function tableNames(
  prisma: PrismaClient,
  schema: string,
): Promise<string[]> {
  const rows = await prisma.$queryRaw<TableNameRow[]>`
    SELECT table_name AS "tableName"
    FROM information_schema.tables
    WHERE table_schema = ${schema}
      AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `;
  return rows.map((row) => row.tableName).sort();
}

async function indexNames(
  prisma: PrismaClient,
  schema: string,
): Promise<IndexNameRow[]> {
  const rows = await prisma.$queryRaw<IndexNameRow[]>`
    SELECT tablename AS "tableName", indexname AS "indexName"
    FROM pg_catalog.pg_indexes
    WHERE schemaname = ${schema}
    ORDER BY tablename, indexname
  `;
  return rows;
}

async function duplicateCaseNumbersForTenant(
  prisma: PrismaClient,
  schema: string,
): Promise<DuplicateCaseNumberRow[]> {
  assertTenantSchemaName(schema);
  return prisma.$queryRawUnsafe<DuplicateCaseNumberRow[]>(
    `SELECT case_number AS "caseNumber", count(*)::int AS count
     FROM ${quoteIdent(schema)}.incident_case
     WHERE case_number IS NOT NULL
     GROUP BY case_number
     HAVING count(*) > 1
     ORDER BY case_number`,
  );
}

async function checkTenantIndexes(
  prisma: PrismaClient,
  schema: string,
  tableSet: Set<string>,
  issues: Issue[],
): Promise<void> {
  const indexes = await indexNames(prisma, schema);
  for (const [tableName, requiredIndexes] of requiredTenantIndexes) {
    if (!tableSet.has(tableName)) {
      continue;
    }
    const tableIndexes = indexes
      .filter((index) => index.tableName === tableName)
      .map((index) => index.indexName);
    compareSet({
      actual: tableIndexes,
      expected: requiredIndexes,
      issues,
      label: `${tableName} required indexes`,
      scope: schema,
      severity: "error",
      strict: false,
    });
  }
}

async function checkDuplicateCaseNumbers(
  prisma: PrismaClient,
  schema: string,
  tableSet: Set<string>,
  issues: Issue[],
): Promise<void> {
  if (!tableSet.has("incident_case")) {
    return;
  }

  const duplicateCaseNumbers = await duplicateCaseNumbersForTenant(prisma, schema);
  if (duplicateCaseNumbers.length > 0) {
    issues.push({
      details: duplicateCaseNumbers,
      message: "Incident case numbers must be unique within each tenant.",
      scope: schema,
      severity: "error",
    });
  }
}

async function checkAppLoginRoleDirectTenantGrants(
  prisma: PrismaClient,
  tenantSchemas: SchemaTableCount[],
  issues: Issue[],
): Promise<void> {
  const appLoginRole = configuredAppLoginRole();
  if (!(await roleExists(prisma, appLoginRole))) {
    issues.push({
      message: `App login role ${appLoginRole} does not exist; direct tenant grant checks were skipped.`,
      scope: "shared",
      severity: "warning",
    });
    return;
  }

  for (const tenant of tenantSchemas) {
    const grants = await directDmlGrants(prisma, tenant.schema, appLoginRole);
    if (grants.length > 0) {
      issues.push({
        details: grants,
        message:
          "App login role must not have direct tenant table DML grants; access should flow through SET ROLE.",
        scope: tenant.schema,
        severity: "error",
      });
    }
  }
}

async function checkTenantRoleDmlGrants(
  prisma: PrismaClient,
  schema: string,
  tableSet: Set<string>,
  issues: Issue[],
): Promise<void> {
  const tenantRole = roleNameFromTenantSchema(schema);
  const grants = await directDmlGrants(prisma, schema, tenantRole);
  const granted = new Set(
    grants.map((grant) => `${grant.tableName}:${grant.privilegeType}`),
  );

  for (const tableName of ["incident_case", "action_item"]) {
    if (!tableSet.has(tableName)) {
      continue;
    }
    for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      if (!granted.has(`${tableName}:${privilege}`)) {
        issues.push({
          details: { missing: { privilege, tableName, tenantRole } },
          message:
            "Tenant role must have direct DML grants on tenant application tables.",
          scope: schema,
          severity: "error",
        });
      }
    }
  }
}

async function directDmlGrants(
  prisma: PrismaClient,
  schema: string,
  grantee: string,
): Promise<RoleGrantRow[]> {
  return prisma.$queryRaw<RoleGrantRow[]>`
    SELECT table_name AS "tableName", privilege_type AS "privilegeType"
    FROM information_schema.role_table_grants
    WHERE table_schema = ${schema}
      AND grantee = ${grantee}
      AND privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    ORDER BY table_name, privilege_type
  `;
}

async function roleExists(
  prisma: PrismaClient,
  roleName: string,
): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_roles
      WHERE rolname = ${roleName}
    ) AS exists
  `;
  return rows[0]?.exists ?? false;
}

function compareSet(input: {
  actual: string[];
  expected: string[];
  issues: Issue[];
  label: string;
  scope: string;
  severity: "error" | "warning";
  strict?: boolean;
}): void {
  const actual = new Set(input.actual);
  const expected = new Set(input.expected);
  const missing = input.expected.filter((item) => !actual.has(item));
  const extra =
    input.strict === false
      ? []
      : input.actual.filter((item) => !expected.has(item));

  if (missing.length > 0) {
    input.issues.push({
      details: { missing },
      message: `Missing ${input.label}.`,
      scope: input.scope,
      severity: input.severity,
    });
  }

  if (extra.length > 0) {
    input.issues.push({
      details: { extra },
      message: `Unexpected ${input.label}.`,
      scope: input.scope,
      severity: input.severity,
    });
  }
}

function printTextReport(report: {
  issues: Issue[];
  sharedTables: string[];
  tenantSchemas: SchemaTableCount[];
}): void {
  console.log(
    `DB conformance: shared tables=${report.sharedTables.length}, tenant schemas=${report.tenantSchemas.length}`,
  );

  if (report.issues.length === 0) {
    console.log("DB conformance: ok");
    return;
  }

  for (const issue of report.issues) {
    console.log(
      `${issue.severity.toUpperCase()} [${issue.scope}] ${issue.message}`,
    );
    if (issue.details) {
      console.log(JSON.stringify(issue.details, null, 2));
    }
  }
}

function assertTenantSchemaName(schema: string): void {
  if (!tenantSchemaPattern.test(schema)) {
    throw new Error(`Invalid tenant schema name: ${schema}`);
  }
}

function roleNameFromTenantSchema(schema: string): string {
  assertTenantSchemaName(schema);
  return `role_${schema}`;
}

function configuredAppLoginRole(): string {
  const roleName =
    process.env.SAFETY_SECRETARY_APP_LOGIN_ROLE ??
    process.env.DATABASE_APP_LOGIN_ROLE ??
    "safety_secretary_app";

  if (!appLoginRolePattern.test(roleName)) {
    throw new Error(`Invalid app login role name: ${roleName}`);
  }

  return roleName;
}

function quoteIdent(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
