-- ssfw-kxh: approval_snapshot storage contract for every provisioned tenant
-- schema. Workflow case-table FKs and the final one-of-three CHECK are
-- intentionally deferred to per-workflow snap-FK beads.

CREATE OR REPLACE FUNCTION "shared"."apply_approval_snapshot_schema"(tenant_schema name)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  tenant_role name := ('role_' || tenant_schema::text)::name;
BEGIN
  IF tenant_schema::text !~ '^tenant_[0-9a-f_]{36}$' THEN
    RAISE EXCEPTION 'Invalid tenant schema name: %', tenant_schema
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_namespace
    WHERE nspname = tenant_schema::text
  ) THEN
    RAISE EXCEPTION 'Tenant schema does not exist: %', tenant_schema
      USING ERRCODE = '3F000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type type
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = tenant_schema::text
      AND type.typname = 'approval_workflow_type'
  ) THEN
    EXECUTE format(
      'CREATE TYPE %I.approval_workflow_type AS ENUM (%L, %L, %L)',
      tenant_schema,
      'HIRA',
      'JHA',
      'II'
    );
  END IF;

  EXECUTE format(
    $sql$
      CREATE TABLE IF NOT EXISTS %I.approval_snapshot (
        id uuid PRIMARY KEY,
        workflow_type %I.approval_workflow_type NOT NULL,
        hira_case_id uuid,
        jha_case_id uuid,
        ii_case_id uuid,
        version_label text NOT NULL,
        approved_by uuid NOT NULL,
        approved_at timestamptz NOT NULL,
        schema_version integer NOT NULL DEFAULT 1,
        workflow_data jsonb NOT NULL,
        artifact_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
        attachment_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
        CONSTRAINT approval_snapshot_version_label_check
          CHECK (version_label ~ '^v[0-9]{2,}$'),
        CONSTRAINT approval_snapshot_artifact_refs_array_check
          CHECK (jsonb_typeof(artifact_refs) = 'array'),
        CONSTRAINT approval_snapshot_attachment_refs_array_check
          CHECK (jsonb_typeof(attachment_refs) = 'array'),
        CONSTRAINT approval_snapshot_approved_by_fkey
          FOREIGN KEY (approved_by) REFERENCES shared.users(id)
          ON DELETE RESTRICT ON UPDATE CASCADE
      )
    $sql$,
    tenant_schema,
    tenant_schema
  );

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS approval_snapshot_approved_by_idx ON %I.approval_snapshot(approved_by)',
    tenant_schema
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS approval_snapshot_workflow_type_idx ON %I.approval_snapshot(workflow_type)',
    tenant_schema
  );

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = tenant_role::text
  ) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.approval_snapshot TO %I', tenant_schema, tenant_role);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION "shared"."apply_approval_snapshot_schema_to_all_tenants"()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  tenant_schema name;
BEGIN
  FOR tenant_schema IN
    SELECT nspname::name
    FROM pg_catalog.pg_namespace
    WHERE nspname ~ '^tenant_[0-9a-f_]{36}$'
    ORDER BY nspname
  LOOP
    PERFORM "shared"."apply_approval_snapshot_schema"(tenant_schema);
  END LOOP;
END
$$;

-- 00200_incident_case.sql currently owns the last provision_tenant_schema()
-- override and still calls ensure_vector_extension() after each tenant schema
-- is created. Keep this storage-contract migration compatible with that later
-- override without editing 00200 outside this bead's whitelist.
CREATE OR REPLACE FUNCTION "shared"."ensure_vector_extension"()
RETURNS name
LANGUAGE plpgsql
AS $$
DECLARE
  extension_schema name;
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA "shared";

  SELECT namespace.nspname::name
  FROM pg_catalog.pg_extension extension
  JOIN pg_catalog.pg_namespace namespace
    ON namespace.oid = extension.extnamespace
  WHERE extension.extname = 'vector'
  INTO extension_schema;

  IF extension_schema IS NULL THEN
    RAISE EXCEPTION 'vector extension was not created'
      USING ERRCODE = '55000';
  END IF;

  IF extension_schema <> 'shared'::name THEN
    ALTER EXTENSION vector SET SCHEMA "shared";
    extension_schema := 'shared'::name;
  END IF;

  PERFORM "shared"."apply_approval_snapshot_schema_to_all_tenants"();

  RETURN extension_schema;
END
$$;

CREATE OR REPLACE FUNCTION "shared"."provision_tenant_schema"(
  tenant_id uuid,
  app_login_role name
)
RETURNS TABLE(schema_name name, role_name name)
LANGUAGE plpgsql
AS $$
DECLARE
  tenant_schema name := "shared"."tenant_schema_name"(tenant_id);
  tenant_role name := "shared"."tenant_role_name"(tenant_id);
  has_migration_role boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'migration_role'
  )
  INTO has_migration_role;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = tenant_role::text
  ) THEN
    EXECUTE format(
      'CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION',
      tenant_role
    );
  ELSE
    EXECUTE format(
      'ALTER ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION',
      tenant_role
    );
  END IF;

  PERFORM "shared"."grant_tenant_role_to_current_user"(tenant_role);
  IF app_login_role IS NOT NULL THEN
    PERFORM "shared"."grant_tenant_role_to_app_login"(tenant_role, app_login_role);
  END IF;

  EXECUTE format('CREATE SCHEMA IF NOT EXISTS %I AUTHORIZATION %I', tenant_schema, tenant_role);
  EXECUTE format('ALTER SCHEMA %I OWNER TO %I', tenant_schema, tenant_role);
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', tenant_schema, tenant_role);
  EXECUTE format('GRANT USAGE ON SCHEMA "shared" TO %I', tenant_role);

  IF has_migration_role THEN
    EXECUTE format('GRANT USAGE, CREATE ON SCHEMA %I TO migration_role', tenant_schema);
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE migration_role IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
      tenant_schema,
      tenant_role
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE migration_role IN SCHEMA %I GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO %I',
      tenant_schema,
      tenant_role
    );
  END IF;

  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I',
    tenant_schema,
    tenant_role
  );
  EXECUTE format(
    'ALTER DEFAULT PRIVILEGES IN SCHEMA %I GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO %I',
    tenant_schema,
    tenant_role
  );

  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO %I',
    tenant_schema,
    tenant_role
  );
  EXECUTE format(
    'GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA %I TO %I',
    tenant_schema,
    tenant_role
  );

  IF has_migration_role THEN
    EXECUTE format(
      'REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I FROM migration_role',
      tenant_schema
    );
    EXECUTE format(
      'REVOKE USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA %I FROM migration_role',
      tenant_schema
    );
  END IF;

  PERFORM "shared"."ensure_vector_extension"();
  PERFORM "shared"."apply_approval_snapshot_schema"(tenant_schema);

  schema_name := tenant_schema;
  role_name := tenant_role;
  RETURN NEXT;
END
$$;

GRANT REFERENCES ON TABLE "shared"."users" TO migration_role;

SELECT "shared"."apply_approval_snapshot_schema_to_all_tenants"();

-- Down migration reference for manual rollback in development:
-- 1. DROP TABLE <tenant>.approval_snapshot;
-- 2. DROP TYPE <tenant>.approval_workflow_type;
-- 3. Re-apply db/sql/00020_tenant_provisioning.sql to restore ensure_vector_extension().
-- 4. DROP FUNCTION shared.apply_approval_snapshot_schema_to_all_tenants();
-- 5. DROP FUNCTION shared.apply_approval_snapshot_schema(name);
