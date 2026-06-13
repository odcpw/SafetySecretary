-- ssfw-8i7: ActionItem origin contract and immutable provenance fields.
-- This layer extends the core action_item table from ssfw-fh2 with the
-- origin label/timestamp contract and the reserved future origin enum slots.

CREATE OR REPLACE FUNCTION "shared"."enforce_action_origin_immutability"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.origin_type IS DISTINCT FROM NEW.origin_type THEN
    RAISE EXCEPTION 'action_item origin_type is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.origin_id IS DISTINCT FROM NEW.origin_id THEN
    RAISE EXCEPTION 'action_item origin_id is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.origin_created_at IS DISTINCT FROM NEW.origin_created_at THEN
    RAISE EXCEPTION 'action_item origin_created_at is immutable'
      USING ERRCODE = '23514';
  END IF;

  IF OLD.origin_label IS DISTINCT FROM NEW.origin_label
     AND OLD.origin_type <> 'manual' THEN
    RAISE EXCEPTION 'action_item origin_label is immutable except for manual origins'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION "shared"."apply_action_origin_contract_schema"(tenant_schema name)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  tenant_role name := ('role_' || tenant_schema::text)::name;
  action_item_oid oid;
  reserved_origin text;
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
    AND class.relname = 'action_item'
    AND class.relkind = 'r'
  INTO action_item_oid;

  IF action_item_oid IS NULL THEN
    RAISE EXCEPTION 'action_item must exist before action origin contract in schema: %', tenant_schema
      USING ERRCODE = '42P01';
  END IF;

  FOREACH reserved_origin IN ARRAY ARRAY[
    'safety_moment',
    'creative_artifact',
    'campaign',
    'roadmap',
    'safety_day'
  ]
  LOOP
    EXECUTE format(
      'ALTER TYPE %I.action_item_origin_type ADD VALUE IF NOT EXISTS %L',
      tenant_schema,
      reserved_origin
    );
  END LOOP;

  EXECUTE format('ALTER TABLE %I.action_item ADD COLUMN IF NOT EXISTS origin_label text', tenant_schema);
  EXECUTE format('ALTER TABLE %I.action_item ADD COLUMN IF NOT EXISTS origin_created_at timestamptz', tenant_schema);

  EXECUTE format(
    $sql$
      UPDATE %I.action_item
      SET
        origin_label = COALESCE(
          origin_label,
          CASE
            WHEN origin_id IS NULL THEN origin_type::text
            ELSE origin_type::text || ': ' || origin_id::text
          END
        ),
        origin_created_at = COALESCE(origin_created_at, created_at)
      WHERE origin_label IS NULL
         OR origin_created_at IS NULL
    $sql$,
    tenant_schema
  );

  EXECUTE format('ALTER TABLE %I.action_item ALTER COLUMN origin_label SET NOT NULL', tenant_schema);
  EXECUTE format('ALTER TABLE %I.action_item ALTER COLUMN origin_created_at SET NOT NULL', tenant_schema);

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint constraint_row
    WHERE constraint_row.conrelid = action_item_oid
      AND constraint_row.conname = 'action_item_origin_label_not_blank'
  ) THEN
    EXECUTE format(
      'ALTER TABLE %I.action_item ADD CONSTRAINT action_item_origin_label_not_blank CHECK (btrim(origin_label) <> '''')',
      tenant_schema
    );
  END IF;

  EXECUTE format('CREATE INDEX IF NOT EXISTS action_item_origin_created_at_idx ON %I.action_item(origin_created_at)', tenant_schema);

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = action_item_oid
      AND tgname = 'action_item_origin_immutability_trigger'
  ) THEN
    EXECUTE format(
      $sql$
        CREATE TRIGGER action_item_origin_immutability_trigger
        BEFORE UPDATE OF origin_type, origin_id, origin_created_at, origin_label
        ON %I.action_item
        FOR EACH ROW
        EXECUTE FUNCTION shared.enforce_action_origin_immutability()
      $sql$,
      tenant_schema
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = tenant_role::text
  ) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.action_item TO %I', tenant_schema, tenant_role);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION "shared"."apply_action_origin_contract_schema_to_all_tenants"()
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
    PERFORM "shared"."apply_action_origin_contract_schema"(tenant_schema);
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

  schema_name := tenant_schema;
  role_name := tenant_role;
  RETURN NEXT;
END
$$;

SELECT "shared"."apply_action_origin_contract_schema_to_all_tenants"();

-- Down migration reference for manual rollback in development:
-- 1. DROP TRIGGER action_item_origin_immutability_trigger ON <tenant>.action_item;
-- 2. ALTER TABLE <tenant>.action_item DROP CONSTRAINT action_item_origin_label_not_blank;
-- 3. ALTER TABLE <tenant>.action_item DROP COLUMN origin_created_at;
-- 4. ALTER TABLE <tenant>.action_item DROP COLUMN origin_label;
-- 5. Reserved enum values cannot be removed from PostgreSQL enum types safely in place.
