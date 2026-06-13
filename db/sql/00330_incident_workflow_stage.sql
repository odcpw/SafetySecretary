-- Incident workflow lifecycle states: CAPTURE / INVESTIGATING / PAUSED / CLOSED.
-- The accident register needs a capture→investigating→paused/closed lifecycle
-- on top of the legacy per-tab investigation stages (FACTS … APPROVED), which
-- stay valid. We only ADD enum values, so existing rows and the
-- incident_case_analytics view (which reads workflow_stage) are unaffected.
-- Follows the idempotent apply-function pattern of 00320.

CREATE OR REPLACE FUNCTION "shared"."apply_incident_workflow_stage_schema"(tenant_schema name)
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
    FROM pg_catalog.pg_type type
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = tenant_schema::text
      AND type.typname = 'incident_workflow_stage'
  ) THEN
    RAISE EXCEPTION 'incident_workflow_stage type must exist before workflow lifecycle states in schema: %', tenant_schema
      USING ERRCODE = '42704';
  END IF;

  EXECUTE format(
    'ALTER TYPE %I.incident_workflow_stage ADD VALUE IF NOT EXISTS %L',
    tenant_schema,
    'CAPTURE'
  );
  EXECUTE format(
    'ALTER TYPE %I.incident_workflow_stage ADD VALUE IF NOT EXISTS %L',
    tenant_schema,
    'INVESTIGATING'
  );
  EXECUTE format(
    'ALTER TYPE %I.incident_workflow_stage ADD VALUE IF NOT EXISTS %L',
    tenant_schema,
    'PAUSED'
  );
  EXECUTE format(
    'ALTER TYPE %I.incident_workflow_stage ADD VALUE IF NOT EXISTS %L',
    tenant_schema,
    'CLOSED'
  );
END;
$$;

CREATE OR REPLACE FUNCTION "shared"."apply_incident_workflow_stage_schema_to_all_tenants"()
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
    PERFORM "shared"."apply_incident_workflow_stage_schema"(tenant_schema);
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

  schema_name := tenant_schema;
  role_name := tenant_role;
  RETURN NEXT;
END;
$$;

SELECT "shared"."apply_incident_workflow_stage_schema_to_all_tenants"();

-- Down migration reference for manual rollback in development:
-- Postgres cannot DROP individual enum values; to roll back fully you must
-- recreate the incident_workflow_stage type without CAPTURE/INVESTIGATING/
-- PAUSED/CLOSED and re-cast the column. In development the simplest path is
-- pnpm db:reset.
-- 1. DROP FUNCTION shared.apply_incident_workflow_stage_schema_to_all_tenants();
-- 2. DROP FUNCTION shared.apply_incident_workflow_stage_schema(name);
-- 3. Re-apply db/sql/00320_incident_attachment_caption.sql to restore the
--    previous provision_tenant_schema definition.
