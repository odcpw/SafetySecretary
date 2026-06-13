-- ssfw-f10: generated_artifact storage contract for every provisioned tenant
-- schema. Workflow case-table FKs, the workflow uniqueness constraint, and the
-- final one-of-three CHECK are intentionally deferred to per-workflow snap-FK
-- beads after each workflow table exists.

CREATE OR REPLACE FUNCTION "shared"."apply_generated_artifact_schema"(tenant_schema name)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  tenant_role name := ('role_' || tenant_schema::text)::name;
  has_migration_role boolean;
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
    FROM pg_catalog.pg_class class
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = tenant_schema::text
      AND class.relname = 'approval_snapshot'
      AND class.relkind = 'r'
  ) THEN
    RAISE EXCEPTION 'approval_snapshot must exist before generated_artifact in schema: %', tenant_schema
      USING ERRCODE = '42P01';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'migration_role'
  )
  INTO has_migration_role;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type type
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = tenant_schema::text
      AND type.typname = 'generated_artifact_source'
  ) THEN
    EXECUTE format(
      'CREATE TYPE %I.generated_artifact_source AS ENUM (%L, %L)',
      tenant_schema,
      'GENERATED',
      'HAND_TUNED'
    );
  END IF;

  IF has_migration_role THEN
    EXECUTE format(
      'GRANT REFERENCES ON TABLE %I.approval_snapshot TO migration_role',
      tenant_schema
    );
  END IF;

  EXECUTE format(
    $sql$
      CREATE TABLE IF NOT EXISTS %I.generated_artifact (
        id uuid PRIMARY KEY,
        workflow_type %I.approval_workflow_type NOT NULL,
        hira_case_id uuid,
        jha_case_id uuid,
        ii_case_id uuid,
        output_type text NOT NULL,
        version_seq integer NOT NULL,
        snapshot_id uuid,
        storage_key text NOT NULL,
        filename text,
        mime_type text,
        size_bytes bigint,
        generated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        generated_by uuid NOT NULL,
        source %I.generated_artifact_source NOT NULL,
        is_snapshot_linked boolean NOT NULL DEFAULT false,
        CONSTRAINT generated_artifact_snapshot_id_fkey
          FOREIGN KEY (snapshot_id) REFERENCES %I.approval_snapshot(id)
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT generated_artifact_generated_by_fkey
          FOREIGN KEY (generated_by) REFERENCES shared.users(id)
          ON DELETE RESTRICT ON UPDATE CASCADE
      )
    $sql$,
    tenant_schema,
    tenant_schema,
    tenant_schema,
    tenant_schema
  );

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS generated_artifact_generated_by_idx ON %I.generated_artifact(generated_by)',
    tenant_schema
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS generated_artifact_snapshot_id_idx ON %I.generated_artifact(snapshot_id)',
    tenant_schema
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS generated_artifact_workflow_type_idx ON %I.generated_artifact(workflow_type)',
    tenant_schema
  );

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = tenant_role::text
  ) THEN
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON %I.generated_artifact TO %I',
      tenant_schema,
      tenant_role
    );
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION "shared"."apply_generated_artifact_schema_to_all_tenants"()
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
    PERFORM "shared"."apply_generated_artifact_schema"(tenant_schema);
  END LOOP;
END
$$;

-- 00200_incident_case.sql owns the final provision_tenant_schema() override.
-- It calls ensure_vector_extension() after creating a tenant schema. Preserve
-- ssfw-kxh's hook and extend it so post-00200 tenant provisioning also receives
-- generated_artifact without editing 00200 outside this bead's whitelist.
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
  PERFORM "shared"."apply_generated_artifact_schema_to_all_tenants"();

  RETURN extension_schema;
END
$$;

GRANT REFERENCES ON TABLE "shared"."users" TO migration_role;

SELECT "shared"."apply_generated_artifact_schema_to_all_tenants"();

-- Down migration reference for manual rollback in development:
-- 1. DROP TABLE <tenant>.generated_artifact;
-- 2. DROP TYPE <tenant>.generated_artifact_source;
-- 3. Re-apply db/sql/00100_approval_snapshot.sql to restore ensure_vector_extension().
-- 4. DROP FUNCTION shared.apply_generated_artifact_schema_to_all_tenants();
-- 5. DROP FUNCTION shared.apply_generated_artifact_schema(name);
