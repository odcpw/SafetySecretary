-- Process Mapping v0 core schema for every provisioned tenant schema.
-- The decomposition is the record: process -> subprocess -> activity, with
-- flow annotations attached to nodes.

CREATE OR REPLACE FUNCTION "shared"."apply_process_map_schema"(tenant_schema name)
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

  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'migration_role'
  )
  INTO has_migration_role;

  IF has_migration_role THEN
    GRANT REFERENCES ON TABLE "shared"."users" TO migration_role;
  END IF;

  EXECUTE format(
    $sql$
      CREATE TABLE IF NOT EXISTS %I.process_map (
        id uuid PRIMARY KEY,
        title text NOT NULL,
        scope_note text,
        status text NOT NULL DEFAULT 'DRAFT',
        content_language text NOT NULL DEFAULT 'en',
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at timestamptz,
        CONSTRAINT process_map_created_by_fkey
          FOREIGN KEY (created_by) REFERENCES shared.users(id)
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT process_map_status_check
          CHECK (status IN ('DRAFT', 'APPROVED'))
      )
    $sql$,
    tenant_schema
  );

  EXECUTE format(
    $sql$
      CREATE TABLE IF NOT EXISTS %I.process_node (
        id uuid PRIMARY KEY,
        map_id uuid NOT NULL,
        parent_id uuid,
        kind text NOT NULL DEFAULT 'ACTIVITY',
        order_index integer NOT NULL DEFAULT 0,
        name text NOT NULL,
        description text,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT process_node_map_id_fkey
          FOREIGN KEY (map_id) REFERENCES %I.process_map(id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT process_node_parent_id_fkey
          FOREIGN KEY (parent_id) REFERENCES %I.process_node(id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT process_node_kind_check
          CHECK (kind IN ('PROCESS', 'SUBPROCESS', 'ACTIVITY')),
        CONSTRAINT process_node_not_own_parent_check
          CHECK (parent_id IS NULL OR parent_id <> id)
      )
    $sql$,
    tenant_schema,
    tenant_schema,
    tenant_schema
  );

  EXECUTE format(
    $sql$
      CREATE TABLE IF NOT EXISTS %I.process_flow (
        id uuid PRIMARY KEY,
        map_id uuid NOT NULL,
        node_id uuid NOT NULL,
        direction text NOT NULL,
        flow_type text NOT NULL,
        label text NOT NULL,
        counterparty text,
        order_index integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT process_flow_map_id_fkey
          FOREIGN KEY (map_id) REFERENCES %I.process_map(id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT process_flow_node_id_fkey
          FOREIGN KEY (node_id) REFERENCES %I.process_node(id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT process_flow_direction_check
          CHECK (direction IN ('IN', 'OUT')),
        CONSTRAINT process_flow_flow_type_check
          CHECK (flow_type IN ('MATERIAL', 'INFORMATION', 'MONEY'))
      )
    $sql$,
    tenant_schema,
    tenant_schema,
    tenant_schema
  );

  EXECUTE format('CREATE INDEX IF NOT EXISTS process_node_map_id_idx ON %I.process_node(map_id)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS process_node_parent_id_idx ON %I.process_node(parent_id)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS process_flow_node_id_idx ON %I.process_flow(node_id)', tenant_schema);

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = tenant_role::text
  ) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.process_map TO %I', tenant_schema, tenant_role);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.process_node TO %I', tenant_schema, tenant_role);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.process_flow TO %I', tenant_schema, tenant_role);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION "shared"."apply_process_map_schema_to_all_tenants"()
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
    PERFORM "shared"."apply_process_map_schema"(tenant_schema);
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
  PERFORM "shared"."apply_process_map_schema"(tenant_schema);

  schema_name := tenant_schema;
  role_name := tenant_role;
  RETURN NEXT;
END;
$$;

SELECT "shared"."apply_process_map_schema_to_all_tenants"();

-- Down migration reference for manual rollback in development:
-- 1. DROP TABLE <tenant>.process_flow;
-- 2. DROP TABLE <tenant>.process_node;
-- 3. DROP TABLE <tenant>.process_map;
-- 4. DROP FUNCTION shared.apply_process_map_schema_to_all_tenants();
-- 5. DROP FUNCTION shared.apply_process_map_schema(name);
-- 6. Re-apply db/sql/00450_incident_case_number_unique.sql to restore the
--    previous provision layer.
