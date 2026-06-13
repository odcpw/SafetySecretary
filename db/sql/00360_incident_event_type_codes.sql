-- Align incident_case.event_type CHECK with the 14-code EVENT_TYPE_CODES set
-- (src/lib/taxonomy/schema.ts). The accident-mechanism taxonomy was extended
-- (CUT_PUNCTURE, CONTACT_HOT_COLD, ELECTRICITY, HARMFUL_EXPOSURE) in the coach
-- apply path and both incident API routes, but each tenant's CHECK constraint
-- still held the original 10 codes, so the coach could propose a value the
-- record could not persist (the write failed the constraint).
--
-- This is an ADDITIVE change: the 14 codes are a strict superset of the old 10,
-- so no existing row can violate the new constraint. The migration idempotently
-- DROPs and re-ADDs the constraint across every tenant schema, so it is safe to
-- re-run on every `db:migrate`. New tenants are born correct from the updated
-- incident_case_event_type_check in 00200 (apply_incident_case_schema), which
-- provision_tenant_schema already calls. Follows the per-tenant apply-function
-- pattern of 00340/00350.

CREATE OR REPLACE FUNCTION "shared"."apply_incident_event_type_codes_schema"(tenant_schema name)
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
    FROM pg_catalog.pg_class class
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = tenant_schema::text
      AND class.relname = 'incident_case'
      AND class.relkind = 'r'
  ) THEN
    RAISE EXCEPTION 'incident_case must exist before updating event_type constraint in schema: %', tenant_schema
      USING ERRCODE = '42P01';
  END IF;

  EXECUTE format(
    'ALTER TABLE %I.incident_case DROP CONSTRAINT IF EXISTS incident_case_event_type_check',
    tenant_schema
  );
  EXECUTE format(
    'ALTER TABLE %I.incident_case ADD CONSTRAINT incident_case_event_type_check CHECK (event_type IS NULL OR event_type IN (''SLIP_TRIP_FALL'', ''FALL_FROM_HEIGHT'', ''STRUCK_BY'', ''CAUGHT_IN_BETWEEN'', ''CUT_PUNCTURE'', ''MANUAL_HANDLING'', ''CONTACT_HOT_COLD'', ''CONTACT_WITH_CHEMICAL'', ''ELECTRICITY'', ''VEHICLE_TRAFFIC'', ''FIRE_EXPLOSION'', ''HARMFUL_EXPOSURE'', ''PROPERTY_DAMAGE'', ''OTHER''))',
    tenant_schema
  );
END;
$$;

CREATE OR REPLACE FUNCTION "shared"."apply_incident_event_type_codes_schema_to_all_tenants"()
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
    PERFORM "shared"."apply_incident_event_type_codes_schema"(tenant_schema);
  END LOOP;
END
$$;

SELECT "shared"."apply_incident_event_type_codes_schema_to_all_tenants"();

-- Down migration reference for manual rollback in development:
-- 1. For each tenant: ALTER TABLE <tenant>.incident_case DROP CONSTRAINT
--    incident_case_event_type_check; then re-add with the original 10 codes
--    (only safe after deleting/retagging rows using the four new codes).
-- 2. DROP FUNCTION shared.apply_incident_event_type_codes_schema_to_all_tenants();
-- 3. DROP FUNCTION shared.apply_incident_event_type_codes_schema(name);
-- 4. Revert the event_type CHECK in db/sql/00200_incident_case.sql.
