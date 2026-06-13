-- ssfw-gn9: tenant-local LLM cost ledger and per-company monthly cap override.
-- The ledger lives in each tenant schema so tenant isolation follows ADR-0001.

ALTER TABLE "shared"."tenants"
  ADD COLUMN IF NOT EXISTS "monthly_cap_usd" numeric(10, 2) NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'tenants_monthly_cap_usd_check'
      AND conrelid = '"shared"."tenants"'::regclass
  ) THEN
    ALTER TABLE "shared"."tenants"
      ADD CONSTRAINT tenants_monthly_cap_usd_check
        CHECK ("monthly_cap_usd" IS NULL OR "monthly_cap_usd" >= 0);
  END IF;
END
$$;

COMMENT ON COLUMN "shared"."tenants"."monthly_cap_usd" IS
  'Optional hosted-SaaS monthly LLM token-cost cap in USD; NULL uses the v1 default.';

CREATE OR REPLACE FUNCTION "shared"."apply_cost_ledger_schema"(tenant_schema name)
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
      AND type.typname = 'cost_ledger_kind'
  ) THEN
    EXECUTE format(
      'CREATE TYPE %I.cost_ledger_kind AS ENUM (''authoring'', ''generation'')',
      tenant_schema
    );
  END IF;

  EXECUTE format(
    $sql$
      CREATE TABLE IF NOT EXISTS %I.cost_ledger_entry (
        id uuid PRIMARY KEY,
        called_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        kind %I.cost_ledger_kind NOT NULL,
        provider text NOT NULL,
        token_input integer NOT NULL,
        token_output integer NOT NULL,
        cost_usd numeric(10, 5) NOT NULL,
        CONSTRAINT cost_ledger_entry_token_input_check CHECK (token_input >= 0),
        CONSTRAINT cost_ledger_entry_token_output_check CHECK (token_output >= 0),
        CONSTRAINT cost_ledger_entry_cost_usd_check CHECK (cost_usd >= 0)
      )
    $sql$,
    tenant_schema,
    tenant_schema
  );

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS cost_ledger_entry_called_at_idx ON %I.cost_ledger_entry(called_at)',
    tenant_schema
  );

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = tenant_role::text
  ) THEN
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON %I.cost_ledger_entry TO %I',
      tenant_schema,
      tenant_role
    );
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION "shared"."apply_cost_ledger_schema_to_all_tenants"()
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
    PERFORM "shared"."apply_cost_ledger_schema"(tenant_schema);
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION "shared"."ensure_vector_extension"()
RETURNS name
LANGUAGE plpgsql
AS $$
DECLARE
  extension_schema name;
BEGIN
  -- pgvector backs later cross-HIRA similarity work, but II/JHA/HIRA tenant
  -- provisioning must still work in development databases that do not ship the
  -- extension. Embedding tables are intentionally absent before that later bead.
  BEGIN
    CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA "shared";
  EXCEPTION
    WHEN feature_not_supported OR undefined_file OR insufficient_privilege THEN
      RAISE NOTICE 'vector extension is unavailable; continuing without pgvector-backed similarity storage';
      PERFORM "shared"."apply_approval_snapshot_schema_to_all_tenants"();
      PERFORM "shared"."apply_generated_artifact_schema_to_all_tenants"();
      PERFORM "shared"."apply_vision_call_audit_schema_to_all_tenants"();
      PERFORM "shared"."apply_cost_ledger_schema_to_all_tenants"();
      RETURN NULL;
  END;

  SELECT namespace.nspname::name
  FROM pg_catalog.pg_extension extension
  JOIN pg_catalog.pg_namespace namespace
    ON namespace.oid = extension.extnamespace
  WHERE extension.extname = 'vector'
  INTO extension_schema;

  IF extension_schema IS NULL THEN
    RAISE NOTICE 'vector extension was not created; continuing without pgvector-backed similarity storage';
    PERFORM "shared"."apply_approval_snapshot_schema_to_all_tenants"();
    PERFORM "shared"."apply_generated_artifact_schema_to_all_tenants"();
    PERFORM "shared"."apply_vision_call_audit_schema_to_all_tenants"();
    PERFORM "shared"."apply_cost_ledger_schema_to_all_tenants"();
    RETURN NULL;
  END IF;

  IF extension_schema <> 'shared'::name THEN
    ALTER EXTENSION vector SET SCHEMA "shared";
    extension_schema := 'shared'::name;
  END IF;

  PERFORM "shared"."apply_approval_snapshot_schema_to_all_tenants"();
  PERFORM "shared"."apply_generated_artifact_schema_to_all_tenants"();
  PERFORM "shared"."apply_vision_call_audit_schema_to_all_tenants"();
  PERFORM "shared"."apply_cost_ledger_schema_to_all_tenants"();

  RETURN extension_schema;
END
$$;

SELECT "shared"."apply_cost_ledger_schema_to_all_tenants"();

-- Down migration reference for manual rollback in development:
-- 1. DROP TABLE <tenant>.cost_ledger_entry;
-- 2. DROP TYPE <tenant>.cost_ledger_kind;
-- 3. ALTER TABLE shared.tenants DROP COLUMN IF EXISTS monthly_cap_usd;
-- 4. Re-apply db/sql/00120_vision_call_audit.sql to restore ensure_vector_extension().
-- 5. DROP FUNCTION shared.apply_cost_ledger_schema_to_all_tenants();
-- 6. DROP FUNCTION shared.apply_cost_ledger_schema(name);
