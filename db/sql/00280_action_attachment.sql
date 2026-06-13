-- ssfw-sgj: action_item attachments through tenant-scoped storage.
-- The table stores only metadata and the tenant-prefixed storage path; object
-- retention remains owned by the storage layer and snapshot retention policy.

CREATE OR REPLACE FUNCTION "shared"."apply_action_attachment_schema"(tenant_schema name)
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
    RAISE EXCEPTION 'action_item must exist before action_attachment in schema: %', tenant_schema
      USING ERRCODE = '42P01';
  END IF;

  IF has_migration_role THEN
    GRANT REFERENCES ON TABLE "shared"."users" TO migration_role;
    EXECUTE format('GRANT REFERENCES ON TABLE %I.action_item TO migration_role', tenant_schema);
  END IF;

  EXECUTE format(
    $sql$
      CREATE TABLE IF NOT EXISTS %I.action_attachment (
        id uuid PRIMARY KEY,
        action_item_id uuid NOT NULL,
        storage_path text NOT NULL,
        filename text NOT NULL,
        mime_type text NOT NULL,
        uploaded_by_user_id uuid NOT NULL,
        uploaded_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        description text,
        CONSTRAINT action_attachment_action_item_id_fkey
          FOREIGN KEY (action_item_id) REFERENCES %I.action_item(id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT action_attachment_uploaded_by_user_id_fkey
          FOREIGN KEY (uploaded_by_user_id) REFERENCES shared.users(id)
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT action_attachment_storage_path_key UNIQUE (storage_path),
        CONSTRAINT action_attachment_storage_path_not_blank
          CHECK (btrim(storage_path) <> ''),
        CONSTRAINT action_attachment_filename_not_blank
          CHECK (btrim(filename) <> ''),
        CONSTRAINT action_attachment_mime_type_not_blank
          CHECK (btrim(mime_type) <> ''),
        CONSTRAINT action_attachment_description_not_blank
          CHECK (description IS NULL OR btrim(description) <> ''),
        CONSTRAINT action_attachment_storage_path_tenant_check
          CHECK (storage_path LIKE ('tenants/' || %L::uuid::text || '/attachments/%%'))
      )
    $sql$,
    tenant_schema,
    tenant_schema,
    expected_tenant_id::text
  );

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS action_attachment_action_item_id_idx ON %I.action_attachment(action_item_id)',
    tenant_schema
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS action_attachment_uploaded_by_user_id_idx ON %I.action_attachment(uploaded_by_user_id)',
    tenant_schema
  );

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = tenant_role::text
  ) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.action_attachment TO %I', tenant_schema, tenant_role);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION "shared"."apply_action_attachment_schema_to_all_tenants"()
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
    PERFORM "shared"."apply_action_attachment_schema"(tenant_schema);
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
  PERFORM "shared"."apply_action_attachment_schema"(tenant_schema);

  schema_name := tenant_schema;
  role_name := tenant_role;
  RETURN NEXT;
END;
$$;

SELECT "shared"."apply_action_attachment_schema_to_all_tenants"();

-- Down migration reference for manual rollback in development:
-- 1. DROP TABLE <tenant>.action_attachment;
-- 2. Recreate shared.provision_tenant_schema from the previous migration layer.
-- 3. DROP FUNCTION shared.apply_action_attachment_schema_to_all_tenants();
-- 4. DROP FUNCTION shared.apply_action_attachment_schema(name);
