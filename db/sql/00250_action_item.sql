-- ssfw-fh2: action_item core schema for every provisioned tenant schema.
-- Action items are tenant-scoped follow-up records shared by II, HIRA, JHA,
-- findings, toolbox talks, meetings, and manual entry.

CREATE OR REPLACE FUNCTION "shared"."apply_action_item_schema"(tenant_schema name)
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

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type type
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = tenant_schema::text
      AND type.typname = 'action_item_status'
  ) THEN
    EXECUTE format(
      'CREATE TYPE %I.action_item_status AS ENUM (%L, %L, %L, %L)',
      tenant_schema,
      'open',
      'in_progress',
      'completed',
      'cancelled'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type type
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = tenant_schema::text
      AND type.typname = 'action_item_origin_type'
  ) THEN
    EXECUTE format(
      'CREATE TYPE %I.action_item_origin_type AS ENUM (%L, %L, %L, %L, %L, %L, %L, %L)',
      tenant_schema,
      'hira',
      'ii',
      'jha',
      'safety_walk',
      'audit_inspection',
      'toolbox_talk',
      'meeting',
      'manual'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type type
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = tenant_schema::text
      AND type.typname = 'action_item_priority'
  ) THEN
    EXECUTE format(
      'CREATE TYPE %I.action_item_priority AS ENUM (%L, %L, %L, %L)',
      tenant_schema,
      'low',
      'medium',
      'high',
      'critical'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type type
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = tenant_schema::text
      AND type.typname = 'action_item_verification_status'
  ) THEN
    EXECUTE format(
      'CREATE TYPE %I.action_item_verification_status AS ENUM (%L, %L, %L, %L)',
      tenant_schema,
      'not_required',
      'needed',
      'verified',
      'needs_follow_up'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type type
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = tenant_schema::text
      AND type.typname = 'action_item_effectiveness_result'
  ) THEN
    EXECUTE format(
      'CREATE TYPE %I.action_item_effectiveness_result AS ENUM (%L, %L, %L)',
      tenant_schema,
      'unknown',
      'effective',
      'needs_follow_up'
    );
  END IF;

  IF has_migration_role THEN
    GRANT REFERENCES ON TABLE "shared"."tenants" TO migration_role;
    GRANT REFERENCES ON TABLE "shared"."users" TO migration_role;
  END IF;

  EXECUTE format(
    $sql$
      CREATE TABLE IF NOT EXISTS %I.action_item (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        title text NOT NULL,
        description text,
        status %I.action_item_status NOT NULL DEFAULT 'open',
        due_date date,
        assignee_user_id uuid,
        owner_text text,
        department_text text,
        origin_type %I.action_item_origin_type NOT NULL,
        origin_id uuid,
        priority %I.action_item_priority NOT NULL DEFAULT 'medium',
        is_safety_critical boolean NOT NULL DEFAULT false,
        verification_status %I.action_item_verification_status NOT NULL DEFAULT 'not_required',
        verification_note text,
        verified_at timestamptz,
        verified_by_user_id uuid,
        effectiveness_result %I.action_item_effectiveness_result NOT NULL DEFAULT 'unknown',
        assigned_at timestamptz,
        escalated_at timestamptz,
        notification_sent_at timestamptz,
        completed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT action_item_tenant_id_fkey
          FOREIGN KEY (tenant_id) REFERENCES shared.tenants(id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT action_item_assignee_user_id_fkey
          FOREIGN KEY (assignee_user_id) REFERENCES shared.users(id)
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT action_item_verified_by_user_id_fkey
          FOREIGN KEY (verified_by_user_id) REFERENCES shared.users(id)
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT action_item_title_not_blank
          CHECK (btrim(title) <> ''),
        CONSTRAINT action_item_description_not_blank
          CHECK (description IS NULL OR btrim(description) <> ''),
        CONSTRAINT action_item_owner_text_not_blank
          CHECK (owner_text IS NULL OR btrim(owner_text) <> ''),
        CONSTRAINT action_item_department_text_not_blank
          CHECK (department_text IS NULL OR btrim(department_text) <> ''),
        CONSTRAINT action_item_verification_note_not_blank
          CHECK (verification_note IS NULL OR btrim(verification_note) <> ''),
        CONSTRAINT action_item_completed_status_timestamp_check
          CHECK (
            (status = 'completed' AND completed_at IS NOT NULL)
            OR (status <> 'completed' AND completed_at IS NULL)
          ),
        CONSTRAINT action_item_verified_pair_check
          CHECK (
            (verification_status = 'verified' AND verified_at IS NOT NULL AND verified_by_user_id IS NOT NULL)
            OR (verification_status <> 'verified' AND verified_at IS NULL AND verified_by_user_id IS NULL)
          ),
        CONSTRAINT action_item_safety_critical_completion_check
          CHECK (
            NOT (is_safety_critical AND status = 'completed')
            OR (
              verification_status = 'verified'
              AND verification_note IS NOT NULL
              AND verified_at IS NOT NULL
              AND verified_by_user_id IS NOT NULL
            )
            OR (
              verification_status = 'not_required'
              AND verification_note IS NOT NULL
            )
          )
      )
    $sql$,
    tenant_schema,
    tenant_schema,
    tenant_schema,
    tenant_schema,
    tenant_schema,
    tenant_schema
  );

  EXECUTE format('CREATE INDEX IF NOT EXISTS action_item_tenant_id_idx ON %I.action_item(tenant_id)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS action_item_status_idx ON %I.action_item(status)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS action_item_due_date_idx ON %I.action_item(due_date)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS action_item_assignee_user_id_idx ON %I.action_item(assignee_user_id)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS action_item_origin_idx ON %I.action_item(origin_type, origin_id)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS action_item_priority_idx ON %I.action_item(priority)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS action_item_verification_status_idx ON %I.action_item(verification_status)', tenant_schema);

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = tenant_role::text
  ) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.action_item TO %I', tenant_schema, tenant_role);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION "shared"."apply_action_item_schema_to_all_tenants"()
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
    PERFORM "shared"."apply_action_item_schema"(tenant_schema);
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

  schema_name := tenant_schema;
  role_name := tenant_role;
  RETURN NEXT;
END
$$;

SELECT "shared"."apply_action_item_schema_to_all_tenants"();

-- Down migration reference for manual rollback in development:
-- 1. DROP TABLE <tenant>.action_item;
-- 2. DROP TYPE <tenant>.action_item_effectiveness_result;
-- 3. DROP TYPE <tenant>.action_item_verification_status;
-- 4. DROP TYPE <tenant>.action_item_priority;
-- 5. DROP TYPE <tenant>.action_item_origin_type;
-- 6. DROP TYPE <tenant>.action_item_status;
-- 7. Re-apply db/sql/00240_chemical_control.sql to restore the prior provisioning hook.
-- 8. DROP FUNCTION shared.apply_action_item_schema_to_all_tenants();
-- 9. DROP FUNCTION shared.apply_action_item_schema(name);
