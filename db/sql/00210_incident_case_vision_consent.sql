-- ssfw-pa6: per-II-case vision consent. Ask-first is the product invariant.

CREATE OR REPLACE FUNCTION "shared"."apply_incident_case_vision_consent_schema"(tenant_schema name)
RETURNS void
LANGUAGE plpgsql
AS $$
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
      AND type.typname = 'incident_vision_consent'
  ) THEN
    EXECUTE format(
      'CREATE TYPE %I.incident_vision_consent AS ENUM (%L, %L, %L)',
      tenant_schema,
      'ASK',
      'ALWAYS',
      'NEVER'
    );
  END IF;

  EXECUTE format(
    'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS vision_consent %I.incident_vision_consent NOT NULL DEFAULT %L',
    tenant_schema,
    tenant_schema,
    'ASK'
  );
  EXECUTE format(
    'ALTER TABLE %I.incident_case ALTER COLUMN vision_consent SET DEFAULT %L',
    tenant_schema,
    'ASK'
  );
  EXECUTE format(
    'UPDATE %I.incident_case SET vision_consent = %L WHERE vision_consent IS NULL',
    tenant_schema,
    'ASK'
  );
  EXECUTE format(
    'ALTER TABLE %I.incident_case ALTER COLUMN vision_consent SET NOT NULL',
    tenant_schema
  );
END
$$;

DO $$
DECLARE
  tenant_schema name;
BEGIN
  FOR tenant_schema IN
    SELECT nspname::name
    FROM pg_catalog.pg_namespace
    WHERE nspname ~ '^tenant_[0-9a-f_]{36}$'
    ORDER BY nspname
  LOOP
    PERFORM "shared"."apply_incident_case_schema"(tenant_schema);
    PERFORM "shared"."apply_incident_case_vision_consent_schema"(tenant_schema);
  END LOOP;
END
$$;

-- Down migration reference for manual rollback in development:
-- 1. ALTER TABLE <tenant>.incident_case DROP COLUMN IF EXISTS vision_consent;
-- 2. DROP TYPE IF EXISTS <tenant>.incident_vision_consent;
-- 3. DROP FUNCTION shared.apply_incident_case_vision_consent_schema(name);
