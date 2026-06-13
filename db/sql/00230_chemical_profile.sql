-- ssfw-6jor: chemical_profile storage contract for every provisioned tenant schema.
-- The table lives in each tenant schema, while retaining tenant_id as an
-- explicit guard and provenance field for SDS storage references.

CREATE OR REPLACE FUNCTION "shared"."apply_chemical_profile_schema"(tenant_schema name)
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

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_namespace
    WHERE nspname = tenant_schema::text
  ) THEN
    RAISE EXCEPTION 'Tenant schema does not exist: %', tenant_schema
      USING ERRCODE = '3F000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type type
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = tenant_schema::text
      AND type.typname = 'chemical_profile_status'
  ) THEN
    EXECUTE format(
      'CREATE TYPE %I.chemical_profile_status AS ENUM (%L, %L, %L)',
      tenant_schema,
      'draft',
      'active',
      'archived'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_type type
    JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid = type.typnamespace
    WHERE namespace.nspname = tenant_schema::text
      AND type.typname = 'chemical_profile_extraction_status'
  ) THEN
    EXECUTE format(
      'CREATE TYPE %I.chemical_profile_extraction_status AS ENUM (%L, %L, %L, %L, %L)',
      tenant_schema,
      'none',
      'pending',
      'extracted',
      'review_required',
      'approved'
    );
  END IF;

  EXECUTE format(
    $sql$
      CREATE TABLE IF NOT EXISTS %I.chemical_profile (
        id uuid PRIMARY KEY,
        tenant_id uuid NOT NULL,
        product_name text NOT NULL,
        manufacturer text NOT NULL,
        cas_number text,
        un_number text,
        profile_status %I.chemical_profile_status NOT NULL DEFAULT 'draft',
        sds_reviewed boolean NOT NULL DEFAULT false,
        sds_reviewed_by_user_id uuid,
        sds_reviewed_at timestamptz,
        extraction_status %I.chemical_profile_extraction_status NOT NULL DEFAULT 'none',
        storage_path text,
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chemical_profile_tenant_id_fkey
          FOREIGN KEY (tenant_id) REFERENCES shared.tenants(id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT chemical_profile_sds_reviewed_by_user_id_fkey
          FOREIGN KEY (sds_reviewed_by_user_id) REFERENCES shared.users(id)
          ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT chemical_profile_product_name_not_blank
          CHECK (btrim(product_name) <> ''),
        CONSTRAINT chemical_profile_manufacturer_not_blank
          CHECK (btrim(manufacturer) <> ''),
        CONSTRAINT chemical_profile_cas_number_not_blank
          CHECK (cas_number IS NULL OR btrim(cas_number) <> ''),
        CONSTRAINT chemical_profile_un_number_not_blank
          CHECK (un_number IS NULL OR btrim(un_number) <> ''),
        CONSTRAINT chemical_profile_sds_review_pair_check
          CHECK (
            sds_reviewed = false
            OR (sds_reviewed_by_user_id IS NOT NULL AND sds_reviewed_at IS NOT NULL)
          ),
        CONSTRAINT chemical_profile_storage_path_tenant_check
          CHECK (
            storage_path IS NULL
            OR storage_path LIKE ('tenants/' || tenant_id::text || '/%%')
          )
      )
    $sql$,
    tenant_schema,
    tenant_schema,
    tenant_schema
  );

  EXECUTE format('CREATE INDEX IF NOT EXISTS chemical_profile_tenant_id_idx ON %I.chemical_profile(tenant_id)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS chemical_profile_profile_status_idx ON %I.chemical_profile(profile_status)', tenant_schema);
  EXECUTE format('CREATE INDEX IF NOT EXISTS chemical_profile_extraction_status_idx ON %I.chemical_profile(extraction_status)', tenant_schema);

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_roles
    WHERE rolname = tenant_role::text
  ) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I.chemical_profile TO %I', tenant_schema, tenant_role);
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION "shared"."apply_chemical_profile_schema_to_all_tenants"()
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
    PERFORM "shared"."apply_chemical_profile_schema"(tenant_schema);
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

  schema_name := tenant_schema;
  role_name := tenant_role;
  RETURN NEXT;
END
$$;

GRANT REFERENCES ON TABLE "shared"."tenants" TO migration_role;
GRANT REFERENCES ON TABLE "shared"."users" TO migration_role;

SELECT "shared"."apply_chemical_profile_schema_to_all_tenants"();

-- Down migration reference for manual rollback in development:
-- 1. DROP TABLE <tenant>.chemical_profile;
-- 2. DROP TYPE <tenant>.chemical_profile_extraction_status;
-- 3. DROP TYPE <tenant>.chemical_profile_status;
-- 4. Re-apply db/sql/00220_snapshot_artifact_ii_fks.sql to restore the prior provisioning hook.
-- 5. DROP FUNCTION shared.apply_chemical_profile_schema_to_all_tenants();
-- 6. DROP FUNCTION shared.apply_chemical_profile_schema(name);
