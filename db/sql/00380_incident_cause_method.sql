-- Per-investigation cause-analysis method. The coach is first-class in three
-- methods and the user picks one per investigation: FIVE_WHYS (the simple
-- method taught to operational managers, the default), URSACHENBAUM (the
-- rigorous SUVA necessary-antecedent tree), and ISHIKAWA (TPM 5M fishbone +
-- 5-Whys). All three write the same cause_node tree; the method only changes
-- the agent's questioning and the default render. Stored on incident_case so
-- the toggle persists and the coach prompt can read it.
--
-- Idempotent (re-runnable); new tenants get the column from the updated
-- incident_case in 00200. Per-tenant apply-function pattern of 00350/00360/00370.

CREATE OR REPLACE FUNCTION "shared"."apply_incident_cause_method_schema"(tenant_schema name)
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
    RAISE EXCEPTION 'incident_case must exist before adding cause_method in schema: %', tenant_schema
      USING ERRCODE = '42P01';
  END IF;

  EXECUTE format(
    'ALTER TABLE %I.incident_case ADD COLUMN IF NOT EXISTS cause_method text NOT NULL DEFAULT ''FIVE_WHYS''',
    tenant_schema
  );
END;
$$;

CREATE OR REPLACE FUNCTION "shared"."apply_incident_cause_method_schema_to_all_tenants"()
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
    PERFORM "shared"."apply_incident_cause_method_schema"(tenant_schema);
  END LOOP;
END
$$;

SELECT "shared"."apply_incident_cause_method_schema_to_all_tenants"();

-- Down (development): ALTER TABLE <tenant>.incident_case DROP COLUMN cause_method;
-- then DROP the two functions above and revert incident_case in 00200.
