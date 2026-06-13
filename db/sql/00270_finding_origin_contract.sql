-- ssfw-evsi: tenant-scoped operational findings and action origin bridge.
-- Findings capture safety walks, audits, inspections, meetings, and toolbox
-- talks. They may create action_item rows through the ssfw-8i7 origin contract.

CREATE OR REPLACE FUNCTION "shared"."apply_finding_schema"(tenant_schema name)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  tenant_role name := ('role_' || tenant_schema::text)::name;
  expected_tenant_id uuid;
  action_item_oid oid;
  has_migration_role boolean;
BEGIN
  IF tenant_schema::text !~ '^tenant_[0-9a-f_]{36}$' THEN
    RAISE EXCEPTION 'Invalid tenant schema name: %', tenant_schema
      USING ERRCODE = '22023';
  END IF;
  expected_tenant_id := replace(substring(tenant_schema::text from '^tenant_(.*)$'), '_', '-')::uuid;

  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'migration_role'
  )
  INTO has_migration_role;

  SELECT class.oid
  FROM pg_catalog.pg_class class
  JOIN pg_catalog.pg_namespace namespace
    ON namespace.oid = class.relnamespace
  WHERE namespace.nspname = tenant_schema::text
    AND class.relname = 'action_item'
    AND class.relkind = 'r'
  INTO action_item_oid;

  IF action_item_oid IS NULL THEN
    RAISE EXCEPTION 'action_item must exist before finding in schema: %', tenant_schema
      USING ERRCODE = '42P01';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type type
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = tenant_schema::text
      AND type.typname = 'finding_type'
  ) THEN
    EXECUTE format(
      'CREATE TYPE %I.finding_type AS ENUM (%L, %L, %L, %L, %L)',
      tenant_schema,
      'safety_walk',
      'audit',
      'inspection',
      'meeting',
      'toolbox_talk'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type type
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = tenant_schema::text
      AND type.typname = 'finding_intent'
  ) THEN
    EXECUTE format(
      'CREATE TYPE %I.finding_intent AS ENUM (%L, %L, %L)',
      tenant_schema,
      'hazard',
      'good_catch',
      'positive_observation'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type type
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = tenant_schema::text
      AND type.typname = 'finding_severity'
  ) THEN
    EXECUTE format(
      'CREATE TYPE %I.finding_severity AS ENUM (%L, %L, %L, %L)',
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
      AND type.typname = 'finding_status'
  ) THEN
    EXECUTE format(
      'CREATE TYPE %I.finding_status AS ENUM (%L, %L, %L, %L)',
      tenant_schema,
      'open',
      'action_created',
      'resolved',
      'dismissed'
    );
  END IF;

  IF has_migration_role THEN
    GRANT REFERENCES ON TABLE "shared"."tenants" TO migration_role;
    GRANT REFERENCES ON TABLE "shared"."users" TO migration_role;
    EXECUTE format('GRANT REFERENCES ON TABLE %I.action_item TO migration_role', tenant_schema);
  END IF;

  EXECUTE format(
    $sql$
      CREATE TABLE IF NOT EXISTS %I.finding (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL DEFAULT %L::uuid,
        finding_type %I.finding_type NOT NULL,
        intent %I.finding_intent NOT NULL DEFAULT 'hazard',
        title text NOT NULL,
        description text NOT NULL,
        severity %I.finding_severity NOT NULL,
        department_text text,
        location_text text,
        work_as_done_context text,
        reported_by_user_id uuid NOT NULL,
        reported_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        status %I.finding_status NOT NULL DEFAULT 'open',
        photo_storage_path text,
        action_item_id uuid UNIQUE,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT finding_tenant_id_fkey
          FOREIGN KEY (tenant_id) REFERENCES shared.tenants(id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT finding_reported_by_user_id_fkey
          FOREIGN KEY (reported_by_user_id) REFERENCES shared.users(id)
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT finding_action_item_id_fkey
          FOREIGN KEY (action_item_id) REFERENCES %I.action_item(id)
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT finding_tenant_schema_check
          CHECK (tenant_id = %L::uuid),
        CONSTRAINT finding_title_not_blank
          CHECK (btrim(title) <> ''),
        CONSTRAINT finding_description_not_blank
          CHECK (btrim(description) <> ''),
        CONSTRAINT finding_department_text_not_blank
          CHECK (department_text IS NULL OR btrim(department_text) <> ''),
        CONSTRAINT finding_location_text_not_blank
          CHECK (location_text IS NULL OR btrim(location_text) <> ''),
        CONSTRAINT finding_work_as_done_context_not_blank
          CHECK (work_as_done_context IS NULL OR btrim(work_as_done_context) <> ''),
        CONSTRAINT finding_photo_storage_path_not_blank
          CHECK (photo_storage_path IS NULL OR btrim(photo_storage_path) <> ''),
        CONSTRAINT finding_photo_storage_path_tenant_check
          CHECK (
            photo_storage_path IS NULL
            OR photo_storage_path LIKE ('tenants/' || tenant_id::text || '/%%')
          ),
        CONSTRAINT finding_action_created_link_check
          CHECK (status <> 'action_created' OR action_item_id IS NOT NULL)
      )
    $sql$,
    tenant_schema,
    expected_tenant_id::text,
    tenant_schema,
    tenant_schema,
    tenant_schema,
    tenant_schema,
    tenant_schema,
    expected_tenant_id::text
  );

  EXECUTE format(
    'ALTER TABLE %I.finding ALTER COLUMN tenant_id SET DEFAULT %L::uuid',
    tenant_schema,
    expected_tenant_id::text
  );

  EXECUTE format('ALTER TABLE %I.finding DROP CONSTRAINT IF EXISTS finding_action_item_id_fkey', tenant_schema);
  EXECUTE format(
    'ALTER TABLE %I.finding ADD CONSTRAINT finding_action_item_id_fkey FOREIGN KEY (action_item_id) REFERENCES %I.action_item(id) ON DELETE RESTRICT ON UPDATE CASCADE',
    tenant_schema,
    tenant_schema
  );

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint constraint_row
    WHERE constraint_row.conrelid = format('%I.finding', tenant_schema)::regclass
      AND constraint_row.conname = 'finding_tenant_schema_check'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I.finding ADD CONSTRAINT finding_tenant_schema_check CHECK (tenant_id = %L::uuid)',
      tenant_schema,
      expected_tenant_id::text
    );
  END IF;

  EXECUTE format(
    $sql$
      CREATE OR REPLACE FUNCTION %I.finding_write_guard()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog
      AS $fn$
      DECLARE
        linked_action record;
        expected_origin_type %I.action_item_origin_type;
        expected_origin_label text;
        expected_origin_date text;
      BEGIN
        IF NEW.tenant_id <> %L::uuid THEN
          RAISE EXCEPTION 'finding tenant_id must match tenant schema'
            USING ERRCODE = '23514';
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM shared.tenant_memberships membership
          WHERE membership.tenant_id = NEW.tenant_id
            AND membership.user_id = NEW.reported_by_user_id
        ) THEN
          RAISE EXCEPTION 'finding reporter must be a member of the tenant'
            USING ERRCODE = '23503';
        END IF;

        IF NEW.action_item_id IS NULL THEN
          RETURN NEW;
        END IF;

        expected_origin_type := CASE
          WHEN NEW.finding_type IN ('audit', 'inspection')
            THEN 'audit_inspection'::%I.action_item_origin_type
          ELSE NEW.finding_type::text::%I.action_item_origin_type
        END;
        expected_origin_date := to_char(NEW.reported_at AT TIME ZONE 'UTC', 'YYYY-MM-DD');
        expected_origin_label := CASE
          WHEN NEW.finding_type = 'safety_walk'
            THEN 'Safety walk: '
              || COALESCE(NULLIF(btrim(NEW.location_text), ''), NEW.title)
              || ' (' || expected_origin_date || ')'
          WHEN NEW.finding_type IN ('audit', 'inspection')
            THEN 'Audit/inspection: ' || NEW.title || ' (' || expected_origin_date || ')'
          WHEN NEW.finding_type = 'toolbox_talk'
            THEN 'Toolbox talk: ' || NEW.title || ' (' || expected_origin_date || ')'
          ELSE 'Meeting: ' || NEW.title || ' (' || expected_origin_date || ')'
        END;

        SELECT
          action_item.tenant_id,
          action_item.origin_type,
          action_item.origin_id,
          action_item.origin_label,
          action_item.origin_created_at
        INTO linked_action
        FROM %I.action_item
        WHERE action_item.id = NEW.action_item_id;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'finding action_item_id does not exist in tenant action_item table'
            USING ERRCODE = '23503';
        END IF;

        IF linked_action.tenant_id IS DISTINCT FROM NEW.tenant_id
          OR linked_action.origin_type IS DISTINCT FROM expected_origin_type
          OR linked_action.origin_id IS DISTINCT FROM NEW.id
          OR linked_action.origin_label IS DISTINCT FROM expected_origin_label
          OR linked_action.origin_created_at IS DISTINCT FROM NEW.reported_at THEN
          RAISE EXCEPTION 'finding action_item_id must point to an ActionItem created from this finding'
            USING ERRCODE = '23514';
        END IF;

        RETURN NEW;
      END;
      $fn$;
    $sql$,
    tenant_schema,
    tenant_schema,
    expected_tenant_id::text,
    tenant_schema,
    tenant_schema,
    tenant_schema
  );

  EXECUTE format('DROP TRIGGER IF EXISTS finding_write_guard_trigger ON %I.finding', tenant_schema);
  EXECUTE format(
    'CREATE TRIGGER finding_write_guard_trigger BEFORE INSERT OR UPDATE OF tenant_id, finding_type, id, title, location_text, reported_at, reported_by_user_id, action_item_id ON %I.finding FOR EACH ROW EXECUTE FUNCTION %I.finding_write_guard()',
    tenant_schema,
    tenant_schema
  );
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = tenant_role::text
  ) THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.finding_write_guard() TO %I', tenant_schema, tenant_role);
  END IF;

  EXECUTE format('CREATE INDEX IF NOT EXISTS finding_tenant_id_idx ON %I.finding(tenant_id)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS finding_type_idx ON %I.finding(finding_type)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS finding_intent_idx ON %I.finding(intent)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS finding_severity_idx ON %I.finding(severity)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS finding_status_idx ON %I.finding(status)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS finding_reported_by_user_id_idx ON %I.finding(reported_by_user_id)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS finding_reported_at_idx ON %I.finding(reported_at)', tenant_schema);

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = tenant_role::text
  ) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.finding TO %I', tenant_schema, tenant_role);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION "shared"."apply_finding_schema_to_all_tenants"()
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
    PERFORM "shared"."apply_finding_schema"(tenant_schema);
  END LOOP;
END;
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

  schema_name := tenant_schema;
  role_name := tenant_role;
  RETURN NEXT;
END;
$$;

SELECT "shared"."apply_finding_schema_to_all_tenants"();

-- Down migration reference for manual rollback in development:
-- 1. DROP TRIGGER finding_write_guard_trigger ON <tenant>.finding;
-- 2. DROP FUNCTION <tenant>.finding_write_guard();
-- 3. ALTER TABLE <tenant>.finding DROP CONSTRAINT finding_action_item_id_fkey;
-- 4. DROP TABLE <tenant>.finding;
-- 5. DROP TYPE <tenant>.finding_status;
-- 6. DROP TYPE <tenant>.finding_severity;
-- 7. DROP TYPE <tenant>.finding_intent;
-- 8. DROP TYPE <tenant>.finding_type;
-- 9. Recreate shared.provision_tenant_schema from the previous migration layer.
