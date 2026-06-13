-- Conversation feedback for the II coach. Stored in the tenant schema next to
-- the coach transcript so each workspace owns its own ratings and comments.

CREATE OR REPLACE FUNCTION "shared"."apply_incident_coach_feedback_schema"(tenant_schema name)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  tenant_role name := ('role_' || tenant_schema::text)::name;
  incident_case_oid oid;
BEGIN
  IF tenant_schema::text !~ '^tenant_[0-9a-f_]{36}$' THEN
    RAISE EXCEPTION 'Invalid tenant schema name: %', tenant_schema
      USING ERRCODE = '22023';
  END IF;

  SELECT class.oid
  FROM pg_catalog.pg_class class
  JOIN pg_catalog.pg_namespace namespace
    ON namespace.oid = class.relnamespace
  WHERE namespace.nspname = tenant_schema::text
    AND class.relname = 'incident_case'
    AND class.relkind = 'r'
  INTO incident_case_oid;

  IF incident_case_oid IS NULL THEN
    RAISE EXCEPTION 'incident_case must exist before incident coach feedback in schema: %', tenant_schema
      USING ERRCODE = '42P01';
  END IF;

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I.incident_coach_feedback (
      id uuid PRIMARY KEY,
      case_id uuid NOT NULL REFERENCES %I.incident_case(id) ON DELETE CASCADE ON UPDATE CASCADE,
      user_id uuid NOT NULL REFERENCES "shared"."users"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
      rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 4),
      comment_text text NULL,
      created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT incident_coach_feedback_case_user_key UNIQUE (case_id, user_id)
    )',
    tenant_schema,
    tenant_schema
  );

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS incident_coach_feedback_case_updated_idx ON %I.incident_coach_feedback(case_id, updated_at DESC)',
    tenant_schema
  );

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS incident_coach_feedback_user_updated_idx ON %I.incident_coach_feedback(user_id, updated_at DESC)',
    tenant_schema
  );

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = tenant_role::text
  ) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.incident_coach_feedback TO %I', tenant_schema, tenant_role);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION "shared"."apply_incident_coach_feedback_schema_to_all_tenants"()
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
    PERFORM "shared"."apply_incident_coach_feedback_schema"(tenant_schema);
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

SELECT "shared"."apply_incident_coach_feedback_schema_to_all_tenants"();

-- Down migration reference for manual rollback in development:
-- 1. DROP TABLE <tenant>.incident_coach_feedback;
-- 2. DROP FUNCTION shared.apply_incident_coach_feedback_schema_to_all_tenants();
-- 3. DROP FUNCTION shared.apply_incident_coach_feedback_schema(name);
-- 4. Re-apply db/sql/00350_incident_at_nullable.sql and then the later
--    incremental tenant apply files to restore the previous provision layer.
