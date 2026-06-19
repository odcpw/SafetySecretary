-- Incident case numbers are tenant-local administrative identifiers.
--
-- Existing duplicate numbers are repaired before the unique index is created:
-- the oldest row keeps its number, later duplicates get the next free
-- II-YYYY-NNN number for that year.

CREATE OR REPLACE FUNCTION "shared"."apply_incident_case_number_unique_schema"(tenant_schema name)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  duplicate_record record;
  case_year integer;
  next_case_number text;
  next_number integer;
BEGIN
  IF tenant_schema::text !~ '^tenant_[0-9a-f_]{36}$' THEN
    RAISE EXCEPTION 'Invalid tenant schema name: %', tenant_schema
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class class
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = tenant_schema::text
      AND class.relname = 'incident_case'
      AND class.relkind = 'r'
  ) THEN
    RAISE EXCEPTION 'incident_case must exist before case number uniqueness in schema: %', tenant_schema
      USING ERRCODE = '42P01';
  END IF;

  FOR duplicate_record IN EXECUTE format($sql$
    WITH ranked AS (
      SELECT
        id,
        case_number,
        created_at,
        ROW_NUMBER() OVER (
          PARTITION BY case_number
          ORDER BY created_at ASC, id ASC
        ) AS duplicate_rank
      FROM %I.incident_case
      WHERE case_number IS NOT NULL
    )
    SELECT id, case_number, created_at
    FROM ranked
    WHERE duplicate_rank > 1
    ORDER BY case_number ASC, created_at ASC, id ASC
  $sql$, tenant_schema)
  LOOP
    case_year := COALESCE(
      NULLIF(substring(duplicate_record.case_number FROM '^II-([0-9]{4})-[0-9]+$'), '')::integer,
      EXTRACT(YEAR FROM duplicate_record.created_at)::integer
    );

    EXECUTE format(
      'SELECT COALESCE(MAX(substring(case_number FROM %L)::integer), 0) + 1
       FROM %I.incident_case
       WHERE case_number ~ %L',
      '^II-' || case_year::text || '-([0-9]+)$',
      tenant_schema,
      '^II-' || case_year::text || '-[0-9]+$'
    )
    INTO next_number;

    next_case_number := 'II-' || case_year::text || '-' || lpad(next_number::text, 3, '0');

    EXECUTE format(
      'UPDATE %I.incident_case SET case_number = $1 WHERE id = $2',
      tenant_schema
    )
    USING next_case_number, duplicate_record.id;
  END LOOP;

  EXECUTE format(
    'CREATE UNIQUE INDEX IF NOT EXISTS incident_case_case_number_key ON %I.incident_case(case_number) WHERE case_number IS NOT NULL',
    tenant_schema
  );
END
$$;

CREATE OR REPLACE FUNCTION "shared"."apply_incident_case_number_unique_schema_to_all_tenants"()
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
    PERFORM "shared"."apply_incident_case_number_unique_schema"(tenant_schema);
  END LOOP;
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
  PERFORM "shared"."apply_generated_artifact_schema"(tenant_schema);
  PERFORM "shared"."apply_incident_case_schema"(tenant_schema);
  PERFORM "shared"."apply_incident_case_number_unique_schema"(tenant_schema);
  PERFORM "shared"."apply_snapshot_artifact_ii_fks"(tenant_schema);
  PERFORM "shared"."apply_chemical_profile_schema"(tenant_schema);
  PERFORM "shared"."apply_chemical_control_schema"(tenant_schema);
  PERFORM "shared"."apply_action_item_schema"(tenant_schema);
  PERFORM "shared"."apply_action_origin_contract_schema"(tenant_schema);
  PERFORM "shared"."apply_finding_schema"(tenant_schema);
  PERFORM "shared"."apply_action_attachment_schema"(tenant_schema);
  PERFORM "shared"."apply_incident_action_bridge_schema"(tenant_schema);
  PERFORM "shared"."apply_incident_coach_message_schema"(tenant_schema);
  PERFORM "shared"."apply_incident_cause_branch_status_schema"(tenant_schema);
  PERFORM "shared"."apply_incident_attachment_caption_schema"(tenant_schema);
  PERFORM "shared"."apply_incident_workflow_stage_schema"(tenant_schema);
  PERFORM "shared"."apply_incident_soft_delete_schema"(tenant_schema);
  PERFORM "shared"."apply_incident_at_nullable_schema"(tenant_schema);
  PERFORM "shared"."apply_incident_event_type_codes_schema"(tenant_schema);
  PERFORM "shared"."apply_incident_fact_case_level_schema"(tenant_schema);
  PERFORM "shared"."apply_incident_cause_method_schema"(tenant_schema);
  PERFORM "shared"."apply_incident_coach_feedback_schema"(tenant_schema);

  schema_name := tenant_schema;
  role_name := tenant_role;
  RETURN NEXT;
END;
$$;

SELECT "shared"."apply_incident_case_number_unique_schema_to_all_tenants"();

-- Down migration reference for manual rollback in development:
-- 1. DROP INDEX <tenant>.incident_case_case_number_key;
-- 2. DROP FUNCTION shared.apply_incident_case_number_unique_schema_to_all_tenants();
-- 3. DROP FUNCTION shared.apply_incident_case_number_unique_schema(name);
-- 4. Re-apply db/sql/00410_incident_coach_feedback.sql to restore the
--    previous provision layer.
