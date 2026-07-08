-- Process Mapping v0 edges, resources, and node annotation fields for every
-- provisioned tenant schema.
-- The decomposition remains the record; edges describe the river between
-- nodes, and resources annotate who/what carries work.

CREATE OR REPLACE FUNCTION "shared"."apply_process_map_edges_schema"(tenant_schema name)
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

  EXECUTE format(
    $sql$
      CREATE TABLE IF NOT EXISTS %I.process_edge (
        id uuid PRIMARY KEY,
        map_id uuid NOT NULL,
        from_node_id uuid NOT NULL,
        to_node_id uuid NOT NULL,
        routing_note text,
        order_index integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT process_edge_map_id_fkey
          FOREIGN KEY (map_id) REFERENCES %I.process_map(id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT process_edge_from_node_id_fkey
          FOREIGN KEY (from_node_id) REFERENCES %I.process_node(id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT process_edge_to_node_id_fkey
          FOREIGN KEY (to_node_id) REFERENCES %I.process_node(id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT process_edge_not_self_check
          CHECK (from_node_id <> to_node_id),
        CONSTRAINT process_edge_map_from_to_unique
          UNIQUE (map_id, from_node_id, to_node_id)
      )
    $sql$,
    tenant_schema,
    tenant_schema,
    tenant_schema,
    tenant_schema
  );

  EXECUTE format(
    $sql$
      CREATE TABLE IF NOT EXISTS %I.process_resource (
        id uuid PRIMARY KEY,
        map_id uuid NOT NULL,
        node_id uuid NOT NULL,
        resource_type text NOT NULL,
        label text NOT NULL,
        quantity_note text,
        returnable boolean NOT NULL DEFAULT false,
        order_index integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT process_resource_map_id_fkey
          FOREIGN KEY (map_id) REFERENCES %I.process_map(id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT process_resource_node_id_fkey
          FOREIGN KEY (node_id) REFERENCES %I.process_node(id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT process_resource_type_check
          CHECK (resource_type IN ('ROLE', 'EQUIPMENT', 'MATERIAL_POOL'))
      )
    $sql$,
    tenant_schema,
    tenant_schema,
    tenant_schema
  );

  EXECUTE format(
    'ALTER TABLE %I.process_node ADD COLUMN IF NOT EXISTS source_confidence text NOT NULL DEFAULT ''DIRECT''',
    tenant_schema
  );
  EXECUTE format(
    'ALTER TABLE %I.process_node ADD COLUMN IF NOT EXISTS duration_note text',
    tenant_schema
  );
  EXECUTE format(
    'ALTER TABLE %I.process_node ADD COLUMN IF NOT EXISTS frequency_note text',
    tenant_schema
  );

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint constraint_row
    JOIN pg_catalog.pg_class class ON class.oid = constraint_row.conrelid
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = class.relnamespace
    WHERE namespace.nspname = tenant_schema::text
      AND class.relname = 'process_node'
      AND constraint_row.conname = 'process_node_source_confidence_check'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I.process_node ADD CONSTRAINT process_node_source_confidence_check CHECK (source_confidence IN (''DIRECT'', ''HEARSAY''))',
      tenant_schema
    );
  END IF;

  EXECUTE format('CREATE INDEX IF NOT EXISTS process_edge_map_id_idx ON %I.process_edge(map_id)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS process_edge_from_node_id_idx ON %I.process_edge(from_node_id)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS process_edge_to_node_id_idx ON %I.process_edge(to_node_id)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS process_resource_node_id_idx ON %I.process_resource(node_id)', tenant_schema);

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = tenant_role::text
  ) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.process_edge TO %I', tenant_schema, tenant_role);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.process_resource TO %I', tenant_schema, tenant_role);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION "shared"."apply_process_map_edges_schema_to_all_tenants"()
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
    PERFORM "shared"."apply_process_map_edges_schema"(tenant_schema);
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
  PERFORM "shared"."apply_process_map_edges_schema"(tenant_schema);

  schema_name := tenant_schema;
  role_name := tenant_role;
  RETURN NEXT;
END;
$$;

SELECT "shared"."apply_process_map_edges_schema_to_all_tenants"();

-- Down migration reference for manual rollback in development:
-- 1. DROP TABLE <tenant>.process_resource;
-- 2. DROP TABLE <tenant>.process_edge;
-- 3. ALTER TABLE <tenant>.process_node DROP CONSTRAINT process_node_source_confidence_check;
-- 4. ALTER TABLE <tenant>.process_node DROP COLUMN frequency_note;
-- 5. ALTER TABLE <tenant>.process_node DROP COLUMN duration_note;
-- 6. ALTER TABLE <tenant>.process_node DROP COLUMN source_confidence;
-- 7. DROP FUNCTION shared.apply_process_map_edges_schema_to_all_tenants();
-- 8. DROP FUNCTION shared.apply_process_map_edges_schema(name);
-- 9. Re-apply db/sql/00460_process_map.sql to restore the previous provision
--    layer.
