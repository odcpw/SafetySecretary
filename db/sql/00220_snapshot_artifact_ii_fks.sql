-- ssfw-8hk: bind approval_snapshot/generated_artifact to II incident_case.
-- This is the first workflow FK layer. HIRA/JHA remain intentionally blocked
-- until their case tables and FK beads exist.

CREATE OR REPLACE FUNCTION "shared"."apply_snapshot_artifact_ii_fks"(tenant_schema name)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  tenant_role name := ('role_' || tenant_schema::text)::name;
  approval_snapshot_oid oid;
  generated_artifact_oid oid;
  incident_case_oid oid;
  has_migration_role boolean;
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
    AND class.relname = 'approval_snapshot'
    AND class.relkind = 'r'
  INTO approval_snapshot_oid;

  IF approval_snapshot_oid IS NULL THEN
    RAISE EXCEPTION 'approval_snapshot must exist before II FKs in schema: %', tenant_schema
      USING ERRCODE = '42P01';
  END IF;

  SELECT class.oid
  FROM pg_catalog.pg_class class
  JOIN pg_catalog.pg_namespace namespace
    ON namespace.oid = class.relnamespace
  WHERE namespace.nspname = tenant_schema::text
    AND class.relname = 'generated_artifact'
    AND class.relkind = 'r'
  INTO generated_artifact_oid;

  IF generated_artifact_oid IS NULL THEN
    RAISE EXCEPTION 'generated_artifact must exist before II FKs in schema: %', tenant_schema
      USING ERRCODE = '42P01';
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
    RAISE EXCEPTION 'incident_case must exist before II FKs in schema: %', tenant_schema
      USING ERRCODE = '42P01';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = 'migration_role'
  )
  INTO has_migration_role;

  IF has_migration_role THEN
    EXECUTE format('GRANT REFERENCES ON TABLE %I.incident_case TO migration_role', tenant_schema);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = approval_snapshot_oid
      AND conname = 'approval_snapshot_ii_case_id_fkey'
  ) THEN
    EXECUTE format(
      $sql$
        ALTER TABLE %I.approval_snapshot
          ADD CONSTRAINT approval_snapshot_ii_case_id_fkey
          FOREIGN KEY (ii_case_id) REFERENCES %I.incident_case(id)
          ON DELETE RESTRICT ON UPDATE CASCADE
      $sql$,
      tenant_schema,
      tenant_schema
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = approval_snapshot_oid
      AND conname = 'approval_snapshot_interim_ii_case_check'
  ) THEN
    EXECUTE format(
      $sql$
        ALTER TABLE %I.approval_snapshot
          ADD CONSTRAINT approval_snapshot_interim_ii_case_check
          CHECK (
            workflow_type = 'II'
            AND ii_case_id IS NOT NULL
            AND hira_case_id IS NULL
            AND jha_case_id IS NULL
          )
      $sql$,
      tenant_schema
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = generated_artifact_oid
      AND conname = 'generated_artifact_ii_case_id_fkey'
  ) THEN
    EXECUTE format(
      $sql$
        ALTER TABLE %I.generated_artifact
          ADD CONSTRAINT generated_artifact_ii_case_id_fkey
          FOREIGN KEY (ii_case_id) REFERENCES %I.incident_case(id)
          ON DELETE RESTRICT ON UPDATE CASCADE
      $sql$,
      tenant_schema,
      tenant_schema
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = generated_artifact_oid
      AND conname = 'generated_artifact_interim_ii_case_check'
  ) THEN
    EXECUTE format(
      $sql$
        ALTER TABLE %I.generated_artifact
          ADD CONSTRAINT generated_artifact_interim_ii_case_check
          CHECK (
            workflow_type = 'II'
            AND ii_case_id IS NOT NULL
            AND hira_case_id IS NULL
            AND jha_case_id IS NULL
          )
      $sql$,
      tenant_schema
    );
  END IF;

  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS approval_snapshot_ii_case_id_idx ON %I.approval_snapshot(ii_case_id)',
    tenant_schema
  );
  EXECUTE format(
    'CREATE INDEX IF NOT EXISTS generated_artifact_ii_case_id_idx ON %I.generated_artifact(ii_case_id)',
    tenant_schema
  );

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = tenant_role::text
  ) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.approval_snapshot TO %I', tenant_schema, tenant_role);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.generated_artifact TO %I', tenant_schema, tenant_role);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION "shared"."apply_snapshot_artifact_ii_fks_to_all_tenants"()
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
    PERFORM "shared"."apply_approval_snapshot_schema"(tenant_schema);
    PERFORM "shared"."apply_generated_artifact_schema"(tenant_schema);
    PERFORM "shared"."apply_incident_case_schema"(tenant_schema);
    PERFORM "shared"."apply_snapshot_artifact_ii_fks"(tenant_schema);
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

  schema_name := tenant_schema;
  role_name := tenant_role;
  RETURN NEXT;
END
$$;

SELECT "shared"."apply_snapshot_artifact_ii_fks_to_all_tenants"();

-- Down migration reference for manual rollback in development:
-- 1. ALTER TABLE <tenant>.generated_artifact DROP CONSTRAINT generated_artifact_interim_ii_case_check;
-- 2. ALTER TABLE <tenant>.generated_artifact DROP CONSTRAINT generated_artifact_ii_case_id_fkey;
-- 3. DROP INDEX <tenant>.generated_artifact_ii_case_id_idx;
-- 4. ALTER TABLE <tenant>.approval_snapshot DROP CONSTRAINT approval_snapshot_interim_ii_case_check;
-- 5. ALTER TABLE <tenant>.approval_snapshot DROP CONSTRAINT approval_snapshot_ii_case_id_fkey;
-- 6. DROP INDEX <tenant>.approval_snapshot_ii_case_id_idx;
-- 7. Re-apply db/sql/00200_incident_case.sql to restore the prior provisioning hook.
-- 8. DROP FUNCTION shared.apply_snapshot_artifact_ii_fks_to_all_tenants();
-- 9. DROP FUNCTION shared.apply_snapshot_artifact_ii_fks(name);
