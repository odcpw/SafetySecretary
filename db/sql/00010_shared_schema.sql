-- ADR-0001 shared-schema bootstrap. This file is intentionally idempotent:
-- Prisma owns the table definitions, while raw SQL owns role/bootstrap pieces.

CREATE EXTENSION IF NOT EXISTS "citext";
CREATE SCHEMA IF NOT EXISTS "shared";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'migration_role'
  ) THEN
    CREATE ROLE migration_role NOLOGIN;
  END IF;
END
$$;

COMMENT ON ROLE migration_role IS
  'Migration scripts run under a migration-only role with CREATE / ALTER on all tenant schemas but no DML — it can change structure but cannot read or write tenant data.';

GRANT USAGE, CREATE ON SCHEMA "shared" TO migration_role;

REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "shared" FROM migration_role;
REVOKE USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA "shared" FROM migration_role;

DO $$
DECLARE
  tenant_schema name;
BEGIN
  FOR tenant_schema IN
    SELECT nspname
    FROM pg_catalog.pg_namespace
    WHERE left(nspname, 7) = 'tenant_'
  LOOP
    EXECUTE format('GRANT USAGE, CREATE ON SCHEMA %I TO migration_role', tenant_schema);
    EXECUTE format('REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I FROM migration_role', tenant_schema);
    EXECUTE format('REVOKE USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA %I FROM migration_role', tenant_schema);
  END LOOP;
END
$$;
