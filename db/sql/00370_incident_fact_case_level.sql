-- Facts become case-level and person-OPTIONAL. Originally incident_fact linked
-- to the case only through an account -> person, and account_id was NOT NULL —
-- so the coach could only record a "fact" when exactly one person's account
-- existed, which produced an un-acceptable dead-end card (PERSON_ACCOUNT_REQUIRED)
-- on the common single-narrator case. A fact is an established statement about
-- the case; attribution to a person is optional enrichment, not a precondition.
--
-- This migration adds incident_fact.case_id (direct link to the case),
-- backfills it from the existing account -> person -> case chain, makes
-- account_id nullable, and indexes case_id. Idempotent (re-runnable). New
-- tenants get the same shape from the updated incident_fact in 00200. Follows
-- the per-tenant apply-function pattern of 00350/00360.

CREATE OR REPLACE FUNCTION "shared"."apply_incident_fact_case_level_schema"(tenant_schema name)
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
      AND class.relname = 'incident_fact'
      AND class.relkind = 'r'
  ) THEN
    RAISE EXCEPTION 'incident_fact must exist before relaxing it in schema: %', tenant_schema
      USING ERRCODE = '42P01';
  END IF;

  -- 1. Add the direct case link (nullable; code always sets it for new facts).
  EXECUTE format(
    'ALTER TABLE %I.incident_fact ADD COLUMN IF NOT EXISTS case_id uuid',
    tenant_schema
  );

  -- 2. Backfill case_id from the existing account -> person -> case chain.
  EXECUTE format(
    'UPDATE %I.incident_fact f SET case_id = p.case_id
       FROM %I.incident_account a
       JOIN %I.incident_person p ON p.id = a.person_id
      WHERE f.account_id = a.id AND f.case_id IS NULL',
    tenant_schema, tenant_schema, tenant_schema
  );

  -- 3. FK case_id -> incident_case (idempotent add).
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint constraint_record
    JOIN pg_catalog.pg_class class_record
      ON class_record.oid = constraint_record.conrelid
    JOIN pg_catalog.pg_namespace namespace_record
      ON namespace_record.oid = class_record.relnamespace
    WHERE namespace_record.nspname = tenant_schema::text
      AND class_record.relname = 'incident_fact'
      AND constraint_record.conname = 'incident_fact_case_id_fkey'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I.incident_fact ADD CONSTRAINT incident_fact_case_id_fkey FOREIGN KEY (case_id) REFERENCES %I.incident_case(id) ON DELETE CASCADE ON UPDATE CASCADE',
      tenant_schema, tenant_schema
    );
  END IF;

  -- 4. account_id is now optional (attribution, not a precondition).
  EXECUTE format(
    'ALTER TABLE %I.incident_fact ALTER COLUMN account_id DROP NOT NULL',
    tenant_schema
  );

  -- 5. Index the new link.
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS incident_fact_case_id_idx ON %I.incident_fact(case_id)',
    tenant_schema
  );
END;
$$;

CREATE OR REPLACE FUNCTION "shared"."apply_incident_fact_case_level_schema_to_all_tenants"()
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
    PERFORM "shared"."apply_incident_fact_case_level_schema"(tenant_schema);
  END LOOP;
END
$$;

SELECT "shared"."apply_incident_fact_case_level_schema_to_all_tenants"();

-- Down migration reference (development):
-- 1. Delete or re-attribute facts with NULL account_id, then:
--    ALTER TABLE <tenant>.incident_fact ALTER COLUMN account_id SET NOT NULL;
-- 2. ALTER TABLE <tenant>.incident_fact DROP CONSTRAINT incident_fact_case_id_fkey;
--    ALTER TABLE <tenant>.incident_fact DROP COLUMN case_id;
-- 3. DROP the two functions above; revert incident_fact in 00200.
