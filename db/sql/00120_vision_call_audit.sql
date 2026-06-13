-- ssfw-ito: tenant-local audit record for successful LLM vision calls.
-- The table stores a SHA-256 photo hash only; photo bytes never belong here.

CREATE OR REPLACE FUNCTION "shared"."apply_vision_call_audit_schema"(tenant_schema name)
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

  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'migration_role'
  )
  INTO has_migration_role;

  IF has_migration_role THEN
    EXECUTE 'GRANT REFERENCES ON TABLE "shared"."users" TO migration_role';
  END IF;

  EXECUTE format(
    $sql$
      CREATE TABLE IF NOT EXISTS %I.vision_call_audit (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        workflow_id uuid NOT NULL,
        user_id uuid NOT NULL,
        photo_hash text NOT NULL,
        provider text NOT NULL,
        model text NOT NULL,
        prompt_purpose text NOT NULL,
        called_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        latency_ms integer NOT NULL,
        token_cost_usd numeric(12, 6),
        CONSTRAINT vision_call_audit_latency_ms_check CHECK (latency_ms >= 0),
        CONSTRAINT vision_call_audit_photo_hash_check CHECK (photo_hash ~ '^[0-9a-f]{64}$'),
        CONSTRAINT vision_call_audit_user_id_fkey
          FOREIGN KEY (user_id) REFERENCES shared.users(id)
          ON DELETE RESTRICT ON UPDATE CASCADE
      )
    $sql$,
    tenant_schema
  );

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS vision_call_audit_workflow_id_idx ON %I.vision_call_audit(workflow_id)',
    tenant_schema
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS vision_call_audit_user_id_idx ON %I.vision_call_audit(user_id)',
    tenant_schema
  );

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = tenant_role::text
  ) THEN
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON %I.vision_call_audit TO %I',
      tenant_schema,
      tenant_role
    );
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION "shared"."apply_vision_call_audit_schema_to_all_tenants"()
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
    PERFORM "shared"."apply_vision_call_audit_schema"(tenant_schema);
  END LOOP;
END
$$;

-- Preserve later tenant provisioning overrides by extending the shared hook
-- they already call after creating a tenant schema.
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
  PERFORM "shared"."apply_vision_call_audit_schema_to_all_tenants"();

  RETURN extension_schema;
END
$$;

SELECT "shared"."apply_vision_call_audit_schema_to_all_tenants"();

-- Down migration reference for manual rollback in development:
-- 1. DROP TABLE <tenant>.vision_call_audit;
-- 2. Re-apply db/sql/00110_generated_artifact.sql to restore ensure_vector_extension().
-- 3. DROP FUNCTION shared.apply_vision_call_audit_schema_to_all_tenants();
-- 4. DROP FUNCTION shared.apply_vision_call_audit_schema(name);
